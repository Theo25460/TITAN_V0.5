// V1.6.5 — Centre des sources connectées: the shared diagnosis (js/core/source-center.js) read against fixed states of the pilot
// connectors (tests/fixtures/source-center.json: access withdrawn, expired, no result, in error, interrupted, restored, weeks missing),
// the bounded resume window, the run outcome and the measure of the lot. Synthetic data only. The Android app replays the same
// fixture on its copy of the module (mobile/__tests__/sourceCenter.test.tsx) and drives a fake Health Connect through the real runner;
// the server effects (withdrawal blocks, two resumes duplicate nothing, corrections kept) are proven by sql/tests/300_source_center.sql.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const S = require("../js/core/source-center.js");
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/source-center.json", import.meta.url), "utf8"));
const NOW = Date.parse(FIXTURE.now);
const SQL = readFileSync(new URL("../supabase/migrations/20261130100500_source_center.sql", import.meta.url), "utf8");

test("every fixed state is diagnosed as expected, and « Connecté » is only said for a working access", () => {
  for (const [name, f] of Object.entries(FIXTURE.states)) {
    const d = S.diagnose(f.source, f.entry, { now: NOW, device: f.device, here: f.here ?? f.device !== null, tz: "Europe/Paris" });
    assert.equal(d.state, f.expect.state, `${name}: state`);
    assert.equal(d.connected, f.expect.connected, `${name}: connected`);
    assert.equal(d.actions[0]?.id ?? null, f.expect.action, `${name}: first action`);
    if (f.expect.label) assert.equal(d.label, f.expect.label, `${name}: label`);
    if (f.expect.detailHas) assert.ok(d.detail.includes(f.expect.detailHas), `${name}: ${d.detail}`);
    if (f.expect.replayFrom) assert.equal(d.replay.from, f.expect.replayFrom, `${name}: replay from`);
    if (f.expect.unavailableBefore) assert.equal(d.replay.unavailableBefore, f.expect.unavailableBefore, `${name}: unavailable before`);
    if (f.expect.exclusions) assert.equal(d.exclusions.reduce((n, x) => n + x.n, 0), f.expect.exclusions, `${name}: exclusions`);
    if (f.expect.review) assert.ok(d.actions.some((a) => a.id === "review"), `${name}: a conflict has its action`);
    if (d.label === "Connecté") assert.equal(d.connected, true, `${name}: the « Connecté » label needs a working access`);
    if (!d.connected) assert.notEqual(d.label, "Connecté", `${name}: never « Connecté » without access`);
  }
});

test("the four situations of the scenario are four different labels, each with its own explanation", () => {
  const pick = (n) => { const f = FIXTURE.states[n]; return S.diagnose(f.source, f.entry, { now: NOW, device: f.device, here: true }); };
  const four = [pick("hc_expired"), pick("hc_withdrawn"), pick("hc_empty"), pick("hc_failed")];
  assert.deepEqual(four.map((d) => d.state), ["expired", "withdrawn", "empty", "failed"]);
  assert.equal(new Set(four.map((d) => d.label)).size, 4, four.map((d) => d.label).join(" | "));
  assert.equal(new Set(four.map((d) => d.detail)).size, 4);
  // Garmin withdrawn on Garmin's side is told apart from a withdrawal in TITAN.
  const g = FIXTURE.states.garmin_provider_withdrawn;
  assert.match(S.diagnose("garmin", g.entry, { now: NOW }).detail, /Garmin a signalé/);
});

test("the resume is bounded: never more than 30 days, never before 30 days ahead of the first grant, one day of overlap", () => {
  const day = 86400000;
  const w = S.replayWindow("health_connect", { now: NOW, lastWindowTo: new Date(NOW - 5 * day).toISOString(), grantedAt: "2026-01-01T00:00:00Z" });
  assert.equal(w.from, new Date(NOW - 6 * day).toISOString());
  assert.equal(w.clamped, false);
  const weeks = S.replayWindow("health_connect", { now: NOW, lastWindowTo: new Date(NOW - 50 * day).toISOString(), grantedAt: "2026-01-01T00:00:00Z" });
  assert.equal(weeks.from, new Date(NOW - 30 * day).toISOString());
  assert.equal(weeks.days, 30);
  assert.equal(weeks.unavailableBefore, weeks.from, "the part nothing can bring back is said");
  const fresh = S.replayWindow("health_connect", { now: NOW, lastWindowTo: null, grantedAt: new Date(NOW - 2 * day).toISOString() });
  assert.equal(fresh.from, new Date(NOW - 7 * day).toISOString(), "default: the last 7 days");
  assert.equal(S.replayWindow("garmin", { now: NOW }), null, "Garmin cannot be asked for a past period");
  assert.equal(S.CONTRACTS.garmin.replay.supported, false);
});

test("a run says failed, partial, empty or ok from what really happened", () => {
  assert.equal(S.summarizeRun({ error: "HC_UNAVAILABLE" }).outcome, "failed");
  assert.equal(S.summarizeRun({ error: "ANDROID_PERMISSION" }).outcome, "denied");
  assert.equal(S.summarizeRun({ read: 2, results: ["imported", "error"] }).outcome, "partial");
  assert.equal(S.summarizeRun({ read: 2, results: ["duplicate", "duplicate"] }).outcome, "empty", "a second resume of the same window adds nothing");
  const r = S.summarizeRun({ read: 4, results: ["imported", { status: "linked", needs_review: true }, "duplicate"], excluded: { unmapped_type: 1 } });
  assert.deepEqual(r, { outcome: "ok", counts: { read: 4, imported: 1, linked: 1, duplicate: 1, excluded: 1, failed: 0, review: 1 }, error_code: null });
});

test("withdrawal says what stops, what stays and how to archive", () => {
  const t = S.withdrawText("health_connect", { counts: { imported: 12 } });
  assert.match(t[0], /ne lit plus rien/);
  assert.match(t[1], /12 séances déjà importées restent/);
  assert.match(t[1], /Archiver/);
  assert.deepEqual(S.withdrawText("gpx", {}), []);
});

test("coverage lists the fields each source really sends", () => {
  const f = FIXTURE.states.hc_empty;
  const d = S.diagnose("health_connect", { ...f.entry, sports: [{ sport: "running", n: 9 }], fields: { total: 15, distance: 0 } }, { now: NOW, device: f.device, here: true });
  const covered = Object.fromEntries(d.coverage.fields.map((x) => [x.field, x.covered]));
  assert.equal(covered.distance, false, "Santé Connect sends no distance yet (V1.6.2 limit)");
  assert.equal(covered.duration, true);
  assert.equal(S.diagnose("garmin", FIXTURE.states.garmin_quiet.entry, { now: NOW }).coverage.fields.find((x) => x.field === "distance").covered, true);
  assert.deepEqual(d.coverage.sports, [{ sport: "running", n: 9 }]);
});

test("the center lists the pilot sources in a stable order; Garmin is outside the pilot and nothing is announced validated", () => {
  const c = S.center({ sources: [FIXTURE.states.garmin_quiet.entry, FIXTURE.states.hc_empty.entry] }, { now: NOW });
  assert.deepEqual(c.map((d) => d.source), ["health_connect", "garmin", "archive", "gpx"]);
  assert.equal(c.find((d) => d.source === "garmin").pilot, false);
  assert.ok(c.every((d) => d.validated === false), "no source is announced validated without a real activity on a real device");
});

test("measure: resume delay and share of interrupted syncs that find a visible activity again", () => {
  const h = 3600000;
  const at = (hours) => new Date(NOW - hours * h).toISOString();
  const runs = [
    // 1. failed, resumed 2 h later over the same window, an activity of that window is in the journal.
    { id: "a", started_at: at(100), finished_at: at(100), window_from: at(268), window_to: at(100), outcome: "failed" },
    { id: "b", started_at: at(98), finished_at: at(98), window_from: at(268), window_to: at(98), outcome: "ok" },
    // 2. interrupted (stale « running »), resumed 30 min later, nothing in the window.
    { id: "c", started_at: at(50), finished_at: null, window_from: at(60), window_to: at(50), outcome: "running" },
    { id: "d", started_at: at(49.5), finished_at: at(49.5), window_from: at(61), window_to: at(49.5), outcome: "empty" },
    // 3. failed, never resumed.
    { id: "e", started_at: at(10), finished_at: at(10), window_from: at(20), window_to: at(10), outcome: "failed" },
  ];
  const m = S.measure(runs, [{ started_at: at(150), visible: true }], { now: NOW });
  assert.deepEqual(m, { interrupted: 3, recovered: 2, visible: 1, recoveredRate: 2 / 3, visibleRate: 1 / 3, medianDelayMinutes: 30, maxDelayMinutes: 120 });
});

test("the server contract this module reads is the one the migration returns", () => {
  for (const key of ["'consent'", "'revoked_by'", "'runs'", "'link'", "'ended_at'", "'last_event_at'", "'review'", "'sports'", "'fields'", "'batch'"]) {
    assert.ok(SQL.includes(key), `titan_source_center_v1 returns ${key}`);
  }
  for (const outcome of ["running", "ok", "empty", "partial", "failed", "denied"]) assert.ok(SQL.includes(`'${outcome}'`), outcome);
  // The Garmin push records its ignored activities with the reasons titan_garmin_ingest_v1 already gives; each has a label here.
  for (const reason of ["invalid_id", "unmapped_type", "unknown_sport", "invalid_date", "too_short", "out_of_range", "invalid_payload"]) {
    assert.ok(S.EXCLUSIONS[reason], `label for ${reason}`);
    assert.ok(SQL.includes(`'${reason}'`), `the migration keeps ${reason}`);
  }
});
