# UX09 / QA08 / QA13 — validation du nom d'une vue — 17 octobre 2026

## Comportement corrigé

Un nom composé d'espaces ou dépassant 40 caractères était refusé par un message général, sans marquage du champ ni retour du focus. Le formulaire des vues d'analyse affiche maintenant une erreur dédiée, associée au champ par `aria-describedby` et `aria-invalid`, et y replace le focus au refus.

La correction du texte retire seulement ce diagnostic local et sa référence descriptive. Les autres descriptions et les messages généraux du serveur restent présents. Annuler, rouvrir un renommage ou changer de compte efface l'ancien diagnostic avec le brouillon selon les règles existantes.

Le champ vide passe par son événement natif `invalid` : `required` reste actif, mais son refus emploie le même diagnostic accessible. Il n'y a ni `novalidate` ni contournement de la validation native. Le validateur métier existant reste l'autorité locale : de 1 à 40 points de code Unicode après retrait des espaces ASCII de bord, contrôles interdits, `maxlength=80` pour permettre 40 caractères hors BMP.

Base : PR #67, commit `7d915153d2d9ae1c69bffa54766826ed783301ef`. Branche isolée ; aucun changement de RPC, paramètres métier, droits, idempotence, serveur, base ou compte réel. Le chantier réservé de validation du nom Profil et le fichier partagé smoke.e2e.mjs restent intacts.

## Les trois points

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX09 | Erreur locale liée au champ, focus au clavier, retrait à la correction et conservation des descriptions. Même traitement du vide et des refus métier. | Pas de lecteur d'écran physique ni d'audit WCAG transversal. |
| QA08 | Erreur réseau synthétique : brouillon conservé, message général conservé pendant correction, reprise explicite ; envoi pending unique et contrôles désactivés préservés. | Aucun test de fournisseur ou de transport SDK réel ; résultat serveur incertain et autres limites du module ne sont pas modifiés. |
| QA13 | Parcours de renommage inspecté sur le vrai écran Progrès à 360/1280 px ; refus, correction, annulation, fermeture du brouillon et transition de compte couverts. DA et styles existants conservés. | Recette avec comptes/appareils réels et revue globale des autres parcours ouvertes. |

Ces trois exigences restent `[~]` : le lot est livré sur branche, leur périmètre global n'est pas clos.

## Validation

- Baseline `pnpm verify` :188/188 tests, build/audit sans erreur,16 avertissements existants.
- RED initial : cinq refus attendus et deux positifs parmi sept tests navigateur contre le parent. Absence de `aria-invalid`/erreur locale, et ancienne version du script reproduites par assertions ; aucun échec d'environnement compté comme preuve.
- Revue indépendante : un Important a révélé que le champ vide était arrêté par `required` avant `save()`. Nouveau test reproduit en RED, puis correction par listener `invalid` direct sans retirer la contrainte.
- GREEN final :21/21 tests navigateur ciblés — neuf nouveaux et douze voisins existants. Revue indépendante :9/9 nouveaux rejoués, aucun Critical/Important/Minor restant. Sondes supplémentaires du reviewer sur Unicode1/40/41 et message serveur préexistant conservé pendant une erreur locale.
- `pnpm verify` final :188/188 tests, build/audit réussis,16 avertissements préexistants. Aucun test unitaire supprimé ou désactivé.
- Noms vides, espaces, dépassement de40, correction puis nouvelle validation ; une lettre et40emoji acceptés, espaces de bord normalisés. Aucun appel de mutation pour un nom refusé ; succès confirmé avec un seul appel après correction.
- Brouillon/erreur nettoyés à l'annulation et à la transition de compte ; aucune donnée réelle utilisée. Les RPC de liste/mutation sont des fixtures synthétiques ; vrai shell, écran Progrès, module vues et validateur chargés dans Chromium.
- Captures ponctuelles du panneau en erreur à360/1280 inspectées ; texte et actions lisibles, pas de débordement horizontal dans le parcours testé. Les captures de QA contiennent une indication synthétique ajoutée par le test pour vérifier la conservation d'une description préexistante.
- Script vues300.2→300.3 dans stats.html. Le test sert une ancienne ressource300.2 et vérifie qu'elle n'est pas exécutée par la nouvelle page. Ce contrôle de version ne constitue pas une installation ni un cycle complet de mise à jour d'une PWA hors ligne.

## Fichiers et reprise

`js/app/vues.js`, version dans `stats.html`, nouveau `tests/e2e/views-validation.e2e.mjs`, raccordement du fichier à `test:e2e` dans package.json, et ce handoff. Tests séparés du smoke partagé pour éviter toute collision avec le chantier Profil.

Pas de suite E2E entière, de test SQL ou de CI distante finale revendiqués pour ce lot. La CI actuelle se déclenche sur les PR vers main ; cette PR cible sa branche parente pour garder un diff isolé. Reprendre et valider la chaîne avant intégration. Aucun merge, déploiement ou changement en production.
