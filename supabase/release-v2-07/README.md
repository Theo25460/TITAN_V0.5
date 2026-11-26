# Paquet canonique v2-07 — Partage en image (Avant V2 — partage et communauté) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-07` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : v2-01 → v2-02 → v2-03 → v2-04 → v2-05 → v2-06 → **v2-07** → v2-08. Ce paquet suppose : main only (private.titan_analytics_payload_valid_v300).

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130105100_analytics_share_story.sql` | T1 | `20261126120000_analytics_share_story.sql` (paquet release-partage) | `e767d523da405c5ee4dd8082c2a0929312ab3304` | identique octet pour octet |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261130104600`) : `private` 266 fonctions, droits `a9ee695b702f`, corps `780bbc26238b` ; `public` 372 fonctions, droits `1c3d2fef1a19`, corps `4cd6fcef9a64`.
2. Les fichiers `01-…` à `01-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 266 fonctions, droits `a9ee695b702f`, corps `2c56e59a3be0` ; `public` 372 fonctions, droits `1c3d2fef1a19`, corps `4cd6fcef9a64`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

### T1 — `supabase/release-partage/README.md` au SHA `e767d523da405c5ee4dd8082c2a0929312ab3304`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production « partage » (généré) — NON APPLIQUÉ
>
> Chantier « Avant V2 — Partage & communauté » (26 novembre 2026). Généré par `node tools/db/build-production-bundle.mjs --bundle partage`
> depuis `supabase/migrations/`. **Ne pas modifier à la main** : un test (`tests/production-bundle.test.mjs`) compare ce dossier au générateur.
>
> | Fichier | Effet | Données touchées |
> | --- | --- | --- |
> | `01-20261126120000_analytics_share_story.sql` | Le validateur `private.titan_analytics_payload_valid_v300` accepte quatre événements du parcours « Partager » (`share_preview_opened`, `share_export_succeeded`, `share_export_failed`, `share_sheet_opened`) avec la seule propriété `kind` = `session` ou `achievement`, sans `source`. Toutes les règles existantes restent identiques. | Aucune. Aucune table, politique RLS ni permission modifiée. |
>
> Ordre : `00-check-before.sql` (deux lignes `ok = true`, état de fin du paquet v20), `01-…`, `99-check-after.sql` (deux lignes `ok = true`),
> puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql`.
>
> Empreintes mesurées sur une réplique vierge (`tools/db/test-migrations.sh` puis base de mesure) : avant = état v20 attendu (identique),
> après = `private` 120 fonctions, corps `b87b04f7f588` ; `public` inchangé.
>
> Sans ce paquet, le site fonctionne : le validateur actuel refuse ces quatre noms et le collecteur les abandonne silencieusement.
>
> Retour arrière : rejouer le corps de la fonction de `20261013074320_analytics_support_metadata_v300.sql` (les lignes déjà insérées restent un
> historique valide), puis supprimer la version `20261126120000` du registre `supabase_migrations.schema_migrations`.
>
> Fusion V2.0 : les paquets V1.9.x (v191 à v195, branches non fusionnées) peuvent aussi démarrer après `20261122090000`. Les enchaîner, puis
> remesurer l'empreinte `before` de celui qui passe en second.
