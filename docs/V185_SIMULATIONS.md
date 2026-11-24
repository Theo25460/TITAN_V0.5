# V1.8.5 — Simulations du barème des rencontres entre clubs

Généré par `node tools/simulate-club-match.mjs --write` (graine fixe, 20000 tirages par ligne, données synthétiques uniquement). Le calcul
est celui du module partagé `js/core/club-match.js`, miroir de la migration `20261128090000_club_match.sql`.

**Barème testé.** Jour actif = 12 minutes d’effort confirmées dans un jour de Paris (90 par jour au plus). Part de chacun = jours de
l’allure × semaines de participation (arrondie au-dessus). Chacun compte au plus sa part. Taux d’un club = jours comptés ÷ somme des
parts, en pour cent arrondi en dessous, seulement à partir de 3 participants encore là. Coopération : score commun = moyenne des deux
taux, seuil 60 %. Rencontre comparative (fermée pendant le pilote, deux semaines seulement) : le meilleur taux l’emporte, égalité à moins de 5 points.

Modèle de comportement : chaque participant a une probabilité q d’être actif un jour donné, tirée autour de la réalisation moyenne du
club μ (q = μ × allure ÷ 7, écart 0,12). Allure régulière (3 jours par semaine), une semaine, sauf mention contraire.

## A. Tailles déséquilibrées, même taux de réalisation (μ = 0,7)

| Club A | Club B | Taux moyen A | Taux moyen B | Écart moyen | Égalité (< 5 pts) | A devant | B devant | Total brut : B devant | Coopération : 60 % atteint |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 3 | 3 | 61,4 % | 61,5 % | 22,8 pts | 15 % | 42 % | 42 % | 44 % | 61 % |
| 3 | 30 | 61,1 % | 61,4 % | 17,3 pts | 16 % | 42 % | 42 % | 100 % | 56 % |
| 4 | 12 | 61,6 % | 61,4 % | 16,5 pts | 16 % | 43 % | 41 % | 100 % | 57 % |
| 5 | 50 | 61,6 % | 61,5 % | 13,5 pts | 21 % | 40 % | 38 % | 100 % | 60 % |
| 8 | 80 | 61,5 % | 61,4 % | 10,5 pts | 27 % | 37 % | 36 % | 100 % | 61 % |
| 10 | 10 | 61,6 % | 61,6 % | 12,6 pts | 25 % | 38 % | 37 % | 47 % | 59 % |
| 12 | 150 | 61,5 % | 61,4 % | 8,6 pts | 33 % | 34 % | 33 % | 100 % | 63 % |

Lecture : à réalisation égale, les taux moyens restent à moins de 2 points l’un de l’autre quelle que soit la taille (la règle ne favorise
pas mécaniquement le gros club), alors qu’un total brut de jours donne la victoire au plus grand club presque à chaque fois. Le petit club
a des taux plus dispersés (écart moyen plus grand) : c’est le hasard d’une petite équipe, pas un avantage de taille ; la marge d’égalité l’absorbe en partie.

## B. Un membre très actif (7 jours sur 7, part de 3)

| Participants | Jours des autres | Taux publié (plafond = sa part) | Plafond à 1,5 × la part | Sans plafond | Part maximale d’un seul |
|---:|---:|---:|---:|---:|---:|
| 3 | 0 | 33 % | 50 % | 77 % | 33 % |
| 3 | 1 | 55 % | 72 % | 100 % | 33 % |
| 5 | 0 | 20 % | 30 % | 46 % | 20 % |
| 10 | 0 | 10 % | 15 % | 23 % | 10 % |
| 10 | 1 | 40 % | 45 % | 53 % | 10 % |
| 30 | 1 | 35 % | 37 % | 40 % | 3 % |

Lecture : avec le plafond à sa propre part, un seul membre ne fait jamais plus que 1 ÷ effectif du taux (33 % à trois) : il ne porte pas
son équipe. Sans plafond, le même membre ferait 77 % à lui seul dans un club de trois. Le plafond à 1,5 × de la saison de club (V1.8.4) laisserait
encore 50 % à un seul à trois : il n’est pas repris pour une rencontre entre clubs.

## C. Un retrait (5 participants, les 4 autres à 2 jours sur 3, le partant sans jour actif)

| Départ au jour | Part du partant (réduite au temps passé) | Taux publié | Si sa part restait entière | Si sa part disparaissait | S’il était resté sans rien faire |
|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 61 % | 53 % | 66 % | 53 % |
| 3 | 2 | 57 % | 53 % | 66 % | 53 % |
| 6 | 3 | 53 % | 53 % | 66 % | 53 % |

Lecture : la part du partant est ramenée au temps passé (arrondie au-dessus). Partir tôt pèse peu ; partir à la fin sans avoir rien fait
ne relève pas le taux (même valeur que s’il était resté) : faire partir les inactifs avant la fin ne rapporte rien. À 4 participants restants, le taux existe toujours.

## D. Une séance invalidée après coup (tous à 2 jours sur 3)

| Participants | Taux avant | Taux après | Baisse |
|---:|---:|---:|---:|
| 3 | 66 % | 55 % | 11 pts |
| 5 | 66 % | 60 % | 6 pts |
| 10 | 66 % | 63 % | 3 pts |
| 30 | 66 % | 65 % | 1 pts |
| 150 | 66 % | 66 % | 0 pts |

Lecture : une séance retirée enlève un jour à son auteur et au plus 100 ÷ (effectif × part) points au taux de son club. Le taux suit
la règle publiée tant que la rencontre court ; le récapitulatif figé à la fin ne bouge plus.

## E. Petites équipes

- 2 participants : taux non calculé ; score commun non calculé.
- 3 participants dont un parti au jour 3 : 2 encore là, taux non calculé — s’il en reste moins de 3 à la fin, la rencontre se termine « sans résultat ».
- 3 participants : taux 66 % ; score commun avec un club de 20 à 66 % : 66 %.

## F. Sensibilité du seuil commun (club de 4 avec club de 25, allure régulière, une semaine)

Part des rencontres où le score commun atteint le seuil, selon la réalisation moyenne μ des deux clubs.

| Seuil commun | μ = 0,5 | μ = 0,6 | μ = 0,7 | μ = 0,8 | μ = 0,9 |
|---:|---:|---:|---:|---:|---:|
| 50 % | 36 % | 66 % | 88 % | 97 % | 100 % |
| 60 % (retenu) | 9 % | 29 % | 58 % | 83 % | 95 % |
| 70 % | 1 % | 6 % | 22 % | 46 % | 72 % |
| 80 % | 0 % | 0 % | 2 % | 11 % | 28 % |

Avec le seuil retenu (60 %), selon l’allure et la durée :

| Allure | Semaines | μ = 0,5 | μ = 0,7 | μ = 0,9 |
|---|---:|---:|---:|---:|
| douce | 1 | 8 % | 39 % | 75 % |
| douce | 2 | 10 % | 50 % | 89 % |
| reguliere | 1 | 9 % | 58 % | 95 % |
| reguliere | 2 | 9 % | 72 % | 99 % |
| soutenue | 1 | 9 % | 74 % | 99 % |
| soutenue | 2 | 7 % | 84 % | 100 % |

Lecture : le plafond (personne ne compte au-delà de sa part) fait qu’un club à μ = 0,7 affiche environ 61 % en moyenne. Le seuil
retenu doit être atteint par la plupart des clubs qui tiennent l’essentiel de leur allure et rarement par des clubs à moitié : à 70 %, seule
une rencontre sur cinq réussirait à μ = 0,7 ; à 50 %, plus d’une sur trois réussirait à μ = 0,5. 60 % sépare « on l’a fait ensemble » de
« on n’y était pas » ; l’écart d’une allure ou d’une durée à l’autre vient du grain de la part (2 jours par semaine, c’est grossier).

## G. Rencontre comparative : le hasard ou les clubs ? (petit club contre club de 30)

Deux clubs équivalents (μ = 0,7 tous les deux), puis un petit club nettement meilleur (μ = 0,85) contre le club de 30 (μ = 0,65).

| Petit club | Semaines | Marge d’égalité | Équivalents : égalité | Meilleur club devant | Moins bon club devant |
|---:|---:|---:|---:|---:|---:|
| 4 | 1 | 0 pts | 0 % | 77 % | 23 % |
| 4 | 1 | 5 pts (retenue) | 19 % | 70 % | 16 % |
| 4 | 1 | 10 pts | 36 % | 62 % | 10 % |
| 4 | 2 | 0 pts | 0 % | 82 % | 18 % |
| 4 | 2 | 5 pts (retenue) | 21 % | 74 % | 11 % |
| 4 | 2 | 10 pts | 43 % | 64 % | 6 % |
| 8 | 2 | 0 pts | 0 % | 88 % | 12 % |
| 8 | 2 | 5 pts (retenue) | 29 % | 81 % | 5 % |
| 8 | 2 | 10 pts | 56 % | 67 % | 2 % |
| 15 | 2 | 0 pts | 0 % | 93 % | 7 % |
| 15 | 2 | 5 pts (retenue) | 35 % | 86 % | 2 % |
| 15 | 2 | 10 pts | 66 % | 70 % | 1 % |

Lecture : sur une semaine avec un club de 4, le classement de deux clubs dépend largement du hasard d’une petite équipe, même avec une
vraie différence de réalisation. Le score d’un club est juste en moyenne (A), mais une comparaison isolée est fragile : c’est la raison
pour laquelle la rencontre comparative reste fermée pendant le pilote, qui ne s’ouvre qu’en coopération. Si le pilote montre que les
membres comprennent leur score (mesure `private.titan_club_match_measure`), l’ouvrir sur deux semaines seulement (le serveur refuse une
rencontre comparative d’une semaine) et la proposer d’abord à des clubs d’au moins 8 participants (un mauvais vainqueur sur vingt).

