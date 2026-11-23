# Paquet de production v23 (généré) — V1.6.4 Migration de l'historique — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v23` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
**Prérequis : les paquets v21 (V1.6.2) et v22 (V1.6.3) appliqués.**

Contenu : une migration additive. Deux tables privées (`private.titan_import_batches`, `private.titan_import_batch_rows`), deux colonnes
nullables sur `private.titan_imported_activities` (`batch_id`, `batch_row`), aucun droit sur une table, aucune ligne existante modifiée.
Les règles d'XP, de récompense, de record et le budget d'historique (300 séances par jour) ne changent pas.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` migration de l'historique | `titan_import_batch_open_v1` (ouvre ou reprend le lot d'un fichier), `titan_import_batch_rows_v1` (100 lignes par appel, un résultat par ligne, rejouable sans effet, s'arrête proprement sur le budget du jour), `titan_import_batch_v1` (rapport paginé du lot), `titan_import_batches_v1` (20 derniers lots), `titan_import_batch_withdraw_v1` (aperçu puis retrait des seuls ajouts non touchés du lot). `private.titan_import_core` à 8 arguments : note, ressenti et valeur kg / répétitions d'une séance d'historique ; la version à 7 arguments des connecteurs l'appelle sans rien d'autre | Oui : « Importer un historique » dans le journal Web et l'écran « Importer mon historique » d'Android |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v22, tête `20261123120000`).
2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123120000` manque).
3. `99-check-after.sql` : deux lignes `ok = true` (`private 129 8534c00d26df 23f008c37b34`, `public 332 fb59f2b689b9 e20872688661`),
   puis les postflights v11, v13 et v131.

Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123120000` : avant = état v22
attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé.
Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_history_migration.sql`, puis `tools/db/test-history-migration.mjs` :
5 000 lignes, réimports, retraits, export TITAN réimporté dans des comptes isolés).

Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent ces fonctions. Sans lui, la
feuille d'import affiche « L'import d'historique n'est pas encore ouvert sur le serveur » et rien d'autre ne change.

Retour arrière : en-tête de `supabase/migrations/20261123150000_history_migration.sql`.
