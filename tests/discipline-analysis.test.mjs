// V1.7.5 — Analyse avancée par discipline: three depth views on the progression engine, each metric with its rule, its source,
// its coverage and its sessions, side by side with a period, a block or a session, and missing values shown missing.
// Shared test set: tests/fixtures/discipline-analysis-v175.json (also read by mobile/__tests__/disciplineAnalysis.test.tsx).
process.env.TZ = "UTC"; // the views print local dates; the expected output was written in UTC
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
const A = require("../js/core/discipline-analysis.js");
globalThis.TitanSports.ensure();

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FIXTURE = read("./fixtures/discipline-analysis-v175.json");
const EXPECTED = read("./fixtures/discipline-analysis-v175.expected.json");
const H = FIXTURE.history;
const NOW = new Date(FIXTURE.now);
const run = (options, history = H) => A.view(history, { ...options, now: NOW, weeks: FIXTURE.weeks });
const caseOf = (i) => run(FIXTURE.cases[i].options);
const row = (v, id) => v.rows.find((r) => r.id === id);
const clone = (x) => JSON.parse(JSON.stringify(x));

test("the rules version is pinned in the shared test set and in its expected output", () => {
  assert.equal(A.VERSION, FIXTURE.version);
  assert.equal(A.VERSION, EXPECTED.version);
});

FIXTURE.cases.forEach((c, i) => {
  test(`case — ${c.name}: same view and same reading as the shared expected output`, () => {
    const v = run(c.options);
    assert.deepEqual(clone(v), EXPECTED.cases[i].view);
    assert.deepEqual(A.reading(v), EXPECTED.cases[i].reading);
  });
});

test("every metric of every view carries a rule, a source, a coverage and its sessions", () => {
  FIXTURE.cases.forEach((c, i) => {
    const v = caseOf(i);
    assert.ok(v.rows.length >= 3, c.name);
    for (const r of v.rows) {
      assert.ok(r.rule && r.provenance, `${r.id}: rule and source`);
      assert.equal(r.current.total, v.current.sessions.length, `${r.id}: coverage total`);
      assert.ok(r.current.measured <= r.current.total);
      assert.equal(r.current.sessions.length, r.current.measured, `${r.id}: one proof per measured session`);
      for (const id of r.current.sessions) assert.ok(v.current.sessions.includes(id), `${r.id}: proof ${id} is in the side`);
      if (r.current.measured < r.current.total && r.id !== "sessions") assert.match(r.current.missing, / sur \d+ séances?$/, `${r.id}: the missing field is named`);
    }
  });
});

test("endurance — long gravel outings: comparable group, speed and effort held better, partial coverage said", () => {
  const v = caseOf(0);
  assert.equal(v.group.id, "endurance:g-c3");
  assert.deepEqual(v.current.sessions, ["g-c1", "g-c2", "g-c4", "g-c3"]);
  assert.deepEqual(v.reference.sessions, ["g-r1", "g-r2", "g-r3"]);
  // The road outing, the hilly one and the short one are other groups; the archived and the unsent outings are out of every value.
  for (const id of ["g-road", "g-hilly", "g-short", "g-arch", "g-pending"]) assert.ok(!v.current.sessions.includes(id) && !v.reference.sessions.includes(id), id);
  assert.deepEqual(v.states, { archived: 1, unsent: 1 });
  const speed = row(v, "speed");
  assert.equal(speed.current.display, "20,9 km/h");
  assert.equal(speed.reference.display, "19,6 km/h");
  assert.equal(speed.direction, "better");
  assert.deepEqual([speed.current.measured, speed.current.total], [3, 4]);
  assert.equal(speed.current.missing, "durée non saisie sur 1 séance");
  assert.equal(row(v, "hold").direction, "better");
  assert.deepEqual([row(v, "hold").current.measured, row(v, "hold").reference.measured], [2, 2]);
  assert.equal(row(v, "avg_hr").direction, "neutral", "heart rate is context, never judged");
  assert.ok(v.limits.some((l) => l.includes("une estimation n’entre jamais dans une vitesse")));
});

test("endurance — the group is the V1.7.1 rule: the sessions comparables() keeps for the anchor are its timed members", () => {
  const anchor = H.find((l) => l.id === "g-c3");
  const sel = P.comparables(anchor, H);
  assert.equal(sel.rule.id, "distance.taille-parcours");
  const members = [...run(FIXTURE.cases[0].options).current.sessions, ...run(FIXTURE.cases[0].options).reference.sessions];
  const timed = members.filter((id) => H.find((l) => l.id === id).details.duration > 0 && id !== "g-c3");
  assert.deepEqual(sel.retained.map((r) => r.id).sort(), timed.sort());
});

test("missing values are never interpolated: the series keeps a gap for the outing without duration", () => {
  const v = caseOf(0);
  const gap = v.series.find((p) => p.id === "g-c4");
  assert.equal(gap.value, null);
  assert.equal(gap.display, "non mesurée");
  assert.equal(v.series.filter((p) => p.value === null).length, 1);
  // The median rests on the three timed outings only: 74 km in 215 min, 76 in 218, 78 in 222.
  const speeds = [[74, 215], [76, 218], [78, 222]].map(([km, min]) => km / (min / 60)).sort((a, b) => a - b);
  assert.equal(row(v, "speed").current.value, Math.round(speeds[1] * 1e4) / 1e4);
  assert.ok(!row(v, "speed").current.sessions.includes("g-c4"));
});

test("an archived session leaves the calculation: same view as without the session, and it would change it if counted", () => {
  for (const [i, id] of [[0, "g-arch"], [6, "s-arch"], [10, "c-arch"]]) {
    const withArchived = clone(caseOf(i));
    const without = clone(run(FIXTURE.cases[i].options, H.filter((l) => l.id !== id)));
    assert.deepEqual(withArchived.rows, without.rows, id);
    assert.deepEqual(withArchived.series, without.series, id);
    assert.equal(withArchived.states.archived, 1);
    const restored = H.map((l) => (l.id === id ? { ...l, archived_at: null } : l));
    assert.notDeepEqual(clone(run(FIXTURE.cases[i].options, restored)).rows, withArchived.rows, `${id} would weigh if counted`);
  }
  assert.equal(row(caseOf(6), "reference_set").current.display, "102,5 kg × 5", "the archived 110 kg set is not the reference set");
  assert.equal(row(caseOf(10), "best_done").current.display, "6C", "the archived 7A is not the best grade");
});

test("force — two variants are never merged: Squat (Barre), Squat (Front) and a squat without variant are three groups", () => {
  const groups = A.groups(H, "strength");
  const squats = groups.filter((g) => g.id.includes("|squat|"));
  assert.deepEqual(squats.map((g) => g.id).sort(), ["strength:muscu_gym|squat||", "strength:muscu_gym|squat|barre|", "strength:muscu_gym|squat|front|"].sort());
  const barre = caseOf(6);
  assert.deepEqual([...barre.current.sessions, ...barre.reference.sessions].sort(), ["s-c1", "s-c2", "s-c3", "s-r1", "s-r2", "s-r3"]);
  assert.equal(row(barre, "reference_set").reference.display, "95 kg × 5");
  assert.equal(row(barre, "reference_set").direction, "better");
  assert.equal(row(barre, "volume").current.display, "1 808 kg");
  assert.deepEqual([row(barre, "rir").current.measured, row(barre, "rir").current.total], [2, 3]);
  const front = caseOf(7);
  assert.equal(front.reference.status, "incomparable");
  assert.match(front.reference.note, /deux variantes ne sont jamais fusionnées/);
  assert.ok(front.rows.every((r) => r.reference === null && r.direction === "neutral"));
});

test("escalade — two scales are never merged nor converted; levels only in a scale TITAN orders", () => {
  const groups = A.groups(H, "climbing");
  for (const g of groups) {
    const v = run({ discipline: "climbing", group: g.id, reference: null });
    const scales = new Set(v.current.sessions.map((id) => H.find((l) => l.id === id).details.extras.grade_system));
    assert.ok(scales.size <= 1, g.id);
  }
  const fb = caseOf(10);
  assert.equal(row(fb, "best_done").current.display, "6C");
  assert.equal(row(fb, "best_done").reference.display, "6B");
  assert.equal(row(fb, "success_rate").current.display, "61 % (27/44)");
  assert.equal(row(fb, "success_rate").reference.display, "52 % (31/60)");
  assert.deepEqual(fb.levels.current.map((l) => [l.grade, l.done, l.tried]), [["7A", 0, 1], ["6C", 1, 1], ["6B+", 1, 0], ["6B", 1, 0]]);
  assert.equal(caseOf(11).reference.status, "incomparable");
  assert.match(caseOf(11).reference.note, /cotée en V-scale bloc : TITAN ne convertit pas les cotations/);
  const yds = caseOf(12);
  assert.equal(yds.levels, null);
  assert.ok(!row(yds, "best_done"));
  assert.ok(yds.limits.some((l) => l.includes("TITAN ne sait pas ordonner les cotations de l’échelle « YDS »")));
});

test("history too short or optional field absent: the view says its limit and shows only established values, without verdict", () => {
  const run1 = caseOf(5);
  assert.equal(run1.status, "insufficient");
  assert.match(run1.limits[0], /^Historique trop court : 1 séance du groupe dans la période, il en faut 2 pour une tendance/);
  assert.ok(run1.rows.every((r) => r.direction === "neutral"));
  for (const id of ["hold", "regularity", "elevation", "avg_hr"]) {
    assert.equal(row(run1, id).status, "absent", id);
    assert.equal(row(run1, id).current.value, null);
    assert.equal(row(run1, id).current.display, "—");
  }
  assert.equal(row(run1, "pace").current.display, "5:12 /km");
  assert.ok(run1.limits.some((l) => l.startsWith("Non mesuré sur la période : tenue de l’effort, écart entre kilomètres")));
  // A side with a single measured value against a period is given side by side, never judged.
  const block = caseOf(1);
  assert.equal(row(block, "hold").reference.measured, 1);
  assert.equal(row(block, "hold").direction, "neutral");
  assert.equal(row(block, "hold").reason, "short");
  // A climbing session without attempts keeps its grade, and the success rate rests on the two sessions that have both.
  assert.deepEqual([row(caseOf(10), "success_rate").current.measured, row(caseOf(10), "success_rate").current.total], [2, 3]);
});

test("the comparison side by side takes a period, a training block or one session", () => {
  assert.equal(caseOf(0).reference.kind, "period");
  assert.equal(caseOf(1).reference.kind, "block");
  assert.match(caseOf(1).reference.label, /^Bloc « Base aérobie » \(14 sept\. – 11 oct\.\)$/);
  assert.deepEqual(caseOf(1).reference.sessions, ["g-r2", "g-r3"]);
  assert.equal(caseOf(2).reference.kind, "session");
  assert.deepEqual(caseOf(2).reference.sessions, ["g-r2"]);
  assert.equal(row(caseOf(2), "speed").direction, "better");
  assert.equal(caseOf(4).reference.status, "excluded");
  assert.match(caseOf(4).reference.note, /archivée : elle ne sert pas de référence/);
});

test("the view does not depend on the order of the history", () => {
  const shuffled = [...H].reverse();
  FIXTURE.cases.forEach((c, i) => assert.deepEqual(clone(run(c.options, shuffled)), EXPECTED.cases[i].view, c.name));
});
