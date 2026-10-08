# Intégration des quatre lots web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rassembler les PR #19 à #22 sans perdre de fonctionnalité ni de contrôle, puis livrer une PR d'intégration vérifiée.

**Architecture:** Branche isolée depuis `main e903ac317b44c9648daaa3ba124a3e607c470c31`. Fusionner les têtes livrées dans l'ordre #19, #20, #21, #22 en conservant leur ascendance. Résoudre seulement les conflits réels ; aucun nouveau chantier fonctionnel ni déploiement.

**Tech Stack:** JavaScript multipage, pnpm, Playwright, SQL PostgreSQL, CI GitHub Actions.

**Spec:** [Cahier maître Titan](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M/edit), déclaration CODEX WORK INTÉGRATION WEB, et les quatre `docs/CDC_WEB_*HANDOFF_2026-10-08.md` présents après fusion.

## Global Constraints

- « Toute modification doit préserver les fonctionnalités existantes sauf lorsqu’une exigence de ce document demande explicitement leur évolution. »
- « Aucun chantier ne doit utiliser la production comme environnement d’expérimentation. »
- « Le texte des exigences appartient à l’utilisateur. » Préserver les 247 formulations et le chantier WORK Android/Play Console.
- Migrations préparées uniquement ; conserver le bundle historique et rejouer séparément les trois correctifs. Aucune lecture de données individuelles réelles.
- Sol 6.1 pour cette intégration et sa revue ; Astra maximal réservé à la version complète avant déploiement majeur.

## Review Focus

- Les trois correctifs s'exécutent dans l'ordre chronologique sans modifier les profils/historiques existants ; les suites SQL combinées le vérifient.
- Le bundle historique suivi des correctifs conserve les mêmes gardes que le rejeu individuel ; CI sur les deux voies.
- Un profil Free avec beaucoup de sports garde son cadre acheté pendant le rendu Maîtrise/navigation ; contrôler le point de jonction dans le vrai navigateur.
- Une PWA déjà installée reçoit les nouvelles ressources, y compris le shell et la résolution d'apparence ; contrôler les versions et le parcours ancien cache.
- Une réponse retardée reste liée à son propriétaire après changement de compte ; garder les tests navigateur et les gardes SQL cross-user.

## Task 1: Intégration et preuve combinée

**Files:**
- Merge: les fichiers des PR #19/#20/#21/#22 ; résolution éventuelle dans `tests/e2e/smoke.e2e.mjs`, `tools/db/test-migrations.sh`, `.github/workflows/ci.yml`.
- Create: `docs/CDC_WEB_INTEGRATION_HANDOFF_2026-10-08.md`.
- Test: `tests/e2e/smoke.e2e.mjs`, `sql/tests/300_*.sql`, `tools/db/test-economy-migration.sql`, `tools/db/test-economy-concurrency.py`.

**Interfaces:**
- Consumes: têtes #19 `ddfeeda974c0fd8f59aca3e188c0b044f5dc3e4d`, #20 `edefe39cbdf1fb20da73e1135d86fac7c6a032fa`, #21 `3c0dcaafb91efe0be9cf0cab6f6e07118b851d4c`, #22 `0d85eb594e43545c33928277f973f05f9be2ce48` ; tous les handoffs.
- Produces: arbre réunissant les quatre têtes, suites combinées et CI de la PR d'intégration.

- [ ] **Step 1: Contrôler la baseline.** `pnpm test` depuis main : attendu 60 tests verts et arbre propre, hors présent plan.
- [ ] **Step 2: Fusionner les quatre têtes avec `git merge --no-ff`, une à une.** Conserver tous les tests ; pour les blocs communs identiques, une seule copie. Vérifier chaque tête avec `git merge-base --is-ancestor <tête> HEAD`.
- [ ] **Step 3: Vérifier le point de jonction profil/Atelier et les ressources PWA.** Si un défaut concret apparaît, écrire un test runtime, observer son échec, corriger au minimum et observer sa réussite ; sinon conserver les preuves existantes sans test miroir.
- [ ] **Step 4: Exécuter `pnpm run verify`, `pnpm run test:e2e`, `git diff --check`.** Attendu : au moins 71 tests et 15 E2E verts. Lire les résultats et inspecter 360/1280 px si le rendu change.
- [ ] **Step 5: Publier une PR brouillon et lire ses trois jobs CI.** Attendu : 12 migrations, 12 suites SQL, rollback appelant et deux scénarios concurrents sur chacune des deux voies ; 71 tests et au moins 15 E2E verts. Aucun environnement de production.
- [ ] **Step 6: Livrer le handoff et une seule revue indépendante de la branche.** Examiner les constats, corriger les défauts importants par RED→GREEN ; conserver la CI finale verte, passer la PR en revue et libérer la déclaration Drive. Ne pas fusionner main ni fermer #19 à #22.
