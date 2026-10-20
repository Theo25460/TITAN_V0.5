# Coaching — contexte de compte — 18 octobre 2026

Lot limité à SEC03, QA08 et QA13, toutes trois encore partielles dans le cahier des charges.
Branche `codex/web-coaching-context-cdc`, dépendance PR #83 (`codex/web-goals-views-cdc`, commit `1afb79294e36b72cadb7bd173886321b31a6e785`). Aucune fusion ni mise en production.

## Comportement livré

- SEC03 : chaque lecture, formulaire, confirmation et invitation conserve le propriétaire, l’instance du client et l’époque de transition de son contexte. Vérification avant/après la récupération locale de session et après la réponse RPC. Les requêtes gardent le jeton explicitement capturé. Une transition retire immédiatement les données privées et les seules fenêtres de Coaching ; un ancien résultat ne peut écraser le nouvel espace. Une session locale incohérente ferme l’ancien espace sans envoyer de mutation.
- QA08 : les réponses tardives, y compris une erreur d’un ancien compte, sont ignorées. La lecture du compte courant peut reprendre au retour du réseau après une erreur de snapshot. Les opérations déjà envoyées ne sont pas annulées : aucune garantie nouvelle d’idempotence ou d’absence de doublon côté serveur.
- QA13 : contrôle des formulaires et confirmations lors des transitions, du parcours normal de modification du consentement et de l’accueil invité ; navigation et focus des onglets existants vérifiés à 360 et 1280 px. L’accueil invité termine son état de chargement.

## Périmètre technique

Fichiers : `js/app/coaching.js`, `coaching.html` (version 300.2), `tests/e2e/coaching-context.e2e.mjs`, `package.json`, ce document. Le nouveau fichier de tests est inclus dans `test:e2e`.
Aucun changement de SQL, RLS, contrat RPC, règle de consentement, capacité, XP ou journal ; aucun compte réel ni appel réel au backend. `getSession()` reste une lecture locale de cohérence, pas une preuve d’autorisation serveur.
Profil et `tests/e2e/smoke.e2e.mjs` sont réservés à un autre chantier et n’ont pas été modifiés.

## Vérification

Les tests Chromium utilisent des sessions synthétiques et interceptent le REST RPC. La suite expose les défauts avant correction (transitions, authentification différée, anciens formulaires/confirmations, invitations tardives, état invité), puis vérifie la correction. Le test nominal vérifie aussi le jeton et le contenu exact du consentement envoyé.

Commandes :

```sh
node --test tests/e2e/coaching-context.e2e.mjs
node --test --test-name-pattern='^tab (keyboard|semantics|focus):.*coaching' tests/e2e/smoke.e2e.mjs
pnpm verify
git diff --check
```

Résultats : RED initial 10 échecs sur 12 (2 cas déjà corrects), puis 15/15 nouveaux tests Chromium et 4/4 tests d’onglets existants réussis ; 188/188 tests de base, 62 scripts analysés, build de 103 fichiers hors ligne, audit sans erreur avec 16 avertissements préexistants. Revue indépendante du diff sans constat important. Les 3 cas ajoutés après le RED couvrent aussi une révocation en vol, une fenêtre d’aide extérieure et un ancien brouillon après rafraîchissement.

Les tests ne constituent pas un audit IDOR/RLS, une validation UX globale, un test multi-appareils ou une validation Android. La CI distante et les environnements réels restent à contrôler lors de l’intégration de la pile.
