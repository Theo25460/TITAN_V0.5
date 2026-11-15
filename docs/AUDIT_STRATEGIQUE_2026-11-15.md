# TITAN — Audit stratégique : ce qu'il manque pour jouer dans la cour de Strava

*15 novembre 2026. Rédigé avec le regard d'un directeur de la stratégie qui n'a rien à perdre à dire les choses franchement.*

---

## 0. Le verdict en une page

**TITAN est une forteresse construite au milieu d'un désert.**

Le dépôt contient 116 migrations Supabase, 115 suites de tests SQL, 75 suites de tests mobiles, un anti-triche serveur, des retenues de récompenses, une file de modération, des recours, des limites de débit, une rotation de secrets, une politique publicitaire testée sous concurrence et environ 200 documents de passation dans `docs/`. C'est le niveau de rigueur d'une entreprise de 40 ingénieurs avec des millions d'utilisateurs.

En face, d'après le code et `V11_STATUT_REEL_2026-11-03.md` :

- TITAN+ et les offres Coach **ne sont pas en vente** ;
- **aucun compte Garmin n'a jamais été relié** ;
- l'application existe **uniquement sur Android** ;
- je n'ai trouvé **aucune donnée de traction** (utilisateurs actifs, rétention) dans le dépôt, et rien n'indique qu'on la mesure.

Le problème de TITAN n'est pas qu'il manque des fonctionnalités face à Strava. Le problème, c'est que **TITAN n'a pas encore fait de pari**. Il est en même temps un journal de 260 sports, un RPG avec quatre mondes et des gardiens, un outil de coaching, un réseau social avec guildes, clubs, factions et panthéon, un podomètre, un GPS et une boutique cosmétique. Strava a gagné en étant d'abord une seule chose : le segment de vélo.

**Ma recommandation tient en une phrase :**

> **Strava est l'app de ceux qui performent. TITAN doit devenir l'app de ceux qui reviennent, et la maison des sportifs hybrides.**

Concrètement :
1. **Ne pas combattre Strava sur le GPS.** C'est perdu d'avance. Il faut se placer *au-dessus* : TITAN agrège tout (Strava, Garmin, Health Connect, Apple Santé, Hevy…) et donne un sens multisport à l'ensemble.
2. **Viser un premier marché précis : l'athlète hybride** (Hyrox, CrossFit, course plus musculation, escalade plus trail). Strava est faible en musculation, Hevy et Strong sont aveugles à l'endurance. TITAN est le seul à avoir une monnaie d'effort commune à tous les sports.
3. **Faire du coach le canal de distribution.** Chaque coach ou salle apporte 5 à 200 sportifs. C'est le seul effet de réseau atteignable sans budget marketing.
4. **Sortir iOS dans les 90 jours.** Sans iOS, on ne joue dans aucune cour.
5. **Arrêter de construire de l'infrastructure et commencer à mesurer la rétention.** Cet audit devrait être le dernier avant 1 000 utilisateurs actifs.

---

## 1. Ce que j'ai regardé (et ce que je n'ai pas pu voir)

**Lu :** README, `docs/ASCENSION_300.md` (conception produit), `V12_CHANTIERS_RESTANTS`, `V11_STATUT_REEL`, `V11_MONETIZATION_REVIEW`, `PLAY_CONSOLE_SUBSCRIPTIONS`, `GARMIN.md`, `V13_WORLD_BIBLE.md`, `ANALYTICS_EVENTS_V300.md`, la page `titan-plus.html`, l'arborescence et les dépendances de l'app Expo (`mobile/`), les écrans Communauté, les migrations routes et imports, l'historique Git récent.

**Pas vu :** la base de production, les chiffres d'audience, les retours d'utilisateurs, la Play Console, les revenus. **Toute affirmation sur la traction est donc une déduction tirée du dépôt, pas une mesure.** Si vous avez des chiffres qui me contredisent, ce sont eux qui priment.

---

## 2. Diagnostic sans filtre

### 2.1 Ce que TITAN a de réellement précieux

| Atout | Pourquoi c'est rare | Qui peut le copier ? |
|---|---|---|
| **L'effort normalisé** (`minutes comptées × intensité RPE × 10`), identique pour 260 sports | C'est la seule appli où 45 min de muscu, 1 h d'escalade et un 10 km valent dans la même monnaie. Strava mesure des km, Hevy des kilos. | Facile à copier techniquement. Difficile à copier *culturellement* pour Strava, dont l'identité est la performance mesurée. |
| **La cadence au lieu de la série (streak)** : semaines tenues, pause déclarée, retour valorisé | C'est psychologiquement beaucoup plus juste que la série de Duolingo, qui culpabilise. C'est exactement ce dont ont besoin les 80 % de gens qui abandonnent le sport. | Copiable, mais personne ne l'a fait proprement. |
| **Des familles de saisie sérieuses** : force (séries, charge, RIR), escalade (cotations, essais), endurance, poids du corps | Strava est mauvais en musculation et en escalade. | Strava finira par s'y mettre ; il faut prendre de l'avance. |
| **Zéro pay-to-win, vie privée par défaut, anti-triche serveur** | C'est un vrai argument de confiance… à condition de ne pas le contredire (voir §2.3). | Peu d'acteurs s'en soucient. |
| **Un vrai espace coach** (espace à deux, périmètre, propositions, places) | C'est le germe d'un modèle B2B2C. | TrainingPeaks et Hexfit l'ont fait, mais pas en multisport grand public. |
| **Une culture de qualité extrême** | Le jour où il y aura du trafic, la base tiendra. | — |

### 2.2 Ce qui manque pour jouer dans la cour des géants

| Domaine | Strava, Garmin, Apple | TITAN aujourd'hui | Gravité |
|---|---|---|---|
| **Plateformes** | iOS, Android, Web, Apple Watch, Wear OS, Garmin Connect IQ | Android (Expo), web en HTML/JS sans framework. **Pas d'iOS, pas de montre.** | 🔴 Bloquant |
| **Cartes** | Carte de chaque activité, heatmaps, itinéraires | **Aucune bibliothèque de carte** dans `mobile/package.json`. Le GPS enregistre une trace qu'on ne voit pas sur une carte. | 🔴 |
| **Sources de données** | Synchronisation automatique avec plus de 100 appareils | Health Connect (prouvé une fois en production), Garmin (code prêt, **jamais relié en réel**, accès programme incertain), import GPX | 🔴 |
| **Graphe social** | Abonnement en un clic, fil d'activités, kudos, commentaires, photos | Ajout d'amis par **code `TN-XXXX` à recopier à la main**, « Moments » partagés volontairement, encouragements | 🔴 C'est le cœur du moat de Strava |
| **Découverte et compétition** | Segments, classements, Local Legends, défis de marques | Défis entre amis sans mise, expéditions, guildes. **Pas de compétition locale ni de classement public.** | 🟠 |
| **Sécurité** | Beacon (partage de position en direct), masquage du point de départ | Itinéraires strictement privés, aucun partage | 🟠 Très fort argument auprès des coureuses |
| **Analyse d'entraînement** | Fitness et fraîcheur (CTL/ATL), zones cardio, puissance, prédictions | Repères déterministes, records, récap, comparaisons de périodes réservées à TITAN+ | 🟠 |
| **Plans et coaching IA** | Plans d'entraînement (Strava a racheté Runna en 2025), Athlete Intelligence | Routines, objectifs. **Aucun plan adaptatif, aucune IA.** | 🟠 C'est la bataille de 2026-2027 |
| **Langues** | Plus de 15 langues | **Français uniquement** (`lang="fr"`, textes en dur) | 🟠 Plafond de verre |
| **Bilan annuel partageable** | Year in Sport, l'équivalent du Spotify Wrapped | Récap hebdo et carte publique avec QR | 🟡 Opportunité immédiate (voir §8) |
| **API ouverte** | Écosystème de milliers d'apps tierces | Aucune API publique | 🟡 Plus tard |

### 2.3 Les incohérences qui détruisent la confiance

1. **La publicité.** La FAQ de `titan-plus.html` affirme : *« Y a-t-il de la publicité ? Non, ni dans l'offre gratuite ni dans TITAN+. »* Or l'app Android embarque AdMob (`react-native-google-mobile-ads`), trois bannières (QG, Journal, Stats) et des interstitiels après séance, et le build `1200` est compilé avec `ads=live`. **Le jour où un utilisateur s'en aperçoit, tout le discours « confiance et vie privée » s'effondre.** Avec quelques centaines d'utilisateurs, la publicité rapporterait quelques euros par mois. **Il faut la supprimer.** (Détail en §7.)
2. **« Vie privée par défaut » contre croissance.** Le privé par défaut est un bon principe, mais aujourd'hui *rien* n'est conçu pour circuler : pas de lien d'invitation en un clic, pas de fil, pas de découverte. On peut protéger les données ET rendre le produit contagieux (voir §6).
3. **Le RPG sert-il le sport, ou l'inverse ?** Le document Ascension dit que « le sport réel est le produit », mais la bible du monde (passeurs, balises, gardiens, quatre régions, 18 rencontres) est développée en profondeur. Un trentenaire qui prépare un Hyrox voit « La vallée de l'Aube, Le Veilleur de pierre » et se demande s'il est dans un jeu pour enfants. Un joueur, lui, trouvera le jeu trop mince (des textes et des jauges, sans vrai *gameplay*). **Aujourd'hui, l'aventure risque de ne satisfaire ni l'un ni l'autre.**

### 2.4 Le problème organisationnel (le plus important)

L'historique montre un fondateur seul, épaulé par plusieurs agents IA, qui produisent **des passations, des audits « finaux » et des revues** : `AUDIT_FINAL_TITAN.md`, `FINAL_RELEASE_AUDIT_V87.md`, `V88`, `FIN_AUDITS_2026-11-02.md`, `FINAL_WEB_REPORT`, `V11_FINALIZATION_REPORT`, `V12_FINALISATION`, `V131_RELEASE_DOSSIER`…

C'est un symptôme classique : **la rigueur remplace le risque.** On polit le système de recours avant d'avoir quelqu'un qui fait appel. On teste la concurrence de deux résultats publicitaires simultanés avant d'avoir un seul annonceur. On écrit une bible du monde avant de savoir si les gens reviennent la deuxième semaine.

Pendant ce temps, le signal le plus important de la production est un incident : **environ 1 conflit `PROFILE_VERSION_CONFLICT` par seconde, jour et nuit**, causé par des onglets restés ouverts. Une poignée de clients suffit à générer 3 560 erreurs par heure. Ça veut dire que l'architecture de synchronisation (état dans `localStorage` poussé vers `profiles.game_state`) est fragile, et que le trafic réel est probablement faible.

**Le prochain mois doit être consacré aux utilisateurs, pas au code.**

---

## 3. Comment Strava a gagné, et où il est vulnérable

### 3.1 Les douves de Strava

1. **Le graphe social de l'effort** : « si ce n'est pas sur Strava, ça n'a pas eu lieu ». Les kudos sont une drogue douce.
2. **Les segments** : une compétition asynchrone et locale, avec des millions de classements créés par les utilisateurs. C'est le véritable coup de génie de Strava.
3. **La neutralité des appareils** : il marche avec toutes les montres, ce qui en fait le hub par défaut.
4. **Les données agrégées** : la heatmap mondiale, les itinéraires populaires, Metro (données vendues aux villes).
5. **L'identité** : le profil Strava est un CV sportif.

### 3.2 Ses failles (c'est là qu'il faut attaquer)

| Faille | Opportunité TITAN |
|---|---|
| **Il est centré sur le GPS.** La musculation, le yoga, l'escalade, les sports collectifs y sont des citoyens de seconde zone. | Le multisport réel, avec l'effort normalisé comme monnaie unique. |
| **Il est centré sur la performance.** Les débutants et les sportifs irréguliers s'y sentent jugés ; on y compare des allures. | La cadence, la maîtrise par la pratique (pas par la performance), le retour après pause valorisé. |
| **Son abonnement est cher** (autour de 12 €/mois) et sa valeur est floue pour un pratiquant moyen. | Un TITAN+ moins cher avec une promesse claire. |
| **Sa vie privée a connu des scandales** (la heatmap qui révélait des bases militaires en 2018, le harcèlement de coureuses). | La confiance comme argument marketing, à condition d'être irréprochable. |
| **Il n'a pas de vraie couche de jeu** (badges de défi seulement). | La progression longue (rang, maîtrise, collection) qui donne une raison de revenir *sans* devoir battre un record. |
| **Son coaching est mono-sport** (Runna, c'est la course). | Le coaching hybride : un plan qui combine course, musculation et récupération. |

---

## 4. Le positionnement recommandé

### 4.1 La phrase

> **TITAN — Tous tes sports. Une seule progression.**
> L'app qui transforme *chaque* effort, de la salle à la montagne, en une progression qui ne te juge jamais.

### 4.2 Le premier marché : l'athlète hybride francophone

Pourquoi ce segment en premier :
- **Hyrox** est le phénomène de croissance du sport amateur depuis 2024 : courses complètes en quelques minutes, salles affiliées partout en France. Ces gens courent ET soulèvent, et **aucune app ne gère bien les deux.**
- Les box de **CrossFit**, les salles de **fonctionnel**, les **salles d'escalade** (forte croissance en France) sont des communautés physiques avec des coachs. Ce sont des canaux de distribution tout faits.
- C'est un public qui paye (abonnement en salle de 50 à 150 €/mois), qui partage (Instagram), qui suit des plans.
- Le moteur de TITAN est déjà adapté : familles force, endurance, poids du corps et escalade.

**Le second cercle**, une fois ce premier marché gagné : « ceux qui reviennent ». Les sportifs irréguliers, les reprises après blessure, les parents, les plus de 40 ans. C'est le marché le plus vaste, le plus mal servi, et c'est celui où la cadence fait la différence.

### 4.3 Ce que TITAN n'est PAS (aussi important)

- **Pas un concurrent GPS de Strava.** On importe les données de Strava, on ne les remplace pas.
- **Pas un jeu vidéo.** La couche d'aventure est un amplificateur, pas un produit.
- **Pas un réseau social généraliste.** Le social passe par de petits cercles : duo, guilde, club, coach.

---

## 5. Les sept douves pour rendre TITAN irremplaçable

Un produit est *indispensable* quand on l'ouvre tous les jours. Il est *irremplaçable* quand le quitter coûte trop cher. Voici comment obtenir les deux.

### Douve 1 — Devenir la source unique de vérité de la vie sportive (coût de changement)

**Idée :** si *tout* l'historique sportif d'une personne (Strava, Garmin, Apple Santé, Hevy, ses carnets) se retrouve dans TITAN, consolidé, dédoublonné et normalisé, elle ne partira plus. Personne d'autre ne détiendra ce tableau complet.

**Actions :**
- **Import de l'archive Strava** (le fichier ZIP que chaque utilisateur peut télécharger dans ses réglages Strava : GPX, FIT et CSV). C'est légal (portabilité RGPD), sans dépendance à l'API Strava, et c'est **le hack d'acquisition n°1** : « Importe tes 5 ans de Strava, découvre ton ADN sportif complet en 30 secondes ».
- **Import CSV de Hevy et Strong** pour la musculation.
- **Apple Santé (HealthKit)** dès la sortie iOS.
- **Un agrégateur payant** (Terra, Rook, Spike ou équivalent) plutôt que de négocier une par une avec Garmin, Polar, Suunto, Coros, Wahoo et Oura. On paie par utilisateur connecté, on obtient plus de 30 sources en quelques semaines. Pour une équipe d'une personne, **acheter vaut mieux que construire.**
- Le dédoublonnage multi-source existe déjà côté serveur : c'est un actif à valoriser.

### Douve 2 — L'effort normalisé comme standard (effet de référentiel)

**Idée :** faire de l'« effort TITAN » (le nombre de minutes pondérées) une unité que les gens citent, comme on cite son Elo aux échecs ou ses km sur Strava. « J'ai fait 1 200 points d'effort cette semaine. »

**Actions :**
- Lui donner un nom court et une identité visuelle (par exemple les « Ti » ou une « Charge TITAN »).
- **Des ligues hebdomadaires à la Duolingo**, par groupes de 30 personnes de niveau de cadence comparable, classées à l'effort normalisé. C'est équitable entre sports, donc inédit. La migration `fair_ranking` existe déjà.
- Publier chaque trimestre un **« Baromètre de l'effort en France »** (données agrégées et anonymisées : sports qui montent, horaires, régions). C'est du contenu presse gratuit, et ça positionne TITAN comme l'institut de référence du multisport.

### Douve 3 — Le système d'exploitation du coach (verrouillage B2B2C)

**Idée :** un coach qui gère ses 15 sportifs dans TITAN ne change pas d'outil. Ses sportifs non plus, puisque leur coach y est. **Chaque coach acquis apporte 5 à 200 utilisateurs.** C'est le seul effet de réseau réaliste pour TITAN.

**Actions :**
- Un **tableau de bord coach sur le web** (la place naturelle du web, voir §9) : vue d'ensemble de l'équipe, alertes de charge, sportifs qui décrochent (la cadence chute), programmation de séances qui apparaissent dans l'app du sportif.
- **La programmation hybride** : le coach écrit une semaine « mardi fractionné, jeudi force, samedi Hyrox simulé » et le sportif la voit dans son QG.
- **Une offre Club / Salle** (voir §7) avec sa page de club, son classement interne et ses défis.
- Démarcher **10 box CrossFit et Hyrox et 10 salles d'escalade** à la main, d'abord dans votre ville, puis à Lyon et Paris. Pas de publicité : du porte-à-porte. Leur offrir 6 mois.

### Douve 4 — L'identité accumulée (coût affectif)

**Idée :** le rang, la maîtrise par discipline, la collection, l'ADN, les semaines tenues à vie. Plus on les accumule, plus partir revient à abandonner une partie de soi. C'est la logique du profil Steam ou du niveau Duolingo.

**Actions :**
- **Le passeport TITAN** : une page publique élégante (elle existe : la carte publique avec QR), pensée comme un CV sportif à mettre en lien dans sa bio Instagram.
- **Des jalons de vie** (« 100 semaines tenues », « 5 sports en maîtrise 3 ») qui deviennent des cartes à partager.
- Ne **jamais** remettre à zéro. C'est déjà la règle : c'est un actif.

### Douve 5 — Les petits cercles (effet de réseau local)

**Idée :** Strava, c'est la place publique. TITAN, ce sont les vestiaires. Le duo, la guilde, le club, le coach.

**Actions :**
- **Remplacer le code `TN-XXXX` par un lien d'invitation** (« Théo t'invite à rejoindre sa guilde »), qui ouvre l'app ou le Play Store / l'App Store avec un lien différé. C'est le changement le plus rentable de tout ce rapport.
- **Un fil d'activité privé** limité aux cercles, avec encouragements et commentaires courts.
- **Le duo** existe déjà (`DuoCard`) : en faire la porte d'entrée. « Fais ton sport à deux, même à distance. » Un couple, deux amis, un parent et son ado.

### Douve 6 — Le coach IA multisport (valeur premium quotidienne)

**Idée :** c'est la bataille de 2026-2027. Strava a Athlete Intelligence et Runna, Garmin a ses suggestions quotidiennes, Whoop a son coach. **Aucun d'eux ne raisonne en multisport.** TITAN détient exactement les données qu'il faut : toutes les familles de sport, le RPE, la cadence, les pauses.

**Actions :**
- **Un débrief après chaque séance** en deux phrases, contextualisé (« Ta 3e séance de force cette semaine : ta course de jeudi sera plus lourde, garde-la facile »).
- **Un plan de semaine adaptatif** qui se recompose si on rate une séance, sans culpabiliser (c'est l'ADN de la cadence).
- **Une question libre** : « Je prépare un Hyrox dans 8 semaines, je fais 2 séances de force par semaine, que dois-je changer ? »
- Garder la philosophie actuelle des repères : chaque conseil cite sa source et son pourquoi. C'est un excellent garde-fou contre les hallucinations, et un vrai différenciateur de confiance.
- C'est **le** produit qui justifie TITAN+ (voir §7).

### Douve 7 — La confiance comme marque

**Idée :** dans un marché où les apps de fitness revendent des données ou bombardent de publicités, être l'app « propre » est une position défendable.

**Actions :**
- Supprimer la publicité (sans négociation possible).
- Une page « Ce que nous faisons de tes données » d'une page, lisible, avec un engagement public.
- Héberger les données en Europe et le dire. Vérifier la région Supabase.
- Masquer automatiquement les zones de départ et d'arrivée le jour où les itinéraires deviennent partageables.

---

## 6. La boucle produit : rendre TITAN indispensable au quotidien

La boucle d'Ascension est juste (« je prévois → je bouge → j'enregistre → je comprends → je progresse → le monde réagit → je reviens »). Ce qui manque, ce sont **les déclencheurs** et **la récompense sociale**.

| Moment | Aujourd'hui | Ce qu'il faut |
|---|---|---|
| **Le matin** | Rien, sauf si l'utilisateur ouvre l'app | Une notification intelligente et rare : « Ta semaine : 2/3. Une séance courte aujourd'hui suffit. » Pas plus d'une par jour. |
| **Pendant l'effort** | Chrono, GPS natif | Le mode séance de musculation avec minuteur de repos (le `restTimer` existe), suggestion de charge basée sur la dernière fois |
| **Après l'effort** | Moment de résultat, récompenses | **L'enregistrement sans effort** : la séance arrive toute seule depuis la montre ou Health Connect, et l'utilisateur n'a qu'à ajouter son ressenti (RPE) en un geste. Plus le débrief IA. |
| **Le soir** | — | Le cercle réagit (encouragements de la guilde ou du duo) |
| **Le dimanche** | Récap hebdo | **Le récap devient un rituel** : une carte au format story Instagram, générée automatiquement, avec la semaine en un coup d'œil. C'est le moteur de viralité gratuit. |
| **Le 1er du mois** | — | Le bilan mensuel (pour TITAN+), et la ligue qui se termine (promotion ou maintien) |
| **En décembre** | — | **TITAN Rétro**, le bilan de l'année (voir §8) |

**La règle d'or :** saisir une séance doit prendre moins de 10 secondes, ou zéro seconde quand elle vient d'un appareil. Chaque champ en trop fait perdre des utilisateurs.

---

## 7. Monétisation : tout revoir

### 7.1 Supprimer la publicité

- **Revenus attendus :** avec 1 000 utilisateurs actifs et les plafonds actuels (première annonce après cinq séances, deux par jour au maximum), on parle de **quelques euros par mois**.
- **Coût :** la contradiction avec la promesse publique, la dégradation de l'expérience juste après l'effort, qui est le moment émotionnel le plus fort, une charge de conformité (UMP, consentement, politiques Play) et un argument de vente de TITAN+ (« sans pub ») qui pousse à rendre le gratuit pénible.
- **Décision recommandée :** retirer AdMob complètement. Le travail de la revue de monétisation n'est pas perdu : il a montré une vraie maturité. Mais c'est un coût irrécupérable.

### 7.2 Repenser TITAN+

**Aujourd'hui :** TITAN+ à 4,99 €/mois débloque des comparaisons de périodes, des bilans mensuels et annuels, des vues sauvegardées, plus de 5 routines, la capacité coach et des cosmétiques. **C'est une offre de tableur.** Personne ne paie pour comparer 12 semaines à 12 autres.

**Proposition :**

| Offre | Prix | Contenu | Rôle |
|---|---|---|---|
| **Gratuit** | 0 € | Journal illimité, tous les sports, imports, rang, maîtrise, cadence, aventure, duo, guilde, récap hebdo | Le produit doit être *excellent* gratuitement. C'est le moteur d'acquisition. |
| **TITAN+** | **5,99 €/mois ou 44,99 €/an** | **Coach IA multisport** (débriefs, plan adaptatif, questions), analyse de charge et de fraîcheur, bilans, TITAN Rétro enrichi, toutes les sources d'appareils | Payer pour être *accompagné*, pas pour lire des graphiques |
| **TITAN+ Duo** | **8,99 €/mois** | TITAN+ pour deux comptes | Le duo existe déjà ; c'est le plan famille. |
| **Coach** | **Gratuit jusqu'à 3 sportifs**, puis environ **2 €/sportif/mois** | Tableau de bord web, programmation, alertes, TITAN+ offert aux sportifs suivis | La facturation par sportif s'aligne sur le revenu du coach (qui facture 50 à 150 € par sportif). Les paliers fixes à 5 ou 15 sportifs bloquent la croissance. |
| **Club / Salle** | **49 à 149 €/mois** | Page de club, classement et ligues internes, défis de salle, statistiques de fréquentation, marque blanche légère | Les box et salles d'escalade paient déjà des logiciels de réservation (Resamania, Wodify…). TITAN s'y ajoute comme couche d'engagement des adhérents. |

**Le levier caché :** les sportifs d'un coach ou d'un club reçoivent TITAN+. Le coach devient ainsi le vendeur de TITAN+. C'est déjà prévu dans les offres Coach actuelles ; il faut en faire le cœur du modèle.

### 7.3 Les revenus que Strava n'a pas

- **Les défis de marque** (une marque d'équipement ou de nutrition sponsorise une expédition, avec récompense cosmétique et code promo) : c'est compatible avec le « zéro pay-to-win » et ça monétise sans publicité intrusive.
- **Le baromètre de l'effort** vendu aux fédérations, aux collectivités ou aux mutuelles, sous forme agrégée et anonymisée, en B2B. À manier avec beaucoup de précaution et seulement après avoir établi la confiance. Je le place ici parce que c'est le modèle Strava Metro.
- **Les mutuelles et la prévention santé** : en France, des mutuelles financent déjà des programmes d'activité physique. Une offre « TITAN pour les adhérents » est un canal B2B2C massif. C'est à moyen terme.

---

## 8. Acquisition : le playbook sans budget

### 8.1 L'opération immédiate : TITAN Rétro 2026 (début décembre)

Nous sommes le 15 novembre. **Le bilan de l'année est le moment le plus viral du calendrier sportif** (Strava Year in Sport, Spotify Wrapped). C'est le cas d'usage parfait pour l'import d'archive Strava.

> « Importe ton année Strava (ou ton Health Connect). TITAN te révèle ton ADN sportif 2026 : tes sports, tes heures d'effort réelles, ton rang, ta semaine la plus folle. Partage-le. »

- Une série de 5 à 7 cartes verticales au format story, très belles, avec la direction artistique « lignes de niveau ».
- L'unité d'effort normalisé révèle ce que Strava ne montre pas : « Tu as fait autant d'effort en salle qu'en course, Strava n'en a vu que la moitié. » **C'est le message qui fait mouche.**
- Gratuit, sans compte pour la version de base (le mode découverte existe), avec création de compte pour sauvegarder.
- C'est faisable en trois semaines si on y met toute l'équipe.

### 8.2 Les canaux, par ordre de rentabilité

1. **Les coachs et les salles** (démarchage direct) : le meilleur coût d'acquisition, car chaque signature apporte des dizaines d'utilisateurs.
2. **Les cartes partageables** (récap, jalons, Rétro, passeport) : chaque partage est une publicité gratuite et crédible.
3. **Les liens d'invitation** (duo, guilde, défi) : le parrainage naturel.
4. **Le contenu SEO**, qui existe déjà (journal de musculation, suivi escalade…) : à orienter vers « programme Hyrox », « allier course et musculation », « reprendre le sport après 40 ans ».
5. **Les créateurs de contenu de la scène hybride** francophone : TikTok et Instagram, micro-influenceurs (10 000 à 50 000 abonnés), payés en visibilité et en accès anticipé.
6. **Les événements** : un stand ou un partenariat avec un Hyrox ou une compétition d'escalade locale, avec un QR code vers une expédition dédiée.

### 8.3 Le nom

« TITAN » est générique : il existe des dizaines d'apps « Titan » sur les stores, et c'est difficile à référencer. Je ne recommande pas de changer maintenant (le coût est trop élevé), mais il faut **posséder une expression** : « TITAN Effort », « TITAN Hybrid », ou simplement un mot pour l'unité d'effort qui devienne la marque. À trancher avant l'internationalisation.

---

## 9. Technique et organisation

### 9.1 Plateformes : la décision structurante

- **Sortir iOS en 90 jours.** L'app est en Expo et React Native : le portage est un chantier de semaines, pas de mois. Les modules spécifiques à Android (podomètre Kotlin, Health Connect) ont leurs équivalents (CoreMotion, HealthKit). En France, les possesseurs d'iPhone représentent une part importante des utilisateurs qui paient pour des abonnements sportifs. **Sans iOS, la moitié des clients potentiels n'existent pas pour TITAN**, et un sportif sur iPhone ne peut pas rejoindre la guilde de son ami sur Android. Le moindre effet de réseau est coupé en deux.
- **Le mobile est le produit. Le web devient le compagnon** : le tableau de bord du coach et du club, les pages publiques et SEO, le passeport public, l'import d'archive. Geler les nouvelles fonctionnalités du web applicatif en vanilla JS. Maintenir deux interfaces complètes (vanilla et React Native) avec un fondateur seul est intenable.
- **Ajouter une carte** (MapLibre, qui est open source, ou Mapbox) : une sortie GPS sans carte n'est pas crédible face à n'importe quelle app de course.
- **Les montres :** Wear OS et Apple Watch viendront après les imports. Pour un premier temps, l'agrégateur et Health Connect / HealthKit couvrent l'essentiel.

### 9.2 La dette qui compte vraiment

| Sujet | Pourquoi c'est important | Action |
|---|---|---|
| Conflits de profil (environ 1 par seconde) | Le symptôme d'une synchronisation où le client est la source de l'état de jeu | Sortir `game_state` du blob de profil, passer par des RPC atomiques (le chemin est entamé avec la progression côté serveur) |
| La clé Garmin « à considérer comme exposée » (`GARMIN.md`) | Un risque de sécurité **et** de relation partenaire | La régénérer maintenant. Et décider franchement si Garmin direct vaut l'effort, face à un agrégateur. |
| Le déploiement Netlify par CLI, découplé de Git | Personne ne sait exactement ce qui tourne en production | Déploiement depuis `main` uniquement, avec étiquette de version |
| `titan_features.js` (220 Ko), le noyau hérité | Le web applicatif charge environ 205 Ko compressés | Non prioritaire si le web applicatif est gelé |
| Le français codé en dur | L'internationalisation sera dix fois plus chère dans un an | Extraire les chaînes de l'app mobile **maintenant** (i18n), même sans traduire tout de suite |

### 9.3 L'organisation

- **Arrêter les documents de passation par lot.** Un seul document vivant par sujet (produit, architecture, release) ; les décisions dans `docs/adr/`. Tout le reste est du bruit.
- **Une règle de livraison :** une version en production par semaine, sur le Play Store (puis l'App Store), avec un changement visible pour l'utilisateur.
- **Une règle de priorité :** aucune nouvelle fonctionnalité « de protection » (modération, recours, anti-abus) tant qu'il n'y a pas d'abus réel observé. La base actuelle est déjà au-dessus du nécessaire pour 100 000 utilisateurs.
- **Parler à 5 utilisateurs par semaine.** Je n'ai vu dans le dépôt aucune synthèse d'entretien utilisateur. Les « passes persona » (`V11_PERSONA_PASSES`) sont simulées, pas réelles.
- **Recruter, ou s'associer** avec un profil croissance et communauté, idéalement issu de la scène CrossFit, Hyrox ou escalade. Le fondateur produit et technique a prouvé qu'il savait construire ; ce qui manque, c'est quelqu'un qui *vend*.

---

## 10. Le plan

### Les 30 prochains jours — « Ouvrir les portes »

- [ ] **Retirer AdMob** de l'app Android.
- [ ] **Publier l'app sur le Play Store** en test ouvert, puis en production.
- [ ] **Instrumenter la rétention** : J1, J7, J30, semaine 4, nombre de sports par utilisateur, temps de saisie d'une séance. Un tableau de bord simple (Supabase plus une vue SQL suffit).
- [ ] **Remplacer le code ami par des liens d'invitation** (duo, guilde, défi).
- [ ] **Lancer TITAN Rétro 2026** avec import d'archive Strava et de Health Connect (cible : 1er décembre).
- [ ] **Régénérer la clé Garmin.**
- [ ] **Démarcher 10 salles et coachs à la main.**
- [ ] **Interroger 20 utilisateurs réels.**

### 90 jours — « Le pari hybride »

- [ ] **App iOS** avec HealthKit.
- [ ] **Agrégateur d'appareils** (Garmin, Polar, Suunto, Coros, Wahoo).
- [ ] **Carte** (MapLibre) sur les séances GPS.
- [ ] **Coach IA v1** : débrief après séance et plan de semaine adaptatif, dans TITAN+.
- [ ] **Ouvrir la vente de TITAN+** avec la nouvelle proposition de valeur.
- [ ] **Tableau de bord coach web v1** et facturation par sportif.
- [ ] **Ligues hebdomadaires** à l'effort normalisé.
- [ ] **Import Hevy et Strong.**
- [ ] **Objectif :** 1 000 utilisateurs actifs par semaine, 30 coachs ou salles, 40 % de rétention à la semaine 4.

### 12 mois — « Le standard de l'effort »

- [ ] **Offre Club / Salle**, intégrée à au moins un logiciel de réservation de salles.
- [ ] **Anglais et espagnol** (le marché Hyrox est mondial, l'Espagne et le Royaume-Uni sont très actifs).
- [ ] **Wear OS et Apple Watch** (saisie du RPE et chrono de séance de force au poignet).
- [ ] **Le premier Baromètre de l'effort** et sa campagne presse.
- [ ] **Les défis de marque.**
- [ ] **Le partage d'itinéraires** avec masquage du départ, et un « Beacon » de sécurité.
- [ ] **Objectif :** 50 000 utilisateurs actifs mensuels, 5 % d'abonnés payants, 300 coachs et clubs.

---

## 11. La kill list : ce qu'il faut arrêter ou geler

| Arrêter / geler | Pourquoi |
|---|---|
| **La publicité AdMob** | Voir §7.1 |
| **Les factions, le panthéon, les saisons de club, les trophées de saison de club** | Des systèmes sociaux de deuxième niveau sans masse critique d'utilisateurs. Un club de 3 personnes n'a pas besoin d'un panthéon. À réactiver à 10 000 utilisateurs. |
| **L'enrichissement de la bible du monde** (nouvelles régions, nouvelles rencontres) | Le monde actuel suffit pour tester si l'aventure fait revenir. Mesurer d'abord. |
| **Le podomètre maison** | Health Connect et HealthKit font déjà ce travail. Le module natif Kotlin est un coût de maintenance pour une donnée qui ne rapporte rien (pas d'XP pour les pas, décision volontaire). |
| **Les nouvelles fonctionnalités web en vanilla JS** | Le web devient compagnon et coach |
| **Les audits « finaux » et passations par lot** | Voir §9.3 |
| **L'intégration Garmin directe** (à trancher) | Si le programme Garmin n'est pas confirmé sous 30 jours, basculer sur un agrégateur et arrêter d'y investir. |

---

## 12. Les indicateurs qui comptent

**L'étoile polaire :** **les semaines tenues par utilisateur actif.** Elle mesure exactement la promesse (revenir, régulièrement, sans culpabilité), elle est déjà calculée, et elle est immunisée contre les vanity metrics.

| Niveau | Indicateur | Cible à 90 jours |
|---|---|---|
| Activation | Pourcentage d'inscrits qui enregistrent une 2e séance sous 7 jours | ≥ 50 % |
| Activation | Pourcentage d'inscrits qui connectent une source (Health Connect, HealthKit, appareil, archive) | ≥ 40 % |
| Rétention | Rétention à la semaine 4 | ≥ 40 % |
| Rétention | Rétention à la semaine 12 | ≥ 25 % |
| Différenciation | Pourcentage d'actifs avec au moins 2 familles de sport par mois | ≥ 35 % (c'est la preuve que le multisport est la vraie raison de rester) |
| Viralité | Invitations envoyées par actif et par mois ; facteur k | k ≥ 0,3 |
| Viralité | Cartes partagées par actif et par mois | ≥ 1 |
| Monétisation | Conversion vers TITAN+ à 30 jours | ≥ 4 % |
| B2B | Sportifs actifs par coach | ≥ 6 |
| Santé | Temps médian de saisie d'une séance manuelle | ≤ 15 s |

---

## 13. Les risques

| Risque | Probabilité | Parade |
|---|---|---|
| **Strava lance un vrai mode musculation et multisport** | Élevée sur 2 à 3 ans (Runna montre qu'il achète des briques) | Aller vite sur le coach, le club et l'identité accumulée ; Strava ne fera jamais de la « non-performance » son identité. |
| **Hevy ou Ladder ajoutent l'endurance** | Moyenne | L'effort normalisé et la cadence ; l'import de leurs données |
| **Les API tierces se ferment** (Strava a restreint son API en 2024 ; Garmin a un programme incertain) | Élevée | L'import d'archive (portabilité RGPD, non bloquable), Health Connect et HealthKit, plusieurs agrégateurs |
| **Le fondateur s'épuise** | Élevée pour un projet de cette ampleur | Réduire le périmètre (kill list), trouver un associé, livrer chaque semaine pour avoir des retours positifs réels |
| **L'aventure fait fuir les adultes sportifs** | Moyenne | Mettre le monde en option à l'onboarding (« Je veux juste suivre mon sport » / « Je veux que mon effort fasse avancer un monde ») et mesurer les deux cohortes |
| **Les données de santé** (RPE, fréquence cardiaque, pas) | Moyenne | Faire valider le statut juridique (données de santé au sens du RGPD ? hébergement HDS ?) avant de lancer le coach IA |

---

## 14. Les idées folles (puisque j'ai carte blanche)

1. **« Strava compte tes kilomètres. TITAN compte ton effort. »** Une campagne frontale, avec un comparatif visuel : la même semaine vue par Strava (2 sorties de course) et vue par TITAN (2 courses, 3 séances de force, 1 séance d'escalade, avec 2,5 fois plus d'effort réel). Chaque athlète hybride s'y reconnaîtra.
2. **Le « Hyrox Ghost »** : lors d'une simulation de Hyrox, on court contre le fantôme de sa propre dernière performance, station par station.
3. **Le TITAN Score de la salle** : une salle affiche sur un écran TV le classement de ses adhérents, en effort normalisé de la semaine. C'est la meilleure publicité physique possible, et c'est équitable entre le crossfitteur et le grimpeur.
4. **L'expédition nationale** : une fois par an, tous les utilisateurs de TITAN cumulent leur effort pour « gravir » symboliquement un sommet (le Mont-Blanc, puis l'Everest), avec un compteur public en direct sur le site. Ça crée de la communauté sans compétition, et c'est un sujet de presse.
5. **Le contrat de retour** : quelqu'un déclare une pause (blessure, naissance, burn-out). TITAN lui envoie, à la date choisie, un message de retour bienveillant et un programme de reprise de deux semaines. **Aucune app ne s'occupe des gens au moment où ils décrochent.** C'est là que TITAN peut devenir *aimé*, et pas seulement utile.
6. **Le CV sportif certifié** : les séances venues d'un appareil sont marquées « vérifiées ». À terme, le passeport TITAN pourrait servir de preuve de pratique pour une fédération, un employeur (programmes de bien-être en entreprise) ou une mutuelle. C'est une piste B2B forte.
7. **Ouvrir le moteur d'effort** : publier la formule de l'effort normalisé en open source, sous le nom de « standard TITAN », et inviter d'autres apps à l'utiliser. Si l'unité devient un standard, TITAN en devient la référence.

---

## 15. Conclusion

TITAN a déjà résolu les problèmes difficiles que la plupart des startups découvrent trop tard : l'intégrité des données, l'anti-triche, la vie privée, les paiements, la synchronisation hors ligne. **C'est un avantage énorme, mais il est invisible pour l'utilisateur.**

Ce qui manque n'est pas une liste de fonctionnalités. Ce sont trois choses :

1. **Un pari** : l'athlète hybride et ceux qui reviennent, avec l'effort normalisé comme monnaie.
2. **Des portes ouvertes** : iOS, les imports, les liens d'invitation, les coachs et les salles.
3. **Un retour du réel** : des utilisateurs, des chiffres de rétention, et des conversations.

On ne devient pas Strava en copiant Strava. On le devient en étant, pour un groupe précis de gens, la seule app qu'ils ne peuvent pas désinstaller. TITAN a la technologie pour y arriver. Il lui faut maintenant le courage de choisir, et de sortir dans le monde.
