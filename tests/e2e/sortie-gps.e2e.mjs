// V1.7.7 — the outing recorded in the browser (/sortie), in a discovery account with the flag screens.gps on.
// The browser's geolocation is replaced by a fake the test drives (window.__gps.emit / fail) and the clock is Playwright's, so a gravel
// outing with a 20-minute stop runs in seconds. External requests are blocked; no production account; nothing leaves 127.0.0.1.
// TITAN_V177_SHOTS=1 also writes the screenshots of docs/v177/ (360×780, deviceScaleFactor 2).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const SHOTS = process.env.TITAN_V177_SHOTS === "1" ? `${ROOT}docs/v177/` : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let server, browser, BASE;
before(async () => {
  const port = await new Promise((resolve) => { const p = createServer(); p.listen(0, () => { const n = p.address().port; p.close(() => resolve(n)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const LAT = 48.58, LON = 7.75, MLAT = (Math.PI / 180) * 6371008.8, MLON = MLAT * Math.cos((LAT * Math.PI) / 180);
const T0 = new Date("2026-11-21T09:00:00+01:00").getTime();
const at = (north, east = 0) => ({ lat: LAT + north / MLAT, lon: LON + east / MLON });
const shot = async (page, name, options = {}) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}.png`, ...options }); };
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

/** Runs in the page before its scripts: the flag as the test wants it, and a geolocation the test drives. */
function prelude({ flag, vibrate }) {
  let real;
  Object.defineProperty(window, "titanFlags", { configurable: true, get: () => real, set(v) { const old = v.enabled; v.enabled = (k, f) => (k === "screens.gps" ? flag : old(k, f)); real = v; } });
  const g = {
    ok: null, err: null, watches: 0, options: null,
    emit(f) { if (this.ok) this.ok({ timestamp: f.t ?? Date.now(), coords: { latitude: f.lat, longitude: f.lon, accuracy: f.acc ?? 5, altitude: f.alt ?? null, altitudeAccuracy: f.alt === undefined ? null : 4, speed: f.spd ?? null, heading: f.hdg ?? null } }); },
    fail(code) { if (this.err) this.err({ code, message: "test" }); },
  };
  window.__gps = g;
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition(ok, err, options) { g.ok = ok; g.err = err; g.options = options; g.watches++; return g.watches; }, clearWatch() { g.ok = null; g.err = null; }, getCurrentPosition() {} } });
  if (!vibrate) Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
  else { window.__vibrations = []; Object.defineProperty(navigator, "vibrate", { configurable: true, value: (p) => { window.__vibrations.push(p); return true; } }); }
}

async function fixture({ flag = true, width = 360, height = 780, vibrate = true, context: reuse } = {}) {
  const context = reuse || await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", locale: "fr-FR", timezoneId: "Europe/Paris", acceptDownloads: true });
  if (!reuse) {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
    await context.addInitScript(prelude, { flag, vibrate });
    await context.clock.install({ time: T0 });
  }
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [], outside = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) outside.push({ url: r.url(), body: r.postData() || "", at: Date.now() }); });
  await page.goto(BASE + "/sortie");
  await page.locator("[data-gps-state]").waitFor();
  return { context, page, errors, outside };
}
/** Stops the clock: from here time only moves when the test says so. */
async function freeze(page) { await page.clock.pauseAt(T0 + 120000); await page.clock.runFor(50); }
/** After a reload under a stopped clock the page's own timers must be run for it to start. */
async function settle(page, selector) {
  for (let i = 0; i < 60; i++) { await page.clock.runFor(200); if (await page.locator(selector).count()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error(`${selector} never appeared`);
}
const emit = (page, pos, extra = {}) => page.evaluate((f) => window.__gps.emit(f), { ...at(pos.north, pos.east), ...extra });
/** Moves at `speed` m/s towards `bearing` (0 = north) for `seconds`, one position every `step` seconds. */
async function ride(page, pos, seconds, { speed = 6, bearing = 0, step = 5, ...extra } = {}) {
  const rad = (bearing * Math.PI) / 180;
  for (let s = step; s <= seconds; s += step) {
    pos.north += speed * step * Math.cos(rad); pos.east += speed * step * Math.sin(rad);
    await page.clock.runFor(step * 1000);
    await emit(page, pos, { spd: speed, hdg: bearing, ...extra });
  }
}
/** Stands still for `seconds`: the receiver wanders by less than a metre, one position every 10 s. */
async function halt(page, pos, seconds) {
  for (let s = 10; s <= seconds; s += 10) {
    await page.clock.runFor(10000);
    await emit(page, { north: pos.north + (s % 20 ? 0.7 : -0.5), east: pos.east + (s % 30 ? 0.4 : -0.3) }, { spd: 0 });
  }
}
async function begin(page, sport = "gravel") {
  await page.locator(`[data-sport="${sport}"]`).click();
  await freeze(page);
  await page.locator('[data-act="start"]').click();
  await page.locator('[data-gps-state="live"]').waitFor();
}
const cell = (page, key) => page.locator(`.gps-live [data-cell][data-key="${key}"] .gps-v`).first().innerText();
const number = (text) => Number(String(text).replace(",", ".").replace(/[^\d.]/g, ""));
const seconds = (text) => String(text).split(":").map(Number).reduce((n, x) => n * 60 + x, 0);
const stored = (page) => page.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open("titan_gps_web_v1", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("recordings", { keyPath: "owner" });
  open.onsuccess = () => { const all = open.result.transaction("recordings").objectStore("recordings").getAll(); all.onsuccess = () => resolve(all.result.map((r) => r.rec)); };
  open.onerror = () => resolve(null);
}));
/** How many pixels of the map canvas have (about) this colour. */
const pixels = (page, [r, g, b], scope = "") => page.evaluate(({ r, g, b, scope }) => {
  const c = document.querySelector(`${scope} [data-map] canvas`), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) < 14 && Math.abs(d[i + 1] - g) < 14 && Math.abs(d[i + 2] - b) < 14) n++;
  return n;
}, { r, g, b, scope });
const CYAN = [61, 217, 232], AMBER = [244, 187, 84];
async function axe(page, label) {
  await page.evaluate(axeSource);
  const found = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(" ")}`));
  assert.deepEqual(found, [], `axe on ${label}`);
}
const noSideScroll = async (page, label) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll: ${label}`);
const gpx = (points, { name = "Canal du matin", ele = true } = {}) => `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>${name}</name><trkseg>${points.map((p, i) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${ele ? `<ele>${140 + i}</ele>` : ""}</trkpt>`).join("")}</trkseg></trk></gpx>`;

test("flag off: an honest « bientôt » state, no position asked, and the entry is not listed on the sibling page", async () => {
  const f = await fixture({ flag: false }), { page } = f;
  try {
    assert.equal(await page.locator("[data-gps-state]").getAttribute("data-gps-state"), "gate");
    assert.match(await page.locator("#sortie").innerText(), /Sortie GPS : bientôt disponible sur le Web\. L’application Android enregistre déjà tes sorties\./);
    assert.equal(await page.locator('[data-act="start"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__gps.watches), 0);
    assert.equal(await page.locator('[data-subnav] a[href="/sortie"][aria-current="page"]').count(), 1, "the page names itself");
    await page.goto(BASE + "/prevoir");
    await page.locator('[data-subnav] a[href="/prevoir"]').waitFor();
    await page.waitForFunction(() => window.titanShell && document.querySelector("#prevoir")?.getAttribute("aria-busy") === "false");
    assert.equal(await page.locator('[data-subnav] a[href="/sortie"]').count(), 0);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("preparation: the browser's limits before the start, GPS sports only, the sheets, and what a discovery account cannot use", async () => {
  const f = await fixture({ vibrate: false }), { page } = f;
  try {
    assert.equal(await page.locator("[data-gps-state]").getAttribute("data-gps-state"), "prepare");
    assert.match(await page.locator("[data-limits]").innerText(), /Garde cette page ouverte et l’écran allumé\..*écran verrouillé ou l’onglet en arrière-plan.*« sans position », jamais inventé.*application Android/s);
    assert.match(await page.locator(".gps-prep-side").innerText(), /ton navigateur te demande l’accès à ta position.*reste dans ce navigateur.*que des totaux/s);
    const offered = await page.evaluate(() => [...document.querySelectorAll("[data-sport]")].map((b) => b.dataset.sport).concat([...document.querySelectorAll("[data-sport-more] option")].map((o) => o.value).filter(Boolean)));
    const gps = await page.evaluate(() => window.TitanGpsEngine.GPS_SPORTS);
    assert.deepEqual([...offered].sort(), [...gps].sort(), "every GPS sport of the catalogue, and nothing else");
    assert.ok(!offered.includes("musculation") && !offered.includes("yoga"));
    assert.equal(await page.evaluate(() => window.__gps.watches), 0, "nothing is asked before the start");
    await page.locator('[data-sport="gravel"]').click();
    assert.equal(await page.locator('[data-sport="gravel"]').getAttribute("aria-pressed"), "true");
    await page.locator("[data-sport-more]").selectOption("kayak");
    assert.equal(await page.locator("[data-sport-more]").inputValue(), "kayak");
    await page.locator('[data-sport="gravel"]').click();
    await shot(page, "web-preparer");
    await axe(page, "preparation");

    // Route: a discovery account is told what needs an account; a broken file is refused with its reason
    await page.locator('[data-open="route"]').click();
    const sheet = page.locator("dialog.asc-sheet[open]");
    assert.match(await sheet.innerText(), /Mes parcours demande un compte.*Créer un itinéraire demande un compte/s);
    await sheet.locator("[data-gpx-file]").setInputFiles({ name: "vide.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from("<gpx><trk><trkseg></trkseg></trk></gpx>") });
    await sheet.locator("[data-route-error]:not(:empty)").waitFor();
    assert.match(await sheet.locator("[data-route-error]").innerText(), /incomplet|exploitable/);
    await sheet.locator("[data-close]").click();

    // Goal
    await page.locator('[data-open="goal"]').click();
    await sheet.locator("[data-goal-km]").fill("30");
    assert.equal(await sheet.locator('input[name="gps-goal"][value="distance"]').isChecked(), true);
    await sheet.locator('[data-goal="ok"]').click();
    assert.equal(await page.locator('[data-row-sub="goal"]').innerText(), "Distance : 30 km");
    await page.locator('[data-open="goal"]').click();
    await sheet.locator('input[name="gps-goal"][value="return"]').check();
    await sheet.locator('[data-goal="ok"]').click();
    assert.match(await sheet.locator("[data-goal-error]").innerText(), /heure/);
    await sheet.locator("[data-goal-at]").fill("12:30");
    await sheet.locator('[data-goal="ok"]').click();
    assert.equal(await page.locator('[data-row-sub="goal"]').innerText(), "Être rentré pour 12:30");

    // Structured session: steps listed as the session module describes them; no vibration in this browser is said, not hidden
    await page.locator('[data-open="plan"]').click();
    await sheet.locator('[data-part="warmup"] [data-part-value]').fill("2");
    await sheet.locator("[data-plan-reps]").fill("2");
    await sheet.locator('[data-part="work"] [data-part-mode]').selectOption("m");
    await sheet.locator('[data-part="work"] [data-part-value]').fill("200");
    await sheet.locator('[data-part="recover"] [data-part-value]').fill("1");
    await sheet.locator('[data-part="cooldown"] [data-part-mode]').selectOption("manual");
    assert.deepEqual(await sheet.locator("[data-plan-steps] li").allInnerTexts(), ["Échauffement · 2:00", "Effort 1/2 · 0,20 km", "Récupération 1/1 · 1:00", "Effort 2/2 · 0,20 km", "Retour au calme · au signal"]);
    assert.equal(await sheet.locator("[data-no-vibrate]").innerText(), "Vibration non disponible dans ce navigateur : le changement d’étape s’affiche à l’écran.");
    assert.equal(await sheet.locator("[data-plan-vibrate]").count(), 0);
    await sheet.locator('[data-plan="ok"]').click();
    assert.equal(await page.locator('[data-row-sub="plan"]').innerText(), "5 étapes");

    // Settings: automatic pause explained, the four figures, no base map configured
    await page.locator('[data-open="settings"]').click();
    assert.equal(await sheet.locator("[data-no-tiles]").innerText(), "Fond de carte non configuré : la carte montre ta trace sur fond neutre");
    assert.match(await sheet.locator("[data-auto-note]").innerText(), /^Activée : la durée de la séance est le temps en mouvement/);
    assert.equal(await sheet.locator("[data-set-field]").count(), 4);
    await sheet.locator('[data-set-field="3"]').selectOption("clock");
    await shot(page, "web-reglages");
    await sheet.locator("[data-set-auto]").uncheck();
    assert.match(await sheet.locator("[data-auto-note]").innerText(), /^Désactivée : la durée de la séance garde les arrêts détectés/);
    await sheet.locator('[data-set="ok"]').click();
    await sheet.waitFor({ state: "detached" });
    assert.match(await page.locator('[data-row-sub="settings"]').innerText(), /^Pause automatique désactivée · .*Heure$/);
    // remembered per account on this device
    await page.reload();
    await page.locator('[data-gps-state="prepare"]').waitFor();
    assert.equal(await page.locator('[data-sport="gravel"]').getAttribute("aria-pressed"), "true");
    assert.match(await page.locator('[data-row-sub="settings"]').innerText(), /^Pause automatique désactivée · .*Heure$/);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("a gravel outing with a 20-minute stop: dashboard, stop line, three views, pause, weak signal, finish, summary, one saved session", async () => {
  const f = await fixture(), { page } = f;
  try {
    await begin(page);
    const sinceStart = f.outside.length;
    assert.deepEqual(await page.evaluate(() => window.__gps.options), { enableHighAccuracy: true, maximumAge: 0 });
    assert.equal(await page.locator('[data-f="state"]').innerText(), "Recherche du signal GPS…");
    assert.equal(await page.locator('[data-f="signal"]').getAttribute("data-state"), "searching");
    assert.match(await page.locator('[data-f="keep"]').innerText(), /Garde cette page au premier plan/);
    // the phone's own bars leave: nothing but the outing while it is recorded
    assert.equal(await page.locator(".asc-tabbar").isVisible(), false);

    // 10 minutes at 6 m/s (21,6 km/h)
    const pos = { north: 0, east: 0 };
    await emit(page, pos, { spd: 0 });
    await ride(page, pos, 600);
    await page.clock.runFor(1000);
    assert.equal(await page.locator('[data-f="state"]').innerText(), "En mouvement");
    assert.equal(await page.locator('[data-f="signal"]').getAttribute("data-state"), "good");
    assert.equal(await page.locator('[data-f="signal"]').innerText(), "GPS ± 5 m");
    assert.equal(await cell(page, "speed"), "21,6");
    near(number(await cell(page, "distance")), 3.6, 0.03, "distance after 10 min");
    near(seconds(await cell(page, "moving")), 600, 4, "moving after 10 min");
    assert.match(await page.locator('[data-f="keep"]').innerText(), /Enregistré sur cet appareil à 09:1\d:\d\d\./);
    assert.match(await page.locator('[data-f="keep"]').innerText(), /Écran maintenu allumé\.|Ton navigateur ne peut pas garder l’écran allumé : empêche la mise en veille dans ses réglages/);
    // every figure has its label
    assert.deepEqual(await page.locator(".gps-mains dt").allInnerTexts(), ["Vitesse", "Distance"]);
    assert.ok((await page.locator(".gps-cells dt").allInnerTexts()).every((t) => t.length > 3));

    // three views, remembered
    assert.equal(await page.locator(".gps-live").getAttribute("data-view"), "mixed");
    assert.equal(await page.locator(".gps-cells .gps-cell:visible").count(), 2);
    assert.ok(await pixels(page, CYAN) > 200, "the travelled trace is drawn in cyan");
    await shot(page, "web-mixte");
    await page.locator('[data-view-set="dash"]').click();
    assert.equal(await page.locator("[data-map]").isVisible(), false);
    assert.equal(await page.locator(".gps-cells .gps-cell:visible").count(), 4);
    await shot(page, "web-compteur");
    await page.locator('[data-view-set="map"]').click();
    assert.equal(await page.locator("[data-map]").isVisible(), true);
    assert.equal(await page.locator(".gps-cells").isVisible(), false);
    assert.ok(await pixels(page, CYAN) > 200);
    assert.equal(await page.locator(".gps-map-caption").innerText(), "Fond neutre : trace et position seulement");
    assert.match(await page.locator(".gps-map-scale span").innerText(), /^\d+ (m|km)$/);
    // a drag switches the follow mode off and offers to recentre; zoom buttons work
    assert.equal(await page.locator("[data-map-recenter]").isVisible(), false);
    const box = await page.locator("[data-map] canvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2 + 60, { steps: 4 }); await page.mouse.up();
    await page.clock.runFor(100);
    assert.equal(await page.locator("[data-map]").getAttribute("data-follow"), "off");
    await shot(page, "web-carte");
    const scaleBefore = await page.locator(".gps-map-scale span").innerText();
    await page.locator('[data-map-zoom="-1"]').click(); await page.locator('[data-map-zoom="-1"]').click();
    assert.notEqual(await page.locator(".gps-map-scale span").innerText(), scaleBefore);
    await page.locator("[data-map-recenter]").click();
    assert.equal(await page.locator("[data-map]").getAttribute("data-follow"), "on");
    await page.locator('[data-view-set="mixed"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(`titan.gps.prefs.v1:${window.state.user.id}`)).view), "mixed");
    await axe(page, "live outing");

    // 20 minutes standing still: said as a stop counted from its first second; moving time and distance wait
    const movingBefore = seconds(await cell(page, "moving")), distanceBefore = number(await cell(page, "distance"));
    await halt(page, pos, 1200);
    await page.clock.runFor(1000);
    assert.match(await page.locator('[data-f="state"]').innerText(), /^À l’arrêt depuis (19:5\d|20:0\d)$/);
    assert.equal(await page.locator('[data-f="state"]').getAttribute("data-kind"), "stopped");
    near(seconds(await cell(page, "moving")), movingBefore, 8, "moving time during the stop");
    near(number(await cell(page, "distance")), distanceBefore, 0.01, "distance during the stop");
    await shot(page, "web-arret");

    // pause: nothing is recorded, then a new piece of trace
    await page.locator('[data-act="pause"]').click();
    assert.equal(await page.locator('[data-f="state"]').innerText(), "En pause");
    assert.equal(await page.locator('[data-f="signal"]').innerText(), "GPS en pause");
    await page.clock.runFor(120000);
    await emit(page, { north: pos.north + 900, east: 0 });
    near(number(await cell(page, "distance")), distanceBefore, 0.01, "distance during the pause");
    await page.locator('[data-act="resume"]').click();
    await emit(page, pos, { spd: 0 });
    await ride(page, pos, 300);
    await page.clock.runFor(1000);
    assert.equal(await page.locator('[data-f="state"]').innerText(), "En mouvement");
    near(number(await cell(page, "distance")), 5.4, 0.04, "distance after the second ride");

    // a weak position is shown as such and not used
    await page.clock.runFor(2000);
    await emit(page, { north: pos.north + 300, east: 200 }, { acc: 62 });
    await page.clock.runFor(1000);
    assert.equal(await page.locator('[data-f="signal"]').getAttribute("data-state"), "weak");
    assert.equal(await page.locator('[data-f="signal"]').innerText(), "Signal faible ± 62 m");
    near(number(await cell(page, "distance")), 5.4, 0.04, "a weak position adds nothing");

    // finish asks first; cancelling keeps the recording running
    await page.locator('[data-act="finish"]').click();
    const dialog = page.locator("dialog.asc-sheet[open]");
    assert.match(await dialog.innerText(), /Terminer la sortie \?.*Tant que tu n’as pas confirmé, la sortie continue d’être enregistrée\./s);
    await dialog.locator("[data-cancel]").click();
    assert.equal(await page.locator(".gps-live").getAttribute("data-status"), "recording");
    await ride(page, pos, 30);
    await page.clock.runFor(1000);
    near(number(await cell(page, "distance")), 5.58, 0.04, "still recording after a cancelled finish");
    assert.equal(f.outside.length, sinceStart, "no request left 127.0.0.1 during the recording");
    await page.locator('[data-act="finish"]').click();
    await dialog.locator("[data-ok]").click();
    await page.locator('[data-gps-state="bilan"]').waitFor();

    // summary: the breakdown matches the construction (600 + 300 + 30 s moving at 6 m/s, 20 min stopped, 2 min paused)
    const fig = async (key) => Number(await page.locator(`[data-fig="${key}"]`).getAttribute("data-seconds"));
    const text = await page.locator(".gps-bilan").innerText();
    near(number(await page.locator('[data-fig="distance"] dd').innerText()), 5.58, 0.04, "summary distance");
    near(await fig("moving"), 930, 12, "moving"); near(await fig("stopped"), 1200, 15, "stopped"); assert.equal(await fig("paused"), 120);
    const total = await fig("elapsed");
    near(total, 600 + 1 + 1200 + 1 + 120 + 300 + 1 + 3 + 30 + 1, 3, "total");
    near(await fig("moving") + await fig("stopped") + await fig("paused"), total, 2, "the pieces add up to the total");
    assert.equal(await page.locator('[data-fig="missing"]').count(), 0, "no « sans position » line when there is none");
    near(number(await page.locator('[data-fig="avgMoving"] dd').innerText()), 21.6, 0.3, "moving average");
    near(number(await page.locator('[data-fig="avgOverall"] dd').innerText()), (5580 / total) * 3.6, 0.3, "overall average");
    assert.match(text, /Dénivelé : l’altitude donnée par ce navigateur n’était pas assez fiable/);
    assert.match(await page.locator(".gps-timebar").getAttribute("aria-label"), /^Répartition du temps : En mouvement 15 min \d\d, À l’arrêt (19|20) min \d\d, En pause 2 min$/);
    assert.deepEqual(await page.locator(".gps-legend li").evaluateAll((els) => els.map((e) => e.querySelector("i").dataset.kind)), ["moving", "stopped", "paused"]);
    assert.equal(await page.locator(".gps-table tbody tr").count(), 6, "five full kilometres and the rest");
    assert.match(await page.locator("[data-stops]").innerText(), /^1 arrêt détecté, le plus long de (19|20) min \d\d\.$/);
    assert.match(await page.locator("[data-quality]").innerText(), /1 position refusée : 1 trop imprécises \(plus de 30 m\)\. Aucun trou dans la trace\./);
    await page.locator(".gps-how summary").click();
    assert.match(await page.locator(".gps-how").innerText(), /Temps total : du départ à la fin.*un arrêt est compté quand tu restes dans un rayon/s);
    await page.locator(".gps-how summary").click();
    assert.ok(await pixels(page, CYAN, ".gps-bilan") > 200, "the summary map shows the trace");
    await shot(page, "web-bilan", { fullPage: true });
    await axe(page, "summary");

    // export: the full private trace, two pieces (the pause is not bridged)
    const download = page.waitForEvent("download");
    await page.locator('[data-act="export"]').click();
    const file = await download;
    assert.equal(file.suggestedFilename(), "titan-gravel-2026-11-21.gpx");
    const xml = readFileSync(await file.path(), "utf8");
    assert.equal((xml.match(/<trkseg>/g) || []).length, 2); assert.match(xml, /<time>2026-11-21T08:/);

    // save: one session, whatever the number of presses, and the same one after a reload
    await page.locator('[data-act="save"]').dblclick();
    await page.locator('.gps-bilan a[href="/journal"]').waitFor();
    assert.match(await page.locator("[data-bilan-status]").innerText(), /^Séance enregistrée sur cet appareil, comme toute séance en découverte\..*La trace reste sur cet appareil : exporte-la en GPX pour la garder\.$/);
    const journal = () => page.evaluate(async () => {
      const mine = (l) => l.details?.hasGpx === true;
      const kept = await window.TitanQueue.readHistory(window.state.user.id);
      return { state: window.state.history.filter(mine), device: kept.filter(mine) };
    });
    let j = await journal();
    assert.equal(j.state.length, 1); assert.equal(j.device.length, 1);
    const log = j.state[0];
    assert.equal(log.sport, "gravel"); assert.equal(log.unit, "km"); near(log.val, 5.58, 0.04, "saved kilometres");
    near(log.details.duration, 15.5, 0.3, "saved effort minutes: the moving time"); assert.equal(log.details.gps.rules, "gps-engine-v1");
    near(log.details.gps.stoppedS, 1200, 15, "digest"); assert.equal(log.details.gps.pausedS, 120); assert.equal(log.details.gps.client, "web");
    assert.equal(log.date, new Date(T0 + 120050).toISOString().slice(0, 17) + log.date.slice(17), "performed at the start of the outing");
    assert.doesNotMatch(JSON.stringify(log), /48\.5\d|7\.7\d\d|"lat"|"lon"/, "the session carries no position");
    const kept = (await stored(page))[0];
    assert.equal(kept.eventId, log.client_event_id); assert.equal(kept.saved.id, log.client_event_id);

    await page.reload();
    await settle(page, '[data-gps-state="bilan"]');
    assert.equal(await page.locator('[data-act="save"]').count(), 0, "a saved outing is not offered for saving again");
    assert.equal(await page.locator('.gps-bilan a[href="/journal"]').count(), 1);
    j = await journal();
    assert.equal(j.device.length, 1); assert.equal(j.device[0].client_event_id, log.client_event_id);
    // a second save of the same recording (a crash between the write and the note that it was done) is the same session
    await page.evaluate(async () => {
      const open = await new Promise((r) => { const o = indexedDB.open("titan_gps_web_v1", 1); o.onsuccess = () => r(o.result); });
      await new Promise((r) => { const tx = open.transaction("recordings", "readwrite"), s = tx.objectStore("recordings"), all = s.getAll(); all.onsuccess = () => { const row = all.result[0]; row.rec.saved = null; s.put(row); }; tx.oncomplete = r; });
    });
    await page.reload();
    await settle(page, '[data-act="save"]');
    await page.locator('[data-act="save"]').click();
    await page.locator('.gps-bilan a[href="/journal"]').waitFor();
    j = await journal();
    assert.equal(j.device.length, 1, "the same client_event_id never makes a second session"); assert.equal(j.state.length, 1);

    // nothing that left (or tried to leave) carried a position, a distance or a place
    for (const r of f.outside) assert.doesNotMatch(r.url + r.body, /48\.5\d|7\.7\d\d|5[.,]5\d|gravel/, `no outing data in ${r.url}`);
    // a new outing clears the trace from this device
    await page.locator('[data-act="new"]').click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await settle(page, '[data-gps-state="prepare"]');
    assert.deepEqual(await stored(page), []);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("reload in the middle: resume offered with the figures kept; a second tab does not record; the background is « sans position »", async () => {
  const f = await fixture(), { page } = f;
  try {
    await begin(page, "running");
    const pos = { north: 0, east: 0 };
    await emit(page, pos);
    await ride(page, pos, 300, { speed: 3 });
    await page.clock.runFor(1000);
    assert.deepEqual(await page.locator(".gps-mains dt").allInnerTexts(), ["Distance", "En mouvement"]);
    assert.equal(await cell(page, "speed"), "5:33", "a foot sport reads a pace");
    const distance = await cell(page, "distance");
    near(number(distance), 0.9, 0.02, "distance before the reload");

    // a second tab of the same browser is told, and never touches the recording
    const other = await fixture({ context: f.context });
    await settle(other.page, '[data-gps-state="othertab"]');
    assert.match(await other.page.locator("#sortie").innerText(), /Une sortie s’enregistre dans un autre onglet/);
    assert.equal(await other.page.evaluate(() => window.__gps.watches), 0);
    await other.page.close();
    assert.equal((await stored(page))[0].status, "recording");

    // the tab goes to the background for 4 minutes while the athlete runs on: no position arrives
    const visibility = (state) => page.evaluate((s) => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s }); document.dispatchEvent(new Event("visibilitychange")); }, state);
    await visibility("hidden");
    await page.clock.fastForward(240000);
    pos.north += 720;
    await visibility("visible");
    await page.clock.runFor(500);
    assert.match(await page.locator("[data-notice]").innerText(), /Page en arrière-plan ou écran verrouillé pendant 4:00 : aucune position n’est arrivée\. Ce temps est compté « sans position », la distance n’est pas inventée et la trace n’est pas reliée\./);
    assert.match(await page.locator('[data-f="state"]').innerText(), /^Sans signal depuis 4:0\d$/);
    assert.equal(await page.evaluate(() => window.__gps.watches), 2, "the watch is started again on return");
    await emit(page, pos);
    await ride(page, pos, 60, { speed: 3 });
    await page.clock.runFor(1000);
    near(number(await cell(page, "distance")), 1.08, 0.02, "the 720 m of the hole are not added");
    await page.locator('[data-act="notice-close"]').click();
    const before = { distance: await cell(page, "distance"), moving: seconds(await cell(page, "moving")) };

    // reload: the page that comes back offers the outing, interrupted at its last position
    await page.clock.runFor(4000);
    await page.reload();
    await settle(page, '[data-gps-state="resume"]');
    const offer = await page.locator(".gps-resume").innerText();
    assert.match(offer, /Une sortie est en cours sur cet appareil/);
    assert.match(offer, /Course à pied, commencée samedi 21 novembre à 09:02\. L’enregistrement s’est interrompu à 09:12:0\d, à la dernière position reçue/);
    assert.deepEqual(await page.locator(".gps-resume-actions button").allInnerTexts().then((l) => l.map((t) => t.trim())), ["Reprendre", "Terminer", "Abandonner"]);
    assert.equal((await page.locator('.gps-resume [data-fig="distance"]').innerText()).replace(/\s+/g, " "), `${before.distance} km`);
    near(seconds(await page.locator('.gps-resume [data-fig="moving"]').innerText()), before.moving, 2, "moving kept");
    const kept = (await stored(page))[0];
    assert.equal(kept.status, "paused"); assert.equal(kept.interrupted, true); assert.equal(kept.stretches[0].why, "interrupted");
    await shot(page, "web-reprise");

    await page.clock.runFor(90000); // the athlete looks at the offer for a while: that time is not effort
    await page.locator('[data-act="resume"]').click();
    await page.locator('[data-gps-state="live"]').waitFor();
    assert.equal(await cell(page, "distance"), before.distance, "figures kept after the reload");
    pos.north += 200;
    await emit(page, pos);
    await ride(page, pos, 120, { speed: 3 });
    await page.clock.runFor(1000);
    near(number(await cell(page, "distance")), 1.44, 0.03, "the outing goes on");
    await page.locator('[data-act="finish"]').click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await page.locator('[data-gps-state="bilan"]').waitFor();
    const fig = async (key) => Number(await page.locator(`[data-fig="${key}"]`).getAttribute("data-seconds"));
    near(await fig("missing"), 240, 6, "« sans position »"); near(await fig("paused"), 94, 6, "the reload is an interruption, counted with the pauses");
    near(await fig("moving"), 300 + 60 + 120, 10, "moving");
    assert.match(await page.locator(".gps-bilan").innerText(), /« En pause » compte tes pauses et 1 min 3\d d’enregistrement interrompu/);
    assert.match(await page.locator("[data-quality]").innerText(), /1 trou dans la trace \(4 min( \d\d)? sans position\), soit au moins 0,7\d km à vol d’oiseau non ajoutés à la distance\./);
    assert.equal((await stored(page))[0].track.segs.length, 3, "three pieces of trace: before the hole, after it, after the reload");
    // abandoning asks, then leaves nothing
    await page.locator('[data-act="discard"]').click();
    await page.locator("dialog.asc-sheet[open] [data-cancel]").click();
    assert.equal(await page.locator('[data-gps-state="bilan"]').count(), 1);
    await page.locator('[data-act="discard"]').click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await settle(page, '[data-gps-state="prepare"]');
    assert.deepEqual(await stored(page), []);
    assert.equal(await page.evaluate(() => window.state.history.length), 0, "no session was created");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("a GPX is previewed then followed: distance to the route, remaining, off the route in amber, back on it, and the way back to the start", async () => {
  const f = await fixture(), { page } = f;
  try {
    const line = Array.from({ length: 81 }, (_, i) => at(i * 50));
    await page.locator('[data-sport="gravel"]').click();
    await page.locator('[data-open="route"]').click();
    const sheet = page.locator("dialog.asc-sheet[open]");
    // a file without altitude shows no climb at all, and can be cancelled
    await sheet.locator("[data-gpx-file]").setInputFiles({ name: "plat.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx(line, { ele: false, name: "Sans altitude" })) });
    await sheet.locator("[data-gpx-preview]").waitFor();
    assert.equal(await sheet.locator('[data-fact="ascent"]').count(), 0);
    assert.match(await sheet.locator("[data-gpx-preview]").innerText(), /Pas de dénivelé : le fichier ne donne pas l’altitude de chaque point\./);
    await sheet.locator('[data-route="cancel"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem(`titan.gps.follow.v1:${window.state.user.id}`)), null);
    await sheet.locator("[data-gpx-file]").setInputFiles({ name: "canal.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx(line)) });
    await sheet.locator("[data-gpx-preview]").waitFor();
    assert.match(await sheet.locator("[data-gpx-preview]").innerText(), /Canal du matin/);
    assert.equal((await sheet.locator('[data-fact="distance"] dd').innerText()).replace(/\s+/g, " "), "4,00 km");
    assert.equal((await sheet.locator('[data-fact="ascent"] dd').innerText()).replace(/\s+/g, " "), "80 m");
    assert.equal(await sheet.locator('[data-fact="points"] dd').innerText(), "81");
    assert.equal(await sheet.locator('[data-fact="segments"] dd').innerText(), "1");
    assert.match(await sheet.locator("[data-gpx-preview]").innerText(), /Aucun point ignoré\./);
    assert.ok(await pixels(page, AMBER, "dialog[open]") > 60, "the preview draws the route");
    await shot(page, "web-gpx-apercu");
    await sheet.locator('[data-route="follow"]').click();
    assert.equal(await page.locator('[data-row-sub="route"]').innerText(), "Canal du matin · 4,00 km");
    const handed = await page.evaluate(() => JSON.parse(localStorage.getItem(`titan.gps.follow.v1:${window.state.user.id}`)));
    assert.equal(handed.id, null); assert.equal(handed.route.name, "Canal du matin"); assert.equal(handed.route.distanceM, 4000); assert.ok(handed.at > 0);
    // the hand-off survives a reload of the preparation, and can be removed
    await page.reload();
    await page.locator('[data-gps-state="prepare"]').waitFor();
    assert.equal(await page.locator('[data-row-sub="route"]').innerText(), "Canal du matin · 4,00 km");
    await page.locator('[data-open="route"]').click();
    assert.match(await sheet.locator("[data-route-current]").innerText(), /Canal du matin\s+4,00 km · D\+ 80 m · 81 points\s+Retirer/);
    await sheet.locator("[data-close]").click();

    await begin(page);
    const banner = page.locator('[data-banner="follow"]');
    assert.match(await banner.innerText(), /Parcours à suivre\s*Canal du matin/);
    const pos = { north: 0, east: -150 };
    await emit(page, pos);
    await page.clock.runFor(1000);
    assert.equal((await banner.locator('[data-b="title"]').innerText()), "À 150 m du parcours");
    assert.equal(await banner.getAttribute("data-tone"), "far");
    await ride(page, pos, 25, { bearing: 90 });
    await ride(page, pos, 420);
    await page.clock.runFor(1000);
    assert.equal(await banner.getAttribute("data-tone"), "on");
    assert.equal(await banner.locator('[data-b="title"]').innerText(), "Reste 1,48 km");
    assert.match(await banner.locator('[data-b="line"]').innerText(), /^Environ \d+ min à \d+ min à ton rythme en mouvement, hors arrêts, relief non pris en compte\.$/);
    assert.ok(await pixels(page, AMBER) > 40, "the route to follow is drawn in amber");
    assert.ok(await pixels(page, CYAN) > 200);
    await shot(page, "web-suivi");

    // leaves the line: said after 10 s and three positions, in amber, with the margin that accounts for the GPS
    const tones = [];
    for (let k = 0; k < 4; k++) { await ride(page, pos, 5, { bearing: 90, speed: 8 }); await page.clock.runFor(200); tones.push(await banner.getAttribute("data-tone")); }
    assert.deepEqual(tones, ["on", "on", "on", "off"]);
    assert.equal(await banner.locator('[data-b="title"]').innerText(), "Hors parcours · 160 m");
    assert.match(await banner.locator('[data-b="line"]').innerText(), /^Écart supérieur à la marge de 40 m, précision du GPS comprise\./);
    assert.equal(await banner.evaluate((el) => getComputedStyle(el).borderLeftColor), "rgb(244, 187, 84)");
    assert.match(await page.locator("#sortie-annonce").innerText(), /^Hors parcours, à 160 mètres du tracé\.$/);
    await shot(page, "web-hors-parcours");
    await ride(page, pos, 20, { bearing: 270, speed: 8 });
    await page.clock.runFor(1000);
    assert.equal(await banner.getAttribute("data-tone"), "on");
    assert.match(await banner.locator('[data-b="title"]').innerText(), /^Reste 1,4\d km$/);
    assert.equal(await page.locator("#sortie-annonce").innerText(), "De retour sur le parcours.");

    // back to the start: two honest options and a direction, then guidance by the same path
    await page.locator('[data-act="more"]').click();
    await page.locator('[data-more="back"]').click();
    const back = page.locator("dialog.asc-sheet[open]");
    const same = await back.locator('[data-back-option="same"]').innerText();
    assert.match(same, /Par le même chemin\s+3,0\d km en repassant par ta trace, dans l’autre sens\. Environ \d+ min à \d+ min à ton rythme en mouvement, hors arrêts ; le relief n’est pas pris en compte\./);
    assert.match(await back.locator('[data-back-option="computed"]').innerText(), /Itinéraire calculé\s+Le calcul d’itinéraire demande un compte\./);
    assert.match(await back.locator('[data-back-option="straight"]').innerText(), /Ton départ est à 2,5\d km vers le sud \(18\d°\)\. C’est une direction et une distance minimale, pas un chemin : elle n’est pas tracée sur la carte\./);
    assert.equal(await back.locator("[data-back-warning]").innerText(), "Indication seulement : TITAN ne garantit ni l’état ni la sécurité du chemin.");
    await shot(page, "web-retour");
    await back.locator('[data-back="same"]').click();
    const home = page.locator('[data-banner="back"]');
    await home.waitFor();
    assert.equal(await page.locator('[data-banner="follow"]').count(), 0);
    await ride(page, pos, 60, { bearing: 180 });
    await page.clock.runFor(1000);
    assert.match(await home.locator('[data-b="title"]').innerText(), /^Reste 2,6\d km$/);
    assert.equal(await home.locator('[data-b="value"]').innerText(), "jusqu’au départ");
    await shot(page, "web-retour-guidage");
    // the guidance can be stopped, and the chosen route is followed again
    await page.locator('[data-act="more"]').click();
    await page.locator('[data-more="back"]').click();
    await back.locator('[data-back="stop"]').click();
    await page.locator('[data-banner="follow"]').waitFor();
    assert.equal(await page.locator('[data-banner="back"]').count(), 0);
    // personal points need an account in discovery
    await page.locator('[data-act="more"]').click();
    await page.locator('[data-more="place"]').click();
    assert.match(await back.innerText(), /Les lieux personnels demandent un compte/);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("a structured session and a goal while moving: steps change by themselves or on demand, vibrate when asked, and leave their laps", async () => {
  const f = await fixture(), { page } = f;
  try {
    await page.locator('[data-sport="running"]').click();
    const sheet = page.locator("dialog.asc-sheet[open]");
    await page.locator('[data-open="plan"]').click();
    await sheet.locator('[data-part="warmup"] [data-part-value]').fill("1");
    await sheet.locator("[data-plan-reps]").fill("1");
    await sheet.locator('[data-part="work"] [data-part-mode]').selectOption("m");
    await sheet.locator('[data-part="work"] [data-part-value]').fill("200");
    await sheet.locator('[data-part="cooldown"] [data-part-mode]').selectOption("manual");
    assert.equal(await sheet.locator("[data-plan-vibrate]").isChecked(), true);
    await sheet.locator('[data-plan="ok"]').click();
    await page.locator('[data-open="goal"]').click();
    await sheet.locator("[data-goal-km]").fill("0.5");
    await sheet.locator('[data-goal="ok"]').click();
    await begin(page, "running");
    const step = page.locator('[data-banner="step"]'), goal = page.locator('[data-banner="goal"]');
    const pos = { north: 0, east: 0 };
    await emit(page, pos);
    await ride(page, pos, 30, { speed: 3 });
    assert.equal(await step.locator('[data-b="title"]').innerText(), "Échauffement · 1/3");
    assert.match(await step.locator('[data-b="value"]').innerText(), /^0:[23]\d$/);
    assert.equal(await step.locator('[data-b="line"]').innerText(), "Ensuite : Effort · 0,20 km");
    assert.equal(await goal.locator('[data-b="title"]').innerText(), "Objectif 0,5 km");
    assert.match(await goal.locator('[data-b="line"]').innerText(), /^Reste 0,4\d km Estimation disponible après 5 min de mouvement\.$/);
    await ride(page, pos, 35, { speed: 3 });
    await page.clock.runFor(1000);
    assert.equal(await step.locator('[data-b="title"]').innerText(), "Effort · 2/3");
    assert.deepEqual(await page.evaluate(() => window.__vibrations), [[200, 100, 200]]);
    assert.equal(await page.locator("#sortie-annonce").innerText(), "Étape : Effort.");
    await shot(page, "web-seance-structuree");
    await ride(page, pos, 70, { speed: 3 });
    await page.clock.runFor(1000);
    assert.equal(await step.locator('[data-b="title"]').innerText(), "Retour au calme · 3/3");
    assert.match(await step.locator('[data-b="value"]').innerText(), /\(au signal\)$/);
    await ride(page, pos, 40, { speed: 3 });
    await page.clock.runFor(1000);
    assert.equal(await goal.getAttribute("data-tone"), "done");
    assert.match(await goal.locator('[data-b="line"]').innerText(), /^Objectif de distance atteint\./);
    await step.locator('[data-act="next-step"]').click();
    assert.equal(await step.locator('[data-b="title"]').innerText(), "Séance structurée terminée");
    assert.equal(await page.evaluate(() => window.__vibrations.length), 3);
    await page.locator('[data-act="finish"]').click();
    await sheet.locator("[data-ok]").click();
    await page.locator('[data-gps-state="bilan"]').waitFor();
    const laps = await page.locator("[data-plan-summary] li").allInnerTexts();
    assert.equal(laps.length, 3);
    assert.match(laps[0], /^Échauffement · 1:00 · 0,1\d km$/); assert.match(laps[1], /^Effort · 1:\d\d · 0,2\d km$/); assert.match(laps[2], /^Retour au calme · 0:\d\d · 0,1\d km · passé à la main$/);
    assert.match(await page.locator("[data-plan-summary]").innerText(), /Toutes les étapes ont été faites\./);
    assert.equal(await page.locator("[data-goal-result]").getAttribute("data-goal-result"), "true");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("position refused: before the first position there is no outing; withdrawn during one, the recording stops cleanly and nothing is lost", async () => {
  const f = await fixture(), { page } = f;
  try {
    await begin(page);
    await page.evaluate(() => window.__gps.fail(1));
    await page.locator('[data-gps-state="prepare"]').waitFor();
    assert.match(await page.locator("[data-start-error]").innerText(), /^Position refusée : la sortie n’a pas démarré\. Autorise la position pour ce site dans les réglages de ton navigateur/);
    assert.match(await page.locator('[data-perm="denied"]').innerText(), /La position est bloquée pour ce site\..*enregistre ta séance à la main depuis Enregistrer/s);
    await page.clock.runFor(500);
    assert.deepEqual(await stored(page), [], "nothing was kept");
    assert.equal(await page.locator(".asc-tabbar").isVisible(), true);
    await shot(page, "web-position-refusee");

    // allowed again: the outing starts; a transient error keeps the watch; a withdrawal interrupts
    await page.locator('[data-act="start"]').click();
    await page.locator('[data-gps-state="live"]').waitFor();
    const pos = { north: 0, east: 0 };
    await emit(page, pos);
    await ride(page, pos, 120);
    await page.evaluate(() => window.__gps.fail(2));
    assert.equal(await page.locator(".gps-live").getAttribute("data-status"), "recording");
    await ride(page, pos, 30);
    await page.clock.runFor(1000);
    const distance = await cell(page, "distance");
    near(number(distance), 0.9, 0.02, "distance");
    await page.clock.runFor(2000);
    await page.evaluate(() => window.__gps.fail(1));
    assert.equal(await page.locator(".gps-live").getAttribute("data-status"), "paused");
    assert.equal(await page.locator('[data-f="state"]').innerText(), "Enregistrement interrompu");
    assert.match(await page.locator("[data-notice]").innerText(), /L’accès à la position a été retiré : l’enregistrement s’est arrêté à la dernière position reçue, rien n’est perdu\./);
    assert.equal(await cell(page, "distance"), distance);
    const kept = (await stored(page))[0];
    assert.equal(kept.status, "paused"); assert.equal(kept.stretches[0].why, "interrupted");
    assert.deepEqual(await page.locator(".gps-foot button").allInnerTexts().then((l) => l.map((t) => t.trim())), ["Reprendre", "Terminer", "Plus"]);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("320 px: preparation, the three live views, a banner and the summary never scroll sideways; the actions stay reachable", async () => {
  const f = await fixture({ width: 320, height: 568 }), { page } = f;
  try {
    await noSideScroll(page, "preparation");
    const start = await page.locator('[data-act="start"]').boundingBox();
    assert.ok(start.y + start.height <= 568 && start.height >= 48, "the start is under the thumb without scrolling");
    await page.locator('[data-open="goal"]').click();
    await page.locator("dialog.asc-sheet[open] [data-goal-km]").fill("100");
    await page.locator('dialog.asc-sheet[open] [data-goal="ok"]').click();
    await begin(page, "running");
    const pos = { north: 0, east: 0 };
    await emit(page, pos);
    await ride(page, pos, 3900, { speed: 3, step: 30 }); // more than an hour: the widest chronometer
    await page.clock.runFor(1000);
    for (const view of ["mixed", "dash", "map"]) {
      await page.locator(`[data-view-set="${view}"]`).click();
      await noSideScroll(page, `live ${view}`);
      for (const act of ["pause", "finish", "more"]) {
        const box = await page.locator(`.gps-foot [data-act="${act}"]`).boundingBox();
        assert.ok(box.height >= 48 && box.y >= 0 && box.y + box.height <= 568 && box.x >= 0 && box.x + box.width <= 320, `${act} reachable in ${view}`);
      }
      const clipped = await page.evaluate(() => [...document.querySelectorAll(".gps-live .gps-cell:not([hidden])")].filter((c) => c.offsetParent && c.scrollWidth > c.clientWidth + 1).map((c) => c.dataset.key));
      assert.deepEqual(clipped, [], `no figure is cut in ${view}`);
    }
    await page.locator('[data-act="finish"]').click();
    await page.locator("dialog.asc-sheet[open] [data-ok]").click();
    await page.locator('[data-gps-state="bilan"]').waitFor();
    await noSideScroll(page, "summary");
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});
