# Paquet de production « partage » (généré) — NON APPLIQUÉ

Chantier « Avant V2 — Partage & communauté » (26 novembre 2026). Généré par `node tools/db/build-production-bundle.mjs --bundle partage`
depuis `supabase/migrations/`. **Ne pas modifier à la main** : un test (`tests/production-bundle.test.mjs`) compare ce dossier au générateur.

| Fichier | Effet | Données touchées |
| --- | --- | --- |
| `01-20261126120000_analytics_share_story.sql` | Le validateur `private.titan_analytics_payload_valid_v300` accepte quatre événements du parcours « Partager » (`share_preview_opened`, `share_export_succeeded`, `share_export_failed`, `share_sheet_opened`) avec la seule propriété `kind` = `session` ou `achievement`, sans `source`. Toutes les règles existantes restent identiques. | Aucune. Aucune table, politique RLS ni permission modifiée. |

Ordre : `00-check-before.sql` (deux lignes `ok = true`, état de fin du paquet v20), `01-…`, `99-check-after.sql` (deux lignes `ok = true`),
puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql`.

Empreintes mesurées sur une réplique vierge (`tools/db/test-migrations.sh` puis base de mesure) : avant = état v20 attendu (identique),
après = `private` 120 fonctions, corps `b87b04f7f588` ; `public` inchangé.

Sans ce paquet, le site fonctionne : le validateur actuel refuse ces quatre noms et le collecteur les abandonne silencieusement.

Retour arrière : rejouer le corps de la fonction de `20261013074320_analytics_support_metadata_v300.sql` (les lignes déjà insérées restent un
historique valide), puis supprimer la version `20261126120000` du registre `supabase_migrations.schema_migrations`.

Fusion V2.0 : les paquets V1.9.x (v191 à v195, branches non fusionnées) peuvent aussi démarrer après `20261122090000`. Les enchaîner, puis
remesurer l'empreinte `before` de celui qui passe en second.
