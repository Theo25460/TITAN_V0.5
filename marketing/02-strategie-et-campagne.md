# TITAN Ascent — Stratégie de croissance et campagne de 30 jours

Version 1, 24 novembre 2026. Sources : `01-point-de-depart.md`, `research/concurrents.md`,
`research/audit-fiche-play-et-site.md`, `research/synthese-docs-drive.md`, inventaire du code (dépôt, commit `0dae9af`).

## 1. Ce que l'enquête a établi

### Ce qui rend TITAN immédiatement intéressant
- **L'XP vient uniquement d'un effort réel confirmé par le serveur.** Vérifié dans `js/core/effort.js` : XP = minutes
  d'effort × intensité ressentie, plafonnées. Les applis « level up » / « System » du moment (dans la lignée de Solo
  Leveling) et Habitica reposent sur la déclaration : on coche, on gagne.
- **Tous les sports se valent.** À effort et intensité égaux, une heure d'escalade rapporte autant qu'une heure de course
  (même formule, 260 sports). Strava valorise le GPS, Hevy la fonte, les applis de marche les pas.
- **Un univers peint original** (4 mondes, 36 balises, 4 gardiens, 7 rangs) qui avance avec les jours de pratique.
- **Des statistiques qui répondent à des questions** (« Est-ce que je m'entraîne plus qu'avant ? Oui. 3 h 41 contre
  2 h 17 ») plutôt que des graphiques muets.
- **Aucune pression** : pas de série à casser, une pause ne fait rien perdre, rien ne s'achète pour progresser, pas de
  publicité (écran d'accueil Android et site).
- **Français d'abord**, créé par un indépendant : aucun RPG sportif natif français identifié.

### Ce qui risque de faire partir les nouveaux venus (à dire franchement)
1. **L'application Android n'est pas publique.** Dernière version distribuée : 1.2.1 en test fermé ; la 1.4.0 est en
   examen. Le lien Google Play donné en brief ne sert donc pas de destination aujourd'hui. **Conséquence : la campagne
   envoie vers titan-app.fr**, qui fonctionne dans le navigateur de n'importe quel téléphone (Android et iPhone) avec
   le même compte.
2. **Activation faible** : 5 comptes sur 23 ont fait une séance (22 %). Inscription à confirmer par e-mail (7 comptes
   jamais confirmés), 6 à 7 écrans avant la première séance sur Android.
3. **Messages contradictoires** sur le site : la FAQ de /fonctionnalites dit « application web installable », /titan-plus
   dit « Bientôt disponible » alors que la vente est ouverte côté serveur ; deux brouillons de fiche Play opposés sur la
   publicité. Le nom « TITAN Ascent » n'apparaît nulle part en public (tout dit « TITAN »).
4. **Social vide au démarrage** : amis, défis et guildes existent mais il n'y a presque personne.
5. **Pas d'import automatique** (Strava seulement par fichier, Garmin non validé) : les sportifs équipés de montre
   doivent saisir à la main.
6. **Aucun compte social TITAN** n'existe ; aucune mesure côté Android (pas d'install referrer, pas d'analytics).

### Messages qui attireraient le mauvais public
- « Deviens un chasseur de rang S », « le Système t'a choisi » : attire des curieux de l'anime sans pratique sportive,
  et frôle la marque Solo Leveling.
- « Perds 10 kg », « transforme ton corps » : promesse que TITAN ne tient pas et public fitness transformation.
- Toute mention de prix, d'iOS natif ou d'une date de sortie Play non confirmée.

### Preuves concrètes que l'on peut montrer
Vrais écrans React Native de l'application (banc d'aperçu officiel du dépôt) avec un **compte de démonstration** :
confirmation d'XP par le serveur, record battu, montée de niveau, balise allumée, tendances, 4 mondes, 260 sports,
semaine type avec pause. Chaque vidéo porte la mention « Écrans réels · compte de démonstration ».

## 2. Publics

| | Profil | Envie ou problème | Pourquoi maintenant |
| --- | --- | --- | --- |
| **Prioritaire** | 16-30 ans francophones qui font déjà du sport (muscu, course, calisthenics, sports co) et aiment les jeux vidéo, l'anime, les systèmes de progression | « Je veux voir ma progression comme dans un jeu, mais pour de vrai » | La tendance « level up your life / System » est massive sur TikTok, et les applis existantes sont déclaratives : TITAN est la version honnête |
| Secondaire 1 | Pratiquants de sports « oubliés » des grandes applis : escalade, natation, yoga, sports de raquette, sports co | « Mon appli ne comprend pas mon sport » | 260 sports à égalité : argument unique et vérifiable |
| Secondaire 2 | Personnes qui reprennent le sport après une pause | « Je lâche dès que je casse ma série » | Pas de série, la pause ne coûte rien : rare et rassurant |

## 3. Positionnement et messages

- **Proposition de valeur** : *Ton vrai sport fait avancer une aventure. Chaque séance compte, aucune XP ne s'achète.*
- **Arguments** : effort réel vérifié ; tous les sports se valent ; un monde peint qui se rallume ; des stats qui
  répondent ; zéro pression ; gratuit, sans publicité.
- **Objections et réponses**
  - « Encore une appli de gamification gadget » → montrer la confirmation serveur et les vraies stats.
  - « Mon sport n'y est pas » → 260 sports, chacun ses mesures.
  - « Je n'ai pas le temps de tout saisir » → saisie courte, « Refaire » une séance ; GPS sur Android.
  - « Je n'ai pas Android / l'appli n'est pas sur le Store » → titan-app.fr marche dans le navigateur, même compte.
  - « C'est payant ? » → gratuit, sans publicité, rien à acheter pour progresser.

## 4. Concepts de campagne étudiés

| Concept | Idée | Force | Faiblesse |
| --- | --- | --- | --- |
| A. **« Aucune triche »** | Opposer l'XP déclarative à l'XP gagnée | Différenciation nette, débat en commentaires | Peut sonner défensif seul |
| B. **« Rallume le monde »** | Chaque vraie séance rallume une balise d'un monde peint | Visuellement fort, unique, lore partageable | Moins concret sur l'utilité |
| C. « 30 jours d'Ascension » | Défi public suivi par le créateur | Feuilleton, preuve réelle | Demande au créateur de se filmer chaque jour : contraire au brief |
| D. « Fait seul, en France » | Build in public du créateur | Sympathie, presse locale | Dépend d'informations personnelles et de la présence du créateur |

**Choix : B + A fusionnés → « Rallume le monde. Pour de vrai. »**
L'univers (B) arrête le défilement et donne une identité qu'aucun concurrent n'a ; la preuve « pour de vrai » (A)
répond au scepticisme et attire des sportifs réels plutôt que des curieux. Les deux se montrent avec les vrais écrans,
sans que le créateur ait à apparaître. D est gardé en contenu ponctuel (1 vidéo par semaine au plus, si le créateur le
souhaite).

- **Promesse en 3 secondes** : « Ton vrai sport fait avancer une aventure. »
- **Accroche principale** : « Dans TITAN, l'XP ne se coche pas. Elle se gagne. »
- **Angle émotionnel** : chaque séance, même petite, rallume quelque chose ; la pause n'éteint rien.
- **Angle pratique** : un journal multisport rapide et des stats qui disent si tu progresses.
- **Signature** : « TITAN Ascent — Rallume le monde. Pour de vrai. » ; hashtag de campagne `#RallumeLeMonde`.

## 5. Les trois leviers à tester en priorité

1. **Vidéos courtes « moment réel »** (TikTok, Reels, Shorts) : un vrai moment de l'appli (XP confirmée, balise,
   montée de niveau) précédé d'une accroche « jeu vidéo ». Mesure : rétention 3 s, vues complètes, visites profil,
   clics bio (UTM). Impact fort, coût faible, mesurable.
2. **Conversion du trafic** : un seul lien (titan-app.fr avec UTM), un parcours « Commencer · 2 minutes », et les
   corrections de cohérence du site listées dans `05-actions-createur.md`. Mesure : comptes créés et activés par
   source. Indispensable avant d'accélérer.
3. **Bouche-à-oreille encadré** : recrutement de testeurs Android (nécessaire pour la mise en production Play si le
   compte développeur est personnel : 12 testeurs pendant 14 jours) et défis entre amis (fonction existante). Mesure :
   inscrits testeurs, invitations, défis créés.

## 6. Canaux et rôles

| Canal | Rôle | Cadence | Remarque |
| --- | --- | --- | --- |
| TikTok | Portée, découverte (public prioritaire) | 1 vidéo par jour | Ajouter un son tendance dans l'appli au moment de publier |
| Instagram Reels + carrousels | Preuve, sauvegardes, profil vitrine | 1 Reel par jour + 2 carrousels par semaine | Même fichier vidéo |
| YouTube Shorts | Longue traîne, recherche | 1 Short par jour | Même fichier, titre propre |
| titan-app.fr | Conversion | — | Lien unique avec UTM |
| Communautés (clubs, associations, forums) | Testeurs, crédibilité | 2-3 contacts par semaine | Messages personnalisés, jamais en masse |
| Micro-créateurs FR (2k-50k) | Portée qualifiée | 5 contacts ciblés en semaine 2 | Sans rémunération sans accord du créateur |

Écartés pour ces 30 jours : X/Twitter, Facebook, LinkedIn (public moins aligné, dispersion), publicité payante (budget 0).

## 7. Parcours utilisateur et mesures

| Étape | Ce qui se passe | Mesure | Source |
| --- | --- | --- | --- |
| Découverte | Vidéo vue dans le fil | Vues, rétention 3 s, vues complètes | Statistiques natives / Buffer |
| Intérêt | Visite du profil, sauvegarde, commentaire | Visites profil, sauvegardes | Natif |
| Visite | Clic sur le lien en bio | Visites avec `utm_source` | GA4 (avec consentement) + `analytics_events` |
| Inscription | Compte créé | Comptes créés | Supabase `auth.users` |
| Première action | 1re séance confirmée sous 7 jours | **Athlètes activés (métrique principale)** | Supabase `training_receipts` |
| Retour | 2e séance sous 7 jours | Retour J7 | Supabase |
| Recommandation | Ami invité, défi créé | Amitiés, défis | Supabase `friends`, `titan_challenges` |

Objectif : **+20 athlètes activés** entre le 25/11 et le 24/12/2026 (5 → 25), **+92 comptes** en cible haute. Limite :
la source d'un compte n'est connue que si la personne accepte la mesure sur le site ; le reste est estimé par
concordance de dates, jamais présenté comme une preuve.

## 8. Plan des 30 jours

- **Semaine 1 (J1-J7) — Lancement « Rallume le monde »** : 7 vidéos, 2 carrousels. Tester 4 angles : aucune triche,
  monde, stats, sports.
- **Semaine 2 (J8-J14) — Doubler ce qui marche** : 3 variantes de la meilleure accroche, 1er appel à testeurs Android,
  premiers contacts créateurs et clubs.
- **Semaine 3 (J15-J21) — Communauté** : défi `#RallumeLeMonde` (1 balise = 1 jour actif, à partager en Story),
  questions/réponses en commentaires vidéo, carrousel lore.
- **Semaine 4 (J22-J30) — Preuve et conversion** : retours de testeurs réels (avec accord écrit), récap de la
  campagne, « Ton année en images » (fonction existante) pour la fin d'année.

Points d'ajustement : J4 (premiers signaux de rétention), J8, J15, J22 ; règle : une accroche qui fait moins de 50 % de
la rétention 3 s médiane est remplacée.

Le calendrier détaillé est dans `03-calendrier.md`.
