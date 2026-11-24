# Paquet de production v191 (généré) — NON APPLIQUÉ

V1.9.1 — Une séance assignée (`docs/V191_SEANCE_ASSIGNEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v191` depuis
`supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application.

Construit sur `main` (fin du paquet v20, tête `20261122090000`). Les paquets v21 à v26 (V1.8.1 à V1.8.6) vivent sur leurs propres branches :
si l’un d’eux est appliqué avant celui-ci, régénérer ce paquet après eux (garde d’ordre et empreintes changent).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` suivi des propositions | Six colonnes sur `public.coach_assignments` (version acceptée, changement proposé, date déplacée, « faite » déclarée, écart traité, historique borné à 50 entrées), un déclencheur qui journalise chaque changement d’état et de lien quel que soit le chemin, `public.titan_coach_followup_v1` (file du coach filtrable par action et par sportif, liste et dossier, changement proposé / retiré / accepté / décliné, déplacement, « faite » déclarée, lien confirmé par le sportif, lien retiré, écart traité), mesure `private.titan_coach_followup_measure()`. Le portail `titan_coach_portal` n’est pas modifié. Aucune écriture dans `public.training_logs` | Seulement quand `screens.coach_followup` est ouvert (fermé par défaut, déploiement par compte) |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026, PostgreSQL 16) : `00-check-before` à `ok = true` (état de fin du
paquet v20), `01` appliqué, `99-check-after` à `ok = true`, second passage de `01` refusé (« already registered »).

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true`.
2. `01-20261201090000_coach_assignment_followup.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261122090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
4. Ouvrir `screens.coach_followup` pour les comptes pilotes seulement (deux coachs, quatre sportifs volontaires).

Retour arrière : décrit dans l’en-tête de la migration (fonctions, déclencheur et colonnes ajoutés supprimés ; le portail n’ayant pas changé,
rien n’est à recréer).
