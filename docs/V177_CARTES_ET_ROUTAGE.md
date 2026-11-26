# V1.7.7 — Cartes, calcul d’itinéraire et points utiles : évaluation et choix (25/11/2026)

Ce document dit ce que TITAN peut utiliser pour afficher une carte, calculer un itinéraire et trouver des points utiles, à quelles
conditions, et ce que le propriétaire doit créer lui-même. **Rien n’a été créé, acheté ni activé par le code** : aucun compte, aucune
clé, aucune variable posée.

## 0. Ce qui a été vérifié, et comment

**Aucun service réel n’a été appelé depuis le conteneur de build.** Son réseau bloque ces hôtes : l’ouverture directe de
`operations.osmfoundation.org`, `www.openstreetmap.org`, `openrouteservice.org`, `www.graphhopper.com` et `dev.overpass-api.de` a échoué
le 25/11/2026 (« host not found », hôtes hors de la liste autorisée). Aucune page officielle n’a donc été **lue** ; aucune requête
d’itinéraire, de tuile ou Overpass n’a été faite.

Ce qui a été possible : une **recherche Web** le 25/11/2026, qui renvoie des extraits de pages. Chaque affirmation ci-dessous porte
l’une de ces trois mentions :

- **[extrait 25/11/2026]** : lu dans un extrait de recherche Web ce jour-là, avec l’adresse de la page d’où il vient. C’est un
  extrait, pas la page : **à confirmer en ouvrant la page** avant toute décision d’argent ou de licence.
- **[contradictoire 25/11/2026]** : les extraits ne s’accordent pas entre eux ; les deux chiffres sont donnés.
- **[non vérifié en ligne le 25/11/2026, à confirmer]** : connaissance générale de l’auteur, aucune source ouverte ni extraite.

Les formes de requête et de réponse des adaptateurs (`functions/route-plan.mjs`, `functions/poi-nearby.mjs`) sont écrites d’après les
références publiques des API, **non vérifiées contre les services réels** : c’est écrit en tête des deux fichiers, et le premier essai
réel (section 8) sert à le lever.

## 1. Données OpenStreetMap : licence et crédit

- Les données OpenStreetMap sont sous licence **ODbL** (Open Database License). Les tuiles d’un fond de carte fait à partir de ces
  données sont une « œuvre produite » qui demande le crédit d’OpenStreetMap. **[extrait 25/11/2026]**
  <https://github.com/protomaps/basemaps> (« Produced Works of the OpenStreetMap dataset under the Open Database License »).
- Crédit accepté : « © OpenStreetMap contributors » ou « © OpenStreetMap » ; le mot « contributors » peut être omis si la place
  manque ; un lien vers `www.openstreetmap.org/copyright` (ou vers la licence ODbL) est demandé pour une carte interactive.
  **[extrait 25/11/2026]** <https://osmfoundation.org/wiki/Attribution> (lignes directrices adoptées le 25/06/2021 selon l’extrait).
- Emplacement du crédit dans une application mobile (coin de la carte, ou écran à côté) : les extraits citent des versions
  différentes des lignes directrices. **[contradictoire 25/11/2026]**, même page. Choix prudent retenu : le crédit **sur l’écran qui
  affiche la donnée**, pas seulement dans « À propos ».
- Formulation française retenue par le code : **« © les contributeurs d’OpenStreetMap »**, avec le lien
  `https://www.openstreetmap.org/copyright` renvoyé par les deux fonctions (`attributionUrl`, `licenseUrl`). La traduction du crédit
  n’a pas été vérifiée dans une source officielle : **[non vérifié en ligne le 25/11/2026, à confirmer]** ; en cas de doute, afficher
  « © OpenStreetMap contributors ».

Conséquence pour TITAN : un itinéraire calculé, un point utile et un fond de carte viennent tous d’OpenStreetMap et portent tous le
crédit. Un parcours enregistré par le GPS du téléphone ou importé d’un fichier du sportif n’en porte pas : ce sont ses données.

## 2. `tile.openstreetmap.org` n’est pas un fond de carte de production

Politique d’usage des tuiles de la Fondation OpenStreetMap (<https://operations.osmfoundation.org/policies/tiles/>) :

- **Téléchargement en masse interdit** : est « en masse » toute récupération anticipée de tuiles autres que celles que la personne
  regarde ; « enregistrer une zone pour plus tard » est interdit ; ces usages sont bloqués sans préavis. **[extrait 25/11/2026]**
- Un `User-Agent` ou un `Referer` valide est exigé et contrôlé automatiquement. **[extrait 25/11/2026]**
  <https://wiki.openstreetmap.org/wiki/Blocked_tiles> et <https://phabricator.wikimedia.org/T141815>.
- Aucune garantie de disponibilité, service financé par des dons, accès retirable à tout moment ; crédit obligatoire.
  **[non vérifié en ligne le 25/11/2026, à confirmer]** (la page n’a pas pu être ouverte).

Conclusion : ces tuiles ne conviennent **ni** comme fond de carte d’une application publiée (aucune garantie, blocage possible de
tous les utilisateurs d’un coup), **ni** pour une zone hors ligne (interdit). TITAN ne les utilise pas et ne les propose pas par
défaut.

## 3. Fonds de carte réalistes pour un propriétaire seul

| Option | Licence et crédit | Quota gratuit | Coût ensuite | Hors ligne |
|---|---|---|---|---|
| **MapTiler Cloud** (<https://www.maptiler.com/cloud/pricing/>) | données OSM (ODbL), crédit MapTiler + OpenStreetMap | 100 000 requêtes et 5 000 sessions par mois ; **usage non commercial** ; le service s’arrête au quota, sans dépassement facturé **[extrait 25/11/2026]** | « Flex » : 25 $ par mois (un extrait dit 30 $) pour 500 000 requêtes, usage commercial permis **[contradictoire 25/11/2026]** | rien trouvé dans les extraits sur le cache ou le hors-ligne mobile : **[non vérifié, à confirmer]** dans <https://www.maptiler.com/cloud/terms/> |
| **Stadia Maps** (<https://docs.stadiamaps.com/limits>) | données OSM, crédit Stadia + OpenStreetMap (+ auteurs du style) | 200 000 crédits par mois, sans carte bancaire ; **usage commercial non permis** sur le plan gratuit **[extrait 25/11/2026]** <https://stadiamaps.com/faqs/> | plans payants : prix **[non vérifié, à confirmer]** | **[non vérifié, à confirmer]** |
| **Thunderforest** (couches « Outdoors », « OpenCycleMap ») (<https://thunderforest.com/pricing>) | données OSM, crédit Thunderforest + OpenStreetMap | un plan gratuit « pour essayer le produit », limité, modifiable ou retirable **[extrait 25/11/2026]** <https://www.thunderforest.com/terms/> ; le chiffre de 150 000 tuiles par mois souvent cité n’a **pas** été confirmé | **[non vérifié, à confirmer]** | **[non vérifié, à confirmer]** |
| **Protomaps / PMTiles auto-hébergé** (<https://docs.protomaps.com/basemaps/downloads>) | code BSD-3, style CC0, tuiles = œuvre produite ODbL, crédit « © OpenStreetMap » ; format PMTiles ouvert **[extrait 25/11/2026]** <https://github.com/protomaps/basemaps> | sans objet : un **fichier statique** que TITAN héberge lui-même | stockage et trafic du fichier ; planète entière ≈ 120 Go (zooms 0 à 15), un extrait régional avec `pmtiles extract` et `--maxzoom` est bien plus petit (chaque zoom en plus double à peu près la taille) **[extrait 25/11/2026]** ; prix d’hébergement **[non vérifié, à confirmer]** | **permis par la licence** : un extrait est un fichier que l’on a le droit de copier, crédit conservé. Reste à construire (téléchargement par zone, place sur le téléphone, rendu vectoriel) |

Lecture pour TITAN, qui vend des abonnements : les plans gratuits de MapTiler et de Stadia sont réservés à l’usage **non commercial**
selon les extraits. Les utiliser dans l’application publiée sans plan payant serait hors de leurs conditions. Deux voies honnêtes :
un plan payant (ordre de grandeur : 25 à 30 $ par mois chez MapTiler, à confirmer), ou un extrait Protomaps auto-hébergé (pas
d’abonnement, mais du travail et un hébergement de fichier).

## 4. Moteurs de calcul d’itinéraire

| Moteur | Licence | Service hébergé | Profils utiles à TITAN | Boucle par longueur | Dénivelé, revêtement |
|---|---|---|---|---|---|
| **openrouteservice** (HeiGIT) | logiciel libre (licence exacte **[non vérifié, à confirmer]**) | oui, plan gratuit avec clé. Quota des itinéraires : 2 000 par jour et 40 par minute selon un extrait de <https://openrouteservice.org/plans/>, 10 000 par jour et 60 par minute selon un autre extrait de la même page **[contradictoire 25/11/2026]**. Au-delà : erreur, puis blocage temporaire en cas de dépassements répétés **[extrait 25/11/2026]** (conditions d’utilisation) | `cycling-regular`, `cycling-road`, `cycling-mountain`, `cycling-electric`, `foot-walking`, `foot-hiking` **[non vérifié en ligne, à confirmer]** ; pas de profil gravel ni course à pied | oui : `options.round_trip` avec `length`, `points`, `seed`, et **une seule** coordonnée **[extrait 25/11/2026]** <https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options> | `elevation: true` donne montée et descente totales (dans `properties` en GeoJSON, dans `summary` en JSON) ; `extra_info` : `surface`, `waytype`, `steepness` ; la réponse nomme `waytypes` ce que la requête nomme `waytype` ; certaines informations manquent selon le profil **[extrait 25/11/2026]** <https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info>, <https://ask.openrouteservice.org/t/total-ascent-or-descent-not-in-summary-in-geojson/1749> |
| **GraphHopper** | Apache-2.0 **[non vérifié en ligne, à confirmer]** | oui (« Directions API »). Gratuit : 500 crédits par jour, 5 points par itinéraire, **non commercial**, sans « mode flexible ». « Basic » : 5 000 crédits par jour, usage commercial, 56 € par mois selon la grille et 69 € selon une autre page du site **[contradictoire 25/11/2026]** <https://www.graphhopper.com/pricing/>, <https://docs.graphhopper.com/openapi/section/plans-and-rate-limits> | `bike`, `racingbike`, `mtb`, `foot`, `hike` **[non vérifié en ligne, à confirmer]** | oui : `algorithm=round_trip`, `round_trip.distance`, `round_trip.seed`, et **exige `ch.disable=true`** **[extrait 25/11/2026]** <https://docs.graphhopper.com/openapi/routing/postroute> — donc le mode flexible, que le plan gratuit n’a pas : **la boucle ne fonctionnerait pas sur le plan gratuit** (déduction, à confirmer) | `paths[].ascend`, `paths[].descend`, `paths[].time` en millisecondes **[extrait 25/11/2026]** ; détails de chemin `surface`, `road_class` **[non vérifié en ligne, à confirmer]** |
| **Valhalla** | MIT **[non vérifié en ligne, à confirmer]** | pas de service officiel de production ; le serveur de démonstration FOSSGIS n’est pas fait pour la production **[non vérifié en ligne, à confirmer]** (aucun extrait trouvé) | piéton, vélo (réglable) | non, pas en natif **[non vérifié]** | dénivelé par un service séparé **[non vérifié]** |
| **BRouter** | MIT **[non vérifié en ligne, à confirmer]** (aucun extrait trouvé) | à héberger soi-même | profils vélo très fins (trekking, gravel, VTT), écrits en texte | non **[non vérifié]** | oui, calculé avec l’altitude **[non vérifié]** |
| **OSRM, serveur de démonstration** | BSD **[non vérifié]** | démonstration seulement : « sans garantie », « au mieux », pas prévu pour la production ; conditions FOSSGIS **[extrait 25/11/2026]** <https://github.com/Project-OSRM/osrm-backend/wiki/API%20Usage%20Policy> | voiture surtout | non | non |

## 5. Points utiles : Overpass API

- Les instances publiques « offrent autant de ressources que possible » mais « se défendent contre l’abus » ; « les gros
  utilisateurs peuvent facilement monter leur propre instance ». **[extrait 25/11/2026]**
  <https://dev.overpass-api.de/overpass-doc/en/preface/commons.html>
- Le seuil souvent cité de 10 000 requêtes par jour apparaît sur une page de statut du wiki à propos d’un abus ancien ; il n’est
  **pas confirmé** comme règle actuelle. **[extrait 25/11/2026]** <https://wiki.openstreetmap.org/wiki/Overpass_API/status>
- L’instance principale a bloqué des hébergeurs en nuage (Azure, AWS) pour cause d’usage abusif. **[extrait 25/11/2026]**
  <https://community.openstreetmap.org/t/overpass-api-will-block-azure-and-aws-for-some-time/136817>. **Risque direct pour TITAN** :
  les fonctions Netlify tournent chez un hébergeur en nuage ; l’instance publique peut refuser leurs appels (la fonction répond alors
  `QUOTA_EXCEEDED`).
- Auto-héberger Overpass demande beaucoup de disque, de mémoire et de temps. **[extrait 25/11/2026]**
  <https://www.openstreetmap.org/user/SomeoneElse/diary/409111>. Hors de portée d’un propriétaire seul aujourd’hui.
- D’autres instances publiques existent (liste sur <https://wiki.openstreetmap.org/wiki/Overpass_API>), chacune avec ses règles.

## 6. LE CHOIX pour TITAN, à son échelle et à son budget

La décision prise avant cette étude tient, avec **trois réserves** que la recherche fait apparaître.

1. **Un relais serveur indépendant du fournisseur** (`functions/route-plan.mjs`). Le navigateur et l’application n’appellent que le
   site TITAN ; la clé reste sur le serveur ; le fournisseur ne reçoit que les points saisis, sans identité ; changer de fournisseur
   ne demande aucune nouvelle version des clients. Confirmé.
2. **Adaptateur principal : openrouteservice**, plan gratuit avec clé. C’est le seul des services hébergés étudiés qui réunisse, sans
   paiement : boucle par longueur, dénivelé, parts de revêtement et de type de voie. Confirmé.
   - *Réserve A* : le quota exact n’est pas établi (2 000 ou 10 000 itinéraires par jour selon l’extrait). Le quota TITAN par compte
     (30 par heure, 150 par jour) protège un sportif d’un autre, pas la somme : à 2 000 par jour, quatorze comptes très actifs
     suffisent à l’épuiser. À lire sur la page des plans à la création du compte.
   - *Réserve B* : les **conditions du plan gratuit pour un produit qui vend des abonnements** n’ont pas pu être lues. À lire avant
     d’activer (page « Terms of Service », trouvée par la recherche à l’adresse <https://openrouteservice.org/?p=940>) ; si elles l’excluent, demander un plan adapté à HeiGIT ou
     auto-héberger openrouteservice (`ROUTING_BASE_URL` est prévu pour cela).
3. **Second adaptateur : GraphHopper**, facultatif. Écrit et testé sur des réponses de forme enregistrée.
   - *Réserve C, qui contredit en partie la décision* : son plan gratuit est **non commercial**, limité à 5 points, et sans le mode
     flexible que la boucle exige. GraphHopper n’est donc **pas un secours gratuit** : c’est le chemin payant (56 à 69 € par mois, à
     confirmer) le jour où openrouteservice ne suffit plus. L’adaptateur n’applique aucune préférence (elles demanderaient un modèle
     personnalisé) et le dit dans `warnings`.
4. **Points utiles : Overpass, adresse choisie par le propriétaire** (`POI_OVERPASS_URL`), aucune adresse par défaut dans le code.
   Pour un premier essai : l’instance publique `https://overpass-api.de/api/interpreter`, en sachant qu’elle peut refuser un
   hébergeur en nuage et ne garantit rien. Quota TITAN : 60 recherches par heure et 300 par jour et par compte. Confirmé, avec ce
   risque écrit.
5. **Fond de carte : facultatif et ÉTEINT** tant que le propriétaire n’a pas configuré un fournisseur dont les conditions permettent
   l’usage. Confirmé et renforcé : les plans gratuits étudiés sont non commerciaux.
6. **Aucun téléchargement de carte hors ligne** tant qu’aucune licence ne le permet. Hors ligne, TITAN suit la **trace enregistrée
   sur fond neutre** : la ligne, la position, l’écart au parcours. La seule voie étudiée qui permette un vrai fond hors ligne est
   l’extrait Protomaps auto-hébergé : un chantier à part, non commencé.

## 7. Ce que le propriétaire doit créer (rien n’est créé par nous)

| # | Quoi | Où | Coût | Variable Netlify |
|---|---|---|---|---|
| 1 | Lire les conditions d’utilisation et la page des plans d’openrouteservice (réserves A et B) | openrouteservice.org | 0 | — |
| 2 | Créer un compte openrouteservice (HeiGIT) et une clé | tableau de bord openrouteservice | 0 sur le plan gratuit | `ROUTING_PROVIDER=openrouteservice`, `ROUTING_API_KEY=<clé>` (secret) |
| 3 | Choisir l’instance Overpass | une adresse https | 0 sur une instance publique, sans garantie | `POI_OVERPASS_URL=https://overpass-api.de/api/interpreter` (ou une autre) |
| 4 | Appliquer le paquet `supabase/release-v2-04` (ancien paquet du lot `release-v25`, remplacé par la séquence canonique V2.0, voir `docs/v2/MIGRATIONS_V2.md`) (quotas, bibliothèque v2, points personnels), après accord | Supabase | 0 | — |
| 5 | Vérifier que `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` sont posées côté fonctions | Netlify | 0 | déjà utilisées par l’assistance |
| 6 | Créer le drapeau `screens.gps` | centre de contrôle › Drapeaux | 0 | — |
| 7 | *Facultatif, plus tard* : un plan payant de fond de carte, ou un extrait Protomaps hébergé | fournisseur choisi | 25 à 30 $ par mois (MapTiler, à confirmer) ou un hébergement de fichier | variables du client (`TITAN_TILES_URL`, `TITAN_TILES_ATTRIBUTION` côté Android) + CSP + inventaire |
| 8 | *Facultatif* : compte GraphHopper payant | graphhopper.com | 56 à 69 € par mois (à confirmer) | `ROUTING_PROVIDER=graphhopper`, `ROUTING_API_KEY` |

Variables : `ROUTING_PROVIDER` (`openrouteservice` ou `graphhopper`), `ROUTING_API_KEY` (secret, plan de rotation :
`docs/SECRETS_ROTATION_PLAN.md`), `ROUTING_BASE_URL` (facultatif : adresse https d’une instance auto-hébergée ; la clé devient alors
facultative), `POI_OVERPASS_URL` (adresse https complète, sans identifiant ni paramètre).

## 8. Premier essai réel (à faire par le propriétaire, une fois la clé posée sur un déploiement de prévisualisation)

Les adaptateurs n’ont jamais parlé aux vrais services. Avant d’ouvrir le drapeau :

1. Un itinéraire vélo de deux points : réponse `200`, `segs` non vide, `ascentM` et `surface` non nuls. Si `surface` est `null` avec
   l’avertissement « Revêtement non communiqué », la réponse réelle ne porte pas `extras` quand `instructions` vaut `false` :
   retirer `instructions: false` de l’adaptateur.
2. Une boucle de 10 km à pied : la longueur calculée et l’avertissement d’écart au-delà de 10 %.
3. Un itinéraire `road` avec « éviter le relief » et un itinéraire `walk` avec « voies calmes » : si le fournisseur répond `400`
   (paramètre refusé), la fonction répond `UPSTREAM_UNAVAILABLE` ; retirer la pondération correspondante de l’adaptateur.
4. Deux points en mer : `422 NO_ROUTE`.
5. Une recherche d’eau dans un rayon de 2 km : `200`, des points avec `osmUpdatedAt`. Un `503 QUOTA_EXCEEDED` immédiat signifie que
   l’instance refuse l’hébergeur : en choisir une autre.
6. Les codes de surface et de type de voie d’openrouteservice (tables de `functions/route-plan.mjs`) : comparer deux ou trois
   tronçons connus avec ce que la réponse affiche.

## 9. Ce qui reste bloqué tant que ce n’est pas fait

| Tant que… | …ceci ne fonctionne pas | Ce qui fonctionne quand même |
|---|---|---|
| `ROUTING_PROVIDER` et `ROUTING_API_KEY` ne sont pas posées | planification d’un itinéraire ou d’une boucle (`503 ROUTING_NOT_CONFIGURED`, l’écran le dit) | enregistrer une sortie, importer un GPX, suivre un parcours, revenir par le même chemin |
| `POI_OVERPASS_URL` n’est pas posée | recherche de points utiles OpenStreetMap (`503 POI_NOT_CONFIGURED`) | les points personnels du sportif |
| le paquet v25 n’est pas appliqué | noms, origine et résumé des parcours ; points personnels sur le serveur ; **et les deux fonctions, même configurées** (sans la fonction de quota elles répondent `503 SERVICE_UNAVAILABLE` et n’appellent pas le fournisseur) | la bibliothèque v1 ; les points personnels gardés sur l’appareil |
| aucun fournisseur de fond de carte n’est configuré | fond de carte sous la trace | la trace sur fond neutre, en ligne et hors ligne |
| aucune licence ne permet le hors-ligne | téléchargement d’une zone de carte | le suivi hors ligne d’un parcours enregistré |
| le premier essai réel (section 8) n’est pas fait | la certitude que les adaptateurs lisent les vraies réponses | les tests sur réponses de forme enregistrée (`tests/route-plan.test.mjs`, `tests/poi-nearby.test.mjs`) |

## 10. Ce que le relais garantit, et ce qu’il ne garantit pas

- Il n’envoie au fournisseur que des nombres validés (latitudes, longitudes, longueur, graine) et un profil de sa propre table ; la
  requête Overpass est écrite par le serveur, aucun texte du sportif n’y entre.
- Il ne renvoie jamais le texte d’une erreur du fournisseur ni la clé ; il ne journalise rien.
- Il ne dit jamais qu’un itinéraire est sans risque : un tracé vient de données saisies par des bénévoles, sans connaissance de
  l’état du chemin, de la circulation ni des fermetures. Les sections signalées par le fournisseur comme d’accès restreint sont
  rapportées en avertissement ; l’absence d’avertissement ne vaut pas autorisation de passer.
- Les horaires d’un point utile sont transmis tels qu’écrits dans OpenStreetMap, jamais traduits en « ouvert maintenant ».
