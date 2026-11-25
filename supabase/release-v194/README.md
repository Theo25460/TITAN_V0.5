# Paquet de production v194 (généré) — NON APPLIQUÉ

V1.9.4 — Programmation multi-semaines (`docs/V194_PROGRAMMATION.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v194`
depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application. **Prérequis : les paquets v191, v192 puis v193 appliqués** (tête `20261203090000`).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` programmation multi-semaines | `private.titan_coach_programs` et `_program_versions` (modèles du coach, versionnés), `private.titan_coach_plans` (programme adapté pour un suivi : brouillon, envoyé, clos, abandonné) et `private.titan_coach_plan_versions` (une version immuable par envoi, révision et clôture, avec l’instantané des séances, sans mesure) ; sur `public.coach_assignments` : `plan_id`, `plan_key`, `plan_week` (index unique par programme), `discuss_note`, `discuss_at` ; `public.titan_coach_program_v1` (library, program, save_program, archive_program, link, plan, athlete, adapt, edit, discard, send, revise, answer, close) ; `private.titan_coach_followup_row` réappliquée avec l’état « à discuter » et le programme de la proposition ; l’export gagne `coachPrograms` et `coachPlans` ; mesure `private.titan_coach_program_measure()`. Aucune écriture dans `public.training_logs`, les notes ou les check-ins | Seulement quand `screens.coach_programs` est ouvert (fermé par défaut) ; l’état « à discuter » n’apparaît que pour les propositions d’un programme |

Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261203090000` (25 novembre 2026, PostgreSQL 16) :
`00-check-before` à `ok = true` (private 135/46ef37ce6ad4/65b87c582f10, public 327/38f8cdbe16ff/e631f251f386), `01` appliqué,
`99-check-after` à `ok = true` (private 142/7f7fdc02ec0d/e8547c9acb1c, public 328/7410ae198479/c98a08c50f3b), second passage refusé
(« migration 20261204090000 is already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true`.
2. `01-20261204090000_coach_programs.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261203090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
4. Ouvrir `screens.coach_programs` pour les comptes pilotes seulement, une fois `screens.coach_followup`, `screens.coach_feedback` et
   `screens.coach_review` ouverts pour eux.

Retour arrière : décrit dans l’en-tête de la migration (fonctions et tables supprimées, colonnes retirées de `public.coach_assignments`,
`private.titan_coach_followup_row` de `20261201090000` et `private.titan_export_extras_v1` de `20261203090000` réappliqués).
