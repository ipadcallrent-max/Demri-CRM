"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useData } from "./DataProvider";
import { SOCIETE } from "@/lib/format";

const ROLE = { admin: "Administrateur", editeur: "Éditeur", lecture: "Lecture seule" } as const;

export function Nav() {
  const path = usePathname();
  const { moi, estAdmin, peutEcrire } = useData();
  const liens: [string, string][] = [
    ["/", "Accueil"],
    ["/dossiers", "Dossiers"],
    ["/depenses", "Dépenses"],
    ["/solde", "Solde"],
    ["/journal", "Journal"],
    ...(estAdmin ? ([["/utilisateurs", "Utilisateurs"]] as [string, string][]) : []),
  ];
  const actif = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-bold">
          Suivi financier
          <small className="block text-sm font-medium text-mut">CELAVIV × GROUPE PNC</small>
        </h1>
        <div className="no-print flex items-center gap-3 text-sm text-mut">
          <span>
            {moi.nom} · {SOCIETE[moi.societe]} · {ROLE[moi.role]}
          </span>
          <form action="/auth/sortie" method="post">
            <button className="btn btn-s">Déconnexion</button>
          </form>
        </div>
      </header>
      <nav className="no-print my-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Navigation principale">
        {liens.map(([h, l]) => (
          <Link key={h} href={h} className={`navlink ${actif(h) ? "on" : ""}`} aria-current={actif(h) ? "page" : undefined}>
            {l}
          </Link>
        ))}
      </nav>
      {!peutEcrire && <p className="mb-3 rounded-lg bg-soft px-3 py-2 text-sm">Vous êtes en lecture seule : vous pouvez tout consulter, mais rien modifier.</p>}
    </>
  );
}
