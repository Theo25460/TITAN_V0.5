#!/usr/bin/env node
// V1.6.4 — Migration de l’historique: the exit proofs on a disposable PostgreSQL built from the repository (tools/db/test-migrations.sh).
// The real client modules (js/core/history-migration.js, history-ledger.js, session-match.js) read the files; the real RPCs import them.
//   P1. 5 000 synthetic rows (documented CSV profile: units km / m / mi, four duration notations, Europe/Paris times with the two
//       summer-time changes, invalid rows, recent rows, an unknown sport classified by the athlete, another left out, repeated ids,
//       40 efforts already in the journal) imported with the daily history budget (300 a day, simulated days), a restart from another
//       device and a lost answer; the per-row result read back from the server matches the expected result of every row.
//   P2. Reimports keep the same totals: same file (the finished batch is found), same rows in another file (all « already imported »),
//       the TITAN CSV export of the resulting journal (all linked to their own session).
//   P3. Withdrawals: a batch of links only, a batch of duplicates, then the main batch after 25 corrections — the sessions already in the
//       journal and the corrected ones are unchanged, everything else the batch added is gone.
//   P4. The TITAN export (CSV and JSON) of a test account reimported into two isolated accounts reproduces the covered fields.
// Usage: node tools/db/test-history-migration.mjs <psql arguments of a titan_test_ database>
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const PSQL = process.argv.slice(2);
if (!PSQL.length) throw new Error("usage: test-history-migration.mjs <psql args>");
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
for (const f of ["format.js", "../training-store.js", "effort.js", "sports-catalog.js", "sports.js", "sport-contracts.js", "../sport-insights.js", "progress.js", "sync-state.js", "session-match.js", "history-ledger.js"]) require(`../../js/core/${f}`);
const M = require("../../js/core/history-migration.js");
const L = globalThis.TitanLedger;
const S = globalThis.TitanSports;
// The very export function of the website (js/session-export.js); it only needs a page to bind its button, absent here.
globalThis.document = { getElementById: () => null };
const { csv: exportCsv } = require("../../js/session-export.js");
delete globalThis.document;

function sql(text) {
  const r = spawnSync(PSQL[0], [...PSQL.slice(1), "-qAt", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status) throw new Error(r.stderr || `psql exited ${r.status}`);
  return r.stdout.trim();
}
if (!sql("select current_database()").startsWith("titan_test_")) { console.log("Refused: the history migration proof requires a titan_test_ disposable database"); process.exit(1); }
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const jlit = (v) => `$j$${JSON.stringify(v)}$j$::jsonb`;
/** One statement with the athlete's identity, as the API runs it (role authenticated, JWT claims). */
function as(uid, statement) {
  return sql(`set role authenticated;\nselect set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: uid, role: "authenticated" }))}, false) \\gset\n${statement};`);
}
const asJson = (uid, statement) => JSON.parse(as(uid, statement) || "null");
const accounts = [];
function account() {
  const id = sql("select gen_random_uuid()");
  accounts.push(id);
  sql(`insert into auth.users(id, raw_user_meta_data) values (${lit(id)}, '{}'); update public.profiles set created_at = now() - interval '3000 days' where id = ${lit(id)};`);
  return id;
}
/** « The next day »: the daily history budget and the hourly call budgets are what the clock would have released. */
let simulatedDays = 0;
function nextDay(uid) {
  simulatedDays++;
  sql(`set session_replication_role = replica;
    update public.training_logs set created_at = created_at - interval '25 hours' where user_id = ${lit(uid)};
    update private.titan_training_rate_state set times = '{}' where user_id = ${lit(uid)};
    delete from private.titan_rate_events where user_id = ${lit(uid)};`);
}
const nextHour = (uid) => sql(`delete from private.titan_rate_events where user_id = ${lit(uid)};`);
// created_at is left out: the simulated days move it back (nothing else touches it).
const journal = (uid) => JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(l) - 'created_at' order by l.date), '[]') from public.training_logs l where l.user_id = ${lit(uid)}`));
function totals(uid) {
  const r = JSON.parse(sql(`select jsonb_build_object('sessions', count(*), 'minutes', coalesce(round(sum(public.titan_numeric_from_json(details, 'duration')), 1), 0),
    'km', coalesce(round(sum(case unit when 'km' then val when 'm' then val / 1000 end), 3), 0), 'xp', coalesce(sum(xp), 0))
    from public.training_logs where user_id = ${lit(uid)} and archived_at is null`));
  return { sessions: Number(r.sessions), minutes: Number(r.minutes), km: Number(r.km), xp: Number(r.xp) };
}

/** Import a parsed file as the athlete's client does: open (or resume) the batch, send chunks from the row it expects, wait a day
    when the budget is reached. Options: crashAfter (restart from the server state after that many calls), replayAt (send that
    call twice, as after a lost answer). */
function importFile(uid, parsed, text, { name = "file.csv", crashAfter = 0, replayAt = 0 } = {}) {
  const t0 = Date.now();
  const hash = M.fileHash(text);
  let b = asJson(uid, `select public.titan_import_batch_open_v1(${lit(parsed.format)}, ${lit(hash)}, ${parsed.total}, ${lit(name)})`);
  const log = { calls: 0, limited: 0, restarted: false, replayed: 0, resumed: !!b.resumed, startDays: simulatedDays };
  let crashed = false;
  while (b.status === "open") {
    const list = M.chunks(parsed, b.next_row);
    if (!list.length) break;
    let restart = false;
    for (const items of list) {
      const r = asJson(uid, `select public.titan_import_batch_rows_v1(${lit(b.id)}, ${jlit(items)})`);
      log.calls++;
      if (log.calls % 50 === 0) nextHour(uid);
      if (replayAt && log.calls === replayAt) {
        const again = asJson(uid, `select public.titan_import_batch_rows_v1(${lit(b.id)}, ${jlit(items)})`);
        log.calls++;
        assert.equal(again.processed, 0, "a replayed call processes nothing");
        assert.deepEqual(again.counts, r.counts, "a replayed call changes no count");
        log.replayed = again.replayed;
      }
      b = r;
      if (r.limited || r.busy) { if (r.limited) { log.limited++; nextDay(uid); } restart = true; break; }
      if (crashAfter && !crashed && log.calls >= crashAfter) {
        // The app is killed: what is left is only the file and the server. Opening the same file again resumes the batch.
        crashed = true;
        const again = asJson(uid, `select public.titan_import_batch_open_v1(${lit(parsed.format)}, ${lit(hash)}, ${parsed.total}, ${lit(name)})`);
        assert.ok(again.resumed && again.id === b.id, "the same file resumes the same batch");
        log.restarted = true;
        b = again;
        restart = true;
        break;
      }
    }
    if (!restart) break;
  }
  log.ms = Date.now() - t0;
  log.days = simulatedDays - log.startDays;
  return { batch: b, log };
}
function reportRows(uid, batchId) {
  const out = [];
  for (let offset = 0; ; offset += 500) {
    const page = asJson(uid, `select public.titan_import_batch_v1(${lit(batchId)}, null, ${offset}, 500)`);
    out.push(...page.rows);
    if (page.rows.length < 500) return { batch: page, rows: out };
  }
}

/* ---------- independent ground truth (not the parser's code) ---------- */
let seed = 20261123;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
/** Paris wall time → instant, by brute force over whole quarter-hour offsets (independent of M.zonedToUtc). */
function parisInstant(y, mo, d, h, mi) {
  const wall = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  const hits = [];
  for (let off = -14 * 60; off <= 14 * 60; off += 15) {
    const t = Date.UTC(y, mo, d, h, mi) - off * 60000;
    if (new Date(t).toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 16) === wall) hits.push(t);
  }
  if (hits.length) return Math.min(...hits);
  return parisInstant(y, mo, d, h + 1, mi); // skipped hour: the next valid wall time
}
const NOW = Date.now();
const DAY = 86400000;
const SPORTS = [["running", 35, "km"], ["muscu_gym", 20, null], ["cycling", 15, "km"], ["swimming", 10, "m"], ["trail", 5, "mi"], ["yoga", 5, null], ["Zumba X", 3, null], ["Sport mystère", 2, null], ["hiking", 5, "km"]];
const LABEL = { running: "Course à pied", muscu_gym: "Musculation en salle", cycling: "Vélo", swimming: "Natation", trail: "Trail", yoga: "Yoga", hiking: "Randonnée" };
function sportOf(r) { let acc = 0; for (const [id, w] of SPORTS) { acc += w; if (r * 100 < acc) return id; } return "running"; }
const dmy = (y, mo, d) => `${String(d).padStart(2, "0")}/${String(mo + 1).padStart(2, "0")}/${y}`;
function durationText(min) {
  const k = pick([0, 1, 2, 3]);
  const h = Math.floor(min / 60), m = min % 60;
  return k === 0 ? String(min) : k === 1 ? `${min} min` : k === 2 ? `${h}:${String(m).padStart(2, "0")}:00` : `${h}h${String(m).padStart(2, "0")}`;
}
const frNum = (n) => String(n).replace(".", pick([",", "."]));
// The last Sundays of March and October: wall times 02:30 that do not exist / exist twice in Paris.
const DST = [[2025, 2, 30, "gap"], [2024, 9, 27, "repeated"], [2023, 2, 26, "gap"], [2022, 9, 30, "repeated"]];

function synthetic(n = 5000) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const back = 40 + Math.floor(i * 0.37);
    const day = new Date(NOW - back * DAY);
    let y = day.getUTCFullYear(), mo = day.getUTCMonth(), d = day.getUTCDate();
    let h = 6 + (i % 3) * 5, mi = Math.floor(rnd() * 50);
    let dst = null;
    if (i < DST.length * 2 && i % 2 === 0) { [y, mo, d, dst] = DST[i / 2]; h = 2; mi = 30; }
    const sport = sportOf(rnd());
    const minutes = 20 + Math.floor(rnd() * 100);
    const unit = SPORTS.find((s) => s[0] === sport)[2];
    const r = { id: `act-${i}`, date: dmy(y, mo, d), time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`, sport: LABEL[sport] || sport, duration: durationText(minutes), distance: "", unit: "", rpe: "", note: "" };
    let expect = { outcome: "added", sport: sport === "Zumba X" ? "dance" : sport, start: parisInstant(y, mo, d, h, mi), minutes, km: null, dst };
    if (unit === "km") { const km = Math.round((3 + rnd() * 30) * 100) / 100; r.distance = frNum(km); r.unit = "km"; expect.km = km; }
    if (unit === "m") { const m = 500 + Math.floor(rnd() * 3000); r.distance = String(m); r.unit = "m"; expect.km = m / 1000; }
    if (unit === "mi") { const mi2 = Math.round((2 + rnd() * 15) * 100) / 100; r.distance = frNum(mi2); r.unit = "mi"; expect.km = Math.round(mi2 * 1.609344 * 1000) / 1000; }
    if (rnd() < 0.3) r.rpe = String(1 + Math.floor(rnd() * 10));
    if (rnd() < 0.2) r.note = pick(["Sortie longue", "Fractionné; 10 x 400", "- récup", "Avec \"Léa\"", "Jambes\nlourdes"]);
    if (sport === "Sport mystère") expect = { outcome: "skipped", reason: "unknown_sport" };
    // Invalid or out-of-scope rows, each with the reason the athlete will read.
    const roll = rnd();
    if (expect.outcome === "added") {
      if (roll < 0.01) { r.date = "31/02/2023"; expect = { outcome: "skipped", reason: "invalid_date" }; }
      else if (roll < 0.02) { r.time = ""; expect = { outcome: "skipped", reason: "missing_time" }; }
      else if (roll < 0.025) { r.duration = "0"; expect = { outcome: "skipped", reason: "invalid_duration" }; }
      else if (roll < 0.03 && r.distance) { r.distance = "-3"; expect = { outcome: "skipped", reason: "invalid_distance" }; }
      else if (roll < 0.035 && r.distance) { r.distance = "beaucoup"; expect = { outcome: "skipped", reason: "invalid_distance" }; }
      else if (roll < 0.045) { const t = new Date(NOW - (2 + Math.floor(rnd() * 25)) * DAY); r.date = dmy(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); r.time = "09:00"; expect = { outcome: "skipped", reason: "recent" }; }
      else if (roll < 0.05 && i > 0 && rows[i - 1].expect.outcome === "added") { r.id = rows[i - 1].csv.id; expect = { outcome: "skipped", reason: "duplicate_in_file" }; }
    }
    rows.push({ csv: r, expect });
  }
  return rows;
}
const results = [];
const ok = (label, detail = "") => { results.push(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`); console.log(results.at(-1)); };

/* ================= P1 ================= */
console.log("P1 · 5 000 synthetic rows, CSV profile « TITAN historique v1 »");
const C = account();
const rows = synthetic(5000);
// 40 efforts already in the athlete's journal (typed by hand 2 minutes later), 10 of them with a duration far from the file's.
const already = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.expect.outcome === "added" && !r.expect.dst && ["running", "cycling", "yoga", "hiking"].includes(r.expect.sport)).filter((_, k) => k % 37 === 0).slice(0, 40);
assert.equal(already.length, 40);
const typedIds = [];
for (const [k, { r }] of already.entries()) {
  const e = r.expect;
  const minutes = k < 10 ? Math.round(e.minutes * 1.6) : e.minutes;
  const unit = e.km ? "km" : "min";
  const val = e.km ? e.km : minutes;
  const out = asJson(C, `select to_jsonb(s) from public.titan_submit_training_session(${lit(e.sport)}, 'training', ${val}, ${lit(unit)}, ${jlit({ duration: minutes, note: `Saisie ${k}` })}, ${lit(new Date(e.start + 2 * 60000).toISOString())}) s`);
  typedIds.push(out.log_id);
  r.expect = { ...e, outcome: "linked", review: k < 10, with: out.log_id };
}
const typedBefore = JSON.stringify(journal(C).filter((l) => typedIds.includes(l.id)));
const text = M.profileCsv(rows.map((r) => r.csv));
const parsed = M.parse(text, { now: NOW, sportMap: { "Zumba X": "dance" } });
assert.equal(parsed.total, 5000);
assert.deepEqual(Object.keys(parsed.unknownSports), ["Sport mystère"], "the only sport left to classify");
// Parser vs ground truth, row by row: instant (summer-time changes included), sport, minutes, km, reason.
let parseGaps = 0;
for (const [i, r] of rows.entries()) {
  const p = parsed.rows[i];
  const e = r.expect;
  if (e.outcome === "skipped") { if (p.status !== "skip" || p.reason !== e.reason) parseGaps++; continue; }
  if (p.status !== "ready" || p.item.sport !== e.sport || Date.parse(p.item.startedAt) !== e.start || Math.abs(p.item.minutes - e.minutes) > 0.05
      || (e.km === null ? p.item.km !== null : Math.abs(p.item.km - e.km) > 0.0005)) { parseGaps++; if (parseGaps < 4) console.log("    gap", i, JSON.stringify(r), JSON.stringify(p)); }
}
assert.equal(parseGaps, 0, "every row read as the ground truth says");
ok("lecture des 5 000 lignes conforme à la vérité terrain", `0 écart (unités km/m/mi, 4 notations de durée, ${DST.length} heures d’été/hiver, ${rows.filter((r) => r.expect.outcome === "skipped").length} lignes à écarter)`);
// Preview against the journal this device holds.
const pv = M.preview(parsed, journal(C));
const expected = { added: rows.filter((r) => r.expect.outcome === "added").length, linked: 40, review: 10, skipped: rows.filter((r) => r.expect.outcome === "skipped").length };
assert.equal(pv.counts.add, expected.added, "preview: added");
assert.equal(pv.counts.link + pv.counts.review, 40, "preview: linked");
assert.equal(pv.counts.review, 10, "preview: to review");
ok("aperçu", `${pv.counts.add} à ajouter · ${pv.counts.link} déjà au journal · ${pv.counts.review} à vérifier · ${pv.counts.skip} ignorées`);
const before = totals(C);
const t0 = Date.now();
const run = importFile(C, parsed, text, { name: "historique-5000.csv", crashAfter: 12, replayAt: 20 });
const reportMs = Date.now() - t0;
assert.equal(run.batch.status, "done");
assert.ok(run.log.restarted && run.log.replayed === 100, "restart and lost answer exercised");
const rep = reportRows(C, run.batch.id);
assert.equal(rep.rows.length, 5000, "one result per row");
let outcomeGaps = 0;
for (const [i, r] of rows.entries()) {
  const got = rep.rows[i];
  const e = r.expect;
  const bad = got.row !== parsed.rows[i].row || got.outcome !== e.outcome || (e.reason && got.reason !== e.reason) || (e.with && got.log_id !== e.with) || (e.outcome === "linked" && got.needs_review !== !!e.review);
  if (bad) { outcomeGaps++; if (outcomeGaps < 4) console.log("    outcome gap", i, JSON.stringify(e), JSON.stringify(got)); }
}
assert.equal(outcomeGaps, 0, "the server result of every row is the expected one");
const after = totals(C);
const addedRows = rows.filter((r) => r.expect.outcome === "added");
const exp = {
  sessions: before.sessions + addedRows.length,
  minutes: Math.round((before.minutes + addedRows.reduce((s, r) => s + r.expect.minutes, 0)) * 10) / 10,
  km: Math.round((before.km + addedRows.reduce((s, r) => s + (r.expect.km || 0), 0)) * 1000) / 1000,
  xp: before.xp,
};
assert.equal(after.sessions, exp.sessions, "sessions");
assert.equal(after.minutes, exp.minutes, "minutes");
assert.ok(Math.abs(after.km - exp.km) < 0.01, `km ${after.km} vs ${exp.km}`);
assert.equal(after.xp, before.xp, "history gives no XP");
assert.equal(JSON.stringify(journal(C).filter((l) => typedIds.includes(l.id))), typedBefore, "the 40 sessions already in the journal are unchanged");
const m1 = M.measure(rep.batch);
assert.equal(m1.rate, 100);
ok("import du lot", `${rep.batch.counts.added} ajoutées · ${rep.batch.counts.linked} associées (dont ${rep.batch.counts.review} à vérifier) · ${rep.batch.counts.skipped} ignorées avec motif · 0 écart ligne à ligne`);
ok("reprise", `${run.log.calls} appels de 100 lignes, ${run.log.limited} arrêts sur le budget quotidien (300 séances d’historique par jour) donc ${run.log.days} jours simulés, 1 redémarrage repris à la ligne attendue, 1 réponse perdue rejouée (100 lignes « déjà traitées », 0 traitée)`);
ok("totaux", `${before.sessions} → ${after.sessions} séances, ${after.minutes} min, ${after.km} km, XP inchangée (${after.xp}) — égaux aux totaux attendus`);
ok("mesure", `${m1.rate} % des lignes importées ou expliquées · ${m1.duplicates} doublons évités · ${(reportMs / 1000).toFixed(1)} s de calcul jusqu’au rapport final (hors attente du budget quotidien)`);
const byReason = Object.entries(rep.batch.reasons).map(([k, v]) => `${k} ${v}`).join(", ");
ok("motifs du rapport", byReason);

/* ================= P2 ================= */
console.log("P2 · Reimports keep the same totals");
nextDay(C);
const same = importFile(C, parsed, text, { name: "historique-5000.csv" });
assert.ok(same.log.resumed && same.batch.status === "done" && same.batch.id === run.batch.id && same.log.calls === 0);
assert.deepEqual(totals(C), after);
ok("même fichier", "le lot terminé est retrouvé, 0 ligne renvoyée, totaux identiques");
// The same rows in another file: other column order, « , » and CRLF.
const cols = ["note", "sport", "identifiant", "durée", "date", "unité", "distance", "heure", "ressenti"];
const keyOf = { identifiant: "id", date: "date", heure: "time", sport: "sport", "durée": "duration", distance: "distance", "unité": "unit", ressenti: "rpe", note: "note" };
const cell = (v) => { const t = String(v ?? ""); return /[,"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const text2 = [cols, ...rows.map((r) => cols.map((c) => r.csv[keyOf[c]]))].map((r) => r.map(cell).join(",")).join("\r\n");
const parsed2 = M.parse(text2, { now: NOW, sportMap: { "Zumba X": "dance" } });
const re2 = importFile(C, parsed2, text2, { name: "historique-5000-bis.csv" });
assert.equal(re2.batch.status, "done");
assert.equal(re2.batch.counts.added, 0, "nothing added by a reimport");
assert.equal(re2.batch.counts.duplicate, rep.batch.counts.added + rep.batch.counts.linked);
assert.deepEqual(totals(C), after);
ok("mêmes lignes, autre fichier", `${re2.batch.counts.duplicate} déjà importées, ${re2.batch.counts.skipped} ignorées, 0 ajoutée, totaux identiques`);
// The TITAN export of the resulting journal, imported back into the same account.
nextHour(C);
const exported = exportCsv(journal(C).map((l) => ({ ...l, syncStatus: "confirmed" })));
const parsed3 = M.parse(exported, { now: NOW });
assert.equal(parsed3.format, "titan_csv");
const re3 = importFile(C, parsed3, exported, { name: "titan-journal.csv" });
assert.equal(re3.batch.counts.added, 0);
assert.deepEqual(totals(C), after);
ok("export TITAN du journal réimporté", `${parsed3.total} lignes : ${re3.batch.counts.linked} associées à leur propre séance, ${re3.batch.counts.skipped} ignorées, 0 ajoutée, totaux identiques`);

/* ================= P3 ================= */
console.log("P3 · Withdrawals");
nextHour(C);
let w = asJson(C, `select public.titan_import_batch_withdraw_v1(${lit(re3.batch.id)}, true)`);
assert.equal(w.effects.remove, 0);
assert.equal(w.effects.detach, re3.batch.counts.linked);
assert.deepEqual(totals(C), after);
ok("retrait d’un lot de liens", `${w.effects.detach} liens défaits, 0 séance retirée, totaux identiques`);
w = asJson(C, `select public.titan_import_batch_withdraw_v1(${lit(re2.batch.id)}, true)`);
assert.equal(w.effects.remove + w.effects.detach, 0);
assert.deepEqual(totals(C), after);
ok("retrait d’un lot de doublons", "rien à retirer, totaux identiques");
// The athlete corrects 25 imported sessions after the import, then withdraws the main batch.
const added = rep.rows.filter((r) => r.outcome === "added").slice(0, 25);
for (const r of added) {
  const l = JSON.parse(sql(`select to_jsonb(l) from public.training_logs l where id = ${lit(r.log_id)}`));
  as(C, `select public.titan_update_training_session(${lit(l.id)}, ${l.revision}, '{"duration": 33}'::jsonb)`);
}
const kept = JSON.parse(sql(`select jsonb_agg(to_jsonb(l) - 'created_at' order by l.id) from public.training_logs l where id in (${added.map((r) => lit(r.log_id)).join(",")})`));
const preview = asJson(C, `select public.titan_import_batch_withdraw_v1(${lit(run.batch.id)}, false)`);
assert.equal(preview.effects.remove, rep.batch.counts.added - 25);
assert.equal(preview.effects.kept_corrected, 25);
assert.equal(preview.effects.detach, 40);
assert.deepEqual(journal(C).length, after.sessions, "the preview changes nothing");
const tw = Date.now();
w = asJson(C, `select public.titan_import_batch_withdraw_v1(${lit(run.batch.id)}, true)`);
const withdrawMs = Date.now() - tw;
assert.deepEqual(w.effects, preview.effects, "applied as previewed");
const left = journal(C);
assert.equal(left.length, 40 + 25, "only the typed sessions and the corrected ones remain");
assert.equal(JSON.stringify(left.filter((l) => typedIds.includes(l.id))), typedBefore, "the sessions already in the journal are unchanged");
assert.equal(JSON.stringify(left.filter((l) => !typedIds.includes(l.id)).sort((a, b) => (a.id < b.id ? -1 : 1))), JSON.stringify(kept), "the corrected sessions are kept with their correction");
assert.equal(Number(sql(`select count(*) from public.training_receipts where user_id = ${lit(C)}`)), 40 + 25, "receipts of removed sessions removed");
ok("retrait du lot principal", `aperçu = effet : ${w.effects.remove} séances retirées, ${w.effects.detach} liens défaits, ${w.effects.kept_corrected} corrigées après import gardées, 40 séances déjà présentes identiques, en ${(withdrawMs / 1000).toFixed(1)} s`);

/* ================= P4 ================= */
console.log("P4 · TITAN export reimported into isolated accounts");
const A = account();
const specs = [];
for (let i = 0; i < 240; i++) {
  const sport = ["running", "swimming", "muscu_gym", "pompes", "yoga", "cycling"][i % 6];
  const unit = S.unitOf(sport);
  const when = new Date(NOW - (45 + i * 3) * DAY + (i % 5) * 3600000 + 17 * 1000).toISOString();
  const minutes = 25 + (i % 70);
  const val = unit === "km" ? Math.round((4 + (i % 30) + 0.37) * 100) / 100 : unit === "m" ? 800 + i * 5 : unit === "kg" ? 1500 + i * 10 : unit === "reps" ? 40 + i : minutes;
  const details = { duration: minutes };
  if (i % 3 === 0) details.note = i % 9 === 0 ? `=SOMME(A1) piège ${i}` : `Note ${i}; « guillemets » "x"`;
  if (i % 4 === 0) details.bio = { rpe: 1 + (i % 10) };
  specs.push({ sport, unit, when, val, details });
}
for (const s of specs) as(A, `select public.titan_submit_training_session(${lit(s.sport)}, 'training', ${s.val}, ${lit(s.unit)}, ${jlit(s.details)}, ${lit(s.when)})`);
nextDay(A);
const arch = JSON.parse(sql(`select to_jsonb(l) from public.training_logs l where user_id = ${lit(A)} order by date limit 1`));
as(A, `select public.titan_update_training_session(${lit(arch.id)}, ${arch.revision}, '{"archived": true}'::jsonb)`);
as(A, `select public.titan_submit_training_session('running', 'training', 5, 'km', '{"duration": 30}'::jsonb, now() - interval '3 days')`);
const exportJson = asJson(A, "select public.export_own_data()");
const sourceRows = exportJson.trainingLogs;
const csvText = exportCsv(sourceRows.map((l) => ({ ...l, syncStatus: "confirmed" })));
const jsonText = JSON.stringify(exportJson);
const reproduce = (uid, label) => {
  const target = journal(uid);
  const fields = { date: 0, sport: 0, val: 0, unit: 0, duration: 0, rpe: 0, note: 0 };
  let matched = 0;
  const expectedRows = sourceRows.filter((l) => !l.archived_at && Date.parse(l.date) < NOW - 30 * DAY);
  for (const s of expectedRows) {
    const t = target.find((x) => Date.parse(x.date) === Date.parse(s.date) && x.sport === s.sport);
    if (!t) continue;
    matched++;
    if (Date.parse(t.date) === Date.parse(s.date)) fields.date++;
    if (t.sport === s.sport) fields.sport++;
    if (Number(t.val) === Number(s.val)) fields.val++;
    if (t.unit === s.unit) fields.unit++;
    if (Number(t.details?.duration) === Number(s.details?.duration)) fields.duration++;
    if ((t.details?.bio?.rpe ?? null) === (s.details?.bio?.rpe ?? null)) fields.rpe++;
    if ((t.details?.note || "") === (s.details?.note || "")) fields.note++;
  }
  for (const [k, v] of Object.entries(fields)) assert.equal(v, expectedRows.length, `${label}: field ${k} reproduced ${v}/${expectedRows.length}`);
  assert.equal(matched, expectedRows.length);
  assert.equal(target.length, expectedRows.length, `${label}: nothing more`);
  assert.equal(target.reduce((s, l) => s + Number(l.xp || 0), 0), 0, `${label}: history, 0 XP`);
  return { matched, of: sourceRows.length, fields };
};
for (const [fmtText, label] of [[csvText, "CSV"], [jsonText, "JSON"]]) {
  const B = account();
  const p = M.parse(fmtText, { now: NOW });
  const res = importFile(B, p, fmtText, { name: `titan-export.${label.toLowerCase()}` });
  const proof = reproduce(B, label);
  const reasons = Object.entries(res.batch.reasons).map(([k, v]) => `${k} ${v}`).join(", ");
  ok(`export TITAN ${label} → compte isolé`, `${proof.matched}/${proof.of} séances recréées (${reasons}) ; champs identiques : ${Object.entries(proof.fields).map(([k, v]) => `${k} ${v}/${proof.matched}`).join(", ")}`);
}

/* Clean up: the accounts and everything they hold go (on delete cascade), as an account deletion would. */
sql(`delete from auth.users where id in (${accounts.map(lit).join(",")})`);
console.log(`History migration proofs: ${results.length} checks passed.`);
