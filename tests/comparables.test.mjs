// V1.7.1 — Comparaisons justes: the selection behind a comparison is versioned, explained and the same on every client.
// Shared test set: tests/fixtures/comparables-v171.json (also read by mobile/__tests__/comparables.test.tsx).
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

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FIXTURE = read("./fixtures/comparables-v171.json");
const EXPECTED = read("./fixtures/comparables-v171.expected.json");
const H = FIXTURE.history;
const byId = (id) => H.find((l) => l.id === id);

test("the rules version is pinned in the shared test set and in its expected output", () => {
  assert.equal(P.RULES_VERSION, FIXTURE.rulesVersion);
  assert.equal(P.RULES_VERSION, EXPECTED.rulesVersion);
});

for (const c of FIXTURE.cases) {
  test(`case — ${c.name}`, () => {
    const s = P.comparables(byId(c.subject), H);
    const e = c.expect;
    assert.equal(s.status, e.status);
    assert.equal(s.rule.id, e.rule);
    assert.equal(s.rule.version, FIXTURE.rulesVersion);
    assert.equal(s.sample, e.sample, "sample size");
    assert.equal(s.sample, s.retained.length);
    if (e.considered !== undefined) assert.equal(s.considered, e.considered);
    if (e.retained) assert.deepEqual(s.retained.map((r) => r.id), e.retained);
    if (e.excluded) assert.deepEqual(s.excluded.map((x) => [x.id, x.reason]), e.excluded);
    if (e.counts) assert.deepEqual(s.counts, e.counts);
    for (const text of e.limits || []) assert.ok(s.limits.some((l) => l.includes(text)), `limit « ${text} » in ${JSON.stringify(s.limits)}`);
    if (e.reference) assert.equal(s.reference.display, e.reference);
    const cmp = P.compare(byId(c.subject), H);
    if (e.status === "insufficient") {
      assert.equal(cmp, null, "no comparison without a reference");
      assert.ok(s.limits.length > 0, "an insufficient selection always says why");
    } else {
      assert.equal(cmp.previous.id, e.previous);
      assert.equal(cmp.selection.signature, s.signature, "the comparison carries its selection");
      if (e.direction) assert.equal(cmp.items[0].direction, e.direction);
    }
    // Every listed exclusion carries its reason in words.
    for (const x of s.excluded) assert.ok(x.text.startsWith(P.REASONS[x.reason]));
  });
}

test("the website output is the expected output, field by field (the Android test compares with the same file)", () => {
  for (const c of FIXTURE.cases) {
    const log = byId(c.subject);
    const cmp = P.compare(log, H);
    assert.deepEqual(P.snapshot(P.comparables(log, H)), EXPECTED.cases[c.subject].selection, c.name);
    assert.deepEqual(cmp ? { previous: cmp.previous.id, basis: cmp.basis, items: cmp.items.map((i) => ({ id: i.id, now: P.formatValue(i), before: P.formatValue(i, "previous"), direction: i.direction })) } : null, EXPECTED.cases[c.subject].comparison);
  }
});

test("the same history in another order gives the same sample and the same sources", () => {
  const shuffled = [...H].reverse();
  const mixed = [...H.slice(7), ...H.slice(0, 7)];
  for (const c of FIXTURE.cases) {
    const a = P.comparables(byId(c.subject), H).signature;
    assert.equal(P.comparables(byId(c.subject), shuffled).signature, a);
    assert.equal(P.comparables(byId(c.subject), mixed).signature, a);
  }
});

test("a session waiting to be sent is never a reference; once confirmed it is", () => {
  const today = byId("run-today");
  const before = P.comparables(today, H);
  assert.ok(!before.retained.some((r) => r.id === "run-unsent"));
  const confirmed = H.map((l) => (l.id === "run-unsent" ? { ...l, syncStatus: "confirmed" } : l));
  const after = P.comparables(today, confirmed);
  assert.equal(after.retained[0].id, "run-unsent");
  assert.equal(after.counts.unsent, undefined);
  // Discovery mode keeps everything on one device: its sessions are references there.
  const local = H.map((l) => (l.id === "run-unsent" ? { ...l, syncStatus: "local" } : l));
  assert.equal(P.comparables(today, local).retained[0].id, "run-unsent");
});

test("estimates stay apart: a duration TITAN derives or a grade only tried is never compared", () => {
  const s = P.comparables(byId("run-today"), H);
  assert.deepEqual(s.estimates.map((e) => e.id), ["run-noduration"]);
  assert.ok(!s.retained.some((r) => r.id === "run-noduration"));
  assert.equal(s.excluded.find((x) => x.id === "run-noduration").reason, "no_duration");
  const tried = P.comparables(byId("boulder-today"), H).excluded.find((x) => x.id === "boulder-tried");
  assert.equal(tried.text, "aucune réussite cotée (tentée 7A)");
  const subject = P.comparables(byId("run-noduration"), H);
  assert.equal(subject.status, "insufficient");
  assert.match(subject.limits[0], /estimation pour l’XP, jamais comparée/);
});

test("the scales the rule orders are exactly those TitanInsights.grade reads, never converted", () => {
  for (const scale of P.SCALES) assert.ok(globalThis.TitanInsights.grade(scale === "V-scale bloc" ? "V3" : "6a", scale), scale);
  assert.equal(globalThis.TitanInsights.grade("5.11a", "YDS"), null);
  const s = P.comparables(byId("boulder-today"), H);
  assert.ok(s.rule.criteria.some((c) => /sans conversion/.test(c)));
});

test("a trail race of the same distance is another sport: never in the pool, and the criteria say so", () => {
  const s = P.comparables(byId("run-today"), H);
  assert.ok(![...s.retained, ...s.excluded].some((x) => x.id === "trail-race"));
  assert.equal(s.rule.criteria[0], "Même sport : Course à pied");
  assert.ok(s.rule.criteria.includes("Parcours (Surface) : Route"));
  assert.equal(s.excluded.find((x) => x.id === "run-trail").text, "autre parcours (Chemin)");
});

test("other sports keep their rule and get the same explanation; a first session says it is the first", () => {
  const tennis = (id, d) => ({ id, client_event_id: id, sport: "tennis", unit: "min", val: 90, date: new Date(Date.UTC(2026, 9, d, 18)).toISOString(), details: { duration: 90 } });
  const logs = [tennis("t1", 1), tennis("t2", 8)];
  const s = P.comparables(logs[1], logs);
  assert.equal(s.rule.id, "pratique.duree");
  assert.equal(s.rule.pilot, false);
  assert.equal(s.status, "ok");
  const first = P.comparables(logs[0], logs);
  assert.equal(first.status, "insufficient");
  assert.match(first.limits[0], /Première séance de tennis/);
});

test("a long history is examined up to the stated limit, most recent first", () => {
  const many = Array.from({ length: P.SELECTION.maxConsidered + 20 }, (_, i) => ({ id: `r${i}`, client_event_id: `r${i}`, sport: "running", unit: "km", val: 10, date: new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString(), details: { duration: 55 } }));
  const last = many[many.length - 1];
  const s = P.comparables(last, many);
  assert.equal(s.considered, P.SELECTION.maxConsidered);
  assert.equal(s.truncated, true);
  assert.ok(s.limits.some((l) => /500 dernières séances/.test(l)));
  assert.equal(s.previous.id, many[many.length - 2].id);
});
