# Web integration checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réunir les lots majeurs livrés puis vérifier leur compatibilité et le parcours ACT09.

**Architecture:** Base Claude5a529d6 intégrant les lots jusqu'à PR100 ; trois commits du lot PR101 repris sans conflit. Une seule PR contre main, sans fusion ni déploiement, fournit la preuve commune.

**Tech Stack:** Node24/pnpm11, Playwright1.56, PostgreSQL16 jetable.

**Spec:** CDC319 exigences, A08/QA05/ACT09 et gouvernance du19/10 ; docs/CDC_WEB_RPG_PERSONAL_TARGETS_HANDOFF_2026-10-19.md et docs/CDC_WEB_SESSION_RISK_UI_HANDOFF_2026-10-19.md.

## Global Constraints

- Aucun travail Profil/smoke/Android/WORK ni image étrangère modifié.
- Pas de fusion main, déploiement, donnée réelle ou changement de gains/prix.
- Conserver les contrats et tests livrés ; ne corriger que les régressions d'intégration démontrées.
- Verify et navigateurs séquentiels dans le même checkout.

## Review Focus

- Les16 migrations en attente sont toutes listées et ordonnées, y compris objectifs personnels.
- Snapshot/claim RPGv4 et modération/économie coexistent sans perdre les acquis.
- Les suites des deux sources sont présentes dans les commandes communes.
- La revue ACT09 distingue vrai compte et découverte et relève les incompréhensions fonctionnelles.
- Ancien serveur et retour arrière sont décrits sans promesse de déploiement effectif.

### Task 1: Intégrer et vérifier les sources

**Files:** docs/CDC_WEB_INTEGRATION_CHECKPOINT_2026-10-19.md ; docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md ; tools/db/preflight-production.sql ; tests/production-plan.test.mjs si contrat supplémentaire nécessaire. Corrections de régression uniquement.

**Interfaces:** Consumes source Claude5a529d6 et PR101666a686, migration20261019062757 et snapshotv4. Produces une tête intégrée et un plan/check préalable complet, toujours lecture seule.

- [ ] Reprendre les trois commits101 sur Claude livré ; vérifier identité des fichiers hors frontières d'intégration.
- [ ] Lancer tests/production-plan.test.mjs et observer RED sur migration manquante avant correction.
- [ ] Compléter ordre, effets, sauvegarde et retour arrière du nouveau contrat ; ajouter la version au SELECT préalable sans écriture.
- [ ] Lancer pnpm verify, puis navigateur transversal ciblé ; publier une PR agrégée pour PostgreSQL16 deux voies et suite navigateur complète. Expected: toutes vertes.
- [ ] Une revue indépendante Astra élevée du checkpoint et du parcours ACT09 ; Critical/Important corrigés par RED→GREEN, Minor au backlog.
- [ ] Lire les trois logs de la tête finale, documenter preuves/limites, libérer le claim et mettre ACT09 partiel. Conserver les319 formulations.

Self-review : un seul livrable d'intégration ; les tests existants du plan détectent déjà l'oubli de la migration ajoutée après sa rédaction. Le parcours humain/Android reste ouvert.
