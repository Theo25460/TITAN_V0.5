# Paquet de production v195 (généré) — NON APPLIQUÉ

V1.9.5 — Bilans de cycle partageables (`docs/V195_BILANS_CYCLE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v195`
depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application. **Prérequis : les paquets v191, v192, v193 puis v194 appliqués** (tête `20261204090000`).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` bilans de cycle | `private.titan_coach_cycle_reports` (un bilan par programme V1.9.4 : copie de travail du coach, brouillon, proposé, publié), `private.titan_coach_cycle_report_versions` (une version par validation du sportif : ce qu’il a choisi de partager, le contrat du lien, le fichier autorisé ou non, les retraits), `private.titan_coach_cycle_report_exports` (journal des fichiers téléchargés, sans contenu) ; `private.titan_coach_plans.origin` (le bilan d’où vient un cycle suivant) ; `public.titan_coach_cycle_v1` ; `private.titan_coach_plan_row` et `private.titan_export_extras_v1` réappliquées avec un ajout chacune ; mesure `private.titan_coach_cycle_measure()` (équipe) | Non tant que `screens.coach_cycle_report` est fermé (le serveur refuse : `FEATURE_DISABLED`) |

Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261204090000` (26 novembre 2026, PostgreSQL 16) : voir le
compte rendu du lot (empreintes avant private 142/7f7fdc02ec0d/e8547c9acb1c, public 328/7410ae198479/c98a08c50f3b ; après private
150/586d38f8d971/4c7a807e390f, public 329/bac2a73985e2/8822db836a5a).

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true`.
2. `01-20261205090000_coach_cycle_reports.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261204090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
4. Ouvrir `screens.coach_cycle_report` pour les comptes pilotes seulement, une fois `screens.coach_followup`, `screens.coach_feedback`,
   `screens.coach_review` et `screens.coach_programs` ouverts pour eux.

Retour arrière : décrit dans l’en-tête de la migration (fonctions et tables supprimées, colonne `origin` retirée de `private.titan_coach_plans`,
`private.titan_coach_plan_row` et `private.titan_export_extras_v1` de `20261204090000` réappliquées).
