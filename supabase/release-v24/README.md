# Paquet de production v24 (généré) — V1.6.6 Journal longue durée — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v24` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
**Prérequis : les paquets v21 (V1.6.2), v22 (V1.6.3) et v23 (V1.6.4) appliqués.**

Contenu : une migration, sans table ni colonne nouvelle, aucune ligne existante modifiée. Le journal longue durée lui-même (lecture
paginée par clé, rafraîchissement par manifeste, couverture hors ligne) n'a besoin d'aucun changement de schéma : il lit les colonnes
`id`, `revision`, `archived_at`, `status`, `is_suspicious` que chaque modification serveur d'une séance fait déjà bouger.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` journal longue durée | `titan_update_training_session` accepte `elevation` (0 à 12 000 m, ou `null` pour l'effacer) pour une séance mesurée en km : une correction = une révision et un instantané, seule ou avec d'autres champs, récompenses inchangées. Nouvelle fonction privée `private.titan_update_session_elevation_v1`. `titan_session_changes_v1` liste aussi le dénivelé | Oui : champ « Dénivelé positif » de « Corriger la séance » (Web et Android) et ligne « Dénivelé : 1450 → 1650 m » des modifications |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v23, tête `20261123150000`).
2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123150000` manque).
3. `99-check-after.sql` : deux lignes `ok = true` (`private 130 6588576b84de 263683b3f84f`, `public 332 fb59f2b689b9 dca2a744f579`),
   puis les postflights v11, v13 et v131.

Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123150000` : avant = état v23
attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé.
Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_journal_long_duration.sql`).

Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui envoient `elevation`. Sans lui, une
correction du dénivelé est refusée par le serveur (`PATCH_INVALID`, message « Une valeur n'est pas valide pour cette séance ») et
rien d'autre ne change : le journal paginé, le rafraîchissement et la couverture fonctionnent sur le schéma actuel.

Retour arrière : en-tête de `supabase/migrations/20261123180000_journal_long_duration.sql`.
