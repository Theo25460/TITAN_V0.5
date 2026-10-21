# UX09 / QA08 / QA13 — retour au déclencheur des fenêtres — 17 octobre 2026

## Défaut et correction

Le menu Plus gardait le focus à l'intérieur pendant un rafraîchissement, mais son bouton d'ouverture était remplacé. Après fermeture, la restauration native ne retrouvait plus ce bouton et le focus restait sur la page. Le même cas est possible lorsqu'une confirmation est ouverte depuis un élément de navigation puis se termine après un rafraîchissement.

La feuille capture désormais le helper de restauration existant avant son ouverture et l'appelle après son retrait et son callback onClose. Les gardes existantes continuent à s'appliquer : aucun retour forcé si le déclencheur est toujours connecté, si un callback a choisi un autre focus ou si un autre dialogue est ouvert. Une destination disparue n'envoie pas vers un autre lien. Le code des actions, des confirmations et des transitions de compte reste inchangé.

Base : PR #74, commit `844ed59decaf8c8a520f75ec28bf83b4bff274e3`. Deux lignes produit ajoutées. Aucune mutation de données ni nouvelle action réseau.

## Trois points du cahier

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX09 | Fermeture du menu mobile par Fermer, Échap ou clic sur le fond, avec retour au bouton remplacé. Les callbacks et les nouveaux dialogues gardent leur priorité. | Retour ciblé sur les déclencheurs de navigation connus du helper ; pas sur tous les boutons arbitraires supprimés. |
| QA08 | Confirmation synthétique en erreur puis nouvelle tentative, et action en attente avec protection contre double activation/annulation, vérifiées sans perdre le retour au déclencheur. | Échec de fonction simulé, pas de panne réseau ou backend de production ; le transport réel n'est pas validé. |
| QA13 | Parcours réel du menu à 360 px et feuille ouverte par API depuis un lien visible à 1280 px ; focus natif sans rafraîchissement, déclencheur retiré et callbacks vérifiés. | Le menu Plus est masqué sur ordinateur : le test desktop utilise explicitement l'API de feuille, sans prétendre tester un menu visible à cette largeur. |

Les trois exigences restent `[~]` dans leur périmètre global.

## Validation

- Baseline et `pnpm verify` final : 188/188 tests réussis, build/audit sans erreur ; mêmes 16 avertissements préexistants.
- Contre-épreuve indépendante sur une copie isolée servant le module parent avec les dix tests finaux : cinq échecs attendus et cinq témoins positifs ; les échecs montrent le focus sur body après retrait effectif du dialogue.
- GREEN : 19/19 tests navigateur ciblés (dix nouveaux et neuf navigation partagée), plus 6/6 tests existants de confirmations. Ces derniers couvrent action en cours, double activation, échec/retry, annulation, focus initial sur Annuler pour destruction et fermeture de sécurité au changement de compte.
- Revue indépendante finale : 19/19 tests réussis et 8/8 répétitions du premier ancien scénario après correction de son assertion ; aucun constat Critical/Important/Minor. Gardes, borne de cinq résolutions et absence de modification du mécanisme de confirmation contrôlées.
- Le test d'attente a été corrigé pour attendre la déconnexion réelle du nœud : un dialogue fermé disparaît de la recherche par rôle avant l'événement close qui le retire et restaure le focus. Les premières assertions prématurées sont exclues des preuves produit.
- L'essai initial qui ciblait Plus masqué à 1280 px a été remplacé par le scénario d'API depuis un lien visible. Aucun changement du produit pour rendre un contrôle masqué artificiellement accessible.
- L'ancienne assertion de sous-navigation a aussi été fiabilisée : un rafraîchissement online pouvait remplacer la cible entre sa résolution par le locator et la comparaison. La revue a reproduit sur le parent une cible déconnectée alors que le lien courant était correctement focalisé. L'assertion réessaie au maximum cinq fois uniquement pour une cible retirée ; tout mauvais focus sur une cible connectée échoue immédiatement, sans attente artificielle ni sleep.

Le vrai shell et les vraies confirmations sont utilisés en découverte. Les actions de test sont locales et synthétiques ; toutes les requêtes externes sont bloquées. L'absence de vol de focus vers un champ ou nouveau dialogue est vérifiée.

## Coordination et reprise

Le script shell passe de 300.5 à 300.6 dans ses 13 consommateurs hors Profil. La recette de ressource précédente intercepte maintenant 300.5 et vérifie 300.6. **profile.html reste réservé et inchangé en 300.4 : coordonner son passage à la dernière version 300.6 avant intégration.** Aucune mise à jour complète de cache PWA n'est revendiquée.

Fichiers : `js/app/shell.js`, 13 références HTML hors Profil, nouveau `tests/e2e/dialog-return-focus.e2e.mjs`, mise à jour des versions et diagnostics de `tests/e2e/shell-focus.e2e.mjs`, raccordement au script test:e2e de `package.json`, ce handoff. Profil et smoke partagé intacts.

PR empilée sur #74 pour isoler le diff ; valider la chaîne avant intégration. Pas de suite E2E entière, CI distante finale, test SQL, appareil Android ou lecteur d'écran physique revendiqué. Aucun merge, déploiement ou changement de production.
