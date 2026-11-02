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
