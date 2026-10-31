# Vues d’analyse — reprise et focus — 18 octobre 2026

Lot limité à UX09, QA08 et QA13 ; les exigences globales restent partielles.
Branche `codex/web-analysis-views-recovery-cdc`, dépendance PR #87 (`codex/web-record-detail-context-cdc`, commit `2e91ce36bb39f43426becc7e2cfedb2cbfa36894`). Sans fusion ni déploiement.

## Comportement livré

- UX09 : le statut vivant reste hors du formulaire, de la liste et du bouton Actualiser marqués occupés. Après enregistrement, le focus rejoint le titre de la vue ; après suppression, celui d’une vue restante ou Actualiser si la liste est vide. Le nom refusé par le serveur avec `VIEW_NAME_TAKEN` utilise le diagnostic du champ, ses descriptions et son état invalide ; la correction retire ce diagnostic.
- QA08 : une réponse de mutation non confirmée conserve le brouillon et conduit vers Actualiser, sans nouvel envoi automatique. Si la sauvegarde a été confirmée mais que la lecture suivante échoue, le message reste explicite et le focus conduit à Actualiser ; la sauvegarde n’est pas répétée. La reprise de lecture retrouve le brouillon éditable ou une ligne fraîche. Un conflit de révision ne rebase pas silencieusement le brouillon : il faut reprendre la vue fraîche pour la modifier.
- QA13 : création depuis les paramètres d’une analyse, renommage, suppression avec une autre vue ou liste vide, refus serveur, nouvelle tentative explicite et complétions tardives contrôlés. Une autre action, une fenêtre plus récente ou le nouveau compte conservent leur priorité de focus. Le formulaire d’origine reste soumis aux règles et contrôles existants.

Aucun changement des contrats RPC, UUID de création, révisions attendues, droits TITAN+, événements analytics, règles de nom ou logique de confirmation. Les gardes de contexte et délais existants sont conservés. Aucun retry automatique ni nouvelle garantie d’idempotence après une réponse incertaine.

## Périmètre

`js/app/vues.js`, `stats.html` (Vues300.4), `tests/e2e/views-recovery-focus.e2e.mjs` inclus dans `test:e2e`, `tests/e2e/views-validation.e2e.mjs` (assertion de version seulement), `package.json` et ce document.
Profil, smoke partagé, SQL/RLS, backend réel, calculs d’analyse/bilan, moteur d’image, Android et main intacts. Aucun compte réel ni modification de vue réelle.

## Vérification

Vrais formulaires, sélecteurs, dialogues et module de validation, avec listes/reçus serveur synthétiques ; requêtes externes bloquées. RED initial : 8 échecs sur 12 tests. Les quatre cas déjà corrects sur la priorité du focus extérieur et le changement de compte sont conservés. Cas supplémentaires : diagnostic serveur sans vol de focus et reprise d’un conflit avec révision fraîche.

```sh
node --test --test-concurrency=1 tests/e2e/views-recovery-focus.e2e.mjs tests/e2e/views-validation.e2e.mjs
node --test --test-name-pattern='^views|^analysis analytics: saved view|^analysis analytics:.*mutation' tests/e2e/smoke.e2e.mjs
pnpm verify
git diff --check
```

Résultats : 15/15 nouveaux tests + 9/9 validations existantes + 13/13 tests des vues/analytics dans smoke, 188/188 tests de base ; 62 scripts analysés, build de 103 fichiers hors ligne, audit sans erreur et 16 avertissements préexistants. États en cours/enregistré contrôlés visuellement à 360/1280 px, sans nouveau CSS.

La revue indépendante a relevé la perte du focus d’une ligne lors d’une actualisation de fond : un test ciblé a reproduit le défaut, la propriété du focus est maintenant capturée avant retrait des lignes et le titre ou l’action de la ligne fraîche est retrouvé par ID. Correction relue, aucun constat restant.

Les tests existants couvrent les noms/Unicode/descriptions, les paramètres sauvegardés et réappliqués avec calcul frais, droits expirés, UUID stable après réponse incertaine, délais et transitions de comptes. Ils ne certifient pas un backend ou un compte réel.

Limites : Chromium ; pas de validation de lecteur d’écran réel, autres moteurs, PWA/Android, suite E2E entière ou CI distante. Après une mutation incertaine, l’utilisateur doit toujours vérifier la liste ; aucun résultat serveur n’est déduit du seul focus.
