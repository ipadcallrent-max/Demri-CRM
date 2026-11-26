"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { VersementForm } from "@/components/forms";
import { Big, Button, Card, Empty, ErrorMsg, Table, useConfirm, ExportLink } from "@/components/ui";
import { dateHeure, eur, date as fdate, messageErreur, phraseSolde, SOCIETE } from "@/lib/format";

export default function Solde() {
  const { solde, versements, charge, peutEcrire, estAdmin, supabase, recharger } = useData();
  const [form, setForm] = useState(false);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  if (!charge) return <Empty>Chargement…</Empty>;
  const s = solde!;
  const lignes: [string, string, number, string][] = [
    ["A", "Dossiers : reste dû par GROUPE PNC (à facturer − factures payées)", s.a_restes_dus, ""],
    ["B", "Dépenses payées par CELAVIV : part de GROUPE PNC (50 %)", s.b_part_pnc_depenses_celaviv, "+ "],
    ["C", "Dépenses payées par GROUPE PNC : part de CELAVIV (50 %)", s.c_part_celaviv_depenses_pnc, "− "],
    ["D", "Versements de GROUPE PNC non affectés à une facture", s.d_versements_pnc, "− "],
    ["E", "Versements de CELAVIV à GROUPE PNC", s.e_versements_celaviv, "+ "],
  ];
  const liste = [...versements].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <Big label={`Résultat au ${dateHeure(new Date().toISOString())}`}>{phraseSolde(s.solde).texte}</Big>
      <Card title="Détail du calcul" action={<Button className="no-print" small onClick={() => window.print()}>Imprimer ou PDF</Button>}>
        <Table heads={["", "Poste", "Montant"]} nums={[2]}>
          {lignes.map(([k, l, v, signe]) => (
            <tr key={k}>
              <td className="font-bold">{k}</td>
              <td>{l}</td>
              <td className="n">
                {signe}
                {eur(v)}
              </td>
            </tr>
          ))}
          <tr>
            <td />
            <td className="font-bold">Solde net (A + B − C − D + E)</td>
            <td className={`n font-bold ${s.solde >= 0 ? "text-ok" : "text-bad"}`}>{eur(s.solde)}</td>
          </tr>
        </Table>
        <p className="mt-2 text-sm text-mut">
          Les dépenses sont toujours partagées à 50 %. Elles ne se règlent pas à part : elles s’ajoutent ou se déduisent de ce que GROUPE PNC doit sur les dossiers. Un versement qui règle des factures les marque payées ; seule sa part non affectée apparaît en D.
        </p>
      </Card>
      <Card
        title="Versements entre sociétés"
        action={
          <span className="no-print flex gap-2">
            {peutEcrire && (
              <Button small variant="primary" onClick={() => setForm(true)}>
                Ajouter un versement
              </Button>
            )}
            <ExportLink small table="versements">
              CSV
            </ExportLink>
          </span>
        }
      >
        <ErrorMsg>{err}</ErrorMsg>
        {liste.length ? (
          <Table heads={["Date", "Versé par", "Montant", "Affecté aux factures", "Note", ""]} nums={[2, 3]}>
            {liste.map((v) => (
              <tr key={v.id}>
                <td className="whitespace-nowrap">{fdate(v.date)}</td>
                <td className="whitespace-nowrap">{SOCIETE[v.de]}</td>
                <td className="n">{eur(v.montant)}</td>
                <td className="n">{v.de === "PNC" ? `${eur(v.affecte)} (${v.nb_factures})` : ""}</td>
                <td>{v.note}</td>
                <td className="n">
                  {estAdmin && (
                    <Button
                      small
                      variant="danger"
                      onClick={() =>
                        confirm.ask(
                          `Supprimer ce versement de ${eur(v.montant)} ?${v.nb_factures ? " Les factures qu’il règle repasseront « à encaisser »." : ""}`,
                          async () => {
                            let r = await supabase.from("factures").update({ payee: false }).eq("versement_id", v.id);
                            if (!r.error) r = await supabase.from("versements").update({ supprime_le: new Date().toISOString() }).eq("id", v.id);
                            setErr(r.error ? messageErreur(r.error) : "");
                            await recharger();
                          },
                        )
                      }
                    >
                      Suppr.
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Aucun versement enregistré.</Empty>
        )}
      </Card>
      {form && <VersementForm open onClose={() => setForm(false)} />}
      {confirm.node}
    </>
  );
}
