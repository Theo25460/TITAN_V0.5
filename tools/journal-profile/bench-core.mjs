// V1.6.6 — Journal longue durée: what does not need a browser, before and after, on the 10 000-session profile. Node (V8) on this
// container, not a phone: the Android figures here are the compute of the shared modules the app runs (the same files, src/core/web)
// and the bytes it moves, not a measure on a Galaxy S23.
//   node tools/journal-profile/bench-core.mjs --before <tree of the commit before the lot> [--out docs/v166/core.json]
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generate, NOW } from "./dataset.mjs";
import { networkProfile } from "./fake-postgrest.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const BEFORE = resolve(args.before || ".");
const AFTER = resolve(".");
const require = createRequire(import.meta.url);
const { logs } = generate();
const rows = logs.map((l) => ({ ...l, cat: l.category, syncStatus: "confirmed" }));

function load(tree) {
  for (const k of Object.keys(require.cache)) if (k.includes("/js/")) delete require.cache[k];
  const g = {};
  globalThis.window = globalThis;
  for (const f of ["core/format.js", "training-store.js", "core/effort.js", "core/sports-catalog.js", "core/sports.js", "core/sport-contracts.js", "sport-insights.js", "core/progress.js", "core/sync-state.js", "core/history-ledger.js"]) require(`${tree}/js/${f}`);
  for (const k of ["TitanInsights", "TitanLedger", "TitanProgress", "TitanTraining"]) g[k] = globalThis[k];
  return g;
}
function time(fn, runs = 15) {
  fn();
  const xs = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); }
  xs.sort((a, b) => a - b);
  return { p50: Math.round(xs[Math.floor(xs.length / 2)] * 10) / 10, p95: Math.round(xs[Math.ceil(xs.length * 0.95) - 1] * 10) / 10 };
}
// JournalScreen's sections (mobile/src/screens/progress/JournalScreen.tsx), the sort before and after.
const sectionsBefore = (list) => list.filter(Boolean).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const sectionsAfter = (list) => list.filter(Boolean).map((l) => [Date.parse(l.date), l]).sort((a, b) => (b[0] || 0) - (a[0] || 0)).map((e) => e[1]);

const out = { date: new Date().toISOString(), node: process.version, sessions: rows.length, engine: "Node/V8 dans le conteneur (pas Hermes, pas le S23)" };
const before = load(BEFORE);
out.recordsBefore = time(() => before.TitanInsights.records(rows, "all", NOW));
out.useLogsViewsBefore = time(() => before.TitanProgress.activeLogs(before.TitanLedger.split(rows, []).logs, NOW));
out.journalSortBefore = time(() => sectionsBefore(rows));
const after = load(AFTER);
out.recordsAfter = time(() => after.TitanInsights.records(rows, "all", NOW));
out.useLogsViewsAfter = time(() => after.TitanProgress.activeLogs(after.TitanLedger.split(rows, []).logs, NOW));
out.journalSortAfter = time(() => sectionsAfter(rows));
out.recordsIdentical = JSON.stringify(before.TitanInsights.records(rows, "all", NOW).map((r) => [r.id, r.value, r.log.id])) === JSON.stringify(after.TitanInsights.records(rows, "all", NOW).map((r) => [r.id, r.value, r.log.id]));

// Bytes moved: a refresh of a phone that already holds the history, before (every row again) and after (manifest + changed rows).
const all = JSON.stringify(rows.map(({ cat, syncStatus, ...l }) => l));
const manifest = JSON.stringify(logs.map((l) => ({ id: l.id, revision: l.revision, archived_at: l.archived_at, status: l.status, is_suspicious: l.is_suspicious })));
const one = JSON.stringify([logs[7006]]);
const mb = (s) => Math.round((Buffer.byteLength(s) / 1e6) * 100) / 100;
const gz = (s) => Math.round((gzipSync(s).length / 1e6) * 100) / 100;
const net = networkProfile("faible");
const seconds = (requests, text) => Math.round((requests * net.rtt + (gzipSync(text).length / net.bytesPerSecond) * 1000) / 100) / 10;
out.refreshBefore = { requests: 20, mb: mb(all), gzMb: gz(all), faibleSeconds: seconds(20, all) };
out.refreshAfterNoChange = { requests: 10, mb: mb(manifest), gzMb: gz(manifest), faibleSeconds: seconds(10, manifest) };
out.refreshAfterOneChange = { requests: 11, mb: mb(manifest) + mb(one), gzMb: gz(manifest), faibleSeconds: seconds(10, manifest) + seconds(1, one) };
out.coldFirstPage = { requests: 1, mb: mb(JSON.stringify(logs.slice(0, 500))), faibleSeconds: seconds(1, JSON.stringify(logs.slice(0, 500))) };
// Device copy written again after one correction: the whole copy before, one chunk after (150 rows on Android, 500 on the website).
const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
out.cacheWriteBefore = { mb: mb(all) };
out.cacheWriteAfterAndroid = { mb: mb(JSON.stringify(sorted.slice(0, 150))) };
out.cacheWriteAfterWeb = { mb: mb(JSON.stringify(sorted.slice(0, 500))) };
out.network = net.label;
console.log(JSON.stringify(out, null, 2));
if (args.out) { mkdirSync(dirname(resolve(args.out)), { recursive: true }); writeFileSync(resolve(args.out), JSON.stringify(out, null, 2) + "\n"); }
