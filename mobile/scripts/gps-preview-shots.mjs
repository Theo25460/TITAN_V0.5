#!/usr/bin/env node
// V1.7.7 — visual review of the Android GPS screens on a synthetic outing (no phone, no real position): serves a TITAN_PREVIEW web
// export (react-native-web, fixtures, the recorder of preview/mocks/gpsNative.ts) and seeds the browser's storage with a recording
// built here by the real engine. These captures show the layout of the screens; they prove nothing about a device.
// Usage: TITAN_PREVIEW=1 EXPO_OFFLINE=1 npx expo export --platform web --output-dir /tmp/preview
//        node scripts/gps-preview-shots.mjs /tmp/preview ../docs/v177
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

const [dist, out] = process.argv.slice(2);
if (!dist || !out) throw new Error("usage: gps-preview-shots.mjs <exportDir> <outDir>");
const require = createRequire(resolve(process.cwd(), "../package.json"));
const { chromium } = require("playwright");
const E = require("./js/core/gps-engine.js"), N = require("./js/core/gps-nav.js"), S = require("./js/core/gps-session.js");

const OWNER = "owner-a", SPORT = "gravel";
const LAT = 48.5839, LON = 7.6455, MLAT = (Math.PI / 180) * 6371008.8, MLON = MLAT * Math.cos((LAT * Math.PI) / 180);
// A 24 km loop west of Strasbourg, drawn by hand as a wobbling ellipse (a shape, not real roads).
const loopAt = (k) => { const a = k * 2 * Math.PI, w = 1 + 0.18 * Math.sin(5 * a) + 0.08 * Math.cos(9 * a); return { north: 2600 * w * Math.sin(a) * 1.0 + 2600, east: 4200 * w * (1 - Math.cos(a)) }; };
const P = (north, east) => ({ lat: LAT + north / MLAT, lon: LON + east / MLON });
const planned = N.makeRoute([Array.from({ length: 700 }, (_, i) => { const q = loopAt(i / 699); return { ...P(q.north, q.east), ele: 160 + 60 * Math.sin((i / 699) * 4 * Math.PI) ** 2 }; })], { name: "Boucle des collines", sport: SPORT, origin: "planned" });

/** A recording that covers `share` of the loop, with a 20-minute café stop a third of the way, ending `tail` (state of the last minutes). */
function recording(share, tail, now) {
  const fixes = [];
  const speed = 6.1, total = planned.distanceM * share, c = N.course(planned);
  let t = 0, edge = 0;
  const at = (m) => { while (edge < c.pts.length - 2 && c.pts[edge + 1].cum < m) edge++; const a = c.pts[edge], b = c.pts[edge + 1], k = (m - a.cum) / Math.max(1, b.cum - a.cum); return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, alt: a.ele + (b.ele - a.ele) * k }; };
  let stopped = false;
  for (let m = 0; m <= total; m += speed * 2) {
    t += 2000;
    const p = at(m), j = Math.sin(m / 37) * 1.5;
    fixes.push({ lat: p.lat + j / MLAT, lon: p.lon, alt: p.alt, altAcc: 4, acc: 5, t });
    if (!stopped && m > total / 3) { stopped = true; for (let s = 0; s < 600; s++) { t += 2000; fixes.push({ lat: p.lat + (s % 2 ? 0.6 : -0.6) / MLAT, lon: p.lon, alt: p.alt, altAcc: 4, acc: 6, t }); } }
  }
  const last = at(total);
  if (tail === "stop") for (let s = 0; s < 65; s++) { t += 2000; fixes.push({ lat: last.lat + (s % 2 ? 0.5 : -0.5) / MLAT, lon: last.lon, alt: last.alt, altAcc: 4, acc: 5, t }); }
  if (tail === "off") for (let s = 1; s <= 14; s++) { t += 2000; fixes.push({ lat: last.lat + (s * 12) / MLAT, lon: last.lon - (s * 9) / MLON, alt: last.alt, altAcc: 4, acc: 5, t }); }
  const start = now - t - 1200;
  let track = { segs: [], rejected: 0 }, follow = N.startFollow();
  fixes.forEach((f, i) => { const fix = { ...f, t: start + f.t }; track = E.ingest(track, fix, { sport: SPORT, newSegment: i === 0 }); follow = N.follow(c, follow, fix, { sport: SPORT }); });
  const lastFix = track.segs.at(-1).at(-1), prev = track.segs.at(-1).at(-2);
  return { track, follow, start, lastFix, live: { t: lastFix.t, lat: lastFix.lat, lon: lastFix.lon, acc: lastFix.acc, alt: lastFix.alt, spd: tail === "stop" ? 0 : speed, hdg: N.bearing(prev, lastFix) } };
}
function seed({ status = "recording", share = 0.55, tail = "move", view = "dash", follow = true, goal = null, plan = null, now }) {
  const r = recording(share, tail, now);
  const ended = status === "ended";
  const rec = { v: 2, owner: OWNER, sport: SPORT, status, startedAt: r.start, endedAt: ended ? r.lastFix.t + 1000 : null, activeMs: ended ? r.lastFix.t + 1000 - r.start : 0, runStart: ended ? null : r.start,
    newSegment: false, interrupted: false, track: r.track, stretches: [{ s: r.start, e: ended ? r.lastFix.t + 1000 : null, why: ended ? "finish" : "pause" }], live: r.live,
    opts: { autoPause: true, offRouteAlert: true }, follow: follow ? { id: "preview-loop", name: planned.name, state: r.follow } : null, back: null, goal, plan };
  return {
    [`titan.gps.v1:${OWNER}`]: JSON.stringify(rec), "titan.gps.active.v1": OWNER,
    [`titan.gps-prefs.v1:${OWNER}`]: JSON.stringify({ view, autoPause: true, offRouteAlert: true, stepAlerts: true, fields: {} }),
    [`titan.route-offline.v1:preview-loop:${OWNER}`]: JSON.stringify(planned),
    [`titan.route-offline-index.v1:${OWNER}`]: JSON.stringify([{ id: "preview-loop", name: planned.name, sport: SPORT, origin: "planned", distanceM: planned.distanceM, ascentM: planned.ascentM, savedAt: now, bytes: JSON.stringify(planned).length }]),
    [`titan.places.v1:${OWNER}`]: JSON.stringify([{ id: "pl-preview-1", name: "Fontaine du col", kind: "water", ...P(4300, 2500), note: "", updatedAt: now }, { id: "pl-preview-2", name: "Abri forestier", kind: "shelter", ...P(1500, 6800), note: "", updatedAt: now }]),
  };
}

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const NOW = new Date(2026, 10, 25, 11, 42, 0).getTime();
const plan = S.buildPlan({ warmup: { by: "time", value: 900 }, reps: 4, work: { by: "distance", value: 2000 }, recover: { by: "time", value: 180 }, cooldown: { by: "manual" } });
const SHOTS = [
  { name: "android-avant-depart", hash: "GpsRecord?sport=gravel&follow=preview-loop", store: () => ({ ...seed({ now: NOW }), [`titan.gps.v1:${OWNER}`]: undefined, "titan.gps.active.v1": undefined }) },
  { name: "android-compteur", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "dash", goal: { kind: "distance", km: 24 } }) },
  { name: "android-carte", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "map" }) },
  { name: "android-mixte", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "mixed", goal: { kind: "return", at: NOW + 95 * 60000 } }) },
  { name: "android-arret", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "dash", tail: "stop" }) },
  { name: "android-hors-parcours", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "mixed", tail: "off" }) },
  { name: "android-seance-structuree", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "dash", follow: false, plan: { steps: plan, cursor: { index: 1, fromS: 900, fromM: 5400, laps: [{ index: 0, kind: "warmup", label: "Échauffement", seconds: 900, metres: 5400, manual: false }] }, alerts: true } }) },
  { name: "android-retour-depart", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "mixed", follow: false }), clicks: ["Plus", "Retour au départ"] },
  { name: "android-reglages", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, view: "dash" }), clicks: ["Plus", "Réglages"] },
  { name: "android-bilan", hash: "GpsRecord?sport=gravel", store: () => seed({ now: NOW, status: "ended", share: 0.999, view: "dash" }), long: true },
  { name: "android-mes-parcours", hash: "Routes", store: () => seed({ now: NOW }), strip: true },
  { name: "android-planification", hash: "RoutePlanner", store: () => seed({ now: NOW }), strip: true },
  { name: "android-mes-points", hash: "Places", store: () => seed({ now: NOW }), strip: true },
];
const errors = [];
for (const shot of SHOTS) {
  // 360 × 780 dp: the Galaxy S23's logical size
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, locale: "fr-FR", timezoneId: "Europe/Paris" });
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  page.on("pageerror", (e) => errors.push(`${shot.name}: ${e.message}`));
  const store = shot.store();
  if (shot.strip) { delete store[`titan.gps.v1:${OWNER}`]; delete store["titan.gps.active.v1"]; }
  await page.addInitScript((entries) => { for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== null) window.localStorage.setItem(k, v); }, store);
  await page.goto(`http://127.0.0.1:${port}/#${shot.hash}`);
  await page.waitForSelector("body[data-preview-ready]", { timeout: 30000 }).catch(() => errors.push(`${shot.name}: not ready`));
  await page.clock.runFor(2500);
  for (const text of shot.clicks || []) {
    await page.getByText(text, { exact: true }).first().click({ timeout: 5000 }).catch((e) => errors.push(`${shot.name}: ${text}: ${e.message.split("\n")[0]}`));
    await page.clock.runFor(1500);
  }
  await page.screenshot({ path: join(out, `${shot.name}.png`) });
  if (shot.long) { await page.setViewportSize({ width: 360, height: 2600 }); await page.clock.runFor(800); await page.screenshot({ path: join(out, `${shot.name}-long.png`) }); }
  await context.close();
}
await browser.close();
server.close();
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
console.log(`${SHOTS.length} captures in ${out}`);
