# Cohérence des lectures d’objectifs — 21 octobre 2026

Base technique : PR111, `c1eb9c806302f003a2398c74ed96acd8f4ea77f0`. Branche : `codex/goals-data-consistency-cdc`.

Le chargement des objectifs utilisait un cache mémoire par propriétaire et contrôlait seulement son identifiant après lecture réseau. Deux rechargements forcés pouvaient terminer à l’envers et rétablir une ancienne révision dans localStorage puis en mémoire. Un remplacement de client, un changement d’epoch ou un aller-retour de compte pouvait également permettre à une réponse obsolète de réécrire le cache, malgré les gardes de l’écran Objectifs.

## Correctif

`js/app/data.js` borne la mémoire au contexte courant (propriétaire, identité du client, epoch) et invalide synchroniquement sur `titan:account-changing`. Une session en transition ne retourne aucune donnée. Chaque lecture capture son contexte et son numéro ; seuls les résultats encore courants peuvent écrire le cache persistant/mémoire ou être retournés. Une ancienne réponse obsolète retourne une liste vide. Le dernier rechargement commencé fait autorité. Les autres fonctions du module, les requêtes/RLS et les règles sportives restent inchangées. Le fallback local hors ligne et les objectifs de découverte sont conservés.

Les 14 consommateurs HTML ne changent que le jeton de `/js/app/data.js`, 300.0 → 300.1. En intégration, préserver toutes les autres modifications des propriétaires d’écrans ; si data.js a évolué ailleurs, choisir un nouveau jeton cohérent avec le contenu final. Aucun `objectifs.js`, `journal.js`, `sessions.js`, `profil.js`, RPG, Atelier, config, style ou générateur public modifié.

## Vérification

- Reproduction avant correction : 9 échecs attendus sur 11 tests réels du module (2 témoins déjà verts).
- Après correction et cinq sondes de revue : 16/16 ; `pnpm run verify` : 295/295, typecheck strict existant, build (108 ressources hors ligne), audit et garde de release passent. Les avertissements éditoriaux préexistants de l’audit subsistent.
- Six cas navigateur ajoutés dans `tests/e2e/goals-data-cache.e2e.mjs`, raccordés exactement une fois à la CI : vrai écran et vraie couche TitanData, client/epoch/aller-retour, réponses décalées puis retour hors ligne, 360 et 1280 px. Le serveur est synthétique, Internet bloqué, service worker désactivé. Exécution locale initialement bloquée avant lancement par absence de Chromium ; téléchargement des navigateurs échoué (archive incomplète/HTTP503). Ne pas confondre ces erreurs d’environnement avec six échecs produit, ni revendiquer une recette navigateur réussie sans résultat CI.
- Revue indépendante bornée : aucun Critical/Important/Minor confirmé. Cinq sondes complémentaires couvrent réponse/erreur/rejet pendant transition active, changement silencieux de propriétaire et retour vide du plus ancien rechargement ; toutes vertes. QG et Semaine ne font pas l’objet de nouvelle recette navigateur dans ce lot.

## Coordination et limites

Ce delta ne reprend pas le lot Journal/sessions WORK ni les travaux Claude postérieurs à PR111. Les migrations héritées de PR111 restent non appliquées : ne pas publier cette pile sans le plan de production existant. Aucun merge main, déploiement, compte réel, achat, secret ou migration en production. QA08/UX10/SEC01 restent partiels ; appareil Android natif, réseau fournisseur, session réelle et multi-onglets ne sont pas certifiés par ce lot.
