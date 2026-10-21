# TITAN Android — inventaire des fonctionnalités (21/10/2026)

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
| Hors ligne | File durable par compte, envoi automatique au retour du réseau, idempotence par `client_event_id`, écran « En attente » (réessayer, abandonner) | U (file), E2E (mode avion → envoi unique vérifié en base) |
| Édition | Modifier, archiver une séance (contrôle de révision serveur) | TS, R |
| XP | Calcul serveur ; règle d’effort du site embarquée à l’identique | U : parité 12/12 avec `titan_effort_v300` (prod, lecture) ; E2E (XP profil = somme du journal) |
| Journal | Historique complet (liste virtualisée, chargement serveur par pages de 500), filtre par sport, détail, refaire une séance, archiver/restaurer | R |
| Statistiques | Semaine, tendances 8 semaines (graphique), répartition par sport, maîtrises | R |
| Records | Records par sport, calculés par les règles du site | R |
| Objectifs | Création, modification, suivi (`sport_goals`, contrôle de révision) | R |
| Planification | Semaine type par jour, cadence hebdomadaire, pauses | R |
| Aventure | 4 mondes, 9 chapitres, deux chemins, gardiens, insignes, personnages débloqués par niveau, quêtes hebdomadaires | R, E2E (départ + validation du chapitre 1 en base) |
| Atelier | Cosmétiques achetés avec les crédits gagnés (aucun paiement réel), équipement cadre/carte/fond | TS, R |
| Communauté | Amis par code, demandes, moments + encouragements, défis (création, réponse), expédition, guilde (création, rejoindre, quitter, objectif de la semaine) | TS, R |
| Carte publique | Activation, choix des informations visibles, lien de partage | TS, R |
| Réglages | Sports favoris, confidentialité, rappels locaux hebdomadaires, retours haptiques | R |
| Données | Export CSV des séances, export JSON complet (`export_own_data`) via la feuille de partage Android | TS |
| Suppression | Suppression du compte dans l’application (`delete_own_account`), confirmation par saisie | TS, R |
| TITAN+ | Écran « Bientôt disponible », aucun achat, aucune facturation | R ; CI : pas de permission BILLING |
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
| Health Connect, Garmin, montres | Non commencé |
| Notifications push serveur | Seuls les rappels locaux existent |
| Mesure d’audience | Volontairement absente |

## Contrôles automatiques en CI (`.github/workflows/android-native.yml`)

- Types, tests Jest, bundle Metro de production.
- APK et AAB release : identifiant `fr.titanapp.app`, `versionCode` > 300,
  `targetSdk` ≥ 35, liste blanche de permissions, absence de BILLING et AD_ID,
  signature vérifiée, bundle pointant vers la production et jamais vers
  `10.0.2.2`, trafic en clair interdit.
- E2E : Supabase local (structure de production + migrations appliquées en
  production), émulateur API 34, 4 parcours Maestro, contrôles SQL.
