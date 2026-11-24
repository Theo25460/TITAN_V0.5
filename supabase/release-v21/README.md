# Paquet de production v21 (généré) — NON APPLIQUÉ

V1.8.1 — Relais de cordée (`docs/V181_RELAIS_CORDEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v21` depuis
`supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` relais de cordée | Une étape « Le relais de la Sentinelle » sur la route pilote « Les crêtes de l’Aube » : un membre encordé transmet avec une séance confirmée, un autre membre confirme avec la sienne un autre jour ; une seule transmission et une seule confirmation par cordée ; aucune longueur, XP, crédit ou titre en plus ; export `cordeeRelays` ; mesure `private.titan_cordee_relay_measure()` | Seulement quand `screens.cordee_relay` est ouvert (fermé par défaut, déploiement par compte) |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026) : `00-check-before` à `ok = true` (état de fin du paquet v20),
`01` appliqué, `99-check-after` à `ok = true`, second passage de `01` refusé (« already registered »).

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true`.
2. `01-20261124090000_cordee_relay.sql` (garde d'ordre : refusé s'il est rejoué ou si `20261122090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
4. Ouvrir `screens.cordee_relay` pour les comptes pilotes seulement (`titan_admin_feature_flag_set_v1`, déploiement par compte).

Retour arrière : décrit dans l'en-tête de la migration (fonctions et table nouvelles supprimées, `titan_cordees_v1` et
`private.titan_social_export_v1` re-créées depuis `20261120110000`).
