# TITAN — Audit stratégique « Top App » (v2)

*15 novembre 2026. Ce document remplace la v1 du même jour.*

**Les contraintes que j'ai respectées**
- **Pas d'iOS pour l'instant** (prévu plus tard).
- **Pas d'IA** tant que la base d'utilisateurs n'existe pas.
- **Uniquement des leviers à coût d'infrastructure nul ou quasi nul** : du travail produit, du code client, des lignes de données, des fonctions serverless déjà dans votre stack.

**Comment cet audit a été fait.** J'ai lu le code écran par écran (`mobile/src`), les règles serveur (`supabase/migrations`), le web (`js/`, pages HTML), la fiche Play Store et les captures. Les nombres de gestes sont estimés à la lecture du code, pas mesurés sur un téléphone. Je n'ai eu accès ni à la production ni aux chiffres d'audience. Chaque constat important cite son fichier.

---

## Sommaire

1. Le verdict
2. La barre : ce qui fait une « top app », et la note de TITAN sur chaque critère
3. Les urgences de la semaine (avant toute nouveauté)
4. Audit par parcours
   - 4.1 Premier lancement
   - 4.2 Le QG
   - 4.3 Saisir une séance
   - 4.4 L'écran de résultat
   - 4.5 Les notifications
   - 4.6 Le système de progression
   - 4.7 L'aventure
   - 4.8 L'économie et l'Atelier
   - 4.9 Le social
   - 4.10 Le coach
   - 4.11 La présence sur Android
   - 4.12 La fiche Play Store
   - 4.13 La qualité technique
   - 4.14 Le ton et les textes
5. Le moteur de croissance à zéro euro
6. Monétisation sans IA ni coût marginal
7. Le plan : 6 sprints de 2 semaines
8. Ce qu'il faut arrêter
9. Les indicateurs, et les cibles d'une top app

---

## 1. Le verdict

TITAN a les **fondations** d'une top app :
- un moteur d'effort multisport unique ;
- une synchronisation hors ligne exemplaire (file durable, cache persistant 30 jours, resynchronisation automatique) ;
- une sécurité serveur de niveau bancaire ;
- un design sombre et typé qui tient la route.

Il n'a pas encore le **comportement** d'une top app. Une top app se reconnaît à trois choses : on en tire de la valeur en moins d'une minute, on y revient sans y penser, et on la montre aux autres. Sur ces trois points, TITAN est aujourd'hui en dessous de la moyenne :

- **Valeur en une minute : non.** Il faut 6 à 7 écrans, une confirmation par e-mail et une deuxième saisie du mot de passe avant la première séance, et il n'existe aucun mode sans compte sur Android.
- **Revenir sans y penser : non.** Les rappels sont désactivés par défaut et cachés à trois niveaux de profondeur. Il n'y a ni widget ni raccourci. Au bout d'environ 8 semaines, l'aventure n'a plus rien à proposer. Et le seul événement collectif programmé **se termine demain, le 16 novembre**.
- **Le montrer aux autres : presque impossible.** Le partage envoie un code `TN-XXXX` sans lien. L'ami qui le saisit échoue silencieusement, car le profil n'est pas « trouvable » par défaut. Et une guilde créée sur Android ne peut inviter personne : son code n'est jamais affiché.

**La bonne nouvelle**, et c'est le cœur de ce rapport : **la majorité de ce qui manque existe déjà côté serveur.** Les quêtes périodiques, les saisons, la quête commune, l'objectif mondial, le classement équitable, les intentions du jour, les liens de duel, les cartes image, les titres affichés et la vitrine sont codés, testés et en production… mais **Android n'en appelle aucun** (zéro appel dans `mobile/src`).

TITAN n'a pas besoin de construire beaucoup plus. Il a besoin de **brancher, relier et mettre en scène** ce qu'il a déjà. C'est un chantier de quelques semaines, sans un euro d'infrastructure.

---

## 2. La barre : les 10 critères d'une top app

| # | Critère | Ce que fait une top app | TITAN aujourd'hui | Note |
|---|---|---|---|---|
| 1 | **Valeur en moins de 60 secondes** | Duolingo : la première leçon avant le compte. Hevy : la première séance avant le compte. | 6 à 7 écrans, une boîte mail, le mot de passe à ressaisir, aucun mode invité sur mobile | **3/10** |
| 2 | **Saisie en moins de 10 secondes** | Hevy : on rejoue une routine et les valeurs de la dernière fois sont préremplies. Strava : la séance arrive toute seule. | Course : environ 7 gestes. Musculation 4×3 : **28 à 45 gestes**, sans routine ni « la dernière fois ». Import Health Connect caché. | **4/10** |
| 3 | **Une raison de revenir chaque jour, chaque semaine, chaque mois, chaque année** | Duolingo : quête du jour, ligue de la semaine, défi du mois, bilan de l'année | La séance seulement. La semaine n'a pas de récompense. Le mois n'a rien (les événements dépendent d'un administrateur). L'année n'a rien. | **3/10** |
| 4 | **Une progression qui dure des années** | Paliers fréquents au début, puis des « prestiges » | Excellent le premier mois. Fin de l'aventure vers la semaine 8. Un niveau toutes les 7 à 17 semaines ensuite. Plus rien à acheter au bout de 17 mois. | **4/10** |
| 5 | **Contagieuse** | Chaque usage produit un objet partageable avec un lien | Code en texte sans lien, pas d'image sur Android, pas de lien universel | **2/10** |
| 6 | **Présente hors de l'app** | Widget, raccourcis, notifications riches, tuile | Aucun widget, aucun raccourci natif, deux notifications statiques | **2/10** |
| 7 | **Fiche store qui convertit** | Captures avec accroches, mots-clés dans le titre, demande d'avis au bon moment | Captures issues du web, sans texte. Titre sans mot-clé. Pas de demande d'avis. Deux versions contradictoires de la fiche. | **3/10** |
| 8 | **Cohérente et digne de confiance** | Ce qui est promis est ce qui est livré | « Sans publicité » alors que la pub est active ; « ta trace reste sur ton téléphone » alors que la trace est envoyée ; « Analyses plus poussées » sans rien derrière | **3/10** |
| 9 | **Robuste et observée** | Crash reporting, tableaux de bord de funnel | Robustesse 9/10 ; observabilité 2/10 (pas de crash reporting, pas d'analytics sur mobile) | **5/10** |
| 10 | **Belle et identifiable** | Une identité qu'on reconnaît sur une capture | Bonne direction (sombre, cyan et ambre, typographie étroite). L'illustration fantasy générée peut diviser. | **7/10** |

**Moyenne : environ 3,6/10.** Une top app de la catégorie (Strava, Hevy, Duolingo) se situe entre 8 et 9. **L'écart est surtout dans les critères 1, 3, 5, 6 et 7, et ce sont les moins chers à corriger.**

---

## 3. 🔴 Les urgences de la semaine

Ce sont des risques (store, confiance, rétention), pas des envies. À traiter avant toute nouveauté.

| # | Problème | Preuve | Correctif | Effort |
|---|---|---|---|---|
| U1 | **La déclaration de localisation est fausse** (risque de rejet ou de retrait par Google Play). La fiche « Sécurité des données » déclare « Localisation : Non — aucune permission de localisation ». | `mobile/docs/PUBLIER_PLAY_CONSOLE.md:85`, alors que `app.config.ts` demande `ACCESS_FINE_LOCATION` et `FOREGROUND_SERVICE_LOCATION`, et que les traces sont envoyées au serveur (`lib/routeSync.ts` vers `titan_route_save_v1`) | Corriger la déclaration Data Safety : localisation précise, collectée, liée au compte, finalité « fonctionnalité de l'app ». Corriger aussi la politique de confidentialité. | 1 h |
| U2 | **Le texte de permission ment** : « Ta trace reste sur ton téléphone ». | `mobile/src/lib/permissionCopy.ts:5` | « Ta trace est enregistrée sur ton compte, privée, visible de toi seul. » | 5 min |
| U3 | **La publicité contredit trois textes publics** : la FAQ web « ni dans l'offre gratuite ni dans TITAN+ », la description courte Play « Gratuit, sans publicité », et le texte d'accueil. | `titan-plus.html`, `PUBLIER_PLAY_CONSOLE.md` §3, `lib/playBilling.ts` (« Publicités rares et discrètes ») | Décider (voir §6.1), puis aligner **tous** les textes le même jour | 2 h |
| U4 | **Le calendrier d'événements est vide à partir de demain.** L'expédition `automne-2026` se termine le 16/11/2026 et aucune autre n'est programmée. | `supabase/migrations/20261005200000_ascension_social.sql:519-522` | Insérer l'expédition d'hiver et les saisons dès maintenant (voir §4.6, « calendrier en données ») | 2 h |
| U5 | **Une guilde créée sur Android ne peut inviter personne** : le code n'est jamais affiché. | Le type `GuildWeek` n'a pas de champ `code` (`data/api.ts:230`) | Renvoyer le code dans l'aperçu social, l'afficher, ajouter « Inviter » | ½ jour |
| U6 | **L'ajout d'ami échoue silencieusement.** `publicProfile:false` est imposé à l'inscription, et le serveur renvoie `FRIEND_CODE_NOT_FOUND` pour tout profil non trouvable. Partager son code sans être trouvable produit un échec garanti chez l'ami. | `data/api.ts:55`, `ascension_social.sql:111-114` | Quand on appuie sur « Partager mon code », proposer « Rendre mon profil trouvable » en un geste. Ou bien : un code partagé par son propriétaire fonctionne 7 jours. | ½ jour |
| U7 | **Une sortie GPS entière peut être perdue en un geste** : « Abandonner cette séance » n'a pas de confirmation. | `screens/session/GpsRecordScreen.tsx:237` | Une boîte de confirmation | 15 min |
| U8 | **Le correctif de la tempête de conflits de profil** (85 428 erreurs en 24 h) était noté « à autoriser ». | `docs/SUPABASE_PROFILE_STORM_AUDIT_2026-11-02.md` | Vérifier qu'il est en production, puis mesurer les erreurs `40001` par heure | 1 h |
| U9 | **La clé Garmin est « à considérer comme exposée ».** | `docs/GARMIN.md` §1 | La régénérer | 30 min |
| U10 | **TITAN+ promet « Analyses plus poussées » et rien n'est réservé dans l'onglet Progrès mobile.** | `lib/playBilling.ts:17` | Retirer la promesse tant qu'elle n'est pas livrée (voir §6.2) | 5 min |

---

## 4. Audit par parcours

### 4.1 Premier lancement — objectif : une séance enregistrée en moins de 60 secondes

**Constat**
- Le chemin par e-mail : Accueil → Inscription (4 champs, dont une case CGU) → « Vérifie ta boîte mail » → l'app de messagerie → retour → Connexion (**mot de passe à ressaisir**, seul l'e-mail est prérempli : `SignupScreen.tsx:57-62`) → Onboarding en 2 ou 3 écrans → formulaire.
- **Le mode découverte n'existe pas sur Android.** Le navigateur déconnecté ne propose que Welcome, Login, Signup et Forgot (`navigation/RootNavigator.tsx:70-77`). Pourtant le noyau partagé le gère déjà (`core/web/progress.js:627,653`), et du code `guest_` existe dans l'app sans être jamais atteint (`AdventureEncounters.tsx:32`, `data/journey.ts:22`).
- L'onboarding montre un aperçu conditionné à « si tu as déjà lancé une campagne » à quelqu'un qui n'en a forcément aucune (`OnboardingScreen.tsx:138`).
- La visite guidée annonce « 2 minutes », mais elle compte 12 étapes, dont une publicité pour TITAN+ et Coach (`lib/tour.ts:57-70`).

**Ce que font les meilleures**
- Duolingo : on choisit sa langue, on fait la leçon 1, et **ensuite** « Crée ton profil pour sauvegarder ta progression ».
- Hevy : on peut démarrer une séance sans compte.

**Prescription**
1. **Activer le mode découverte natif** : « Commencer sans compte ». Les données restent sur l'appareil, en réutilisant les branches `guest` existantes. L'app demande un compte au moment le plus fort, sur l'écran de résultat : « Tu viens de gagner 594 XP. Crée ton compte pour ne pas les perdre. » Le transfert local vers le compte existe sur le web ; il faut le reproduire.
2. **Google en premier, en grand.** L'e-mail en second.
3. **Ne pas bloquer sur la confirmation d'e-mail.** On laisse utiliser l'app, on rappelle la confirmation dans un bandeau, et on ne bloque qu'à la synchronisation sociale. Après confirmation, l'utilisateur revient connecté (lien magique), sans ressaisir son mot de passe.
4. **Un onboarding en 3 questions, centré sur l'utilisateur :**
   - Tes sports (avec les pictogrammes 3D du lot qui vient d'être livré : ils sont superbes, montrez-les).
   - Ta semaine idéale (de 1 à 7 jours).
   - « Qu'est-ce qui te ferait revenir ? » : progresser / garder le rythme / jouer / suivre mon coach. La réponse règle le QG (aventure mise en avant ou non, coach en premier ou non).
5. **Supprimer la visite guidée de 12 étapes.** La remplacer par des bulles d'aide contextuelles qui n'apparaissent qu'une fois, au premier passage sur chaque écran.

**Cible :** 70 % des installations atteignent une première séance enregistrée le jour même.

### 4.2 Le QG — objectif : une seule chose à faire, évidente

**Constat** (`screens/home/HomeScreen.tsx`)
- Onze blocs se succèdent :
  - bannière ;
  - « À faire maintenant » ;
  - trois boutons qui **dupliquent la barre d'onglets** (dont « Sport », alors que l'onglet s'appelle « Séance ») ;
  - SinceCard, TodayStrip, Sentiers ;
  - les repères d'ascension (repliés) ;
  - la visite ;
  - un repère, les 3 dernières séances ;
  - la pub.
- **Sept systèmes de progression se disputent l'attention** : XP et niveau, rang, crédits, maîtrise, cadence, chapitres de campagne et Sentiers (les pas). La carte des Sentiers le dit elle-même : « Trois chemins, le même effort réel » (`JourneyCard.tsx:34`).
- **L'XP et le niveau sont repliés, alors que les Sentiers (les pas) restent toujours visibles.** La hiérarchie est inversée.
- **« Refaire ma dernière séance » n'est pas sur le QG**, seulement dans l'onglet Séance, sous la carte GPS.
- Un utilisateur de 3 mois voit presque le même écran qu'un nouveau : pas de tendance, pas de « par rapport à la semaine dernière », pas de visuel des semaines tenues.

**Prescription : un QG en 4 blocs, dans cet ordre**
1. **La semaine** (le cœur) : les 7 jours, les jours faits, l'objectif (« 2/3 »), et en dessous les **8 dernières semaines en encoches**. C'est le visuel signature de TITAN : l'équivalent de la flamme de Duolingo, mais sans culpabilité.
2. **L'action du jour**, contextuelle, avec un seul gros bouton :
   - s'il y a un brouillon : « Reprendre » ;
   - si une séance de Health Connect a été détectée : « Ajouter ta sortie de 8,2 km de ce matin » ;
   - si c'est le jour habituel d'un sport : « Refaire *Jambes* (comme mardi dernier) » ;
   - sinon : « Une séance courte suffit pour tenir ta semaine ».
3. **Ce qui avance** : une seule carte « Progression » qui fusionne niveau, maîtrise, chapitre en cours et prochaine récompense, du type « Plus que 2 jours actifs pour la balise 4 ».
4. **Ton cercle** : les encouragements reçus, les demandes d'ami, la guilde, le défi en cours.

**À sortir du QG :** les boutons qui dupliquent les onglets, la visite, les Sentiers (à déplacer dans Profil ou Aventure) et la pub.

### 4.3 Saisir une séance — objectif : moins de 10 secondes

**Constat**
- **Course de 10 km :** environ 7 gestes et 2 valeurs saisies. Correct. Mais la durée se saisit en trois champs (heures, minutes, secondes : `SessionFormScreen.tsx:274-276`).
- **Musculation 4 exercices × 3 séries : 28 gestes à charge constante, environ 45 si la charge varie.**
  - Aucune routine ni modèle (le seul usage de « routine » dans le code concerne les objectifs).
  - **Aucune valeur de la dernière fois** : les suggestions ne donnent que des noms d'exercices (`SessionFormScreen.tsx:387`).
  - La coche « Fait » ne fait que lancer le minuteur de repos (`ExerciseEditor.tsx:137`). Ce minuteur s'arrête quand l'écran se verrouille : pas de notification de fin de repos.
- **Escalade :** 9 à 10 gestes. La cotation se tape en texte libre (« 6a+ »). **La durée est obligatoire** (`:430`), contrairement aux autres sports. On ne peut pas noter voie par voie.
- **Seulement 2 sports en accès rapide** (`RecordScreen.tsx:41`, `slice(0,2)`).
- **« Refaire »** propose la séance la plus récente, tous sports confondus. Après une course, impossible de rejouer sa séance de jambes en un geste.
- **Import Health Connect :** Profil → Sources → Santé Connect → « Chercher mes séances (7 jours) » → Importer, ligne par ligne. Aucune détection automatique.
- **GPS :** pas de carte, pas de découpage par kilomètre, pas d'annonces vocales, pas de compte à rebours. Après l'arrêt, il faut **enregistrer une deuxième fois** dans le formulaire (`GpsRecordScreen.tsx:140`).

**Ce que font les meilleures**
- Hevy et Strong : routines, valeurs fantômes de la séance précédente, minuteur de repos en notification, série cochée = série validée.
- Nike Run Club : compte à rebours de 3 secondes, annonce vocale à chaque kilomètre.
- Strava : la séance arrive toute seule depuis la montre.

**Prescription, par ordre d'impact**
1. **Routines.** « Enregistrer comme routine » depuis n'importe quelle séance passée. « Mes routines » en tête de l'onglet Séance (gratuit jusqu'à 5, comme sur le web). C'est **la** fonctionnalité qui retient les pratiquants de musculation.
2. **Valeurs fantômes.** Chaque série affiche en gris « la dernière fois : 80 kg × 8 ». Un geste pour l'accepter, un geste pour faire +2,5 kg. C'est une simple lecture du journal local, sans aucun coût.
3. **La coche « Fait » valide la série** et lance le repos, avec une notification de fin de repos (canal local, écran verrouillé).
4. **« Refaire » par sport** et accès rapide aux 4 à 6 sports les plus pratiqués.
5. **Détection Health Connect au premier plan.** À l'ouverture, l'app lit les séances des 48 dernières heures (en lecture locale) et affiche sur le QG : « 2 séances détectées, les ajouter ? ». Elles s'ajoutent en un geste ; il ne reste qu'à indiquer le ressenti.
6. **Escalade :** cotations en puces, durée facultative, mode « pyramide » (une ligne par voie : cotation, réussie ou essai).
7. **Durée en un seul champ** au format `mm:ss` ou `h:mm`, avec un clavier numérique.
8. **GPS :** compte à rebours, annonces vocales par kilomètre (synthèse vocale native, gratuite), allure par kilomètre, et « Enregistrer » qui enregistre directement (le formulaire n'est plus qu'une option « Ajouter des détails »).
9. **Appui long sur le « + »** (l'événement `tabLongPress` est émis mais ignoré : `Tabs.tsx:52`) : un menu rapide avec Routines, Refaire, GPS et Chrono.

**Cible :** une séance de musculation rejouée depuis une routine en moins de 15 gestes. Une séance importée en 2 gestes.

### 4.4 L'écran de résultat — le moment le plus précieux de l'app

C'est **le seul moment** où l'utilisateur est fier, disponible et émotionnellement chargé. Tout ce qui compte doit se jouer ici.

**Constat** (`SessionResultScreen.tsx`)
- Le compteur d'XP, la barre de niveau, la révélation de progression (3,2 s) et les records sont bien faits.
- **La cadence et la maîtrise, les mécaniques de rétention, sont repliées par défaut** derrière « Mes repères sportifs » (`:277-322`).
- **« Partager » ne publie que vers le fil d'amis interne** (`:111-118`) : pas de feuille de partage du système, pas d'image, désactivé hors ligne.
- Aucune comparaison avec la séance précédente du même sport.
- **Un interstitiel publicitaire peut s'afficher sur « Terminer »** (`:361`), au moment le plus émotionnel.

**Prescription : l'écran de résultat en 4 temps**
1. **La récompense** : l'XP et la jauge (existant), plus **la comparaison** (« 32 s plus rapide qu'il y a 2 semaines », « +5 % de volume sur le développé couché »).
2. **La semaine** : l'encoche de la semaine qui se remplit, en animation (« Semaine tenue ! 3/3 »). C'est **le** moment de célébrer la cadence.
3. **Ce qui avance** : « Balise 4 : plus qu'un jour », « Maîtrise Course : 62 % vers le niveau 5 ».
4. **Le partage** : une **carte image générée sur l'appareil** (`react-native-view-shot` et `expo-sharing`, ce dernier déjà installé), au format story 9:16 et au format carré, avec un lien. Le partage vers le cercle d'amis devient une option à côté.

Et, au bon moment :
- **la demande de notifications** après la première séance (« Je te rappelle tes créneaux ? ») ;
- **la demande d'avis Play Store** après un record ou à la 10e séance (API In-App Review, voir §4.11) ;
- **la création de compte** pour les utilisateurs du mode découverte.

### 4.5 Les notifications — de 2 rappels statiques à un coach silencieux

**Constat** (`lib/reminders.ts`, `lib/notificationChannels.ts`)
- Deux programmations locales, **désactivées par défaut** et accessibles par Profil → Aide et préférences → Rappels :
  - le récap du lundi à 9 h, au texte fixe, même s'il ne s'est rien passé ;
  - des rappels hebdomadaires au texte fixe (« Un créneau pour bouger ? »).
- **Les rappels sonnent même un jour où l'on s'est déjà entraîné** : ils ne sont recalculés que depuis l'écran des réglages.
- Ils ne sont pas reliés à « Ma semaine type ». Ils ne se restaurent pas sur un nouvel appareil (enregistrés côté serveur mais jamais relus). Ils ne s'annulent pas à la déconnexion.
- Aucune notification pour : chapitre prêt à valider, récompense retenue puis libérée, échec de synchronisation, fin de repos.

**Prescription : tout en local, sans serveur de push**
1. **Après chaque séance, recalculer la programmation** :
   - pas de rappel les jours déjà actifs ;
   - les rappels suivent les jours prévus dans « Ma semaine type ».
2. **Des textes dynamiques, calculés au moment de programmer** :
   - « Il te reste 1 jour pour tenir ta semaine » (le vendredi) ;
   - « Ta balise 4 t'attend : une séance suffit » ;
   - « Cela fait 9 jours. Une séance de 20 min compte autant qu'une autre. »
3. **Un récap du lundi qui raconte la semaine passée** : « 3/3 tenue, 2 h 40, record au 5 km ». S'il n'y a rien eu, on n'envoie rien.
4. **Les notifications d'événements de jeu** :
   - chapitre prêt ;
   - « Il reste 3 jours d'expédition, l'objectif collectif est à 84 % ».
   Tout est calculable à partir des données déjà synchronisées, au retour au premier plan (programmation locale différée).
5. **Une règle d'or : jamais plus d'une notification par jour, jamais après 21 h**, et toujours un geste pour couper chaque catégorie.

*Le vrai push serveur (« Marie t'a encouragé ») viendra plus tard. Expo Push est gratuit, mais il faut une table de jetons et un déclencheur. Ce n'est pas indispensable au premier mois.*

### 4.6 Le système de progression — combler les zones mortes

**La courbe actuelle**, simulée pour un pratiquant régulier (3 × 45 min par semaine, RPE 6, environ 1 458 XP par semaine) :

| Période | Ce qui se passe | Diagnostic |
|---|---|---|
| Semaines 1 à 5 | Un niveau par semaine, insignes, premiers achats à l'Atelier | ✅ Dense, gratifiant |
| Semaines 5 à 8 | Fin possible des 4 mondes **en parallèle** (voir §4.7) | ⚠️ Le contenu brûle trop vite |
| Semaines 8 à 30 | Un niveau toutes les 4 à 7 semaines, plus d'aventure, pas d'événement programmé | 🔴 **Zone morte n°1** |
| Mois 7 à 17 | Un niveau toutes les 7 à 12 semaines, dernier avatar au niveau 15 (vers 16 mois), Atelier épuisé vers 17 mois | 🔴 **Zone morte n°2** |
| Au-delà | Rang suivant (Titan, niveau 25) vers 4,5 ans, jalons de carrière à 10 ans et plus, Sentiers en 12 ans | 🔴 Des objectifs inatteignables qui découragent |

**Les couches de récompense d'une top app, et ce qui manque :**

| Rythme | Duolingo | TITAN aujourd'hui | À ajouter (coût nul) |
|---|---|---|---|
| **Séance** | XP, son, animation | ✅ Très bien | Comparaison avec la séance précédente |
| **Jour** | Quêtes du jour, coffre | ❌ Rien sur Android | **Intention du jour** (la RPC `rendez-vous` existe sur le web), une petite quête du jour |
| **Semaine** | Ligue, quêtes hebdo | Encoche de cadence **sans récompense**, quêtes « suggérées » sans rien à réclamer | **Semaine tenue = coffre de crédits** (+50), **quêtes hebdo réclamables** (le serveur les a déjà : `periodic_quests`), **ligue hebdo** |
| **Mois** | Défi du mois, badge | Rien de régulier | **Défi du mois** avec insigne de collection, tiré d'un calendrier de données |
| **Saison (28 j)** | — | Saisons codées côté serveur, **absentes d'Android** | Saisons visibles, avec classement de saison et récompense cosmétique |
| **Année** | Bilan de l'année | Rien | **TITAN Rétro** (voir §5) |
| **Long terme** | Paliers de prestige | Niveaux trop espacés après 10 | Étoiles entre les niveaux, rangs intermédiaires, prestige d'aventure |

**Prescription**

1. **Brancher le serveur existant sur Android** (c'est la recommandation n°1 du rapport) :
   - quêtes périodiques réclamables ;
   - saisons ;
   - quête commune ;
   - objectif mondial ;
   - classement équitable entre amis ;
   - intentions du jour ;
   - titre affiché et vitrine.
   Les RPC existent, sont testées et en production. C'est uniquement du travail d'écran.
2. **Un calendrier de contenu sous forme de données.** Écrire maintenant **12 mois d'événements** en SQL : 4 expéditions saisonnières, 13 saisons, 12 défis mensuels, 52 quêtes communes. Ou mieux, un **générateur déterministe** qui fait tourner des modèles (thème du monde, gardien, sport mis en avant). Personne ne doit avoir à se souvenir de créer l'événement suivant. **C'est l'équivalent du live ops d'un jeu mobile, sans équipe live ops.**
3. **Donner des crédits aux cycles courts.** Les crédits n'achètent que du cosmétique, donc **aucun risque de pay-to-win** :
   - semaine tenue : +50 ;
   - quête hebdo : +30 ;
   - quête du mois : +100 ;
   - palier d'expédition : +X.
   Aujourd'hui, la cadence (la meilleure idée de TITAN) **ne rapporte rien**. C'est une erreur de conception.
4. **Réparer la courbe longue.**
   - Ajouter **des étoiles** (★ à ★★★★★) tous les 3 000 XP environ après le niveau 10, pour avoir un palier toutes les 2 semaines.
   - Ajouter **un rang à 20** entre Champion (15) et Titan (25).
   - Mettre **les jalons de carrière** à 5, 10, 15, 20, 25, 30 et 40 (au lieu de 35, 50, 75, 100, inatteignables).
   - Ajouter **des avatars à 20 et 25**.
5. **Des trophées de collection côté serveur, comme le promettait Ascension §3.6** : semaines tenues (4, 12, 26, 52, 104), heures par sport, niveaux de maîtrise, « Grands moments ». Aujourd'hui ils sont calculés sur l'appareil et ne se collectionnent pas.
6. **Des records à la Strava :**
   - **les meilleurs efforts à l'intérieur d'une sortie** (le meilleur 1 km, 5 km et 10 km dans un 12 km), calculés sur l'appareil depuis la trace GPS ;
   - la meilleure semaine, la plus longue sortie de l'année ;
   - le record de volume et le record de répétitions par exercice.
   Aujourd'hui, un 5 km n'est un record que si la séance entière fait 5 km à 1 % près (`js/sport-insights.js:172`).
7. **Des surprises, sans hasard payant.** Des **succès cachés** dérivés du journal :
   - séance avant 7 h ;
   - 3 familles de sport dans la même semaine ;
   - retour après une pause ;
   - séance le jour de son anniversaire ;
   - 100e séance ;
   - même sport 10 semaines de suite.
   La politique « Rien n'est tiré au sort » est respectée, puisque c'est déterministe. Mais c'est **imprévisible pour le joueur**, et c'est ça qui crée la surprise.

### 4.7 L'aventure — d'un livre d'images à un jeu

**Constat**
- 4 mondes de 9 chapitres, soit 21 jours actifs par monde, plus 150 minutes d'effort pour le gardien. L'action du joueur : choisir une route, s'entraîner, appuyer sur « Allumer la balise ».
- **Les 4 mondes peuvent être lancés en parallèle, et la même séance compte pour tous.** La RPC `start` insère sans limite (`20261019062757_adventure_personal_targets_v4.sql:107`). Un joueur qui démarre tout le premier jour termine les 36 insignes en 7 à 8 semaines.
- **Les jours faits pendant qu'un chapitre attend d'être validé sont perdus** : à la validation, `started_at = clock_timestamp()`, et seules les séances postérieures comptent ensuite.
- Les « pratiques » de chapitre (« Compare deux séances ») ne sont jamais vérifiées : elles se lisent comme des devoirs.
- Les choix des rencontres ne modifient qu'une phrase de fin. Le bestiaire tient en 6 lignes de texte.
- **Il n'y a pas de fin de jeu** : « Monde terminé », une carte statique.
- L'interface dit « coins » à un endroit et « crédits » partout ailleurs (`AdventureEncounters.tsx`).

**Prescription**
1. **Un monde actif à la fois**, ou bien une séance qui ne compte que pour un monde. Le contenu dure alors **4 fois plus longtemps**, sans une ligne de texte en plus.
2. **Reporter les jours en surplus** sur le chapitre suivant.
3. **Une fin de jeu « Ascension »** : rejouer un monde terminé avec des objectifs plus hauts, des insignes en version dorée ou « renouvelée », et un monde mis en vedette à chaque saison.
4. **Des choix qui comptent** : la variante cosmétique de l'insigne, la créature qui entre au bestiaire. Un bestiaire illustré, avec la date de la rencontre et la séance qui l'a permise.
5. **Donner au joueur une décision par semaine** :
   - quel monde, quelle route ;
   - « cette semaine, je mise sur l'endurance ou sur la force » (un bonus narratif selon la famille de sport pratiquée).
   C'est ce qui sépare un livre d'images d'un jeu.
6. **Le choix « je veux jouer » ou « je veux juste suivre mon sport » à l'onboarding**, et deux cohortes mesurées séparément. L'aventure ne doit jamais gêner un sportif qui s'en moque.

### 4.8 L'économie et l'Atelier

**Constat** : 12 objets à acheter, pour un total de 10 850 crédits. Un pratiquant régulier gagne environ 146 crédits par semaine : premier achat au bout d'environ 3 semaines, **catalogue épuisé au bout d'environ 74 semaines**. Il y a 3 types de cosmétiques (cadre, calque de carte, style de carte) et 6 avatars.

**Prescription**
- **Passer de 12 à 40 objets** : cadres de gardien, styles de carte par monde, cadres de saison, variantes d'avatar, ambiances de carte débloquées par la maîtrise. **Ce ne sont que des lignes de données**, plus des visuels (le pipeline d'import visuel vient d'être livré, PR #146).
- **Étaler les prix de 400 à 4 000 crédits**, avec certains objets réservés à un rang ou à une maîtrise (prestige non achetable).
- **Une rotation hebdomadaire de 3 objets en vitrine** à l'Atelier, pour donner une raison de passer.
- **Des objets de saison** qui ne reviennent pas avant un an. La rareté crée le désir, sans coûter un centime.

### 4.9 Le social — de « vestiaire fermé » à « petit cercle contagieux »

**Constat**
- **La Communauté n'est pas un onglet** : on y accède seulement par Profil → « Ma communauté » (`ProfileScreen.tsx:205`).
- **Le parcours « faire venir un ami » compte 8 étapes, avec 4 points durs :**
  1. pas de lien dans le message ;
  2. code à recopier à la main ;
  3. profil non trouvable par défaut, d'où un **échec silencieux** ;
  4. aucune notification de la demande.
- **Partage :** du texte uniquement. Les cartes image existent… sur le web seulement (`js/app/card.js`, en 1080×1350, pas au format story).
- **Liens de duel :** sur le web uniquement. Ils exigent d'avoir déjà au moins un ami invité. Celui qui rejoint devient participant, pas ami.
- **Clubs :** sur le web uniquement. Les membres ne voient que des annonces, sans noms, sans activité, sans défi de groupe.
- **Le chat de guilde coûte des crédits par message** (`GuildChat.tsx:38`). C'est un frein à la seule conversation du produit.
- **La carte publique `/u/<slug>`** se termine par « Découvrir TITAN », qui renvoie à l'accueil du site. Il n'y a pas de lien vers le Play Store ni de bouton « M'ajouter ».
- Pas d'**App Links** Android : l'app n'ouvre que les liens `titan://`, qu'un message WhatsApp ne rend pas cliquables.

**Prescription, par ordre d'impact**
1. **Des liens partout.** `https://titan-app.fr/ami/TN-AB12`, `/guilde/XXXX`, `/defi/…`, `/coach/…` :
   - si l'app est installée, l'App Link ouvre l'écran avec le code prérempli ;
   - sinon, la page web propose « Installer » vers le Play Store avec un paramètre `referrer` (le *Play Install Referrer*, gratuit), et l'app lit le code au premier lancement.
   Le coût : un `intentFilter` avec `autoVerify` et un fichier `assetlinks.json` sur Netlify (l'outillage existe déjà : `tools/build-public.mjs:171`).
2. **Corriger les deux bloquants** U5 et U6 (§3).
3. **Faire de la Communauté un onglet**, ou mettre une bande sociale sur le QG.
4. **Les cartes image sur Android**, au format story 9:16 et au format 4:5, avec un QR code et un lien : record, semaine tenue, insigne, maîtrise, Rétro.
5. **Les liens de duel sur Android, sans ami préalable.** « Défie n'importe qui avec un lien. » C'est le levier viral le plus naturel du produit.
6. **Le chat de guilde gratuit**, avec un plafond quotidien anti-abus (il existe déjà).
7. **Les clubs vivants** : défi de club (en réutilisant `titan_challenges` restreint à un club), contributions des membres sur consentement, classement interne à l'effort normalisé.
8. **La ligue hebdomadaire** : 20 à 30 personnes de cadence comparable, classées à l'effort normalisé, avec montée et descente le dimanche. Elle peut d'abord se limiter aux amis et à la guilde, avec la RPC `fair_ranking` existante, puis s'ouvrir au public avec consentement.
9. **Le parrainage récompensé en cosmétique** : « Invite 1 ami actif = cadre *Passeur* ; 3 amis = titre *Bâtisseur de cordée* ». Ça ne coûte rien et c'est désirable. Le badge Pionnier existe déjà (`sql/tests/300_pioneer_badge.sql`) : prolongez la logique.

### 4.10 Le coach — le canal de distribution, aujourd'hui inutilisable sur mobile

**Constat**
- Le coach existe **uniquement sur le web** : propositions de séances, modèles (100), messages, bilan hebdo, calendrier, analyse.
- **Le sportif sur Android ne voit pas les propositions de son coach** et ne peut pas y répondre.
- Le rattachement se fait par **un code privé de 48 caractères** à copier et coller (`coaching.js:273,302`).
- Pas de séances structurées (intervalles, séries prescrites).
- Les offres Coach (19,99 € et 39,99 €) ne sont pas en vente.

**Prescription**
1. **Une invitation par lien** : `titan-app.fr/coach/<jeton>`. Elle ouvre l'app, l'utilisateur accepte en un geste et choisit ce qu'il partage.
2. **« Mon coach » sur Android** : les séances proposées apparaissent dans le QG à leur date (« Proposé par Julie : 6 × 400 m »), avec un geste pour accepter ou décliner, et « Fait » relie la vraie séance. **Les RPC `assignments` existent déjà.**
3. **La séance prescrite devient une routine** : quand le coach propose une séance de musculation, le sportif la rejoue avec le formulaire prérempli. Les modèles de coach et les routines (§4.3) fusionnent naturellement.
4. **Le gratuit coach à 3 sportifs reste la porte d'entrée.** Le coach est le meilleur commercial de TITAN : chaque coach convaincu fait installer l'app à tous ses sportifs.

### 4.11 La présence sur Android — tout ce que la plateforme offre gratuitement

| Fonction | État | Valeur | Effort |
|---|---|---|---|
| **Widget d'écran d'accueil** (la semaine en encoches et un bouton « + ») | Absent | ⭐⭐⭐⭐⭐ C'est le rappel le plus puissant qui soit, et il est sans notification | M (Glance, avec un plugin de configuration Expo) |
| **Raccourcis d'app** (appui long sur l'icône : Séance, GPS, Refaire, Journal) | Absent en natif (seul le manifeste PWA en a) | ⭐⭐⭐⭐ | S (les liens `titan://` existent) |
| **Demande d'avis dans l'app** (In-App Review) | Absent | ⭐⭐⭐⭐⭐ La note Play Store est le premier facteur de conversion | S |
| **Actions dans la notification GPS** (Pause, Stop) | Partiel | ⭐⭐⭐ | S |
| **Notification de fin de repos** | Absent | ⭐⭐⭐⭐ pour la musculation | S |
| **App Links vérifiés** | Absent côté natif | ⭐⭐⭐⭐⭐ Prérequis de toute viralité | S |
| **Recevoir des fichiers GPX ou FIT partagés** depuis une autre app (filtre d'intention) | Absent | ⭐⭐⭐ Permet « Partager vers TITAN » depuis Garmin Connect, Komoot ou Coros | M (le format FIT demande un analyseur) |
| **Écrire dans Health Connect** (les séances TITAN visibles dans Samsung Health et Google Fit) | Absent | ⭐⭐⭐ Rend TITAN « source de vérité » de l'écosystème | M |
| **Mises à jour dans l'app** (In-App Updates) | Absent | ⭐⭐ | S |
| **Tuile de réglages rapides** « Démarrer le GPS » | Absent | ⭐⭐ Ça fait pro | M |
| **Retour prédictif, contrôle bord à bord** | Non configuré | ⭐⭐ Qualité perçue | S |
| **Captures tablette et pliable** | Absentes | ⭐⭐ Mise en avant possible sur ces appareils | S |

**Le cas Strava (coût quasi nul, impact viral majeur).** L'API d'upload de Strava est gratuite. Proposer « **Publier aussi sur Strava** » (une option, désactivée par défaut) transforme chaque séance de musculation ou d'escalade, que Strava gère mal, en vitrine. La description porte une signature facultative, par exemple : « Séance enregistrée avec TITAN · 5 exercices · 12 séries · titan-app.fr ». **C'est exactement ce que fait Hevy, et c'est l'un de ses principaux canaux d'acquisition.** Le coût : une fonction Netlify pour l'OAuth, sur le modèle de `garmin.mjs`, avec le chiffrement des jetons déjà écrit. Les quotas par défaut de l'API suffisent pour les premiers milliers d'utilisateurs.

### 4.12 La fiche Play Store — le premier écran de TITAN, pas le dernier

**Constat**
- **Deux textes de fiche contradictoires** : `docs/PLAY_CONSOLE.md` (de l'époque TWA, description courte de 87 caractères alors que la limite est 80, « sans pub ») et `mobile/docs/PUBLIER_PLAY_CONSOLE.md`.
- **Le titre** `TITAN — Ton sport réel` ne contient aucun mot-clé recherché.
- **Les captures** de `docs/play-store/` viennent **de l'app web**, sans texte d'accroche. La première montre « Bonjour, Athlète. » et la quatrième un bandeau « Mode découverte » : ce sont des messages techniques, pas des promesses.
- **L'image de présentation** dit « Ton sport réel. Une progression qui dure. » sans dire *ce que fait* l'app.
- Pas de fiche en anglais, pas de vidéo, pas de stratégie de mots-clés.

**Prescription : la fiche d'une top app**
- **Titre (30 caractères maximum)** : « TITAN : Sport, Muscu & Course » ou « TITAN – Journal sport & muscu ». Les mots-clés réels sont « suivi sport », « carnet muscu », « journal entraînement », « course à pied », « escalade ». Vos pages SEO ciblent déjà exactement ces mots : alignez-les.
- **Description courte (80 caractères maximum)** : « Muscu, course, escalade… Tous tes sports, une seule progression. »
- **8 captures de 1080×1920, issues de l'app native, chacune avec une accroche en 4 à 6 mots en haut :**
  1. « Tous tes sports. Un seul journal. » (les 260 sports, les pictogrammes 3D)
  2. « Ta séance muscu en 15 secondes. » (routine et valeurs fantômes)
  3. « Chaque effort compte pareil. » (l'effort normalisé : muscu = course = escalade)
  4. « Tes records, enfin comparables. »
  5. « Tiens ta semaine, sans culpabiliser. » (la cadence)
  6. « Ton effort fait avancer un monde. » (l'aventure, en 4e position et pas avant)
  7. « Progresse avec tes amis. » (guilde, défi)
  8. « Ton coach, dans ta poche. »
- **Une vidéo de 30 secondes** (une capture d'écran du téléphone suffit) : une séance enregistrée → la récompense → la semaine tenue → le monde qui s'illumine.
- **Une fiche personnalisée « Coachs »** (*custom store listing*, gratuit) pour les liens envoyés aux coachs.
- **Une fiche anglaise** dès que les textes sont extraits (§4.13).
- **La demande d'avis au bon moment** (§4.11) : visez **4,6 ou plus** dès le départ.

### 4.13 La qualité technique — passer de « robuste » à « observée »

| Sujet | Constat | Prescription (coût nul) |
|---|---|---|
| **Crashs** | Aucun outil. `ErrorBoundary` fait seulement un `console.error`. On compte sur les « vitals » de la Play Console, avec un échantillon insuffisant. | **Sentry**, offre gratuite (5 000 erreurs par mois), avec consentement et nettoyage des données personnelles. Ou au minimum, un compteur d'erreurs envoyé par une RPC existante. |
| **Funnel mobile** | **Aucune mesure sur Android** (« aucune mesure d'audience »). On pilote à l'aveugle. | Réutiliser `analytics_events` et le contrat d'événements du web, avec consentement : `signup`, `onboarding_completed`, `first_session`, `second_session`, `week_held`, `share`, `invite_sent`, `invite_accepted`. C'est une table qui existe déjà, pour zéro coût supplémentaire. |
| **Tableau de bord** | Aucun | Une vue SQL de cohortes (J1, J7, J30, semaine 4) consultée chaque lundi. **C'est le tableau de bord le plus important de l'entreprise.** |
| **Internationalisation** | Aucune bibliothèque. Les chaînes sont en dur et `"fr-FR"` est codé en dur environ 10 fois. `expo-localization` est chargé mais jamais utilisé. | **Extraire les chaînes maintenant** (i18n-js ou i18next), même sans traduire. Dans un an, ce sera dix fois plus cher. |
| **Thème** | Sombre uniquement | Acceptable : c'est une identité. Ne pas prioriser. |
| **Coût Supabase** | Pas de temps réel, peu de sondages réguliers. `DuoCard` relit à chaque affichage (`staleTime: 0`). `analytics_events` n'a pas de rétention. | Mettre un `staleTime` sur DuoCard, et une purge ou une agrégation des événements au-delà de 13 mois |
| **Performance** | Build minifié, images WebP légères. Le LCP de la page de connexion web atteint 3,75 s sur mobile. | Mesurer le démarrage à froid sur un téléphone d'entrée de gamme ; viser moins de 2 s |

### 4.14 Le ton et les textes — parler au joueur, pas à l'auditeur

Le ton de base est excellent (`lib/voice.ts` : chaleureux, sans culpabilisation). Mais **le vocabulaire de l'infrastructure fuit dans l'interface** :

| Texte actuel | Problème | Proposition |
|---|---|---|
| « Estimation : le serveur confirme l'XP réelle (plafonds 1 800/jour, 9 600/semaine) » (`SessionFormScreen.tsx:483`) | Ça parle de serveur et de plafonds au moment de l'effort | « ≈ 520 XP » (avec un « ? » qui ouvre « Comment ça marche ») |
| « TITAN a confirmé » / « XP confirmés par le serveur » (`SessionResultScreen.tsx:171,207`) | Méfiance implicite | « Bien joué. » |
| « retenus par précaution… si rien n'est trouvé » (`:180-181`) | Sonne comme une accusation de triche | « Tes récompenses arrivent bientôt » (et l'explication dans l'aide) |
| « Pas de 1RM estimé. » (`ExerciseEditor.tsx:157`) | Un choix d'ingénieur montré au joueur | À supprimer |
| « Rien n'est inventé. » (`GpsRecordScreen.tsx:216`) | Défensif | À supprimer |
| « Les sentiers attendent une connexion au serveur compatible » (`JourneyCard.tsx:36`) | Technique | « Connecte Santé Connect pour que tes pas fassent avancer les sentiers » |
| « coins » (`AdventureEncounters.tsx`) | Incohérent | « crédits » |

**La règle :** l'honnêteté de TITAN doit se voir dans les **règles**, pas dans les **disclaimers**. Tout ce qui explique une mécanique va dans une fiche « Comment ça marche », à un geste de distance.

---

## 5. Le moteur de croissance à zéro euro

### 5.1 Les boucles virales à installer

```
Séance ──▶ carte image (record / semaine tenue / insigne) ──▶ story Instagram avec lien
   ▲                                                            │
   │                                                            ▼
 Install ◀── Play Store (referrer) ◀── page /u/ ou /defi/ ◀── un ami clique
```

| Boucle | Mécanique | Coût |
|---|---|---|
| **Cartes image** | Générées sur l'appareil, format 9:16 et 4:5, lien et QR code | 0 € |
| **Duel par lien** | « Je te défie : 5 séances en 14 jours », envoyé par WhatsApp | 0 € (la RPC existe) |
| **Duo** | « Fais ton sport avec moi pendant 14 jours » : un pacte à deux | 0 € (il existe derrière un drapeau) |
| **Guilde** | Invitation par lien, objectif collectif | 0 € |
| **Coach vers ses sportifs** | Un coach fait installer 5 à 20 personnes | 0 € |
| **Strava « via TITAN »** | Signature dans la description des séances publiées sur Strava | Quasi 0 € |
| **Parrainage cosmétique** | Cadre ou titre exclusif pour 1 et 3 amis actifs | 0 € |

### 5.2 L'opération à lancer maintenant : TITAN Rétro 2026

Nous sommes le 15 novembre. **Le bilan de l'année est le moment le plus viral du calendrier sportif.**
- **Pour qui :** tous les utilisateurs, plus l'import des 12 derniers mois de Health Connect (lecture locale, déjà codée) et l'import GPX (déjà codé).
- **Le contenu, en 6 cartes au format story :**
  1. ton total d'effort de l'année ;
  2. ton ADN (la répartition par famille de sport) ;
  3. ta meilleure semaine ;
  4. ton record préféré ;
  5. tes semaines tenues ;
  6. ton monde et ton rang.
- **La phrase qui fait mouche** : « Ton effort réel en 2026 : 142 h, dont 61 h que ta montre n'a jamais comptées. »
- **Le coût :** zéro. Tout est calculé sur l'appareil avec le noyau partagé (`career.js`, `progress.js`). Les modèles de carte existent sur le web.
- **La date :** 1er décembre. Puis chaque année, ça devient un rendez-vous.

### 5.3 Les canaux gratuits, par ordre de rendement

1. **L'ASO** (§4.12). C'est le canal dominant pour une app sans budget.
2. **Les coachs et les salles**, en démarchage direct dans votre ville. Les box de CrossFit et de Hyrox, les salles d'escalade, les clubs d'athlétisme. On leur offre l'offre Coach pendant 6 mois.
3. **Le sport universitaire** : les BDS et associations sportives étudiantes. Un public jeune, multisport, très connecté, qui vit en groupe. **Une guilde par BDS, un défi inter-écoles à l'effort normalisé** : c'est équitable entre le rugby, l'escalade et la natation, ce qu'aucune autre app ne permet.
4. **Le SEO.** Les pages existent (journal d'entraînement, carnet de musculation, suivi escalade…). Ajouter :
   - « programme Hyrox débutant » ;
   - « combiner course et musculation » ;
   - « reprendre le sport après une pause » ;
   - des comparatifs honnêtes du type « TITAN ou Strava pour la muscu ? ».
5. **Les communautés** : Reddit (les communautés francophones de course, de musculation et d'escalade), Discord, forums. **Une présence de fondateur, pas de la publicité.**
6. **Un serveur Discord TITAN** : les premiers 500 utilisateurs deviennent cofondateurs du produit (sondages, accès anticipé, badge Pionnier). Ce sont vos ambassadeurs.
7. **La presse locale et spécialisée** : « Un étudiant de [ville] crée l'app qui met la muscu et la course sur un pied d'égalité. » Les journaux régionaux adorent ça.
8. **Le Baromètre de l'effort** (dès quelques milliers d'utilisateurs) : des données agrégées et anonymes, publiées une fois par trimestre. Du contenu de presse gratuit.

---

## 6. Monétisation sans IA ni coût marginal

### 6.1 La publicité : décider, puis être cohérent

**Ma recommandation reste de la retirer.** Elle s'affiche sur le QG, le Journal, les Stats et en interstitiel après la séance, donc au moment émotionnel le plus fort. À votre échelle, elle rapporte quelques euros par mois. Et elle contredit la promesse de marque.

**Si vous tenez à la garder** comme argument d'achat de TITAN+, alors :
- (a) alignez **tous** les textes le même jour (FAQ web, fiche Play, Data Safety, accueil) ;
- (b) **supprimez l'interstitiel après séance**, ne gardez qu'une bannière dans le Journal et les Stats, jamais sur le QG ni sur le résultat ;
- (c) ne l'activez qu'au-delà de 30 jours d'usage. Un nouvel utilisateur ne doit jamais voir de pub.

### 6.2 Un TITAN+ qui vaut 4,99 €, sans IA

Aujourd'hui, l'app promet « Analyses plus poussées, davantage de confort de personnalisation, aucune publicité ». Les analyses n'existent pas sur mobile. Voici ce qui peut être réservé, **calculé sur l'appareil, donc avec un coût marginal nul** :

| Avantage TITAN+ | Pourquoi les gens paient | Coût |
|---|---|---|
| **Charge et fraîcheur** (charge aiguë et chronique à partir de l'effort normalisé, équivalent multisport du CTL/ATL de TrainingPeaks) | C'est le graphique que tous les sportifs sérieux veulent, et **il n'existe en multisport nulle part** | 0 € (formule déterministe) |
| **Meilleurs efforts détaillés** (toutes distances, courbe de progression par distance) | L'équivalent de Strava Premium | 0 € |
| **Progression par exercice** (graphique de charge, volume, estimation de série) | L'équivalent de Hevy Pro | 0 € |
| **Comparaisons de périodes et bilans** (ils existent sur le web) | Pour les data-lovers | 0 € |
| **Routines illimitées** (5 en gratuit) | Pour les pratiquants de musculation | 0 € |
| **Thèmes de carte et d'app exclusifs** et une rotation de cosmétiques TITAN+ | La personnalisation | 0 € |
| **Rétro premium** (des cartes supplémentaires, l'export en haute définition) | Le moment de l'année | 0 € |
| **Sans publicité** (si vous la gardez) | — | — |

**Le pass de saison cosmétique (à considérer)** : à 2,99 € par saison de 28 jours, une piste cosmétique supplémentaire débloquée par l'effort. Aucune puissance, que de l'apparence. C'est compatible avec le « zéro pay-to-win ». Fortnite et Duolingo ont prouvé que ça marche. Ce sont des lignes de données et des visuels.

**Les prix** : 4,99 €/mois ou **34,99 €/an** (un mois et demi offert). L'annuel est essentiel : c'est lui qui crée la rétention payante.

### 6.3 Coach

- Garder **le gratuit jusqu'à 3 sportifs** comme porte d'entrée.
- **19,99 € pour 5 et 39,99 € pour 15**, c'est correct pour démarrer. Préparez une offre **Club** (au-delà de 15, sur devis) pour les salles.
- Le sportif rattaché reçoit TITAN+ : c'est **votre meilleur argument**. Mettez-le en tête des pages coach.

---

## 7. Le plan : 6 sprints de 2 semaines (environ 3 mois)

Tout est réalisable par l'équipe actuelle, sans coût d'infrastructure.

### Sprint 0 — Cette semaine : les urgences
- [ ] U1 à U10 (§3)
- [ ] Insérer l'expédition d'hiver et les saisons jusqu'à mars

### Sprint 1 — « Ouvrir les portes » (du 17 au 30 novembre)
- [ ] App Links, `assetlinks.json`, liens `/ami`, `/guilde`, `/defi`, `/coach`, Play Install Referrer
- [ ] Afficher le code de guilde, rendre le profil trouvable en un geste
- [ ] Mode découverte natif, et la création de compte proposée sur l'écran de résultat
- [ ] Ne plus bloquer sur la confirmation d'e-mail
- [ ] Funnel mobile (`analytics_events`), Sentry en offre gratuite, vue SQL des cohortes
- [ ] Demande d'avis In-App Review

### Sprint 2 — « TITAN Rétro et partage » (du 1er au 14 décembre)
- [ ] **TITAN Rétro 2026** (lancement le 1er décembre)
- [ ] Cartes image sur Android (story et 4:5) depuis le résultat, les records et la semaine
- [ ] Liens de duel sur Android, sans ami préalable
- [ ] La nouvelle fiche Play Store : titre, captures natives avec accroches, vidéo

### Sprint 3 — « La saisie parfaite » (du 15 décembre au 4 janvier)
- [ ] Routines et « Enregistrer comme routine »
- [ ] Valeurs fantômes de la dernière fois, série cochée, notification de repos
- [ ] Refaire par sport, 4 à 6 accès rapides, appui long sur le « + »
- [ ] Détection Health Connect sur le QG
- [ ] Escalade : puces de cotation, durée facultative
- [ ] *Bon timing : début janvier, c'est le pic annuel des installations d'apps de sport (bonnes résolutions).*

### Sprint 4 — « Revenir » (du 5 au 18 janvier)
- [ ] Le nouveau QG en 4 blocs
- [ ] Les notifications dynamiques et recalculées
- [ ] Le widget d'écran d'accueil (la semaine et le « + »), les raccourcis d'app
- [ ] La cadence récompensée (crédits), et la cadence visible sur l'écran de résultat

### Sprint 5 — « Le jeu qui dure » (du 19 janvier au 1er février)
- [ ] Brancher sur Android les quêtes périodiques, saisons, quête commune, objectif mondial, classement, intentions, titre et vitrine
- [ ] Un monde à la fois, report des jours, prestige « Ascension »
- [ ] Les étoiles après le niveau 10, le rang à 20, les jalons atteignables
- [ ] 28 nouveaux objets à l'Atelier, la vitrine hebdomadaire
- [ ] Les succès cachés, les trophées de collection côté serveur

### Sprint 6 — « Le cercle et le coach » (du 2 au 15 février)
- [ ] La Communauté en onglet, le chat de guilde gratuit, les clubs vivants (défi de club)
- [ ] Le parrainage cosmétique
- [ ] « Mon coach » sur Android (propositions, accepter, fait), l'invitation coach par lien
- [ ] La publication vers Strava, en option
- [ ] Ouvrir la vente de TITAN+ avec les avantages du §6.2

### Ensuite (le prochain trimestre)
- Écrire dans Health Connect, recevoir des fichiers GPX et FIT partagés
- Le meilleur effort à l'intérieur d'une sortie, la charge et la fraîcheur
- L'extraction i18n et la fiche anglaise
- La ligue hebdomadaire publique
- **iOS** (comme prévu), puis **l'IA** quand la base sera là

---

## 8. Ce qu'il faut arrêter ou geler

| Arrêter / geler | Pourquoi |
|---|---|
| **Les nouvelles fonctionnalités web-only** | Les quêtes, saisons, clubs, duels, cartes, classement et coach ont été construits sur le web, alors que l'app Android est le produit. **Chaque nouveauté doit d'abord exister sur Android.** |
| **Les nouveaux systèmes de progression** | Il y en a déjà 7. Il faut les relier et les mettre en scène, pas en ajouter un 8e. |
| **Les factions et le panthéon** | Sans masse critique, ils sont vides. À réactiver vers 5 000 utilisateurs actifs. |
| **Le podomètre maison** | Health Connect fait déjà ce travail. C'est un module natif à maintenir pour une donnée qui ne donne pas d'XP. |
| **Les audits « finaux » et les passations par lot** | Un seul document vivant par sujet. La v1 de ce rapport le disait, et la v2 aussi : **ce doit être le dernier audit avant 1 000 utilisateurs actifs.** |
| **Les textes juridiques ou techniques dans l'interface** | §4.14 |

---

## 9. Les indicateurs, et les cibles d'une top app

**L'étoile polaire : les semaines tenues par utilisateur actif.**

| Indicateur | Repères des apps de sport (ordre de grandeur) | Cible TITAN à 90 jours | Cible à 12 mois |
|---|---|---|---|
| Installation → 1re séance le jour même | Les meilleures dépassent 60 % | 60 % | 70 % |
| 2e séance dans les 7 jours | — | 50 % | 60 % |
| Rétention J30 | Moyenne des apps de fitness d'environ 8 à 12 % ; les meilleures entre 25 et 30 % | 20 % | 30 % |
| Rétention à la semaine 12 | — | 15 % | 25 % |
| Actifs pratiquant 2 familles de sport ou plus par mois | (C'est votre preuve de différenciation) | 35 % | 45 % |
| Semaines tenues sur 8, en moyenne chez les actifs | — | 4/8 | 5/8 |
| Partages par actif et par mois | — | 0,5 | 1,5 |
| Invitations acceptées par actif et par mois (facteur k) | — | 0,15 | 0,35 |
| Note Play Store | Les top apps dépassent 4,6 | ≥ 4,5 | ≥ 4,7 |
| Taux de sessions sans crash | Les top apps dépassent 99,5 % | 99,5 % | 99,8 % |
| Saisie de musculation (gestes) | Hevy : environ 10 avec une routine | ≤ 15 | ≤ 10 |
| Conversion TITAN+ à 60 jours | Une app freemium saine se situe entre 2 et 5 % | 2 % | 4 % |

*Les repères sont des ordres de grandeur du secteur, pas des chiffres audités. Ce qui compte, c'est de mesurer TITAN chaque lundi et de suivre la pente.*

---

## Conclusion

TITAN n'a pas un problème de puissance, il a un problème de **mise en scène et de connexion** :
- le serveur sait faire des quêtes, des saisons, des ligues, des duels et des cartes, mais le téléphone n'en montre presque rien ;
- la meilleure idée du produit (la cadence) ne rapporte rien et se cache derrière un bouton replié ;
- le partage ne contient pas de lien ;
- la fiche du store ne dit pas ce que fait l'app.

Rien de tout cela ne demande de l'argent, de l'IA ou iOS. Il faut **environ trois mois de travail produit concentré**, dans le bon ordre : d'abord les urgences, puis les portes (liens, invité, mesures), puis la Rétro de décembre, puis la saisie, puis le retour quotidien, puis le jeu qui dure, puis le cercle et le coach.

À la fin de ces trois mois, TITAN aura la **carrure** d'une top app : on l'adopte en une minute, on y revient chaque jour sans y penser, et on la montre à ses amis. Le reste (iOS, l'IA, l'international) se construira sur une base qui marche.
