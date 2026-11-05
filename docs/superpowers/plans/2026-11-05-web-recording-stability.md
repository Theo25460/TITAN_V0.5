# Web recording and navigation stability

Goal: remove false cache-review notices, keep the QG stable during background refreshes, and give manual recording and GPX/Garmin import equal visibility using TITAN's existing cyan/dark design.

Implementation stays in the static web application; no native Android changes, database changes, new product dependencies or production deployment.

- [x] Cache: preserve the state timestamp when writing a cloud read to local storage. Remove the speculative cache-review toast; keep reconciliation and actual recovery protection. Regression: a local-only save never advances a cloud timestamp; repeated reads never announce a difference based solely on a date.
- [x] QG: update changed sections in place, retain identical sections, preserve expanded details and focus, disable repeated entrance animation. Keep async optional cards below the primary action and week. Regression: a steps refresh retains the hero node and an expanded detail; no entrance animations restart.
- [x] Recording: two prominent mode buttons above both the hub and manual pages. Keep feature gating, direct sport URLs, draft confirmation and resume behavior. Replace the GPX native select with searchable sport cards; preserve the selected sport and asynchronous GPX safety checks. Verify keyboard selection, empty search, draft switching and flag refreshes.
- [x] Icons: correct observable geometry defects (off-centre mountain, incomplete bike frame, inverted upload) and make SVG boxes consistently centred. Preserve the brand mark and existing illustration assets unless inspection shows an actual display defect.
- [x] Run targeted unit/browser regressions, full unit suite, build and relevant browser checks at mobile/desktop widths. Inspect screenshots and publish a reviewable branch/PR without deploying.

Validation: npm test 500/500; TypeScript check; build; release safety; 56/56 focused browser tests (recording, GPX, profile conflict/recovery, QG ownership/refresh/focus, shell focus, hints, motion). Visual inspection of desktop/mobile recording screenshots and QG/profile/adventure; eight-screen audit across 320/390/768/1280 reported zero findings. Rank crest/level grouped and guardian portrait centred on phones. Independent review found a conditional-sibling focus bug; fixed with keyed nested reconciliation and a failing-then-passing regression, rechecked by reviewer. No production deployment.
