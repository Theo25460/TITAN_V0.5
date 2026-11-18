# TITAN — iconographie sportive

Système écrit le 18 novembre 2026 (branche `claude/sleepy-pasteur-ebmhen`, bâtie sur la refonte Web « Signature » #156 et l'Android
natif #157/#158). Il remplace les onze pictogrammes génériques choisis par expression régulière (`run`, `bike`, `ball`, `glove`,
`racket`, `wave`, `mountain`, `target`, `sparkle`, `weight`, `leaf`).

Planche de référence : [`sport-icons/sheet.png`](sport-icons/sheet.png) (chaque glyphe à 48, 22 et 16 px, sur le fond de nuit et sur la
craie). Registre : [`sport-icons/registry.json`](sport-icons/registry.json). Captures avant/après dans le produit :
[`captures/sport-icons/`](captures/sport-icons/).

## 1. Ce qui n'allait pas (audit)

| Constat | Exemple |
|---|---|
| 260 sports pour 11 dessins | 53 sports partageaient `ball` (football, golf, bowling, cricket, billard…), 36 `run`, 34 `mountain`, 31 `wave` |
| Attributions fausses | équitation, karting, motocross, parachutisme → une montagne ; patinage artistique, ski-roues → un coureur ; sepak takraw → une raquette ; roller derby → une cible ; bras de fer → un gant |
| Familles et sports confondus | les onglets de famille, les Records et la page athlète montraient l'icône de la famille à la place de celle du sport |
| Écrans sans icône | sources d'un objectif, liste « Tes pratiques » de Carrière, grille « Par famille » du sélecteur de séance |
| Bases saines à garder | la grille 24 et le trait 1,65 de `js/app/icons.js` ; une seule source Web copiée vers Android par `mobile/scripts/sync-web-core.mjs` ; `TitanSports.iconOf()` déjà appelé par tous les écrans Web et Android |

## 2. Les règles

| Règle | Valeur |
|---|---|
| Grille | 24 × 24, zone vivante 2–22 ; tout tient dans 0,85–23,15 avec l'épaisseur du trait (contrôlé dans Chromium) |
| Trait principal | 1,65, extrémités et jonctions arrondies — le même que les icônes d'interface, pour qu'un sport et un chevron vivent sur la même ligne |
| Trait fin | 1,1 pour la texture : cordage, filet, coutures, treillis. Jamais pour un contour |
| Masse teintée | au plus une par glyphe, `currentColor` à 22 % : la surface qui porte la discipline (balle, disque, coque, eau, planche). Jamais deux forces de teinte |
| Plein | réservé à ce qui doit se lire à 16 px : la tête de l'athlète, une balle en vol, un palet |
| Sujet | l'objet d'abord (raquette, palet, gant, monoski, berimbau, pierre de curling) ; l'athlète seulement quand aucun objet ne dit le sport (course, marche, danse, yoga, gainage, taekwondo) |
| L'athlète | jamais dessiné à main levée : `athlete()` le place à partir d'angles d'articulation, proportions fixes (tronc 6, bras 3,3 + 3,1, jambe 4,3 + 4,3, tête pleine r 2,15), trait 2,1 pour qu'un corps tienne face aux objets. Aucune pose ne peut allonger un membre |
| Terrain et contexte | dans la bande basse (y 19,5–22) : eau (vagues de 2,5), neige (pente), sable (pointillés + soleil bas pour les variantes de plage), piste, sol rocheux (VTT), gravier (gravel) |
| Angles | 45° de préférence (la coupe de TITAN), horizontales pour le sol |
| Différencier deux sports proches | même base, un seul signe qui change : le cintre et le sol pour les vélos ; le soleil et le sable pour le beach-volley, le beach-soccer, le beach-handball, le beach-tennis ; les ondes sonores pour le cécifoot et le goalball ; le fauteuil pour les trois sports en fauteuil ; la position (tête devant, pieds devant) pour skeleton et luge |
| Couleur | aucune : le glyphe prend `currentColor`. Il se pose sur la couleur de famille (`--fam-*`, `familyColors`) en liste, sur l'encre d'une puce sélectionnée, sur la craie |
| Fond clair / sombre | rien à faire : un seul dessin, teinte en opacité, vérifié sur la nuit (#090C10) et sur la craie (#E9EDE8) |
| Tailles | conçu pour 20–22 px (rangées, tuiles), lisible à 16–17 px (puces), au mieux à 28 px (fin de séance). En dessous de 16 px, montrer l'icône de famille |
| Éléments permis | `path`, `circle`, `rect`, `ellipse` seulement (Android les dessine avec react-native-svg) ; pas de `<g>`, de style, de texte ni de couleur propre |
| Accessibilité | toujours décoratif (`aria-hidden`), le nom du sport est écrit à côté ; la couleur n'est jamais la seule information |

## 3. Fichiers et nommage

| Fichier | Rôle |
|---|---|
| `tools/sport-icons/parts.mjs` | les pièces qui portent les règles : `athlete()`, `joints()`, `bicycle()`, `wheelchair()`, `wave()`, `beach()`, `racket()`, `skateBoot()`, `tf()`… |
| `tools/sport-icons/glyphs/*.mjs` | les dessins, par familles de forme (endurance, eau et neige, escalade, force et combat, jeux, art et esprit) ; `glyphs.mjs` les réunit et refuse un doublon |
| `tools/sport-icons/build.mjs` | écrit `js/app/sport-icons.js` (généré, ne pas éditer) et `docs/design/sport-icons/registry.json` ; refuse un nom hors convention, un glyphe vide ou un élément qu'Android ne dessine pas |
| `tools/sport-icons/sheet.mjs` | la planche (`--png`, `--html`, `--only nom,prefixe*`, `--scale 2`) |
| `js/core/sports.js` | `iconOf(id)`, `FAMILY_ICON`, `ICON_SHARED` (les partages et leur raison), `ICON_RULES` (repli pour un sport inconnu) |
| `js/app/icons.js` | `titanIcon(nom)` lit les glyphes `sport-*` et `family-*` dans `window.TITAN_SPORT_ICONS` ; sans eux, la boussole, jamais un SVG vide |
| `mobile/src/core/icons.generated.ts` | généré par `mobile/scripts/sync-web-core.mjs`, qui lit maintenant aussi `js/app/sport-icons.js` |

Nommage : `sport-<id du catalogue en kebab>` (`ski_touring` → `sport-ski-touring`), `family-<famille>` pour les cinq marques de famille.
Un glyphe partagé garde le nom du sport qui l'a vu naître (`sport-hurling`) ou de ce qu'il dessine (`sport-wrestling-singlet`).

## 4. Attribution et repli

`TitanSports.iconOf(id)` :

1. un sport listé dans `ICON_SHARED` → le glyphe partagé ;
2. un sport du catalogue hors ligne → `sport-<id>` (le test vérifie qu'il existe pour les 260) ;
3. un sport inconnu du catalogue (ajouté sur le serveur depuis le dernier instantané) → le dessin le plus proche par son nom (`ICON_RULES`, ex. `ultra_trail_night` → `sport-trail`) ;
4. sinon la marque de sa famille (`family-endurance`…).

Partages en vigueur (3 glyphes, 4 sports) — à revoir seulement si l'usage le demande :

| Sports | Glyphe | Raison |
|---|---|---|
| hurling, camogie | `sport-hurling` | même crosse (hurley) et même balle ; le camogie est le hurling féminin |
| lacrosse, lacrosse sixes | `sport-lacrosse` | même crosse, même balle ; seul le format change |
| lutte libre, lutte gréco-romaine | `sport-wrestling-singlet` | même maillot ; les deux styles diffèrent par les prises permises, rien de visible |

La lutte générique a son propre dessin (le tapis).

## 5. Ajouter un sport

1. Dessiner `sport-<id>` dans le fichier de `tools/sport-icons/glyphs/` qui lui ressemble, avec les pièces existantes.
2. `node tools/sport-icons/build.mjs` puis `node tools/sport-icons/sheet.mjs --png /tmp/x.png --scale 2 --only sport-<id>,sport-<voisin>` : le regarder à 16 px à côté de ses voisins.
3. `cd mobile && node scripts/sync-web-core.mjs .. $(git rev-parse HEAD)`.
4. `node --test tests/sport-icons.test.mjs` et `npx jest __tests__/sportIcons.test.tsx` (dans `mobile/`).

Si le sport doit partager un dessin, l'écrire dans `ICON_SHARED` avec sa raison en commentaire : le test refuse un partage non déclaré.

## 6. Où les icônes sont branchées

Web : sélecteur de séance (« Tes sports », grille « Par famille » — nouvelle —, recherche, onglets de famille), formulaire de séance,
import, Journal (rangées, filtres de famille), Records (en-tête de chaque sport — était l'icône de famille), Carrière (lentilles et
« Tes pratiques » — nouveau), Progrès (programme, sport de la semaine), QG (programme, dernières séances, « Tes sports »), Prévoir,
Objectifs (séances prises en compte — nouveau), Profil (maîtrise), page athlète publique (était l'icône de famille), parcours d'accueil,
page publique `/sports` (marques de famille).

Android : tous les écrans qui appelaient déjà `Sports.iconOf()` (puces et recherche de sport, rangées de séance, programme, bilan de
séance, enregistrement, rétrospective) dessinent le glyphe propre sans réécriture ; les puces de famille du sélecteur portent leur marque.

## 7. Limites honnêtes

- Aucun dessin n'a été revu par une personne avant cette PR ; les contrôles sont automatiques (cadre, éléments, couverture) et visuels
  par l'agent sur la planche et dans les pages. Rendu Android vérifié par les tests Jest, pas sur un téléphone.
- Glyphes les plus faibles, à reprendre en priorité si un retour le demande : gym acrobatique, Highland games, bras de fer, kabaddi,
  kho kho, pentathlon moderne (abstrait), fractionné (abstrait), qi gong, rucking, concours complet, skimboard, hapkido.
- Les pictogrammes 3D raster de `design/titan-visual-library/sports/lot-01` et `lot-02` (60 approuvés, 160 px, fond inclus) restent des
  illustrations : trop lourds et pas assez lisibles en dessous de 32 px pour une liste. Ils peuvent servir d'illustration de fiche sport.
