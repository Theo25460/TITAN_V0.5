# Paquet canonique v2-04 — GPS et navigation sportive (V1.7.7) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-04` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : v2-01 → v2-02 → v2-03 → **v2-04** → v2-05 → v2-06 → v2-07 → v2-08. Ce paquet suppose : the journal (v2-01); wraps private.titan_export_extras_v1 left by the coaching (v2-03) instead of rewriting it.

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130102100_gps_navigation.sql` | V1.7.7 | `20261125170000_gps_navigation.sql` (paquet release-v25) | `52a209bdbb1a2aba95e6864f61060fa805384c6a` | **modifiée** : The export section: the lot rewrote the top layer of private.titan_export_extras_v1 (main's keys + routes + places), which would have erased the coaching keys of v2-03. It now renames the current top to titan_export_extras_before_gps_v1 and adds routes and places on top of it (the V1.5 wrapper pattern). Same keys, same values; nothing else changes. |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261130101600`) : `private` 169 fonctions, droits `67dccdf1dcdb`, corps `a631bc6e97e4` ; `public` 340 fonctions, droits `ff46799cf702`, corps `14ca24343e11`.
2. Les fichiers `01-…` à `01-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 172 fonctions, droits `b8688897b9d4`, corps `3ea4527e4347` ; `public` 349 fonctions, droits `83b7ea4975a1`, corps `6c770c056d27`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

### V1.7.7 — `supabase/release-v25/README.md` au SHA `52a209bdbb1a2aba95e6864f61060fa805384c6a`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v25 (généré) — V1.7.7 GPS et navigation sportive — NON APPLIQUÉ
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v25` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
> **Prérequis : les paquets v21 à v24 appliqués (tête `20261123180000`).**
>
> Contenu : une migration, additive et rejouable. Une table nouvelle, trois colonnes nouvelles, aucune ligne existante modifiée (les
> parcours déjà enregistrés reçoivent `origin = 'recorded'` par défaut). Aucune fonction existante n'est modifiée, sauf la couche
> d'export `private.titan_export_extras_v1`, redéfinie de façon cumulative.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` GPS et navigation | `private.titan_routes` gagne `name` (80 caractères), `origin` (`recorded`, `imported`, `planned`) et `summary` (résumé du moteur GPS, 2 ko au plus). Nouvelles fonctions `titan_route_save_v2` (passe par la v1 : mêmes validations, même idempotence, mêmes plafonds de 200 parcours et 3 000 points), `titan_routes_v2`, `titan_route_get_v2`, `titan_route_rename_v1`. Nouvelle table privée `private.titan_places` (points personnels : nom, catégorie, position, note ; 300 par compte ; aucun droit API, aucune fonction de partage) avec `titan_place_save_v1`, `titan_places_v1`, `titan_place_delete_v1`. Quotas des deux fonctions Netlify : `titan_route_plan_quota_v1` (30 par heure, 150 par jour) et `titan_poi_quota_v1` (60 par heure, 300 par jour). L'export du compte porte `places` et les trois colonnes dans `routes` | Oui, derrière le drapeau `screens.gps` (Web) et dans l'application Android V1.7.7 : nom et origine d'un parcours, résumé d'une sortie, points personnels synchronisés, planification et points utiles (ces deux derniers demandent aussi les variables Netlify de `docs/V177_CARTES_ET_ROUTAGE.md`) |
>
> Les fonctions v1 (`titan_route_save_v1`, `titan_routes_v1`, `titan_route_get_v1`…) ne sont pas touchées : les clients déjà publiés
> continuent de fonctionner, et un parcours qu'ils enregistrent se lit par la v2 avec l'origine `recorded`.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v24, tête `20261123180000`).
> 2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123180000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true` (`private 132 bbccf194ac43 7a252d3ccf96`, `public 341 d126eb93aed9 351dd6eb7e5d`),
>    puis les postflights v11, v13 et v131.
>
> Empreintes mesurées le 25 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123180000` : avant = état v24
> attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé
> (« migration 20261125170000 is already registered ») ; `sql/tests/300_gps_navigation.sql` passe sur la réplique ainsi migrée.
> Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_gps_navigation.sql`).
>
> Ordre de déploiement : appliquer ce paquet **avant** de créer le drapeau `screens.gps` et avant de poser `ROUTING_PROVIDER`,
> `ROUTING_API_KEY` ou `POI_OVERPASS_URL`. Sans lui : les clients V1.7.7 retombent sur les fonctions v1 (pas de nom, d'origine ni de
> résumé sur le serveur) et gardent les points personnels sur l'appareil ; les fonctions `route-plan` et `poi-nearby`, même
> configurées, répondent `503 SERVICE_UNAVAILABLE` sans appeler le fournisseur (pas de quota, pas d'appel).
>
> Aucun drapeau n'est créé par la migration (`docs/FEATURE_FLAGS.md`).
>
> Retour arrière : en-tête de `supabase/migrations/20261125170000_gps_navigation.sql`.
