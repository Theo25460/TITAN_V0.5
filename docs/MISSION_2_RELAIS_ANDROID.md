# Relais mission 1 → mission 2 (Android)

Ce que la mission 1 (UX/UI Web, PR #150) a décidé et que l'application Android doit reprendre pour rester « un seul TITAN ».
Aucun fichier de `mobile/` n'a été modifié. Référence visuelle : `DESIGN.md` (§ 11 pour les ajouts de cette mission) et les
captures de `docs/design/captures/masterclass/`.

## Tokens : rien de nouveau

Aucune couleur, police, rayon ni espacement n'a été ajouté. Tout ce qui suit s'écrit avec `mobile/src/theme/tokens.ts` tel
qu'il est : citron Séance `#D7F25A` / encre `#161C00`, ambre records `#F4BB54` / encre `#1D1302`, cyan progression `#3DD9E8`,
mousse Aventure `#7FE0B0`, corail Communauté `#FF9B7A`, chiffre extra-condensé léger à partir de 48 px.

## Cinq décisions à reprendre

| # | Décision Web | Où (Web) | À faire sur Android |
|---|---|---|---|
| 1 | **Le pouls de la semaine** : sous le bonjour, les sept jours sur une ligne dans la grammaire du programme (jour encré dans la couleur de la famille dominante, jour prévu en cadre pointillé, repos en point, aujourd'hui souligné dans la couleur de l'espace), puis « 2/4 jours actifs » en chiffre. Absent tant qu'il n'y a aucune séance | `js/app/qg.js` `pulseHtml`, `js/app/program.js` `days()`, `.qg-pulse`, `.prg-days` | Même ligne en tête du QG, au-dessus de la ligne de rang. Les données viennent déjà de `TitanProgram.week` (module partagé) |
| 2 | **Ce qui a changé est une phrase**, pas un quatrième chiffre : « 1 h 33 de plus que d'habitude à ce stade de la semaine. » sous les trois chiffres de la semaine | `weekHtml` (`.qg-week-change`) | Même phrase sous les chiffres de la semaine du QG |
| 3 | **Fin de séance** : la feuille s'ouvre sur un aplat citron avec le chiffre qui dit la séance en très grand (distance, sinon volume, sinon durée), les autres mesures sur une ligne dessous. Un record battu prend la tête et passe l'aplat en ambre, avec « avant : … ». Le gain confirmé est un chiffre cyan qui compte, au-dessus de la même barre de niveau que le QG (d'où elle était à où elle est). Plus d'anneau ni de particules | `js/app/moment.js`, `.moment-field`, `.moment-lead`, `.moment-climb-*` | Remplacer `ProgressReveal` (anneau + braises) de l'écran de fin de séance par la même composition ; garder l'état final immédiat en animations réduites |
| 4 | **Balise allumée** : la feuille s'ouvre sur la peinture du monde (portrait du gardien pour la neuvième), le sentier des neuf balises en travers de son pied (allumées en mousse, celle qui vient de s'allumer en ambre avec son numéro, les suivantes en contour, le gardien en losange), puis le nom de l'insigne en ambre | `js/app/aventure.js` `celebrate`, `.av-celebrate-*` | Même écran après `claim` ; la géométrie est une simple rangée de neuf points |
| 5 | **La mission tient en quatre lignes** : quoi faire, où j'en suis, l'action, la phrase d'histoire. « Ce que ça apporte » (insigne, règle de calcul, repère à emporter) s'ouvre sur une ligne nommée | `missionHtml`, `.av-more` | Même pliage dans la carte de mission |

Deux décisions mineures : dans Carrière, les chiffres sont en couleur de texte (le cyan reste la progression, l'ambre les
records) ; l'en-tête de la Communauté porte « le cercle » (visages des amis, nombre, actifs du jour).

## Ce qui n'a pas changé et ne doit pas changer

Règles d'XP, de crédits et de récompenses ; modules partagés `js/core/*` (aucun n'a été modifié, la parité par empreinte tient) ;
ordre « mission avant carte » ; un seul bouton principal par écran ; rien n'est affiché avant confirmation du serveur.
