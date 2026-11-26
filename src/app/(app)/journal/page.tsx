"use client";

import { useData } from "@/components/DataProvider";
import { Card, Empty, Table } from "@/components/ui";
import { dateHeure } from "@/lib/format";

export default function JournalPage() {
  const { journal, charge, nom } = useData();
  if (!charge) return <Empty>Chargement…</Empty>;
  return (
    <Card title="Journal d’activité" action={<span className="text-sm text-mut">200 dernières actions, non modifiable</span>}>
      {journal.length ? (
        <Table heads={["Date et heure", "Qui", "Quoi"]}>
          {journal.map((j) => (
            <tr key={j.id}>
              <td className="whitespace-nowrap">{dateHeure(j.le)}</td>
              <td className="whitespace-nowrap font-semibold">{nom(j.utilisateur)}</td>
              <td>{j.description}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>Aucune activité pour l’instant.</Empty>
      )}
    </Card>
  );
}
