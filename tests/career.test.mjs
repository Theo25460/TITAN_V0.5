import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
for (const f of ["format.js", "../training-store.js", "effort.js", "sports-catalog.js", "sports.js", "../sport-insights.js", "career.js"]) require(`../js/core/${f}`);
const { build, milestones } = globalThis.TitanCareer;

const NOW = new Date("2026-11-04T12:00:00Z");
let n = 0;
const log = (sport, daysAgo, unit, val, details = {}, extra = {}) => ({
  id: `l${++n}`, sport, unit, val, date: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(), details, ...extra,
});

test("an empty journal is empty, never a page of zeros pretending to be an achievement", () => {
  const c = build([], { now: NOW, range: "all" });
  assert.equal(c.empty, true);
  assert.equal(c.totals.sessions, 0);
  assert.deepEqual(c.lenses, []);
  assert.equal(c.steps, null);
});

test("calories are never invented: TITAN records none, so none are shown", () => {
  const c = build([log("running", 1, "km", 10, { duration: 55 })], { now: NOW, range: "all" });
  assert.deepEqual(c.calories, { available: false });
  assert.doesNotMatch(JSON.stringify(c), /kcal|calori(?!es\":\{\"available)/i);
});

test("kilometres go where they were recorded: on foot, by bike, in the water, and never from a sport without distance", () => {
  const logs = [
    log("running", 2, "km", 10, { duration: 55, elevation: 80 }),
    log("hiking", 3, "km", 12, { duration: 240, elevation: 700 }),
    log("cycling", 4, "km", 60, { duration: 120 }),
    log("swimming", 5, "m", 1500, { duration: 40 }),
    log("muscu_gym", 6, "kg", 80, { duration: 60 }), // a weight session has no kilometres
    log("football", 7, "min", 90, { duration: 90 }), // a team sport neither
  ];
  const c = build(logs, { now: NOW, range: "all" });
  assert.equal(c.distance.footKm, 22);
  assert.equal(c.distance.bikeKm, 60);
  assert.equal(c.distance.swimMeters, 1500);
  assert.equal(c.distance.otherKm, 0);
  assert.equal(c.elevation.meters, 780);
  assert.equal(c.totals.sessions, 6);
  assert.equal(c.totals.sports, 6);
  assert.equal(c.totals.minutes, 55 + 240 + 120 + 40 + 60 + 90);
});

test("an impossible speed earns no distance, but the session still counts as a session", () => {
  const c = build([log("running", 1, "km", 80, { duration: 30 }), log("cycling", 2, "km", 300, { duration: 60 })], { now: NOW, range: "all" });
  assert.equal(c.distance.footKm, 0);
  assert.equal(c.distance.bikeKm, 0);
  assert.equal(c.totals.sessions, 2);
});

test("suspicious, rejected, flagged, pending and archived sessions enter no total and no milestone", () => {
  const bad = [{ is_suspicious: true }, { status: "rejected" }, { status: "flagged" }, { status: "pending_review" }, { archived_at: "2026-10-01T00:00:00Z" }];
  const logs = bad.map((b, i) => log("running", i + 1, "km", 42.5, { duration: 240 }, b));
  const c = build(logs, { now: NOW, range: "all" });
  assert.equal(c.totals.sessions, 0);
  assert.equal(c.distance.footKm, 0);
  assert.deepEqual(c.milestones, []);
  assert.equal(c.excluded, 4, "archived ones are deleted, not 'excluded'");
});

test("a session in the future is not counted", () => {
  assert.equal(build([log("running", -3, "km", 10, { duration: 60 })], { now: NOW, range: "all" }).totals.sessions, 0);
});

test("steps are one number per day, never summed with distances, with the estimate kept apart and labelled", () => {
  const stepDays = [{ day: "2026-11-03", steps: 8000 }, { day: "2026-11-02", steps: 6000 }, { day: "2026-11-01", steps: 0 }, { day: "bad", steps: 99999 }];
  const c = build([log("running", 1, "km", 5, { duration: 30 })], { now: NOW, range: "all", stepDays });
  assert.equal(c.steps.total, 14000);
  assert.equal(c.steps.days, 2, "a day at zero is 'no data', not a day");
  assert.equal(c.steps.estimatedKm, 10.5);
  assert.equal(c.distance.footKm, 5, "step kilometres never join the session distance");
  assert.equal(build([], { now: NOW, range: "all", stepDays: null }).steps, null);
});

test("the range only keeps what happened inside it", () => {
  const logs = [log("running", 2, "km", 5, { duration: 30 }), log("running", 20, "km", 5, { duration: 30 }), log("running", 200, "km", 5, { duration: 30 })];
  assert.equal(build(logs, { now: NOW, range: "7d" }).totals.sessions, 1);
  assert.equal(build(logs, { now: NOW, range: "30d" }).totals.sessions, 2);
  assert.equal(build(logs, { now: NOW, range: "year" }).totals.sessions, 3);
  assert.equal(build(logs, { now: NOW, range: "all" }).totals.sessions, 3);
  const steps = [{ day: "2026-11-03", steps: 1000 }, { day: "2026-06-01", steps: 5000 }];
  assert.equal(build(logs, { now: NOW, range: "30d", stepDays: steps }).steps.total, 1000);
});

test("strength: sets, reps and volume only from sets that carry them", () => {
  const strength = log("muscu_gym", 1, "kg", 100, { duration: 60, exercises: [
    { name: "Squat", kind: "weighted", setRows: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }, { weight: 0, reps: 8 }] },
    { name: "Gainage", kind: "hold", setRows: [{ seconds: 60, weight: 0 }] },
  ] });
  const c = build([strength, log("muscu_gym", 2, "min", 45, { duration: 45 })], { now: NOW, range: "all" });
  assert.deepEqual(c.strength, { sessions: 1, sets: 4, reps: 18, volumeKg: 1000, loadedSets: 2, heaviestKg: 100 });
  assert.deepEqual(c.lenses, ["strength"]);
});

test("the lenses follow the practice that really has data, most present first; multisport only with real variety", () => {
  const runner = Array.from({ length: 5 }, (_, i) => log("running", i + 1, "km", 8, { duration: 45 }));
  assert.deepEqual(build(runner, { now: NOW, range: "all" }).lenses, ["run"]);
  const mixed = [...runner, log("cycling", 9, "km", 40, { duration: 90 }), log("muscu_gym", 10, "kg", 60, { duration: 50, exercises: [{ name: "x", setRows: [{ weight: 50, reps: 5 }] }] })];
  const lenses = build(mixed, { now: NOW, range: "all" }).lenses;
  assert.deepEqual(lenses.slice(0, 3), ["run", "bike", "strength"]);
  assert.equal(lenses.at(-1), "multi");
});

test("milestones are proved by real sessions: first 10 km needs one session of 10 km, not ten of 1 km", () => {
  const tens = Array.from({ length: 10 }, (_, i) => log("running", 30 - i, "km", 1, { duration: 6 }));
  assert.equal(milestones(tens).some((m) => m.id === "single:foot:10"), false);
  const real = [...tens, log("running", 5, "km", 10.2, { duration: 55 })];
  const m = milestones(real);
  assert.ok(m.some((x) => x.id === "single:foot:10" && x.title === "Premier 10 km"));
  assert.ok(m.some((x) => x.id === "single:foot:5" && x.title === "Premier 5 km"), "a longer session also proves the shorter first");
  assert.ok(m.some((x) => x.id === "sessions:10"), "the 10th session is dated");
  assert.ok(!m.some((x) => x.id === "single:bike:100"));
});

test("a first 100 km ride and a walk never cross lanes", () => {
  const m = milestones([log("cycling", 3, "km", 105, { duration: 300 }), log("walking", 4, "km", 120, { duration: 1400 })]);
  assert.ok(m.some((x) => x.id === "single:bike:100"));
  assert.ok(!m.some((x) => x.id === "single:foot:42.2"), "walking is not a marathon");
});

test("milestones are found in the whole journal and only filtered by the range", () => {
  const logs = [log("running", 300, "km", 10.5, { duration: 55 }), log("running", 2, "km", 5, { duration: 28 })];
  assert.ok(build(logs, { now: NOW, range: "all" }).milestones.some((x) => x.id === "single:foot:10"));
  assert.ok(!build(logs, { now: NOW, range: "7d" }).milestones.some((x) => x.id === "single:foot:10"));
});

test("the same account computed twice gives the same page, and no account data is mutated", () => {
  const logs = [log("running", 2, "km", 5, { duration: 30 })];
  const snapshot = JSON.stringify(logs);
  const a = JSON.stringify(build(logs, { now: NOW, range: "all" }));
  assert.equal(JSON.stringify(build(logs, { now: NOW, range: "all" })), a);
  assert.equal(JSON.stringify(logs), snapshot);
});

test("the RPG block only carries what the server confirmed", () => {
  const c = build([], { now: NOW, range: "all", rank: { level: 12, id: "gardien", name: "Gardien" }, xp: 3400 });
  assert.deepEqual(c.rpg, { level: 12, id: "gardien", name: "Gardien", xp: 3400 });
  assert.deepEqual(build([], { now: NOW }).rpg, { level: null, id: null, name: null, xp: null });
});

test("a pace comes from running only, and each lane keeps its own elevation", () => {
  const c = build([
    log("running", 1, "km", 10, { duration: 50, elevation: 100 }),
    log("hiking", 2, "km", 14, { duration: 300, elevation: 800 }),
    log("cycling", 3, "km", 60, { duration: 120, elevation: 500 }),
  ], { now: NOW, range: "all" });
  assert.equal(c.distance.footPace, 5, "10 km in 50 min = 5 min/km, the slow hike does not pull it down");
  assert.equal(c.distance.runKm, 10);
  assert.equal(c.distance.footElevation, 900);
  assert.equal(c.distance.bikeElevation, 500);
  assert.equal(c.elevation.meters, 1400);
});
