// V1.7.2 — Planifié et réalisé: occurrences of the typical week tied to the sessions really done, with the start of the week, the
// athlete's decisions and the result. Shared test set: tests/fixtures/week-plan-v172.json (also read by mobile/__tests__/weekPlan.test.tsx).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { replay } from "../tools/week-plan/replay.mjs";
const require = createRequire(import.meta.url);
require("../js/core/format.js");
require("../js/training-store.js");
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
globalThis.TitanSports.ensure();
const W = require("../js/core/week-plan.js");

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FIXTURE = read("./fixtures/week-plan-v172.json");
const EXPECTED = read("./fixtures/week-plan-v172.expected.json");
const label = (s) => globalThis.TitanSports.label(s);
const byName = (prefix) => FIXTURE.cases.find((c) => c.name.startsWith(prefix));
const run = (prefix) => replay(W, FIXTURE, byName(prefix));
const occ = (v, i) => v.occurrences.find((o) => o.id === `${v.week}/${i}`);

test("the shared test set and its expected output use the same rules version", () => {
  assert.equal(EXPECTED.version, W.VERSION);
  assert.equal(Object.keys(EXPECTED.cases).length, FIXTURE.cases.length);
});

for (const c of FIXTURE.cases) {
  test(`case — ${c.name}`, () => {
    const { view } = replay(W, FIXTURE, c);
    const e = EXPECTED.cases[c.name];
    assert.deepEqual(W.snapshot(view), e.view);
    assert.deepEqual(view.occurrences.map((o) => W.describe(o, { label })), e.words);
    assert.deepEqual(W.summarize(view), e.bilan);
  });
}

test("a stable identity: the Monday of the week and the index of the planned day, the same on two devices that never talked", () => {
  const a = W.week(FIXTURE.type, [], { today: "2026-11-21", zone: "Europe/Paris" });
  const b = W.week(JSON.parse(JSON.stringify(FIXTURE.type)), [], { today: "2026-11-18", zone: "America/New_York" });
  assert.deepEqual(a.occurrences.map((o) => o.id), ["2026-11-16/1", "2026-11-16/3", "2026-11-16/5"]);
  assert.deepEqual(b.occurrences.map((o) => o.id), a.occurrences.map((o) => o.id));
});

test("a move is counted once: no missed Tuesday and no extra Thursday run, where a plain day-by-day diff would count two gaps", () => {
  const { view } = run("2 —");
  assert.equal(view.summary.gaps, 1);
  assert.equal(view.summary.moved, 1);
  assert.equal(view.summary.missed, 0);
  assert.equal(view.extra.length, 0);
  assert.equal(occ(view, 1).link.session, "run-thu");
  // Without the decision, the same journal is one missed Tuesday plus one session outside the plan on Thursday.
  const plain = W.week(FIXTURE.type, FIXTURE.logs.filter((l) => l.id === "run-thu"), { today: FIXTURE.today, zone: FIXTURE.zone });
  assert.equal(occ(plain, 1).gap, "missed");
  assert.deepEqual(plain.extra.map((e) => e.id), ["run-thu"]);
});

test("the replacement keeps its real measures: neither the journal nor the schedule passed in is changed by reading or deciding", () => {
  const c = byName("1b");
  const before = JSON.stringify(FIXTURE);
  const { journal, view, schedule } = replay(W, FIXTURE, c);
  assert.equal(JSON.stringify(FIXTURE), before);
  const ride = journal.find((l) => l.id === "ride-thu");
  assert.deepEqual(ride, FIXTURE.logs.find((l) => l.id === "ride-thu"));
  assert.equal(ride.val, 31.4);
  assert.equal(ride.details.duration, 72);
  assert.equal(occ(view, 1).gap, "replaced");
  assert.deepEqual(occ(view, 1).actual, { day: "2026-11-19", sport: "cycling" });
  // The decision names the session; it copies none of its values.
  assert.deepEqual(Object.keys(schedule.weeks["2026-11-16"].occ["2026-11-16/1"]).sort(), ["at", "kind", "session"]);
  const frozen = JSON.stringify(schedule);
  W.week(schedule, journal, { today: FIXTURE.today, zone: FIXTURE.zone });
  assert.equal(JSON.stringify(schedule), frozen);
});

test("two eligible sessions: nothing is tied until the athlete chooses, and no gap is counted for that occurrence meanwhile", () => {
  const a = run("3a").view;
  assert.equal(occ(a, 1).status, "ask");
  assert.deepEqual(occ(a, 1).candidates, ["run-tue-am", "run-tue-pm"]);
  assert.equal(occ(a, 1).gap, null);
  const b = run("3b").view;
  assert.equal(occ(b, 1).link.how, "manual");
  assert.deepEqual(b.extra.map((e) => e.id), ["run-tue-am"]);
});

test("change of week: an edit on Wednesday keeps this week's start, applies next Monday, and the past keeps its reference", () => {
  const start = JSON.parse(JSON.stringify(FIXTURE.type));
  const { schedule, appliesFrom } = W.editType(start, "tuesday", { sport: "swimming", minutes: 40 }, { today: "2026-11-18", at: "2026-11-18T09:00:00.000Z" });
  assert.equal(appliesFrom, "2026-11-23");
  assert.equal(schedule.tuesday.sport, "swimming", "the typical week itself is edited, as before");
  assert.equal(W.reference(schedule, "2026-11-16", { current: "2026-11-16" }).days[1].sport, "running");
  assert.equal(W.reference(schedule, "2026-11-23", { current: "2026-11-16" }).days[1].sport, "swimming");
  // Later, from December, the week of 16 November still shows the run it started with.
  assert.equal(W.week(schedule, [], { week: "2026-11-16", today: "2026-12-07", zone: FIXTURE.zone }).occurrences[0].planned.sport, "running");
  // A second edit the same week replaces the pending revision, it does not stack.
  const again = W.editType(schedule, "tuesday", { sport: "cycling" }, { today: "2026-11-19", at: "2026-11-19T09:00:00.000Z" }).schedule;
  assert.deepEqual(Object.keys(again.revisions).sort(), ["2026-11-23", "_"]);
  assert.equal(W.reference(again, "2026-11-23", { current: "2026-11-16" }).days[1].sport, "cycling");
});

test("a first plan made in a week with nothing planned applies at once", () => {
  const { schedule, appliesFrom } = W.editType({}, "thursday", { sport: "running" }, { today: "2026-11-18" });
  assert.equal(appliesFrom, "2026-11-16");
  assert.equal(W.week(schedule, [], { today: "2026-11-18", zone: FIXTURE.zone }).occurrences[0].id, "2026-11-16/3");
});

test("a move or replacement stays inside its week; an unknown occurrence or kind is refused", () => {
  const s = JSON.parse(JSON.stringify(FIXTURE.type));
  assert.throws(() => W.decide(s, "2026-11-16/1", { kind: "move", day: "2026-11-23" }, { today: FIXTURE.today }), /WEEK_PLAN_OTHER_WEEK/);
  assert.throws(() => W.decide(s, "2026-11-16/0", { kind: "skip" }, { today: FIXTURE.today }), /WEEK_PLAN_NO_OCCURRENCE/);
  assert.throws(() => W.decide(s, "2026-11-17/1", { kind: "skip" }, { today: FIXTURE.today }), /WEEK_PLAN_BAD_DECISION/);
  assert.throws(() => W.decide(s, "2026-11-16/1", { kind: "delete" }, { today: FIXTURE.today }), /WEEK_PLAN_BAD_DECISION/);
  // « reset » cancels a decision: the occurrence is as planned again.
  const moved = W.decide(s, "2026-11-16/1", { kind: "move", day: "2026-11-19" }, { today: FIXTURE.today, at: "2026-11-17T07:00:00.000Z" });
  const back = W.decide(moved, "2026-11-16/1", { kind: "reset" }, { today: FIXTURE.today, at: "2026-11-17T08:00:00.000Z" });
  assert.equal(W.week(back, [], { today: FIXTURE.today, zone: FIXTURE.zone }).occurrences[0].effective.day, "2026-11-17");
});

test("remote modification: merging in either order gives the same decisions on both devices", () => {
  for (const prefix of ["6a", "6b"]) {
    const c = byName(prefix);
    const start = JSON.parse(JSON.stringify(FIXTURE.type));
    const apply = (ops) => ops.reduce((s, op) => W.decide(s, op.id, op.decision, { today: FIXTURE.today, at: op.at }), start);
    const local = apply(c.ops), remote = apply(c.remote);
    const journal = FIXTURE.logs.filter((l) => c.journal.includes(l.id));
    const read = (s) => W.week(s, journal, { today: FIXTURE.today, zone: FIXTURE.zone }).signature;
    assert.equal(read(W.merge(local, remote)), read(W.merge(remote, local)), prefix);
    assert.equal(read(W.merge(local, remote)), EXPECTED.cases[c.name].view.signature, prefix);
  }
});

test("the website's three-way preference merge (js/state.js) keeps both devices' decisions, occurrence by occurrence", () => {
  // Same function as titanMergeProfilePreferences in js/state.js, evaluated from the file so the test follows it.
  const src = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const canonical = src.match(/function titanProfileCanonical\(value\) \{[\s\S]*?\n\}/)[0];
  const merge3 = src.match(/function titanMergeProfilePreferences\(base, local, cloud\) \{[\s\S]*?\n\}/)[0];
  const plain = src.match(/function titanPlainObject\(v\) \{.*\}/)[0];
  const fn = new Function(`${plain}\n${canonical}\n${merge3}\nreturn titanMergeProfilePreferences;`)();
  const base = JSON.parse(JSON.stringify(FIXTURE.type));
  const local = W.decide(base, "2026-11-16/1", { kind: "move", day: "2026-11-19" }, { today: FIXTURE.today, at: "2026-11-18T10:00:00.000Z" });
  const cloud = W.decide(base, "2026-11-16/5", { kind: "skip" }, { today: FIXTURE.today, at: "2026-11-20T10:00:00.000Z" });
  const merged = fn(base, local, cloud);
  assert.deepEqual(Object.keys(merged.weeks["2026-11-16"].occ).sort(), ["2026-11-16/1", "2026-11-16/5"]);
});

test("time zone: without a recorded zone, the reading zone decides the day; with one, the session keeps its own day", () => {
  const late = FIXTURE.logs.find((l) => l.id === "run-tue-late");
  const bare = { ...late, details: { ...late.details, timezone: undefined } };
  assert.equal(W.sessionDay(late, "America/New_York"), "2026-11-17");
  assert.equal(W.sessionDay(bare, "Europe/Paris"), "2026-11-17");
  assert.equal(W.sessionDay(bare, "UTC"), "2026-11-17");
  assert.equal(W.sessionDay(bare, "Asia/Tokyo"), "2026-11-18");
  assert.equal(W.sessionDay({ ...late, details: { timezone: "Not/AZone" } }, "Asia/Tokyo"), "2026-11-18");
});

test("weeks across a daylight-saving change keep seven calendar days", () => {
  assert.equal(W.weekOf("2026-10-25"), "2026-10-19");
  assert.equal(W.addDays("2026-10-19", 7), "2026-10-26");
  assert.equal(W.weekOf("2026-03-29"), "2026-03-23");
});

test("the stored record stays small: 26 weeks of decisions are kept, older ones pruned, revisions needed by kept weeks stay", () => {
  let s = JSON.parse(JSON.stringify(FIXTURE.type));
  let today = "2026-01-05";
  for (let i = 0; i < 40; i++) {
    const w = W.weekOf(today);
    s = W.decide(s, `${w}/1`, { kind: "move", day: W.addDays(w, 3) }, { today, at: `${today}T08:00:00.000Z` });
    s = W.decide(s, `${w}/5`, { kind: "replace", sport: "running" }, { today, at: `${today}T09:00:00.000Z` });
    if (i % 5 === 0) s = W.editType(s, "saturday", { sport: i % 10 ? "cycling" : "swimming", minutes: 60 }, { today, at: `${today}T10:00:00.000Z` }).schedule;
    today = W.addDays(today, 7);
  }
  const weeks = Object.keys(s.weeks).sort();
  assert.equal(weeks.length, W.MAX_WEEKS);
  assert.ok(JSON.stringify(s).length < 40000, `${JSON.stringify(s).length} bytes`);
  // The oldest kept week still finds the typical week in force on its Monday.
  assert.ok(W.reference(s, weeks[0], { current: W.weekOf(today) }).days[5]);
});

test("the typical week the QG and the reminders read is unchanged: monday … sunday keep their shape", () => {
  const { schedule } = W.editType({ monday: { sport: "running", minutes: 30, note: "x", habits: ["kept"] } }, "monday", { sport: "cycling", minutes: 45 }, { today: "2026-11-18" });
  assert.deepEqual(schedule.monday, { sport: "cycling", minutes: 45, note: "", habits: ["kept"] });
  assert.deepEqual(W.typeDays(schedule)[0], { sport: "cycling", minutes: 45, note: "" });
});
