// Lot D — personal progression: last comparable session, evolution per discipline, two periods across sports. Measured only.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
require("../js/core/format.js");
require("../js/training-store.js");
require("../js/core/effort.js");
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
require("../js/sport-insights.js");
require("../js/core/progress.js");
const P = require("../js/core/progression.js");
globalThis.TitanSports.ensure();

const at = (d, h = 18) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const run = (id, d, km, min, extra = {}) => ({ id, sport: "running", unit: "km", val: km, date: at(d), details: { duration: min }, ...extra });
const lift = (id, d, rows) => ({ id, sport: "muscu_gym", unit: "kg", val: 1, date: at(d), details: { duration: 60, exercises: [{ name: "Squat", setRows: rows }] } });

test("a run is compared with the last run of comparable distance, on pace, with the threshold stated", () => {
  const logs = [run("a", 1, 10, 55), run("short", 5, 3, 15), run("b", 8, 10.2, 54)];
  const c = P.compare(logs[2], logs);
  assert.equal(c.previous.id, "a", "the 3 km run is not comparable with 10 km");
  const pace = c.items[0];
  assert.equal(pace.unit, "min/km");
  assert.equal(pace.direction, "better");
  assert.equal(pace.significant, true);
  assert.equal(P.formatValue(pace), "5:18 /km");
  assert.match(c.basis, /Distance comparable/);
});

test("a change below the threshold is stable; nothing is compared without a measured duration or a previous session", () => {
  const logs = [run("a", 1, 10, 55), run("b", 8, 10, 54.5)];
  assert.equal(P.compare(logs[1], logs).items[0].direction, "stable");
  assert.equal(P.compare(logs[0], logs), null, "first run: nothing to compare");
  assert.equal(P.compare(run("x", 9, 10, null), logs), null, "no duration: no pace invented");
});

test("held, refused or implausible sessions are never the reference", () => {
  const logs = [run("ok", 1, 10, 60), run("held", 3, 10, 40, { is_suspicious: true }), run("absurd", 4, 10, 2), run("now", 8, 10, 55)];
  assert.equal(P.compare(logs[3], logs).previous.id, "ok");
});

test("strength compares the same exercise: top set, same load with more reps, and volume", () => {
  const logs = [lift("a", 1, [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }]), lift("b", 8, [{ weight: 100, reps: 7 }, { weight: 100, reps: 5 }])];
  const c = P.compare(logs[1], logs);
  const top = c.items.find((i) => i.id.startsWith("top:"));
  assert.equal(top.direction, "better", "same load, more repetitions is progress");
  assert.equal(top.currentReps, 7);
  const volume = c.items.find((i) => i.id.startsWith("volume:"));
  assert.equal(volume.current, 1200);
  assert.equal(volume.direction, "better");
  assert.match(c.basis, /Squat/);
});

test("climbing compares grades within one system only", () => {
  const climb = (id, d, best, system = "Fontainebleau bloc") => ({ id, sport: "bouldering", unit: "min", val: 90, date: at(d), details: { duration: 90, extras: { grade_system: system, climbing_discipline: "Bloc", max_done: best } } });
  const logs = [climb("a", 1, "6A"), climb("v", 3, "V5", "V-scale bloc"), climb("b", 8, "6B+")];
  const c = P.compare(logs[2], logs);
  assert.equal(c.previous.id, "a");
  assert.equal(c.items[0].direction, "better");
  assert.equal(P.formatValue(c.items[0]), "6B+");
});

test("a racket or team session shows shared measures side by side, never judged", () => {
  const tennis = (id, d, aces) => ({ id, sport: "tennis", unit: "min", val: 90, date: at(d), details: { duration: 90, extras: { aces } } });
  globalThis.SPORTS_CONFIG.tennis.extraFields = [{ id: "aces", label: "Aces", type: "number" }];
  const logs = [tennis("a", 1, 3), tennis("b", 8, 6)];
  const c = P.compare(logs[1], logs);
  assert.equal(c.items[0].kind, undefined);
  assert.equal(c.items[0].direction, "neutral", "duration is not better or worse");
  const aces = c.items.find((i) => i.id === "extra:aces");
  assert.deepEqual([aces.current, aces.previous, aces.direction], [6, 3, "neutral"]);
});

test("evolution per discipline needs measured sessions in both halves and says how many", () => {
  const now = new Date(Date.UTC(2026, 9, 31));
  const logs = [run("1", 5, 10, 60), run("2", 8, 10, 59), run("3", 25, 10, 55), run("4", 28, 10, 54), lift("l", 27, [{ weight: 80, reps: 5 }])];
  const rows = P.disciplines(logs, { now, weeks: 6 });
  const r = rows.find((x) => x.sport === "running");
  assert.equal(r.trend.enough, true);
  assert.equal(r.trend.direction, "better");
  assert.deepEqual([r.trend.beforeSessions, r.trend.afterSessions], [2, 2]);
  const m = rows.find((x) => x.sport === "muscu_gym");
  assert.equal(m.trend.enough, false, "one session is not a trend");
});

test("two periods across sports compare declared minutes; estimates are counted apart and a young journal is partial", () => {
  const now = new Date(Date.UTC(2026, 10, 28));
  const logs = [
    run("first", 1, 5, 30), // October 1: before both periods (the journal is older than the comparison)
    run("old", 20, 10, 50), // October 20: previous period
    { id: "y", sport: "yoga", unit: "min", val: 45, date: new Date(Date.UTC(2026, 10, 20)).toISOString(), details: { duration: 45 } },
    { id: "s", sport: "pompes", unit: "reps", val: 100, date: new Date(Date.UTC(2026, 10, 21)).toISOString(), details: {} },
  ];
  const p = P.periods(logs, { now, days: 28 });
  assert.equal(p.current.sessions, 2);
  assert.equal(p.current.minutes, 45, "only declared minutes");
  assert.equal(p.current.unmeasuredSessions, 1);
  assert.ok(p.current.estimatedMinutes > 0, "the estimate is reported apart");
  assert.equal(p.previous.partial, false);
  assert.deepEqual(p.delta, { sessions: 1, activeDays: 1, minutes: -5 });
  assert.equal(p.current.families.find((f) => f.family === "mobilite").share, 1);
  const young = P.periods(logs.slice(2), { now, days: 28 });
  assert.equal(young.previous.partial, true);
  assert.equal(young.delta, null, "no comparison against a period before the first session");
});

test("the Android app runs the same progression module", () => {
  assert.equal(readFileSync(new URL("../mobile/src/core/web/progression.js", import.meta.url), "utf8"), readFileSync(new URL("../js/core/progression.js", import.meta.url), "utf8"));
});
