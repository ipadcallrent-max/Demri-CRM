"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { DepenseForm, DossierForm } from "@/components/forms";
import { Big, Button, Card, Empty, Kpi, Table } from "@/components/ui";
import { dateHeure, eur, date as fdate, phraseSolde } from "@/lib/format";

export default function Accueil() {
  const { dossiers, depenses, journal, solde, charge, peutEcrire, nom } = useData();
  const router = useRouter();
  const [form, setForm] = useState<"dossier" | "depense" | null>(null);
  if (!charge) return <Empty>Chargement…</Empty>;

  const actifs = dossiers.filter((d) => d.statut !== "annule");
  const enCours = actifs.filter((d) => d.statut === "en_cours");
  const s = solde!;
  const total = (k: "montant" | "encaisse") => actifs.reduce((t, d) => t + d[k], 0);
  const vide = !dossiers.length && !depenses.length;

  return (
    <>
      <Big label="Solde entre les deux sociétés" sub="Dossiers non payés + dépenses partagées − versements. Détail dans « Solde ».">
        {phraseSolde(s.solde).texte}
      </Big>

      {vide && (
        <Card title="Pour commencer">
          <p className="mb-3">Ajoutez votre premier dossier ou une dépense commune : le résumé se remplit tout seul.</p>
          {peutEcrire && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setForm("dossier")}>
                Nouveau dossier
              </Button>
              <Button onClick={() => setForm("depense")}>Nouvelle dépense</Button>
            </div>
          )}
        </Card>
      )}

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Dossiers en cours" value={enCours.length} />
        <Kpi label="Dossiers terminés ou payés" value={actifs.length - enCours.length} />
        <Kpi label="Montant total des dossiers" value={eur(total("montant"))} />
        <Kpi label="Déjà encaissé" value={eur(total("encaisse"))} />
        <Kpi label="Reste dû par GROUPE PNC" value={eur(s.a_restes_dus)} />
        <Kpi label="Dépenses communes" value={eur(s.depenses_total)} />
        <Kpi label="Part de chacun (50 %)" value={eur(s.depenses_total / 2)} />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Card title="Dossiers en cours" action={<Link href="/dossiers" className="text-sm underline">Tous les dossiers</Link>}>
          {enCours.length ? (
            <Table heads={["Client", "Reste dû"]} nums={[1]}>
              {[...enCours]
                .sort((a, b) => b.reste_du - a.reste_du)
                .slice(0, 8)
                .map((d) => (
                  <tr key={d.id} className="clic" onClick={() => router.push(`/dossiers/${d.id}`)}>
                    <td>
                      <Link href={`/dossiers/${d.id}`}>{d.client}</Link>
                    </td>
                    <td className="n">{eur(d.reste_du)}</td>
                  </tr>
                ))}
            </Table>
          ) : (
            <Empty>Aucun dossier en cours.</Empty>
          )}
        </Card>
        <Card title="Dernières dépenses" action={<Link href="/depenses" className="text-sm underline">Toutes les dépenses</Link>}>
          {depenses.length ? (
            <Table heads={["Date", "Libellé", "Montant"]} nums={[2]}>
              {[...depenses]
                .sort((a, b) => b.date.localeCompare(a.date) || b.cree_le.localeCompare(a.cree_le))
                .slice(0, 5)
                .map((x) => (
                  <tr key={x.id}>
                    <td>{fdate(x.date)}</td>
                    <td>{x.libelle}</td>
                    <td className="n">{eur(x.montant)}</td>
                  </tr>
                ))}
            </Table>
          ) : (
            <Empty>Aucune dépense pour l’instant.</Empty>
          )}
        </Card>
      </div>

      <Card title="Activité récente" action={<Link href="/journal" className="text-sm underline">Tout le journal</Link>}>
        {journal.length ? (
          <ul className="space-y-1 text-sm">
            {journal.slice(0, 10).map((j) => (
              <li key={j.id}>
                <span className="text-mut">{dateHeure(j.le)} · </span>
                <b>{nom(j.utilisateur)}</b> {j.description}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune activité pour l’instant.</Empty>
        )}
      </Card>

      {form === "dossier" && <DossierForm open onClose={() => setForm(null)} />}
      {form === "depense" && <DepenseForm open onClose={() => setForm(null)} />}
    </>
  );
}
