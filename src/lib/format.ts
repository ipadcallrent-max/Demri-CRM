import type { Societe, Statut } from "./types";

const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export const eur = (n: number | string | null | undefined) => EUR.format(Math.round((Number(n) || 0) * 100) / 100);

/** AAAA-MM-JJ → JJ/MM/AAAA */
export function date(s: string | null | undefined) {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : s;
}

export function dateHeure(s: string) {
  return new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export const today = () => new Date().toISOString().slice(0, 10);

export const SOCIETE: Record<Societe, string> = { CELAVIV: "CELAVIV", PNC: "GROUPE PNC" };

export const STATUTS: [Statut, string][] = [
  ["en_cours", "En cours"],
  ["termine", "Terminé"],
  ["paye", "Payé"],
  ["annule", "Annulé"],
];
export const statut = (s: Statut) => STATUTS.find((x) => x[0] === s)?.[1] ?? s;

export function phraseSolde(solde: number): { texte: string; sens: "pnc" | "cav" | "zero" } {
  const r = Math.round(solde * 100) / 100;
  if (r > 0) return { texte: `GROUPE PNC doit ${eur(r)} à CELAVIV`, sens: "pnc" };
  if (r < 0) return { texte: `CELAVIV doit ${eur(-r)} à GROUPE PNC`, sens: "cav" };
  return { texte: "Comptes à jour", sens: "zero" };
}

/** Message d'erreur lisible à partir d'une erreur Supabase/PostgreSQL. */
export function messageErreur(e: { message?: string; code?: string } | null): string {
  if (!e) return "Erreur inconnue.";
  if (e.code === "42501" && e.message?.includes("row-level")) return "Action refusée : vos droits ne le permettent pas.";
  return e.message ?? "Enregistrement impossible, réessayez.";
}
