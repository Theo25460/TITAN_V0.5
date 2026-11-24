# Audit du parcours d'acquisition public — TITAN Ascent

Date de l'audit : 24 novembre 2026. Méthode : Playwright (Chromium, sans throttling) depuis un conteneur cloud, WebFetch,
WebSearch, lecture du dépôt pour recouper. Tout ce qui n'a pas pu être vu est marqué **NON ACCESSIBLE**. Aucune donnée
n'a été inventée.

Captures : `marketing/research/shots/` (liste en fin de document).

---

## 0. Résumé en 10 lignes

1. **Fiche Google Play : NON ACCESSIBLE depuis cette session.** `play.google.com` est bloqué par le proxy réseau du
   conteneur (HTTP 403 « no rule or network setting allows this host ») et par WebFetch (ENOTFOUND). Aucun moteur de
   recherche n'indexe `fr.titanapp.app`. Je ne peux donc affirmer ni que la fiche est publique, ni qu'elle ne l'est pas.
2. Aucune note, aucun nombre d'avis, aucune tranche d'installations n'a pu être relevé : **à relever à la main**
   (grille en § 1.2).
3. **Le site ne contient aucun lien vers Google Play.** Zéro lien sortant sur les 5 pages auditées. C'est volontaire dans
   le code (`tools/data/play-store.json` → `"url": ""`), mais cela coupe le parcours site → appli Android.
4. **Contradiction majeure** : `/fonctionnalites` répond « C'est une application web installable » et `/service`
   explique l'installation via Chrome/Safari, alors que `/titan-plus` dit que les abonnements s'achètent « uniquement
   dans l'application Android, avec Google Play » — sans dire où la trouver.
5. **Le nom « TITAN Ascent » n'apparaît nulle part en public** : le site, le manifeste PWA, le JSON-LD et
   `mobile/app.config.ts` disent « TITAN ». Le brouillon de fiche du dépôt dit « TITAN — Ton sport réel ».
6. Promesse du site : claire en 5 s pour « journal multisport », beaucoup moins pour la couche RPG (aucun visuel de
   l'appli au-dessus de la ligne de flottaison sur mobile ; le mot « RPG » n'est que dans la balise meta).
7. Vitesse correcte : LCP 2,1 s (mobile, cache froid), 0,6 s (desktop) ; CLS 0.
8. Prix : **aucun prix affiché nulle part** (« Tarif affiché par Google Play ») ; TITAN+ marqué « bientôt ».
9. Réseaux sociaux : **aucun lien sur le site, aucun compte trouvé** en recherche web (TikTok, Instagram, YouTube).
10. Pas de liste d'attente.

---

## 1. Fiche Google Play — `fr.titanapp.app`

### 1.1 Ce que j'ai tenté

| Tentative | Résultat |
| --- | --- |
| Playwright Chromium, `…details?id=fr.titanapp.app&hl=fr&gl=FR` puis `&hl=en` | `net::ERR_TUNNEL_CONNECTION_FAILED` (2 essais chacun) |
| `curl` direct | `HTTP/1.1 403 Forbidden (agent proxy: no rule or network setting allows this host)` |
| WebFetch `…&hl=fr` | `getaddrinfo ENOTFOUND play.google.com` (hôte hors des domaines autorisés de la session) |
| Miroirs (AppBrain, APKPure), google.com | bloqués par le même proxy |
| WebSearch `"fr.titanapp.app"` | aucun résultat pertinent (homonymes « Titan » uniquement) |
| WebSearch `"TITAN Ascent" app` | aucun résultat pertinent |

**Conclusion exacte** : l'état de la fiche est **inconnu**. Le fait qu'aucun moteur de recherche n'indexe le package
est compatible avec une fiche non publiée (test interne / fermé) ou publiée très récemment, mais ne le prouve pas.
Pour lever le doute : autoriser `play.google.com` dans les réglages réseau de la session, ou ouvrir l'URL en navigation
privée, non connecté à un compte testeur (un compte testeur voit une fiche que le public ne voit pas).

Indices dans le dépôt (pas des observations de la fiche) :
- `docs/PLAY_CONSOLE.md` § 7 : si le compte développeur est personnel, test fermé obligatoire (12 testeurs, 14 jours)
  avant la production.
- Dernier commit : « Play Console accepts the release for review » → une version a été soumise à examen ; piste et
  statut non visibles d'ici.
- `tools/data/play-store.json` est vide : l'équipe n'a donc pas encore déclaré la fiche publique côté site.

### 1.2 Grille à remplir à la main (rien n'a pu être relevé)

| Champ | Valeur observée |
| --- | --- |
| Nom affiché | NON ACCESSIBLE |
| Développeur | NON ACCESSIBLE (mentions légales du site : « équipe TITAN », contact `titanteam.app@gmail.com`) |
| Icône | NON ACCESSIBLE (icône du dépôt : double chevron cyan sur fond sombre `#05070A`) |
| Description courte | NON ACCESSIBLE |
| Description complète | NON ACCESSIBLE |
| Captures (nombre, ordre, contenu) | NON ACCESSIBLE |
| Note / nombre d'avis | NON ACCESSIBLE |
| Tranche d'installations | NON ACCESSIBLE |
| Dernière mise à jour | NON ACCESSIBLE |
| Classification (PEGI) | NON ACCESSIBLE |
| Mention achats intégrés / annonces | NON ACCESSIBLE |
| Catégorie | NON ACCESSIBLE (manifeste PWA : `sports, health, lifestyle` ; JSON-LD : `SportsApplication`) |
| Accès anticipé / test fermé / public | NON ACCESSIBLE |

### 1.3 Référence interne : le brouillon de fiche du dépôt (non vérifié en ligne)

`docs/play-store/README.md` (« Textes de la fiche (V1.3.1) ») contient :
- Nom : `TITAN — Ton sport réel` (22 car.) — **différent de « TITAN Ascent »**.
- Description courte : `Journal multisport : séances, records et une aventure qui avance avec toi.` (74 car.).
- Captures prêtes : 6 téléphones 1080×1920 + 1 image de présentation 1024×500 :
  1. `phone-01-qg.png` — QG, « Bonjour, Athlète. », carte « Nouveau record · Course à pied : plus longue distance 12,1 km »
  2. `phone-02-seance.png` — enregistrer une séance
  3. `phone-03-stats.png` — Progrès, « Tes questions »
  4. `phone-04-aventure.png` — « Ton monde réagit », mondes gratuits, carte de la vallée de l'Aube
  5. `phone-05-journal.png` — journal du mois
  6. `phone-06-records.png` — records par sport
- Les captures sont des écrans bruts, **sans légende ni cadre** ; aucune ne montre le rang / l'XP en gros plan.

Incohérences à trancher **avant** de publier ces textes :
- Le brouillon dit « L'application gratuite affiche des publicités, jamais pendant une séance » ; le site public (page
  `/titan-plus`, changelog du 18/11/2026) dit « l'application Android n'affiche aujourd'hui aucune publicité ».
  Une seule des deux phrases peut être vraie pour la version en ligne.
- Le brouillon dit « TITAN+ retire la publicité… » ; le site dit TITAN+ « bientôt disponible », « aucun paiement
  n'est possible ». Or un commit du dépôt (e618026) indique des paiements ouverts côté serveur le 19/11/2026 : à
  vérifier, et à aligner partout le même jour.

---

## 2. Site `https://titan-app.fr/`

### 2.1 Mesures (Playwright, réseau du conteneur, sans throttling : ordres de grandeur seulement)

| Page | Vue | HTTP | TTFB | FCP | LCP | load | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 390×844 (1er chargement, cache CDN froid) | 200 | 936 ms | 2 048 ms | 2 128 ms | 2 219 ms | 0 |
| `/` | 1440×900 | 200 | 51 ms | 260 ms | 596 ms | 696 ms | 0 |
| `/fonctionnalites` | mobile | 200 | 191 ms | 244 ms | 980 ms | 969 ms | 0 |
| `/titan-plus` | mobile | 200 | 161 ms | 240 ms | 240 ms | 239 ms | 0 |
| `/motivation-sport` | mobile | 200 | 210 ms | 336 ms | 348 ms | 322 ms | 0 |
| `/defis-sportifs` | mobile | 200 | 201 ms | 248 ms | 264 ms | 252 ms | 0 |

- HTML accueil : 40 Ko ; image du héros `valley-hero-1600.webp` : 150 Ko, cache 30 jours (Netlify Edge).
- Console : 4 erreurs par page, toutes identiques — la CSP bloque le RUM Netlify
  (`ingesteer.services-prod.nsvcs.net/rum_collection`). Sans effet pour l'utilisateur ; à nettoyer (désactiver le RUM
  Netlify ou l'autoriser dans `connect-src`).
- Aucune requête en échec, aucun 404 sur les pages auditées.

**Verdict vitesse** : pas un frein. Le seul chargement lent est le premier (cache CDN froid).

### 2.2 La promesse en 5 secondes

Ce que voit un visiteur mobile (capture `site-home-mobile.png`) :
- Sur-titre : « Journal multisport · progression · aventure »
- H1 : « Ton sport réel. / Une progression qui dure. »
- Paragraphe de 5 lignes, CTA « Commencer · 2 minutes », « Voir comment ça marche »,
  « Gratuit · Site sans publicité · Sans carte bancaire · Essai sans compte ».
- Bandeau cookies (Google Analytics) en bas, qui occupe ~170 px du premier écran.

Lecture :
- **Clair** : c'est un journal de sport, gratuit, multisport.
- **Flou** : la couche RPG. Sur mobile, **aucun écran de l'appli n'est visible** au-dessus de la ligne de flottaison ;
  la carte d'exemple (« Gardien · niveau 11 », XP, record 10 km) n'apparaît que sur desktop, à droite. Le mot « RPG »
  n'est que dans la meta description (« une progression façon RPG »), jamais dans la page.
- **Absent** : que c'est (aussi) une application Android.

### 2.3 Lien Android / Google Play

- **Aucun lien vers Google Play, sur aucune des pages auditées** (`/`, `/fonctionnalites`, `/titan-plus`,
  `/motivation-sport`, `/defis-sportifs`) ni dans le menu ou le pied de page. Aucun lien sortant du tout.
- Le code prévoit un lien (« Télécharger sur Google Play » en pied de page, bande « TITAN existe aussi sur Android »
  sur Android, `MobileApplication` dans le JSON-LD), allumé seulement quand `tools/data/play-store.json` contient
  l'URL exacte `https://play.google.com/store/apps/details?id=fr.titanapp.app`. Aujourd'hui l'URL est vide → rien.
- `/.well-known/assetlinks.json` répond **404** en production (le build le génère pourtant). À vérifier si des
  liens d'application Android (App Links) sont voulus.
- Mentions de l'Android dans le texte visible : uniquement pour dire que TITAN+ et Coach s'achètent « uniquement dans
  l'application Android, avec Google Play », et que l'appli Android « n'affiche aujourd'hui aucune publicité ».
- **Contradiction** :
  - `/fonctionnalites`, FAQ « TITAN est-il une application mobile ? » → « C'est une application web installable :
    depuis ton navigateur, ajoute-la à l'écran d'accueil. Elle fonctionne hors ligne. »
  - `/service`, « Comment installer TITAN sur mon téléphone ? » → « Android (Chrome) : menu ⋮ puis « Installer
    l'application ». iPhone (Safari) : bouton Partager puis « Sur l'écran d'accueil ». »
  - Un visiteur Android est donc envoyé vers la PWA, pas vers le Play Store.

### 2.4 Mentions iOS (texte exact)

- Texte visible : **aucune mention d'iOS / iPhone / App Store** sur les 5 pages auditées.
- `/service` (FAQ visible + JSON-LD) : « iPhone (Safari) : bouton Partager puis « Sur l'écran d'accueil ». »
- JSON-LD de l'accueil (invisible) : `"operatingSystem":"Web, Android, iOS (navigateur)"`.
- Aucune promesse d'appli iOS native, aucune liste d'attente iOS.

### 2.5 Parcours d'inscription

1. CTA « Commencer » (en-tête) ou « Commencer · 2 minutes » (héros, y = 474 px sur mobile, visible sans défiler)
   → `/onboarding`.
2. `/onboarding` étape « 1 · Tes sports » : « Qu'est-ce que tu pratiques ? », 16 sports proposés + recherche,
   bouton « Passer ». Pas de compte demandé (capture `site-onboarding-step1-mobile.png`).
3. `/login` : e-mail + mot de passe, « Créer un compte », « Continuer avec Google », « Essayer sans compte »
   (« Mode découverte : tes séances restent sur cet appareil »).

Lecture : le chemin web est court et sans friction visible. Mais **il ne mène jamais à l'appli Android** : toute
l'acquisition web nourrit la PWA. Données internes (`marketing/01-point-de-depart.md`) : 7 comptes sur 23 n'ont jamais
confirmé leur e-mail — la confirmation par e-mail reste un point de fuite à surveiller.

### 2.6 Cohérence avec l'appli

| Élément | Site | Appli / dépôt |
| --- | --- | --- |
| Nom | « TITAN » partout (titre, logo, JSON-LD, manifeste) | `app.config.ts` : `name: "TITAN"` ; brouillon fiche : « TITAN — Ton sport réel » ; campagne : « TITAN Ascent » |
| Slogan | « Ton sport réel. Une progression qui dure. » | identique dans l'image de présentation Play |
| Publicité | « aucune aujourd'hui » dans l'appli Android | brouillon fiche : « L'application gratuite affiche des publicités » |
| TITAN+ | « bientôt », aucun paiement possible | commit du 19/11 : paiements ouverts côté serveur (à vérifier) |
| Plateforme | « application web installable » | appli Android native (`platforms: ["android"]`) |

### 2.7 Pages demandées

- **`/fonctionnalites`** — titre « Fonctionnalités : journal, statistiques, progression | TITAN ». Contient la FAQ
  « application web installable » (contradiction ci-dessus). Aucun lien Play.
- **`/titan-plus`** — H1 « TITAN+ — Bientôt disponible. Le cœur de TITAN est gratuit. »
  Prix exacts affichés :
  - Classique : **« 0 € sans limite de durée »**
  - TITAN+ : **« Tarif affiché par Google Play »**
  - Coach (5 sportifs) : **« Tarif affiché par Google Play »**
  - Coach Ultra (15 sportifs) : **« Tarif affiché par Google Play »**
  - Aucun montant en euros pour les offres payantes, aucune mention mensuel/annuel, pas d'essai gratuit annoncé.
  - Le JSON-LD déclare TITAN+ `availability: ComingSoon`.
  - Phrase clé : « L'abonnement se souscrit uniquement dans l'application Android, avec Google Play, qui affiche le
    prix avant tout achat. Tant que l'achat n'y est pas ouvert, aucun paiement n'est possible. » — sans lien.
- **`/motivation-sport`** — « Garder la motivation pour le sport, sans culpabiliser | TITAN ». Cadence choisie,
  pauses sans pénalité, quêtes facultatives. Aucun lien Play.
- **`/defis-sportifs`** — « Défis sportifs entre amis, quêtes et expéditions | TITAN ». Défis en minutes d'effort ou
  jours actifs, quêtes hebdo/mensuelles, TITAN Duo (14 jours à deux), saisons de 28 jours, expéditions. Aucun lien Play.
- **`/sitemap.xml`** — 27 URL, sans `<lastmod>`. Priorités : `/` 1.0 ; `/fonctionnalites`, `/titan-plus` 0.9 ;
  pages sport/guide 0.6–0.8 ; légales 0.2–0.3. Toutes les pages auditées y figurent.
- **`/robots.txt`** — tout autorisé, mais il liste en clair des chemins internes (`/sys_core_override_99.html`,
  `/sql/`, `/tools/`, `/functions/`). Un `Disallow` signale ces chemins à quiconque lit le fichier : à retirer du
  robots.txt et à protéger côté serveur s'ils existent en production.

### 2.8 Réseaux sociaux et liste d'attente sur le site

- **Aucun lien vers un réseau social** (ni en-tête, ni pied de page, ni `sameAs` dans le JSON-LD).
- **Aucune liste d'attente**, aucun formulaire de capture d'e-mail sur les pages publiques auditées.

### 2.9 Freins évidents (par ordre d'impact)

1. Aucun chemin site → Google Play, et une FAQ qui oriente vers la PWA.
2. Nom incohérent (TITAN / TITAN — Ton sport réel / TITAN Ascent) : un visiteur qui cherche « TITAN Ascent » sur le
   Play Store ou sur le web ne trouvera pas le site, et inversement.
3. Couche RPG invisible sur mobile au premier écran.
4. Bandeau cookies qui couvre ~20 % du premier écran mobile.
5. Aucune preuve sociale (normal à ce stade : 23 comptes), aucun réseau pour suivre le projet.

---

## 3. Comptes sociaux existants

Recherches effectuées (WebSearch) : `"TITAN Ascent" app`, `titan-app.fr`, `"fr.titanapp.app"`,
`"titanascent" OR "@titanascent" instagram OR tiktok OR youtube`, `"titanapp" sport RPG application française tiktok
instagram`, `"TITAN Ascent" tiktok OR instagram OR youtube sport`, `TITAN application suivi sportif 260 sports
progression RPG "titan-app.fr"`.

Résultat : **aucun compte TITAN Ascent trouvé** sur TikTok, Instagram ou YouTube. Les résultats ne renvoient qu'à des
homonymes sans lien (Titan Athlete, TitanTLM, Titan Workout Tracker, mur d'escalade TITAN d'EP Climbing, etc.).
Le site `titan-app.fr` lui-même n'apparaît pas dans ces résultats de recherche.

Vérification directe des pseudos `tiktok.com/@titanascent`, `instagram.com/titanascent`, `youtube.com/@titanascent`,
`tiktok.com/@titanapp.fr`, `instagram.com/titanapp.fr` : **NON ACCESSIBLE** (hôtes bloqués par le proxy). Ces pseudos
peuvent donc exister sans être indexés, ou être libres : à vérifier à la main avant de les réserver.

---

## 4. Corrections prioritaires

### P0 — à faire avant toute campagne

1. **Vérifier à la main l'état de la fiche** (navigation privée, hors compte testeur) et remplir la grille § 1.2.
   Si la fiche n'est pas publique, **ne pas envoyer de trafic payant ou social vers Google Play** : envoyer vers
   `titan-app.fr/onboarding` (essai sans compte) et faire du recrutement de testeurs (12 sur 14 jours si compte
   personnel) un objectif de campagne à part entière.
2. **Fixer un seul nom.** Demande de la campagne : « TITAN Ascent », exactement. Le reporter partout le même jour :
   titre Play, `app.config.ts` (`name`, nom sous l'icône), `manifest.json` (`name`, `short_name`), `<title>`, JSON-LD
   (`Organization.name`, `WebApplication.name`), logo texte, image de présentation, mentions légales. Pas de mots-clés
   ajoutés au titre.
3. **Allumer le lien Play** dès que la fiche est publique : renseigner `tools/data/play-store.json` puis
   `node tools/build-public-site.mjs && node tools/build-public-docs.mjs` (procédure du fichier). Ajouter aussi un
   badge officiel « Disponible sur Google Play » **dans le héros** (pas seulement en pied de page).
4. **Réécrire la FAQ « TITAN est-il une application mobile ? »** et l'entrée « Comment installer TITAN » de
   `/service` : Android → Google Play (lien) ; iPhone → version web à ajouter à l'écran d'accueil.
5. **Aligner publicité et TITAN+** entre fiche, site, CGU et appli (§ 1.3).

### P1 — fiche Play (à appliquer à la publication)

#### Description courte (≤ 80 caractères, comptés)

| # | Texte | Car. | Angle |
| --- | --- | --- | --- |
| A | `Journal multisport : tes séances font avancer une aventure RPG.` | 63 | le plus explicite sur le RPG — **recommandé** |
| B | `Note tes séances, gagne de l’XP, rallume quatre mondes. Gratuit.` | 64 | verbe d'action, mécanique de jeu |
| C | `260 sports, records datés et une aventure qui avance avec tes séances.` | 70 | sportif sérieux d'abord |

À tester avec les expériences de fiche Play (Store listing experiments) quand le trafic le permettra (pas avant
quelques centaines de visiteurs de fiche par semaine, sinon résultat illisible).

#### Description complète — proposition (toutes les affirmations sont reprises du site public ; les crochets sont à garder ou retirer selon la version publiée)

> **TITAN Ascent transforme tes vraies séances de sport en progression de jeu de rôle.** Course, musculation,
> escalade, natation, padel : tu enregistres ce que tu fais vraiment, ton rang monte, ta maîtrise grandit sport par
> sport et quatre mondes se rallument au rythme de tes jours actifs. Ici, seul l'effort fait avancer.
>
> **TON JOURNAL, SPORT PAR SPORT**
> • 260 sports, chacun avec ses mesures : séries, charges et RIR ; distance, allure et import GPX ; cotations
> d'escalade françaises, Fontainebleau et V-scale.
> • Saisie en quelques secondes, même sans réseau.
> • Records datés, avec la séance qui les a établis.
> [• Enregistrement GPS de ta sortie. — seulement si présent dans la version publiée]
>
> **UNE PROGRESSION DE RPG, HONNÊTE**
> • Sept rangs, de l'Éclaireur à la Légende. À trois séances de 45 min par semaine : Sentinelle en 2 mois,
> Gardien en 6 mois, Titan en 4,5 ans.
> • Dix paliers de maîtrise par sport.
> • Quatre mondes, trente-six balises, quatre gardiens. Tous gratuits.
> • Tu choisis ta cadence. Une semaine en pause ne compte ni pour ni contre toi : pas de série toxique.
>
> **DES STATS QUI RÉPONDENT**
> Chaque semaine, TITAN Ascent répond à tes vraies questions : est-ce que je progresse ? mon allure s'améliore-t-elle ?
> ma semaine est-elle chargée ? Et il montre sur quelles séances repose la réponse.
>
> **AVEC LES AUTRES, SANS TOUT MONTRER**
> • Défis entre amis en minutes d'effort ou en jours actifs, sans rien à perdre.
> • Expéditions de saison avec toute la communauté, guilde, Moments partagés si tu le choisis.
> • Coaching consenti : le coach propose, il ne modifie jamais ton journal.
> • Privé par défaut : amis sur demande acceptée, profil public désactivé.
>
> **GRATUIT POUR DE BON**
> Le journal, les statistiques, la progression et les quatre mondes sont gratuits, sans limite de durée.
> [TITAN+ ajoute des comparaisons sur 4, 12 ou 26 semaines, des bilans mensuels et annuels et plus de routines.
> — seulement quand l'achat est ouvert]
> Aucun abonnement ne donne d'XP, de crédits ni d'avance : la progression ne s'achète pas.
> [Phrase sur la publicité : à écrire selon la version publiée — voir § 1.3]
>
> Ton compte fonctionne aussi sur titan-app.fr. Fait en France. TITAN Ascent n'est pas un dispositif médical.

Remarques : la 1re phrase porte le message RPG (c'est ce que Google et le visiteur lisent d'abord). Mots-clés
naturellement présents sans bourrage : journal, sport, musculation, course, escalade, RPG, progression, défis.

#### Séquence de captures (légendes ≤ 6 mots)

| Ordre | Écran | Légende | Mots | Existe ? |
| --- | --- | --- | --- | --- |
| 1 | Aventure : carte d'un monde avec balises allumées | « Tes séances rallument quatre mondes » | 5 | oui (`phone-04`), à refaire avec quelques balises allumées |
| 2 | Rang + barre d'XP + insigne (type carte « Gardien · niveau 11 » du site) | « Sept rangs, aucune progression achetée » | 5 | **non : à produire** |
| 3 | QG avec nouveau record | « Ton vrai sport fait progresser » | 5 | oui (`phone-01`) |
| 4 | Enregistrer une séance | « Enregistre une séance en secondes » | 5 | oui (`phone-02`) |
| 5 | Progrès « Tes questions » | « Des réponses, pas des graphiques » | 5 | oui (`phone-03`) |
| 6 | Records par sport | « Records datés, séance source incluse » | 5 | oui (`phone-06`) |
| 7 | Choix des sports / journal multisport | « 260 sports, chacun ses mesures » | 5 | oui (`phone-05`) |
| 8 | Défis entre amis / confidentialité | « Défis entre amis, privé par défaut » | 6 | **non : à produire** |

Principes : les deux premières captures doivent montrer le RPG (c'est la différence avec Strava, Hevy, etc.) ;
légende en haut, grande, sur fond sombre cohérent avec l'appli ; même ordre et mêmes légendes en anglais si une fiche
`en-US` est ajoutée. Image de présentation : garder « Ton sport réel. Une progression qui dure. », ajouter le nom
« TITAN Ascent » et un élément d'écran (barre d'XP ou carte de monde).

### P2 — site

1. Héros mobile : placer sous le CTA une capture d'écran de l'appli (rang + XP ou carte d'un monde) ; ajouter le mot
   « RPG » ou « jeu de rôle » dans le sur-titre (ex. « Journal multisport · progression façon RPG »).
2. Bandeau cookies : version compacte (une ligne + 2 boutons) sur mobile.
3. Ajouter les réseaux sociaux (pied de page + `sameAs` JSON-LD) **une fois les comptes créés et alimentés**.
4. Nettoyer la CSP / le RUM Netlify (erreurs console).
5. Retirer les chemins internes de `robots.txt` ; vérifier pourquoi `assetlinks.json` est en 404 en production.
6. Ajouter `<lastmod>` au sitemap.

### P3 — réseaux sociaux

Réserver le même pseudo sur TikTok, Instagram et YouTube (vérifier d'abord la disponibilité de `@titanascent`,
non vérifiable d'ici), avec en bio le lien `titan-app.fr/onboarding?utm_source=…` tant que la fiche Play n'est pas
publique, puis le lien Play ensuite.

---

## 5. Ce qui n'a pas pu être vérifié

- Toute la fiche Google Play (contenu, statut, chiffres) : hôte bloqué.
- Existence réelle des pseudos sociaux : hôtes bloqués ; seule la recherche web a été faite (aucun résultat).
- Données Play Console (installations, visiteurs de fiche) : pas d'accès.
- Mesures de vitesse sur un vrai téléphone en 4G : non faites (mesures conteneur, sans throttling).

## 6. Captures produites (`marketing/research/shots/`)

- `site-home-mobile.png`, `site-home-mobile-full.png` (390×844, facteur 1)
- `site-home-desktop.png`, `site-home-desktop-full.png` (1440×900)
- `site-fonctionnalites-{mobile,desktop}.png`, `site-titan-plus-{mobile,desktop}.png`,
  `site-motivation-sport-{mobile,desktop}.png`, `site-defis-sportifs-{mobile,desktop}.png`
- `site-onboarding-step1-mobile.png`, `site-login-mobile.png`
- Aucune capture Play Store (page non chargée).
