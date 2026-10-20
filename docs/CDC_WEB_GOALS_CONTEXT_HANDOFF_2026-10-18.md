# Objectifs : lectures et formulaires par compte

18/10/2026 — lot SEC03 / QA08 / QA13, exigences globales maintenues `[~]`.
Branche : `codex/web-goals-context-cdc`, empilée sur PR #93 (`e1015702d2bd923f83ee9724283d8aa7022b5471`).

L’écran conservait ses objectifs pendant une transition, et les fenêtres d’édition/archivage n’étaient pas liées à leur compte d’origine. Une lecture ou une fin d’écriture pouvait rafraîchir l’écran, afficher un retour ou agir sur une fenêtre après changement de compte.

Le module lie son cache, ses lectures et ses actions au propriétaire, au client, à l’epoch et à l’instance de données. La transition efface immédiatement les anciennes cartes et la vue Archives, et ferme uniquement ses propres fenêtres. Les lectures obsolètes et A → B → A sont écartées. La requête existante utilise le client/propriétaire capturés ; les filtres id/user_id/revision restent identiques. Le reçu d’écriture doit appartenir au propriétaire attendu avant actualisation.

Chaque formulaire vérifie son rattachement et son contexte ; les soumissions répétées pendant l’attente n’envoient pas une seconde écriture. Un retour obsolète n’affiche ni erreur, succès ou événement sous le nouveau compte et n’agit pas sur son éditeur. Un reçu courant après fermeture peut encore actualiser la liste et compter la création confirmée, sans fermer ni réécrire un nouveau brouillon. Les champs d’événement utilisent la mesure soumise ; nom et schéma d’événement inchangés.

Clés et format du stockage invité, validations et calendrier, limites/révisions, RLS/contrat de table et calculs/RPG/XP inchangés. Aucun nouveau contrôle serveur ou garantie d’idempotence ; pas de rebasage automatique de révision. Ressource Objectifs 300.4 ; Profil et smoke.e2e.mjs non modifiés.

## Vérification

- RED : trois tests ciblés reproduisent l’ancien contenu pendant transition et les fenêtres d’édition/archivage restant ouvertes.
- GREEN : 15/15 nouveaux tests navigateur : transitions 360/1280 px, lectures anciennes/epochs, éditeur et confirmation périmés, propriétaire/client/epoch silencieusement changés, fins confirmées/refusées sous un autre compte, doublon local, rejet/réessai explicite, brouillon courant, reçu étranger, ancien éditeur fermé sous le même compte.
- 24/24 tests calendrier/validation/vues existants réussis, également relancés indépendamment par le reviewer. Les premiers faux échecs de deux nouveaux scénarios ont été corrigés dans leur fixture : période ramenée sous la validation existante de 730 jours, sans modifier cette règle.
- pnpm verify : 188/188 tests de base, 62 scripts analysés, build 103 fichiers offline ; audit 0 erreur et 16 avertissements préexistants.
- Contrôle visuel liste/éditeur à 360/1280 px ; aucune nouvelle CSS. git diff --check sur les fichiers du lot.
- Review finale sans constat dans le produit ; le reviewer a exécuté les 24 tests existants, pas indépendamment les 15 nouveaux scénarios.

## Limites

Interface réelle avec contextes, lectures et écritures de table synthétiques ; tests existants sur stockage invité local. Aucun compte réel ni écriture backend. Une écriture déjà envoyée peut aboutir sous son propriétaire initial ; ce lot invalide ses suites UI sous un autre contexte, sans annuler ni rejouer cette écriture. Auth SDK, synchronisation et sécurité serveur restent dans les couches existantes, non auditées de bout en bout ici. Lecteur d’écran réel, autres moteurs, PWA/Android installé, suite E2E entière et CI distante hors validation. Aucun merge ni déploiement.
