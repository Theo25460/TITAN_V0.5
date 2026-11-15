# Lots 3 et 4 · UX de l’application Android — audit, refontes ciblées et protocole de test

Périmètre : `mobile/src/screens/**`, `mobile/src/components/**` (sauf `Crest.tsx`), libellés de `mobile/src/navigation/**`, `mobile/preview/**`, tests des écrans modifiés. Références : [`cahier-reference.md`](cahier-reference.md) (lots 6, 6 bis, 6 ter et 6 quater du cahier) et [`vocabulaire.md`](vocabulaire.md).

## 1. Méthode et limites (à lire avant la matrice)

- Les écrans sont vus dans l’aperçu Web des écrans natifs (`TITAN_PREVIEW=1`, Chromium, 412 × 915 dp, densité 2, données fictives de `mobile/preview/`). **Ce n’est pas un téléphone** : polices, ombres, gestes, clavier, TalkBack, permissions Android et fluidité ne sont pas vérifiés ici. Aucun essai sur appareil ni sur émulateur n’a été fait dans ce lot.
- Captures « avant » : 61 écrans et états, pris avant toute modification (`/var/tmp/titan-ux/before/`, hors dépôt). Paires avant/après des écrans modifiés : [`mobile/docs/avant-apres/v131/`](../../mobile/docs/avant-apres/v131/) (JPEG ≤ 150 Ko).
- Contrôles automatiques : `npm run typecheck` propre ; `npm test -- --ci` : voir § 7 ; `scripts/preview-overflow.mjs` et `scripts/preview-audit.mjs` à 320, 360 et 412 dp : voir § 7.
- Texte à 200 % : l’aperçu Web ne sait pas grossir le texte système. La preuve est indirecte : composants sans hauteur fixe, `maxFontSizeMultiplier = 2`, bascule en colonne testée par Jest avec `fontScale = 2`. **Rendu réel à 200 % : non vérifié.**
- Contraste : les nouveaux blocs n’emploient que les jetons de `mobile/src/theme/tokens.ts`, dont les couples texte/fond sont contrôlés par `theme.test.ts`. Le texte posé sur une image (carte du chapitre, tuiles des mondes, bandeau du QG) repose sur un voile sombre (`Shade`) : lisible dans les captures, **non mesuré** pixel par pixel.
- **Aucune note de simplicité n’est validée par des humains.** Le cahier (UX-131-06 et 07) interdit de présenter « 8/10 » comme atteint sans observation de nouveaux utilisateurs. Ce lot livre des corrections et un protocole ; l’ergonomie reste « non validée humainement » et l’ouverture publique ne peut pas s’appuyer sur ce document.

## 2. Inventaire vérifié (cahier : « 46 écrans natifs »)

| Mesure | Cahier (V13-38) | Dépôt le 14/11/2026 |
| --- | --- | --- |
| Fichiers `.tsx` sous `mobile/src/screens` | 46 | **48** |
| dont fichiers d’écran `*Screen.tsx` | — | **44** (les 4 autres sont des morceaux d’écran : `DuoCard`, `Questions`, `ExerciseEditor`, `SportMetricsEditor`) |
| Routes de navigation | — | **45** : 40 routes de pile et 5 onglets (`RoutesScreen.tsx` porte `Routes` et `Route`) |

Le cahier ne nomme pas les 46 écrans : c’est un décompte de fichiers, plus bas de 2 que le dépôt actuel. La matrice suit les **45 routes** réellement ouvrables. Commande : `find mobile/src/screens -name '*.tsx' | wc -l` → 48 ; `grep -c 'name="' mobile/src/navigation/RootNavigator.tsx` et `Tabs.tsx`.

Route non capturée : `Route` (détail d’un parcours, demande un parcours enregistré que les données fictives n’ont pas).

## 3. Matrice

Gravité et statut : définitions de [`README.md`](README.md). « Preuve » : `av/` = `mobile/docs/avant-apres/v131/`, `before/` = `/var/tmp/titan-ux/before/`, tests = `mobile/__tests__/`.

### 3.1 Écrans refaits ou corrigés

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `QG` (onglet) | Comprendre TITAN en 10 s, une action principale, progression, chapitre à suivre, gains récents (UX-131-02, V13-40, V13-33, ANTI-IA-06) | Niveau en tout petit ; XP et chapitre cachés derrière « Mes repères d’ascension » ; trois liens texte nus « Sport / Aventure / Progrès » ; bouton « Connecter Santé Connect » sur l’accueil ; anneau de semaine dans une tuile à moitié vide ; le chapitre répété quatre fois (bandeau, voix, action, panneau) | Progression et chapitre invisibles, demande de connexion avant le besoin, blocs concurrents | P1 | Bandeau = personnage (blason, niveau, rang, barre d’XP chiffrée). Carte d’action inchangée (une seule action pleine). Trois accès en tuiles avec une ligne d’explication chacune. Nouvelle carte « Cette semaine (XP confirmés) + chapitre en cours et ce qu’il demande », toujours visible. Dernières séances remontées. Pas : une ligne facultative qui ouvre « Mes pas » (plus de bouton d’activation ni de connexion sur le QG). Le chapitre n’est plus dit qu’une fois | `av/01-qg.jpg` ; `screens.test.tsx` « QG », « QG garde les accès… », « QG et Aventure gardent leurs accès à 320 dp / texte × 2 » ; `immersion.test.tsx` | Corrigé, non testé en conditions réelles |
| `QG`, compte neuf | Dire ce qu’est TITAN, sans jargon (ANTI-IA-05, UX-131-02) | « Ta première balise t’attend », « Choisis une campagne : tes prochaines séances y allumeront les balises », invitation Santé Connect, Sentiers | Jargon RPG avant la première séance | P1 | Phrase d’accueil : « TITAN enregistre tes séances de sport et les transforme en progression : niveau, records et aventure. » ; pas d’anneau vide ; ligne « Choisis un monde… » ; visite guidée et pas en bas | `av/02-qg-compte-neuf.jpg` ; `screens.test.tsx` « QG sans historique… » | Corrigé, non testé en conditions réelles |
| `Adventure` (onglet) | Une carte dominante : monde actif, chapitre, ce qu’il demande, ce qu’il apporte, une action (RPG-131-01, V13-26) | Carte de niveau, puis quatre grands panneaux de mondes de même poids, Sentiers (carte 2 × 2 et sept blocs), jalons, quêtes ; aucun chapitre principal ; « Accès à vérifier auprès du serveur » | Chapitre principal absent ; jargon interne | **P0 (UX)** | Carte « chapitre en cours » en tête : image du monde, nom du chapitre, objectifs chiffrés avec jauges, ce qu’on y gagne (insigne et titre, jamais d’XP), **une** action (« Enregistrer une séance », ou « Allumer la balise » quand tout est réuni, qui ouvre l’écran du monde où vit l’appel serveur). Sans campagne : « Choisis ton premier monde » et une action. Mondes en grille 2 × 2 illustrée (ordre fixe, monde en cours cerclé de sa couleur, 136 dp de haut). Personnage, Sentiers (ligne qui ouvre l’écran complet), quêtes, collection et jalons en dessous. Libellé : « Disponibilité à confirmer » | `av/03-aventure.jpg`, `av/04-aventure-sans-campagne.jpg` ; `screens.test.tsx` « Aventure et monde… », « Aventure sans campagne… » | Corrigé, non testé en conditions réelles |
| `World` | Dire l’état d’accès dans les mots du joueur | « Accès à vérifier » + texte « n’est pas confirmé par le serveur » | Jargon | P2 | « Disponibilité à confirmer » + phrase sans le mot serveur. La règle d’accès ne connaît que deux états (`open`, non confirmé) : aucune condition de déblocage n’existe, aucune n’est inventée | `av/13-monde-disponibilite.jpg` ; `screens.test.tsx` « Aventure et monde… » | Corrigé, non testé en conditions réelles |
| `SessionResult` | Effort → résultat → récompense → suite ; rien d’acquis avant confirmation (RPG-131-03, V13-43, ANTI-IA-03) | Récompense retenue affichée sous le titre « TITAN a confirmé », dans la carte accentuée ; pas de bloc « et maintenant » ; refus et attente sous le même titre | Titre trompeur pour une récompense non accordée ; suite absente | P1 | Titres par état : « TITAN a confirmé » (réservé au gain accordé), « Séance enregistrée · récompense en attente », « Confirmation en attente », « Envoi refusé ». Bloc final « Et maintenant » : une phrase tirée de l’état réel (jours ou minutes manquants pour la balise seulement si l’aventure vient d’être relue sur le serveur ; sinon la semaine ; attente, refus, historique : ce qui se passera tout seul) | `av/05-resultat-recompense-en-verification.jpg` ; `sessionAdventureImpact.test.tsx` (4 cas ajoutés, dont « the next step is honest for every state ») | Corrigé, non testé en conditions réelles |
| `Record` (onglet) | Voies Manuel, GPS, GPX et montre visibles ; attente et refus dits clairement (UX-131-02, V13-47) | GPS présent ; import GPX seulement dans le formulaire ; Garmin et Santé Connect introuvables depuis l’onglet ; aucune mention des séances en attente | Deux voies cachées, état d’attente invisible | P1 | Section « Autres façons d’enregistrer » : GPS, « Importer un fichier GPX » (ouvre le formulaire du sport de distance, où est le bouton), « Depuis une montre ou un capteur » (Sources). Ligne en tête quand des séances attendent ou sont refusées, sans promesse d’XP. « Refaire ma dernière séance » remontée | `av/06-seance-facons-d-enregistrer.jpg` ; `recordPaths.test.tsx` (3 cas), `repeatLast.test.tsx` | Corrigé, non testé en conditions réelles |
| `Onboarding` | Sport → première séance en moins de 2 min, aucune permission, pas de faux gain (V13-41) | Trois étapes, aucune permission demandée (vérifié dans le code). Carte « Démo · Aventure : Une séance éligible peut ajouter un jour actif à ta quête si tu as déjà lancé une campagne » | Jargon (« éligible », « quête » pour un chapitre) | P2 | « Aperçu · ce qui se passe ensuite » : vérification, XP, niveau, puis le monde ; « Rien n’est gagné avant cette vérification. » | `onboardingFirstSession.test.tsx` « a short preview opens the real form… » | Corrigé, non testé en conditions réelles |
| `Profile` (onglet) | Fiche de personnage : niveau, XP, rang, avatar, sports, chiffres, records, distinctions, récompenses, journal (ANTI-IA-02 : « profil trop chargé ») | En-tête en quatre lignes empilées ; sports, records, insignes et crédits absents de la fiche (derrière des groupes repliés ou d’autres onglets) ; carte « Mon parcours sportif » (« parcours » = tracé GPS dans le vocabulaire) ; « Mon historique » | Fiche peu informative, vocabulaire | P1 | En-tête d’un bloc (avatar, nom, rang, blason, barre d’XP, deux actions côte à côte). « Mes sports » (3 plus pratiqués, séances et heures). « Mes records » (3, seulement s’il y en a). Insignes n / 36 et crédits, chacun avec sa destination. « Mon journal ». Les quatre groupes de réglages restent repliés. « Mon historique » → « Mes records » dans le groupe Mon sport (le journal a sa ligne) | `av/07-profil.jpg`, `av/08-profil-compte-neuf.jpg` ; `profilePassport.test.tsx` (2 cas ajoutés) | Corrigé, non testé en conditions réelles |
| `Progress` (onglet) | Ne pas mélanger des grandeurs incompatibles ; distinguer confirmé, provisoire, estimé | Déjà : « séances confirmées » contre « enregistrées sur cet appareil », « dont … estimées », séances sans durée exclues et dites. Mais « km parcourus » additionne course, vélo, randonnée sans le dire | Total de kilomètres anonyme entre sports | P2 | Dès que plusieurs sports apportent des kilomètres : libellé « parcourus, tous sports » et ligne « Distances par sport : … ». Un seul sport : rien ne change | `screens.test.tsx` « les kilomètres ne sont jamais un total anonyme… », « Progrès : une seule discipline… » ; pas de capture (les données fictives n’ont qu’un sport en km) | Corrigé, non testé en conditions réelles |
| `Privacy` | Le sportif voit ce qu’il partage avec un coach et comment l’arrêter | Rien sur le coaching dans l’application (l’espace coach est sur le site) | Information absente | P1 | Bloc « Suivi par un coach » : phrase de référence du vocabulaire, « Sans invitation acceptée de ta part, aucun coach ne voit rien », bouton vers la page du site où le partage se modifie et s’arrête | `av/10-confidentialite-coaching.jpg` ; `screens.test.tsx` « Confidentialité : ce qu’un coach voit… » | Corrigé, non testé en conditions réelles |
| `Community` | Clarté sur qui voit quoi | Code ami et état « trouvable » dits ; rien sur la visibilité des Moments | Manque léger | P2 | Ligne « Tes Moments ne sont vus que par les amis que tu as acceptés. Tes réglages : Profil, puis Confidentialité. » | `screens.test.tsx` « Communauté : qui voit mes Moments » | Corrigé, non testé en conditions réelles |
| `TitanPlus` | Texte loyal et concret (ANTI-IA-09), sans toucher à l’achat | « Des analyses plus poussées et davantage de confort de personnalisation » | Formule vague | P2 | Phrase de référence du vocabulaire (ce que TITAN+ ajoute), « Il ne donne ni XP, ni crédits, ni avance. », état de vente sur une ligne, rappel de ce qui est gratuit et de l’endroit où se lisent comparaisons et bilans. Logique d’achat et `playBilling.ts` non touchés | `av/11-titan-plus.jpg` ; `titanPlusScreen.test.tsx` (14 cas, 3 assertions ajoutées) | Corrigé, non testé en conditions réelles |
| `SessionForm`, `SessionDetail`, `Help`, bloc `Questions` | « ressenti », jamais « RPE » dans un texte destiné au public (vocabulaire § 2) | « Ressenti (RPE) », « (RPE 6) », « ressenti (RPE) » | Jargon | P2 | « Ressenti (de 1 à 10) », « (ressenti 6/10) », « ressenti non renseigné : 5 par défaut ». L’en-tête « RPE » de l’export CSV (`AccountScreen`) est laissé : c’est un format de données, pas un texte d’écran | `grep -rn "RPE" mobile/src/screens` : reste seulement l’en-tête CSV et des noms de code | Corrigé et vérifié |
| Aperçu (`mobile/preview/mocks/hooks.ts`) | Données fictives plausibles | Compte neuf affiché « 0 / 6 275 XP » au niveau 1 | Défaut du banc d’aperçu, pas de l’application | P2 | Niveau 1 : 500 XP | `av/02-qg-compte-neuf.jpg` | Corrigé et vérifié |

### 3.1 bis Éléments laissés par les lots 2 et 6 à « UX Android »

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Garmin` · après une déconnexion (lot 2) | Dire si Garmin a confirmé le retrait de son côté | Message unique « retirée dans TITAN » quelle que soit la réponse | Échec côté Garmin passé sous silence | P2 | L’écran affiche `garminWithdrawalMessage(...)` ; une réponse absente est traitée comme « non confirmé » | `nativeConnectionsScreen.test.tsx` « after a Garmin disconnect the athlete is told whether Garmin confirmed it » (2 cas) | Corrigé, non testé en conditions réelles |
| `GpsRecord` · notification du service (lot 2) | La notification promise est visible ; permission demandée au démarrage, pas avant | Permission de notification jamais demandée : sur Android 13 et plus, service sans notification si elle est refusée | Promesse d’écran incomplète | P2 | Au premier « Démarrer » (jamais à l’ouverture, ni à la reprise) : explication TITAN puis demande Android. Un refus ne bloque pas l’enregistrement ; l’écran dit alors que la notification n’apparaîtra pas. La carte d’explication annonce la demande. Non déclenché dans le build de bout en bout (un second dialogue système couvrirait les boutons du parcours Maestro, non rejouable ici) | `gpsRecordScreen.test.tsx` « the recording notification is asked for at the first start only… » | Corrigé, non testé en conditions réelles |
| `Routes` · bibliothèque pleine (lot 2) | Dire quoi faire | « Envoi refusé… contacte l’assistance » même quand la cause est la limite de 200 | Message incomplet | P2 | À 200 parcours : bandeau « Bibliothèque pleine… supprime un parcours », et la trace en attente dit que l’envoi reprendra tout seul. **Retirer une trace en attente** : non fait, `mobile/src/lib/routeSync.ts` n’exporte aucune fonction de retrait (à faire par : propriétaire de `routeSync.ts`) | `RoutesScreen.tsx` (`ROUTE_LIMIT`, `routes-full`) ; pas de test dédié | Non terminé |
| `SessionForm` · import GPX (lot 2) | Fichier trop lourd refusé avant lecture ; état d’analyse | Taille inconnue : fichier lu en entier ; écran figé sans message pendant l’analyse | Robustesse | P2 | Taille lue sur la copie en cache quand le fournisseur ne la donne pas ; refus si elle reste inconnue ; bouton « Analyse du fichier… » pendant la lecture | `screens.test.tsx` « un fichier dont la taille n’est pas donnée est mesuré avant d’être lu… » | Corrigé, non testé en conditions réelles |
| `DeleteAccount` (lot 6, E-10) | Avertir que la suppression ne résilie pas l’abonnement | Rien sur l’abonnement | L’utilisateur peut rester facturé | P1 | Carte ambre avant le champ de confirmation : « Supprimer ton compte ne résilie pas un abonnement. » + où l’arrêter ; liste complétée (Moments, parcours GPS, pas) | `screens.test.tsx` « Supprimer mon compte : l’abonnement Google Play n’est pas résilié… » | Corrigé, non testé en conditions réelles |
| Publicité : `Welcome`, `Signup`, `Legal`, `Privacy` (lot 6, A-01, A-10) | Phrase de référence ; pas de « rares et discrètes », pas de « après ton consentement » | Formules de jugement et promesse non vérifiée | Cohérence | P1 | « Gratuit. Des publicités, jamais pendant une séance ; aucune avec TITAN+. » ; « une fois ton choix fait dans le formulaire de Google » ; « Aucune publicité demandée : le formulaire de Google ne l’autorise pas. » ; TITAN+, Coach et Coach Ultra nommés | `grep -rn "rares\|après ton consentement" mobile/src/screens` : 0 | Corrigé et vérifié |
| `WebHub` (lot 6) | Ne promettre que ce qui existe | « Charge, fraîcheur… » | Analyse inexistante | P1 | « Comparaisons entre périodes, bilans détaillés et vues sauvegardées, sur grand écran. » (seule chaîne modifiée dans `mobile/src/lib/webHub.ts`, sur autorisation) | `mobile/src/lib/webHub.ts:8` | Corrigé et vérifié |
| `Community` · TITAN Duo et Moments (lot 6) | Vocabulaire | « expédition » pour le Duo ; « Retirer ce moment ? » | Homonymie avec l’expédition de saison | P2 | « TITAN Duo » partout dans `DuoCard` ; « Retirer ce Moment ? » | `duo.test.tsx` (libellés mis à jour) | Corrigé et vérifié |
| `mobile/src/lib/playBilling.ts` (`PLANS`, `FREE_PLAN`) (lot 6) | Avantages précis | « Analyses plus poussées », « Toute la suite Coach… », « Publicités rares et discrètes » | Formules vagues ou inexactes, toujours affichées dans les cartes d’offres | P1 | **Non modifié** : fichier interdit à ce lot par sa consigne. L’en-tête de l’écran d’offres porte déjà la phrase de référence | `playBilling.ts:17-21` | Non terminé (à faire par : lot paiements ou textes) |

### 3.2 Écrans audités sans modification

Critères regardés sur capture pour chaque ligne : compréhension, action principale, hiérarchie, jargon, états vide ou chargement quand l’aperçu les offre, cohérence des composants. « — » : rien à corriger à ce niveau de preuve.

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Welcome` | Proposition de valeur, deux actions | Titre, boucle séance → progression → aventure, « Créer mon compte » / « J’ai déjà un compte ». La phrase sur la publicité dépend déjà du build (`ADS_BUILD`) | — | — | Aucune | `before/Welcome.png` ; `WelcomeScreen.tsx:37` | Vérifié conforme |
| `Login`, `Signup`, `Forgot` | Formulaires courts, erreurs dites | Un champ par ligne, une action pleine, lien secondaire | — | — | Aucune | `before/Login.png`, `Signup.png`, `Forgot.png` ; `screens.test.tsx` « Accès… » | Vérifié conforme |
| `Guide` (visite, 12 étapes) | Facultative, passable | « Étape 1 sur 12 », « Passer la visite » ; annoncée « en 2 minutes » sur le QG | Douze étapes en deux minutes : durée non mesurée | P2 | Non modifié. À mesurer pendant le test utilisateur (tâche hors grille) | `before/Guide.png` | Non terminé |
| `Steps` | Chiffre honnête, source dite | « Pas de chiffre », objectif, semaine, sources, « Honnête et privé ». C’est ici que vivent désormais l’activation du compteur et Santé Connect | — | — | Aucune | `before/Steps-long.png` ; `stepsCard.test.tsx` | Vérifié conforme |
| `SessionForm` | Saisie évidente | Quand, mesures, détails facultatifs repliés, chrono, ressenti, note, bouton fixe en bas. Formulaire de musculation long (un écran et demi) | Longueur en musculation | P2 | Non modifié : déjà en divulgation progressive (« Autres mesures (facultatif) ») | `before/SessionForm_sport_*.png` | Vérifié conforme |
| `GpsRecord` | Permission expliquée avant d’être demandée | « Pourquoi TITAN te demande ta position », puis « Démarrer » ; issue « Saisir la séance à la main » | — | — | Aucune | `before/GpsRecord_sport_running.png` ; `gpsRecordScreen.test.tsx` | Vérifié conforme |
| `Pending` | Attente, refus, issues | État vide clair ; actions réessayer et abandonner (code et tests) | État rempli non capturé (pas de donnée fictive) | — | Aucune | `before/Pending.png` ; `screens.test.tsx` | Vérifié conforme |
| `SessionDetail`, `SessionEdit` | Lire, refaire, corriger, archiver | Mesures, XP confirmée et son calcul, trois actions, rappel « les corrections ne changent jamais les récompenses » | — | — | Libellé du ressenti (voir 3.1) | `before/SessionDetail_*.png`, `SessionEdit_*.png` | Vérifié conforme |
| `Routes` | Parcours privés | État vide explicite | — | — | Aucune | `before/Routes.png` | Vérifié conforme |
| `Route` | Détail d’un parcours | Non capturé (pas de donnée fictive) | — | — | Aucune | `routes.test.tsx` (existant) | Non terminé |
| `Journal` | Liste, filtres | Filtres par sport, Journal / Archives / Mes parcours, mois avec totaux, XP par séance | — | — | Aucune | `before/Journal-long.png`, `Journal_state_empty.png` | Vérifié conforme |
| `Records` | Records par sport, sourcés | Par sport, date, mention de méthode « À savoir » | — | — | Aucune | `before/Records-long.png` | Vérifié conforme |
| `Career` | Volumes par sport sans mélange | À pied, à la nage, renforcement séparés ; « Seulement les distances mesurées… » | Dans l’aperçu, « Niveau 6 » ici contre « Niveau 7 » au QG : les données fictives fixent le niveau du profil sans rapport avec le journal. Non reproduit hors aperçu, **non vérifié sur un vrai compte** | P2 | Non modifié. À contrôler sur un compte réel (même source de niveau partout) | `before/Career-long.png`, `Career_state_empty.png` | Non terminé |
| `Goals`, `Plan` | Objectif, cadence, semaine type | Une action pleine, pause de cadence expliquée sans culpabilité | — | — | Aucune | `before/Goals-long.png`, `Plan-long.png` | Vérifié conforme |
| `Sentiers` | Pas → découvertes, rien de gagné sans confirmation | Carte, prochain lieu, « Révéler mes découvertes », sources. Texte dense (sept blocs) | Densité | P2 | Non modifié ; l’écran n’est plus imposé dans l’onglet Aventure (une ligne y mène) | `before/Sentiers-long.png` | Vérifié conforme |
| `Atelier`, `PublicCard` | Crédits jamais achetables, partage choisi | Solde et origine des crédits ; interrupteurs par information visible | — | — | Aucune | `before/Atelier-long.png`, `PublicCard-long.png` | Vérifié conforme |
| `Sources`, `HealthConnect`, `Garmin` | État de chaque source, retrait possible | Liste par type, « Autorisé, reçu, intégré » ; Garmin : état, retrait de l’autorisation. `HealthConnect` vide dans l’aperçu Web (module Android) | Santé Connect non visible hors Android | — | Aucune | `before/Sources-long.png`, `Garmin-long.png` ; `healthConnectScreen.test.tsx` | Vérifié conforme |
| `Settings`, `Account`, `Notifications`, `Sports`, `Help`, `Feedback`, `Legal`, `About`, `DeleteAccount`, `WebHub` | Réglages lisibles, actions réversibles ou confirmées | Listes homogènes (`ListRow`, `ToggleRow`), suppression confirmée par saisie, liens du site annoncés comme tels. « Version ? (?) » dans À propos est un artefact de l’aperçu | — | — | Libellé du ressenti dans l’aide (voir 3.1) | `before/Settings-long.png` et suivants | Vérifié conforme |

Décompte : 45 routes ; 14 touchées (3.1), 29 auditées sans modification, 2 non terminées faute de données (`Route`) ou de mesure (`Guide`). `Career` est audité mais garde un point ouvert.

## 4. Contrôle anti-clichés des écrans refaits

PASS = cliché absent ou choix motivé, sur capture. Aucun PASS ne vaut validation humaine ; « Non vérifié » = l’outil ne permet pas de conclure.

| Contrôle | QG | Aventure | Résultat de séance | Séance (onglet) | Profil |
| --- | --- | --- | --- | --- | --- |
| ANTI-IA-01 halos, néon | PASS : cyan sur l’action et les jauges, image du monde en fond du bandeau seulement | PASS : image = monde réel ; cadre coloré seulement sur le monde en cours | PASS : carte accentuée réservée au gain accordé | PASS | PASS : ambre réservé aux records et distinctions |
| ANTI-IA-02 empilement de cartes | PASS avec réserve : 6 blocs au lieu de 9 pour un compte actif ; semaine et chapitre réunis | PASS : une carte dominante, grille, puis sections | PASS : quatre temps | PASS : trois voies dans une seule carte | PASS avec réserve : la fiche active reste longue (identité, chiffres, sports, records, distinctions, jalons, journal, 4 groupes) |
| ANTI-IA-03 gamification bruyante | PASS : « + XP » = XP confirmés du journal | PASS : la carte dit que la balise ne donne ni XP ni crédits | PASS : aucun gain affiché en attente, retenue ou refus (tests) | PASS : « Aucune XP avant la confirmation » | PASS |
| ANTI-IA-04 illustrations génériques | PASS : images des mondes et blasons existants, aucun nouvel asset | PASS : idem | PASS | PASS : icônes vectorielles | PASS |
| ANTI-IA-05 marketing creux | PASS : la phrase d’accueil dit ce que fait TITAN | PASS | PASS | PASS | PASS |
| ANTI-IA-06 dashboard qui noie | PASS avec réserve : une action pleine ; trois tuiles secondaires voulues par V13-40 | PASS : une action | PASS : « Terminer » seul en plein | PASS | Sans objet |
| ANTI-IA-07 mélange d’icônes | PASS : une famille de traits + blason de rang | PASS | PASS | PASS | PASS |
| ANTI-IA-08 animations | Non vérifié : `Reveal` existant conservé, pas mesuré, « réduire les animations » non essayé sur appareil | Non vérifié : aucune animation ajoutée | Non vérifié : célébration existante inchangée | Non vérifié | Non vérifié |
| ANTI-IA-09 gabarits SaaS | Sans objet | Sans objet | Sans objet | Sans objet | Sans objet (écran d’offres : phrase loyale, voir 3.1) |
| ANTI-IA-10 beau mais incompréhensible | **Non vérifié** : demande des personnes réelles | **Non vérifié** | **Non vérifié** | **Non vérifié** | **Non vérifié** |

## 5. Ce qui a été laissé de côté, et pourquoi

- Formulaire de séance : il est long en musculation mais déjà en divulgation progressive, couvert par de nombreux tests et par les parcours Maestro ; le refaire sans essai sur téléphone ferait courir plus de risque que de gain.
- Visite guidée en 12 étapes : contenu non touché ; sa durée réelle doit être mesurée avec des personnes avant de la raccourcir.
- Écran Sentiers : dense, mais c’est un écran secondaire qu’on ouvre exprès ; il a seulement été retiré du premier niveau de l’onglet Aventure.
- RPG-131-04 (supprimer le clic « Allumer la balise ») : c’est un appel serveur (`claim`). L’automatiser relève des règles serveur, hors périmètre. La carte principale y mène en un geste.
- RPG-131-05 (mondes qui changent visuellement) : demande des assets approuvés ; aucun n’a été créé.
- Les dix pictogrammes sportifs 3D approuvés (bibliothèque) ne sont pas intégrés : ils ne sont pas dans `mobile/assets` et leur branchement par sport relève du lot visuel.
- Journal, Records, Carrière, Objectifs, Atelier, Réglages : jugés cohérents à ce niveau de preuve ; pas de retouche cosmétique.

## 6. Besoins hors périmètre

| Besoin | À faire par |
| --- | --- |
| `mobile/src/lib/playBilling.ts`, `PLANS` : « Analyses plus poussées », « Davantage de confort de personnalisation » (vagues) et « Toute la suite Coach… » (D-03 de [`lot6-textes-juridique.md`](lot6-textes-juridique.md)) restent affichés dans les cartes d’offres | Lot textes ou lot paiements (fichier interdit à ce lot) |
| `mobile/src/lib/voice.ts` : la phrase « Ta première balise t’attend… » existe toujours ; le QG ne l’affiche plus pour un compte sans séance | Propriétaire de `mobile/src/lib` (nettoyage facultatif) |
| `mobile/src/core/web/adventure-access.js` : le texte `reason` (« n’est pas confirmé par le serveur ») n’est plus affiché sur Android mais reste dans le module partagé avec le site | Lot Web (copie synchronisée, non modifiable ici) |
| Mondes Forge et Aurores encore `tier = plus` en production : tant que la migration n’est pas appliquée, ils s’affichent « Disponibilité à confirmer » | Lot base de données, décision de release |
| Essais sur téléphone : texte 200 %, TalkBack, réduction des animations, hors ligne, 320 dp, clavier | Recette sur appareil (personne ou émulateur) |
| Capture Play Store : les six captures de la fiche montrent l’ancien QG et l’ancienne Aventure | Lot publication, après validation des nouveaux écrans |
| Parcours Maestro : identifiants conservés (`world-aube`, `gps-shortcut`, `record-choose-sport`, `sport-running`, `result-done`, textes « Ta première séance », « XP confirmés », « Récompense en vérification ») mais **non rejoués** (pas d’émulateur ici) | CI Android au jalon final |

## 7. Résultats des contrôles

Renseigné en fin de lot : voir le bloc « Résultats » ci-dessous.

RESULTATS_A_COMPLETER

## 8. Protocole de test utilisateur (prêt à lancer)

But : répondre à UX-131-07 et à la recette du lot 6 quater. Tant qu’il n’a pas été passé, l’ergonomie est « non validée humainement ».

**Participants.** 5 à 10 personnes qui n’ont jamais vu TITAN, pratiquant au moins un sport (viser au moins un coureur, un pratiquant de musculation, un sport collectif ou de raquette, une personne peu à l’aise avec les applications). Ni l’équipe, ni des proches qui ont entendu parler du produit.

**Matériel.** Un téléphone Android (pas un émulateur), build identifié (SHA et `versionCode` notés), compte neuf par participant sur l’environnement de test, réseau normal ; un second passage de la tâche 9 en mode avion. Enregistrement de l’écran et de la voix avec accord écrit. Aucune donnée de santé réelle exigée.

**Règles de passation.** Un participant à la fois, 25 à 30 minutes. L’observateur lit la consigne telle quelle, ne montre rien, ne répond pas aux questions sur l’interface (« fais comme si j’étais absent »). Une aide donnée = tâche comptée « avec aide ». Penser à voix haute encouragé. Arrêt d’une tâche après 3 minutes sans progrès.

**Les dix tâches** (les cinq premières sont celles du cahier ; les autres viennent de la grille UX-131-06 et des tests RPG-131-01/02) :

| N° | Consigne lue | Réussite sans aide si… | Temps cible |
| --- | --- | --- | --- |
| 1 | « Regarde cet écran dix secondes. » (accueil, puis QG après inscription) Puis écran masqué : « À quoi sert cette application ? Que ferais-tu en premier ? » | cite le suivi de séances de sport **et** une progression ; désigne l’enregistrement d’une séance | 10 s d’exposition |
| 2 | « Crée ton compte et choisis ton sport. » | arrive au formulaire de séance ou au QG avec un sport choisi | ≤ 2 min |
| 3 | « Tu viens de faire 30 minutes de ton sport. Enregistre-le. » | séance enregistrée, écran de résultat atteint | ≤ 1 min depuis le QG |
| 4 | Sur l’écran de résultat : « Qu’as-tu gagné ? Est-ce sûr ? Que te propose-t-on ensuite ? » | cite l’XP (ou dit qu’elle est en attente), dit d’où vient la confirmation, cite l’étape suivante | — |
| 5 | « Reviens à l’écran principal et dis-moi où tu en es. » | revient au QG ; lit niveau, rang et semaine | ≤ 20 s |
| 6 | « Retrouve la séance que tu viens d’enregistrer, puis tes statistiques de la semaine. » | ouvre le journal ou le détail, puis Progrès | ≤ 45 s |
| 7 | « Il y a une histoire dans cette application. Où en es-tu, et que faut-il faire pour avancer ? » | ouvre Aventure ; nomme le monde ou le chapitre ; dit « enregistrer des séances » ou cite l’objectif affiché | ≤ 5 s pour repérer la carte, une fois l’onglet ouvert |
| 8 | « À ton avis, qu’est-ce qui avance avec une séance, et qu’est-ce qui avance avec tes pas ? » | séance → XP, niveau, chapitre ; pas → sentiers, sans XP | — |
| 9 | « Tu veux enregistrer une sortie avec le GPS / tu as un fichier GPX / tu as une montre. Montre-moi où tu irais. » Puis, en mode avion : « Enregistre une séance. Que s’est-il passé ? » | trouve les trois entrées dans l’onglet Séance ; hors ligne : dit que la séance est gardée et sera envoyée, sans croire l’XP acquise | ≤ 30 s par entrée |
| 10 | « Qui peut voir ce que tu fais ? Si un coach te suivait, où verrais-tu ce qu’il voit et comment arrêter ? » | ouvre Profil puis Confidentialité ; cite « privé par défaut » et le moyen d’arrêter | ≤ 1 min |

**Mesures à consigner par tâche et par participant** : réussite (sans aide / avec aide / échec), temps, nombre d’erreurs de chemin (écran ouvert puis quitté), mots du participant, endroit exact de l’hésitation, gravité observée (P0 = bloqué ou croit à tort avoir gagné ou perdu quelque chose ; P1 = réussit après détour ; P2 = gêne).

**Critères de réussite.**

- Au moins **80 %** des passages de tâche réussis **sans aide** (sur l’ensemble participants × tâches), et aucune tâche sous 60 %.
- Aucune confusion P0 (en particulier : croire une récompense acquise alors qu’elle est en attente ; ne pas trouver comment enregistrer).
- Note ≥ 8/10 sur la grille ci-dessous, chaque point appuyé sur les tâches indiquées.

**Fiche de notation (grille UX-131-06, un point chacun).** Un point n’est accordé que si la règle est tenue ; sinon 0, avec la capture ou l’extrait vidéo en preuve.

| N° | Critère du cahier | Tâches | Point accordé si | Point (0/1) | Preuve |
| --- | --- | --- | --- | --- | --- |
| 1 | Proposition de valeur comprise au premier écran | 1 | ≥ 80 % des participants | | |
| 2 | Action « enregistrer » immédiatement trouvable | 1, 3 | ≥ 80 % sans aide, temps médian tâche 3 ≤ 1 min | | |
| 3 | Sélection du sport simple | 2, 3 | ≥ 80 % sans aide | | |
| 4 | Saisie ou connexion de séance évidente | 3, 9 | ≥ 80 % sans aide | | |
| 5 | Confirmation et résultats intelligibles | 4 | ≥ 80 % répondent juste aux trois questions | | |
| 6 | Impact RPG compréhensible | 7, 8 | ≥ 80 % sans aide | | |
| 7 | Navigation et retour prévisibles | 5, 6 | ≥ 80 % sans aide, aucune impasse | | |
| 8 | Libellés et hiérarchie sans jargon | toutes | moins de 2 mots incompris par participant en médiane (liste tenue) | | |
| 9 | Erreurs, vide et permissions récupérables | 9 (hors ligne), refus de la permission GPS | ≥ 80 % savent quoi faire | | |
| 10 | Parité Android/Web et accessibilité | contrôle séparé | même vocabulaire sur le site ; un passage en texte 200 % et un passage TalkBack sans blocage | | |
| | **Total** | | | **/10** | |

**Après la séance.** Classer les observations P0/P1/P2, corriger les P0 et P1, repasser les tâches concernées avec de nouveaux participants. Reporter le total et les taux dans [`REGISTRE.md`](REGISTRE.md). Sans ce passage, écrire « ergonomie non validée humainement » dans le dossier de sortie.
