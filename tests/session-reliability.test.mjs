// Lot A — reliability of the session chain: shared bounds, counted sessions, plausible records, duplicate efforts.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const T = require("../js/training-store.js");
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
const C = require("../js/core/sport-contracts.js");
require("../js/sport-insights.js");
const I = globalThis.TitanInsights;
const P = (require("../js/core/format.js"), require("../js/core/effort.js"), require("../js/core/progress.js"));

const run = (o = {}) => ({ id: o.id || "r1", sport: "running", unit: "km", val: 42.2, date: "2026-11-01T08:00:00Z", details: { duration: 215 }, ...o });

test("shared bounds match the server trigger: 1000 km, duration beyond 300 km, 120 km/h, 300 km of swimming, 30 exercises", () => {
  const codes = (m) => T.measureIssues(m).map((i) => i.code);
  assert.deepEqual(codes({ km: 10, minutes: 50 }), []);
  assert.deepEqual(codes({ km: 21.1, minutes: 7 }), ["SPEED_IMPLAUSIBLE"]);
  assert.deepEqual(codes({ km: 350 }), ["ULTRA_NEEDS_DURATION"]);
  assert.deepEqual(codes({ km: 1200, minutes: 1400 }), ["DISTANCE_RANGE"]);
  assert.deepEqual(codes({ meters: 300001 }), ["METERS_RANGE"]);
  assert.deepEqual(codes({ minutes: 1441 }), ["DURATION_RANGE"]);
  assert.deepEqual(codes({ exercises: Array(31).fill({}) }), ["EXERCISES_RANGE"]);
});

test("a session held or refused by the server counts in no record, no progress and no weekly figure", () => {
  const ok = run();
  for (const bad of [run({ id: "s", is_suspicious: true, val: 50 }), run({ id: "f", status: "flagged", val: 50 }), run({ id: "p", status: "pending_review", val: 50 }), run({ id: "e", syncStatus: "error", val: 50 })]) {
    assert.equal(T.counted(bad), false, bad.id);
    const longest = I.records([ok, bad]).find((r) => r.id === "distance:running");
    assert.equal(longest.value, 42.2, `${bad.id} became the longest distance`);
    assert.equal(P.activeLogs([ok, bad], new Date("2026-11-10")).length, 1, `${bad.id} counted in progress`);
  }
});

test("an implausible measure (a marathon edited to 1 minute) stays in the journal but feeds no record", () => {
  const edited = run({ id: "x", date: "2026-11-02T08:00:00Z", details: { duration: 1 } });
  assert.equal(T.plausible(edited), false);
  const time = I.records([run(), edited]).find((r) => r.id === "time:running:42.2");
  assert.equal(time.value, 215);
});

test("the same effort under a neighbouring sport id is recognised before a new entry is saved", () => {
  const watch = { id: "w", sport: "treadmill", unit: "km", val: 8, date: "2026-11-16T18:00:00Z", created_at: "2026-11-16T19:30:00Z", details: { duration: 45, import_source: "garmin" } };
  assert.equal(C.findDuplicate({ sport: "running", date: "2026-11-16T18:10:00Z", minutes: 40 }, [watch])?.id, "w");
  assert.equal(C.findDuplicate({ sport: "running", date: "2026-11-16T19:00:00Z", minutes: 30 }, [watch]), null, "after the effort");
  assert.equal(C.findDuplicate({ sport: "cycling", date: "2026-11-16T18:10:00Z", minutes: 40 }, [watch]), null, "other family");
  assert.equal(C.findDuplicate({ sport: "running", date: "2026-11-16T18:10:00Z", minutes: 40 }, [{ ...watch, archived_at: "x" }]), null, "archived");
  // An older entry saved « now » was dated at the END of its effort: it is read both ways, as the server does.
  const typedNow = { id: "n", sport: "running", unit: "km", val: 8, date: "2026-11-16T18:45:00Z", created_at: "2026-11-16T18:46:00Z", details: { duration: 45 } };
  assert.equal(C.findDuplicate({ sport: "trail", date: "2026-11-16T18:00:00Z", minutes: 45 }, [typedNow])?.id, "n");
});

test("the web journal and records no longer recompute every record on every keystroke or prefix (source contract)", () => {
  const records = readFileSync(new URL("../js/app/records.js", import.meta.url), "utf8");
  assert.ok(!/records\(prefix/.test(records), "records.js recomputes records on every prefix");
  const journal = readFileSync(new URL("../js/app/journal.js", import.meta.url), "utf8");
  assert.match(journal, /recordCache/);
  assert.match(journal, /details\?\.bio\?\.rpe/, "the Ressenti column reads bio.rpe");
});

test("the queue treats a rate limit as temporary and never shows a raw server code (source contract)", () => {
  const main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(main, /const rateLimited = /);
  assert.match(main, /permanent = !rateLimited/);
  assert.match(main, /titanDiscardRefusedSessions/);
});
