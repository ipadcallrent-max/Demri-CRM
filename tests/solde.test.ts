import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/demri_test";
const db = new Client({ connectionString: url });

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const EDITEUR = "00000000-0000-0000-0000-00000000000e";
const LECTEUR = "00000000-0000-0000-0000-00000000000f";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

/** Exécute une requête en tant qu'utilisateur connecté (RLS active). */
async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r.rows as T[];
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function solde() {
  const [s] = await as<Record<string, string>>(ADMIN, "select * from vue_solde");
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)]));
}

beforeAll(async () => {
  await db.connect();
  await db.query("drop schema if exists public cascade; create schema public;");
  await db.query("drop schema if exists auth cascade;");
  await db.query(read("tests/auth_stub.sql"));
  for (const f of readdirSync(join(__dirname, "..", "supabase/migrations")).sort()) {
    await db.query(read(`supabase/migrations/${f}`));
  }
  await db.query("grant usage on schema public, auth to authenticated");
  await db.query("grant all on all tables in schema public to authenticated");
  await db.query("grant execute on all functions in schema public, auth to authenticated");
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ($1, 'admin@test.fr', '{"nom":"Admin","role":"admin","societe":"CELAVIV"}'),
     ($2, 'editeur@test.fr', '{"nom":"Éditeur","role":"editeur","societe":"PNC"}'),
     ($3, 'lecteur@test.fr', '{"nom":"Lecteur","role":"lecture","societe":"PNC"}')`,
    [ADMIN, EDITEUR, LECTEUR],
  );
});

beforeEach(async () => {
  await db.query("truncate factures, versements, dossiers, depenses, journal restart identity cascade");
});

afterAll(() => db.end());

describe("calcul du solde", () => {
  it("donne exactement 9 850 € sur le jeu de test du cahier (§4.4)", async () => {
    await as(EDITEUR, "insert into dossiers (client, montant) values ('Dupont', 9700)");
    await as(EDITEUR, "insert into depenses (libelle, categorie, montant, paye_par) values ('Flyers', 'Imprimerie', 400, 'CELAVIV')");
    await as(EDITEUR, "insert into depenses (libelle, categorie, montant, paye_par) values ('Essence', 'Essence', 100, 'PNC')");
    const s = await solde();
    expect(s.a_restes_dus).toBe(9700);
    expect(s.b_part_pnc_depenses_celaviv).toBe(200);
    expect(s.c_part_celaviv_depenses_pnc).toBe(50);
    expect(s.solde).toBe(9850);
  });

  it("une facture marquée payée réduit le reste dû et le solde", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('Martin', 10000) returning id");
    const [f] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F1', 3000) returning id", [d.id]);
    expect((await solde()).solde).toBe(10000);
    await as(EDITEUR, "update factures set payee = true where id = $1", [f.id]);
    expect((await solde()).solde).toBe(7000);
  });

  it("un dossier annulé disparaît des calculs", async () => {
    await as(EDITEUR, "insert into dossiers (client, montant, statut) values ('Annulé', 5000, 'annule')");
    await as(EDITEUR, "insert into dossiers (client, montant) values ('Actif', 1000)");
    expect((await solde()).solde).toBe(1000);
  });

  it("le reste dû n'est jamais négatif", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('Trop payé', 1000) returning id");
    await as(EDITEUR, "insert into factures (dossier_id, numero, montant, payee) values ($1, 'F1', 1500, true)", [d.id]);
    expect((await solde()).a_restes_dus).toBe(0);
  });

  it("un versement libre de GROUPE PNC se déduit, un versement de CELAVIV s'ajoute", async () => {
    await as(EDITEUR, "insert into dossiers (client, montant) values ('Durand', 5000)");
    await as(EDITEUR, "insert into versements (de, montant) values ('PNC', 2000)");
    await as(EDITEUR, "insert into versements (de, montant) values ('CELAVIV', 300)");
    const s = await solde();
    expect(s.d_versements_pnc).toBe(2000);
    expect(s.e_versements_celaviv).toBe(300);
    expect(s.solde).toBe(3300);
  });

  it("un versement groupé qui règle plusieurs factures n'est compté qu'une fois", async () => {
    const [d1] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('A', 4000) returning id");
    const [d2] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('B', 6000) returning id");
    const [f1] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F1', 4000) returning id", [d1.id]);
    const [f2] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F2', 3000) returning id", [d2.id]);
    // GROUPE PNC vire 8 000 € d'un coup : 7 000 € pour F1 + F2, 1 000 € restent libres.
    const [v] = await as<{ id: string }>(EDITEUR, "insert into versements (de, montant) values ('PNC', 8000) returning id");
    await as(EDITEUR, "update factures set payee = true, versement_id = $1 where id = any($2)", [v.id, [f1.id, f2.id]]);
    const s = await solde();
    expect(s.a_restes_dus).toBe(3000); // 0 + (6000 − 3000)
    expect(s.d_versements_pnc).toBe(1000); // seule la part libre
    expect(s.solde).toBe(2000); // 10 000 dus − 8 000 versés
  });

  it("refuse d'affecter plus que le montant du versement", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('C', 5000) returning id");
    const [f] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F1', 5000) returning id", [d.id]);
    const [v] = await as<{ id: string }>(EDITEUR, "insert into versements (de, montant) values ('PNC', 4000) returning id");
    await expect(as(EDITEUR, "update factures set payee = true, versement_id = $1 where id = $2", [v.id, f.id])).rejects.toThrow(/ne couvre pas/);
  });

  it("refuse de régler une facture avec un versement de CELAVIV", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('D', 100) returning id");
    const [f] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F1', 100) returning id", [d.id]);
    const [v] = await as<{ id: string }>(EDITEUR, "insert into versements (de, montant) values ('CELAVIV', 100) returning id");
    await expect(as(EDITEUR, "update factures set payee = true, versement_id = $1 where id = $2", [v.id, f.id])).rejects.toThrow(/GROUPE PNC/);
  });

  it("les dépenses supprimées ne comptent plus", async () => {
    const [x] = await as<{ id: string }>(EDITEUR, "insert into depenses (libelle, montant, paye_par) values ('Stand', 1000, 'CELAVIV') returning id");
    expect((await solde()).solde).toBe(500);
    await as(ADMIN, "update depenses set supprime_le = now() where id = $1", [x.id]);
    expect((await solde()).solde).toBe(0);
  });
});

describe("droits d'accès", () => {
  it("un utilisateur en lecture seule ne peut rien modifier", async () => {
    await expect(as(LECTEUR, "insert into dossiers (client, montant) values ('X', 1)")).rejects.toThrow(/row-level security/);
    await as(EDITEUR, "insert into dossiers (client, montant) values ('Y', 1)");
    const r = await as(LECTEUR, "update dossiers set montant = 2 returning id");
    expect(r).toHaveLength(0);
    expect(await as(LECTEUR, "select * from dossiers")).toHaveLength(1);
  });

  it("seuls les administrateurs peuvent supprimer", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('Z', 1) returning id");
    await expect(as(EDITEUR, "update dossiers set supprime_le = now() where id = $1", [d.id])).rejects.toThrow(/administrateurs/);
    expect(await as(EDITEUR, "delete from dossiers where id = $1 returning id", [d.id])).toHaveLength(0);
    await as(EDITEUR, "update dossiers set statut = 'annule' where id = $1", [d.id]);
    await as(ADMIN, "update dossiers set supprime_le = now() where id = $1", [d.id]);
    expect(await as(ADMIN, "select * from vue_dossiers")).toHaveLength(0);
  });

  it("un compte sans profil ne voit rien", async () => {
    await as(EDITEUR, "insert into dossiers (client, montant) values ('Secret', 1)");
    expect(await as("00000000-0000-0000-0000-000000000999", "select * from dossiers")).toHaveLength(0);
  });
});

describe("journal d'activité", () => {
  it("chaque modification apparaît avec son auteur et n'est pas modifiable", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('Dupont', 9700) returning id");
    const [f] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F-12', 9700) returning id", [d.id]);
    await as(ADMIN, "update factures set payee = true where id = $1", [f.id]);
    const j = await as<{ utilisateur: string; description: string }>(ADMIN, "select utilisateur, description from journal order by id");
    expect(j.map((x) => x.description)).toEqual([
      "a ajouté le dossier Dupont (9 700,00 €)",
      "a ajouté la facture F-12 (9 700,00 €)",
      "a marqué payée la facture F-12 (9 700,00 €)",
    ]);
    expect(j.map((x) => x.utilisateur)).toEqual([EDITEUR, EDITEUR, ADMIN]);
    expect(await as(ADMIN, "update journal set description = 'x' returning id")).toHaveLength(0);
    expect(await as(ADMIN, "delete from journal returning id")).toHaveLength(0);
    await expect(as(ADMIN, "insert into journal (action, table_nom, description) values ('x','x','x')")).rejects.toThrow(/row-level security/);
  });

  it("la suppression d'un dossier entraîne ses factures", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('E', 100) returning id");
    await as(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F1', 100)", [d.id]);
    await as(ADMIN, "update dossiers set supprime_le = now() where id = $1", [d.id]);
    const r = await as<{ supprime_le: string | null }>(ADMIN, "select supprime_le from factures");
    expect(r[0].supprime_le).not.toBeNull();
  });
});

describe("versement groupé et RGPD", () => {
  it("enregistre un versement qui règle plusieurs factures en une fois", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('G', 9000) returning id");
    const [f1] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F1', 2000) returning id", [d.id]);
    const [f2] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F2', 3000) returning id", [d.id]);
    await as(EDITEUR, "select enregistrer_versement(current_date, 'PNC', 5000, 'virement', $1::uuid[])", [[f1.id, f2.id]]);
    const s = await solde();
    expect(s.a_restes_dus).toBe(4000);
    expect(s.d_versements_pnc).toBe(0);
    expect(s.solde).toBe(4000);
    await expect(
      as(EDITEUR, "select enregistrer_versement(current_date, 'PNC', 100, null, $1::uuid[])", [[f1.id]]),
    ).resolves.toBeDefined(); // déjà payée : ignorée, le versement reste libre
    expect((await solde()).solde).toBe(3900);
  });

  it("annule tout si le versement ne couvre pas les factures cochées", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('H', 9000) returning id");
    const [f] = await as<{ id: string }>(EDITEUR, "insert into factures (dossier_id, numero, montant) values ($1, 'F1', 2000) returning id", [d.id]);
    await expect(as(EDITEUR, "select enregistrer_versement(current_date, 'PNC', 1000, null, $1::uuid[])", [[f.id]])).rejects.toThrow(/ne couvre pas/);
    expect(await as(ADMIN, "select * from versements")).toHaveLength(0);
  });

  it("efface un client et retire son nom du journal (admin uniquement)", async () => {
    const [d] = await as<{ id: string }>(EDITEUR, "insert into dossiers (client, montant) values ('Mme Confidentielle', 100) returning id");
    await expect(as(EDITEUR, "select effacer_dossier_rgpd($1)", [d.id])).rejects.toThrow(/administrateurs/);
    await as(ADMIN, "select effacer_dossier_rgpd($1)", [d.id]);
    const j = await as<{ description: string }>(ADMIN, "select description from journal");
    expect(j.some((x) => x.description.includes("Confidentielle"))).toBe(false);
    expect(await as(ADMIN, "select * from dossiers")).toHaveLength(0);
  });
});
