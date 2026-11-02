# Coach comparison implementation plan

Goal: continue COACH-06 with a private comparison of two adjacent seven-day periods using only already-authorized shared data.
Architecture: extend the typed pure Coach analysis core; render inside the existing default-off Coach analysis panel. No new requests, database changes, persistence or health inference.
Spec: living cahier des charges, V1.1 COACH-03/06, read 31 October 2026; previous implementation PR #122 at 370fa67.

Constraints: UTC complete days only; latest window ends at min(selected/server end, yesterday). Both seven-day windows must fit the effective selected/server consent range. Require complete validated session and proposal envelopes before publishing a comparison. Count absence of sessions as zero only when coverage is complete. Missing durations suppress duration deltas, not session counts. No percentages from a zero baseline. Adherence differences in percentage points only when both denominators exist. Never use the coach's personal history. Preserve V1, default-off flag and account/context invalidation.

Task 1 — pure core, tests/coach-analysis.test.mjs and js/core/coach-analysis.js.
- RED: assert exact UTC windows, deltas and per-sport figures; reject partial/invalid/short coverage, duplicates and malformed rows; test missing durations, zero baseline, due-only tasks and month/year rollover.
- GREEN: add compare(input) consuming the same input as analyse; return available/reason, two scoped analyses and safe deltas. Validate complete outer envelope before scoping periods; scoped analyses receive their own row totals.
- Verify: node --test tests/coach-analysis.test.mjs; pnpm run typecheck.

Task 2 — UI in js/app/coaching.js, existing responsive table styles, tests/e2e/coach-analysis.e2e.mjs.
- RED: verify visible dates/current/previous/deltas at 360 and 1280px, partial pagination suppression/recovery, short consent, unknown duration, flag-off, account-switch and revocation. Ensure no extra RPC and no private local-history leakage.
- GREEN: render current/previous summary and per-sport comparison with explicit UTC/source/coverage, unavailable explanations and no pressure labels. Reuse existing analysis flag and context.
- Verify: pnpm run verify; Coach analysis/context/forms browser suites, axe A/AA and visual screenshot inspection.

Review focus: timestamps at UTC midnight, clipping at consent, partial pagination, missing versus zero duration, per-sport disappearance/new sport. Cover each in the core or browser tests. Review the final diff independently before saving. No merging or deployment.

Execution ledger: Tasks 1 and 2 complete. Core RED (missing comparison) then GREEN; browser RED (missing comparison), accessibility failure reproduced then fixed with named keyboard-focusable regions. Fixed-column tables visually inspected on mobile. Independent reviewer: one Important finding, malformed date plus inconsistent zero total; regression RED (RangeError), validation fixed GREEN. No rulings or deferred minors. Final evidence recorded in docs/V11_COACH_COMPARISON_HANDOFF_2026-10-31.md.
