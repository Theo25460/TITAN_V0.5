# Paquet de production v25 (généré) — V1.7.7 GPS et navigation sportive — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v25` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
**Prérequis : les paquets v21 à v24 appliqués (tête `20261123180000`).**

Contenu : une migration, additive et rejouable. Une table nouvelle, trois colonnes nouvelles, aucune ligne existante modifiée (les
parcours déjà enregistrés reçoivent `origin = 'recorded'` par défaut). Aucune fonction existante n'est modifiée, sauf la couche
d'export `private.titan_export_extras_v1`, redéfinie de façon cumulative.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` GPS et navigation | `private.titan_routes` gagne `name` (80 caractères), `origin` (`recorded`, `imported`, `planned`) et `summary` (résumé du moteur GPS, 2 ko au plus). Nouvelles fonctions `titan_route_save_v2` (passe par la v1 : mêmes validations, même idempotence, mêmes plafonds de 200 parcours et 3 000 points), `titan_routes_v2`, `titan_route_get_v2`, `titan_route_rename_v1`. Nouvelle table privée `private.titan_places` (points personnels : nom, catégorie, position, note ; 300 par compte ; aucun droit API, aucune fonction de partage) avec `titan_place_save_v1`, `titan_places_v1`, `titan_place_delete_v1`. Quotas des deux fonctions Netlify : `titan_route_plan_quota_v1` (30 par heure, 150 par jour) et `titan_poi_quota_v1` (60 par heure, 300 par jour). L'export du compte porte `places` et les trois colonnes dans `routes` | Oui, derrière le drapeau `screens.gps` (Web) et dans l'application Android V1.7.7 : nom et origine d'un parcours, résumé d'une sortie, points personnels synchronisés, planification et points utiles (ces deux derniers demandent aussi les variables Netlify de `docs/V177_CARTES_ET_ROUTAGE.md`) |

Les fonctions v1 (`titan_route_save_v1`, `titan_routes_v1`, `titan_route_get_v1`…) ne sont pas touchées : les clients déjà publiés
continuent de fonctionner, et un parcours qu'ils enregistrent se lit par la v2 avec l'origine `recorded`.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v24, tête `20261123180000`).
2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123180000` manque).
3. `99-check-after.sql` : deux lignes `ok = true` (`private 132 bbccf194ac43 7a252d3ccf96`, `public 341 d126eb93aed9 351dd6eb7e5d`),
   puis les postflights v11, v13 et v131.

Empreintes mesurées le 25 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123180000` : avant = état v24
attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé
(« migration 20261125090000 is already registered ») ; `sql/tests/300_gps_navigation.sql` passe sur la réplique ainsi migrée.
Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_gps_navigation.sql`).

Ordre de déploiement : appliquer ce paquet **avant** de créer le drapeau `screens.gps` et avant de poser `ROUTING_PROVIDER`,
`ROUTING_API_KEY` ou `POI_OVERPASS_URL`. Sans lui : les clients V1.7.7 retombent sur les fonctions v1 (pas de nom, d'origine ni de
résumé sur le serveur) et gardent les points personnels sur l'appareil ; les fonctions `route-plan` et `poi-nearby`, même
configurées, répondent `503 SERVICE_UNAVAILABLE` sans appeler le fournisseur (pas de quota, pas d'appel).

Aucun drapeau n'est créé par la migration (`docs/FEATURE_FLAGS.md`).

Retour arrière : en-tête de `supabase/migrations/20261125090000_gps_navigation.sql`.
