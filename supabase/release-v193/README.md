# Paquet de production v193 (généré) — NON APPLIQUÉ

V1.9.3 — Revue de suivi (`docs/V193_REVUE_SUIVI.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v193` depuis
`supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application. **Prérequis : les paquets v191 puis v192 appliqués** (tête `20261202090000`).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` revue de suivi | `private.titan_coach_review_drafts` (une proposition préparée par suivi et par semaine : brouillon, envoyée ou abandonnée), `public.titan_coach_review_v1` (week, prepare, send, discard), l’export du compte gagne `coachReviewDrafts` (brouillons du coach, aucune mesure du sportif), mesure `private.titan_coach_review_measure()`. Aucune écriture dans `public.training_logs`, les notes ou les check-ins | Seulement quand `screens.coach_review` est ouvert (fermé par défaut) |

Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261202090000` (25 novembre 2026, PostgreSQL 16) :
`00-check-before` à `ok = true` (private 132/f470df633887/8431bbe577ef, public 326/a50bf326388e/321fae833080), `01` appliqué,
`99-check-after` à `ok = true` (private 135/46ef37ce6ad4/65b87c582f10, public 327/38f8cdbe16ff/e631f251f386), second passage refusé
(« migration 20261203090000 is already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true`.
2. `01-20261203090000_coach_weekly_review.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261202090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
4. Ouvrir `screens.coach_review` pour les comptes pilotes seulement, une fois `screens.coach_followup` et `screens.coach_feedback` ouverts pour eux.

Retour arrière : décrit dans l’en-tête de la migration (table et fonctions supprimées, `private.titan_export_extras_v1` de
`20261202090000` réappliqué).
