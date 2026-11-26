# Paquet canonique v2-08 — Consolidation V2.0 (export complet, hygiène des droits, garde finale) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-08` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : v2-01 → v2-02 → v2-03 → v2-04 → v2-05 → v2-06 → v2-07 → **v2-08**. Ce paquet suppose : every package above: it wraps the final export chain and checks that no section was lost.

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130105900_v2_consolidation.sql` | A2 | nouvelle migration écrite par A2 | — | Written by A2: exports the V1.6.4 import batches and the V1.6.5 source runs, revokes the default grant of the V1.6.5 trigger function, refuses the package if an export section or a grant is lost. |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261130105100`) : `private` 266 fonctions, droits `a9ee695b702f`, corps `2c56e59a3be0` ; `public` 372 fonctions, droits `1c3d2fef1a19`, corps `4cd6fcef9a64`.
2. Les fichiers `01-…` à `01-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 267 fonctions, droits `0aeffa8d0135`, corps `ebb8cdcf2f31` ; `public` 372 fonctions, droits `1c3d2fef1a19`, corps `4cd6fcef9a64`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

Aucun : ce paquet est écrit par la mission A2.