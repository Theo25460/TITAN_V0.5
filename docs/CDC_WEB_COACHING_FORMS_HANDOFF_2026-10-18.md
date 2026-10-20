# Coaching — formulaires en cours d’envoi — 18 octobre 2026

Lot limité à UX09, QA08 et QA13. Les trois exigences globales restent partielles.
Branche `codex/web-coaching-forms-cdc`, empilée sur PR #84 (`codex/web-coaching-context-cdc`, commit `409a84ece5f42bbdc93282d4555734137b53c488`). Sans fusion ni déploiement.

## Comportement livré

- UX09 : le formulaire expose son état `aria-busy` et un message `role="status"` « Envoi en cours… », placé en dehors du formulaire occupé pour ne pas différer sa mise à jour. Après une erreur, les contrôles retrouvent leur état initial et le bouton d’envoi récupère le focus si aucune fenêtre plus récente ne le détient.
- QA08 : verrou synchrone avant la lecture de session, rejet des soumissions concurrentes et verrouillage des champs. Une erreur de transport ou une réponse backend en échec conserve le brouillon ; la nouvelle tentative reste explicite et efface l’ancienne erreur. Aucun retry automatique, aucune garantie nouvelle d’idempotence après une issue réseau incertaine.
- QA13 : Annuler, Fermer, Échap et clic sur le fond ne ferment plus une demande en vol. Le changement de compte ferme toujours la fenêtre immédiatement. Les parcours de modification du partage, aperçu/acceptation d’invitation et proposition de séance conservent leurs données et leur consentement. Une fenêtre sans envoi peut toujours être fermée normalement.

Le contenu FormData est capturé avant de désactiver les champs, qui seraient sinon exclus de l’envoi. Les règles et le contrat RPC ne changent pas. Les formulaires d’invitation en deux étapes peuvent toujours fermer l’aperçu et ouvrir le consentement. Les contrôles de propriétaire/client/époque du lot #84 sont conservés.

## Périmètre

`js/app/coaching.js`, `coaching.html` (ressource 300.3), nouveau `tests/e2e/coaching-forms.e2e.mjs` inclus dans `test:e2e`, `package.json` et ce handoff.
Aucune modification de Profil, `tests/e2e/smoke.e2e.mjs`, SQL/RLS, backend, journal, capacités, XP, Android ou main. Aucun compte réel ni écriture réelle.

## Vérification

Chromium local, sessions synthétiques, RPC REST intercepté, requêtes externes bloquées. RED initial : 11 échecs sur 13 tests, puis un test supplémentaire expose le statut placé sous un ancêtre occupé. Les autres cas ajoutés vérifient le consentement effectivement envoyé, une panne de transport, la préservation d’un champ déjà désactivé et la priorité de focus d’une fenêtre extérieure.

```sh
node --test --test-concurrency=1 tests/e2e/coaching-forms.e2e.mjs tests/e2e/coaching-context.e2e.mjs
node --test --test-name-pattern='^tab (keyboard|semantics|focus):.*coaching' tests/e2e/smoke.e2e.mjs
pnpm verify
git diff --check
```

Résultats finaux : 18/18 nouveaux tests de formulaires + 15/15 tests de contexte du lot #84 + 4/4 tests existants d’onglets ; 188/188 tests de base, 62 scripts analysés, build de 103 fichiers hors ligne et audit sans erreur (16 avertissements préexistants). Revue indépendante du diff sans constat Critical, Important ou Minor. États envoi/erreur inspectés visuellement à 360/1280 px, sans nouveau CSS.

Un premier lancement groupé a rencontré 9 refus de connexion dans `coaching-context.e2e.mjs` : un build exécuté en parallèle supprimait temporairement `dist/index.html` et arrêtait le serveur local (ENOENT confirmé dans son journal). Après la fin du build, la relance isolée des 33 tests navigateur a réussi. Le script `test:e2e` construit déjà avant de lancer ses suites ; aucun changement du serveur partagé n’a été ajouté à ce lot.

Les tests vérifient les vrais formulaires, le contenu des demandes, les dialogues et le focus à 360 et 1280 px sur les états principaux. Ils ne certifient pas les lecteurs d’écran réels, les autres moteurs, la PWA/Android, l’idempotence serveur, la suite E2E entière ou la CI distante. Les envois déjà partis ne sont pas annulés.

Référence de sémantique ARIA : https://www.w3.org/TR/wai-aria-1.1/#aria-busy (les annonces de régions occupées peuvent être différées).
