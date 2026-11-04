# Comparaisons TITAN+ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Comparaisons personnelles de périodes, fiables et autorisées côté serveur.
**Architecture:** RPC de lecture SECURITY INVOKER sur l'historique privé, contrôle profil frais. Panneau secondaire de Progrès qui ne dépend pas du cache de séances et rejette les réponses obsolètes.
**Tech Stack:** JavaScript sans framework, PostgreSQL/Supabase, node:test, Playwright, SQL transactionnel.
**Spec:** docs/CDC_WEB_COMPARISONS_SPEC_2026-10-08.md

## Global Constraints

- 4, 12 ou 26 semaines complètes, fuseau IANA, lundi inclus / lundi exclu.
- Statistiques de base gratuites ; aucune mutation XP/crédits/séances/billing.
- GPT-6.1 Sol, une revue, production/main/Android exclus.
- Toutes les formulations des 247 exigences restent intactes.

## Review Focus

- Compte changé pendant une requête : aucune réponse ni source du compte précédent.
- Abonnement expiré/remboursé/suspendu : pas d'agrégat malgré is_elite client vrai.
- Changements d'heure et dimanche tardif : pas de séance perdue ou comptée deux fois.
- Référence vide, séance estimée ou signalée : limites visibles, aucun progrès de performance inventé.
- Serveur ancien/réseau coupé/données invalides : message utile, retrait immédiat de tout résultat obsolète.

### Task 1: Calendriers gratuits et RPC privé

**Files:** js/core/format.js, progress.js, questions.js ; js/app/semaine.js ; migration créée par CLI ; sql/tests/300_comparisons.sql ; tests/ascension-progress.test.mjs, ascension-questions.test.mjs.
**Interfaces:** Produit titan_compare_periods et le JSON exact défini dans la spec ; produit TitanFormat.addDays(date, days) pour les dates locales.

- [x] Écrire les régressions DST avec dimanches 23h30 / lundis 00h00, et référence de semaine en cours au même jour/heure local.
- [x] Exécuter en UTC, Europe/Paris, America/New_York et America/Sao_Paulo ; constater RED sur les calculs actuels.
- [x] Remplacer les déplacements hebdomadaires et journaliers concernés par addDays ; conserver les fenêtres glissantes.
- [x] Écrire la suite SQL : RPC absent, filtrage sport/archives/compte, recalcul 30 minutes malgré effort falsifié, sources limitées à cinq, périodes adjacentes / séries complètes ; droits Free/expiré/remboursé/suspendu/absence d'auth, paramètres invalides, aucune mutation.
- [x] Constater RED sur base jetable, puis implémenter le RPC. Lire les vrais résultats SQL avant livraison.
- [x] Exécuter suites JavaScript + SQL ; Expected: toutes vertes. Relire CDC, noter preuves, commit.

### Task 2: Parcours Progrès et offre fidèle

**Files:** js/app/analyses.js, stats.html, CSS, tests/e2e/smoke.e2e.mjs ; tools/build-public-site.mjs et pages générées ; tests/public-offer.test.mjs ; package.json si tests supplémentaires nécessaires.
**Interfaces:** Consomme uniquement le RPC Task 1 ; aucune agrégation locale Premium ni sauvegarde des résultats.

- [x] Écrire E2E sur invité/Free/TITAN+, filtres 4/12/26 et sport, tableau/semaines/sources/estimations/référence nulle ; le composant absent est RED.
- [x] Écrire E2E sur serveur ancien, erreur puis Retry, hors ligne, changement de compte et réponses hors ordre ; aucun résultat ancien après retrait des droits.
- [x] Implémenter panneau replié, formulaire accessible, recherche limitée à douze sports, messages et présentation sémantique mobile/desktop ; répondre au JSON Task 1.
- [x] Mettre l'offre à jour : comparaisons supplémentaires TITAN+, analyses de base gratuites, nécessité de mise à jour serveur clairement annoncée si RPC absent.
- [x] Exécuter pnpm run verify et pnpm run test:e2e ; Expected: toutes vertes. Vérifier visuellement 360/1280 px.
- [x] Relire CDC, commit, une revue Sol 6.1, correctifs Important par RED→GREEN et suite verte ; PR isolée avec CI SQL sur les deux chemins ; handoff et statuts exacts.
