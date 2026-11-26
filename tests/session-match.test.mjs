// V1.6.2 — Rapprochement des séances: the shared module (js/core/session-match.js), measured on the annotated fixtures, and its parity
// with the server (supabase/migrations/20261130100100_session_match_review.sql) and with the V15 rule it reuses.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { measure } from "../tools/measure-session-match.mjs";

const require = createRequire(import.meta.url);
require("../js/training-store.js");
require("../js/core/format.js");
require("../js/core/sports-catalog.js");
require("../js/core/sports.js");
const C = require("../js/core/sport-contracts.js");
const M = require("../js/core/session-match.js");
const FIXTURES = JSON.parse(readFileSync(new URL("./fixtures/session-match-annotated.json", import.meta.url), "utf8")).cases;
const SQL = readFileSync(new URL("../supabase/migrations/20261130100100_session_match_review.sql", import.meta.url), "utf8");
const byId = (id) => FIXTURES.find((c) => c.id === id);

test("annotated fixtures: every verdict is the expected one, no real duplicate is missed, no false match is silent except the documented V15 trap", () => {
  const { rows, summary } = measure(FIXTURES);
  assert.equal(summary.cases, 30);
  for (const r of rows) assert.equal(r.verdict, r.expect, `${r.id} ${r.title}`);
  assert.equal(summary.v162.missed, 0, "a real duplicate would be counted twice");
  assert.equal(summary.v162.falseMatchesFlagged, 0);
  assert.deepEqual(rows.filter((r) => r.truth === "distinct" && r.verdict === "same").map((r) => r.id), ["M13"], "only the documented trap is merged silently");
  assert.equal(summary.v15.falseMatches, 2, "V15 alone: the trap and the replay of a decision");
  assert.equal(summary.v162.confirmationsAsked, 5);
  // Totals: before decisions an uncertain match counts once; after the athlete's decisions the journal equals the truth.
  assert.deepEqual(summary.totals.v162AfterDecisions, summary.totals.truth);
  assert.ok(summary.totals.noMatching.sessions > summary.totals.truth.sessions, "without matching, duplicates inflate totals");
});

test("a real duplicate counts once and two efforts of the same day stay two (VTT ↔ Santé Connect, morning ↔ evening)", () => {
  const same = M.classify(byId("M01").entry, byId("M01").journal);
  assert.equal(same.verdict, "same");
  assert.equal(same.b.raw.id, "m01");
  assert.deepEqual(same.divergences.map((d) => d.field).sort(), ["distance", "sport"], "sport id and the distance only one source has");
  assert.equal(M.classify(byId("M04").entry, byId("M04").journal), null, "morning and evening runs");
  assert.equal(M.classify(byId("M05").entry, byId("M05").journal), null, "two rides 9 h and 14 h");
});

test("across midnight and after a unit change the same effort is recognised; a run after midnight is another one", () => {
  for (const id of ["M06", "M07"]) assert.equal(M.classify(byId(id).entry, byId(id).journal)?.verdict, "same", id);
  assert.equal(M.classify(byId("M08").entry, byId("M08").journal), null);
  for (const id of ["M09", "M10", "M11"]) {
    const m = M.classify(byId(id).entry, byId(id).journal);
    assert.equal(m.verdict, "same", id);
    assert.ok(!m.divergences.some((d) => d.field === "distance"), `${id}: no distance divergence across units`);
  }
  assert.equal(M.toKm(2000, "m"), 2);
  assert.ok(Math.abs(M.toKm(6.21, "mi") - 9.994) < 0.01);
  assert.equal(M.toKm(5, "min"), null);
});

test("replaying the same GPX file is recognised as the same file and keeps the earlier « two sessions » decision", () => {
  const gpx = byId("M16");
  assert.equal(M.classify(gpx.entry, gpx.journal).rule.startsWith("Même fichier"), true);
  // The athlete said the first GPX import is not the typed run m29: replaying the file again proposes the GPX entry, not m29.
  const typed = { id: "t1", sport: "running", unit: "km", val: 10, date: "2026-11-21T08:00:00Z", created_at: "2026-11-21T10:00:00Z", details: { duration: 50 } };
  const fp = "gpx:1795248000:10000:900";
  const firstImport = { id: "g1", sport: "running", unit: "km", val: 10, date: "2026-11-21T08:02:00Z", created_at: "2026-11-21T11:00:00Z", details: { duration: 50, hasGpx: true, gpxFingerprint: fp, match: { distinct_from: ["t1"] } } };
  const replay = { sport: "running", unit: "km", val: 10, date: "2026-11-21T08:02:00Z", details: { duration: 50, hasGpx: true, gpxFingerprint: fp } };
  const m = M.classify(replay, [typed, firstImport]);
  assert.equal(m.b.raw.id, "g1");
  assert.equal(m.verdict, "same");
  assert.equal(M.compare(M.facts(firstImport), M.facts(typed)).verdict, "distinct", "the recorded decision holds for the pair");
  assert.ok(M.compare(M.facts(firstImport), M.facts(typed)).decided);
});

test("who provides each value: the counted entry and the athlete's note win; a missing value is only shown, labelled, outside totals", () => {
  const log = byId("M01").journal[0];
  const imp = { ...byId("M01").entry, status: "linked", log_id: "m01", linked_log_id: "m01", imported_at: "2026-11-14T12:00:00Z", needs_review: false, reasons: [], events: [{ action: "linked", actor: "engine", at: "2026-11-14T12:00:00Z" }] };
  const v = M.describe(imp, log, [log]);
  assert.equal(v.state, "linked");
  assert.deepEqual(v.sources.map((s) => s.label), ["Saisie manuelle", "Santé Connect"]);
  assert.ok(v.sources[0].saved.startsWith("Enregistrée") && v.sources[1].saved.startsWith("Importée"), "both timestamps");
  assert.equal(v.rows.find((r) => r.field === "note").value, "Boue au col");
  assert.equal(v.rows.find((r) => r.field === "distance").from, "counted");
  assert.deepEqual(v.actions.map((a) => a.id), ["distinct"], "a certain link can still be split");
  assert.equal(v.events[0].by, "TITAN");
  // The typed entry has no distance, the import has one: shown from the import, never added to totals.
  const noKm = { ...log, unit: "min", val: 120, details: { duration: 120 } };
  const imp2 = { ...imp, distance_km: 31.5 };
  const row = M.describe(imp2, noKm, [noKm]).rows.find((r) => r.field === "distance");
  assert.equal(row.from, "other");
  assert.equal(row.shownOnly, true);
  assert.deepEqual(M.totals([noKm]), { sessions: 1, minutes: 120, km: 0 });
});

test("an uncertain link asks; a split offers to undo; an old link says how to make it reviewable", () => {
  const c = byId("M14");
  const log = c.journal[0];
  const review = M.describe({ ...c.entry, status: "linked", log_id: log.id, linked_log_id: log.id, needs_review: true, reasons: ["duration_gap"] }, log, [log]);
  assert.equal(review.state, "review");
  assert.deepEqual(review.actions.map((a) => a.id), ["same", "distinct"]);
  assert.deepEqual(review.reasons, [M.REASONS.duration_gap]);
  assert.ok(review.divergences.some((d) => d.field === "duration"));
  const split = M.describe({ ...c.entry, status: "imported", log_id: "split-1", linked_log_id: log.id, split_log_id: "split-1", decision: "distinct" }, { id: "split-1", sport: "weightlifting", unit: "min", val: 20, date: c.entry.started_at, details: { duration: 20 } }, [log]);
  assert.equal(split.state, "split");
  assert.deepEqual(split.actions.map((a) => a.id), ["same"]);
  assert.equal(split.sources[0].label, "Saisie manuelle", "the athlete's entry is shown next to the import");
  const old = M.describe({ source: "health_connect", external_id: "x", status: "linked", log_id: log.id, started_at: null }, log, [log]);
  assert.equal(old.state, "unknown");
  assert.deepEqual(old.actions, []);
});

test("thresholds are the server's, and the V15 rule is reused unchanged", () => {
  const T = M.THRESHOLDS;
  const reasons = SQL.slice(SQL.indexOf("function private.titan_session_match_reasons"), SQL.indexOf("$function$;", SQL.indexOf("function private.titan_session_match_reasons")));
  assert.match(reasons, new RegExp(`p_shared < ${T.clearOverlap} \\*`));
  assert.match(reasons, new RegExp(`> ${T.durationGap} then 'duration_gap'`));
  assert.match(reasons, new RegExp(`> ${T.distanceGap} then 'distance_gap'`));
  assert.match(SQL, new RegExp(`x.shared >= ${T.overlap} \\* least\\(p_duration_minutes, d.m\\)`), "V15 half of the shorter effort");
  // findDuplicate is now the first of findDuplicates, same answers as before (tests/session-reliability.test.mjs keeps the old cases).
  const watch = { id: "w", sport: "treadmill", unit: "km", val: 8, date: "2026-11-16T18:00:00Z", created_at: "2026-11-16T19:30:00Z", details: { duration: 45, import_source: "garmin" } };
  assert.equal(C.findDuplicates({ sport: "running", date: "2026-11-16T18:10:00Z", minutes: 40 }, [watch]).length, 1);
  assert.equal(C.sharedMinutes({ date: "2026-11-16T18:10:00Z", minutes: 40 }, watch), 35);
});

test("the website wires the shared module: journal sheet, journal badge, pre-save question and GPX fingerprint", () => {
  const journal = readFileSync(new URL("../js/app/journal.js", import.meta.url), "utf8");
  const seance = readFileSync(new URL("../js/app/seance.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../journal.html", import.meta.url), "utf8");
  const training = readFileSync(new URL("../training.html", import.meta.url), "utf8");
  assert.match(journal, /data-match-slot/);
  assert.match(journal, /TitanMatches\?\.badge\(l, matchRows\)/);
  assert.match(journal, /data-match-action/);
  assert.match(seance, /TitanSessionMatch\?\.gpxFingerprint/);
  assert.match(seance, /distinct_from/);
  assert.match(seance, /M\.classify\(draft, history\)/);
  assert.match(page, /js\/core\/session-match\.js/);
  assert.match(page, /js\/app\/matches\.js/);
  assert.match(training, /js\/core\/session-match\.js/);
});
