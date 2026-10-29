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
- Deuxième écran branché sur un drapeau : `screens.consultations` (votes et feuille de route sous la Communauté ; absents tant que le drapeau n'existe pas ou est éteint).
- Premier écran branché sur un drapeau : `screens.garmin` (bouton « Connecter Garmin » du Profil ; absent tant que le drapeau n'existe pas ou est éteint).
- Nommer `domaine.élément` : `ads.web`, `ads.android`, `ads.interstitial`, `ads.rewarded`, `rpg.rollout`, `screens.<nom>`.
- Brancher une fonctionnalité sur un drapeau relève de son chantier (RPG : Codex ; régies : chantier publicité), avec sa valeur par défaut et un test.

## Retour arrière

`drop function public.titan_feature_flags_v1(), public.titan_admin_feature_flags_v1(), public.titan_admin_feature_flag_set_v1(text,boolean,integer,text,timestamptz,boolean); drop table private.titan_feature_flags;` : les consommateurs retombent sur leur valeur par défaut.
