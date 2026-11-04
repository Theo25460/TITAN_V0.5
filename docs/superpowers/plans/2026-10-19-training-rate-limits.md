# Training mutation rate limits implementation plan

**Goal:** CHEAT16, CHEAT17 and CHEAT18: make session quotas survive deletion and serialize concurrent mutations without changing rewards.
**Spec:** Titan living CDC, three-point cadence and data-integrity requirements, read 19 October 2026. Existing creation quotas: 12/hour, 40/24h, history 300/24h.
**Architecture:** An AFTER INSERT/UPDATE trigger counts accepted own-account API mutations in a private ledger under a per-owner row lock. Existing receipt replay never inserts/updates and costs no quota. No hard-delete trigger: account erasure must remain possible. Privileged maintenance and cross-account moderation are not user traffic.
**Scope:** One migration, SQL regressions, concurrency test and runner integration, handoff. No production or client changes. Inline execution under the user's standing autonomy instruction.

## Review focus

Deletion/recreation, cross-account isolation, expired windows and concurrent final allowance, lost response replay, account erasure and private metadata. Denials must roll back reward/receipt/usage together; PostgreSQL LOG survives the rollback, database inserts do not.

## Task 1: Durable session quotas

- [x] Add a behavioural SQL reproduction: 12 successful API submissions interleaved with privileged deletion, then a thirteenth must fail TRAINING_RATE_LIMIT; original receipt replay must still succeed without another reward.
- [x] Run on the parent (RED: thirteenth accepted).
- [x] Add a private rolling 24h event ledger and per-owner lock; same creation limits, 120 edits/hour and 600/24h (creation/history retain their separate budgets). INSERT historical category is server-derived; UPDATE includes archive/restore. Authenticated API own-account changes only. Denial LOG has a fixed code, owner UUID and counts; no raw payload. Do not insert denied events into a rolled-back transaction.
- [x] Add tests for updates, imports, quota boundaries, expiry, ACL/RLS, deletion, complete rollback, migration reapplication and caller transaction ownership. Schedule daily expiry cleanup only if pg_cron exists, with a service-only maintenance function otherwise.
- [x] Run both migration paths locally on PGlite18: new suites pass; four unrelated failures also reproduced on parent. Verify/build/release checks pass (238/238).
- [ ] Run official native PG16 two-path bench and real concurrent final-slot/replay contract; GitHub CI blocked by rejected push.
- [x] One independent Astra high review; no Critical/Important finding. Local handoff and CDC real statuses.
- [ ] Publish branch and PR after explicit authorization; no alternate export.

## Ledger

- Base dbdc91d54f4b3c89e722d86dcc79c32447546e6d. Checkpoint PR102 was delivered during exploration and its claim released. The two histories are joined by merge0f9445b; only the new migration inventory is added to its release plan/preflight, as required by existing tests.
- Ruling: physical DELETE has no client grant; creation ledger survives privileged deletion. DELETE trigger excluded so account erasure cannot be throttled. Cost: privileged service maintenance is trusted and outside API spam limits.

- Ruling: edit quota is separate from the 300/day historical-import allowance so a legitimate import retains its existing capacity. Cost if wrong: more accepted aggregate requests than a single shared 120/hour cap.
- Fixtures: advance the privileged synthetic ingestion clock with RPG time compression; explicit service_role for administrative backdated history. No test-only production bypass.
- Final review: independent Astra high, new SQL and reapplication suites independently executed on PGlite18.6; no Critical/Important. Native concurrency, provider logs and cron not judged.
- Runtime limitation: PGlite18 is supplementary validation, not an assertion that PG16 official CI passed. Remote publication rejected by automatic approval review.
