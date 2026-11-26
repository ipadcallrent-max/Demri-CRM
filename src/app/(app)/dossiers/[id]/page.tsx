"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { DossierForm, FactureForm } from "@/components/forms";
import { Button, Card, Empty, ErrorMsg, Kpi, Tag, useConfirm } from "@/components/ui";
import { dateHeure, eur, date as fdate, messageErreur, statut } from "@/lib/format";
import type { Facture } from "@/lib/types";

export default function FicheDossier() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { dossiers, factures, versements, charge, peutEcrire, estAdmin, supabase, recharger, nom } = useData();
  const [edit, setEdit] = useState(false);
  const [fac, setFac] = useState<Facture | "new" | null>(null);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  if (!charge) return <Empty>Chargement…</Empty>;

  const d = dossiers.find((x) => x.id === id);
  if (!d)
    return (
      <Card>
        <Empty>Ce dossier n’existe pas ou a été supprimé.</Empty>
        <Link href="/dossiers" className="mt-2 inline-block underline">
          Retour aux dossiers
        </Link>
      </Card>
    );

  const fs = factures.filter((f) => f.dossier_id === id).sort((a, b) => b.date.localeCompare(a.date));
  const run = async (p: PromiseLike<{ error: { message?: string; code?: string } | null }>) => {
    setErr("");
    const { error } = await p;
    if (error) setErr(messageErreur(error));
    await recharger();
  };
  const versement = (vid: string | null) => versements.find((v) => v.id === vid);

  return (
    <>
      <Link href="/dossiers" className="no-print text-sm underline">
        ← Dossiers
      </Link>
      <Card className="mt-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">{d.client}</h2>
            <p className="text-sm text-mut">
              <Tag>{statut(d.statut)}</Tag> · créé le {dateHeure(d.cree_le)} par {nom(d.cree_par)}
              {d.modifie_le && ` · modifié le ${dateHeure(d.modifie_le)} par ${nom(d.modifie_par)}`}
            </p>
            {d.note && <p className="mt-2 whitespace-pre-wrap">{d.note}</p>}
          </div>
          {peutEcrire && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEdit(true)}>Modifier</Button>
              {d.statut !== "annule" && (
                <Button onClick={() => confirm.ask(`Annuler le dossier ${d.client} ? Il sortira des calculs.`, () => run(supabase.from("dossiers").update({ statut: "annule" }).eq("id", d.id)))}>
                  Annuler le dossier
                </Button>
              )}
              {estAdmin && (
                <Button
                  variant="danger"
                  onClick={() =>
                    confirm.ask(`Supprimer le dossier ${d.client} et ses factures ?`, async () => {
                      await run(supabase.from("dossiers").update({ supprime_le: new Date().toISOString() }).eq("id", d.id));
                      router.push("/dossiers");
                    })
                  }
                >
                  Supprimer
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Kpi label="À facturer" value={eur(d.montant)} />
          <Kpi label="Facturé" value={eur(d.facture)} />
          <Kpi label="Encaissé" value={eur(d.encaisse)} />
          <Kpi label="Reste dû par GROUPE PNC" value={eur(d.statut === "annule" ? 0 : d.reste_du)} />
        </div>
        {d.encaisse > d.montant && <p className="mt-2 text-sm font-semibold text-bad">Attention : les factures payées dépassent le montant à facturer ({eur(d.encaisse - d.montant)} de trop).</p>}
        <ErrorMsg>{err}</ErrorMsg>
      </Card>

      <Card title="Factures" action={peutEcrire && <Button variant="primary" onClick={() => setFac("new")}>Ajouter une facture</Button>}>
        {fs.length ? (
          <ul className="divide-y divide-bd">
            {fs.map((f) => {
              const v = versement(f.versement_id);
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <b>{f.numero}</b>
                  <span className="text-sm text-mut">{fdate(f.date)}</span>
                  <span className="tabular-nums">{eur(f.montant)}</span>
                  <Tag>{f.payee ? `Payée${f.date_paiement ? ` le ${fdate(f.date_paiement)}` : ""}` : "À encaisser"}</Tag>
                  {v && <span className="text-xs text-mut">via versement du {fdate(v.date)} ({eur(v.montant)})</span>}
                  {peutEcrire && (
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      <Button small onClick={() => run(supabase.from("factures").update({ payee: !f.payee }).eq("id", f.id))}>
                        {f.payee ? "Marquer non payée" : "Marquer payée"}
                      </Button>
                      <Button small onClick={() => setFac(f)}>
                        Modifier
                      </Button>
                      {estAdmin && (
                        <Button small variant="danger" onClick={() => confirm.ask(`Supprimer la facture ${f.numero} ?`, () => run(supabase.from("factures").update({ supprime_le: new Date().toISOString() }).eq("id", f.id)))}>
                          Supprimer
                        </Button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Aucune facture pour ce dossier.</Empty>
        )}
      </Card>

      {estAdmin && (
        <Card title="Données personnelles (RGPD)">
          <p className="mb-3 text-sm text-mut">À la demande du client : efface définitivement le dossier, ses factures et son nom du journal. Irréversible.</p>
          <Button
            variant="danger"
            onClick={() =>
              confirm.ask(`Effacer définitivement toutes les données de ${d.client} ? Cette action est irréversible.`, async () => {
                await run(supabase.rpc("effacer_dossier_rgpd", { p_id: d.id }));
                router.push("/dossiers");
              })
            }
          >
            Effacer ce client
          </Button>
        </Card>
      )}

      {edit && <DossierForm open dossier={d} onClose={() => setEdit(false)} />}
      {fac && <FactureForm open dossier={d} facture={fac === "new" ? undefined : fac} onClose={() => setFac(null)} />}
      {confirm.node}
    </>
  );
}
