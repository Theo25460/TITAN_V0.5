// V1.6.5 — Mesure du centre des sources sur un jeu SYNTHÉTIQUE et déterministe (aucun appareil, aucun compte réel).
// Huit semaines d'un sportif pilote qui lit Santé Connect à l'ouverture de TITAN, avec des interruptions placées à des jours fixes :
// Santé Connect sans réponse, application fermée pendant l'import, réseau coupé, accès Android perdu pendant 12 jours puis rétabli,
// et une absence de 40 jours (au-delà de la borne de 30 jours). Chaque reprise suit la fenêtre que propose le centre
// (TitanSources.diagnose → replay). Sortie : le résultat de TitanSources.measure et la part des séances perdues hors borne.
// Usage : node tools/measure-source-recovery.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../js/core/source-center.js");

const H = 3600000, D = 24 * H;
const T0 = Date.parse("2026-08-01T07:00:00Z");
// One session every other day at 07:00 (40 min), as the watch writes it into Health Connect.
const sessions = [];
for (let d = 0; d < 110; d += 2) sessions.push({ id: `hc-${d}`, at: T0 + d * D, visible: false });
const runs = [];
let n = 0;
const imported = new Set();
const entry = (now, grantedAt) => ({ source: "health_connect", consent: { granted: true, granted_at: grantedAt, revoked_at: null }, counts: { imported: imported.size, linked: 0, archived: 0, review: 0 }, runs: runs.slice().reverse() });
// What happens on given days (the athlete opens TITAN every morning at 08:00 unless absent).
const EVENTS = { 9: "hc_down", 16: "app_closed", 23: "network", 30: "permission_lost", 63: "absent" };
let permission = true, absentUntil = -1;
const grantedAt = new Date(T0 - 10 * D).toISOString();
for (let day = 0; day < 110; day++) {
  const now = T0 + day * D + H;
  if (day < absentUntil) continue;
  const ev = EVENTS[day];
  if (ev === "permission_lost") permission = false;
  if (day === 42) permission = true; // re-granted after 12 days from the « Autorisation expirée » action
  if (ev === "absent") { absentUntil = day + 40; continue; }
  const d = S.diagnose("health_connect", entry(now, grantedAt), { now, device: { availability: "ready", access: { steps: permission, exercise: permission } }, here: true });
  const window = d.replay || S.replayWindow("health_connect", { now, grantedAt });
  const id = `run-${++n}`;
  if (!permission) { runs.push({ id, kind: "read", started_at: new Date(now).toISOString(), finished_at: new Date(now).toISOString(), window_from: null, window_to: null, outcome: "denied", error_code: "ANDROID_PERMISSION", counts: {} }); continue; }
  const found = sessions.filter((s) => s.at >= Date.parse(window.from) && s.at <= Date.parse(window.to));
  if (ev === "hc_down" || ev === "network") { runs.push({ id, kind: "read", started_at: new Date(now).toISOString(), finished_at: new Date(now).toISOString(), window_from: window.from, window_to: window.to, outcome: "failed", error_code: ev === "network" ? "NETWORK" : "HC_UNAVAILABLE", counts: {} }); continue; }
  const sent = ev === "app_closed" ? found.slice(0, 1) : found;
  let added = 0, dup = 0;
  for (const s of sent) { if (imported.has(s.id)) dup++; else { imported.add(s.id); s.visible = true; added++; } }
  if (ev === "app_closed") { runs.push({ id, kind: "replay", started_at: new Date(now).toISOString(), finished_at: null, window_from: window.from, window_to: window.to, outcome: "running", counts: { read: found.length, imported: added } }); continue; }
  // The next opening of TITAN reads the window the center proposes (resume of the missing period, or the last 7 days).
  runs.push({ id, kind: d.state === "ok" || d.state === "empty" ? "read" : "replay", started_at: new Date(now).toISOString(), finished_at: new Date(now + 60000).toISOString(), window_from: window.from, window_to: window.to, outcome: added ? "ok" : "empty", counts: { read: found.length, imported: added, duplicate: dup } });
}
const end = T0 + 110 * D;
const m = S.measure(runs, sessions.filter((s) => s.visible).map((s) => ({ started_at: new Date(s.at).toISOString() })), { now: end });
const lost = sessions.filter((s) => !s.visible && s.at < end - D);
// Per incident: consecutive interrupted runs closed by the same successful reading count once (a 12-day permission loss is one incident).
const episodes = [];
let open = null;
for (const r of runs) {
  const bad = ["failed", "partial", "denied", "running"].includes(r.outcome);
  if (bad && !open) open = { from: r.started_at, kind: r.error_code || "INTERRUPTED", runs: 0 };
  if (bad) open.runs++;
  if (!bad && open && (r.outcome === "ok" || r.outcome === "empty")) {
    const back = sessions.some((x) => x.visible && x.at >= Date.parse(r.window_from) && x.at <= Date.parse(r.window_to));
    episodes.push({ cause: open.kind, runs: open.runs, delayHours: Math.round((Date.parse(r.finished_at) - Date.parse(open.from)) / H), activityVisible: back });
    open = null;
  }
}
console.log(JSON.stringify({
  dataset: "synthétique, déterministe : 1 sportif, 110 jours, 1 séance tous les 2 jours, 5 interruptions",
  runs: runs.length, sessions: sessions.length, imported: imported.size, duplicates: runs.reduce((k, r) => k + (r.counts?.duplicate || 0), 0),
  ...m,
  episodes,
  lostOutsideBound: lost.length, lostDays: lost.map((s) => new Date(s.at).toISOString().slice(0, 10)),
}, null, 2));
