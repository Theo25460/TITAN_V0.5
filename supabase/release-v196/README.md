# Paquet de production v196 (généré) — NON APPLIQUÉ

V1.9.6 — Suivi collectif individualisé (`docs/V196_SUIVI_COLLECTIF.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v196`
depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application. **Prérequis : les paquets v191, v192, v193, v194 puis v195 appliqués** (tête `20261205090000`).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` suivi collectif | `private.titan_coach_groups` et `_group_members` (groupes privés du coach, faits de ses propres liens), `private.titan_coach_dispatches` (un bloc à diffuser, version du modèle figée), `private.titan_coach_dispatch_recipients` (variante, exclusion, résultat et programme de chaque destinataire), `private.titan_coach_dispatch_sends` (résultats de chaque envoi, pour le rejeu) ; `public.titan_coach_group_v1` ; `private.titan_export_extras_v1` réappliquée avec un ajout (`coachGroups`) ; mesure `private.titan_coach_group_measure()` (équipe) | Non tant que `screens.coach_groups` est fermé (le serveur refuse : `FEATURE_DISABLED`) ; un sportif ne voit jamais un groupe |

Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261205090000` (146 migrations, 26 novembre 2026,
PostgreSQL 16) : empreintes avant private 150/586d38f8d971/4c7a807e390f, public 329/bac2a73985e2/8822db836a5a ; après private
154/d54cf36d42af/7bd81dcf3a5b, public 330/211397ebafd6/73baa6ed9d95 ; second passage refusé ; postflights v11 (328/328), v13 (42/42) et
v131 (54/54) vrais.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true`.
2. `01-20261206090000_coach_groups.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261205090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
4. Ouvrir `screens.coach_groups` pour les comptes pilotes seulement, une fois `screens.coach_followup`, `screens.coach_feedback`,
   `screens.coach_review`, `screens.coach_programs` et `screens.coach_cycle_report` ouverts pour eux.

Retour arrière : décrit dans l’en-tête de la migration (fonctions et tables supprimées, `private.titan_export_extras_v1` de `20261205090000`
réappliquée). Les programmes déjà reçus par les sportifs sont des programmes V1.9.4 ordinaires : ils restent.
