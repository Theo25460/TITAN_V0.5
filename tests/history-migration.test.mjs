// V1.6.4 — Migration de l’historique: the shared reader of history files (js/core/history-migration.js). Units, time zones, invalid
// rows, the two pilot formats (TITAN export CSV / JSON, CSV profile with its Strava preset), the preview against the journal and the
// batch payload. The server side and the 5 000-row proofs run on PostgreSQL (sql/tests/300_history_migration.sql,
// tools/db/test-history-migration.mjs); the Android app runs the same file on its copy (mobile/__tests__/historyMigration.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
for (const f of ["format.js", "../training-store.js", "effort.js", "sports-catalog.js", "sports.js", "sport-contracts.js", "../sport-insights.js", "progress.js", "sync-state.js", "session-match.js", "history-ledger.js"]) require(`../js/core/${f}`);
const M = require("../js/core/history-migration.js");
const L = globalThis.TitanLedger;
const SQL = readFileSync(new URL("../supabase/migrations/20261130100300_history_migration.sql", import.meta.url), "utf8");
const NOW = Date.parse("2026-11-23T12:00:00Z");

test("numbers and durations in the notations athletes use", () => {
  assert.equal(M.parseNumber("10,5"), 10.5);
  assert.equal(M.parseNumber("1 234,5"), 1234.5);
  assert.equal(M.parseNumber("1,234.5"), 1234.5);
  assert.equal(M.parseNumber("abc"), null);
  assert.equal(M.parseDuration("1:02:03"), 62.05);
  assert.equal(M.parseDuration("1:05"), 65, "two parts are h:mm");
  assert.equal(M.parseDuration("1h02"), 62);
  assert.equal(M.parseDuration("1 h 02 min"), 62);
  assert.equal(M.parseDuration("62 min"), 62);
  assert.equal(M.parseDuration("3723", "s"), 62.05);
  assert.equal(M.parseDuration("1,5", "h"), 90);
  assert.equal(M.parseDuration(""), null);
});

test("dates: offsets kept, local times read in the chosen zone, both summer-time changes, day/month order", () => {
  assert.equal(new Date(M.parseDate("2025-03-01T07:30:00+01:00").ms).toISOString(), "2025-03-01T06:30:00.000Z");
  assert.equal(new Date(M.parseDate("12/03/2024", "07:15", { tz: "Europe/Paris" }).ms).toISOString(), "2024-03-12T06:15:00.000Z");
  assert.equal(new Date(M.parseDate("12/07/2024", "07:15", { tz: "Europe/Paris" }).ms).toISOString(), "2024-07-12T05:15:00.000Z");
  assert.equal(new Date(M.parseDate("2025-07-01", "07:30", { tz: "America/New_York" }).ms).toISOString(), "2025-07-01T11:30:00.000Z");
  const gap = M.parseDate("30/03/2025", "02:30", { tz: "Europe/Paris" });
  assert.equal(gap.dst, "gap");
  assert.equal(new Date(gap.ms).toISOString(), "2025-03-30T01:30:00.000Z", "a skipped time moves forward to 03:30");
  const twice = M.parseDate("26/10/2025", "02:30", { tz: "Europe/Paris" });
  assert.equal(twice.dst, "repeated");
  assert.equal(new Date(twice.ms).toISOString(), "2025-10-26T00:30:00.000Z", "a repeated time takes its first occurrence");
  assert.equal(new Date(M.parseDate("03/12/2024", "6:05 PM", { order: "mdy", tz: "UTC" }).ms).toISOString(), "2024-03-12T18:05:00.000Z");
  assert.equal(new Date(M.parseDate("Nov 1, 2025, 7:42:13 AM").ms).toISOString(), "2025-11-01T07:42:13.000Z", "Strava dates are UTC");
  assert.equal(M.parseDate("31/02/2023", "08:00").error, "invalid_date");
  assert.equal(M.parseDate("12/03/2024", "").error, "missing_time", "no start time is never guessed");
  assert.equal(new Date(M.parseDate("12/03/2024", "", { tz: "UTC", allowDateOnly: true }).ms).toISOString(), "2024-03-12T12:00:00.000Z", "unless the athlete chooses noon");
});

test("CSV profile: any column order, units per row, invalid rows explained, unknown sport classified or ignored", () => {
  const csv = [
    "identifiant;date;heure;sport;durée;distance;unité;ressenti;note",
    "a1;12/03/2024;07:15;Course à pied;0:52:10;10,4;km;6;\"Fractionné; 10 x 400\"",
    "a2;13/03/2024;18:00;Musculation en salle;1:00;;;7;",
    "a3;14/03/2024;19:00;Natation;40 min;1500;m;;",
    "a4;15/03/2024;08:00;Trail;2h05;12,5;mi;;",
    "a5;16/03/2024;08:00;Zumba X;45;;;;",
    "a6;17/03/2024;;Course à pied;30;5;km;;",
    "a7;31/02/2024;08:00;Course à pied;30;5;km;;",
    "a8;18/03/2024;08:00;Course à pied;0;5;km;;",
    "a9;19/03/2024;08:00;Course à pied;30;-2;km;;",
    "a1;20/03/2024;08:00;Course à pied;30;5;km;;",
    "b1;10/11/2026;08:00;Course à pied;30;5;km;;",
    "b2;01/01/1989;08:00;Course à pied;30;5;km;;",
    "",
  ].join("\n");
  const p = M.parse(csv, { now: NOW });
  assert.equal(p.format, "csv_profile");
  const by = Object.fromEntries(p.rows.map((r) => [r.row, r]));
  assert.deepEqual(by[2].item, { id: "csv-a1", sport: "running", startedAt: "2024-03-12T06:15:00.000Z", minutes: 52.2, km: 10.4, rpe: 6, note: "Fractionné; 10 x 400" });
  assert.equal(by[3].item.km, null);
  assert.equal(by[3].item.minutes, 60);
  assert.equal(by[4].item.km, 1.5, "metres → km for the server, which stores a swim in metres");
  assert.equal(by[5].item.km, 20.117, "miles → km");
  assert.equal(by[6].reason, "unknown_sport");
  assert.deepEqual(p.unknownSports, { "Zumba X": 1 });
  assert.deepEqual([7, 8, 9, 10, 11, 12, 13].map((n) => by[n].reason), ["missing_time", "invalid_date", "invalid_duration", "invalid_distance", "duplicate_in_file", "recent", "too_old"]);
  const chosen = M.parse(csv, { now: NOW, sportMap: { "Zumba X": "dance" } });
  assert.equal(chosen.rows[4].item.sport, "dance", "the athlete's choice classifies the sport");
  const ignored = M.parse(csv, { now: NOW, sportMap: { "Zumba X": "skip" } });
  assert.equal(ignored.rows[4].reason, "sport_ignored");
  for (const r of p.rows) if (r.status === "skip") assert.ok(M.REASONS[r.reason], `reason ${r.reason} has words`);
});

test("CSV profile: an unknown header layout is refused with the columns to indicate", () => {
  assert.throws(() => M.parse("Jour J,Truc\n1,2\n", { now: NOW }), (e) => e.code === "MAPPING_REQUIRED" && /date/.test(e.message));
  const p = M.parse("Jour J;Truc;Combien\n12/03/2024 07:15;Course;45\n", { now: NOW, tz: "UTC", mapping: { date: 0, sport: 1, duration: 2, durationUnit: "min" } });
  assert.equal(p.rows[0].item.startedAt, "2024-03-12T07:15:00.000Z");
  assert.equal(p.rows[0].item.minutes, 45);
});

test("Strava preset: activities.csv with its two Distance columns, moving time, UTC dates", () => {
  const csv = 'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Max Heart Rate,Moving Time,Distance,Activity Description\n'
    + '111,"Nov 1, 2025, 7:42:13 AM",Matin,Run,3000,"10,02",170,2900,10020.5,Easy\n'
    + '112,"Nov 2, 2025, 6:00:00 PM",Soir,Weight Training,3600,0,,0,0,\n'
    + '113,"Nov 3, 2025, 6:00:00 PM",Soir,Kitesurf deluxe,3600,0,,0,0,\n';
  const p = M.parse(csv, { now: NOW });
  assert.equal(p.format, "strava_csv");
  assert.deepEqual(p.rows[0].item, { id: "strava-111", sport: "running", startedAt: "2025-11-01T07:42:13.000Z", minutes: 48.3, km: 10.021, note: "Easy" });
  assert.equal(p.rows[1].item.sport, "muscu_gym");
  assert.equal(p.rows[1].item.minutes, 60, "elapsed time when moving time is 0");
  assert.equal(p.rows[2].reason, "unknown_sport");
});

test("TITAN export, CSV: the journal export of the website reads back to the same values (labels, units, note, feeling, archives)", () => {
  const logs = [
    { id: "1", client_event_id: "aaaaaaaa-0000-0000-0000-000000000001", syncStatus: "confirmed", sport: "running", date: "2025-01-02T07:30:17+00:00", val: 10.4, unit: "km", details: { duration: 52, note: "=1+1 piège", bio: { rpe: 6 } } },
    { id: "2", client_event_id: "bbbbbbbb-0000-0000-0000-000000000002", syncStatus: "confirmed", sport: "muscu_gym", date: "2025-01-03T18:00:00+00:00", val: 4250, unit: "kg", details: { duration: 60, note: "Jambes; « dos »" } },
    { id: "3", client_event_id: "cccccccc-0000-0000-0000-000000000003", syncStatus: "confirmed", sport: "swimming", date: "2025-01-04T12:00:00+00:00", val: 1500, unit: "m", details: { duration: 40 } },
    { id: "4", client_event_id: "dddddddd-0000-0000-0000-000000000004", syncStatus: "confirmed", sport: "running", date: "2025-01-05T07:00:00+00:00", val: 5, unit: "km", details: { duration: 30 }, archived_at: "2025-02-01T00:00:00Z" },
    { id: "5", client_event_id: "eeeeeeee-0000-0000-0000-000000000005", syncStatus: "confirmed", sport: "pompes", date: "2025-01-06T07:00:00+00:00", val: 120, unit: "reps", details: { duration: 15 } },
  ];
  globalThis.document = { getElementById: () => null };
  globalThis.window ??= globalThis;
  const { csv } = require("../js/session-export.js");
  delete globalThis.document;
  const text = csv(logs);
  assert.equal(M.detect(text), "titan_csv");
  const p = M.parse(text, { now: NOW });
  const it = p.rows.map((r) => r.item || r.reason);
  assert.deepEqual(it[0], { id: "titan-aaaaaaaa-1735803017", sport: "running", startedAt: "2025-01-02T07:30:17.000Z", minutes: 52, km: 10.4, rpe: 6, note: "=1+1 piège" });
  assert.deepEqual(it[1], { id: "titan-bbbbbbbb-1735927200", sport: "muscu_gym", startedAt: "2025-01-03T18:00:00.000Z", minutes: 60, km: null, value: 4250, unit: "kg", note: "Jambes; « dos »" });
  assert.equal(it[2].km, 1.5);
  assert.equal(it[3], "archived_in_export");
  assert.deepEqual([it[4].value, it[4].unit, it[4].minutes], [120, "reps", 15]);
  // The JSON export carries the same sessions: same items, same ids.
  const j = M.parse(JSON.stringify({ trainingLogs: logs }), { now: NOW });
  assert.equal(j.format, "titan_json");
  assert.deepEqual(j.rows.map((r) => r.item || r.reason), it);
});

test("the list of exported and reimported fields matches the TITAN CSV columns", () => {
  const cols = M.FIELDS.map((f) => f.column).filter(Boolean);
  assert.deepEqual(cols, L.CSV_HEAD, "every column of the export is documented");
  assert.deepEqual(M.FIELDS.filter((f) => f.reimport === true).map((f) => f.column), ["Date", "Sport", "Valeur", "Unité", "Durée (min)", "Ressenti (1–10)", "Note"]);
});

test("preview: a session already in the journal is linked, a far duration is to review, a repeated effort in the file is linked", () => {
  const journal = [
    { id: "j1", client_event_id: "j1", sport: "running", date: "2024-03-12T06:17:00Z", val: 10.4, unit: "km", details: { duration: 52 }, created_at: "2024-03-12T09:00:00Z" },
    { id: "j2", client_event_id: "j2", sport: "cycling", date: "2024-03-13T06:00:00Z", val: 40, unit: "km", details: { duration: 150 }, created_at: "2024-03-13T09:00:00Z" },
  ];
  const csv = ["identifiant;date;heure;sport;durée;distance;unité", "r1;12/03/2024;07:15;Course à pied;52;10,4;km", "r2;13/03/2024;07:00;Vélo;90;40;km",
    "r3;14/03/2024;07:00;Course à pied;45;9;km", "r4;14/03/2024;07:05;Course à pied;44;9;km", "r5;14/03/2024;18:00;Course à pied;45;9;km"].join("\n");
  const p = M.preview(M.parse(csv, { now: NOW }), journal);
  assert.deepEqual(p.rows.map((r) => r.plan), ["link", "review", "add", "link", "add"]);
  assert.equal(p.rows[0].with.id, "j1");
  assert.ok(p.rows[3].with.inFile, "linked to the row above in the same file");
  assert.deepEqual(p.counts, { add: 2, link: 2, review: 1, skip: 0, total: 5 });
});

test("batches: the same file has the same hash whatever its line ends; chunks resume from the row the server expects", () => {
  const a = "date;heure;sport;durée\r\n12/03/2024;07:15;Course à pied;30\r\n";
  assert.equal(M.fileHash(a), M.fileHash(a.replace(/\r\n/g, "\n")));
  assert.equal(M.fileHash("﻿" + a), M.fileHash(a));
  assert.notEqual(M.fileHash(a), M.fileHash(a + "13/03/2024;07:15;Course à pied;30\n"));
  assert.match(M.fileHash(a), /^[0-9a-f]{16}$/);
  const lines = ["date;heure;sport;durée", ...Array.from({ length: 250 }, (_, i) => `${String((i % 28) + 1).padStart(2, "0")}/0${(i % 9) + 1}/2023;0${i % 10}:00;Course à pied;${i % 2 ? 30 : 0}`)];
  const p = M.parse(lines.join("\n"), { now: NOW });
  const all = M.chunks(p);
  assert.deepEqual(all.map((c) => c.length), [100, 100, 50]);
  assert.equal(all[0][0].row, 2);
  assert.ok(all[0].some((x) => x.skip === "invalid_duration"), "skipped rows are sent with their reason");
  const rest = M.chunks(p, 150);
  assert.equal(rest[0][0].row, 150);
  assert.equal(rest.flat().length, 251 - 150 + 1, "rows 150 to 251");
});

test("the reasons the client sends are exactly the ones the server accepts; the measure and the withdrawal words", () => {
  const list = /v_client_reasons constant text\[\] := array\[([^\]]+)\]/.exec(SQL)[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
  const clientOnly = Object.keys(M.REASONS).filter((k) => !k.startsWith("server_"));
  assert.deepEqual([...list].sort(), [...clientOnly].sort());
  assert.deepEqual(M.measure({ total_rows: 10, counts: { added: 5, linked: 2, duplicate: 1, skipped: 2, review: 1 }, created_at: "2026-11-23T10:00:00Z", finished_at: "2026-11-23T10:00:42Z" }),
    { total: 10, explained: 10, rate: 100, duplicates: 3, review: 1, seconds: 42 });
  assert.deepEqual(M.withdrawText({ remove: 3, detach: 1, kept_corrected: 1 }), [
    "3 séances ajoutées par ce lot retirées du journal.",
    "1 lien vers des séances déjà au journal défait : ces séances restent telles quelles.",
    "1 séance que tu as corrigée ou archivée depuis l’import : gardée.",
  ]);
  assert.match(M.withdrawText({})[0], /rien ajouté/);
});
