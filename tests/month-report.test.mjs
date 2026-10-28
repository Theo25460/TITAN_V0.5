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
