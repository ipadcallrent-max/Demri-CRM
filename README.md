# Suivi financier CELAVIV × GROUPE PNC

Application web qui suit les dossiers de CELAVIV dus par GROUPE PNC, les dépenses communes partagées à 50 / 50 et les versements entre les deux sociétés, et calcule le solde en direct.

**Stack** : Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (PostgreSQL, Auth, Realtime) · hébergement Vercel. Données en région UE.

## Règle du solde

```
Solde = A + B − C − D + E
A = restes dus des dossiers non annulés (à facturer − factures payées, jamais négatif)
B = 50 % des dépenses payées par CELAVIV
C = 50 % des dépenses payées par GROUPE PNC
D = versements de GROUPE PNC non affectés à une facture
E = versements de CELAVIV à GROUPE PNC
```

Un versement de GROUPE PNC peut régler plusieurs factures d'un coup : ces factures passent à « payée » (elles réduisent A), et seule la part non affectée du versement compte dans D. Un même paiement n'est donc jamais déduit deux fois.

Le calcul est fait dans la base (`vue_solde`), pas dans le navigateur : tout le monde voit le même chiffre.

## Où est quoi

| Chemin | Contenu |
| --- | --- |
| `supabase/migrations/` | Tables, calcul du solde, droits (RLS), journal d'activité, versements groupés, effacement RGPD |
| `tests/solde.test.ts` | Tests du calcul (dont le jeu de test du cahier : 9 850 €), des droits et du journal |
| `src/app/(app)/` | Écrans : accueil, dossiers, fiche dossier, dépenses, solde et versements, journal, utilisateurs |
| `src/app/(app)/export/[table]` | Exports CSV (dossiers, factures, dépenses, versements) |
| `src/components/` | Chargement des données en temps réel, formulaires, composants d'interface |

## Droits

| Rôle | Peut |
| --- | --- |
| Administrateur | Tout, y compris supprimer, inviter ou retirer un associé, effacer un client (RGPD) |
| Éditeur | Voir, ajouter et modifier dossiers, factures, dépenses, versements ; annuler un dossier |
| Lecture seule | Tout voir, rien modifier |

Les droits sont vérifiés par PostgreSQL (Row Level Security), pas seulement masqués à l'écran. Chaque ajout, modification ou suppression est inscrit au journal par un trigger, avec son auteur ; le journal n'est pas modifiable.

## Lancer en local

Prérequis : Node 20+, Docker.

```bash
npm install
npx supabase start          # base locale + Auth + Realtime + boîte mail de test
cp .env.example .env.local  # puis coller l'URL et les clés affichées par « supabase status »
npm run dev
```

Les e-mails (liens magiques, invitations) arrivent dans la boîte de test Mailpit indiquée par `supabase status`.

Créer le premier administrateur (une seule fois) : dans la boîte de test ou le tableau de bord Supabase, inviter l'utilisateur avec les métadonnées `{"nom": "…", "role": "admin", "societe": "CELAVIV"}`. Les suivants s'invitent depuis l'écran **Utilisateurs**.

## Tests

```bash
# PostgreSQL local nécessaire (base vide, elle est réinitialisée à chaque lancement)
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/demri_test npm test
```

## Mise en production

1. Créer un projet Supabase en région **Europe (Frankfurt)**, plan Pro pour les sauvegardes quotidiennes.
2. Appliquer les migrations : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
3. Dans Supabase > Authentication : désactiver les inscriptions publiques, mettre l'URL du site et `https://<site>/auth/callback` dans les URL de redirection.
4. Créer le projet Vercel sur ce dépôt, région `fra1`, avec les variables de `.env.example`.
5. Inviter le premier administrateur (voir plus haut).
