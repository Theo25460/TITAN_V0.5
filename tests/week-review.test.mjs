// V1.7.3 — Bilan et ajustements: the weekly bilan ends on an adjustment the athlete chooses, previews and can undo, drawn from a
// verifiable observation of the V1.7.2 weeks. Shared test set: tests/fixtures/week-review-v173.json (also read by
// mobile/__tests__/weekReview.test.tsx).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { replay, project } from "../tools/week-review/replay.mjs";
const require = createRequire(import.meta.url);
require("../js/core/format.js");
require("../js/training-store.js");
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
globalThis.TitanSports.ensure();
const W = require("../js/core/week-plan.js");
const R = require("../js/core/week-review.js");

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FIXTURE = read("./fixtures/week-review-v173.json");
const EXPECTED = read("./fixtures/week-review-v173.expected.json");
const label = (s) => globalThis.TitanSports.label(s);
const dayLong = (k) => k;
const byName = (prefix) => FIXTURE.cases.find((c) => c.name.startsWith(prefix));
const run = (prefix) => replay(W, R, FIXTURE, byName(prefix));
const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
const R1 = "2026-11-16", R2 = "2026-11-23", D1 = "2026-11-22", D2 = "2026-11-29";
const opts = (res, extra = {}) => ({ week: R1, today: D1, zone: FIXTURE.zone, pauses: res.pauses, at: "2026-11-22T18:00:00.000Z", ...extra });

test("the shared test set and its expected output use the same rules version", () => {
  assert.equal(EXPECTED.version, R.VERSION);
  assert.equal(Object.keys(EXPECTED.cases).length, FIXTURE.cases.length);
});

for (const c of FIXTURE.cases) {
  test(`case — ${c.name}`, () => {
    assert.deepEqual(project(W, R, replay(W, R, FIXTURE, c), label, dayLong), EXPECTED.cases[c.name]);
  });
}

test("the observation of the cahier des charges: the Tuesday slot moved twice, the bouldering regular, with the sessions it rests on", () => {
  const { view } = run("1 —");
  const o = view.observation;
  assert.equal(o.kind, "moved");
  assert.equal(o.followed, 4);
  assert.deepEqual(o.slot.days, [{ day: 2, n: 2 }]);
  assert.deepEqual(o.sources, ["run-w2", "run-w4"]);
  assert.deepEqual(o.suggestion, { kind: "move", from: 1, to: 2, scope: "next" });
  const bloc = o.slots.find((s) => s.sport === "bouldering");
  assert.equal(bloc.asPlanned, 4);
  assert.equal(bloc.weeks, 4);
  const words = R.describeObservation(o, { label });
  assert.match(words.title, /mardi \(Course à pied\) a été déplacé 2 fois sur 4 semaines suivies/);
  assert.ok(words.lines.includes("Escalade bloc du jeudi : 4/4 comme prévu."));
  // The actions of the bilan: keep, move one slot to a free day, pause the next week.
  assert.equal(view.actions.keep, true);
  assert.equal(view.actions.pause, true);
  assert.deepEqual(view.actions.move, { from: [1, 3, 5], to: [0, 2, 4, 6] });
});

test("sports with different units: the observation counts sessions, each source keeps its own measures", () => {
  const { view, journal } = run("1 —");
  const words = R.describeObservation(view.observation, { label });
  for (const line of [words.title, words.text, ...words.lines]) assert.doesNotMatch(line, /\bkm\b|\bkg\b|cotation|6A|6B/);
  const by = (id) => journal.find((l) => l.id === id);
  assert.equal(R.measureOf(by("run-w4")), "50 min · 9,2 km");
  assert.equal(R.measureOf(by("bloc-w4")), "1 h 30 · 6B (Fontainebleau bloc)");
  assert.equal(R.measureOf(by("lift-w4")), "1 h · 1 exercice, 5 séries");
});

test("a refused or ignored suggestion writes nothing: reading, previewing and closing leave the schedule, pauses and journal as they were", () => {
  const res = run("8 —");
  assert.equal(res.unchanged, true);
  const schedule = deepFreeze(JSON.parse(JSON.stringify(res.schedule)));
  const journal = deepFreeze(JSON.parse(JSON.stringify(res.journal)));
  const pauses = deepFreeze([]);
  const o = { week: R1, today: D1, zone: FIXTURE.zone, pauses };
  R.review(schedule, journal, o);
  for (const a of [{ kind: "move", from: 1, to: 2, scope: "next" }, { kind: "move", from: 1, to: 2, scope: "type" }, { kind: "pause" }, { kind: "keep" }]) R.preview(schedule, journal, o, a);
  assert.equal(schedule.reviews, undefined);
  assert.deepEqual(EXPECTED.cases[byName("8 —").name].program.adjustments, []);
  assert.equal(EXPECTED.cases[byName("8 —").name].measure.confirmed, 0);
});

test("confirmed for the next week only: the programme of that week shows it with its origin, the typical week is unchanged", () => {
  const res = run("4 —");
  const o = res.program.occurrences.find((x) => x.id === "2026-11-23/1");
  assert.equal(o.effective.day, "2026-11-25");
  assert.equal(o.decision.kind, "move");
  assert.equal(o.decision.origin, `review:${R1}`);
  assert.deepEqual(W.typeDays(res.schedule).map((d) => d?.sport ?? null), [null, "running", null, "bouldering", null, "muscu_gym", null]);
  assert.equal(R.adjustments(res.schedule, { week: R2, today: D1 }).length, 1);
  // One choice per bilan: a second one is refused until the first is undone.
  assert.throws(() => R.apply(res.schedule, res.journal, opts(res), { kind: "keep" }), /ALREADY_DECIDED/);
});

test("confirmed in the typical week: the change applies from the Monday after, and the next weeks inherit it", () => {
  const res = run("6 —");
  assert.equal(res.schedule.reviews[R1].applied.from, R2);
  assert.equal(res.schedule.revisions[R2].origin, `review:${R1}`);
  const later = W.week(res.schedule, [], { week: "2026-12-07", today: D2, zone: FIXTURE.zone });
  assert.deepEqual(later.occurrences.map((o) => o.id), ["2026-12-07/2", "2026-12-07/3", "2026-12-07/5"]);
});

test("two consecutive weeks: the second bilan tells the change decided apart from what was observed after it applied", () => {
  const res = run("5 —");
  const f = res.view.followUp;
  assert.equal(f.week, R1);
  assert.equal(f.target, R2);
  assert.equal(f.state, "done");
  assert.equal(f.session, "run-w5");
  const words = R.describeFollowUp(f, { label, dayLong });
  assert.equal(words.decided, "Décidé au bilan de la semaine du 2026-11-16 : déplacer Course à pied du mardi au mercredi la semaine suivante.");
  assert.equal(words.observed, "Observé après : Course à pied faite le mercredi, comme décidé.");
  // The adjusted week is not one more move in the observation: it counts as done on the day chosen.
  const run2 = res.view.observation.slots.find((s) => s.index === 1);
  assert.equal(run2.adjusted, 1);
  assert.equal(run2.moved, 2);
  // After a tested move that held, the suggestion is to make it the typical week.
  assert.deepEqual(res.view.observation.suggestion, { kind: "move", from: 1, to: 2, scope: "type" });
  assert.equal(R.measure(res.schedule, res.journal, { today: D2, zone: FIXTURE.zone, pauses: [] }).found, 1);
  // The second bilan opens its own choice for the week of 30 November.
  assert.equal(res.view.actions.open, true);
  assert.equal(res.view.actions.target, "2026-11-30");
  // When the session was done on the old day instead, it is said, and nothing is tied for the athlete.
  const b = run("5b");
  assert.equal(b.view.followUp.state, "missed");
  assert.match(R.describeFollowUp(b.view.followUp, { label, dayLong }).observed, /n’a pas été faite ; une séance Course à pied hors programme a eu lieu le mardi/);
});

test("history too short: no suggestion of change, the bilan offers to enrich the history or keep the plan", () => {
  for (const p of ["7 —", "7b"]) {
    const { view } = run(p);
    assert.equal(view.observation.kind, "short");
    assert.deepEqual(view.observation.suggestion, { kind: "keep" });
    assert.match(R.describeObservation(view.observation).text, /enrichir ton historique ou garder ton plan/);
  }
  // Weeks before the typical week was followed are reconstructed: never counted as observed.
  assert.equal(run("7 —").view.observation.followed, 1);
});

test("undo of a move for the next week: the occurrence is back on Tuesday, the bilan says the choice was undone", () => {
  const res = run("9 —");
  const o = res.program.occurrences.find((x) => x.id === "2026-11-23/1");
  assert.equal(o.effective.day, "2026-11-24");
  assert.equal(o.decision, null);
  assert.equal(res.view.followUp.undone, true);
  assert.equal(R.adjustments(res.schedule, { week: R2, today: D2 }).length, 0);
  // A decision taken by hand on that occurrence before the bilan is put back, not erased.
  const base = run("1 —");
  let s = W.decide(base.schedule, "2026-11-23/1", { kind: "replace", sport: "swimming", day: "2026-11-24" }, { today: D1, at: "2026-11-22T10:00:00.000Z" });
  const a = R.apply(s, base.journal, opts(base), { kind: "move", from: 1, to: 2, scope: "next" });
  const u = R.undo(a.schedule, a.pauses, { week: R1, today: D1, at: "2026-11-22T19:00:00.000Z" });
  assert.equal(u.schedule.weeks[R2].occ["2026-11-23/1"].kind, "replace");
  // A later change made by hand is left as it is, and said.
  const a2 = R.apply(base.schedule, base.journal, opts(base), { kind: "move", from: 1, to: 2, scope: "next" });
  const hand = W.decide(a2.schedule, "2026-11-23/1", { kind: "skip" }, { today: D1, at: "2026-11-22T18:30:00.000Z" });
  const u2 = R.undo(hand, a2.pauses, { week: R1, today: D1, at: "2026-11-22T19:00:00.000Z" });
  assert.equal(u2.schedule.weeks[R2].occ["2026-11-23/1"].kind, "skip");
  assert.deepEqual(u2.kept, ["occurrence"]);
});

test("undo of a typical-week change: the seven days and the programme of the next week are exactly the start", () => {
  const res = run("9b");
  const start = FIXTURE.type;
  for (const k of W.DAY_KEYS) assert.deepEqual(res.schedule[k] && res.schedule[k].sport ? res.schedule[k].sport : null, start[k]?.sport ?? null, k);
  assert.deepEqual(W.reference(res.schedule, R2, { current: R1 }).days, W.reference(start, R2, { current: R1 }).days);
  // Undone, the bilan can take another choice.
  const again = R.apply(res.schedule, res.journal, opts(res), { kind: "keep" });
  assert.equal(again.review.action.kind, "keep");
});

test("pause of the next week, and its undo: the cadence pause of that week only, the programme stays shown", () => {
  const p = run("10 —");
  assert.deepEqual(p.pauses, [R2]);
  assert.equal(p.program.paused, true);
  assert.equal(p.view.followUp.state, "paused");
  const u = run("10b");
  assert.deepEqual(u.pauses, []);
  // A week already paused cannot be paused again by the bilan.
  const base = run("1 —");
  assert.equal(R.actions(base.schedule, base.journal, { ...opts(base), pauses: [R2] }).pause, false);
  assert.throws(() => R.apply(base.schedule, base.journal, { ...opts(base), pauses: [R2] }, { kind: "pause" }), /ALREADY_PAUSED/);
});

test("a choice is possible only while the week after the bilan has not ended; an old bilan is read only", () => {
  const res = run("14 —");
  assert.equal(res.view.actions.open, false);
  assert.throws(() => R.apply(res.schedule, res.journal, { ...opts(res), week: "2026-11-02" }, { kind: "keep" }), /CLOSED/);
  const base = run("1 —");
  // A move to a day already gone in the current week is refused.
  const cur = R.actions(base.schedule, base.journal, { ...opts(base), week: "2026-11-09", today: "2026-11-19" });
  assert.ok(cur.move === null || cur.move.to.every((d) => d >= 3));
  assert.throws(() => R.apply(base.schedule, base.journal, opts(base), { kind: "move", from: 1, to: 3, scope: "next" }), /BAD_MOVE/);
});

test("two devices: the choice made on the phone is read on the website, and the most recent change of a week wins in both orders", () => {
  const res = run("13 —");
  assert.equal(res.schedule.reviews[R1].action.kind, "move");
  const base = run("1 —");
  const phone = R.apply(base.schedule, base.journal, opts(base, { at: "2026-11-22T18:00:00.000Z" }), { kind: "move", from: 1, to: 2, scope: "next" });
  const site = R.undo(phone.schedule, phone.pauses, { week: R1, today: D1, at: "2026-11-22T18:10:00.000Z" });
  const ab = W.merge(phone.schedule, site.schedule), ba = W.merge(site.schedule, phone.schedule);
  assert.ok(ab.reviews[R1].undone && ba.reviews[R1].undone);
  assert.deepEqual(ab.reviews, ba.reviews);
  assert.equal(ab.weeks[R2].occ["2026-11-23/1"].kind, "reset");
  assert.equal(ba.weeks[R2].occ["2026-11-23/1"].kind, "reset");
});

test("the journal is never changed, and the inputs of apply and undo are not mutated", () => {
  const base = run("1 —");
  const schedule = deepFreeze(JSON.parse(JSON.stringify(base.schedule)));
  const journal = deepFreeze(JSON.parse(JSON.stringify(base.journal)));
  const before = JSON.stringify(journal);
  for (const a of [{ kind: "move", from: 1, to: 2, scope: "next" }, { kind: "move", from: 1, to: 2, scope: "type" }, { kind: "pause" }, { kind: "keep" }]) {
    const r = R.apply(schedule, journal, { ...opts(base), pauses: deepFreeze([]) }, a);
    R.undo(deepFreeze(r.schedule), deepFreeze(r.pauses), { week: R1, today: D1 });
  }
  assert.equal(JSON.stringify(journal), before);
});

test("the stored bilans stay small and are pruned with the weeks kept (26)", () => {
  const base = run("4 —");
  assert.ok(JSON.stringify(base.schedule.reviews).length < 2000);
  const far = R.apply(base.schedule, base.journal, opts(base, { week: "2027-06-07", today: "2027-06-13" }), { kind: "keep" });
  assert.deepEqual(Object.keys(far.schedule.reviews), ["2027-06-07"]);
});
