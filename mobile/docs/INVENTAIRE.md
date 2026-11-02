# TITAN Android — inventaire des fonctionnalités (mis à jour le 02/11/2026 : guide et retours)

Référence : Web V1 consolidé (`codex/final-web-rc-20261021`, commit `a74e3b4`) et
base Supabase de production (`oubmftfufwwzwpgvrcag`, migrations jusqu’à
`20261005230000`).

Légende des preuves :

- **TS** : `tsc --noEmit` sans erreur.
- **U** : test Jest (`mobile/__tests__/`).
- **R** : écran rendu par le test de rendu `screens.test.tsx` (données, vide, chargement).
- **E2E** : parcours Maestro sur émulateur Android contre une réplique locale de la
  structure Supabase de production, avec contrôle SQL côté serveur
  (`mobile/e2e/verify-backend.sh`).
- **Prod (lecture)** : comparaison en lecture seule avec la base de production.

Preuve E2E de référence : run CI [39627402252](https://github.com/Theo25460/TITAN_V0.5/actions/runs/39627402252)
du 21/10/2026, 4/4 parcours Maestro réussis dans l’ordre, puis contrôles SQL :
compte A = 3 séances, 3 `client_event_id` distincts, 1 050 XP au journal et au
profil, accueil enregistré (sport favori course), récompense du chapitre 1 de
l’Aube, séance hors ligne présente une seule fois ; compte B = 0 séance. Aucun
crash ni erreur JavaScript dans le logcat.

Une ligne « Fait » sans E2E signifie : codé et rendu en test, pas encore exercé
sur un appareil réel ni sur émulateur.

## Fait

| Domaine | Ce qui fonctionne | Preuve |
| --- | --- | --- |
| Compte | Connexion, inscription (CGU obligatoires, e-mail de confirmation), renvoi de l’e-mail, mot de passe oublié, changement de mot de passe, déconnexion | TS, R, E2E (connexion, déconnexion) |
| Session | Session Supabase persistée dans le Keystore (expo-secure-store), rafraîchie au retour au premier plan | TS, E2E (relance de l’application) |
| Isolation | Cache, brouillons et file d’attente rangés par compte ; changement de compte sans fuite | U (file), E2E (compte B : 0 séance) |
| Premier lancement | Accueil en 3 étapes : sports favoris, cadence, rappels ; enregistré dans `game_state.user` | R, E2E (sport favori vérifié en base) |
| Séances | Saisie par sport (durée, distance, dénivelé, séries/exercices, voies d’escalade, RPE, note), chronomètre, date passée, import GPX | U (construction, nettoyage, GPX), R, E2E |
| Moment après séance | Mêmes règles que le site (`js/app/moment.js`) : mesures (allure, volume, cotation), XP confirmés qui défilent, crédits, plafond de fair-play, montée de niveau, records battus avec la valeur précédente, semaine, maîtrise du sport, chapitre en cours | U (mesures, records), R, E2E (« XP confirmés », « Gardée sur ce téléphone ») |
| Hors ligne | File durable par compte, envoi automatique au retour du réseau, idempotence par `client_event_id`, écran « En attente » (réessayer, abandonner) | U (file), E2E (mode avion → envoi unique vérifié en base) |
| Édition | Modifier, archiver une séance (contrôle de révision serveur) | TS, R |
| XP | Calcul serveur ; règle d’effort du site embarquée à l’identique | U : parité 12/12 avec `titan_effort_v300` (prod, lecture) ; E2E (XP profil = somme du journal) |
| Journal | Historique complet (liste virtualisée, chargement serveur par pages de 500), filtre par sport, détail, refaire une séance, archiver/restaurer | R |
| Statistiques | Semaine ; « Tes questions » du site (volume comparé au mois d’avant, répartition du temps, allure médiane mensuelle, charge maximale, cotation d’escalade, charge de la semaine, semaines tenues) ; tendances sur 6 mois ou 1 an avec moyenne ; maîtrises | U (libellés d’axes), R |
| Records | Records par sport, calculés par les règles du site | R |
| Objectifs | Création, modification, suivi (`sport_goals`, contrôle de révision) | R |
| Planification | Semaine type par jour, cadence hebdomadaire, pauses | R |
| Aventure | 4 mondes, chemin des 9 chapitres, obstacles narratifs et phases du gardien (`campaign-encounters` du site), deux chemins, révélation de l’insigne à la validation, collection de 36 médailles, personnages débloqués par niveau, quêtes hebdomadaires | R, E2E (départ, validation du chapitre 1 et révélation de l’insigne, contrôlés en base) |
| Atelier | Cosmétiques achetés avec les crédits gagnés (aucun paiement réel), équipement cadre/carte/fond | TS, R |
| Communauté | Amis par code, demandes, moments + encouragements, défis (création, réponse), expédition, guilde (création, rejoindre, quitter, objectif de la semaine) | TS, R |
| Carte publique | Activation, choix des informations visibles, lien de partage | TS, R |
| Réglages | Sports favoris, confidentialité, rappels locaux hebdomadaires, retours haptiques | R |
| Données | Export CSV des séances, export JSON complet (`export_own_data`) via la feuille de partage Android | TS |
| Suppression | Suppression du compte dans l’application (`delete_own_account`), confirmation par saisie | TS, R |
| TITAN+ | Écran « Bientôt disponible », aucun achat ni vérification de paiement ; bibliothèque Play Billing 9.1.0 incluse pour permettre la configuration des produits Play Console | R ; CI : permission BILLING obligatoire sur la branche de préparation |
| Santé Connect (HC, REC-06/08) | Écran « Santé Connect » (Profil) : accord explicite avant toute lecture, lecture des 7 derniers jours en calendrier local seulement quand l'utilisateur touche un bouton, uniquement READ_STEPS et READ_EXERCISE ; pas = agrégat quotidien de Santé Connect (déjà sans double comptage), enregistrés sans créer de séance ni de récompense ; séances reconnues (11 sports) importées une par une, durée corrigeable, rapprochées par le serveur d'une séance déjà au journal ; arrêt (retire l'accord sur le serveur et dans Android) et archivage séparés ; un changement de compte écarte une réponse tardive ; rien vers les statistiques ni la publicité | U (`healthConnect.test.ts`, 8 cas), R (`healthConnectScreen.test.tsx`, 7 cas), contrôle des permissions du paquet en CI ; PAS d'essai sur téléphone ni de validation Play Console |
| Chrono de repos de musculation (REC) | Dans l'éditeur d'exercices lestés : durées 1:00 / 1:30 / 2:00 / 3:00, bouton « Fait » sur chaque série qui lance le repos, +15 s, Passer, vibration discrète à la fin ; rien n'est enregistré ni envoyé ; le préremplissage depuis la série précédente existait déjà. Hors périmètre ici : GPS en direct (aucun module de localisation n'est installé) | U (`restTimer.test.ts`, 2 cas) ; PAS d'essai sur téléphone |
| Enregistrement GPS (REC) | Bouton « Enregistrer avec le GPS » pour course, trail, marche, randonnée, vélo (route, gravel, VTT, cyclo-cross). Écran Démarrer / Pause-Reprendre / Terminer : temps actif (hors pauses), distance, allure ou vitesse actuelle et moyenne, dénivelé positif seulement si l'altitude est fiable (80 % des points à 15 m ou mieux, lissage médian puis hystérésis de 3 m, sinon « aucun chiffre »). Points écartés : précision > 30 m, vitesse > 100 km/h, ordre incohérent, position ancienne d'avant le départ. Une pause ouvre un nouveau segment (jamais de ligne droite ni de distance à travers une pause). Service de premier plan `expo-location` avec notification visible, permission de position au premier plan seulement (ni arrière-plan ni approximative, bloquées dans le manifeste et contrôlées en CI) ; le suivi continue écran verrouillé. État écrit sur le téléphone après chaque lot, par compte ; un suivi coupé par Android (arrêt forcé, batterie) est clos à sa dernière position et marqué « interrompu », jamais prolongé. Changement de compte : suivi de l'autre compte mis en pause. Fin : export GPX (un segment par reprise), puis formulaire habituel prérempli (totaux seulement, aucune coordonnée) : file hors ligne, identifiant d'événement et règles d'XP inchangés, donc pas de double XP. Trace privée, jamais publiée | U (`gpsTrack.test.ts` 8 cas, `gpsRecorder.test.ts` 9 cas), R (`gpsRecordScreen.test.tsx` 6 cas), manifeste final vérifié par `expo prebuild`, contrôles de permissions et de `foregroundServiceType` en CI ; PAS d'essai sur téléphone : écran verrouillé, batterie, Android 14 à 16 restent à vérifier en sortie réelle |
| Abonnements Google Play (PREM12 à 14) | `TitanPlusScreen` : offres TITAN+, Coach, Coach Pro **lues chez Google Play avec son prix** (aucun montant dans le code), achat avec l'identifiant du compte connecté joint, jeton envoyé au serveur (`/functions/play-billing`) qui le vérifie auprès de Google, enregistre l'accès et acquitte ; l'achat n'est terminé dans Play qu'après la réponse du serveur ; « Restaurer mes achats » ; « Gérer dans Google Play » (changement d'offre, résiliation). Refus clairs : autre compte, jeton déjà utilisé, paiement en attente, annulation. **Éteint par défaut** : exige `EXPO_PUBLIC_TITAN_BILLING=1` dans le build ET `PLAY_BILLING_ENABLED=true` sur le serveur | U (`playBilling.test.ts` 7 cas) ; serveur : `play-billing` 9 cas, `play-notifications` 8, `play-reconcile` 3 ; bibliothèque Play Billing 9.1.0 compilée dans l'AAB signé de la PR #127 (CI verte) ; PAS d'achat réel : exige un compte testeur de licence (voir `docs/PLAY_BILLING_GPS_OWNER_STEPS.md`) |
| Publicité AdMob (Android seulement) | SDK `react-native-google-mobile-ads` 17.4.0, identifiant d'application dans le manifeste, **consentement Google (UMP) avant toute initialisation** (aucune requête sans accord), choix modifiables dans Confidentialité. Trois bannières adaptatives en ligne, libellées « Publicité » (QG en fin de page, Journal sous les filtres, Statistiques avant la maîtrise), jamais sur connexion, inscription, tutoriel, formulaires, achats, ni pendant un suivi GPS ouvert ; l'espace se rend dès qu'il n'y a pas d'annonce (6 s au plus). Un interstitiel au clic sur « Terminer » de l'écran de résultat, seulement si l'annonce est déjà chargée : jamais avant la confirmation du serveur, pas pendant les 2 premières séances, 1 toutes les 5 séances, 30 min d'écart, 2 par jour au plus, compteurs par compte sur le téléphone (`src/ads/policy.ts`, un seul endroit à régler). Aucune publicité pour tout compte `is_elite` validé par le serveur (TITAN+, Coach, Coach Pro, place incluse par un coach) ; droits inconnus = aucune publicité. Annonces de TEST de Google tant que le build n'est pas `ads=live`. Le bloc natif est réservé et utilisé nulle part. Identifiant publicitaire, attribution et sujets : retirés du manifeste. **Éteint par défaut** : le build doit porter `EXPO_PUBLIC_TITAN_ADS=1` (test) puis `EXPO_PUBLIC_TITAN_ADS_LIVE=1` (réel) | U (`adsPolicy.test.ts` 6, `adsManager.test.ts` 6), R (`adBanner.test.tsx` 9, `sessionInterstitial.test.tsx` 7), manifeste vérifié par `expo prebuild`, contrôles CI ; PAS d'annonce réelle servie, PAS d'essai du formulaire de consentement sur téléphone |
| Pas du jour au QG (HC) | Carte « Pas du jour » : nombre du jour (ou « pas de chiffre », jamais 0), jauge vers un objectif personnel (préréglages 5 000 à 12 000, −/+ 1 000, entre 1 000 et 50 000, gardé sur le téléphone par compte), sept jours, tendance (±10 % contre la semaine d'avant), moyenne sur 30 jours, dernière mise à jour. Lecture du serveur (`titan_daily_activity_v1`, un chiffre par jour : la source la plus haute, jamais une addition) ; actualisation manuelle, et automatique à l'ouverture du QG au plus toutes les 30 minutes **seulement si** l'accord serveur ET l'autorisation Android existent. Pas de temps réel promis : l'âge des chiffres est dit (« mis à jour à l'ouverture », « pas en temps réel », « données anciennes ») ; la lecture en arrière-plan n'existe pas (Android la réserve à une autorisation spéciale que TITAN ne demande pas). Les pas ne créent ni séance, ni XP, ni récompense. Absente si le serveur n'a pas la fonction | U (`steps.test.ts` 5), R (`stepsCard.test.tsx` 6) ; PAS d'essai sur téléphone, migration 39 non appliquée en production |
| Bibliothèque de parcours GPS | À « Enregistrer la séance », la trace part dans une boîte d'envoi durable (par compte) puis vers `titan_route_save_v1` : idempotent par identifiant de parcours, renvoi après coupure de réseau (démarrage, retour au premier plan, retour du réseau), jamais de doublon, aucun XP ni crédit (la séance suit son chemin habituel). « Mes parcours » (depuis le Journal) : liste, détail avec tracé SANS fond de carte (aucun serveur de cartes contacté : regarder un parcours ne révèle rien), distance, temps actif, allure ou vitesse, D+ seulement s'il est fiable, export GPX, suppression un par un. PRIVÉ : aucun partage (ni ami, ni club, ni coach, ni public), exporté et supprimé avec le compte. Limites serveur : 200 parcours, 3 000 points, 256 Ko. Lien automatique parcours ↔ séance (même sport, dans les deux jours, une seule fois, jamais deviné ; `titan_route_link_v1` après l'envoi de la trace) et carte du parcours dans le détail de la séance. Fond de carte réel : prêt (tuiles Web-Mercator, glisser pour déplacer, + / −, recentrer, attribution) mais **désactivé tant que le build n'a pas de fournisseur** (variables de dépôt `TITAN_TILES_URL` et `TITAN_TILES_ATTRIBUTION`) ET que l'athlète ne l'a pas activé (le fournisseur voit la zone regardée). Partage volontaire : fichier GPX sans heure ni altitude, début et fin de 300 m retirés, refusé si le parcours est trop court pour cacher les deux bouts ; rien n'est publié, l'athlète choisit où l'envoyer. **Web** : « Mes parcours » du Journal et carte dans le détail d'une séance (derrière `screens.routes`, tracé sans fond de carte, GPX complet et GPX à partager, suppression ; `js/app/parcours.js`, tests `routes-web.test.mjs` 5 + `routes-web.e2e.mjs` 3). **Non fait** : fond de carte sur le Web, choix et contrat d'un fournisseur de cartes (décision du propriétaire), lien web de partage | U (`gpsTrack.test.ts` 12, `tiles.test.ts` 5, `routes.test.tsx` 8), SQL (`300_routes.sql`) ; migration 59 non appliquée en production |
| Visite guidée (12 étapes) | Concept, sports favoris, QG, saisie, GPS, Santé Connect (facultatif), XP, mondes, communauté, objectifs, offres (facultatif), première séance. Chaque étape ouvre le vrai écran ; progression gardée par compte, reprise, « Recommencer », « Passer » ; carte d'invitation au QG tant qu'elle n'est pas finie ou écartée ; relançable depuis Assistance ; aucune publicité ; aucune permission demandée par la visite elle-même | U (`tour.test.ts` 4), R (`screens.test.tsx` visite) ; mini-objectifs facultatifs qui se cochent d'eux-mêmes d'après l'état réel (sport favori choisi, première séance, objectif de pas) ; transitions courtes (Reveal, réduites si l'animation l'est) | U (`tour.test.ts` 4), R (`screens.test.tsx` visite) |
| Notifications Android | Trois canaux TITAN dans un groupe (rappels, récap du lundi, enregistrement), accent TITAN, contenu privé écran verrouillé, canal d'enregistrement silencieux, bouton d'action « Enregistrer une séance » sur les rappels, icône monochrome TITAN dans la barre d'état aussi pour le suivi GPS. Aucune notification communautaire ni de quête n'existe (pas de serveur de push) | U (`notificationChannels.test.ts` 2) ; rendu réel à voir sur téléphone |
| Connexion avec Google | Flux PKCE dans le navigateur du téléphone (aucun SDK Google, aucun module natif de plus) : le navigateur revient sur `titan://auth-callback?code=…`, le code devient une session ; réponse lue strictement, échec dit au joueur ; bouton visible seulement si la compilation le décide (`EXPO_PUBLIC_TITAN_GOOGLE=1`) ; TITAN reçoit le nom et l'e-mail | U, R (`googleAuth.test.tsx`) ; DÉPENDANCE EXTERNE : fournisseur Google activé dans Supabase, adresse `titan://auth-callback` autorisée, essai sur téléphone |
| Guide de démarrage (V11-78) | Trois étapes facultatives (enregistrer, retrouver dans le Journal, faire avancer l'aventure), chacune ouvre le vrai écran ; passable, rouvrible depuis Assistance | U, R (`screens.test.tsx`) ; pas encore exercé sur téléphone |
| Retours (V11-79) | Problème ou idée, message vérifié (10 à 1 500 caractères), informations techniques facultatives et visibles avant l'envoi, e-mail préparé que l'utilisateur relit et envoie lui-même ; aucun ticket serveur, aucune confirmation inventée | U (`feedback.test.ts`), R |
| Android | Icône adaptative et monochrome issues du logo, écran de démarrage, barre de navigation basse, retour arrière natif, mode sombre, réduction des animations, cibles tactiles 48 dp | CI (contrôles du paquet) |

## Partiel

| Domaine | Manque | Raison |
| --- | --- | --- |
| Mondes Forge et Aurores | Affichés « accès gratuit à venir » | En production ils sont encore `tier = plus` ; la migration qui les ouvre fait partie des 27 migrations non appliquées |
| Textes légaux, centre d’aide complet | Ouverts dans le navigateur du téléphone | Documents publiés sur titan-app.fr ; pas de WebView dans l’application |
| Assistance | Contact par e-mail uniquement | Tickets et recours dépendent de migrations non appliquées |
| Édition de séance | Exercices de maintien (gainage) non modifiables après coup | Modification possible à la création seulement |
| Guilde | Pas de messagerie de guilde | Seul l’objectif de la semaine est affiché |
| Champs spécifiques par sport | Champs supplémentaires du catalogue en ligne absents | Le catalogue embarqué du site est utilisé |

## Absent

| Domaine | Raison |
| --- | --- |
| Espace coach | Hors périmètre de cette première version Android |
| Comparaisons et rapports avancés | Fonctions Premium côté site, dépendent de migrations non appliquées |
| Garmin, montres | Garmin : côté serveur et site, pas d'écran Android ; montres non commencé |
| Notifications push serveur | Seuls les rappels locaux existent |
| Mesure d’audience | Volontairement absente |

## Contrôles automatiques en CI (`.github/workflows/android-native.yml`)

- Types, tests Jest, bundle Metro de production.
- APK et AAB release : identifiant `fr.titanapp.app`, `versionCode` > 300,
  `targetSdk` ≥ 35, liste blanche de permissions, présence de BILLING, absence de AD_ID,
  signature vérifiée, bundle pointant vers la production et jamais vers
  `10.0.2.2`, trafic en clair interdit.
- E2E : Supabase local (structure de production + migrations appliquées en
  production), émulateur API 34, 4 parcours Maestro, contrôles SQL.

| Revue visuelle (jetons) | Contraste AA vérifié par test pour toutes les couleurs de texte sur chaque surface ; le ton le plus pâle (2,8:1) n'est plus jamais du texte (placeholder, axes des graphiques et légende corrigés) ; cible tactile 48 dp ; chemin du monde en carte sinueuse (trois arcs) | U (`theme.test.ts` 12, `worldPath.test.ts` 4) ; revue écran par écran sur appareil : à faire |