import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Export CSV (séparateur « ; » et BOM pour une ouverture directe dans Excel).
// Les droits de lecture sont vérifiés par la base (RLS) avec la session de l'utilisateur.
const EXPORTS: Record<string, { source: string; colonnes: [string, string][]; tri: string }> = {
  dossiers: {
    source: "vue_dossiers",
    tri: "cree_le",
    colonnes: [["client", "Client"], ["statut", "Statut"], ["montant", "À facturer"], ["facture", "Facturé"], ["encaisse", "Encaissé"], ["reste_du", "Reste dû"], ["note", "Note"], ["cree_le", "Créé le"]],
  },
  factures: {
    source: "factures_export",
    tri: "date",
    colonnes: [["client", "Client"], ["numero", "N°"], ["date", "Date"], ["montant", "Montant"], ["payee", "Payée"], ["date_paiement", "Date de paiement"]],
  },
  depenses: {
    source: "depenses",
    tri: "date",
    colonnes: [["date", "Date"], ["categorie", "Catégorie"], ["libelle", "Libellé"], ["montant", "Montant"], ["paye_par", "Payé par"]],
  },
  versements: {
    source: "vue_versements",
    tri: "date",
    colonnes: [["date", "Date"], ["de", "Versé par"], ["montant", "Montant"], ["affecte", "Affecté aux factures"], ["note", "Note"]],
  },
};

const LIBELLES: Record<string, string> = { PNC: "GROUPE PNC", en_cours: "En cours", termine: "Terminé", paye: "Payé", annule: "Annulé" };

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "oui" : "non";
  let s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) s = Number(s).toFixed(2).replace(".", ",");
  else if (/^\d{4}-\d{2}-\d{2}/.test(s)) s = s.slice(0, 10).split("-").reverse().join("/");
  s = LIBELLES[s] ?? s;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(_: Request, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const e = EXPORTS[table];
  if (!e) return NextResponse.json({ error: "Export inconnu" }, { status: 404 });
  const supabase = await createClient();
  let q = supabase.from(e.source).select("*");
  if (e.source === "depenses") q = q.is("supprime_le", null);
  const { data, error } = await q.order(e.tri);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const lignes = [e.colonnes.map((c) => c[1]).join(";"), ...(data ?? []).map((r) => e.colonnes.map(([k]) => cell((r as Record<string, unknown>)[k])).join(";"))];
  return new NextResponse("﻿" + lignes.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
