"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Depense, Dossier, Facture, Journal, Profil, Solde, Versement } from "@/lib/types";

type Data = {
  dossiers: Dossier[];
  factures: Facture[];
  depenses: Depense[];
  versements: Versement[];
  journal: Journal[];
  profils: Profil[];
  solde: Solde | null;
};

type Ctx = Data & {
  moi: Profil;
  peutEcrire: boolean;
  estAdmin: boolean;
  charge: boolean;
  supabase: ReturnType<typeof createClient>;
  recharger: () => Promise<void>;
  nom: (id: string | null) => string;
};

const DataContext = createContext<Ctx | null>(null);

const VIDE: Data = { dossiers: [], factures: [], depenses: [], versements: [], journal: [], profils: [], solde: null };

const num = <T,>(rows: T[] | null, keys: (keyof T)[]): T[] =>
  (rows ?? []).map((r) => {
    const o = { ...r };
    keys.forEach((k) => ((o as Record<keyof T, unknown>)[k] = Number(o[k])));
    return o;
  });

export function DataProvider({ moi, children }: { moi: Profil; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data>(VIDE);
  const [charge, setCharge] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recharger = useCallback(async () => {
    const [dos, fac, dep, ver, jou, pro, sol] = await Promise.all([
      supabase.from("vue_dossiers").select("*"),
      supabase.from("factures").select("*").is("supprime_le", null),
      supabase.from("depenses").select("*").is("supprime_le", null),
      supabase.from("vue_versements").select("*"),
      supabase.from("journal").select("id, le, utilisateur, description").order("id", { ascending: false }).limit(200),
      supabase.from("profils").select("*").order("nom"),
      supabase.from("vue_solde").select("*").single(),
    ]);
    setData({
      dossiers: num<Dossier>(dos.data, ["montant", "facture", "encaisse", "reste_du"]),
      factures: num<Facture>(fac.data, ["montant"]),
      depenses: num<Depense>(dep.data, ["montant"]),
      versements: num<Versement>(ver.data, ["montant", "affecte", "libre"]),
      journal: (jou.data ?? []) as Journal[],
      profils: (pro.data ?? []) as Profil[],
      solde: sol.data
        ? (Object.fromEntries(Object.entries(sol.data).map(([k, v]) => [k, Number(v)])) as Solde)
        : null,
    });
    setCharge(true);
  }, [supabase]);

  useEffect(() => {
    recharger();
    // Mise à jour en direct : toute modification d'un associé recharge les données.
    const rafraichir = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(recharger, 250);
    };
    const canal = supabase.channel("donnees");
    ["dossiers", "factures", "depenses", "versements", "journal"].forEach((table) =>
      canal.on("postgres_changes", { event: "*", schema: "public", table }, rafraichir),
    );
    canal.subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, recharger]);

  const nom = useCallback(
    (id: string | null) => (id ? (data.profils.find((p) => p.id === id)?.nom ?? "Un associé") : "Système"),
    [data.profils],
  );

  const value: Ctx = {
    ...data,
    moi,
    peutEcrire: moi.role !== "lecture",
    estAdmin: moi.role === "admin",
    charge,
    supabase,
    recharger,
    nom,
  };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const c = useContext(DataContext);
  if (!c) throw new Error("useData hors DataProvider");
  return c;
}
