# Web activity hub Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Provide a usable web activity hub with GPX import and free manual entry, preserving the existing flow and drafts.
**Architecture:** Reuse the existing training picker and form. Add an opt-in hub state gated by `screens.activityhub` (false default). Parse GPX through the existing bounded reader only after an explicit compatible sport choice; provider connections remain on the existing profile consent flow.
**Tech Stack:** Existing vanilla JavaScript, CSS, node:test and Playwright. No dependency, SQL or native changes.
**Spec:** Google Doc 1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M, tab t.n0x3e3luwtop, WEB-SPORT-01/02/03, REC-01, GPX-01. Continuation authorized by the user's request to advance V1.1 and repeated Continue.

## Global Constraints
- No production, main merge, deployment, secrets or applied migrations.
- Keep the historic form and direct sport/duplicate/draft links working.
- Manual activity stays free; no subscription or sensor prerequisite.
- GPX only; no fictitious FIT/TCX, Health Connect web or Garmin availability.
- Final security/anti-cheat/SEO audits remain deferred.

## Design choice
Reuse the proven form behind the hub instead of replacing its storage or adding another editor. Inactive providers get clear explanatory text, not simulated connections. Garmin opens the existing consent interface only if its independent rollout flag is enabled. No exact-location persistence is added.

## Review Focus
- A pending file read after leaving the form must never replace another draft.
- A legacy draft must be recoverable without clearing it by merely visiting the hub.
- A late flag response must not steal focus or replace an edited form.
- Narrow-screen, keyboard and no-network entry must work.
- Imported GPX routes must remain unable to award activity XP without explicit manual entry.

## Task 1: Hub, import, resume and navigation
Files: js/app/seance.js, css/ascension-app.css, training.html, tests/e2e/activity-hub.e2e.mjs.
- [x] Write browser tests for flag-off legacy, opt-in hub/manual two clicks, import sport choice/save/summary, return navigation, draft reload, late flags and account epoch.
- [x] Run the new browser file and observe missing hub failures.
- [x] Add the hub state, UI and guarded navigation using existing onGpx and choose, keep drafts and links unchanged, no new provider API.
- [x] Run new and existing GPX/endurance/sport form tests.

## Task 2: Journal entry, verification and handoff
Files: js/app/journal.js, journal.html, package.json, docs/V11_ACTIVITY_HUB_HANDOFF_2026-10-30.md.
- [x] Add a visible manual-entry link from the Journal under the rollout flag and test both empty/populated journal access.
- [x] Verify no overflow at 360px, keyboard focus, source availability and account guards.
- [x] Run pnpm run verify and targeted browser journeys, request independent code review, fix significant findings with regressions.
- [x] Save the tested tree on an isolated remote branch and draft PR stacked on #119; update the source spec with evidence and remaining work.

## Ledger
Baseline: 388/388 unit tests passed. Fresh isolated checkout and branch codex/v11-activity-hub-20261030 from e95383e260e5c201a44c1d6de6bd6404b7a5569f. Existing temporary image write left untouched.

Final evidence: 388 unit tests; 38 targeted browser tests, including 11 hub tests, all green. Independent review finding (sport/focus reset) and account-draft isolation regression fixed RED→GREEN. Source/remote publication bookkeeping follows in the handoff and source spec.
