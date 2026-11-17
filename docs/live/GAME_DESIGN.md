# TITAN LIVE — game design

> Statut : **chantier isolé** sur la branche `claude/titan-rpg-multisport-larhou`, derrière le flag serveur
> `screens.live` (absent = désactivé). Aucune fusion dans `main` avant validation (voir [INTEGRATION.md](INTEGRATION.md)).
> Matrice exhaustive des 260 sports : [MATRICE_260_SPORTS.md](MATRICE_260_SPORTS.md) (générée depuis le moteur).

## 1. Promesse

> Lance TITAN **avant** ta séance, parce que ce qui va se passer dans la séance compte pour toi : ta Voie avance, une
> mission t'attend, le camp se rebâtit, l'histoire continue.

TITAN LIVE n'est pas un compteur de kilomètres déguisé. C'est un **moteur unique** qui fait vivre chaque séance selon la
façon dont le sport se pratique réellement : on ne joue pas au badminton comme on court, on ne grimpe pas comme on
soulève, on ne fait pas du yoga comme du HIIT. Il prolonge la promesse Ascension (« le sport réel est le produit ») et
n'en contredit aucune règle : effort normalisé, zéro pay-to-win, aucune pression, le serveur fait foi.

## 2. Les trois intentions

Choisies avant chaque séance, elles changent les missions, le ton du compagnon, les événements et la récompense
d'accomplissement, sans jamais changer **la valeur** de la séance.

| Intention | Ce qu'elle promet | Effets |
|---|---|---|
| **Atteindre** | Tenir le cap choisi, avec un accompagnement encourageant. | Missions de plan (séries, rounds, périodes, durée), jalons de l'objectif (moitié, cap tenu). |
| **Se dépasser** | Un léger progrès par rapport aux séances **comparables** du même sport. | Écho (sa propre séance comparable), seuil unique et contrôlé, médiane récente. Garde-fous : mis de côté si l'effort ressenti atteint 8, jamais à l'échec, jamais de vitesse sur route, aucun défi dans les pratiques à risque, une seule tentative proposée. |
| **Explorer** | Pratiquer librement, **sans aucun chiffre**. | Brouillard des lieux nouveaux, variantes, conditions nouvelles ; trouvailles plus fréquentes (40 % au lieu de 25 %). |

Les trois rapportent le **même** maximum d'éclats (test `fairness: the three intents are worth the same`).

### 2 bis. Ce que chaque intention change réellement (Opération Épopée, 19 novembre 2026)

Jusqu'ici l'intention filtrait surtout les missions. Elle change désormais **ce que l'écran montre et ce que le moteur
mesure**, sans changer la valeur de la séance ni la saisie sportive (`tests/live-intents.test.mjs`).

| | Atteindre | Se dépasser | Explorer |
|---|---|---|---|
| Avant | Le plan ou l'objectif est découpé en **étapes** (4 au plus), affichées avant de commencer. | **Un seul seuil**, tiré de la dernière séance réellement comparable, avec sa justification. Sans séance comparable : « TITAN observe », aucun seuil. | Ni objectif ni plan à régler. |
| Pendant | Les étapes se cochent ; le compagnon annonce chaque étape, une fois. Aucune comparaison. | Force : sous l'exercice saisi, « La dernière fois : 60 kg × 8 » et le seuil du jour (« 60 kg × 9, ou 62,5 kg, en gardant une répétition en réserve »). Endurance à pied, sur roues et sur rameur d'intérieur : un peu plus longtemps que la médiane récente (+5 %, 10 min au plus), **jamais plus vite**. | **Aucun chiffre** sur la vue aventure. Un carnet de découvertes : une à 8, 20, 35 et 50 min, plus une par **type** de nouveauté réelle (lieu, exercice, technique, condition). Les missions en cours n'affichent pas de compteur. |
| Garde-fous | — | Le seuil se compte une fois par exercice, exige de la réserve (RIR ≥ 1), ignore un saut de charge de plus de 10 %, se retire en récupération ou dès que l'effort ressenti atteint 8. Le seuil est mesuré, jamais déclaré ; une fois franchi, il le reste. Aucun seuil chiffré en collectif, raquettes, combat, escalade, montagne (l'heure de demi-tour prime), eau libre, natation, pratiques à risque ou sereines. | Les découvertes sont du texte : aucune valeur, aucune rareté, aucune récompense. |
| Après | « Plan tenu jusqu'au bout » ou « 2 étapes sur 4 franchies. Ce qui est fait reste fait. » | « Seuil franchi, avec de la réserve » ou « mis de côté quand il le fallait ». | Un récit sans un seul chiffre. |

- **Référence comparable** (`js/core/live-prepare.js`, partagé) : seulement les séances comptées par le serveur et
  plausibles (`TitanTraining.counted` / `plausible`), même discipline, dix dernières ; en force, la meilleure série de la
  **dernière** séance où l'exercice a été fait (jamais de 1RM estimé). La ligne « La dernière fois » est un fait sportif :
  elle s'affiche aussi en Atteindre, sans seuil.
- **Moments calmes** : entre deux efforts (repos de série, changement de côté, pause, repos de cloche), une ligne de la
  Voie s'affiche, à l'écran seulement : jamais de voix, jamais de notification, rien à toucher, rien en mode Silencieux
  ni pendant le jeu d'un sport en concentration totale. C'est là que l'aventure avance pendant que le corps récupère.
  Un point de raquette n'ouvre pas de moment calme (le jeu continue) ; la ligne disparaît dès que l'effort reprend.
- **Séance silencieuse** : étapes, seuil et découvertes ne s'affichent pas pendant l'effort, seulement dans le récit de
  fin. Le fait sportif « La dernière fois » reste visible sous l'exercice.
- **Match** : tant qu'aucune période n'est notée, le plan se mesure en temps de jeu réel (2 × 45 min = 90 min), jamais en
  battements de 15 minutes.
- **Récit de fin** (`TitanLiveEngine.recap`) : construit depuis ce qui s'est réellement passé (étapes, seuil,
  découvertes, événements, repos tenus, missions). C'est la seule chose qu'une séance silencieuse montre.
- **Voies sereines** (Sanctuaire : yoga, pilates, étirements, taï-chi, qi gong…) : immersion Silencieux par défaut,
  aucune référence, aucun Écho, aucun seuil.
- **Contrats sportifs** : les missions de rapport et les champs d'après-séance passent par
  `TitanSportContracts` ; 48 missions qui visaient une statistique qu'aucun formulaire ne demande plus ont disparu
  (gêne avant/après du yoga, dénivelé du patinage artistique, ateliers du triathlon). « Les relances » n'est plus
  proposée sur route (gravel) : elle était réservée au home trainer mais le filtre ne s'appliquait pas.
- **La boucle** : avant la séance, « Ce que cette séance fait avancer » (`TitanLiveWorld.stake`) ; au Camp, « Ce qui
  vient » (`TitanLiveWorld.horizon`) : le bâtiment le plus proche, la prochaine terre, le prochain chapitre. Formulé au
  conditionnel tant que le serveur n'a pas confirmé ; rien n'expire.

## 3. Le moteur commun

Un seul automate, pur et rejouable (`js/core/live-engine.js`), partagé à l'octet près par le Web et Android :
`step(état, entrée, maintenant) → {état, sorties}`. Aucune minuterie, aucune E/S, aucun hasard hors d'un hachage à
graine : mêmes entrées, même état. C'est ce qui permet la reprise après un plantage, des tests exhaustifs et la
re-vérification serveur.

- **Entrées** : start, pause, resume, tick, gps (totaux seulement), beat (série, essai, point, manche, période, volée,
  passage, segment…), rest_start, field (statistiques), feel (effort ressenti), accept / decline / declare, end.
- **Sorties** : cue (message du compagnon), event, mission_offer / active / done / set_aside / capped, interrupted.
- **Battement** : l'unité qui fait avancer la séance, propre à chaque Voie (borne, relais, amer, îlot, refuge, frappe,
  palier, essai, manche, période, round, cycle de souffle, volée, tableau, vague, tentative, lecture, tour, reprise,
  segment). Les battements « au temps » sont calculés en **minutes d'effort comptées** (courbe serveur : 90 pleines puis
  moitié), jamais en distance brute.
- **Cloche** : rounds de combat et intervalles sonnent seuls ; la pause gèle la cloche.
- **Journal** : à la fin, un résumé borné (< 2 Ko, sans texte libre) part dans `details.live` de la séance, par le
  chemin d'enregistrement existant (file hors ligne, `client_event_id` idempotent).

## 4. Les vingt Voies

Chaque Voie possède une **boucle de jeu** (avant / pendant / après), un battement, un panneau live, des missions qui
n'ont de sens que pour elle, des événements, un artefact persistant, un gardien et un mode dégradé.

| Voie | Sports | Le cœur de la boucle |
|---|---:|---|
| La Traversée | 19 | Bornes à l'effort, Écho de sa séance comparable, brouillard levé sur les lieux jamais traversés. |
| L'Expédition | 11 | Régions à relier, cols nommés au dénivelé, Route du messager pour le vélotaf ; zéro toucher en roulant. |
| Le Cabotage | 9 | Amers le long d'une côte, houle dessinée par la cadence, « garder des forces pour le retour ». |
| Les Profondeurs | 4 | Téléphone au bord, un toucher par bloc éclaire un îlot ; les nages colorent les fonds. |
| Les Hautes Routes | 6 | Refuges au dénivelé, **heure de demi-tour** comme première mission, carnet de cimes et renoncements sages. |
| La Forge | 15 | Une série = une frappe ; repos = braise qui refroidit ; frappe nette = 1 à 3 répétitions en réserve ; Arsenal trempé par la régularité. |
| L'Ascension du corps | 8 | Constellation des mouvements : chaque variante est une étoile ; le gainage se compte en souffles. |
| La Paroi | 6 | Essais entre les grimpes, chutes = prises révélées, projets suivis sur plusieurs séances. |
| La Joute | 12 | Tableau de score à deux zones, Élan du duel, remontées gravées ; sans score, manches de 10 min. |
| L'Escouade | 50 | Serment de rôle avant le match, périodes réelles du sport, rapport de 20 s, bannière partagée entre coéquipiers. |
| Le Dojo | 24 | Cloche, parchemins de technique remplis par la pratique ; le contrôle est célébré, jamais la puissance. |
| Le Sanctuaire | 6 | Silence par défaut, guide de souffle facultatif, terrasses restaurées, gêne avant/après. |
| La Cible | 13 | TITAN se tait pendant le tir ; une étoile par volée, la **régularité** forme des constellations. |
| La Scène | 19 | Répertoire d'enchaînements, de l'esquisse à la signature ; passage complet = représentation. |
| Le Brasier | 7 | Vagues repoussées à la cloche, repos = remparts ; une vague de plus seulement à qualité égale. |
| Le Stade | 6 | Tentatives et marques par épreuve, récupération complète exigée. |
| Les Éléments | 25 | Lecture des conditions avant, silence total pendant, Atlas des conditions après ; aucun défi de risque. |
| La Trajectoire | 6 | Constance des tours, briefing, aucun signal en piste. |
| Le Lien | 5 | Monture nommée, lien construit par la régularité ; séance calme = concours. |
| L'Odyssée | 9 | Segments enchaînés, transitions = portails, chaque segment nourrit l'essence de sa Voie. |

**Personnalisation par sport** : réglages réels (périodes de chaque sport collectif, cloche de chaque art martial, unité
de chaque sport de précision, points par jeu de chaque raquette, repos de la force), **missions de rapport** construites
depuis les statistiques réelles du catalogue (postes manqués en orientation, putts par trou au golf, points au filet en
padel, arrêts du gardien, séries d'approche en force…) et une **signature** de pratique. Les champs qui récompenseraient
le risque (hauteur, profondeur, vitesse, durée d'apnée, hauteur de vague) ne produisent jamais de mission.

## 5. Sécurité et classes d'interaction

| Classe | Sports | Règle |
|---|---:|---|
| Interactions libres | 79 | Toucher entre deux efforts ; toutes les immersions. |
| Coup d'œil | 39 | En mouvement : lecture seulement ; les choix attendent une pause. |
| Mains libres | 37 | Route, eau, montagne : aucune demande pendant l'effort, voix rare (≥ 5 min d'écart), immersion max Audio. |
| Concentration totale | 105 | TITAN se tait pendant l'effort ; missions choisies avant, validées après. |

Une liste stricte (`STRICT_SILENCE` : apnée, plongée, parachutisme, parapente, sports motorisés, ski alpin et freestyle,
kite, surf, canyoning, cascade de glace, alpinisme, saut d'obstacles…) force la concentration totale, quelle que soit la
Voie. Les sports sur route plafonnent en mains libres. Aucun texte ne contient d'incitation à accélérer, frapper plus fort
ou aller à l'échec (test dédié).

## 6. Le compagnon mental

Un moteur **à règles**, pas une IA générative : instantané, hors ligne, gratuit, explicable.

- **Chaque message porte son pourquoi** (« 50 % de l'objectif choisi avant la séance », « comparaison avec la médiane de
  tes séances comparables du même sport »), comme les repères d'Ascension.
- **Silences** : un seul message par pas ; écart minimal selon l'immersion (notifications 150 s, audio 210 s, aventure
  100 s) et selon la sécurité (jusqu'à 300 s ou silence total). Seuls les messages de priorité 3 (cap tenu, effort
  ressenti élevé) passent outre.
- **Moments clés détectés** : moitié du cap, cap tenu, au-delà de la médiane, Écho à hauteur ou en avance, fin de repos,
  hydratation à 45 min, effort ressenti élevé, séance de récupération, pause prolongée.
- **Récupération respectée** : séance marquée récupération = aucune mission de dépassement, ton calme.
- **Missions au bon moment** : phases start / warm / mid / late (part du cap ou du plan), au plus 3 offres, une à la fois,
  6 min d'écart, refus sans conséquence, aucune offre si l'effort ressenti atteint 8.
- **Niveaux d'immersion** : Silencieux (rien pendant, récit à la fin) · Notifications (une notification unique et
  remplaçable sur le canal silencieux, seulement hors de l'application) · Audio (voix courte en français, jamais
  par-dessus elle-même) · Aventure narrative (événements racontés). La sécurité ne fait que **baisser** ce niveau.
- **Vocabulaire interdit** : celui du test `no-pressure-mechanics` (dernière chance, série perdue, culpabilité, fausse
  urgence) s'applique aux nouveaux modules.

## 7. Le monde persistant

### Ressources (cosmétiques, jamais d'XP ni de crédits)

- **Essence** de la famille de la Voie (Souffle, Acier, Prisme, Ardeur, Sève : les familles du TITAN DNA) :
  **1 par minute d'effort comptée par le serveur, 90 par jour au total**, tous sports confondus. Une heure de yoga vaut
  une heure de vélo ; un ultra ne vaut pas plus que 90 minutes.
- **Éclats** (universels), **uniquement pour les deux premières séances du jour** (au-delà, seule l'essence compte) :
  10 de base, 5 par mission vérifiée (3 au plus, dont une seule déclarée), 10 d'accomplissement si au moins une mission (identique pour les trois intentions), 10 d'**harmonie**
  pour la première séance d'une famille dans la semaine, 3 pour une trouvaille déjà possédée. Plafond par séance : 48.

### Le Camp de base (QG interactif)

Six bâtiments, cinq niveaux (En ruine → Rayonnant → Légendaire) : Observatoire des souffles, Halle d'acier, Atelier du
prisme, Arène d'ardeur, Jardin de sève, Phare du camp. Coût 80 / 220 / 480 / 900 / 1 500, payé **d'abord avec l'essence
du bâtiment, puis avec les éclats** : la variété accélère, la spécialisation n'est jamais bloquée. Le camp d'un
haltérophile devient une citadelle d'acier, celui d'une yogi un jardin : **le QG reflète la pratique**.

### Les Marches et leurs gardiens

Une région par Voie, cinq terres révélées à 1, 4, 10, 20 et 35 séances live (deux comptées au plus par jour) ; son
gardien se présente à 40 séances **et** 24 jours actifs : la régularité, pas le volume.

### Les Chroniques de la Cordée

Un arc commun de dix chapitres (le camp sous la neige → le nœud du Titan) débloqué par un score = jours actifs + 2 ×
(Voies distinctes − 1), paliers 1, 4, 10, 18, 28, 40, 55, 75, 100, 130 (environ un an à trois jours actifs par semaine) :
**atteignable par la seule régularité**, accéléré par la variété. Chaque Voie a son propre arc de
cinq fragments, révélé avec ses terres. Le récit relie TITAN LIVE aux quatre mondes existants (Aube, Marées, Forges
d'Obsidienne, Aurores) sans les modifier.

### Trouvailles

Six objets par Voie (dont deux rares), tirés **du même hachage FNV-1a** côté client et serveur à partir du
`client_event_id` : impossible de « relancer » une trouvaille, et le doublon rapporte 3 éclats.

## 8. Expériences collectives

> **20 novembre 2026 — La Grande Cordée est opérationnelle** (derrière `screens.cordee`), réglée par le serveur
> (`20261120110000_grande_cordee.sql`) et décrite dans [`../SOCIAL_EXCELLENCE.md`](../SOCIAL_EXCELLENCE.md) § C. Écart assumé avec
> le point 1 ci-dessous : les trois familles ne sont **pas** une condition du sommet (deux amis coureurs n'auraient jamais pu
> réussir) ; chaque famille au-delà de la première ouvre 2 longueurs. Le compteur n'est pas en minutes brutes mais en
> **longueurs** (1 à 12 min d'effort compté dans la journée, 2 à 35 min), avec une part plafonnée à 1,5 × la part de chacun.
> Les points 2 à 5 restent à brancher.

Principes : équitables entre sports (minutes d'effort comptées, plafond 90/jour), aucun classement brut, jeu solo jamais
pénalisé, opt-in explicite.

1. **La Grande Cordée** (expédition coopérative multisport) : objectif commun en minutes d'effort, chaque membre
   contribue avec sa Voie ; la cordée ne réussit que si au moins trois familles différentes y ont contribué, ce qui
   rend chaque profil indispensable. Réutilise le modèle d'expédition existant (`daily_cap`, inscription explicite).
2. **Bannière d'escouade** : coéquipiers TITAN qui notent le même match (code de match partagé) ; même récompense pour
   tous, sans comparaison de statistiques.
3. **Écho d'ami** : avec consentement, l'Écho d'une séance comparable d'un ami (même sport, durée proche) sur la carte
   d'aventure ; on compare des progressions relatives à soi, jamais des valeurs brutes.
4. **Gardien collectif hebdomadaire** : barre de résolution en minutes d'effort, contribution plafonnée par personne et
   par jour, réservée aux séances postérieures à l'inscription ; récompense identique pour tous les participants.
5. **Défis de progression entre amis** : chacun contre sa propre médiane (« + une séance tenue », « + un seuil
   comparable ») ; c'est le pourcentage de son propre progrès qui compte, borné, jamais le volume.

## 9. Interfaces

- **Préparation** : Voie et signature, intention, objectif facultatif, plan (−/+), immersion (plafonnée et expliquée),
  missions (jusqu'à 2), récupération, projet (escalade), mode dégradé annoncé.
- **Séance** : bascule **Vue sportive / Vue aventure** ; chrono géant ; jauge de cap ; panneau de la Voie ; message du
  compagnon avec son pourquoi ; mission proposée (accepter / pas aujourd'hui) ; missions en cours ; effort ressenti.
- **Vue aventure** : un sentier en lignes de niveau (le motif graphique de TITAN) dont les nœuds s'allument au rythme
  de l'effort normalisé, Écho en pointillés, Élan du jour sur 90.
- **Rapport** : effort ressenti, statistiques des missions de rapport, missions déclarées à confirmer, puis formulaire
  habituel prérempli. Résultat : carte de règlement serveur sur l'écran de résultat.
- **Camp de base** : ressources, bâtiments, Cordée, Marches, trouvailles.

Identité visuelle : tokens Ascension (fonds bleu nuit, cyan pour l'action et la progression, ambre réservé aux
trouvailles rares et aux gardiens), Archivo/Manrope, lignes de niveau, aucune illustration générique. Emplacements
réservés pour les futurs assets : [ASSETS.md](ASSETS.md).

## 10. Équilibrage et équité

Simulation reproductible : `node tools/simulate-live.mjs [semaines]` (règle de règlement exacte, courbe d'effort
serveur), figée par `tests/live-balance.test.mjs`. Sur 12 semaines :

| Profil | Minutes | Ressources | Par heure | Niveaux du Camp | Cordée |
|---|---:|---:|---:|---:|---:|
| Coureuse 3 × 50 min | 1 800 | 2 916 | 97 | 11 | 5/10 |
| Musculation 3 × 60 min | 2 040 | 3 432 | 101 | 12 | 5/10 |
| Yogi 4 × 40 min | 1 800 | 2 916 | 97 | 12 | 6/10 |
| Footballeur 2 × 90 min | 2 160 | 2 880 | 80 | 10 | 4/10 |
| Polyvalente 4 sports | 2 160 | 3 948 | 110 | 15 | 6/10 |
| Ultra-traileur 300 + 2 × 45 min | 4 680 | 3 180 | 41 | 10 | 5/10 |
| Débutante 2 × 25 min | 600 | 1 092 | 109 | 7 | 4/10 |

Après un an, chaque profil a encore des niveaux à bâtir (20 à 26 sur 30) ; la Cordée se termine vers un an de
régularité.


- Même effort, même essence dans **les 260 sports** (test sur tout le catalogue).
- Les sports longs ne gagnent rien au-delà de 90 minutes comptées par jour ; les sports faciles à saisir ne gagnent rien
  de plus (la valeur vient de l'effort serveur, pas du nombre de touchers).
- Les missions rapportent un forfait, au plus trois par séance, dont une déclarée.
- Les intentions valent la même chose ; explorer augmente seulement la probabilité de trouvaille.
- La progression des Marches et de la Cordée suit la **régularité** (séances plafonnées par jour, jours actifs).
- Aucune de ces ressources n'achète quoi que ce soit hors du Camp ; l'Atelier, l'XP, les crédits et TITAN+ sont intacts.

## 11. Anti-triche

Le client ne décide de rien. `titan_live_settle_v1` :

- lit la séance **stockée** (par `client_event_id`, propriétaire = `auth.uid()`), jamais un paramètre client ;
- n'accepte que les séances au statut `valid` (liste blanche), non historiques, non suspectes, non archivées et
  récompensées par le serveur ; diffère les séances
  retenues (`titan_reward_holds` « held ») ; ignore celles de plus de 3 jours ;
- détermine la Voie depuis le sport (table seedée), pas depuis le journal ;
- calcule l'essence depuis `details.effort.effort_minutes` (serveur) et le plafond journalier ; ne donne d'éclats qu'aux
  deux premières séances du jour ; refuse tout nombre non fini (NaN, ±Infinity) ;
- compare le journal à la durée **tamponnée par le serveur** à l'envoi (`details.effort.minutes`), jamais à un champ
  modifiable par le client ;
- ne retient que les missions de la bonne Voie, connues de la table seedée, dans la limite de trois et d'une seule
  déclarée ; vérifie les missions de rapport dans `details.extras` et les missions de journal contre la durée, la
  distance et le dénivelé stockés ; ignore toutes les missions d'un journal invraisemblable (temps actif > durée × 1,1 +
  2 min, battements > 4 par minute) ;
- est idempotent (une ligne par séance, clé primaire = `log_id`) et sérialisé par compte (`for update`) ;
- refuse les comptes suspendus et respecte le flag.

## 12. Hors ligne, batterie, arrière-plan, reprise (Android)

- L'état live est écrit par compte toutes les 10 s et à chaque action ; une séance fermée, redémarrée ou interrompue
  est retrouvée ; l'athlète choisit « j'étais à l'arrêt » (le trou est retiré) ou « je continuais ».
- Les sports GPS réutilisent l'enregistreur en service de premier plan (déjà durci) ; l'écran peut être verrouillé.
- Une seule minuterie d'interface à 1 s, uniquement pendant l'effort et au premier plan ; aucun capteur
  supplémentaire. Les autres sports n'utilisent ni GPS ni capteur.
- Le règlement attend la confirmation serveur ; il est rejoué depuis une file par compte au démarrage et à l'ouverture
  du Camp.

## 13. Ce qui n'est jamais simulé

Aucune fréquence cardiaque, puissance ou cadence n'est inventée : elles ne viennent que d'une déclaration ou d'un import
après séance. Sans GPS, la carte réelle reste vide et la carte d'aventure avance à l'effort. Le brouillard ne compte que
des positions réellement enregistrées. Le podomètre n'est pas utilisé pendant la séance.
