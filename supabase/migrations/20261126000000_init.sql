-- Demri CRM : suivi financier CELAVIV × GROUPE PNC
-- Schéma initial : tables, calcul du solde, droits (RLS), journal d'activité.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type societe as enum ('CELAVIV', 'PNC');
create type role_utilisateur as enum ('admin', 'editeur', 'lecture');
create type statut_dossier as enum ('en_cours', 'termine', 'paye', 'annule');
create type categorie_depense as enum
  ('Imprimerie', 'Essence', 'Location', 'Matériel', 'Repas', 'Déplacement', 'Autre');

-- ---------------------------------------------------------------------------
-- Profils (un par compte Supabase Auth)
-- ---------------------------------------------------------------------------
create table profils (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  email text not null,
  role role_utilisateur not null default 'editeur',
  societe societe not null,
  cree_le timestamptz not null default now()
);

-- Rôle de l'utilisateur connecté (null s'il n'a pas de profil : aucun accès).
create or replace function role_actuel() returns role_utilisateur
language sql stable security definer set search_path = public as $$
  select role from profils where id = auth.uid()
$$;

create or replace function peut_lire() returns boolean
language sql stable as $$ select role_actuel() is not null $$;

create or replace function peut_ecrire() returns boolean
language sql stable as $$ select role_actuel() in ('admin', 'editeur') $$;

create or replace function est_admin() returns boolean
language sql stable as $$ select role_actuel() = 'admin' $$;

-- Création automatique du profil quand un admin invite un associé.
create or replace function creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profils (id, nom, email, role, societe)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::role_utilisateur, 'lecture'),
    coalesce((new.raw_user_meta_data ->> 'societe')::societe, 'CELAVIV')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger profil_a_l_invitation
  after insert on auth.users
  for each row execute function creer_profil();

-- ---------------------------------------------------------------------------
-- Données métier
-- ---------------------------------------------------------------------------
create table dossiers (
  id uuid primary key default gen_random_uuid(),
  client text not null check (length(trim(client)) > 0),
  statut statut_dossier not null default 'en_cours',
  montant numeric(12, 2) not null default 0 check (montant >= 0),
  note text,
  cree_par uuid references profils (id) default auth.uid(),
  cree_le timestamptz not null default now(),
  modifie_par uuid references profils (id),
  modifie_le timestamptz,
  supprime_le timestamptz
);

-- Un versement d'une société à l'autre. Un versement de GROUPE PNC peut régler
-- plusieurs factures d'un coup (factures.versement_id).
create table versements (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  de societe not null,
  montant numeric(12, 2) not null check (montant > 0),
  note text,
  cree_par uuid references profils (id) default auth.uid(),
  cree_le timestamptz not null default now(),
  modifie_par uuid references profils (id),
  modifie_le timestamptz,
  supprime_le timestamptz
);

create table factures (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers (id) on delete cascade,
  numero text not null check (length(trim(numero)) > 0),
  montant numeric(12, 2) not null check (montant > 0),
  date date not null default current_date,
  payee boolean not null default false,
  date_paiement date,
  versement_id uuid references versements (id) on delete set null,
  cree_par uuid references profils (id) default auth.uid(),
  cree_le timestamptz not null default now(),
  modifie_par uuid references profils (id),
  modifie_le timestamptz,
  supprime_le timestamptz,
  -- Une facture rattachée à un versement est forcément payée.
  constraint facture_versement_payee check (versement_id is null or payee)
);
create index factures_dossier on factures (dossier_id);
create index factures_versement on factures (versement_id);

create table depenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  categorie categorie_depense not null default 'Autre',
  libelle text not null check (length(trim(libelle)) > 0),
  montant numeric(12, 2) not null check (montant > 0),
  paye_par societe not null,
  cree_par uuid references profils (id) default auth.uid(),
  cree_le timestamptz not null default now(),
  modifie_par uuid references profils (id),
  modifie_le timestamptz,
  supprime_le timestamptz
);

create table journal (
  id bigint generated always as identity primary key,
  le timestamptz not null default now(),
  utilisateur uuid references profils (id) on delete set null,
  action text not null,
  table_nom text not null,
  ligne_id uuid,
  description text not null
);
create index journal_le on journal (le desc);

-- ---------------------------------------------------------------------------
-- Règles d'intégrité
-- ---------------------------------------------------------------------------

-- Signature des modifications + seuls les admins peuvent supprimer (même logiquement).
create or replace function signer_modification() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.cree_par := old.cree_par;
    new.cree_le := old.cree_le;
    new.modifie_par := auth.uid();
    new.modifie_le := now();
    if new.supprime_le is distinct from old.supprime_le and auth.uid() is not null
       and not est_admin() then
      raise exception 'Seuls les administrateurs peuvent supprimer.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger signer before update on dossiers for each row execute function signer_modification();
create trigger signer before update on factures for each row execute function signer_modification();
create trigger signer before update on depenses for each row execute function signer_modification();
create trigger signer before update on versements for each row execute function signer_modification();

-- Une facture ne peut être rattachée qu'à un versement de GROUPE PNC, et le total
-- des factures rattachées ne peut pas dépasser le montant du versement.
create or replace function verifier_affectation() returns trigger
language plpgsql as $$
declare
  v versements%rowtype;
  total numeric(12, 2);
begin
  if new.payee = false then
    new.versement_id := null;
    new.date_paiement := null;
  elsif new.date_paiement is null then
    new.date_paiement := current_date;
  end if;
  if new.versement_id is null or new.supprime_le is not null then
    return new;
  end if;
  select * into v from versements where id = new.versement_id;
  if v.de <> 'PNC' or v.supprime_le is not null then
    raise exception 'Une facture ne peut être réglée que par un versement de GROUPE PNC.'
      using errcode = '23514';
  end if;
  select coalesce(sum(montant), 0) into total
    from factures
   where versement_id = new.versement_id and supprime_le is null and id <> new.id;
  if total + new.montant > v.montant then
    raise exception 'Le versement de % € ne couvre pas ces factures (déjà affecté : % €).',
      v.montant, total using errcode = '23514';
  end if;
  return new;
end $$;

create trigger affectation before insert or update on factures
  for each row execute function verifier_affectation();

-- Un versement ne peut pas descendre sous le total des factures qu'il règle.
create or replace function verifier_versement() returns trigger
language plpgsql as $$
declare total numeric(12, 2);
begin
  select coalesce(sum(montant), 0) into total
    from factures where versement_id = new.id and supprime_le is null;
  if total > 0 and (new.de <> 'PNC' or new.montant < total or new.supprime_le is not null) then
    raise exception 'Ce versement règle déjà % € de factures : détachez-les d''abord.', total
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger controle before update on versements
  for each row execute function verifier_versement();

-- Suppression logique d'un dossier : ses factures suivent.
create or replace function supprimer_factures_du_dossier() returns trigger
language plpgsql as $$
begin
  if new.supprime_le is not null and old.supprime_le is null then
    update factures set supprime_le = new.supprime_le, versement_id = null
     where dossier_id = new.id and supprime_le is null;
  end if;
  return new;
end $$;

create trigger cascade_suppression after update on dossiers
  for each row execute function supprimer_factures_du_dossier();

-- ---------------------------------------------------------------------------
-- Journal d'activité (alimenté uniquement par triggers, non modifiable)
-- ---------------------------------------------------------------------------
create or replace function eur(n numeric) returns text
language sql immutable as $$
  select replace(replace(replace(to_char(n, 'FM999G999G990D00'), ',', ' '), '.', ','), ' ', ' ') || ' €'
$$;

create or replace function nom_societe(s societe) returns text
language sql immutable as $$ select case s when 'PNC' then 'GROUPE PNC' else 'CELAVIV' end $$;

create or replace function journaliser() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  j jsonb;
  quoi text;
  verbe text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  verbe := case tg_op when 'INSERT' then 'a ajouté' when 'DELETE' then 'a supprimé définitivement'
                      else 'a modifié' end;
  if tg_op = 'UPDATE' and new.supprime_le is not null and old.supprime_le is null then
    verbe := 'a supprimé';
  end if;
  j := to_jsonb(r);
  quoi := case tg_table_name
    when 'dossiers' then 'le dossier ' || (j ->> 'client') || ' (' || eur((j ->> 'montant')::numeric) || ')'
    when 'factures' then 'la facture ' || (j ->> 'numero') || ' (' || eur((j ->> 'montant')::numeric) || ')'
    when 'depenses' then 'la dépense ' || (j ->> 'libelle') || ' (' || eur((j ->> 'montant')::numeric) || ')'
    when 'versements' then 'un versement de ' || eur((j ->> 'montant')::numeric) || ' de '
                           || nom_societe((j ->> 'de')::societe)
  end;
  if tg_table_name = 'factures' and tg_op = 'UPDATE' and new.supprime_le is null
     and (to_jsonb(new) ->> 'payee') <> (to_jsonb(old) ->> 'payee') then
    verbe := case when (j ->> 'payee')::boolean then 'a marqué payée' else 'a marqué non payée' end;
  end if;
  if tg_table_name = 'dossiers' and tg_op = 'UPDATE' and new.supprime_le is null
     and (to_jsonb(new) ->> 'statut') <> (to_jsonb(old) ->> 'statut') then
    quoi := quoi || ' : statut ' || (j ->> 'statut');
  end if;
  insert into journal (utilisateur, action, table_nom, ligne_id, description)
  values (auth.uid(), lower(tg_op), tg_table_name, r.id, verbe || ' ' || quoi);
  return null;
end $$;

create trigger journal after insert or update or delete on dossiers for each row execute function journaliser();
create trigger journal after insert or update or delete on factures for each row execute function journaliser();
create trigger journal after insert or update or delete on depenses for each row execute function journaliser();
create trigger journal after insert or update or delete on versements for each row execute function journaliser();

-- ---------------------------------------------------------------------------
-- Calcul du solde : Solde = A + B − C − D + E (cahier des charges §4.3)
-- ---------------------------------------------------------------------------

-- Montants par dossier.
create or replace view vue_dossiers with (security_invoker = true) as
select d.*,
       coalesce(sum(f.montant), 0)::numeric(12, 2) as facture,
       coalesce(sum(f.montant) filter (where f.payee), 0)::numeric(12, 2) as encaisse,
       greatest(0, d.montant - coalesce(sum(f.montant) filter (where f.payee), 0))::numeric(12, 2) as reste_du,
       count(f.id)::int as nb_factures
  from dossiers d
  left join factures f on f.dossier_id = d.id and f.supprime_le is null
 where d.supprime_le is null
 group by d.id;

-- Versements avec la part déjà affectée à des factures. Seule la part libre
-- compte dans D, sinon un même paiement serait déduit deux fois (une fois via la
-- facture payée dans A, une fois comme versement dans D).
create or replace view vue_versements with (security_invoker = true) as
select v.*,
       coalesce(sum(f.montant) filter (where d.statut <> 'annule'), 0)::numeric(12, 2) as affecte,
       (v.montant - coalesce(sum(f.montant) filter (where d.statut <> 'annule'), 0))::numeric(12, 2) as libre,
       count(f.id)::int as nb_factures
  from versements v
  left join factures f on f.versement_id = v.id and f.supprime_le is null
  left join dossiers d on d.id = f.dossier_id and d.supprime_le is null
 where v.supprime_le is null
 group by v.id;

create or replace view vue_solde with (security_invoker = true) as
with
  a as (select coalesce(sum(reste_du), 0) as v from vue_dossiers where statut <> 'annule'),
  dep as (
    select coalesce(sum(montant) filter (where paye_par = 'CELAVIV'), 0) as cav,
           coalesce(sum(montant) filter (where paye_par = 'PNC'), 0) as pnc
      from depenses where supprime_le is null),
  ver as (
    select coalesce(sum(libre) filter (where de = 'PNC'), 0) as pnc,
           coalesce(sum(montant) filter (where de = 'CELAVIV'), 0) as cav
      from vue_versements)
select round(a.v, 2)::numeric(12, 2) as a_restes_dus,
       round(dep.cav / 2, 2)::numeric(12, 2) as b_part_pnc_depenses_celaviv,
       round(dep.pnc / 2, 2)::numeric(12, 2) as c_part_celaviv_depenses_pnc,
       round(ver.pnc, 2)::numeric(12, 2) as d_versements_pnc,
       round(ver.cav, 2)::numeric(12, 2) as e_versements_celaviv,
       round(a.v + dep.cav / 2 - dep.pnc / 2 - ver.pnc + ver.cav, 2)::numeric(12, 2) as solde,
       round(dep.cav + dep.pnc, 2)::numeric(12, 2) as depenses_total,
       round(dep.cav, 2)::numeric(12, 2) as depenses_celaviv,
       round(dep.pnc, 2)::numeric(12, 2) as depenses_pnc
  from a, dep, ver;

-- ---------------------------------------------------------------------------
-- Droits (Row Level Security)
-- ---------------------------------------------------------------------------
alter table profils enable row level security;
alter table dossiers enable row level security;
alter table factures enable row level security;
alter table depenses enable row level security;
alter table versements enable row level security;
alter table journal enable row level security;

create policy lecture on profils for select using (peut_lire());
create policy admin_modifie on profils for update using (est_admin()) with check (est_admin());
create policy admin_supprime on profils for delete using (est_admin());

do $$
declare t text;
begin
  foreach t in array array['dossiers', 'factures', 'depenses', 'versements'] loop
    execute format('create policy lecture on %I for select using (peut_lire())', t);
    execute format('create policy ajout on %I for insert with check (peut_ecrire())', t);
    execute format('create policy modification on %I for update using (peut_ecrire()) with check (peut_ecrire())', t);
    execute format('create policy suppression on %I for delete using (est_admin())', t);
  end loop;
end $$;

-- Journal : lecture pour tous les associés, aucune écriture directe.
create policy lecture on journal for select using (peut_lire());

-- ---------------------------------------------------------------------------
-- Temps réel (Supabase Realtime)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table dossiers, factures, depenses, versements, journal;
  end if;
end $$;
