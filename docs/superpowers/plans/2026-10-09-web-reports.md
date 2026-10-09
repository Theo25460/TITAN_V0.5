# Bilans TITAN+ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bilan mensuel/annuel propriétaire, aperçu et CSV agrégé, droit serveur frais.
**Architecture:** RPC stable RLS sur un intervalle local borné. Module pur de validation/export et panneau secondaire indépendant des comparaisons ; aucune agrégation Premium depuis le cache.
**Tech Stack:** JavaScript, PostgreSQL/Supabase, node:test, Playwright, SQL transactionnel.
**Spec:** docs/CDC_WEB_REPORTS_SPEC_2026-10-09.md

## Global Constraints

- `month`/`year`, décalage `0`/`1`, fuseau IANA ; période courante provisoire arrêtée au serveur.
- Statistiques et exports de base gratuits, aucun changement de prix/paiement/récompense.
- Sol 6.1, une revue, branche isolée ; production/main/Android/Play Console exclus.
- Aucun résultat persisté ni note/GPS/santé dans CSV ; 247 formulations et trois images locales préservées.

## Review Focus

- Même jour avec plusieurs sports : total jours actifs distinct, aucune somme naïve des jours par sport.
- Changement réel de session pendant calcul/export : résultat, sources et téléchargement de l’ancien compte invalidés immédiatement.
- Abonnement expiré entre aperçu et export : contrôle frais, aucun téléchargement de l’ancien résultat.
- Réponse cohérente en types mais incohérente en calendrier/comptes : refus explicite, pas de CSV plausible.
- RPC qui ne répond jamais et 200 sports : attente quinze secondes puis relance, DOM paginé/recherche sans perte de contenu exporté.

### Task 1: RPC calendaire propriétaire

**Files:** nouvelle migration créée via CLI ; sql/tests/300_reports.sql.
**Interfaces:** Produit `titan_practice_report(text,integer,text)` et JSON version 1 exactement défini dans la spec ; consomme auth.uid(), profils serveur et titan_effort_v300.

- [x] Écrire la suite SQL : contrat absent, auth/RLS/expiration/refund/suspension, month/year 0/1, bornes locales, jour multisport, recalcul/durée estimée, archives/futur/étranger et cinq sources.
- [x] Lancer sur moteur PostgreSQL jetable baseline + migrations ; Expected: RED RPC absent, puis assertions réelles après implémentation. Ajouter régression DST/année bissextile et test sans mutation.
- [x] Découvrir CLI --help, créer migration, implémenter le scan et agrégats calendaires du contrat sans DDL de table ni écriture.
- [x] Relancer SQL et pnpm test ; Expected: tout vert. Relire CDC, noter preuves, commit limité.

### Task 2: Aperçu, export sûr et offre

**Files:** js/core/reports.js, js/app/rapports.js, stats.html, css/ascension-app.css ; tests/reports.test.mjs, tests/e2e/smoke.e2e.mjs, package.json ; tools/build-public-site.mjs et pages générées/tests d’offre ; docs handoff.
**Interfaces:** Consomme RPC Task 1 ; produit TitanReports.valid(payload,options,owner) et TitanReports.csv(payload,labelOf), contrat source/journal existant.

- [x] Écrire tests purs : quatre calendriers, incohérences/étranger, totaux distincts, arrondis, CSV quotes/BOM/CRLF/formules et 200 sports. Expected: RED module absent.
- [x] Implémenter module pur, lancer tests ; Expected: vert. Pas de helper de test en production.
- [x] Écrire E2E réels : panneau absent RED ; quatre choix, aperçu/CSV, Free/invité/ancien serveur/réseau/timeout, pagination et recherche ; données tardives/changement réel de session/expiration avant export refusés.
- [x] Implémenter panneau replié, annulable et borné à quinze secondes, export seulement après RPC frais, gardes de session/visibilité et liens sources ; recherche vingt sports par page.
- [x] Aligner offre/générateur/FAQ sans prix ni promesse anticipée, régénérer. Expected: tests exécutant le vrai générateur verts.
- [x] pnpm run verify + test:e2e ; Expected: toutes vertes. Inspecter 360/1280 px. Relire CDC et commit.
- [ ] Une revue Sol 6.1 sur le lot ; classer les findings, corriger Important par RED→GREEN puis suite verte ; publier PR isolée, vérifier trois jobs et deux voies SQL, synchroniser handoff/statuts et libérer le périmètre.
