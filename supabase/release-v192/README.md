# Paquet de production v192 (généré) — NON APPLIQUÉ

V1.9.2 — Retour sur la séance (`docs/V192_RETOUR_SEANCE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v192` depuis
`supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application. **Prérequis : le paquet v191 appliqué** (tête `20261201090000`).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` retour sur la séance | `private.titan_coach_feedback` (proposition, message du fil, séance lue, empreinte par catégorie sans valeur, ajustement et statut), `public.titan_coach_feedback_v1` (compose, give, list, detail, athlete, answer, withdraw, read), `titan_coach_messages_v1` indique `feedback_id`, l’export du compte gagne `coachFeedback` (sans mesure), mesure `private.titan_coach_feedback_measure()`. Aucune écriture dans `public.training_logs` | Seulement quand `screens.coach_feedback` est ouvert (fermé par défaut) |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026, PostgreSQL 16) : `00-check-before` à `ok = true` (fin du paquet
v191), `01` appliqué, `99-check-after` à `ok = true`, second passage refusé (« already registered »), postflights v11 (328/328) et v13
(42/42) vrais ; v131 44/54, les mêmes 10 lignes « ledger » absentes de la réplique qu’avant le paquet.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true`.
2. `01-20261202090000_coach_session_feedback.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261201090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
4. Ouvrir `screens.coach_feedback` pour les comptes pilotes seulement, une fois `screens.coach_followup` ouvert pour eux.

Retour arrière : décrit dans l’en-tête de la migration (table et fonctions supprimées, `titan_coach_messages_v1` de `20261121100000` et
`private.titan_export_extras_v1` de `20261117160000` réappliqués).
