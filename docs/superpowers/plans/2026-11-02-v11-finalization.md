# TITAN V1.1 Finalization Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the root task; independent SQL, SEO and monetization reviews follow superpowers:dispatching-parallel-agents. Steps use checkbox tracking.

**Goal:** Prepare and test a defensible V1.1 candidate, correcting confirmed defects and recording unresolved release gates.

**Architecture:** Preserve the existing static Web, React Native Android and Supabase RPC architecture. Start from consolidation commit 6b4bcaa3ccaea247322a72b26dd8e6938ad9ec55; isolated branch codex/v11-finalization-20261102. Prefer minimal fixes with behavioral regression tests.

**Tech Stack:** JavaScript, TypeScript, React Native / Expo 57, PostgreSQL, Node test, Jest, Playwright.

**Spec:** User-provided “TITAN V1.1 — FINALISATION GRAND PUBLIC, SEO ET SÉCURITÉ RENFORCÉE” (2 November 2026), plus current connected cahier des charges. The supplied scope is the approved direction; no new product design is introduced.

## Global Constraints

- No main merge, Netlify production deployment, Supabase production migrations, Play publication, live payments or live advertisements.
- Preserve source branches, real user data and existing V1 production.
- Never claim a security score, physical-device validation, restored production copy or indexation without evidence.
- No Web advertising; AdMob test identifiers only for testing.
- Server remains authoritative for rewards and entitlements.

## Review Focus

- In-flight account changes must not submit another account’s private GPS trace.
- Failed storage or network requests must not silently discard recordings or pending routes.
- Concurrent enqueue and upload must preserve every unsent route and link.
- Public and friend lookup SQL must respect intended privacy and relationship boundaries.
- Ad frequency, tutorial and Premium rules must remain true after retries and account changes.

## Tasks

### Task 1: Establish exact baseline and production differences
- [x] Compare branches and recent CI; read release, activation and audit docs.
- [x] Read Netlify current deployment and Supabase schema/advisors/migration ledger, without writes.
- [x] Install locked dependencies and run baseline Web verification.
- [ ] Run Android baseline and local PostgreSQL bench where available.

### Task 2: Preserve private GPS data across failures and account changes
**Files:** mobile/src/lib/routeSync.ts, mobile/src/lib/storage.ts, mobile/src/data/api.ts, mobile/src/data/SyncManager.tsx, session form/GPS screens; corresponding Jest tests.
**Interfaces:** Existing pendingRoutes, queueRoute, flushRoutes, linkSavedSession; routeSave/routeLink gain an explicit owner bound to the request token.
- [ ] Write and run regression tests for enqueue/flush races, capacity, permanent errors, sign-out retention and request identity.
- [ ] Fix minimal storage mutations and request binding; do not swallow persistence errors before releasing GPS recordings.
- [ ] Verify focused Jest tests, strict TypeScript and full Android suite.

### Task 3: Review privileged SQL and enforce privacy
**Files:** SQL tests/migrations and docs/V11_SQL_SECURITY_REVIEW_2026-11-02.md (SQL reviewer owns these).
- [ ] Review every alert exposure, trace authorization, classify findings.
- [ ] Reproduce confirmed defects before fixes; test on disposable database.

### Task 4: Check advertising and billing
**Files:** mobile/src/ads, advertising Jest tests, payment tests and monetization review document.
- [ ] Exercise pressure ceilings and negative billing paths; fix confirmed issues under test.
- [ ] Keep external Play/device validation explicitly open.

### Task 5: Final SEO
**Files:** Public SEO pages, behavioral tests, docs/V11_SEO_FINAL_2026-11-02.md.
- [ ] Use full Observatoire, inspect technical SEO and useful climbing content.
- [ ] Correct confirmed issues and deliver measured 30/60/90-day priorities.

### Task 6: Verify, review, preserve and report
- [ ] Full Web verify, history scan, SQL bench (both lanes), browser suite, Android typecheck/Jest/release bundle.
- [ ] Fresh review of the combined diff, regression fixes for important findings.
- [ ] Scan and commit code to isolated GitHub branch; create draft PR without merging.
- [ ] Report exact candidate, tests, limitations, risks and GO/NO-GO; no artificial 7.5/10.

## Execution ledger

### Reprise demandée — finir le code, consommation maîtrisée

- Direction confirmée : poursuivre les fonctions commencées, pas seulement un audit ; mettre à jour le cahier natif en place.
- Réutiliser l’architecture existante et les règles serveur. Le score Adventure vNext est parallèle aux XP/crédits, jamais un remplacement non validé.
- Chantiers indépendants : métriques natives des 260 sports et correction des maintiens ; RPG (rencontres, bestiaire, narration, score parallèle/simulations) ; Garmin/guilde natifs et intégration/CI par le responsable.
- Coach : respecter le cahier, qui place le grand espace de travail sur le Web en 2026 ; ne pas inventer une obligation de dupliquer chaque écran Web sur Android. Les comptes/droits/données partagés restent requis.
- Vérifier les changements par lots, puis une campagne finale consolidée ; ne pas relancer les mêmes audits sans changement pertinent.

- Baseline: 6b4bcaa; work isolated, source branches untouched, production read-only.
- Confirmed corrections and red/green regressions: GPS outboxes, session queue, auth/draft/receipt isolation; SQL legacy privacy; ads ceilings/effort/tutorial/consent; Play response ordering.
- Independent final review reproduced queue account leakage and requested strict-read readiness; regression tests added before fixes.
- Ruling: owner binding captures the validated session token for the actual RPC, rather than relying on a mutable client between check and fetch. This may reject a stale-token attempt; durable queues retain it for retry.
- Ruling: preserve rejected routes and links rather than automatically deleting them. Local capacity remains bounded and blocks an additional save explicitly; the original GPS recording remains exportable.
- Minor deferred: inherited friend list sorting can reveal relative hidden level/name order.
- Completed: local Web verification and all-unit suite447; Android strict types and Jest222; Metro release bundle; history4011; PGlite security regression and catalog probes; browser smoke346 + focused14; SEO27 navigations.
- Not completed: full browser campaign clean run, native SQL/restored copy, physical tests/external activation, unimplemented RPG/native parity. See final report. No overall completion or security7.5 claim.
- GitHub isolated branch and draft PR authorized by the supplied instructions; no additional permission gate introduced.
