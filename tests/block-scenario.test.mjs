// V1.7.6 — Scénarios multisports: two private variants of a few weeks compared on what the plan gives (time per sport, free days,
// overlaps, milestones that move), one applied from an explicit Monday through a preview, then undone. Shared test set:
// tests/fixtures/block-scenario-v176.json (also replayed by mobile/__tests__/blockScenario.test.tsx through the same replay.cjs).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
require("../js/core/format.js");
require("../js/training-store.js");
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
globalThis.TitanSports.ensure();
const W = require("../js/core/week-plan.js");
const B = require("../js/core/training-block.js");
const S = require("../js/core/block-scenario.js");
const { replay, project } = require("../tools/block-scenario/replay.cjs");

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FIXTURE = read("./fixtures/block-scenario-v176.json");
const EXPECTED = read("./fixtures/block-scenario-v176.expected.json");
const label = (s) => globalThis.TitanSports.label(s);
const dayLong = (k) => k;
const byName = (prefix) => FIXTURE.cases.find((c) => c.name.startsWith(prefix));
const run = (prefix) => replay(W, B, S, FIXTURE, byName(prefix));
const ID = "velo-badminton";
const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
// The calendar a person reads: for each week, each day's sport and minutes, the decision, the state and the session tied to it.
const lived = (res) => res.weeks.map((w) => ({ week: w.week, days: w.reference.days, occurrences: w.occurrences, extra: w.extra, summary: w.summary }));
const PERIOD = ["2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21"];

test("the shared test set and its expected output use the same rules version", () => {
  assert.equal(EXPECTED.version, S.VERSION);
  assert.equal(Object.keys(EXPECTED.cases).length, FIXTURE.cases.length);
});

for (const c of FIXTURE.cases) {
  test(`case — ${c.name}`, () => {
    assert.deepEqual(project(W, B, S, replay(W, B, S, FIXTURE, c), label, dayLong), EXPECTED.cases[c.name]);
  });
}

test("the two variants show the right gaps of time and slots, computed from the plan only", () => {
  const c = run("1 —").compare[0];
  // A: Tuesday bouldering 1 h 30, Wednesday and Saturday rides of 2 h 30 and 3 h 30, four weeks, none fitted.
  assert.deepEqual(c.plans.a.sports, { bouldering: { minutes: 360, sessions: 4, unknown: 0 }, cycling: { minutes: 1440, sessions: 8, unknown: 0 } });
  // B: a short ride (1 h) and the long one (3 h 30), badminton kept; the week of 14 December without Wednesday and Thursday, the
  // week of 21 December empty (made to fit what the athlete said).
  assert.deepEqual(c.plans.b.sports, { badminton: { minutes: 120, sessions: 2, unknown: 0 }, bouldering: { minutes: 270, sessions: 3, unknown: 0 }, cycling: { minutes: 750, sessions: 5, unknown: 0 } });
  assert.deepEqual(c.rows.map((r) => [r.sport, r.delta]), [["badminton", 120], ["bouldering", -90], ["cycling", -690]]);
  assert.deepEqual(c.free, { active: 16, a: 16, b: 18, delta: 2 });
  assert.deepEqual(c.conflicts, { active: 5, a: 4, b: 1 });
  assert.deepEqual(c.plans.a.conflicts.map((x) => `${x.kind}:${W.addDays(x.week, x.day)}`), ["unavailable:2026-12-16", "pause:2026-12-22", "pause:2026-12-23", "pause:2026-12-26"]);
  // The decision already taken (bouldering moved to Thursday 10 December) meets B's badminton, not A's free Thursday.
  assert.deepEqual(c.plans.b.conflicts, [{ week: "2026-12-07", day: 3, sport: "badminton", kind: "decision", occurrence: "2026-12-07/1", moved: "bouldering" }]);
  assert.deepEqual(c.milestones.map((m) => [m.id, m.active, m.a, m.b, m.moved.a, m.moved.b]), [["m100", "2026-12-14", "2026-12-07", "2026-12-14", true, false]]);
  // The past is described, not projected: three closed weeks of sessions read from the journal.
  assert.equal(c.observed.sports.cycling.sessions, 3);
  assert.equal(c.observed.sports.cycling.minutes, 570);
  assert.equal(c.hypotheses.length, S.HYPOTHESES.length);
  assert.ok(c.hypotheses.some((h) => /Aucune estimation de forme/.test(h)));
  // No other number: nothing about fitness, load, fatigue or performance is in the comparison.
  assert.doesNotMatch(JSON.stringify({ plans: c.plans, rows: c.rows, milestones: c.milestones }), /fatigue|forme|charge|vo2|tss|score/i);
});

test("a slot without duration is counted apart, and the delta says it must be completed", () => {
  const c = run("8 —").compare[0];
  // Thursday badminton (1 h) of the typical week four times, plus a Sunday badminton without duration.
  assert.deepEqual(c.plans.b.sports.badminton, { minutes: 240, sessions: 5, unknown: 1 });
  assert.equal(c.rows.find((r) => r.sport === "badminton").delta, null);
  assert.deepEqual(c.fields, [{ variant: "b", kind: "minutes", count: 1 }, { variant: null, kind: "availability", count: 0 }]);
  const words = S.describeComparison(c, { label, dayLong });
  assert.equal(words.sports.find((r) => r.sport === "badminton").delta, "à compléter");
  assert.match(words.fields[0], /1 créneau sans durée, son temps n’est pas compté/);
});

test("editing a draft does not change the active programme: blocks, weeks, revisions and every calendar stay as they are", () => {
  const none = run("0 —"), drafts = run("1 —"), more = run("2 —");
  assert.equal(drafts.active, none.active);
  assert.equal(more.active, none.active);
  assert.deepEqual(drafts.calendar, none.calendar);
  assert.deepEqual(more.calendar, none.calendar);
  assert.deepEqual(more.weeks, none.weeks);
  // week-plan.js never reads a draft.
  const sc = more.schedule.scenarios[ID];
  assert.equal(sc.variants.a.name, "Deux longues + badminton dimanche");
  assert.equal(sc.milestones["sm-col"].kind, "declared");
  assert.deepEqual(sc.variants.a.weeks, sc.variants.b.weeks);
  assert.deepEqual(W.reference(more.schedule, "2026-11-30", { current: "2026-11-23" }).days.map((d) => d && d.sport), [null, "bouldering", null, "badminton", null, "cycling", null]);
});

test("apply then undo restores the previous plan; the sessions already done are kept", () => {
  const none = run("4 bis"), applied = run("3 —"), undone = run("4 —");
  // Before / after: the four weeks of the period change, nothing else.
  assert.deepEqual(Object.keys(applied.calendar).filter((k) => JSON.stringify(applied.calendar[k]) !== JSON.stringify(none.calendar[k])), PERIOD);
  assert.deepEqual(applied.calendar["2026-11-30"], [null, "bouldering:90", "cycling:60", "badminton:60", null, "cycling:210", null]);
  assert.deepEqual(applied.calendar["2026-12-21"], [null, null, null, null, null, null, null]);
  // After the undo: every calendar, every occurrence, decision, state and tie of the weeks read is the one of the plan before.
  assert.deepEqual(undone.calendar, none.calendar);
  assert.deepEqual(lived(undone), lived(none));
  // The journal is untouched: same sessions, same ids, same values.
  assert.deepEqual(undone.journal, none.journal);
  assert.deepEqual(applied.journal, none.journal);
  // The undo is recorded, the decision can be read again.
  assert.deepEqual(undone.schedule.scenarios[ID].applied.undone, { at: "2026-11-26T20:00:00.000Z", from: "2026-11-30" });
});

test("an undo after a week was lived: the week begun keeps the scenario and its ties, the weeks after come back", () => {
  const none = run("0 —"), res = run("5 —"), kept = run("6 —");
  assert.deepEqual(res.calendar["2026-11-30"], kept.calendar["2026-11-30"]);
  for (const w of PERIOD.slice(1)) assert.deepEqual(res.calendar[w], none.calendar[w]);
  const w = res.weeks.find((x) => x.week === "2026-11-30");
  assert.deepEqual(w.occurrences.map((o) => [o.id, o.status, o.link?.session || null]), [["2026-11-30/1", "done", "bloc-5"], ["2026-11-30/2", "done", "velo-5a"], ["2026-11-30/3", "done", "bad-5"], ["2026-11-30/5", "done", "velo-5b"]]);
  assert.deepEqual(res.journal.length, FIXTURE.logs.length);
  const pv = res.previews.find((p) => p.op === "sc-undo").preview;
  assert.equal(pv.from, "2026-12-07");
  assert.deepEqual(pv.lived, ["2026-11-30"]);
});

test("the explicit date: from Monday 7 December, the week of 30 November does not move and the milestone moves", () => {
  const none = run("0 —"), res = run("7 —");
  assert.deepEqual(res.calendar["2026-11-30"], none.calendar["2026-11-30"]);
  assert.deepEqual(res.calendar["2026-12-07"], [null, "bouldering:90", "cycling:150", null, null, "cycling:210", null]);
  const pv = res.previews[0].preview;
  assert.equal(pv.kept, 1);
  assert.deepEqual(pv.milestones.moved, [{ id: "m100", title: "Sortie de 100 km", before: "2026-12-14", after: "2026-12-07" }]);
  const block = res.blocks.find((b) => b.id === "cyclo-100");
  assert.equal(block.milestones.find((m) => m.id === "m100").week, "2026-12-07");
  // The occurrences touched are listed one by one, from the chosen Monday only.
  assert.ok(pv.occurrences.every((o) => o.week >= "2026-12-07"));
  assert.equal(pv.occurrences.length, 9);
});

test("the preview is the very result: nothing is written before the athlete confirms", () => {
  const st = run("1 —");
  const schedule = deepFreeze(JSON.parse(JSON.stringify(st.schedule)));
  const before = JSON.stringify(schedule);
  const r = S.apply(schedule, st.journal, ID, { variant: "b", from: "2026-11-30" }, { today: "2026-11-24", at: "2026-11-24T18:00:00.000Z", zone: FIXTURE.zone });
  assert.equal(JSON.stringify(schedule), before);
  assert.notEqual(JSON.stringify(r.schedule), before);
  assert.equal(r.preview.occurrences.length, 9);
});

test("on the typical week, applying creates a block from the chosen Monday and undoing removes it: same calendars as before", () => {
  const res = run("8 —"), none = run("8 bis");
  assert.deepEqual(res.calendar, none.calendar);
  assert.deepEqual(lived(res), lived(none));
  const apply = res.previews.find((p) => p.op === "sc-apply").preview;
  assert.equal(apply.created, true);
  assert.equal(apply.block, "type-4-1");
  assert.equal(res.blocks.find((b) => b.id === "type-4-1").state, "removed");
});

test("refusals change nothing", () => {
  const res = run("9 —");
  assert.equal(res.refusals.length, 5);
  for (const r of res.refusals) { assert.equal(r.got, r.expect); assert.equal(r.unchanged, true); }
});

test("the next bilan reads the decision again: the block change and what the week held", () => {
  const res = run("6 —");
  const ctx = res.context[0];
  const change = ctx.changes.find((x) => x.kind === "scenario");
  assert.match(B.describeChange(change, { label, dayLong }).effect, /« Une longue et une courte » du scénario « Vélo ou badminton » choisi ; cette semaine passe de « Semaine 5 » à « Semaine 5 · scénario B »/);
  const f = res.followUp[0];
  assert.deepEqual(f.planned, { bouldering: { sessions: 1, minutes: 90, unknown: 0 }, cycling: { sessions: 2, minutes: 270, unknown: 0 }, badminton: { sessions: 1, minutes: 60, unknown: 0 } });
  assert.deepEqual(Object.fromEntries(Object.entries(f.done).map(([k, v]) => [k, v.minutes])), { bouldering: 90, cycling: 280, badminton: 55 });
  assert.equal(f.summary.done, 4);
});

test("two devices show the same decisions, in either order of merging", () => {
  for (const name of ["10 —", "11 —"]) {
    const res = run(name);
    assert.deepEqual(res.otherCalendar, res.calendar);
    assert.deepEqual(res.otherWeeks, res.weeks);
    assert.deepEqual(res.otherCompare.map(S.snapshot), res.compare.map(S.snapshot));
  }
  const site = run("10 —");
  assert.equal(site.schedule.scenarios[ID].applied.variant, "b");
  assert.deepEqual(site.schedule.scenarios[ID].variants.a.weeks[0].days[0], { sport: "running", minutes: 40, note: "" });
  const phone = run("11 —");
  assert.ok(phone.schedule.scenarios[ID].applied.undone);
  assert.deepEqual(phone.calendar, run("0 —").calendar);
  assert.equal(phone.compare[0].availability[1].days[4], false);
});

test("the measure: decisions applied and undone, conflicts avoided by the choice", () => {
  assert.deepEqual(run("3 —").measure, { scenarios: 1, compared: 1, applied: 1, undone: 0, decisions: 1, conflictsAvoided: 3 });
  assert.deepEqual(run("4 —").measure, { scenarios: 1, compared: 1, applied: 0, undone: 1, decisions: 1, conflictsAvoided: 0 });
});

test("the storage stays small: four scenarios of eight weeks with decisions fit well under the preference budget", () => {
  let st = run("3 —").schedule;
  for (let i = 0; i < 3; i++) st = S.create(st, { id: `x${i}`, title: `Essai ${i}`, start: "2026-11-30", count: 4 }, { today: "2026-11-24", at: `2026-11-24T19:0${i}:00.000Z` }).schedule;
  assert.ok(JSON.stringify(st.scenarios).length < 40000, `${JSON.stringify(st.scenarios).length}`);
});
