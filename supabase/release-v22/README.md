# Paquet de production v22 (généré) — V1.6.3 Contrôle et réconciliation — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v22` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
**Prérequis : le paquet v21 (V1.6.2) appliqué.**

Contenu : une migration additive. Aucune table, aucune colonne, aucun droit sur une table ; les règles d'XP, de récompense et de
record ne changent pas.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` réconciliation | `titan_session_changes_v1` (lecture, propriétaire seulement) : les 50 dernières modifications d'une séance (valeur et unité, date à la minute, durée, note, archivage), lues dans `training_revisions`. `titan_update_training_session` refuse la restauration depuis le journal d'une séance archivée par une réunion V1.6.2 (`SESSION_MATCH_JOINED`) : « Séparer » la restaure, sans compter deux fois le même effort | Oui : bloc « Modifications » de la fiche de séance (Web et Android) ; message clair si l'on tente de restaurer une séance réunie |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v21, tête `20261123090000`).
2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true` (`private 126 1a34100c4a43 30801c0daf70`, `public 327 37814c491e87 bbf3b0c5b47f`),
   puis les postflights v11, v13 et v131.

Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt : avant = état v21 attendu (identique).
Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_history_reconcile.sql` et `300_session_match_review.sql`).

Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent `titan_session_changes_v1`.
Sans lui, la fiche n'affiche simplement pas de bloc « Modifications » (l'appel échoue, rien d'autre ne change).

Retour arrière : en-tête de `supabase/migrations/20261123120000_history_reconcile.sql`.
