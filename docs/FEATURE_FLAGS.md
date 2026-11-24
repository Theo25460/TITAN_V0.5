# Drapeaux de fonctionnalité côté serveur (IDEA10, ADS17)

Objet : déployer progressivement le RPG, les publicités et de nouveaux écrans, et couper vite une régie, un format ou un emplacement **sans nouvelle version**. État au 20/10/2026 : infrastructure livrée dans le code, **aucune fonctionnalité ne consomme encore un drapeau** et la migration 27 n'est pas appliquée.

## Fonctionnement

- Table privée `private.titan_feature_flags` (clé, actif, pourcentage de joueurs, description). Aucun droit API ; aucun drapeau n'est créé par la migration.
- `public.titan_feature_flags_v1()` (visiteurs et joueurs) renvoie, pour chaque drapeau **existant**, `true` ou `false` déjà résolu pour l'appelant. Jamais le pourcentage, la description ni une date. Un drapeau inexistant est absent : l'application garde sa valeur par défaut. Un drapeau coupé vaut `false` et l'emporte sur toute valeur par défaut.
- Déploiement partiel : un joueur connecté est dans le pourcentage selon un calcul stable sur (clé, identifiant du joueur), donc toujours du même côté. Un visiteur non connecté n'est jamais dans un déploiement partiel (seulement 100 %).
- `public.titan_admin_feature_flags_v1()` et `public.titan_admin_feature_flag_set_v1(clé, actif, pourcentage, description, date attendue, création)` : administrateurs seulement ; chaque écriture est consignée dans le journal d'audit (`flag.set`, avec l'état précédent). Une modification porte la date de mise à jour vue par l'administrateur (`FLAG_CHANGED` si quelqu'un d'autre a modifié le drapeau entre-temps) et une création refuse une clé existante (`FLAG_EXISTS`).
- Page « Drapeaux » du centre de contrôle (`admin.html#flags`) : liste, bascule en un clic, création.
- Côté application : `window.titanFlags.enabled("ads.web", true)` (dans `js/app/shell.js`) renvoie la valeur du serveur si le drapeau existe, sinon la valeur par défaut donnée. Cache de dix minutes sur l'appareil, par compte ; un seul appel à la fois ; un serveur ancien ou injoignable ne change rien et n'est pas réinterrogé avant une minute ; rien n'est mis en cache pour un compte tant que sa session n'est pas prête. L'événement `titan:flags-updated` signale un changement.

## Règles d'usage

- Les **clés sont publiques** (lisibles sans connexion) : aucun secret, aucun nom confidentiel.
- Un drapeau n'est pas un contrôle de sécurité : le serveur doit refuser lui-même ce qui est interdit (un utilisateur Premium sans publicité, par exemple, se vérifie côté serveur et côté application, pas par drapeau seul).
- Nommer `domaine.élément` : `ads.web`, `ads.android`, `ads.interstitial`, `ads.rewarded`, `rpg.rollout`, `screens.<nom>`.
- Brancher une fonctionnalité sur un drapeau relève de son chantier (RPG : Codex ; régies : chantier publicité), avec sa valeur par défaut et un test.

## Retour arrière

`drop function public.titan_feature_flags_v1(), public.titan_admin_feature_flags_v1(), public.titan_admin_feature_flag_set_v1(text,boolean,integer,text,timestamptz,boolean); drop table private.titan_feature_flags;` : les consommateurs retombent sur leur valeur par défaut.

## Drapeaux des écrans V1.1 : à créer après la migration correspondante

Aucun drapeau n'est créé par une migration, donc rien n'apparaît tant que le propriétaire ne le crée pas (page « Drapeaux » du centre de contrôle). Tant qu'un drapeau n'existe pas ou est éteint, l'écran n'affiche rien et le serveur n'est pas appelé davantage. On peut éteindre un écran sans nouvelle version.

| Drapeau | Écran | Migration | Entrée |
|---|---|---|---|
| `screens.garmin` | bouton « Connecter Garmin » du Profil (après l'essai réel et la décision de publication) | 40, 41 | V11-40 |
| `screens.garmin_dailies` | option séparée pour autoriser le total quotidien des pas Garmin, sur Web et Android | 20261110152700 | V1.3.1, après qualification Garmin Health |
| `screens.consultations` | votes et feuille de route sous la Communauté | 42 | V11-57 |
| `screens.intents` | rendez-vous quotidien du QG | 44 | V11-61 |
| `screens.commonquest` | quête commune de la semaine | 45 | V11-62 |
| `screens.buddy` | binômes de progression | 46 | V11-63 |
| `screens.seasons` | saisons de 28 jours et archive | 47 | V11-64 |
| `screens.ranking` | classement équitable entre amis | 48 | V11-65 |
| `screens.duels` | « Défis par lien » (la page publique `/defi` n'a pas de drapeau) | 49 | V11-66 |
| `screens.worldgoal` | objectif collectif en trois paliers | 51 | V11-70 |
| `screens.clubs` | espaces de clubs, signalements et trophées | 52, 53, 54 | V11-71, V11-73, V11-74 |
| `screens.coachtools` | messagerie par suivi, check-in hebdomadaire partagé au choix du sportif, modèles de séances du coach | 57 | V11-81 |
| `screens.routes` | « Mes parcours » du Journal et carte du parcours dans le détail d'une séance (traces GPS enregistrées avec l'application Android ; privées) | 59 | V11-83 |
| `auth.google` | bouton « Continuer avec Google » (web ; Android par `EXPO_PUBLIC_TITAN_GOOGLE`) | — (fournisseur Google à activer côté Supabase par Théo) | V11-77 |
| `screens.factions` | trois factions | 54 | V11-74 |
| `screens.pantheon` | Panthéon des Titans | 54 | V11-74 |
| `screens.friendlinks` | création des liens d'invitation personnels (Communauté > Amis, Web et Android) ; **vérifié par le serveur** (`FEATURE_DISABLED`) ; un lien déjà envoyé reste utilisable si le drapeau se referme | 20261120090000 | Social, lot A |
| `screens.cordee` | La Grande Cordée (Communauté, Web ; Communauté > Défis, Android) ; la **création** est vérifiée par le serveur ; les cordées en cours restent lisibles si le drapeau se referme | 20261120110000 | Social, lot C |
| `screens.cordee_relay` | V1.8.1 « Le relais de la Sentinelle » : étape de relais sur la route pilote « Les crêtes de l’Aube » (Communauté, Web ; Communauté > Défis, Android) ; **transmettre et confirmer sont vérifiés par le serveur** (`FEATURE_DISABLED`) ; un relais déjà joué reste lisible si le drapeau se referme ; ouvrir d’abord pour le pilote (déploiement par compte) | 20261124090000 | V1.8.1 |
| `screens.cordee_reprise` | V1.8.2 « Reprise et relais facultatifs » : prise en charge facultative du relais de la Sentinelle et passation à un membre ou à la cordée (Communauté, Web ; Communauté > Défis, Android) ; **prendre, passer et accepter sont vérifiés par le serveur** (`FEATURE_DISABLED`) ; retirer sa propre offre reste toujours possible ; une prise en charge déjà faite reste respectée si le drapeau se referme ; ouvrir après `screens.cordee_relay`, pour le pilote (déploiement par compte). La règle des départs (longueurs acquises conservées) ne dépend d’aucun drapeau | 20261125090000 | V1.8.2 |
| `screens.cordee_suite` | V1.8.3 « Un groupe qui se retrouve » : après une cordée terminée, proposer un nouvel itinéraire privé (route existante, allure éprouvée, durée) et repartir avec les membres qui acceptent (Communauté, Web ; Communauté › Défis, Android) ; **proposer et répondre sont vérifiés par le serveur** (`FEATURE_DISABLED`, et `screens.cordee` pour proposer) ; retirer sa propre proposition reste toujours possible ; l’histoire d’une cordée terminée et la règle de nommage étendue (partenaires de lien d’une cordée nommés dans celles qui la suivent) ne dépendent d’aucun drapeau ; ouvrir pour le pilote (déploiement par compte), où `screens.cordee` est ouvert | 20261126090000 | V1.8.3 |
| `screens.club_season` | V1.8.4 « Saisons privées de club » : un administrateur de club lance une saison privée (titre, départ, 2 à 8 semaines, allure, trois étapes), chaque membre choisit d’y participer, pause, reprise ou départ, bilan privé figé (Communauté › Clubs, Web ; Communauté › Clubs, Android) ; **créer, rejoindre, reprendre et reporter sont vérifiés par le serveur** (`FEATURE_DISABLED`) ; faire une pause, quitter et arrêter restent toujours possibles ; une saison en cours reste lisible si le drapeau se referme ; ouvrir pour les comptes des clubs pilotes (déploiement par compte), où `screens.clubs` est ouvert | 20261127090000 | V1.8.4 |
| `screens.club_match` | V1.8.5 « Rencontres entre clubs » : un administrateur propose à un autre club une rencontre privée d’une ou deux semaines (code à usage unique, aperçu puis acceptation ou refus par un administrateur de l’autre club et un autre compte), chaque membre des deux clubs choisit d’y participer, taux par club à partir de 3 participants arrêté chaque nuit, score commun en coopération, récapitulatif figé et avis des participants (Communauté › Clubs, Web ; Communauté › Clubs, Android) ; **proposer, lire un code, accepter et participer sont vérifiés par le serveur** (`FEATURE_DISABLED`) ; refuser, quitter, arrêter et répondre restent toujours possibles ; ouvrir pour les comptes de deux clubs pilotes, où `screens.clubs` est ouvert | 20261128090000 | V1.8.5 |
| `screens.club_match_versus` | V1.8.5 : le format comparatif des rencontres (le meilleur taux l’emporte, égalité à moins de 5 points, deux semaines seulement) ; **proposer et accepter ce format sont vérifiés par le serveur** (`VERSUS_CLOSED`) ; **à laisser fermé** tant que `private.titan_club_match_measure()` ne rend pas `explainable = true` (docs/V185_SIMULATIONS.md, G) | 20261128090000 | V1.8.5 |
| `screens.digest` | « Depuis ta dernière visite » (haut de la Communauté, Web) et « Dans ton cercle » (Communauté > Amis, Android) ; lecture seule | 20261120120000 | Social, lot D |

Le Panthéon et les clubs ouverts au public demandent qu'une personne de l'équipe traite la file des signalements (centre de contrôle, « Votes et idées »).
