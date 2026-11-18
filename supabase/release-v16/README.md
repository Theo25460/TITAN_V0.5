# Paquet de production v16 (généré) — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v16` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application.

Contenu : le seed v2 de TITAN LIVE (`20261119090000_live_seed_v2`). Les missions de rapport suivent désormais les contrats de
mesure par discipline (`js/core/sport-contracts.js`) : onze missions qui visaient une statistique qu'aucun formulaire ne demande
plus (gêne avant/après du yoga, dénivelé du patinage artistique, ateliers du triathlon…) sont retirées de la table seedée.
Données seulement : aucune fonction créée ou modifiée, aucune règle de récompense changée, aucune ligne d'un compte touchée.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` seed | Même seed rejouable (sports → Voies, missions, trouvailles), puis suppression des missions que le moteur ne propose plus | Non tant que `screens.live` est fermé ; ensuite, ces missions ne sont plus proposées |

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v15).
2. `01-…sql` (garde d'ordre : refusé si rejoué ou si v15 manque).
3. `99-check-after.sql` : deux lignes `ok = true` (empreinte inchangée : le paquet ne touche aucune fonction), puis les postflights
   v11, v13 et v131.

Empreintes remesurées le 18 novembre 2026 après la correction d'audit de v15 (`private 104 7772609c3673 ccca14f98fa2`,
`public 309 5eb4c4873e06 b4dbcb08ceb1`, avant comme après) ; rien ne change dans ce paquet.

Sans ce paquet, rien ne casse : le serveur connaît seulement onze missions de plus qu'aucun client ne propose. Il devient
nécessaire le jour où le moteur **ajoute** une mission (le serveur ignore une mission inconnue).

Retour arrière : rejouer le seed de `20261117090000_live_rpg_v1.sql` (les `insert … on conflict` réinsèrent les onze missions).
