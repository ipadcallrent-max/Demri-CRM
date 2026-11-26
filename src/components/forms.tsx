"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { ErrorMsg, Field, FormActions, Modal } from "./ui";
import { eur, date as fdate, messageErreur, STATUTS, today } from "@/lib/format";
import { CATEGORIES, type Depense, type Dossier, type Facture, type Societe, type Statut } from "@/lib/types";

type Base = { open: boolean; onClose: () => void };

/** Enveloppe commune : gère l'état « en cours » et les erreurs d'enregistrement. */
function useSave(onClose: () => void) {
  const { recharger } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save(run: () => PromiseLike<{ error: { message?: string; code?: string } | null }>) {
    setBusy(true);
    setErr("");
    const { error } = await run();
    setBusy(false);
    if (error) return setErr(messageErreur(error));
    await recharger();
    onClose();
  }
  return { busy, err, save };
}

const montant = (s: string) => Math.round(Number(s.replace(",", ".")) * 100) / 100;

export function DossierForm({ open, onClose, dossier }: Base & { dossier?: Dossier }) {
  const { supabase } = useData();
  const { busy, err, save } = useSave(onClose);
  const [v, setV] = useState({
    client: dossier?.client ?? "",
    statut: dossier?.statut ?? ("en_cours" as Statut),
    montant: dossier ? String(dossier.montant) : "",
    note: dossier?.note ?? "",
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const row = { client: v.client.trim(), statut: v.statut, montant: montant(v.montant || "0"), note: v.note.trim() || null };
    save(() => (dossier ? supabase.from("dossiers").update(row).eq("id", dossier.id) : supabase.from("dossiers").insert(row)));
  };
  return (
    <Modal open={open} onClose={onClose} title={dossier ? "Modifier le dossier" : "Nouveau dossier"}>
      <form onSubmit={submit}>
        <Field label="Nom du client">
          <input className="inp" required value={v.client} onChange={(e) => setV({ ...v, client: e.target.value })} autoFocus />
        </Field>
        <Field label="Statut">
          <select className="inp" value={v.statut} onChange={(e) => setV({ ...v, statut: e.target.value as Statut })}>
            {STATUTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Montant total à facturer, TTC (€)">
          <input className="inp" inputMode="decimal" type="number" step="0.01" min="0" required value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} />
        </Field>
        <Field label="Note (téléphone, remarque…)">
          <textarea className="inp" rows={3} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
        <ErrorMsg>{err}</ErrorMsg>
        <FormActions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

export function FactureForm({ open, onClose, dossier, facture }: Base & { dossier: Dossier; facture?: Facture }) {
  const { supabase, versements } = useData();
  const { busy, err, save } = useSave(onClose);
  const [v, setV] = useState({
    numero: facture?.numero ?? "",
    montant: facture ? String(facture.montant) : "",
    date: facture?.date ?? today(),
    payee: facture?.payee ?? false,
    versement_id: facture?.versement_id ?? "",
  });
  // Versements de GROUPE PNC qui ont encore de la place pour cette facture.
  const dispo = versements.filter(
    (x) => x.de === "PNC" && (x.id === facture?.versement_id || x.libre >= (montant(v.montant || "0") || 0.01)),
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const row = {
      numero: v.numero.trim(),
      montant: montant(v.montant),
      date: v.date,
      payee: v.payee,
      versement_id: v.payee && v.versement_id ? v.versement_id : null,
    };
    save(() =>
      facture ? supabase.from("factures").update(row).eq("id", facture.id) : supabase.from("factures").insert({ ...row, dossier_id: dossier.id }),
    );
  };
  return (
    <Modal open={open} onClose={onClose} title={facture ? "Modifier la facture" : `Nouvelle facture · ${dossier.client}`}>
      <form onSubmit={submit}>
        <Field label="N° de facture">
          <input className="inp" required value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} autoFocus />
        </Field>
        <Field label="Montant TTC (€)">
          <input className="inp" inputMode="decimal" type="number" step="0.01" min="0.01" required value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} />
        </Field>
        <Field label="Date">
          <input className="inp" type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <label className="mt-4 flex items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={v.payee} onChange={(e) => setV({ ...v, payee: e.target.checked })} />
          Payée par GROUPE PNC
        </label>
        {v.payee && (
          <Field label="Réglée par le versement (facultatif)">
            <select className="inp" value={v.versement_id} onChange={(e) => setV({ ...v, versement_id: e.target.value })}>
              <option value="">Aucun : paiement direct, hors versement enregistré</option>
              {dispo.map((x) => (
                <option key={x.id} value={x.id}>
                  {fdate(x.date)} · {eur(x.montant)} (reste {eur(x.id === facture?.versement_id ? x.libre + (facture?.montant ?? 0) : x.libre)}){x.note ? ` · ${x.note}` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <ErrorMsg>{err}</ErrorMsg>
        <FormActions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

export function DepenseForm({ open, onClose, depense }: Base & { depense?: Depense }) {
  const { supabase } = useData();
  const { busy, err, save } = useSave(onClose);
  const [v, setV] = useState({
    date: depense?.date ?? today(),
    categorie: depense?.categorie ?? "Imprimerie",
    libelle: depense?.libelle ?? "",
    montant: depense ? String(depense.montant) : "",
    paye_par: depense?.paye_par ?? ("CELAVIV" as Societe),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const row = { ...v, libelle: v.libelle.trim(), montant: montant(v.montant) };
    save(() => (depense ? supabase.from("depenses").update(row).eq("id", depense.id) : supabase.from("depenses").insert(row)));
  };
  return (
    <Modal open={open} onClose={onClose} title={depense ? "Modifier la dépense" : "Nouvelle dépense commune (50 / 50)"}>
      <form onSubmit={submit}>
        <Field label="Date">
          <input className="inp" type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <Field label="Catégorie">
          <select className="inp" value={v.categorie} onChange={(e) => setV({ ...v, categorie: e.target.value as Depense["categorie"] })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Libellé (ex. flyers, plein d’essence…)">
          <input className="inp" required value={v.libelle} onChange={(e) => setV({ ...v, libelle: e.target.value })} />
        </Field>
        <Field label="Montant TTC (€)">
          <input className="inp" inputMode="decimal" type="number" step="0.01" min="0.01" required value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} />
        </Field>
        <Field label="Payée par">
          <select className="inp" value={v.paye_par} onChange={(e) => setV({ ...v, paye_par: e.target.value as Societe })}>
            <option value="CELAVIV">CELAVIV</option>
            <option value="PNC">GROUPE PNC</option>
          </select>
        </Field>
        <ErrorMsg>{err}</ErrorMsg>
        <FormActions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

/** Versement entre sociétés. Un versement de GROUPE PNC peut régler plusieurs factures d'un coup. */
export function VersementForm({ open, onClose }: Base) {
  const { supabase, factures, dossiers } = useData();
  const { busy, err, save } = useSave(onClose);
  const [v, setV] = useState({ date: today(), de: "PNC" as Societe, montant: "", note: "" });
  const [coche, setCoche] = useState<string[]>([]);
  const actifs = new Map(dossiers.filter((d) => d.statut !== "annule").map((d) => [d.id, d]));
  const aRegler = factures.filter((f) => !f.payee && actifs.has(f.dossier_id)).sort((a, b) => a.date.localeCompare(b.date));
  const totalCoche = aRegler.filter((f) => coche.includes(f.id)).reduce((s, f) => s + f.montant, 0);
  const m = montant(v.montant || "0");
  const depasse = v.de === "PNC" && totalCoche > m + 0.001;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (depasse) return;
    save(() =>
      supabase.rpc("enregistrer_versement", {
        p_date: v.date,
        p_de: v.de,
        p_montant: m,
        p_note: v.note,
        p_factures: v.de === "PNC" ? coche : [],
      }),
    );
  };
  return (
    <Modal open={open} onClose={onClose} title="Versement entre sociétés">
      <form onSubmit={submit}>
        <Field label="Date">
          <input className="inp" type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <Field label="Versé par">
          <select className="inp" value={v.de} onChange={(e) => setV({ ...v, de: e.target.value as Societe })}>
            <option value="PNC">GROUPE PNC → CELAVIV</option>
            <option value="CELAVIV">CELAVIV → GROUPE PNC</option>
          </select>
        </Field>
        <Field label="Montant (€)">
          <input className="inp" inputMode="decimal" type="number" step="0.01" min="0.01" required value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} />
        </Field>
        <Field label="Note (virement, chèque…)">
          <input className="inp" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
        {v.de === "PNC" && aRegler.length > 0 && (
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Factures réglées par ce versement (facultatif)</legend>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-bd">
              {aRegler.map((f) => (
                <label key={f.id} className="flex items-center gap-3 border-b border-bd px-3 py-2 text-sm last:border-0">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={coche.includes(f.id)}
                    onChange={(e) => setCoche(e.target.checked ? [...coche, f.id] : coche.filter((x) => x !== f.id))}
                  />
                  <span className="min-w-0 flex-1">
                    <b>{actifs.get(f.dossier_id)?.client}</b> · {f.numero} · {fdate(f.date)}
                  </span>
                  <span className="tabular-nums">{eur(f.montant)}</span>
                </label>
              ))}
            </div>
            <p className={`mt-2 text-sm ${depasse ? "font-semibold text-bad" : "text-mut"}`}>
              Factures cochées : {eur(totalCoche)}
              {m > 0 && !depasse && ` · reste non affecté : ${eur(m - totalCoche)}`}
              {depasse && " : c’est plus que le montant du versement."}
            </p>
          </fieldset>
        )}
        <p className="mt-3 text-xs text-mut">
          Les factures cochées passent à « payée ». Seule la part non affectée du versement est déduite à part dans le solde, pour ne rien compter deux fois.
        </p>
        <ErrorMsg>{err}</ErrorMsg>
        <FormActions onCancel={onClose} busy={busy || depasse} />
      </form>
    </Modal>
  );
}

