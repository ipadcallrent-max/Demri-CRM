-- Enregistrement d'un versement qui règle plusieurs factures d'un coup (en une
-- seule transaction), et effacement RGPD d'un client.

create or replace function enregistrer_versement(
  p_date date,
  p_de societe,
  p_montant numeric,
  p_note text,
  p_factures uuid[] default '{}'
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into versements (date, de, montant, note)
  values (coalesce(p_date, current_date), p_de, p_montant, nullif(trim(p_note), ''))
  returning id into v_id;
  if coalesce(array_length(p_factures, 1), 0) > 0 then
    if p_de <> 'PNC' then
      raise exception 'Seul un versement de GROUPE PNC peut régler des factures.'
        using errcode = '23514';
    end if;
    update factures
       set payee = true, versement_id = v_id, date_paiement = coalesce(p_date, current_date)
     where id = any (p_factures) and supprime_le is null and not payee;
  end if;
  return v_id;
end $$;

-- Effacement définitif d'un dossier à la demande du client (RGPD) : réservé aux
-- administrateurs. Le nom du client est retiré du journal.
create or replace function effacer_dossier_rgpd(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_admin() then
    raise exception 'Seuls les administrateurs peuvent effacer un client.' using errcode = '42501';
  end if;
  update journal set description = 'données d''un client effacées (RGPD)'
   where ligne_id = p_id
      or ligne_id in (select id from factures where dossier_id = p_id);
  delete from dossiers where id = p_id;
  update journal set description = 'a effacé définitivement un dossier client (RGPD)'
   where ligne_id = p_id and action = 'delete';
end $$;

revoke execute on function effacer_dossier_rgpd(uuid) from public;
grant execute on function effacer_dossier_rgpd(uuid) to authenticated;

-- Factures avec le nom du client, pour l'export CSV.
create or replace view factures_export with (security_invoker = true) as
select f.*, d.client
  from factures f join dossiers d on d.id = f.dossier_id
 where f.supprime_le is null and d.supprime_le is null;
