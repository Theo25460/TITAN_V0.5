# QG : lectures et actions liées au contexte de compte

18/10/2026 — lot SEC03 / QA08 / QA13, exigences globales maintenues `[~]`.
Branche : `codex/web-qg-context-cdc`, empilée sur PR #91 (`27d430c970407152e37c49c9875a70f29a3ec654`).

Les objectifs et le nombre de séances de découverte étaient conservés dans des variables communes au QG. Le démarrage et une unique actualisation d’historique pouvaient appliquer une réponse ancienne ; le panneau cadence ouvert restait utilisable après changement de compte. Le bouton d’import pouvait être réactivé par un rendu pendant l’attente, et sa réponse afficher un retour sous le nouveau compte.

Le contexte du QG lie ses lectures au propriétaire, au client, à l’epoch et à l’instance d’accès aux données. Le changement de compte efface immédiatement caches, contenu privé et salutation et ferme uniquement le panneau cadence de ce module. Les réponses obsolètes, y compris A → B → A, sont ignorées. Les lectures d’historique et d’aventure sont renouvelées ; la dernière lecture courante gagne. Au démarrage, la lecture des candidats conserve la dépendance à l’actualisation préalable de l’aventure ; une nouvelle version des règles déclenche aussi leur relecture.

Chaque action du panneau cadence vérifie son contexte d’origine et son ouverture avant de modifier le réglage. Le QG réserve l’import local pendant l’attente, y compris après un rendu. La fin d’un ancien import ne produit pas de toast, ne remet pas à zéro le compteur et ne libère pas une nouvelle réservation sous un autre contexte. Un échec courant permet une reprise explicite.

Aucun changement de js/app/data.js, des files/du stockage, des calculs de progression ou des règles RPG/XP. Le gateway d’import déjà lancé peut poursuivre son travail d’origine ; ce lot protège l’interface et ne crée aucune garantie serveur ou d’idempotence. Les réglages cadence gardent le même contrat local. Ressource QG 300.1 ; Profil et smoke.e2e.mjs non modifiés.

## Vérification

- RED : trois scénarios ciblés reproduisent ancien objectif visible après transition, panneau cadence restant ouvert et import réactivé après rendu.
- Review P2 : l’ordre de démarrage de l’aventure a été rétabli après reproduction rouge d’un snapshot lent ; la relecture des candidats après mise à jour d’aventure corrige aussi les règles chargées plus tard.
- GREEN : 14/14 tests navigateur. Changement de compte et cache, réponses anciennes/epochs, cadence détachée et propriétaire silencieusement changé, réglages courants, actualisations répétées/concurrentes, import/rendu/doublon, anciennes fins d’import, échec/reprise et démarrage lent. Parcours de transition à 360/1280 px.
- pnpm verify : 188/188 tests de base, 62 scripts analysés, build 103 fichiers offline ; audit 0 erreur et 16 avertissements préexistants. git diff --check.
- Contrôle visuel QG/panneau cadence à 360/1280 px ; aucune nouvelle CSS.
- Review finale sans constat restant ; le reviewer a vérifié les candidats historiques avec les vrais modules data.js et qg.js dans une VM à données synthétiques. Il n’a pas relancé indépendamment les 14 tests navigateur.

## Limites

Tests de l’interface et des contextes synthétiques, aucun compte réel ni écriture backend. Le contrôle de l’authentification SDK, des écritures cloud et de l’import effectif reste dans les couches existantes, non audité de bout en bout ici. Lecteur d’écran réel, autres moteurs, PWA/Android installé, suite E2E entière et CI distante hors validation. Aucun merge ni déploiement.
