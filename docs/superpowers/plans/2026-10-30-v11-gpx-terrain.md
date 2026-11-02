# GPX terrain and pauses Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, then independent whole-branch review.

**Goal:** Add truthful GPX speed/slope colouring, estimated pauses and a primary climb without retaining exact location.
**Architecture:** Extend the existing bounded parser on its cleaned points. Keep original v2 totals and reward behaviour. Add optional `terrainVersion: gpx-terrain-v1` metadata; sampled location and colour values are preview-only. Persist only bounded non-location climb/pause summaries.
**Tech Stack:** Existing checked JavaScript, vanilla DOM/SVG/CSS, node:test and Playwright; no new dependency.
**Spec:** Source Google Doc 1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M, tab t.n0x3e3luwtop, GPX-02/04 and REC-05. Existing user authorization: advance V1.1, repeated Continue. Base #120 / 0a683139e613caf3a22a81bef12de4675df45a99.

## Global Constraints
- No production, main merge, deployment, SQL, secret or Android change.
- No external map/DEM, provider access, verified badge or reward modification.
- UI rollout `screens.gpxterrain` is false by default; original GPX view stays available.
- Planned routes never gain speed/pauses from planned timestamps.
- Missing data stays unavailable; segments, altitude gaps and timing gaps stay separate.
- No precise location persists in draft or activity; summary schema explicitly allowlisted.
- Final anti-cheat/security/SEO audits remain deferred.

## Design decisions
Use the existing local SVG rather than adding a remote map. Colours use a fixed speed scale (0–5 / 5–15 / 15–30 / >=30 km/h) or slope bands (<-3 / -3..3 / 3..8 / >=8%). Unknown values grey. Colour intervals average along sampled path distance, never a claim of instantaneous speed. Slope needs at least 20m and uninterrupted altitude; values outside +/-100% are unavailable.
Estimated pauses: consecutive intervals below 0.4m/s, minimum 20 seconds, only complete recorded tracks. Inter-segment time and moving intervals >=300s are unobserved time, never labelled a pause. List at most 50 pauses with count/total retained.
Primary climb: greatest net altitude gain over one continuous altitude run, minimum 20m gain and 100m travelled; a descent of 10m ends a candidate. Minor noise below that is tolerated; distance markers and net slope are retained, not GPS. Thresholds are implementation choices, explained in the UI and handoff; no universal sport certification claimed.

## Review Focus
- Sparse samples must use travelled distance and not fabricate speed over a gap.
- Altitude missing inside a sample interval must disable its slope and split climbs.
- Planned routes with timestamps must still have no speed or pause analysis.
- Long/fragmented files must keep preview, summary and SVG sizes bounded.
- Reloaded/manual-edited sessions must show original-file summaries, without retaining raw coordinates or arbitrary imported properties.

## Task 1: Analysis
Files: js/core/gpx.js, tests/gpx-analysis.test.mjs.
- [x] Add and run failing tests for pause grouping vs unobserved segment gaps, sparse movement, missing/invalid/planned times, main climb/noise/gaps, bounds and aligned preview metrics.
- [x] Implement terrain extraction on cleaned points, returning bounded previewMetrics, primaryClimb and pauses without altering original totals.
- [x] Run GPX units, full unit suite and core typecheck.

## Task 2: UI and persistence
Files: js/core/gpx-view.js, js/app/seance.js, js/titan_features.js, css/ascension-app.css, html cache versions, tests/e2e/gpx-analysis.e2e.mjs.
- [x] Add failing browser tests for speed/slope choice, missing data, pauses/climb readback and preview-only location persistence.
- [x] Render accessible mode buttons, fixed numeric colour legend and textual availability; keep colour mode changes local and focus stable. Show persisted pause/climb summaries with original-file disclaimer.
- [x] Extend the allowlisted sanitizer with strict bounded numeric summaries; remove previewMetrics from saved drafts.
- [x] Run verify and related browser suites sequentially after build, inspect a mobile screenshot, independent review, regression-fix important findings.
- [x] Save tested tree as an isolated draft PR stacked on #120, update source spec and explicit remaining work.

## Ledger
Baseline: clean branch checkout except pre-existing temporary image write (untouched). 388 unit tests at base. No implementation yet.

Final review: independent reviewer confirmed two P2 defects; both fixed with RED→GREEN regressions. 397 unit tests and release checks green. Browser evidence and remaining work in docs/V11_GPX_TERRAIN_HANDOFF_2026-10-30.md.
