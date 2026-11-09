# TITAN V1.3 — Bible du monde

Les passeurs ont construit les balises pour retrouver un chemin. Les navigateurs ont conservé la mémoire des haltes, les artisans celle des réparations, les sentinelles celle des horizons. Le sportif relie ces mémoires au fil de ses retours. Une pause laisse intactes les traces du voyage.

## Les quatre régions

Les campagnes, gardiens, personnages et rangs viennent de `js/renaissance-catalog.js`, commun au Web et au natif. Les lieux et créatures secondaires viennent de `js/core/adventure-rpg.js`, les phases des gardiens de `js/core/campaign-encounters.js`.

| ID | Campagne | Intention | Paysage | Gardien |
|---|---|---|---|---|
| aube | La vallée de l’Aube | Retrouver son élan | `assets/renaissance/valley.webp` | Le Veilleur de pierre |
| marees | L’archipel des Marées | Explorer à sa façon | `assets/renaissance/archipelago.webp` | La Gardienne des courants |
| forge | Les forges d’Obsidienne | Affiner ses repères | `assets/renaissance/forge.webp` | L’Artisan de braise |
| aurores | La citadelle des Aurores | Construire sur la durée | `assets/renaissance/aurora.webp` | La Sentinelle du ciel |

Les appellations « La Vallée de l’Aube », « Les Îles des Marées », « La Forge des Titans » et « Les Hauts des Aurores » désignent les mêmes régions à une échelle locale. Les forges sont dans Obsidienne et les hauts entourent la citadelle. La sélection des campagnes garde les noms canoniques.

## Les neuf balises de chaque monde

Les premières balises accueillent le départ. Le refuge invite ensuite à observer et à affiner ses repères. La neuvième balise porte la reconnaissance du gardien. Les trois arcs « Les premiers repères », « Les chemins partagés » et « La mémoire du monde » répartissent leurs dix-huit rencontres facultatives dans ces neuf chapitres.

| Balise | Aube | Marées | Obsidienne | Aurores |
|---:|---|---|---|---|
| 1 | Le premier signal | La carte incomplète | L’étincelle | Le col silencieux |
| 2 | Le pont des possibles | Le phare des unités | La balance juste | L’atlas personnel |
| 3 | Le carnet du passeur | La crique des essais | Le moule | Le fil des saisons |
| 4 | Le refuge des cèdres | Les voiles familières | Les deux lames | Le belvédère |
| 5 | Les échos du lac | La boussole calme | Le grain du métal | La chambre des échos |
| 6 | L’atelier des repères | L’île des nuances | Le soufflet | L’aiguille du nord |
| 7 | La montée des lucioles | La traversée | Le sceau | Le livre ouvert |
| 8 | Le cercle de pierre | Le jardin des marées | La pièce maîtresse | La dernière terrasse |
| 9 | L’éveil du Veilleur | Le retour des phares | Le cœur de braise | Le ciel retrouvé |

## Lieux et personnages

Le Veilleur reconnaît les retours de la clairière des lucioles au refuge des cèdres et au cercle de pierre. La Gardienne rappelle la valeur des haltes entre la crique des cartes, le phare des nuances et le jardin des courants. L’Artisan donne du sens à la précision et aux réparations au foyer, à l’atelier des braises et à l’enclume du souvenir. La Sentinelle garde une perspective longue au lac des étoiles, au col du silence et à l’observatoire.

Les rencontres secondaires associent Renard de brume et Cerf des racines à l’Aube, Raie des mirages et Crabe des récifs aux Marées, Scarabée de suie et Golem de cuivre à Obsidienne, Hibou de givre et Loup des constellations aux Aurores. Elles racontent les efforts confirmés, tandis que les gardiens conservent leur rôle dans les campagnes.

| Personnage | Image | Rôle | Niveau catalogue |
|---|---|---|---:|
| L’Éclaireuse | `assets/renaissance/scout.webp` | La curiosité ouvre le chemin | 1 |
| Le Passeur | `assets/renaissance/ranger.webp` | Chaque retour compte | 1 |
| La Gardienne | `assets/renaissance/keeper.webp` | Un rythme qui dure | 3 |
| L’Artisan | `assets/renaissance/artisan.webp` | L’attention aux détails | 6 |
| La Navigatrice | `assets/renaissance/navigator.webp` | Toujours un nouvel horizon | 10 |
| La Sentinelle | `assets/renaissance/sentinel.webp` | Ton chemin, ton histoire | 15 |

Les personnages donnent une voix et un visage au voyage. Les portraits réduits `-s.webp` et les copies natives gardent la même identité.

## Rangs, objets et sentiers

| Niveau | Rang |
|---:|---|
| 1 | Éclaireur |
| 3 | Explorateur |
| 6 | Sentinelle |
| 10 | Gardien |
| 15 | Champion |
| 25 | Titan |
| 40 | Légende |

L’XP existante détermine le rang. Les jalons de carrière 5/10/20/35/50/75/100 suivent leur propre configuration serveur. Le passeport montre les acquis et le prochain objectif. Les cadres entourent le portrait, les ambiances donnent la lumière du lieu, les cartes racontent un chemin accompli. Un coffre secondaire garde un souvenir narratif. Les pièces acquises avec les crédits restent dans la collection.

Les sentiers traversent les quatre paysages. Les pas confirmés par le serveur révèlent des curiosités jusqu’à 30 millions de pas, avec les grands jalons 10k/30k/75k/150k/300k/500k/1M/2M/5M/10M/15M/20M/30M et des découvertes intermédiaires espacées d’au plus 100k. Les souvenirs restent cosmétiques. Les campagnes gardent leurs chapitres et leurs règles d’XP.

Le compteur Android local reste un repère sur l’appareil. Le déblocage demande une confirmation explicite, liée au propriétaire et idempotente. La date indique la confirmation serveur. Une correction de source conserve les souvenirs acquis. Quand une source ou le consentement manque, expliquer l’attente et laisser les campagnes accessibles.

## Direction et voix

Fond #05070A, cyan #3DD9E8 pour les repères actifs, ambre #F4BB54 pour les acquis, Archivo pour les titres et Manrope pour la lecture. Garder l’horizon des paysages, le visage des portraits et la silhouette des gardiens. Les blasons évoluent par chevrons, gemme à Sentinelle, ailes à Gardien, lauriers à Champion, couronne à Titan, rayons à Légende.

Employer « Tu retrouves un repère », « Le sentier attend ton prochain retour » et « Ton acquis est conservé ». Réserver « confirmé » aux faits du serveur. Une scène invite à revenir à son rythme. Le registre précise les contrôles de rendu, la recette Samsung et les retours utilisateurs restant à recueillir.
