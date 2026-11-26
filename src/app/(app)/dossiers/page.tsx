"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { DossierForm } from "@/components/forms";
import { Button, Card, Empty, Table, Tag, ExportLink } from "@/components/ui";
import { eur, statut, STATUTS } from "@/lib/format";

export default function Dossiers() {
  const { dossiers, charge, peutEcrire } = useData();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const [nouveau, setNouveau] = useState(false);
  if (!charge) return <Empty>Chargement…</Empty>;

  const liste = dossiers
    .filter((d) => (!q || d.client.toLowerCase().includes(q.toLowerCase())) && (!st || d.statut === st))
    .sort((a, b) => b.cree_le.localeCompare(a.cree_le));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="inp w-auto min-w-0 flex-1 sm:max-w-xs" type="search" placeholder="Rechercher un client…" aria-label="Rechercher un client" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inp w-auto" aria-label="Filtrer par statut" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Tous les statuts</option>
          {STATUTS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {peutEcrire && (
          <Button variant="primary" onClick={() => setNouveau(true)}>
            Nouveau dossier
          </Button>
        )}
        <ExportLink table="dossiers">
          Export dossiers (CSV)
        </ExportLink>
        <ExportLink table="factures">
          Export factures (CSV)
        </ExportLink>
      </div>
      <Card>
        {liste.length ? (
          <>
            <Table heads={["Client", "Statut", "À facturer", "Facturé", "Encaissé", "Reste dû"]} nums={[2, 3, 4, 5]}>
              {liste.map((d) => (
                <tr key={d.id} className="clic" onClick={() => router.push(`/dossiers/${d.id}`)}>
                  <td>
                    <Link href={`/dossiers/${d.id}`} className="font-bold">
                      {d.client}
                    </Link>
                  </td>
                  <td>
                    <Tag>{statut(d.statut)}</Tag>
                  </td>
                  <td className="n">{eur(d.montant)}</td>
                  <td className="n">{eur(d.facture)}</td>
                  <td className="n">{eur(d.encaisse)}</td>
                  <td className="n font-bold">{eur(d.statut === "annule" ? 0 : d.reste_du)}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-sm text-mut">Touchez un dossier pour voir ou ajouter ses factures.</p>
          </>
        ) : (
          <Empty>{dossiers.length ? "Aucun dossier ne correspond à la recherche." : "Aucun dossier pour l’instant."}</Empty>
        )}
      </Card>
      {nouveau && <DossierForm open onClose={() => setNouveau(false)} />}
    </>
  );
}
