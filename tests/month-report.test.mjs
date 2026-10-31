import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { build, describe } = createRequire(import.meta.url)("../js/core/month-report.js");

const minutesOf = (l) => ({ minutes: l.details?.duration ?? 30, estimated: l.details?.duration === undefined });
const log = (date, sport = "running", extra = {}) => ({ date, sport, unit: "km", val: 10, details: { duration: 60 }, ...extra });
const NOW = new Date(2026, 9, 15, 12);
const opts = { now: NOW, minutesOf, label: (s) => s.toUpperCase() };

test("a month sums time and active days, and keeps each sport's own volume", () => {
  const r = build([log(new Date(2026, 9, 2, 8)), log(new Date(2026, 9, 2, 18), "yoga", { unit: "min", val: 45, details: { duration: 45 } }), log(new Date(2026, 9, 9, 8))], opts);
  assert.equal(r.sessions, 3);
  assert.equal(r.activeDays, 2);
  assert.equal(r.minutes, 165);
  assert.deepEqual(r.sports.map((s) => [s.sport, s.minutes, s.distanceKm]), [["running", 120, 20], ["yoga", 45, null]]);
  assert.equal(r.distanceKm, 20, "only distance sports add kilometres; time is the common measure");
});

test("a month in progress is compared with the same days of the previous month, not its full length", () => {
  const logs = [log(new Date(2026, 8, 3, 8)), log(new Date(2026, 8, 25, 8)), log(new Date(2026, 9, 4, 8))];
  const r = build(logs, opts);
  assert.equal(r.previous.sessions, 1, "the 25 September is after the 15th: not compared");
  assert.deepEqual([r.comparison.minutes, r.comparison.sameDays], [0, true]);
  const full = build(logs, { ...opts, offset: 1 });
  assert.equal(full.current, false);
  assert.equal(full.sessions, 2);
});

test("no previous month means no comparison and an honest sentence, not a zero", () => {
  const r = build([log(new Date(2026, 9, 4, 8))], opts);
  assert.equal(r.previous, null);
  assert.equal(r.comparison, null);
  assert.match(describe(r).text, /Premier mois mesuré/);
});

test("estimated durations are flagged, archived and suspicious sessions are left out, the future is not counted", () => {
  const r = build([
    log(new Date(2026, 9, 2, 8), "running", { details: {} }),
    log(new Date(2026, 9, 3, 8), "running", { archived_at: "2026-10-04" }),
    log(new Date(2026, 9, 4, 8), "running", { is_suspicious: true }),
    log(new Date(2026, 9, 20, 8)),
  ], opts);
  assert.equal(r.sessions, 1);
  assert.equal(r.estimatedMinutes, 30);
  assert.ok(describe(r).notes.some((n) => /estimées/.test(n)));
});

test("a duration-only endurance session counts for its time and never for a distance", () => {
  const r = build([log(new Date(2026, 9, 2, 8), "trail", { unit: "min", val: 600, details: { duration: 600, distance_unknown: true } })], opts);
  assert.equal(r.minutes, 600);
  assert.equal(r.distanceKm, 0);
});

test("a quieter month is described, never judged", () => {
  const logs = [log(new Date(2026, 8, 2, 8)), log(new Date(2026, 8, 3, 8)), log(new Date(2026, 9, 2, 8))];
  const d = describe(build(logs, opts), { duration: (m) => `${m} min` });
  assert.match(d.text, /de moins sur les mêmes jours de septembre/);
  assert.doesNotMatch(JSON.stringify(d), /échec|raté|faible|paresse/i);
  assert.match(describe(build([], opts)).title, /commence/);
  assert.match(describe(build([], { ...opts, offset: 1 })).title, /repos/);
});

test("records and adventure highlights of the month come from the caller, capped, and a record count joins the notes", () => {
  const recs = Array.from({ length: 7 }, (_, i) => ({ sport: "running", label: `r${i}` }));
  const r = build([log(new Date(2026, 9, 2, 8))], { ...opts, recordsOf: (from, to) => (from < to ? recs : []), adventureOf: () => [{ label: "Insigne", detail: "Aube · chapitre 1" }] });
  assert.equal(r.records.length, 5);
  assert.equal(r.adventure.length, 1);
  assert.ok(describe(r).notes.some((n) => /5 records battus/.test(n)));
  assert.deepEqual(build([log(new Date(2026, 9, 2, 8))], opts).records, []);
});

test("the annual report compares with the same days of the previous year and names the year", () => {
  const logs = [log(new Date(2025, 1, 3, 8)), log(new Date(2025, 11, 20, 8)), log(new Date(2026, 0, 10, 8)), log(new Date(2026, 8, 3, 8)), log(new Date(2026, 8, 4, 8), "yoga", { unit: "min", val: 45, details: { duration: 45 } })];
  const y = build(logs, { ...opts, period: "year" });
  assert.equal(y.period, "year");
  assert.equal(y.label, "2026");
  assert.equal(y.sessions, 3);
  assert.equal(y.previous.label, "2025");
  assert.equal(y.previous.sessions, 1, "20 December 2025 is after the 15 October: not compared");
  const last = build(logs, { ...opts, period: "year", offset: 1 });
  assert.equal(last.current, false);
  assert.equal(last.label, "2025");
  assert.equal(last.sessions, 2);
  assert.equal(last.previous, null);
  assert.match(describe(y).text, /sur les mêmes jours de 2025/);
  assert.match(describe(last).text, /Première année mesurée/);
  assert.match(describe(build([], { ...opts, period: "year", offset: 2 })).title, /Une année sans séance/);
});

test("a journal that is not a list gives an empty report instead of an error", () => {
  for (const bad of [null, undefined, {}, "x", 7]) assert.doesNotThrow(() => build(bad, opts));
});

test("an absurd level never loops for long: the cumulated XP stops at the level cap", () => {
  const { totalForLevel } = createRequire(import.meta.url)("../js/core/effort.js");
  const started = Date.now();
  assert.equal(totalForLevel(1e12), totalForLevel(500));
  assert.ok(Date.now() - started < 200);
});

test("a week runs Monday to Sunday and a week in progress is compared with the same days of the one before (COM-B8)", () => {
  const logs = [
    log(new Date(2026, 9, 5, 8)), log(new Date(2026, 9, 8, 8)), log(new Date(2026, 9, 10, 8)), // previous week: Mon, Thu, then Sat (after the 4 days elapsed)
    log(new Date(2026, 9, 12, 8)), log(new Date(2026, 9, 14, 8), "yoga", { unit: "min", val: 45, details: { duration: 45 } }),
  ];
  const r = build(logs, { ...opts, period: "week" });
  assert.equal(r.period, "week");
  assert.equal(r.current, true);
  assert.equal(r.sessions, 2);
  assert.equal(r.activeDays, 2);
  assert.equal(r.minutes, 105);
  assert.equal(r.previous.sessions, 2, "the Saturday of the previous week is after the same four days");
  assert.equal(r.comparison.sameDays, true);
  assert.equal(r.comparison.minutes, 105 - 120);
  assert.match(r.label, /semaine du 12 octobre/);
  const done = build(logs, { ...opts, period: "week", offset: 1 });
  assert.equal(done.current, false);
  assert.equal(done.sessions, 3);
  assert.deepEqual([done.from.getDate(), done.to.getDate()], [5, 12]);
  const text = describe(r, { duration: (m) => `${m} min` });
  assert.match(text.text, /15 min de moins sur les mêmes jours de la semaine du 5 octobre/);
  assert.ok(text.notes.some((n) => /Semaine en cours/.test(n)));
});

test("a week without session or without a previous week is said plainly (COM-B8)", () => {
  const empty = build([], { ...opts, period: "week" });
  assert.match(describe(empty).title, /La semaine commence/);
  const first = build([log(new Date(2026, 9, 13, 8))], { ...opts, period: "week" });
  assert.equal(first.comparison, null);
  assert.match(describe(first).text, /Première semaine mesurée/);
  assert.match(describe(build([], { ...opts, period: "week", offset: 1 })).title, /Une semaine de repos/);
});
