# Consent-scoped Coach analysis Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, independent review at completion.

**Goal:** Make the existing private coaching relationship useful through honest period/session/programme summaries.
**Architecture:** A pure checked-JS analysis module consumes only the existing consent-filtered sessions/assignments RPC responses. The existing view/context guards remain authoritative. An optional `screens.coachanalysis` (default false) adds a selected-athlete summary in coach mode; no new requests, sharing category, storage or export.
**Tech Stack:** Existing vanilla JS/CSS/SVG, node:test, Playwright. No dependency or SQL change.
**Spec:** Google Doc 1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M, V1.1 tab t.n0x3e3luwtop, COACH-03/06/08/09. User authorized autonomous continuation of V1.1. Base PR #121 / 07e88744c541524c6ebca6d2582b97a234a028e3.

## Global Constraints
- No production/main/deployment/secrets/SQL/Android change.
- Use only data already returned by the current sharing RPC; no athlete own-history fallback, RPE/health/GPS retrieval or invented sRPE.
- Shared data stays in memory, existing account/client/epoch/revision safeguards preserved.
- No new paid offers, capacity, invitations or billing rights; legacy server capacity remains a separate migration topic.
- Default-off analysis feature, old forms/flows retained. Final security/anti-cheat/SEO audits remain deferred.

## Decisions and review focus
- Use UTC, exactly as the RPC; respect its effective from_date/to_date and never widen to before consent.
- Sum only declared duration, or a directly shared minute/hour value; no conversion from distance/reps/weight. Missing duration is counted explicitly, not silently zero.
- Programme adherence considers accepted/completed proposals in the selected period whose planned day is before today. Today/future, declined/cancelled/proposed are not failures. No percentage before assignment pagination is complete.
- Session and proposal lists are paginated separately; all summary counts say loaded subset until complete. Deduplicate IDs and reject invalid/future data.
- On selected athlete/period/account change, invalidation or revoke error, no old summary may remain. Flag updates cannot add requests or resurrect stale details.

## Task 1 — Pure analysis
Files: js/core/coach-analysis.js, tests/coach-analysis.test.mjs, tsconfig.sport-core.json, package.json.
- [x] Write tests for duration absence/zero/direct time units, mixed sports (no mixed km/kg totals), UTC/consent period, duplicate/invalid/future rows, incomplete pages, accepted/completed due proposals and empty ranges.
- [x] Run RED, implement `analyse({sessions,assignments,from,to,now})`, run GREEN and checked types.

## Task 2 — Private Coach summary
Files: js/app/coaching.js, coaching.html, css/ascension-app.css, tests/e2e/coach-analysis.e2e.mjs.
- [x] Add browser tests using existing intercepted RPC synthetic accounts: correct summaries, pagination warnings, default-off/coach-only, revocation/account switch and no local-history fallback, viewport/axe.
- [x] Observe missing summary RED, add accessible cards and per-sport table inside selected shared-session scope, using current response metadata only. Explain unavailable sRPE.
- [x] Run verify and existing coaching context/forms/browser suites, independent review, regression-fix important findings.
- [x] Save tested tree on isolated draft PR stacked on #121; update authoritative spec and remaining work.

## Ledger
Fresh checkout on isolated branch codex/v11-coach-analysis-20261030. Existing temporary image write untouched. No implementation yet.

Final evidence: baseline 397 units; 406 final units and verify green; 39 targeted browser tests green (6 analysis, 15 context, 18 forms). Independent review zero-display issue fixed RED→GREEN. No rights or extra-data access changes; limitations in docs/V11_COACH_ANALYSIS_HANDOFF_2026-10-30.md.
