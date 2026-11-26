export type Societe = "CELAVIV" | "PNC";
export type Role = "admin" | "editeur" | "lecture";
export type Statut = "en_cours" | "termine" | "paye" | "annule";
export const CATEGORIES = ["Imprimerie", "Essence", "Location", "Matériel", "Repas", "Déplacement", "Autre"] as const;
export type Categorie = (typeof CATEGORIES)[number];

type Trace = {
  cree_par: string | null;
  cree_le: string;
  modifie_par: string | null;
  modifie_le: string | null;
  supprime_le: string | null;
};

export type Profil = { id: string; nom: string; email: string; role: Role; societe: Societe; cree_le: string };

export type Dossier = Trace & {
  id: string;
  client: string;
  statut: Statut;
  montant: number;
  note: string | null;
  facture: number;
  encaisse: number;
  reste_du: number;
  nb_factures: number;
};

export type Facture = Trace & {
  id: string;
  dossier_id: string;
  numero: string;
  montant: number;
  date: string;
  payee: boolean;
  date_paiement: string | null;
  versement_id: string | null;
};

export type Depense = Trace & {
  id: string;
  date: string;
  categorie: Categorie;
  libelle: string;
  montant: number;
  paye_par: Societe;
};

export type Versement = Trace & {
  id: string;
  date: string;
  de: Societe;
  montant: number;
  note: string | null;
  affecte: number;
  libre: number;
  nb_factures: number;
};

export type Solde = {
  a_restes_dus: number;
  b_part_pnc_depenses_celaviv: number;
  c_part_celaviv_depenses_pnc: number;
  d_versements_pnc: number;
  e_versements_celaviv: number;
  solde: number;
  depenses_total: number;
  depenses_celaviv: number;
  depenses_pnc: number;
};

export type Journal = { id: number; le: string; utilisateur: string | null; description: string };
