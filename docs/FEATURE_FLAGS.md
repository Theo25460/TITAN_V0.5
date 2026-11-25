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
| `screens.digest` | « Depuis ta dernière visite » (haut de la Communauté, Web) et « Dans ton cercle » (Communauté > Amis, Android) ; lecture seule | 20261120120000 | Social, lot D |
| `screens.coach_followup` | V1.9.1 « Une séance assignée » : file « Décisions à prendre » et dossier de proposition du coach (Web), propositions à décider du sportif (Android, feuille « Mes suivis de coaching ») ; **vérifié par le serveur** (`FEATURE_DISABLED`) ; fermé, l'existant (proposer, accepter, relier) reste inchangé | 20261201090000 (paquet v191) | V1.9.1 |
| `screens.coach_feedback` | V1.9.2 « Retour sur la séance » : retour du coach rattaché à la proposition et à la séance liée (Web coach), proposition pour la suite acceptée ou déclinée par le sportif (Web, Android : « Mes suivis de coaching » et détail de la séance) ; **vérifié par le serveur** (`FEATURE_DISABLED`) ; fermé, rien ne change ; à ouvrir après `screens.coach_followup` | 20261202090000 (paquet v192) | V1.9.2 |
| `screens.coach_review` | V1.9.3 « Revue de suivi » : revue de la semaine du coach (Web) — par sportif le dossier à traiter, l'action suivante et sa source, proposition préparée depuis un modèle, aperçu, reprise après interruption et envoi unique par le coach ; le sportif répond dans son espace (Web, Android) ; **vérifié par le serveur** (`FEATURE_DISABLED`) ; fermé, rien ne change ; à ouvrir après `screens.coach_followup` et `screens.coach_feedback` | 20261203090000 (paquet v193) | V1.9.3 |
| `screens.coach_programs` | V1.9.4 « Programmation multi-semaines » : modèles multi-semaines versionnés, programme adapté par sportif avec aperçu, envoi unique, réponses séance par séance (accepter, décliner, à discuter), révision d’une séance, d’une semaine ou de la suite avec aperçu et versions, clôture (Web coach et sportif, Android sportif) ; **vérifié par le serveur** (`FEATURE_DISABLED`) ; fermé, rien ne change ; à ouvrir après `screens.coach_followup`, `screens.coach_feedback` et `screens.coach_review` | 20261204090000 (paquet v194) | V1.9.4 |

Le Panthéon et les clubs ouverts au public demandent qu'une personne de l'équipe traite la file des signalements (centre de contrôle, « Votes et idées »).
