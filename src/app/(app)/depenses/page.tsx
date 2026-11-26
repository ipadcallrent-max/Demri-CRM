"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { DepenseForm } from "@/components/forms";
import { Button, Card, Empty, ErrorMsg, Kpi, Table, Tag, useConfirm, ExportLink } from "@/components/ui";
import { eur, date as fdate, messageErreur, SOCIETE } from "@/lib/format";
import type { Depense } from "@/lib/types";

export default function Depenses() {
  const { depenses, solde, charge, peutEcrire, estAdmin, supabase, recharger, nom } = useData();
  const [form, setForm] = useState<Depense | "new" | null>(null);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  if (!charge) return <Empty>Chargement…</Empty>;
  const s = solde!;

  const parCat = Object.entries(
    depenses.reduce<Record<string, number>>((a, x) => ((a[x.categorie] = (a[x.categorie] ?? 0) + x.montant), a), {}),
  ).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...parCat.map((x) => x[1]));
  const liste = [...depenses].sort((a, b) => b.date.localeCompare(a.date) || b.cree_le.localeCompare(a.cree_le));

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {peutEcrire && (
          <Button variant="primary" onClick={() => setForm("new")}>
            Nouvelle dépense
          </Button>
        )}
        <ExportLink table="depenses">
          Export CSV
        </ExportLink>
      </div>
      <div className="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi label="Total des dépenses" value={eur(s.depenses_total)} />
        <Kpi label="Payé par CELAVIV" value={eur(s.depenses_celaviv)} />
        <Kpi label="Payé par GROUPE PNC" value={eur(s.depenses_pnc)} />
        <Kpi label="Part de chacun (50 %)" value={eur(s.depenses_total / 2)} />
      </div>
      {parCat.length > 0 && (
        <Card title="Par catégorie">
          <ul className="space-y-1.5">
            {parCat.map(([c, m]) => (
              <li key={c} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0">{c}</span>
                <span className="h-2 rounded bg-gold" style={{ width: `${Math.max(3, (m / max) * 55)}%` }} aria-hidden />
                <span className="tabular-nums">{eur(m)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <ErrorMsg>{err}</ErrorMsg>
        {liste.length ? (
          <Table heads={["Date", "Catégorie", "Libellé", "Payé par", "Montant", ""]} nums={[4]}>
            {liste.map((x) => (
              <tr key={x.id}>
                <td className="whitespace-nowrap">{fdate(x.date)}</td>
                <td>
                  <Tag>{x.categorie}</Tag>
                </td>
                <td>
                  {x.libelle}
                  <div className="text-xs text-mut">{nom(x.cree_par)}</div>
                </td>
                <td className="whitespace-nowrap">{SOCIETE[x.paye_par]}</td>
                <td className="n">{eur(x.montant)}</td>
                <td className="n">
                  {peutEcrire && (
                    <span className="inline-flex gap-1.5">
                      <Button small onClick={() => setForm(x)}>
                        Modifier
                      </Button>
                      {estAdmin && (
                        <Button
                          small
                          variant="danger"
                          onClick={() =>
                            confirm.ask(`Supprimer la dépense « ${x.libelle} » ?`, async () => {
                              const { error } = await supabase.from("depenses").update({ supprime_le: new Date().toISOString() }).eq("id", x.id);
                              setErr(error ? messageErreur(error) : "");
                              await recharger();
                            })
                          }
                        >
                          Suppr.
                        </Button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Aucune dépense pour l’instant.</Empty>
        )}
      </Card>
      {form && <DepenseForm open depense={form === "new" ? undefined : form} onClose={() => setForm(null)} />}
      {confirm.node}
    </>
  );
}
