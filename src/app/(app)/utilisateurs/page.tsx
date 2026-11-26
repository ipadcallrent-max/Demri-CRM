"use client";

import { useActionState, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Button, Card, Empty, ErrorMsg, Field, Table, useConfirm } from "@/components/ui";
import { messageErreur, SOCIETE } from "@/lib/format";
import type { Role } from "@/lib/types";
import { inviter, retirer } from "./actions";

const ROLES: [Role, string][] = [
  ["admin", "Administrateur"],
  ["editeur", "Éditeur"],
  ["lecture", "Lecture seule"],
];

export default function Utilisateurs() {
  const { profils, estAdmin, moi, supabase, recharger } = useData();
  const [etat, action, envoi] = useActionState(inviter, null);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  if (!estAdmin) return <Empty>Réservé aux administrateurs.</Empty>;

  return (
    <>
      <Card title="Associés">
        <ErrorMsg>{err}</ErrorMsg>
        <Table heads={["Nom", "E-mail", "Société", "Rôle", ""]}>
          {profils.map((p) => (
            <tr key={p.id}>
              <td className="font-semibold">{p.nom}</td>
              <td>{p.email}</td>
              <td className="whitespace-nowrap">{SOCIETE[p.societe]}</td>
              <td>
                <select
                  className="inp min-h-9 w-auto py-1"
                  aria-label={`Rôle de ${p.nom}`}
                  value={p.role}
                  disabled={p.id === moi.id}
                  onChange={async (e) => {
                    const { error } = await supabase.from("profils").update({ role: e.target.value }).eq("id", p.id);
                    setErr(error ? messageErreur(error) : "");
                    await recharger();
                  }}
                >
                  {ROLES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td className="n">
                {p.id !== moi.id && (
                  <Button
                    small
                    variant="danger"
                    onClick={() =>
                      confirm.ask(`Retirer l’accès de ${p.nom} ? Ses saisies restent dans l’historique.`, async () => {
                        const r = await retirer(p.id);
                        setErr(r.ok ? "" : r.message);
                        await recharger();
                      })
                    }
                  >
                    Retirer
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Inviter un associé">
        <form action={action} className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Nom">
            <input className="inp" name="nom" required />
          </Field>
          <Field label="E-mail">
            <input className="inp" name="email" type="email" required />
          </Field>
          <Field label="Société">
            <select className="inp" name="societe">
              <option value="CELAVIV">CELAVIV</option>
              <option value="PNC">GROUPE PNC</option>
            </select>
          </Field>
          <Field label="Rôle">
            <select className="inp" name="role" defaultValue="editeur">
              {ROLES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-4 sm:col-span-2">
            <button className="btn btn-p" disabled={envoi}>
              {envoi ? "Envoi…" : "Envoyer l’invitation"}
            </button>
            {etat && <p className={`mt-2 text-sm font-semibold ${etat.ok ? "text-ok" : "text-bad"}`}>{etat.message}</p>}
          </div>
        </form>
      </Card>
      {confirm.node}
    </>
  );
}
