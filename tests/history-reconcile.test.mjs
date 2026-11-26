// V1.6.3 — Contrôle et réconciliation: the official state matrix (js/core/history-ledger.js) read against the contracts of each view,
// and the fixed set tests/fixtures/history-reconcile.json replayed step by step (correction, archive of the duplicate import, sync,
// reconnection, restore, archive again, source replay) on the website modules. The Android app replays the same file on its own copy
// of the modules (mobile/__tests__/historyReconcile.test.ts); the server effects are proven by sql/tests/300_history_reconcile.sql.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
for (const f of ["format.js", "../training-store.js", "effort.js", "sports-catalog.js", "sports.js", "../sport-insights.js", "progress.js", "sync-state.js"]) require(`../js/core/${f}`);
const L = require("../js/core/history-ledger.js");
const T = globalThis.TitanTraining;
const P = globalThis.TitanProgress;
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/history-reconcile.json", import.meta.url), "utf8"));
const { run } = require("../tools/history-reconcile-sim.cjs");
const SQL = readFileSync(new URL("../supabase/migrations/20261130100200_history_reconcile.sql", import.meta.url), "utf8");

const sample = {
  confirmed: { id: "c", client_event_id: "c0000000-1", syncStatus: "confirmed", sport: "running", date: "2026-11-20T07:00:00Z", val: 5, unit: "km", details: { duration: 30 } },
  local: { id: "l", client_event_id: "l0000000-1", syncStatus: "local", sport: "running", date: "2026-11-20T07:00:00Z", val: 5, unit: "km", details: { duration: 30 } },
  stored: { id: "s", client_event_id: "s0000000-1", syncStatus: "pending", sport: "running", date: "2026-11-20T07:00:00Z", val: 5, unit: "km", details: { duration: 30 } },
  refused: { id: "r", client_event_id: "r0000000-1", syncStatus: "error", sport: "running", date: "2026-11-20T07:00:00Z", val: 5, unit: "km", details: { duration: 30 } },
  held: { id: "h", client_event_id: "h0000000-1", syncStatus: "confirmed", is_suspicious: true, sport: "running", date: "2026-11-20T07:00:00Z", val: 5, unit: "km", details: { duration: 30 } },
  archived: { id: "a", client_event_id: "a0000000-1", syncStatus: "confirmed", archived_at: "2026-11-21T07:00:00Z", sport: "running", date: "2026-11-20T07:00:00Z", val: 5, unit: "km", details: { duration: 30 } },
};

test("the matrix is the contract each view already applies: totals and records = TitanTraining.counted, journal = not archived", () => {
  for (const [state, log] of Object.entries(sample)) {
    assert.equal(L.stateOf(log, { guest: state === "local" }), state, state);
    const cell = L.MATRIX[state];
    assert.equal(cell.totals, T.counted(log), `${state}: totals follow counted`);
    assert.equal(cell.records, T.counted(log), `${state}: records follow counted`);
    assert.equal(P.activeLogs([log], Date.parse("2026-11-23T00:00:00Z")).length, cell.totals ? 1 : 0, `${state}: activeLogs agrees`);
    assert.equal(cell.journal, log.archived_at ? "archives" : "journal", `${state}: listed where both clients list it`);
    const { logs, archived } = L.split(log.syncStatus === "confirmed" ? [log] : [], log.syncStatus === "confirmed" ? [] : [log]);
    assert.equal(cell.journal === "archives" ? archived.length : logs.length, 1, `${state}: split places it in its list`);
  }
  assert.equal(L.MATRIX.refused.csv, null, "a refused entry is not part of the history export");
  assert.equal(L.MATRIX.archived.csv, "archives");
  assert.equal(L.MATRIX.stored.json, false, "the account export reads the server: a session still on the device is not in it");
  assert.equal(L.MATRIX.archived.json, true, "archived rows stay in the account export, with archived_at");
});

test("the fixed set gives the expected controls after every mutation, with zero gap, on both devices", () => {
  const { results, byId } = run(FIXTURE, L);
  for (const r of results) assert.deepEqual(r.gaps || [], [], `${r.id}: ${r.title}`);
  for (const s of FIXTURE.steps.filter((x) => x.changes)) assert.deepEqual(byId[s.id].changed, s.changes, `${s.id}: what the mutation changed`);
  // The record held by the archived duplicate moves to the next ADMISSIBLE session: not the 12 km run in 5 min (implausible), not
  // the archived 15 km, but the corrected 10 km run.
  assert.deepEqual(byId.S2.A.records["distance:running"], [10, "1a2b3c4d"]);
  // After sync and after reconnection both devices show the same totals and records.
  for (const id of ["S3", "S4-cache", "S4", "S6", "S7"]) {
    const r = results.find((x) => x.id === id);
    assert.deepEqual(r.A.period, r.B.period, `${id}: same totals on both devices`);
    assert.deepEqual(r.A.records, r.B.records, `${id}: same records on both devices`);
  }
  // Restoring brings back the totals before the archive (S1 plus the synced session) and credits nothing twice.
  assert.deepEqual(byId.S5.A.period, { sessions: 6, minutes: 340, km: 67.4 });
  assert.equal(byId.S5.A.xp, byId.S3.A.xp, "a restore grants no reward");
  assert.deepEqual(byId.S6.A, byId.S3.A, "archiving again comes back exactly to S3");
  assert.equal(byId.S7.answer.status, "duplicate", "the source replay is not read again");
});

test("the measure counts gaps: with the duplicate still counted, every control disagrees with the expected state", () => {
  const { byId } = run(FIXTURE, L);
  const expectS2 = FIXTURE.steps.find((s) => s.id === "S2").expect.A;
  const gaps = L.gaps(expectS2, { ...byId.S1.A, records: Object.fromEntries(Object.keys(expectS2.records).map((k) => [k, byId.S1.A.records[k] ?? null])) });
  assert.ok(gaps.length >= 6, `the duplicate still counted shows in journal, archives, totals, records, CSV and JSON: ${gaps.join(" | ")}`);
  assert.ok(gaps.some((g) => g.startsWith("records.distance:running")), "the record still points at the duplicate");
});

test("the CSV carries the state and the canonical reference of each row, never a refused entry; archives are labelled", () => {
  const window = { state: { user: { id: "u1" } }, TitanLedger: L, SPORTS_CONFIG: { running: { label: "Course à pied" } } };
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(new URL("../js/session-export.js", import.meta.url), "utf8"), { window, module, document: { getElementById: () => null } });
  const rows = Object.values(sample).filter((l) => l !== sample.local);
  const text = module.exports.csv(rows);
  const lines = text.slice(1).split("\r\n");
  assert.equal(lines[0], L.CSV_HEAD.map((h) => `"${h}"`).join(";"));
  assert.equal(lines.length, 1 + 4, "confirmed, waiting, held and archived; the refused one is left out");
  assert.ok(lines.some((l) => l.includes('"Archivée";"a0000000"')));
  assert.ok(lines.some((l) => l.includes('"En vérification"')));
  assert.ok(lines.some((l) => l.includes('"Sur cet appareil";"s0000000"')));
  assert.ok(!text.includes("r0000000"), "no refused entry");
  // Guest (discovery mode): everything is on this device.
  window.state.user.id = "guest_1";
  assert.ok(module.exports.csv([sample.local]).includes('"Sur cet appareil";"l0000000"'));
});

test("a change is worded once for both clients, and the server reads the same fields", () => {
  const before = { val: 10.4, unit: "km", date: "2026-11-20T07:30:42.000Z", details: { duration: 52, note: "a" }, archived_at: null };
  assert.deepEqual(L.changes(before, { ...before, date: "2026-11-20T07:30:00.000Z" }), [], "the same minute is the same date");
  const c = L.changes(before, { ...before, val: 10, details: { duration: 50, note: "b" } });
  assert.deepEqual(c.map(L.changeText), ["Distance : 10,4 → 10 km", "Durée : 52 → 50 min", "Note modifiée"]);
  assert.equal(L.changeText({ field: "archived", before: false, after: true }), "Archivée");
  assert.equal(L.changeText({ field: "archived", before: true, after: false }), "Restaurée");
  assert.equal(L.changeText({ field: "val", before: 1500, after: 1450, unit: "m" }), "Distance : 1500 → 1450 m");
  for (const f of ["val", "unit", "date", "duration", "note", "archived"]) assert.match(SQL, new RegExp(`'field', '${f}'`), `server reads ${f}`);
  assert.match(SQL, /date_trunc\('minute'/, "the server compares dates to the minute, like the clients");
  assert.match(SQL, /SESSION_MATCH_JOINED/);
  assert.match(readFileSync(new URL("../js/app/sessions.js", import.meta.url), "utf8"), /SESSION_MATCH_JOINED: "/, "the website words the refusal");
});

test("a source whose later edits do not come back says so; a typed or GPX session does not", () => {
  for (const s of ["garmin", "health_connect", "archive"]) assert.match(L.sourceLimit(s), /ne revient pas dans TITAN/);
  for (const s of ["manual", "gpx", "gps", "live", undefined]) assert.equal(L.sourceLimit(s), null);
});

test("canonical identity: a server row and its queue copy are one entry, the server row wins, the reference is the client_event_id", () => {
  const item = { ...FIXTURE.deviceA.queue[0] };
  const confirmed = { ...item, id: "p1", syncStatus: "confirmed", xp: 30 };
  const { logs } = L.split([confirmed], [item]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].id, "p1");
  assert.equal(L.reference(logs[0]), "d1d1d1d1");
  assert.equal(L.reference({ id: "x", details: { client_event_id: "abcdef1234" } }), "abcdef12");
});
