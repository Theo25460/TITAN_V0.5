# Paquet de production v21 (généré) — V1.6.2 Rapprochement des séances — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v21` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**

Contenu : une migration additive. Aucune ligne existante n'est supprimée, aucun droit sur une table n'est élargi, les règles d'XP,
de récompense et de record ne changent pas (une séance séparée est créée par `titan_submit_training_session`, comme tout import).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` rapprochement | `private.titan_imported_activities` garde ce que la source a envoyé (sport, début, durée, distance), la règle V15 appliquée, le recouvrement, les raisons d'incertitude, la décision et son journal (colonne `events`, 49 dernières entrées). `titan_session_matches_v1` (lecture, propriétaire seulement) et `titan_resolve_session_match_v1` (« même séance » / « deux séances », réversible, 30 décisions par heure). Un import rejoué rend la décision en vigueur et complète les valeurs d'un ancien lien | Oui : bloc « Sources » de la fiche de séance (Web et Android), badge « À vérifier » du journal Web |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v20, registre 141, tête `20261122090000`).
2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261122090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true` (`private 125 3ee797232f74 4711201906bc`, `public 326 cecf92935b00 99408d5e7398`),
   puis les postflights v11, v13 et v131.

Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt : avant = état v20 attendu (identique).
Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_session_match_review.sql`, imports concurrents).

Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent les deux RPC. Sans lui, la fiche
n'affiche simplement pas de bloc « Sources » (l'appel échoue, rien d'autre ne change).

Retour arrière : en-tête de `supabase/migrations/20261123090000_session_match_review.sql`.
