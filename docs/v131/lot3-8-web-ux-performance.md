# Lots 3 et 8 · Application Web privée — UX, performance mesurée, accessibilité, stabilité

État au 15/11/2026. Périmètre : pages privées (`aujourdhui`, `training`, `journal`, `stats`, `records`, `carriere`, `objectifs`, `prevoir`, `adventure`, `profile`, `social`, `coaching`, `boutique`, `onboarding`, `login`, `update-password`, `athlete`, `defi`), `js/app/*.js` (sauf `crest.js`), `js/*.js` (sauf GPX, import/export et `ga4-consent.js`), `css/*.css`, `sw.js`. Références : [`cahier-reference.md`](cahier-reference.md), [`vocabulaire.md`](vocabulaire.md), [`lot6-textes-juridique.md`](lot6-textes-juridique.md).

## 1. Méthode et limites (à lire avant les tableaux)

- **Builds.** Copie du dépôt dans `/var/tmp/titan-web-base/` (état avant ce lot, 14/11) et `/var/tmp/titan-web/` (état après), `node tools/build-public.mjs` dans chaque copie. Le `dist/` partagé du dépôt n’a pas été reconstruit.
- **Serveurs de mesure.** Serveurs statiques locaux reproduisant `netlify.toml` : Brotli, `Cache-Control` par dossier, adresses sans `.html` ; l’un en HTTP/1.1, l’autre en HTTP/2 avec TLS (certificat auto-signé), parce que la production sert en HTTP/2 (vérifié par `curl` sur `titan-app.fr`). **Ce n’est pas Netlify** : pas de CDN, pas de distance réseau réelle.
- **Mesures.** (a) Lighthouse 12, Chromium 153 sans interface, limitation *simulée* (mobile : 4G lente 1,6 Mbit/s, 150 ms, processeur ×4 ; ordinateur : `--preset=desktop`). (b) Limitation *appliquée* par le protocole de Chromium (mêmes débits, processeur ×4, émulation Moto G4), LCP/CLS/tâches longues lus par les API Performance, médiane de 4 passes, première visite puis visite suivante (cache HTTP chaud, service worker bloqué). Les requêtes vers Supabase et Google sont bloquées : aucune lecture de production. État mesuré : session découverte, sans compte.
- **Captures.** Chromium, 360, 768 et 1280 px ; session découverte vide puis avec 60 séances fictives ; compte connecté synthétique (Supabase intercepté). Paires avant/après : [`captures-web/`](captures-web/) (JPEG ≤ 150 Ko). Les captures de pleine page montrent la barre d’onglets fixe au milieu de l’image : c’est un effet de la capture.
- **Ce qui n’a pas été fait** : aucun téléphone réel, aucun lecteur d’écran, aucun compte réel, aucun essai sur Netlify. **Aucune note de simplicité n’est validée par des humains** (UX-131-06 et 07) : ce document livre des corrections et des preuves automatiques, pas un « 8/10 ».
- Les validations intermédiaires de la branche (`wip(web-ux)`) ont été faites par le responsable de la branche pendant le lot ; aucune commande git d’écriture n’a été lancée ici.

## 2. Mesures de départ (14/11/2026, avant ce lot)

Lighthouse, limitation simulée, HTTP/1.1, une passe :

| Page | Profil | Score | FCP | LCP | TBT | CLS | Poids transféré | Requêtes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` (accueil public, mesure seule) | mobile | 99 | 0,91 s | 2,26 s | 42 ms | 0,000 | 211 Ko | 12 |
| `/` | ordinateur | 100 | 0,26 s | 0,56 s | 0 ms | 0,000 | 302 Ko | 12 |
| `/aujourdhui` | mobile | 83 | 1,11 s | 4,75 s | 42 ms | 0,000 | 461 Ko | 55 |
| `/aujourdhui` | ordinateur | 99 | 0,43 s | 0,96 s | 0 ms | 0,000 | 531 Ko | 55 |
| `/training` | mobile | 81 | 2,91 s | 4,14 s | 33 ms | 0,009 | 435 Ko | 47 |
| `/training` | ordinateur | 99 | 0,60 s | 0,87 s | 0 ms | 0,005 | 435 Ko | 47 |
| `/profile` | mobile | 83 | 1,89 s | 4,54 s | 55 ms | 0,000 | 462 Ko | 56 |
| `/profile` | ordinateur | 99 | 0,39 s | 0,93 s | 0 ms | 0,005 | 462 Ko | 56 |
| `/adventure` | mobile | 80 | 1,47 s | 5,36 s | 14 ms | 0,000 | 688 Ko | 78 |
| `/adventure` | ordinateur | 96 | 0,65 s | 1,34 s | 0 ms | 0,000 | 877 Ko | 78 |

Constats de départ : 33 à 34 scripts par page (274 Ko compressés), polices 113 Ko ; le contenu principal est dessiné par JavaScript après le dernier script ; huit fichiers partagés étaient appelés sous deux ou trois clés `?v=` selon la page (`ascension-app.css`, `main.js`, `app/data.js`, `core/progress.js`, `renaissance-engine.js`, `renaissance-catalog.js`, `app/card.js`, `app/analytics.js`) et donc téléchargés plusieurs fois. Axe (WCAG 2.0 à 2.2, A et AA), 20 pages × 2 états × 2 largeurs : 4 échecs, tous sur `adventure` (`target-size`).

## 3. Re-contrôles de stabilité (15/11/2026)

Méthode : Chromium piloté par Playwright sur le build de `/var/tmp/titan-web`, compte synthétique, Supabase simulé par interception (aucune écriture réelle). Scripts d’expérience hors dépôt (`scratchpad/web/exp*.mjs`) ; ce qui est devenu un test est cité.

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Boucle d’enregistrement du profil (PR #133) | Aucune écriture sans modification ; pas de réessai en boucle | 6 pages ouvertes 23 s sans action : 0 appel `titan_save_profile_state`, aucun appel après le chargement. Modification réelle de la semaine type : 2 appels pour 2 valeurs distinctes | Aucun | — | Aucune | `exp1.mjs`, `exp2.mjs` ; `tests/profile-sync-backoff.test.mjs` (22 tests), `tests/e2e/profile-sync.e2e.mjs` | Vérifié conforme |
| Conflit de version `40001` | Une tentative, copie locale gardée, pas de réessai automatique ni au rechargement | 1 appel en 40 s, panneau de récupération affiché, 0 appel après rechargement | Aucun | — | Aucune | `exp2.mjs` (mode 40001) ; `profile-sync.e2e.mjs` | Vérifié conforme |
| Serveur en erreur 503 / réseau coupé | Réessai borné et espacé | 503 : 2 appels en 40 s (le second à 30 s) ; réseau coupé : 1 appel, reprise au retour du réseau | Aucun | — | Aucune | `exp2.mjs` ; test « automatic retries stop after six failures » | Vérifié conforme |
| Fenêtre héritée « Bienvenue dans TITAN OS » | Rien ne couvre le QG d’un nouveau compte | **Reproduit** : tout compte connecté qui ne l’avait pas vue recevait une fenêtre modale de huit blocs (vocabulaire retiré : « boss », « guilde », « Boutique », « charge, fraîcheur, radar »), icônes vides, lien vers une page supprimée, et une écriture du profil à la fermeture | Parcours de première connexion masqué | **P0** | Fenêtre retirée (`js/ui.js`), remplacée par trois lignes dans le QG | `before-auth/auth-aujourdhui-360.png` ; test « a signed-in new account lands on a readable QG » (`tests/e2e/v131-web-ux.e2e.mjs`) | Corrigé et vérifié |
| Service worker après un déploiement : page et scripts | Jamais d’ancienne page avec de nouveaux scripts, ni l’inverse | Déploiement A → B : dès le premier affichage, page, scripts (`rev=`) et styles (clé changée) sont ceux de B | Aucun | — | Aucune | `exp_sw.mjs` | Vérifié conforme |
| Service worker après un déploiement : feuille de style dont la clé `?v=` n’a pas changé | Styles à jour | **Reproduit** : le premier affichage après le déploiement sert l’ancienne feuille depuis le cache (à jour à l’affichage suivant). La nouvelle version restait ensuite « en attente » indéfiniment tant que le bouton n’était pas pressé, avec 2 à 3 générations de cache conservées (≈ 3 Mo chacune) | Styles périmés un affichage ; stockage | P1 | `js/pwa.js` : une version en attente est appliquée au démarrage de la page suivante (jamais sur une page déjà utilisée) ; clés de styles unifiées et changées. Reste : le build n’ajoute `rev=` qu’aux scripts — **à faire par : intégration (`tools/build-public.mjs`)**, ajouter l’empreinte aux feuilles de style | `exp_sw.mjs`, `exp_sw4.mjs` (rechargement automatique 1,1 s après le chargement, une seule génération de cache ensuite) ; `tests/pwa-update.test.mjs` (5 tests) | Corrigé et vérifié (mesure locale) ; reste côté build |
| Changement de compte pendant une écriture | Rien du compte A n’arrive chez B | Séance de A en vol, déconnexion, connexion de B, réponse tardive : journal de B vide, XP inchangée, aucune requête de séance avec le jeton de B, file de A invisible pour B | Aucun | — | Aucune | `exp5.mjs` ; `session-routine-isolation`, `qg-context`, `moment-context-focus` | Vérifié conforme |
| Double clic sur « Enregistrer » | Une séance | Double clic puis Entrée : 1 appel `titan_submit_training_session`, 1 séance | Aucun | — | Aucune (garde déjà en place) | `exp3.mjs` ; test « a double click on Enregistrer sends one session » | Vérifié conforme |
| Retour arrière sur la page Séance | Retour du formulaire vers la liste des sports | **Reproduit** : le choix d’un sport remplaçait l’entrée d’historique ; Retour quittait la page vers le QG | Navigation imprévisible | P1 | `js/app/seance.js` : le formulaire est une étape d’historique ; Retour montre la liste et garde le brouillon, Avancer le rouvre ; après enregistrement, un seul Retour quitte la page | tests « session page: Back returns… » et « …without a dead history step » | Corrigé et vérifié |
| Hors ligne | Pages servies par le cache, séance gardée puis envoyée une fois | 152 ressources en cache ; 6 pages s’ouvrent hors ligne ; séance saisie hors ligne : « Confirmation en attente », 0 envoi ; après rechargement hors ligne toujours en file ; au retour du réseau 1 envoi, 1 identifiant, statut confirmé | Aucun | — | Aucune | `exp6.mjs` ; `smoke.e2e.mjs`, `queue-503-retry`, `authenticated-session-resume` | Vérifié conforme (Chromium, réseau simulé) |

## 4. Matrice UX par page et par état

Preuves : `cw/` = [`captures-web/`](captures-web/) ; tests = `tests/e2e/` sauf mention ; « capture avant » hors dépôt = `/tmp/…/scratchpad/web/before/` (102 captures prises avant toute modification).

### 4.1 Pages refaites ou corrigées

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QG · première connexion d’un compte | Comprendre TITAN et savoir où cliquer en 10 s (UX-131-02) | Fenêtre modale héritée par-dessus le QG (voir § 3) | Premier écran masqué | P0 | Fenêtre retirée ; le QG porte l’explication | `cw/04-premiere-connexion-360.jpg` ; test « a signed-in new account lands on a readable QG » | Corrigé et vérifié |
| QG · compte neuf, 360 px | Une action, ce qu’est TITAN, le rang ; pas de chiffres vides | Action unique présente, mais trois zéros (« 0 séance », « 0 min », « pas encore d’historique »), « Cadence 0/8 », rang et niveau sous la ligne de flottaison, trois raccourcis sans indication sur deux lignes | Blocs concurrents, jargon | P1 | Une ligne de présentation ; bande « Niveau N · rang » avec barre d’XP en tête ; action du jour ; trois tuiles qui disent où elles mènent ; « Comment ça marche » en trois lignes ; semaine réduite à la cible ; « Ascension » fusionnée dans la bande | `cw/01-qg-compte-neuf-360.jpg`, `cw/11-qg-premier-ecran-360x740.jpg` (bouton visible à 360 × 740 sans défilement) ; tests « a new account reads what TITAN does… », « the rank strip keeps… » (`qg-context`) | Corrigé et vérifié |
| QG · compte régulier | Progression, semaine, mission, gains récents (V13-40) | Rang et XP en 6ᵉ bloc, une seule « Dernière séance » sans gain, modules facultatifs (pas, intentions, quêtes, saison, classement) avant la progression | Hiérarchie | P1 | Ordre : rang → action → tuiles → semaine → « En cours » (objectif, chapitre) → trois dernières séances avec leur gain → sports → modules facultatifs → repères | `cw/02-qg-compte-regulier-360.jpg`, `cw/03-qg-1280.jpg` ; 22 tests `qg-context`, `qg-shortcuts`, `activation`, `populated-accounts` | Corrigé et vérifié |
| QG · gains récents | Rien d’affiché comme gagné avant confirmation (ANTI-IA-03) | Aucun gain affiché | Information absente | P2 | « +N XP » seulement si la séance est confirmée ; « XP en attente », « XP en vérification », « ≈ N XP estimés » (découverte), « Historique · sans XP » sinon | test « recent sessions show official XP only once the server confirmed them » | Corrigé et vérifié |
| QG · libellés | Sans jargon | « Cadence 8/8 · 14 semaines tenues au total », « vs tes 4 dernières semaines à ce stade », « Rang estimé · découverte » | Abréviations | P2 | « 8 semaines tenues sur les 8 dernières · 14 au total », « de plus / de moins que d’habitude à ce stade », « ≈ 713 / 5 135 XP · estimation » | `cw/02` | Corrigé et vérifié |
| QG · hors ligne, changement de compte, lecture en échec | États utiles | Note « Hors ligne », brouillon repris, séances refusées signalées, objectifs d’un autre compte jamais affichés | Aucun | — | Aucune | 22 tests `qg-context` ; `exp6.mjs` | Vérifié conforme |
| Séance · choix du sport | Sélection simple, relance en 2 gestes (V13-47) | Recherche, « Tes sports », « Refaire », familles ; 2 gestes pour relancer | Aucun | — | Aucune | capture avant `training-pop-360` ; `sport-first`, `catalog-cache` | Vérifié conforme |
| Séance · Manuel / GPX / Garmin | Voies évidentes quand elles sont disponibles | Le sélecteur « Manuel · GPX / Garmin » existe mais dépend du réglage serveur `screens.activityhub`, éteint par défaut ; Garmin dépend de `screens.garmin` | Voies invisibles tant que les réglages sont éteints (décision du propriétaire) | P1 | Aucune dans ce lot : activer un réglage serveur est une décision de publication. **À faire par : propriétaire** | `activity-hub.e2e.mjs` (réglage simulé) | En attente d'approbation |
| Séance · retour arrière | Voir § 3 | | | P1 | | | Corrigé et vérifié |
| Séance · résultat | Effort → résultat → récompense confirmée → suite (V13-43) | Contenu honnête (attente explicite, XP seulement après le reçu serveur) mais « +508 XP » écrit deux fois (carte et anneau), pas de phrase de suite, intertitres « Ton effort » / « Et ensuite ? » | Répétition, suite absente | P1 | Trois parties : « Tu as fait » (mesures, records), « Ce que ça change » (gain confirmé une seule fois, dans l’anneau ; semaine, maîtrise, chapitre), « Et ensuite ? » (une phrase : ce qui reste, ou « Rien à faire ») ; les états sans chiffre ne sont plus en corps 40 | `cw/05-resultat-seance-confirme-360.jpg`, `cw/06-resultat-seance-en-attente-360.jpg` ; tests « a double click… reads: done, changed (confirmed), next », « a session the server has not confirmed shows no XP figure at all », `first-session-confirmation`, `moment-context-focus` | Corrigé et vérifié |
| Aventure · mission | Une carte dominante en haut : monde, chapitre, action, progression, apport, bouton (RPG-131-01) | Sur téléphone la mission venait après la note de mode, les onglets des mondes et la carte ; ce qu’il reste à faire était en petit sous les barres ; titre « Ton monde réagit » | Mission sous la ligne de flottaison | P1 | Mission avant la carte (dans la page et à l’écran), « À faire : … » en tête, barres, bouton unique, « Ce que ça apporte », puis le récit ; titre « Ton aventure » et une ligne d’explication | `cw/07-aventure-chapitre-360.jpg`, `cw/08-aventure-chapitre-1280.jpg` ; test « adventure: the mission card comes before the map… » ; 55 tests des fichiers `rpg-*`, `adventure-rpg`, `periodic-quests`, `journey-v13`, `activation`, `personas` | Corrigé et vérifié |
| Aventure · vocabulaire | « crédits » | « ni XP ni coins » | Terme interdit | P2 | « sans XP ni crédits supplémentaires » | `rpg-progression.e2e.mjs:82` | Corrigé et vérifié |
| Aventure · clavier | Le focus suit l’action | Après « Commencer la campagne », le focus retombait en haut de la page | Parcours clavier | P2 | Focus sur le titre de la mission, conservé aux rafraîchissements | même test | Corrigé et vérifié |
| Profil · en-tête | Une fiche de personnage lisible | Blason seul sous l’avatar, niveau à l’autre bout, bouton entre les deux (1280 px) | Éléments dispersés | P2 | Identité, puis blason à côté du niveau et de sa barre, puis « Personnaliser » | `cw/09-profil-360.jpg`, `cw/10-profil-1280.jpg` ; `profile-passport` (3 largeurs, texte à 200 %) | Corrigé et vérifié |
| Profil · déconnexion de Garmin (lot 2) | Dire si Garmin a confirmé le retrait | La réponse `provider` était ignorée | Erreur avalée | P2 | Message persistant dans « Sources connectées » et notification : retrait confirmé, ou étape restante dans Garmin Connect (mêmes phrases qu’Android) | `profile-showcase` : 3 nouveaux tests « garmin disconnect: Garmin did not confirm… » et le test du retrait confirmé complété | Corrigé et vérifié (réponses simulées) |
| Profil · « Health Connect » | « Santé Connect » | Nom anglais | Vocabulaire | P2 | Corrigé | `profile-showcase.e2e.mjs` | Corrigé et vérifié |
| Profil · contraste | 4,5:1 | Libellé du personnage choisi sous le seuil (axe) | WCAG 1.4.3 | P2 | Couleur du libellé | `axe2.mjs` | Corrigé et vérifié |
| Atelier · textes TITAN+ (lot 6) | Vrais avant et après l’ouverture de l’achat | « bientôt disponible… », « affichés par Paddle », « 20 sportifs… au lieu de 3 », lien « TITAN+ · bientôt » | Voir lot 6 | P1 | Textes du lot 6 appliqués ; test `launch-decision` mis à jour avec le texte | `tests/launch-decision.test.mjs`, `atelier-retry.e2e.mjs` | Corrigé et vérifié |
| `js/main.js` · messages hérités (lot 6) | Accents, pas de nom interne | « deja », « Elite », « Paddle » | Voir lot 6 | P2 | Corrigés | `js/main.js:675,966,982,995,1013` | Corrigé, non testé en conditions réelles (branche éteinte) |
| Mise à jour de l’application (`js/pwa.js`) | Libellés français | « Nouvelle version - recharger », « Installer TITAN OS », « Ajouter a l ecran d accueil » | Accents, nom retiré | P2 | Corrigés | `js/pwa.js` | Corrigé et vérifié (relecture) |

### 4.2 Pages contrôlées sans modification

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Accueil d’un nouveau compte (`onboarding`) | Première victoire en moins de 2 minutes, « plus tard » possible | Étapes courtes, « Passer » toujours offert, aucune connexion de capteur imposée | Aucun | — | Aucune | capture avant `onboarding-empty-360` ; `onboarding-resume`, `activation` | Vérifié conforme |
| Connexion, inscription, nouveau mot de passe | Parcours au clavier, erreurs annoncées | Connexion au clavier seul réussie ; axe 0 sur les états en erreur | Aucun | — | Aucune | `kbd.mjs`, `axe2.mjs` ; `auth-google` | Vérifié conforme |
| Progrès · semaine (`stats`) | Tendances utiles, unités non mélangées, estimé signalé | Jours actifs, temps et séances séparés ; « en partie estimée », « Temps déclaré ou estimé » ; comparaison au même moment de la semaine précédente | Aucun | — | Aucune | captures avant `stats-pop-360`, `stats-pop-1280` ; `week-focus`, `weekly-detail` | Vérifié conforme |
| Journal, Records, Carrière, Objectifs, Prévoir | États vides utiles, une action | États vides avec une action, axe 0 connecté et en découverte | Aucun | — | Aucune | captures avant ; `axe.mjs`, `axe2.mjs` | Vérifié conforme |
| Communauté, Coaching | Clarté et confidentialité | Coaching : « Rien n’est partagé sans ton accord explicite, révocable » et « peut tout arrêter à tout moment » au premier écran ; Communauté : présentation et création de compte, aucune donnée d’un tiers en découverte | Aucun | — | Aucune | captures avant `social-empty-360`, `coaching-empty-360` ; lot 1 pour les règles serveur | Vérifié conforme |
| Carte publique (`athlete`), défi (`defi`) | Lisibles, axe 0 | Conformes | Aucun | — | Aucune | `axe.mjs` ; `athlete-recovery`, `duel-links` | Vérifié conforme |

### 4.3 Contrôles anti-clichés sur les écrans refaits (LOT 6 TER)

« PASS » = défaut recherché absent des captures citées ; **aucun de ces contrôles n’a été confirmé par un test de compréhension avec de nouveaux utilisateurs.**

| Contrôle | QG | Résultat de séance | Aventure | Profil |
| --- | --- | --- | --- | --- |
| ANTI-IA-01 halos, dégradés | PASS : aucun halo ajouté ; fond de carte existant conservé (`cw/01`) | PASS (`cw/05`) | PASS (`cw/07`) | PASS (`cw/09`) |
| ANTI-IA-02 empilement de cartes | PASS avec réserve : 2 cartes (rang, action) puis des listes sans cadre ; les modules facultatifs gardent leurs cartes | PASS : une carte de gain, une carte de records | Réserve : six panneaux sous la mission, inchangés | PASS : en-tête, 3 chiffres, 4 groupes repliés |
| ANTI-IA-03 gains avant confirmation | PASS (test « recent sessions… ») | PASS (tests « no XP figure at all », `first-session-confirmation`) | PASS : insigne dit « cosmétique, sans XP ni crédits » | sans objet |
| ANTI-IA-05 marketing creux | PASS : « Ton journal de sport : chaque séance… » | PASS | PASS : « Choisis un monde : chaque jour actif y allume une balise » | PASS |
| ANTI-IA-06 tableau de bord qui noie l’action | PASS : un bouton principal (test « one primary action on the QG ») | PASS : un bouton principal | PASS : un bouton principal dans la mission | PASS |
| ANTI-IA-07 mélange d’icônes | PASS : icônes au trait existantes, blason approuvé | PASS | PASS | PASS |
| ANTI-IA-08 animations inutiles | PASS : aucune nouvelle animation (les blocs ajoutés reprennent l’apparition existante, coupée par « Réduire les animations ») ; l’anneau de gain ne joue qu’une fois, sur gain confirmé | PASS | PASS | PASS |
| ANTI-IA-10 parcours | PASS au clavier et au pointeur (tests) ; **non vérifié avec des personnes** | idem | idem | idem |

ANTI-IA-04 et ANTI-IA-09 : aucune illustration ni section d’offre ajoutée ou modifiée dans ce lot.

## 5. Performance après, et comparaison

### 5.1 Limitation appliquée, HTTP/2, Moto G4 émulé, médiane de 4 passes (ms)

| Page | Visite | LCP avant | LCP après | FCP avant → après | Tâches longues > 50 ms (TBT approché) avant → après | CLS avant → après | Poids avant → après |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/aujourdhui` | première | 3 014 | 3 020 | 2 192 → 2 056 | 60 → 52 | 0,001 → 0,001 | 458 → 459 Ko |
| `/aujourdhui` | suivante | 398 | 418 | 238 → 250 | 0 → 0 | 0 → 0 | 14 → 14 Ko |
| `/training` | première | 2 566 | 2 702 | 2 480 → 2 592 | 0 → 0 | 0,013 → 0,000 | 431 → 434 Ko |
| `/training` | suivante | 386 | 380 | 364 → 348 | 0 → 0 | 0 → 0 | 13 → 13 Ko |
| `/profile` | première | 3 018 | 3 142 | 1 946 → 1 794 | 3 → 8 | 0,000 → 0,000 | 476 → 478 Ko |
| `/profile` | suivante | 434 | 474 | 266 → 250 | 0 → 1 | 0 → 0 | 14 → 14 Ko |
| `/adventure` | première | 4 858 | **2 830** | 2 130 → 1 796 | 82 → 83 | 0,000 → 0,003 | 875 → 876 Ko |
| `/adventure` | suivante | 580 | 582 | 272 → 250 | 22 → 21 | 0 → 0 | 14 → 14 Ko |

Lecture honnête : **seule l’Aventure progresse** (LCP de première visite −2,0 s sur téléphone : le premier écran est désormais la mission en texte, la carte illustrée passe dessous ; les 4 passes « avant » vont de 3,8 à 5,6 s, les 4 « après » de 2,81 à 2,86 s). QG, Séance et Profil : **pas d’amélioration** ; les écarts (+0 à +140 ms) sont dans la dispersion des passes, sans qu’un léger recul sur Séance et Profil puisse être exclu. Le poids et le nombre de requêtes par page ne changent pas.

### 5.2 Lighthouse, limitation simulée, HTTP/2, une passe

| Page | Profil | Score avant → après | LCP avant → après | TBT avant → après | CLS avant → après | Requêtes |
| --- | --- | --- | --- | --- | --- | --- |
| `/` (accueil public, mesure seule) | mobile | 99 → 99 | 2,00 → 2,00 s | 0 → 0 ms | 0 → 0 | 12 |
| `/aujourdhui` | mobile | 81 → 84 | 4,56 → 4,57 s | 5 → 0 ms | 0 → 0 | 55 |
| `/aujourdhui` | ordinateur | 99 → 99 | 1,02 → 1,02 s | 0 → 0 ms | 0 → 0 | 55 |
| `/training` | mobile | 83 → 83 | 4,10 → 4,15 s | 11 → 19 ms | 0,009 → 0,009 | 47 |
| `/profile` | mobile | 85 → 84 | 4,44 → 4,45 s | 15 → 22 ms | 0 → 0 | 56 |
| `/adventure` | mobile | 81 → 82 | 5,03 → 4,73 s | 17 → 27 ms | 0 → 0 | 78 |
| `/adventure` | ordinateur | 97 → 97 | 1,32 → 1,29 s | 0 → 0 ms | 0 → 0 | 78 |

Le modèle simulé de Lighthouse est plus sévère que la limitation appliquée (4,1 à 5,0 s contre 2,6 à 3,1 s) ; les deux disent la même chose : le LCP mobile de première visite est fixé par ~275 Ko de scripts (33 à 34 fichiers, dont le moteur hérité `titan_features.js` 44 Ko et la bibliothèque Supabase 49 Ko) qu’il faut recevoir avant le premier dessin. Une passe intermédiaire du QG a montré un CLS de 0,06 introduit par ce lot (ligne de présentation qui déplaçait le bloc) : corrigé, 0,000 sur 3 passes.

### 5.3 Ce qui a été essayé

| Essai | Résultat mesuré | Décision |
| --- | --- | --- |
| Unifier les clés `?v=` des 8 fichiers partagés | Parcours de 6 pages (QG, Séance, Profil, Aventure, Progrès, Journal), cache HTTP chaud : 962 → 887 Ko transférés (−75 Ko) ; liste hors ligne du service worker 153 → 143 entrées | Gardé |
| Précharger l’image du bandeau du QG (ordinateur) | LCP ordinateur 964 → 1 004 ms (3 passes chacune) | Retiré |
| Précharger le fond du bandeau (`contours.svg`) | LCP mobile simulé 4 356 → 4 356 ms | Non retenu |
| Retirer la fenêtre héritée de `js/ui.js` | 68,5 → 61,6 Ko bruts (−1 Ko compressé) | Gardé (raison UX) |
| Mission avant la carte sur l’Aventure | Voir 5.1 | Gardé |

### 5.4 En-têtes de cache et service worker (constat, `netlify.toml` hors périmètre)

Production relevée par `curl` le 15/11 : HTTP/2, Brotli ; pages `max-age=0, must-revalidate` ; `/css/*`, `/js/*`, `/assets/*` 7 jours + `stale-while-revalidate` 1 jour ; `/image/*` 30 jours ; `sw.js` `no-cache`. Recommandations, **à faire par : intégration** :

1. `tools/build-public.mjs` : ajouter l’empreinte `rev=` aux feuilles de style comme aux scripts (cause du style périmé du § 3), puis passer `/js/*` et `/css/*` à `max-age=31536000, immutable`.
2. `/css/fonts/*` : `max-age=31536000, immutable` (les polices, 113 Ko, ne changent pas ; aujourd’hui 7 jours).
3. L’en-tête `Content-Security-Policy` (environ 1 Ko) est envoyé avec chaque image, police et script : le limiter aux réponses HTML.
4. `css/public.css` est appelé sous deux clés (`300.7` et `300.8`) selon la page publique : même coût que celui corrigé ici. **À faire par : SEO.**

## 6. Accessibilité (WCAG 2.2 AA)

| Contrôle | Avant | Après | Preuve |
| --- | --- | --- | --- |
| axe 4.10.2, règles 2.0/2.1/2.2 A et AA, 20 pages × vide et rempli × 360 et 1280 px, découverte | 4 échecs (`adventure`, `target-size`) | 0 | `axe.mjs` ; test « adventure: … » |
| axe, connecté : 15 pages × 0 et 24 séances × 2 largeurs, plus 12 états ouverts (feuilles, erreurs, hors ligne) | non mesuré avant | 1 échec trouvé (contraste, Profil) et corrigé ; 0 sur 72 états | `axe2.mjs` |
| Clavier seul, 1280 et 360 px : connexion, séance, profil, aventure | non vérifié | 4 parcours sur 4 aboutissent ; 3 pertes de focus corrigées ; anneau de focus de 2 px sur les champs | `kbd.mjs` ; tests du fichier `v131-web-ux` |
| Recomposition à 320 px du QG refait | — | pas de défilement horizontal | test « the rank strip… » |

Non vérifié : lecteur d’écran, appareil réel, zoom texte à 200 % page par page, feuille de chapitre de l’aventure en mode connecté. État détaillé : [`../ACCESSIBILITY_ASSESSMENT.md`](../ACCESSIBILITY_ASSESSMENT.md) § 2 bis.

## 7. Tests

RESULTS_PLACEHOLDER

## 8. Ce qui reste

| Élément | Constat | Gravité | À faire par |
| --- | --- | --- | --- |
| LCP mobile de première visite (QG, Séance, Profil) | ≈ 3,0 s en limitation appliquée, 4,1 à 4,6 s simulé ; inchangé. Demande de regrouper ou de différer des scripts (pas de bundler dans le projet) ou de retirer `titan_features.js` des pages Ascension après inventaire de ses usages | P1 | UX Web, lot dédié |
| Voies GPX / Garmin sur la page Séance | Derrière `screens.activityhub` et `screens.garmin`, éteints par défaut | P1 | Propriétaire (réglages serveur) |
| Empreinte `rev=` des feuilles de style ; en-têtes de cache | § 5.4 | P1 | Intégration |
| Validation humaine de la compréhension (UX-131-07) | Non faite ; aucune note sur 10 publiée | P0 pour l’ouverture, pas pour la livraison | Propriétaire |
| Espaces insécables avant `: ; ? !` dans les textes de l’application | Les fichiers `js/app/*.js` écrivent une espace simple ; correction outillée à prévoir (les opérateurs ternaires interdisent un remplacement aveugle) | P2 | UX Web |
| Styles de la fenêtre retirée | `.titan-first-run-guide` et `.titan-guide-*` restent dans `css/ascension.css` (≈ 118 lignes mortes) : ce fichier est aussi chargé par les pages publiques, dont la clé ne pouvait pas être changée ici | P2 | UX Web avec SEO |
| `js/config.js` : jeton Paddle, zones Adcash | Non retirés : décision A-12 / B-07 en attente | P2 | Propriétaire |
| `js/app/atelier.js` : note « Mise à jour du catalogue en attente » | Conservée : elle ne s’affiche que si le serveur renvoie encore une pièce marquée TITAN+ ; catalogue de production non vérifié ici | P2 | Propriétaire |
| axe connecté et WCAG 2.2 dans la recette automatique | Fait à la main le 15/11, pas rejoué à chaque intégration | P2 | UX Web |
| `js/pwa.js` sur les pages publiques | Fichier modifié ; sa clé `?v=300.1` est inchangée parce que les pages publiques l’appellent aussi : le build ajoute `rev=` au contenu, donc l’adresse change bien en production | — | Information |

## 9. Fichiers hors de la liste de départ touchés par nécessité

- `recours.html`, `network-error.html` : clés `?v=` des fichiers partagés seulement.
- `package.json` : deux fichiers de test ajoutés aux listes (`tests/pwa-update.test.mjs`, `tests/e2e/v131-web-ux.e2e.mjs`).
- Tests adaptés au nouveau texte ou à la nouvelle structure, sans retrait d’assertion de fond : `qg-context` (bande de rang), `rpg-progression` (« crédits »), `profile-showcase` (« Santé Connect »), `atelier-retry` et `launch-decision` (texte TITAN+ du lot 6).
