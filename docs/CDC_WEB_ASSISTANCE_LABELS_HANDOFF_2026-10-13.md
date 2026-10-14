# Passation web — repère Assistance — 2026-10-13

## Résultat et statut CDC

UX06 reste partiel `[~]`. Ce lot harmonise le repère de navigation vers `/service` en « Assistance », conformément à UX12. Il ne clôture pas la cohérence globale du vocabulaire, la compréhension des territoires ni une validation auprès d’utilisateurs.

Base de travail : `24ff253b9117b1b50d8f6c302a4ae40eed6be6bb` (arbre `3e33c77cde800094811f6a9dbeceece7ce68e0c3`), branche locale `codex/web-assistance-labels-cdc`. La PR parent 51 demeure un travail publié distinct : aucune publication, fusion ou mise en production dans ce lot.

## Changements bornés

- `js/app/shell.js` : « Assistance » dans la navigation secondaire et dans le nom accessible du bouton Plus. Route `/service`, identité `aide`, icône `help`, hints et autres destinations inchangés.
- 25 HTML : seuls les liens utilisateur `/service` auparavant nommés « Aide » ou « Aide et contact » deviennent « Assistance » ; footers publics et liens d’authentification. Les footers des pages juridiques sont des accès de navigation ; leur prose est inchangée.
- 14 HTML consommant le shell : seule sa version `300.3` devient `300.4`, y compris `onboarding.html` et `profile.html` ; leurs scripts métier ne changent pas. Les versions des autres scripts restent inchangées.
- `tools/lib/public-template.mjs` : même libellé dans le footer source, nécessaire à la reproductibilité du générateur public.
- `tests/e2e/smoke.e2e.mjs` : trois tests ajoutés dans la section Assistance, avant les tests Assistance existants. Le test PWA global en fin de fichier est inchangé.

Contrôle exact : 39 HTML modifiés, chacun identique à sa base après les seules substitutions de label `/service` ou de version du shell. Aucun refactor ni régénération massive.

## Diagnostic et validation

Les sélecteurs des tests unitaires et E2E existants ont été inspectés avant modification : aucun sélecteur comportemental existant ne dépendait du nom « Aide ». Le contrat des destinations primaire/secondaire est déjà vérifié par `tests/ascension-parity.test.mjs` (6/6 lors du diagnostic).

Cycle RED/GREEN des trois nouveaux E2E : avant production, 3/3 échouaient aux défauts attendus (Assistance absente du rail, « Aide et contact » dans le footer 404, ancien shell `300.3` utilisé dès la visite Adventure). Après correction, 3/3 passent. Les assertions après activation clavier attendent explicitement la navigation avec `waitForURL`.

Le premier `pnpm verify` a révélé le défaut de reproductibilité `committed landing and prices are reproducible from the offer generator` : les HTML index/tarifs avaient le nouveau label mais le footer source gardait l’ancien. La modification du seul label dans `tools/lib/public-template.mjs` a résolu ce défaut ; aucune offre, FAQ ou prose n’a été modifiée et le générateur n’a pas été exécuté sur le worktree.

`pnpm verify` final : 183/183 tests, build public réussi (101 ressources hors ligne), audit réussi avec les 16 avertissements SEO préexistants, aucune erreur.

`pnpm test:e2e` final : 240/240 tests Chromium, zéro échec (193,6 s), incluant les nouveaux tests et le PWA global inchangé. `git diff --check` final : réussi.

Les nouveaux E2E vérifient :

- 360 et 1280 px : rail et Plus, label accessible, destinations, hints, navigation clavier vers `/service`, fermeture Échap et retour du focus.
- États actifs : QG conservé puis identité secondaire `aide` exercée via l’API shell existante ; `/service` et Plus restent actifs, aucun onglet primaire ajouté. `/service` public n’a pas de shell.
- 28 sources HTML ayant déjà un lien `/service` : label rendu Assistance ; accès depuis connexion, récupération du mot de passe et footer d’accueil au clavier, aux deux largeurs.
- PWA : cache réel du service worker contenant les anciens shell `300.0`, `300.2` et `300.3`, puis première visite de chacun des 14 consommateurs ; aucun ancien script servi. Les pages sans navigation chargent également la version actuelle.

Rendus Chromium inspectés à 360 px (Plus ouvert) et 1280 px (rail) après les animations : repère Assistance visible, aucun débordement horizontal. Les ellipses préexistantes des hints mobiles sont conservées.

## Revue indépendante

Une seule revue indépendante Sol 6.1, effort high, contexte fourni sans historique et lecture seule du diff exact : aucun problème Critical, Important ou Minor. Verdict prêt à intégrer après confirmation de la suite E2E complète. La revue a contrôlé les substitutions exactes, le shell, le footer source, les tests et `git diff --check` ; elle n’a pas relancé les tests. Le présent handoff a été rédigé après cette revue.

## Limites et intégration

Le test PWA couvre la première visite connectée avec les anciens JS en cache, pas une ouverture hors ligne avec un ancien HTML déjà conservé. Les tests découvrent les liens présents ; ils ne figent pas une liste exhaustive future de pages. Chromium local n’établit pas une validation native Android/TWA, Safari/iOS, lecteur d’écran ou étude de compréhension.

`dynamic-page.html` / `js/dynamic-page.js`, le métier onboarding/profil, les FAQ et le formulaire Assistance, les flags support, backend, données privées, offre Premium et analytics sont exclus. Les outils legacy v100 sont exclus. Les changements HTML communs à d’autres lots devront être intégrés séquentiellement par le coordinateur, en préservant chaque version de script.

Suggestion pour le PWA global lors de l’intégration : ajouter `300.3` aux anciennes versions shell actuellement `["300.0", "300.2"]` ; aucun changement de ce test global n’est livré ici.

Aucun compte réel, envoi d’email, SQL/provider, modification Drive/CDC natif, push, fusion, déploiement ou publication n’a été effectué dans ce worktree.
