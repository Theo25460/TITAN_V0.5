// V1.6.6 — Journal longue durée: control of the aggregates against a reference calculation, on the 10 000-session profile.
// Two devices of the same account (A: the website copy, B: the Android copy; both run the same js/core/history-window.js over the
// real supabase-js against the in-memory PostgREST) follow a scenario of mutations made on the server: correction of an old ride
// (elevation and duration), archives and a restore, two devices correcting at the same time (and the same session: a conflict, never a
// silent overwrite), changes the devices did not make (a bulk archive that moves only archived_at, a review status, a withdrawn import
// batch that deletes rows), a cache cleared and a reading cut after its first page, then resumed.
// After each step, for each device: the yearly totals (sessions, minutes, km) and the records of the views (TitanLedger.controls, the
// V1.6.3 matrix) are compared with a reference computed independently from the server rows by plain code that does not use the app's
// modules; a year the copy does not cover must be flagged partial (TitanHistoryWindow.covers), never shown as a complete total.
// Usage: node tools/journal-profile/reference-check.mjs [--out docs/v166/reference-aggregates.json]
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generate, OWNER, NOW } from "./dataset.mjs";
import { query } from "./fake-postgrest.mjs";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
for (const f of ["core/format.js", "training-store.js", "core/effort.js", "core/sports-catalog.js", "core/sports.js", "core/sport-contracts.js", "sport-insights.js", "core/progress.js", "core/sync-state.js", "core/history-ledger.js", "core/history-window.js"]) require(`../../js/${f}`);
const { TitanLedger: L, TitanHistoryWindow: W } = globalThis;
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));

/* ---------- The server: rows, the correction RPC with its revision check, requests counted ---------- */
const { logs: seed, oldId } = generate();
const server = { rows: seed.map((l) => structuredClone(l)), requests: 0, cut: null };
function fetchOf(name) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const h = new Headers(init.headers || {});
    server.requests++;
    if (server.cut && server.cut(name, url)) throw new TypeError("Failed to fetch");
    const r = query(server.rows, url, { prefer: h.get("prefer") || "", range: h.get("range") || "" });
    return new Response(JSON.stringify(r.body), { status: 200, headers: { "content-type": "application/json", "content-range": r.contentRange } });
  };
}
function rpcUpdate(id, revision, patch) {
  const l = server.rows.find((x) => x.id === id);
  if (!l) throw new Error("SESSION_NOT_FOUND");
  if (l.revision !== revision) throw Object.assign(new Error("SESSION_VERSION_CONFLICT"), { code: "PT409" });
  if ("elevation" in patch) { if (patch.elevation === null) delete l.details.elevation; else l.details.elevation = patch.elevation; }
  if ("duration" in patch) l.details = { ...l.details, duration: patch.duration, val2: patch.duration };
  if ("val" in patch) l.val = patch.val;
  if ("archived" in patch) l.archived_at = patch.archived ? new Date(NOW - 3600000).toISOString() : null;
  l.revision += 1;
  return structuredClone(l);
}

/* ---------- A device: its copy, its coverage, the app's refresh and the app's own corrections ---------- */
function device(name) {
  const client = createClient("https://example.supabase.co", "anon", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchOf(name) } });
  const d = { name, rows: [], coverage: null, stats: null };
  d.refresh = async ({ onPage } = {}) => {
    const cached = d.coverage?.complete ? { rows: d.rows, coverage: d.coverage } : null;
    const started = d.rows;
    d.stats = null;
    const r = await W.refresh(client, OWNER, cached, { now: () => NOW, onPage: async (rows, cov) => { if (!d.coverage?.complete) { d.rows = W.reconcile(d.rows, rows, [], started); d.coverage = cov; } if (onPage) await onPage(rows, cov); } });
    d.rows = W.reconcile(d.rows, r.rows, r.removed, started);
    d.coverage = r.coverage;
    d.stats = r.stats;
    return r;
  };
  // What js/app/sessions.js update() does with the server answer: the returned row replaces the local one.
  d.correct = (id, patch) => {
    const mine = d.rows.find((l) => l.id === id);
    const row = rpcUpdate(id, mine.revision, patch);
    d.rows = W.reconcile(d.rows, d.rows.map((l) => (l.id === id ? row : l)), [], d.rows);
    return row;
  };
  d.clear = () => { d.rows = []; d.coverage = null; };
  return d;
}

/* ---------- Reference: plain code over the server rows, none of the app's modules ---------- */
const EXCLUDED = new Set(["rejected", "flagged", "pending_review"]);
const refCounted = (l) => !l.archived_at && !l.is_suspicious && !EXCLUDED.has(String(l.status || "")) && Date.parse(l.date) <= NOW + 600000;
const refMinutes = (l) => { for (const v of [l.details?.duration, l.details?.val2, l.unit === "min" ? l.val : null]) { const n = Number(v); if (v !== null && v !== undefined && v !== "" && n > 0) return n; } return 0; };
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const yearRange = (y) => [Date.parse(`${y}-01-01T00:00:00+01:00`), Date.parse(`${y + 1}-01-01T00:00:00+01:00`)];
function reference(rows) {
  const out = { years: {}, longest: {} };
  for (const y of [...YEARS, "all"]) out.years[y] = { sessions: 0, minutes: 0, km: 0 };
  for (const l of rows) {
    if (!refCounted(l)) continue;
    const t = Date.parse(l.date);
    const add = (k) => { out.years[k].sessions++; out.years[k].minutes += refMinutes(l); if (l.unit === "km" && Number(l.val) > 0) out.years[k].km += Number(l.val); };
    add("all");
    for (const y of YEARS) { const [a, b] = yearRange(y); if (t >= a && t < b) add(y); }
    // Longest distance of each sport among plausible measures (<= 1 000 km, <= 120 km/h).
    const km = Number(l.val), m = refMinutes(l);
    if (l.unit === "km" && km > 0 && km <= 1000 && !(m > 0 && km / (m / 60) > 120) && !(m > 1440)) {
      const best = out.longest[l.sport];
      if (!best || km > best.value) out.longest[l.sport] = { value: km, id: l.id };
    }
  }
  for (const k of Object.keys(out.years)) { out.years[k].minutes = Math.round(out.years[k].minutes); out.years[k].km = Math.round(out.years[k].km * 10) / 10; }
  return out;
}

/* ---------- What a device's views show, and the gap to the reference ---------- */
function views(d) {
  const rows = d.rows.map((l) => ({ ...l, cat: l.category, syncStatus: "confirmed" }));
  const years = {};
  for (const y of [...YEARS, "all"]) {
    const [from, to] = y === "all" ? [-Infinity, Infinity] : yearRange(y);
    const covered = W.covers(d.coverage, from);
    years[y] = covered ? L.controls(rows, { now: NOW, from, to }).period : { partial: true };
  }
  const recs = L.controls(rows, { now: NOW }).records.filter((r) => r.id.startsWith("distance:"));
  return { years, longest: Object.fromEntries(recs.map((r) => [r.id.slice(9), { value: r.value, ref: r.ref }])), covered: !!d.coverage?.complete };
}
function compare(step, d, notes = "") {
  const ref = reference(server.rows);
  const v = views(d);
  const gaps = [];
  let partialYears = 0;
  for (const y of Object.keys(ref.years)) {
    if (v.years[y].partial) { partialYears++; continue; }
    for (const k of ["sessions", "minutes", "km"]) if (Math.abs(v.years[y][k] - ref.years[y][k]) > 1e-9) gaps.push(`${y}.${k}: ${v.years[y][k]} au lieu de ${ref.years[y][k]}`);
  }
  // Records: only claimed by a complete copy (a partial copy says its records are those of the sessions it holds).
  if (v.covered) for (const [sport, r] of Object.entries(ref.longest)) {
    const got = v.longest[sport];
    if (!got || got.value !== r.value || got.ref !== L.reference(server.rows.find((x) => x.id === r.id))) gaps.push(`record distance ${sport}: ${JSON.stringify(got)} au lieu de ${r.value} (${r.id.slice(0, 8)})`);
  }
  const line = { step, device: d.name, rows: d.rows.length, complete: !!d.coverage?.complete, partialYears, gaps: gaps.length, details: gaps.slice(0, 5), all: v.years.all, refAll: ref.years.all, notes, refresh: d.stats };
  report.push(line);
  console.log(`${step.padEnd(44)} ${d.name}  ${String(d.rows.length).padStart(5)} lignes  ${line.complete ? "complet " : "partiel "} années partielles ${partialYears}  écarts ${gaps.length}${d.stats ? `  (${d.stats.mode}, ${d.stats.requests} requêtes, ${d.stats.read} lues)` : ""}`);
  return line;
}

const report = [];
const A = device("A (Web)"), B = device("B (Android)");
await A.refresh(); compare("S0 premier chargement", A);
await B.refresh(); compare("S0 premier chargement", B);

// S1: the old ride (Col du Galibier) corrected from A: elevation 1450 → 1650 m and duration; B refreshes by manifest.
const before = server.rows.find((l) => l.id === oldId);
const minutes0 = before.details.duration;
const fixed = A.correct(oldId, { elevation: 1650, duration: minutes0 - 5 });
assert.equal(fixed.details.elevation, 1650);
compare("S1 correction de la vieille sortie (A)", A, "dénivelé 1450 → 1650 m, durée −5 min");
await B.refresh(); compare("S1 rafraîchissement par manifeste", B);
assert.equal(B.rows.find((l) => l.id === oldId).details.elevation, 1650, "B sees the old correction");

// S2: archives of three long rides (one holds a record) and the restore of one.
const longRides = server.rows.filter((l) => l.sport === "cycling" && !l.archived_at).sort((a, b) => b.val - a.val).slice(0, 3);
for (const l of longRides) A.correct(l.id, { archived: true });
A.correct(longRides[1].id, { archived: false });
compare("S2 archivage ×3 puis restauration (A)", A);
await B.refresh(); compare("S2 rafraîchissement", B);

// S3: both devices correct at the same time; then both correct the same session: the second is refused, refreshes, retries.
const oldRuns = server.rows.filter((l) => l.sport === "running" && Date.parse(l.date) < Date.parse("2023-01-01") && !l.archived_at).slice(0, 2);
A.correct(oldRuns[0].id, { duration: 61 });
B.correct(oldRuns[1].id, { duration: 62 });
const same = server.rows.find((l) => l.sport === "trail" && !l.archived_at);
A.correct(same.id, { duration: 200 });
let conflict = null;
try { B.correct(same.id, { duration: 210 }); } catch (e) { conflict = e.message; }
assert.equal(conflict, "SESSION_VERSION_CONFLICT", "a stale revision is refused, never a silent overwrite");
await B.refresh();
B.correct(same.id, { duration: 210 });
await A.refresh(); compare("S3 corrections simultanées (A)", A, `conflit sur la même séance : ${conflict}, B relit puis corrige`);
await B.refresh(); compare("S3 corrections simultanées (B)", B);

// S4: changes neither device made: a bulk archive of imports (archived_at only, no revision), a review status, a withdrawn batch.
const imports = server.rows.filter((l) => !l.archived_at).slice(100, 140);
for (const l of imports) l.archived_at = new Date(NOW - 1800000).toISOString();
server.rows.find((l) => !l.archived_at && l.sport === "swimming").status = "pending_review";
const withdrawn = new Set(server.rows.filter((l) => !l.archived_at).slice(2000, 2025).map((l) => l.id));
server.rows = server.rows.filter((l) => !withdrawn.has(l.id));
await A.refresh(); compare("S4 changements faits ailleurs (A)", A, "40 archivées en masse, 1 en vérification, 25 retirées");
await B.refresh(); compare("S4 changements faits ailleurs (B)", B);

// S5: B's cache cleared; the cold reading is cut after its first page (network lost); then resumed.
B.clear();
server.cut = (name, url) => name === "B (Android)" && /or=/.test(url.search);
await B.refresh().catch(() => {});
const partial = compare("S5 cache effacé, lecture coupée après 1 page", B, "réseau coupé après la première page");
assert.ok(!partial.complete && partial.partialYears > 0, "a partial copy flags the years it does not cover");
server.cut = null;
await B.refresh(); compare("S6 reprise après effacement du cache", B);
await A.refresh(); compare("S6 contrôle final", A);

// Negative control: a device refreshing only the last 90 days (an incremental refresh by date window) misses a correction of an old
// session made elsewhere; the comparison must see it.
const C = device("C (contrôle négatif)");
await C.refresh();
const oldOne = server.rows.find((l) => l.sport === "hiking" && Date.parse(l.date) < Date.parse("2022-06-01") && !l.archived_at);
rpcUpdate(oldOne.id, oldOne.revision, { duration: refMinutes(oldOne) + 90 });
const recent = server.rows.filter((l) => Date.parse(l.date) > NOW - 90 * 86400000).map((l) => structuredClone(l));
C.rows = W.merge(C.rows, recent, []);
C.stats = { mode: "fenêtre de 90 jours", requests: 1, read: recent.length };
const negative = compare("Contrôle négatif : rafraîchissement 90 jours", C, "une correction d’une séance de 2022 faite ailleurs");
assert.ok(negative.gaps > 0, "the reference check detects a missed old correction");
report.pop();
await A.refresh(); compare("Contrôle final après la correction ancienne (A)", A);
await B.refresh(); compare("Contrôle final après la correction ancienne (B)", B);
const negativeGaps = negative.gaps;

const total = report.reduce((n, r) => n + r.gaps, 0);
console.log(`\n${report.length} contrôles, ${total} écart(s) au calcul de référence.`);
if (args.out) { mkdirSync(dirname(resolve(args.out)), { recursive: true }); writeFileSync(resolve(args.out), JSON.stringify({ date: new Date().toISOString(), sessions: seed.length, oldId, steps: report, gaps: total, negativeControl: { gaps: negativeGaps, details: negative.details } }, null, 2) + "\n"); }
assert.equal(total, 0, "no gap to the reference");
