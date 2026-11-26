// V1.7.4 — Objectifs et blocs d’entraînement: a goal tied to several weeks of practice, with milestones the athlete chooses and a
// programme that can change (one week, a shift, a copy) after a preview, on the V1.7.2 planning. Shared test set:
// tests/fixtures/training-block-v174.json (also replayed by mobile/__tests__/trainingBlock.test.tsx through the same replay.cjs).
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
const R = require("../js/core/week-review.js");
const B = require("../js/core/training-block.js");
const { replay, project } = require("../tools/training-block/replay.cjs");

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FIXTURE = read("./fixtures/training-block-v174.json");
const EXPECTED = read("./fixtures/training-block-v174.expected.json");
const label = (s) => globalThis.TitanSports.label(s);
const dayLong = (k) => k;
const byName = (prefix) => FIXTURE.cases.find((c) => c.name.startsWith(prefix));
const run = (prefix) => replay(W, B, FIXTURE, byName(prefix));
const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
const weekOf = (res, w) => res.weeks.find((x) => x.week === w);
const blockOf = (res, id = "gravel-90") => res.blocks.find((b) => b.id === id);
const opsOf = (prefix) => byName(prefix).ops;
const GRAVEL = opsOf("1 —")[0].input;

test("the shared test set and its expected output use the same rules version", () => {
  assert.equal(EXPECTED.version, B.VERSION);
  assert.equal(Object.keys(EXPECTED.cases).length, FIXTURE.cases.length);
});

for (const c of FIXTURE.cases) {
  test(`case — ${c.name}`, () => {
    assert.deepEqual(project(W, B, replay(W, B, FIXTURE, c), label, dayLong), EXPECTED.cases[c.name]);
  });
}

test("the model « sortie longue »: six weeks on two sports, a long ride that grows, a lighter fourth week, the bouldering kept", () => {
  const weeks = GRAVEL.weeks;
  assert.equal(weeks.length, 6);
  const long = weeks.map((w) => w.days[5].minutes);
  assert.deepEqual(long, [180, 205, 230, 175, 275, 300]);
  assert.equal(weeks[3].light, true);
  for (const w of weeks) {
    assert.equal(w.days[1].sport, "bouldering", "one bouldering session every week");
    assert.equal(w.days[2].sport, "gravel");
    assert.equal(w.days[5].sport, "gravel");
  }
  const s = B.suggest("endurance", { weeks: 6, sport: "gravel", goal: GRAVEL.goal, type: FIXTURE.type.revisions["2026-10-26"].days });
  assert.deepEqual(s.filter((m) => m.metric === "distance").map((m) => [m.week, m.target]), [[2, 54], [4, 72]]);
  assert.ok(s.some((m) => m.sport === "bouldering" && m.metric === "sessions" && m.target === 6));
  assert.ok(s.some((m) => m.kind === "declared"));
});

test("each week of the block is a week of the existing planning: the QG, Prévoir and the bilan read the block's days", () => {
  const res = run("3 —");
  const v = W.week(res.schedule, res.journal, { week: "2026-11-30", today: "2026-11-24", zone: FIXTURE.zone, pauses: res.pauses });
  assert.equal(v.reference.source, "block");
  assert.deepEqual(v.reference.block && { id: v.reference.block.id, index: v.reference.block.index }, { id: "gravel-90", index: 4 });
  // The report week repeats week 4, the lighter one: its long ride is 175 minutes.
  assert.equal(v.occurrences.find((o) => o.index === 5).planned.minutes, 175);
  // The athlete's exception (Wednesday 2 December, away) is still applied to the new week.
  assert.equal(v.occurrences.find((o) => o.index === 2).status, "skipped");
});

test("history is not rewritten: the shift, the pause and the milestone change leave the closed weeks and the week in progress as they were", () => {
  const withShift = run("3 —"), without = run("3 bis");
  for (const w of ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]) assert.deepEqual(weekOf(withShift, w), weekOf(without, w), w);
  const later = run("5 —"), changed = run("4 —");
  for (const w of ["2026-11-02", "2026-11-09", "2026-11-16"]) {
    const a = weekOf(changed, w), b = weekOf(later, w);
    assert.deepEqual({ ...a, current: null }, { ...b, current: null }, w);
  }
  // The milestone of a closed week stays where it was and keeps its session; the deadline of the goal does not move.
  const j1 = blockOf(later).milestones.find((m) => m.id === "j1");
  assert.deepEqual({ id: j1.id, week: j1.week, state: j1.state, session: j1.session, how: j1.how, day: j1.day }, { id: "j1", week: "2026-11-16", state: "reached", session: "grav-3b", how: "session", day: "2026-11-21" });
  assert.equal(blockOf(later).goal.date, "2026-12-12");
});

test("the shift: one report week, the weeks and the second milestone move one week later, the pause stays on its week", () => {
  const res = run("3 —");
  const b = blockOf(res);
  assert.deepEqual(b.weeks.map((w) => w.label), ["Semaine 1", "Semaine 2", "Semaine 3", "Semaine 4 · allégée", "Report · reprend la semaine 4", "Semaine 5", "Semaine 6"]);
  assert.equal(b.end, "2026-12-20");
  assert.deepEqual(b.weeks.filter((w) => w.paused).map((w) => w.week), ["2026-11-23"]);
  const pv = res.previews.find((x) => x.op === "shift").preview;
  assert.equal(pv.from, "2026-11-30");
  assert.deepEqual(pv.milestones, [{ id: "j2", title: "Sortie de 72 km", before: "2026-11-30", after: "2026-12-07" }]);
  assert.equal(pv.goal.endsAfter, true);
  assert.deepEqual(pv.pauses, ["2026-11-23"]);
  assert.deepEqual(pv.exceptions.map((e) => [e.occurrence, e.state]), [["2026-11-30/2", "kept"]]);
  const words = B.describePreview(pv, { label, dayLong });
  assert.ok(words.lines.includes("Semaine du 2026-11-30 : Semaine 5 → Report · reprend la semaine 4"));
  assert.ok(words.notes.some((n) => n.includes("La dernière semaine du bloc commence après cette échéance")));
});

test("the source and the effect of a change reach the weekly bilan", () => {
  const res = run("3 —");
  const ctx = res.context.find((c) => c.week === "2026-12-07");
  const shift = ctx.changes.find((c) => c.kind === "shift");
  assert.deepEqual(B.describeChange(shift, { label, dayLong }), { source: "Bloc décalé le 2026-11-24", effect: "Cette semaine passe de « Semaine 6 » à « Semaine 5 » ; le jalon « Sortie de 72 km » passe de la semaine du 2026-11-30 à celle du 2026-12-07." });
  assert.equal(shift.origin, "block:gravel-90");
});

test("no milestone and no goal is reached without an event: a real session that meets the measure, or a declaration", () => {
  const first = run("1 —");
  assert.ok(blockOf(first).milestones.every((m) => m.state === "pending" && !m.session));
  assert.equal(blockOf(first).goal.state, "pending");
  const end = run("5 —");
  const goal = blockOf(end).goal;
  assert.equal(goal.state, "reached");
  assert.equal(goal.session, "grav-6b");
  assert.equal(end.journal.find((l) => l.id === goal.session).val, 91.4);
  // The declared action is reached only once declared, with the time of the declaration.
  const declared = run("12 —");
  const j3 = blockOf(declared).milestones.find((m) => m.title === "Réviser le vélo");
  assert.equal(j3.state, "reached");
  assert.equal(j3.how, "declared");
  assert.equal(j3.day, "2026-12-10");
  const before = replay(W, B, FIXTURE, { ...byName("12 —"), ops: byName("12 —").ops.slice(0, -1) });
  assert.equal(blockOf(before).milestones.find((m) => m.title === "Réviser le vélo").state, "pending");
});

test("a block created over past sessions applies only from the next week; removed, it leaves the weeks and the journal as they were", () => {
  const created = run("7 —"), removed = run("8 —"), none = run("8 bis");
  for (const w of ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]) {
    assert.deepEqual(weekOf(created, w), weekOf(none, w), `created — ${w}`);
    assert.deepEqual(weekOf(removed, w), weekOf(none, w), `removed — ${w}`);
  }
  assert.deepEqual(weekOf(removed, "2026-11-23"), weekOf(none, "2026-11-23"));
  assert.equal(weekOf(created, "2026-11-23").reference.source, "block");
  const v = blockOf(created, "routine-bloc");
  assert.deepEqual(v.weeks.map((w) => [w.applied, w.before]), [[false, true], [false, true], [false, true], [true, false]]);
  // The milestone met by a past session says so; the goal (8 bouldering sessions) is not reached by creating or removing the block.
  const r1 = blockOf(created, "routine-bloc").milestones.find((m) => m.id === "r1");
  assert.equal(r1.session, "bloc-2");
  assert.equal(blockOf(created, "routine-bloc").goal.state, "pending");
  assert.equal(blockOf(removed, "routine-bloc").goal.state, "pending");
  assert.equal(blockOf(removed, "routine-bloc").state, "removed");
  const words = B.describePreview(removed.previews.find((x) => x.op === "remove").preview, { label, dayLong });
  assert.ok(words.notes.some((n) => n.startsWith("Tes séances restent au journal et rien n’est marqué comme atteint")));
});

test("the journal is never changed: every case runs on frozen sessions and gives them back identical", () => {
  const logs = deepFreeze(JSON.parse(JSON.stringify(FIXTURE.logs)));
  const before = JSON.stringify(logs);
  for (const c of FIXTURE.cases) replay(W, B, { ...FIXTURE, logs }, c);
  assert.equal(JSON.stringify(logs), before);
});

test("a preview writes nothing, and a refusal changes nothing", () => {
  const res = run("2 —");
  const schedule = deepFreeze(JSON.parse(JSON.stringify(res.schedule)));
  const before = JSON.stringify(schedule);
  const o = { today: "2026-11-22", at: "2026-11-22T21:00:00.000Z", zone: FIXTURE.zone, pauses: [], logs: res.journal };
  B.shift(schedule, "gravel-90", { from: 3, weeks: 2 }, o);
  B.editWeek(schedule, "gravel-90", { index: 4, days: GRAVEL.weeks[0].days }, o);
  B.duplicateWeek(schedule, "gravel-90", { from: 0, to: 5 }, o);
  B.remove(schedule, "gravel-90", o);
  B.duplicate(schedule, "gravel-90", { start: "2027-03-01" }, o);
  assert.throws(() => B.shift(schedule, "gravel-90", { from: 2, weeks: 1 }, o), /TRAINING_BLOCK_WEEK_STARTED/);
  assert.equal(JSON.stringify(schedule), before);
  for (const r of Object.values(EXPECTED.cases).flatMap((c) => c.refusals)) {
    assert.equal(r.got, r.expect);
    assert.equal(r.unchanged, true);
  }
});

test("two devices: the shift made on the website and the phone's decision and milestone change are all kept, in both merge orders", () => {
  const res = run("6 —");
  assert.equal(EXPECTED.cases[byName("6 —").name].sameOnBothDevices, true);
  const a = W.merge(res.schedule, res.other.schedule), b = W.merge(res.other.schedule, res.schedule);
  const opts = { today: "2026-11-24", zone: FIXTURE.zone, pauses: res.pauses };
  assert.equal(B.view(a, res.journal, "gravel-90", opts).signature, B.view(b, res.journal, "gravel-90", opts).signature);
  const v = B.view(res.schedule, res.journal, "gravel-90", opts);
  assert.equal(v.weeks[4].label, "Report · reprend la semaine 4");
  assert.equal(res.schedule.blocks["gravel-90"].milestones.j2.target, 75);
  const now = W.week(res.schedule, res.journal, { week: "2026-11-23", today: "2026-11-24", zone: FIXTURE.zone, pauses: res.pauses });
  assert.equal(now.occurrences.find((o) => o.index === 1).status, "skipped");
  assert.equal(v.conflict, false);
});

test("two devices that both change the programme of the block from the same version: the result is the same on both, and flagged", () => {
  const res = run("2 —");
  const o = (at) => ({ today: "2026-11-22", at, zone: FIXTURE.zone, pauses: [] });
  const web = B.shift(res.schedule, "gravel-90", { from: 4, weeks: 1 }, o("2026-11-22T20:00:00.000Z")).schedule;
  const phone = B.editWeek(res.schedule, "gravel-90", { index: 5, days: GRAVEL.weeks[0].days }, o("2026-11-22T20:05:00.000Z")).schedule;
  const x = W.merge(web, phone), y = W.merge(phone, web);
  const opts = { today: "2026-11-22", zone: FIXTURE.zone, pauses: [] };
  assert.equal(B.view(x, [], "gravel-90", opts).signature, B.view(y, [], "gravel-90", opts).signature);
  assert.equal(B.view(x, [], "gravel-90", opts).conflict, true);
});

test("the change of a milestone: a future one changes, a reached one or one of a closed week does not", () => {
  const res = run("4 —");
  const pv = res.previews.find((x) => x.op === "milestone").preview;
  assert.equal(pv.detail.before.target, 72);
  assert.equal(pv.detail.after.target, 75);
  assert.deepEqual(res.refusals.map((r) => r.got), ["TRAINING_BLOCK_MILESTONE_CLOSED", "TRAINING_BLOCK_WEEK_STARTED", "TRAINING_BLOCK_WEEK_STARTED"]);
  const w = B.describePreview(pv, { label, dayLong });
  assert.deepEqual(w.lines, ["Jalon « Sortie de 75 km » : Une séance Gravel d’au moins 72 km → Une séance Gravel d’au moins 75 km"]);
});

test("duplication: a week copied onto another, and the block duplicated with its milestones not reached and its deadline moved", () => {
  const res = run("9 —");
  const src = blockOf(res), copy = blockOf(res, "gravel-90-janvier");
  assert.equal(src.weeks[3].label, "Semaine 4 (copie de la semaine 2)");
  assert.deepEqual(res.schedule.blocks["gravel-90"].layouts["2026-11-23"].weeks[3].days, GRAVEL.weeks[1].days);
  assert.equal(copy.start, "2027-01-04");
  assert.equal(copy.goal.date, "2027-02-13");
  assert.equal(copy.milestones.length, 2);
  assert.ok(copy.milestones.every((m) => m.state === "pending"));
  assert.equal(copy.copyOf, "gravel-90");
});

test("the measure: blocks activated, milestones tied to a session, blocks kept after an interruption", () => {
  assert.deepEqual(run("5 —").measure, { blocks: 1, activated: 1, milestones: 2, linked: 2, declared: 0, interrupted: 1, kept: 1 });
  assert.deepEqual(run("8 —").measure.kept, 0);
});

test("the schedule stays small: six weeks, a shift, a milestone change and 26 weeks of decisions stay under 40 KB", () => {
  const res = run("5 —");
  let s = res.schedule;
  for (let i = 0; i < 26; i++) {
    const week = W.addDays("2026-06-01", 7 * i);
    s = W.decide(s, `${week}/1`, { kind: "skip" }, { today: "2026-12-13", at: `2026-12-13T10:${String(i).padStart(2, "0")}:00.000Z` });
  }
  assert.ok(JSON.stringify(s).length < 40000, `${JSON.stringify(s).length} bytes`);
});

test("V1.7.2 and V1.7.3 keep working on a block week: a decision keeps the block reference, the bilan reads the block's weeks", () => {
  const res = run("2 —");
  const s = W.decide(res.schedule, "2026-11-23/2", { kind: "move", day: "2026-11-26" }, { today: "2026-11-23", at: "2026-11-23T07:00:00.000Z" });
  const v = W.week(s, res.journal, { week: "2026-11-23", today: "2026-11-23", zone: FIXTURE.zone });
  assert.equal(v.reference.source, "week");
  assert.equal(v.reference.block.id, "gravel-90");
  assert.equal(v.occurrences.find((o) => o.index === 2).effective.day, "2026-11-26");
  const r = R.review(res.schedule, res.journal, { week: "2026-11-16", today: "2026-11-22", zone: FIXTURE.zone, pauses: [] });
  assert.equal(r.observation.followed, 4);
  assert.ok(r.observation.sources.includes("grav-3b"));
  // A typical-week edit during a block applies to the weeks after the block: the block keeps its weeks.
  const e = W.editType(res.schedule, "tuesday", { sport: "running", minutes: 40 }, { today: "2026-11-22", at: "2026-11-22T21:00:00.000Z" });
  assert.equal(W.reference(e.schedule, "2026-11-30", { current: "2026-11-16" }).days[1].sport, "bouldering");
  assert.equal(W.reference(e.schedule, "2026-12-14", { current: "2026-11-16" }).days[1].sport, "running");
});
