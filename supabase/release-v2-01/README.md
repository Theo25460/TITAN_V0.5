# Paquet canonique v2-01 — Journal et imports (V1.6.2, V1.6.3, V1.6.4, V1.6.6) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-01` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : **v2-01** → v2-02 → v2-03 → v2-04 → v2-05 → v2-06 → v2-07 → v2-08. Ce paquet suppose : production head 20261122090000 (v20).

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130100100_session_match_review.sql` | V1.6.2 | `20261123090000_session_match_review.sql` (paquet release-v21) | `18c062b0ce1acd7904d3a52eb88a4f17382582d4` | identique octet pour octet |
| `02-20261130100200_history_reconcile.sql` | V1.6.3 | `20261123120000_history_reconcile.sql` (paquet release-v22) | `1e684f1c3d181f9b64f676ed0989097df8e79cfa` | identique octet pour octet |
| `03-20261130100300_history_migration.sql` | V1.6.4 | `20261123150000_history_migration.sql` (paquet release-v23) | `0730d3c0fe19aeb4cab98e4efe81570e0e995375` | identique octet pour octet |
| `04-20261130100400_journal_long_duration.sql` | V1.6.6 | `20261123180000_journal_long_duration.sql` (paquet release-v24 (fourche B)) | `897b731620a15eba9b72e8e8ebf9718310c71adb` | identique octet pour octet |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261122090000`) : `private` 120 fonctions, droits `0c180d72fbc0`, corps `d8ef8377869f` ; `public` 324 fonctions, droits `39442f678587`, corps `81ad6534245e`.
2. Les fichiers `01-…` à `04-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 130 fonctions, droits `6588576b84de`, corps `263683b3f84f` ; `public` 332 fonctions, droits `fb59f2b689b9`, corps `dca2a744f579`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

### V1.6.2 — `supabase/release-v21/README.md` au SHA `18c062b0ce1acd7904d3a52eb88a4f17382582d4`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v21 (généré) — V1.6.2 Rapprochement des séances — NON APPLIQUÉ
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v21` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
>
> Contenu : une migration additive. Aucune ligne existante n'est supprimée, aucun droit sur une table n'est élargi, les règles d'XP,
> de récompense et de record ne changent pas (une séance séparée est créée par `titan_submit_training_session`, comme tout import).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` rapprochement | `private.titan_imported_activities` garde ce que la source a envoyé (sport, début, durée, distance), la règle V15 appliquée, le recouvrement, les raisons d'incertitude, la décision et son journal (colonne `events`, 49 dernières entrées). `titan_session_matches_v1` (lecture, propriétaire seulement) et `titan_resolve_session_match_v1` (« même séance » / « deux séances », réversible, 30 décisions par heure). Un import rejoué rend la décision en vigueur et complète les valeurs d'un ancien lien | Oui : bloc « Sources » de la fiche de séance (Web et Android), badge « À vérifier » du journal Web |
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v20, registre 141, tête `20261122090000`).
> 2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261122090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true` (`private 125 3ee797232f74 4711201906bc`, `public 326 cecf92935b00 99408d5e7398`),
>    puis les postflights v11, v13 et v131.
>
> Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt : avant = état v20 attendu (identique).
> Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_session_match_review.sql`, imports concurrents).
>
> Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent les deux RPC. Sans lui, la fiche
> n'affiche simplement pas de bloc « Sources » (l'appel échoue, rien d'autre ne change).
>
> Retour arrière : en-tête de `supabase/migrations/20261123090000_session_match_review.sql`.

### V1.6.3 — `supabase/release-v22/README.md` au SHA `1e684f1c3d181f9b64f676ed0989097df8e79cfa`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v22 (généré) — V1.6.3 Contrôle et réconciliation — NON APPLIQUÉ
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v22` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
> **Prérequis : le paquet v21 (V1.6.2) appliqué.**
>
> Contenu : une migration additive. Aucune table, aucune colonne, aucun droit sur une table ; les règles d'XP, de récompense et de
> record ne changent pas.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` réconciliation | `titan_session_changes_v1` (lecture, propriétaire seulement) : les 50 dernières modifications d'une séance (valeur et unité, date à la minute, durée, note, archivage), lues dans `training_revisions`. `titan_update_training_session` refuse la restauration depuis le journal d'une séance archivée par une réunion V1.6.2 (`SESSION_MATCH_JOINED`) : « Séparer » la restaure, sans compter deux fois le même effort | Oui : bloc « Modifications » de la fiche de séance (Web et Android) ; message clair si l'on tente de restaurer une séance réunie |
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v21, tête `20261123090000`).
> 2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true` (`private 126 1a34100c4a43 30801c0daf70`, `public 327 37814c491e87 bbf3b0c5b47f`),
>    puis les postflights v11, v13 et v131.
>
> Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt : avant = état v21 attendu (identique).
> Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_history_reconcile.sql` et `300_session_match_review.sql`).
>
> Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent `titan_session_changes_v1`.
> Sans lui, la fiche n'affiche simplement pas de bloc « Modifications » (l'appel échoue, rien d'autre ne change).
>
> Retour arrière : en-tête de `supabase/migrations/20261123120000_history_reconcile.sql`.

### V1.6.4 — `supabase/release-v23/README.md` au SHA `0730d3c0fe19aeb4cab98e4efe81570e0e995375`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v23 (généré) — V1.6.4 Migration de l'historique — NON APPLIQUÉ
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v23` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
> **Prérequis : les paquets v21 (V1.6.2) et v22 (V1.6.3) appliqués.**
>
> Contenu : une migration additive. Deux tables privées (`private.titan_import_batches`, `private.titan_import_batch_rows`), deux colonnes
> nullables sur `private.titan_imported_activities` (`batch_id`, `batch_row`), aucun droit sur une table, aucune ligne existante modifiée.
> Les règles d'XP, de récompense, de record et le budget d'historique (300 séances par jour) ne changent pas.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` migration de l'historique | `titan_import_batch_open_v1` (ouvre ou reprend le lot d'un fichier), `titan_import_batch_rows_v1` (100 lignes par appel, un résultat par ligne, rejouable sans effet, s'arrête proprement sur le budget du jour), `titan_import_batch_v1` (rapport paginé du lot), `titan_import_batches_v1` (20 derniers lots), `titan_import_batch_withdraw_v1` (aperçu puis retrait des seuls ajouts non touchés du lot). `private.titan_import_core` à 8 arguments : note, ressenti et valeur kg / répétitions d'une séance d'historique ; la version à 7 arguments des connecteurs l'appelle sans rien d'autre | Oui : « Importer un historique » dans le journal Web et l'écran « Importer mon historique » d'Android |
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v22, tête `20261123120000`).
> 2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123120000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true` (`private 129 8534c00d26df 23f008c37b34`, `public 332 fb59f2b689b9 e20872688661`),
>    puis les postflights v11, v13 et v131.
>
> Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123120000` : avant = état v22
> attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé.
> Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_history_migration.sql`, puis `tools/db/test-history-migration.mjs` :
> 5 000 lignes, réimports, retraits, export TITAN réimporté dans des comptes isolés).
>
> Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent ces fonctions. Sans lui, la
> feuille d'import affiche « L'import d'historique n'est pas encore ouvert sur le serveur » et rien d'autre ne change.
>
> Retour arrière : en-tête de `supabase/migrations/20261123150000_history_migration.sql`.

### V1.6.6 — `supabase/release-v24/README.md` au SHA `897b731620a15eba9b72e8e8ebf9718310c71adb`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v24 (généré) — V1.6.6 Journal longue durée — NON APPLIQUÉ
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v24` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
> **Prérequis : les paquets v21 (V1.6.2), v22 (V1.6.3) et v23 (V1.6.4) appliqués.**
>
> Contenu : une migration, sans table ni colonne nouvelle, aucune ligne existante modifiée. Le journal longue durée lui-même (lecture
> paginée par clé, rafraîchissement par manifeste, couverture hors ligne) n'a besoin d'aucun changement de schéma : il lit les colonnes
> `id`, `revision`, `archived_at`, `status`, `is_suspicious` que chaque modification serveur d'une séance fait déjà bouger.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` journal longue durée | `titan_update_training_session` accepte `elevation` (0 à 12 000 m, ou `null` pour l'effacer) pour une séance mesurée en km : une correction = une révision et un instantané, seule ou avec d'autres champs, récompenses inchangées. Nouvelle fonction privée `private.titan_update_session_elevation_v1`. `titan_session_changes_v1` liste aussi le dénivelé | Oui : champ « Dénivelé positif » de « Corriger la séance » (Web et Android) et ligne « Dénivelé : 1450 → 1650 m » des modifications |
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v23, tête `20261123150000`).
> 2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123150000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true` (`private 130 6588576b84de 263683b3f84f`, `public 332 fb59f2b689b9 dca2a744f579`),
>    puis les postflights v11, v13 et v131.
>
> Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123150000` : avant = état v23
> attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé.
> Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_journal_long_duration.sql`).
>
> Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui envoient `elevation`. Sans lui, une
> correction du dénivelé est refusée par le serveur (`PATCH_INVALID`, message « Une valeur n'est pas valide pour cette séance ») et
> rien d'autre ne change : le journal paginé, le rafraîchissement et la couverture fonctionnent sur le schéma actuel.
>
> Retour arrière : en-tête de `supabase/migrations/20261123180000_journal_long_duration.sql`.
