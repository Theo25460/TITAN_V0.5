// V1.7.7 — the web route library, the planner, the personal points and the GPS bilan of a session, in a real browser.
// Synthetic account, synthetic server (a stateful stand-in for the route and place functions, with or without the v2 migration) and
// the two Netlify functions stubbed on 127.0.0.1: no production account, no provider, and no request leaves the machine.
// V177_SHOTS=1 also writes the screenshots of docs/v177/ (360 × 780, device scale factor 2).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const SHOTS = process.env.V177_SHOTS === "1";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const OWNER = "00000000-0000-4000-8000-000000000a91";
const BACKEND = (/https:\/\/[a-z0-9]+\.supabase\.co/.exec(readFileSync(`${ROOT}js/config.js`, "utf8")) || [""])[0];
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const p = createServer(); p.listen(0, () => { const n = p.address().port; p.close(() => resolve(n)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch();
  if (SHOTS) mkdirSync(`${ROOT}docs/v177`, { recursive: true });
});
after(async () => { await browser?.close(); server?.kill(); });

const gpxFile = (name = "Tour du lac", n = 150) => ({ name: "tour-du-lac.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="test"><trk><name>${name}</name><trkseg>${Array.from({ length: n }, (_, i) => `<trkpt lat="${(48.58 + Math.sin(i / 24) * 0.012).toFixed(6)}" lon="${(7.74 + Math.cos(i / 24) * 0.018).toFixed(6)}"><ele>${140 + Math.round(Math.sin(i / 9) * 12)}</ele></trkpt>`).join("")}</trkseg></trk></gpx>`) });
const planAnswer = { ok: true, provider: "openrouteservice", attribution: "Itinéraire : openrouteservice.org (HeiGIT) · Données © les contributeurs d’OpenStreetMap", profile: "hike", profileNote: null,
  distanceM: 21400, durationS: 16200, ascentM: 420, descentM: 418, segs: [Array.from({ length: 160 }, (_, i) => [48.58 + Math.sin(i / 25.4) * 0.02, 7.74 + Math.cos(i / 25.4) * 0.03 - 0.03, 140 + (i % 40)])],
  surface: [{ key: "asphalt", label: "Asphalte", share: 0.62 }, { key: "gravel", label: "Gravier", share: 0.3 }, { key: "unknown", label: "Non renseigné", share: 0.08 }],
  waytype: [{ key: "track", label: "Chemin", share: 0.55 }, { key: "road", label: "Route", share: 0.45 }],
  warnings: ["Boucle demandée : 20,0 km ; boucle calculée : 21,4 km."], requested: { profile: "hike", loop: { start: [48.5839, 7.7455], distanceM: 20000, seed: 0 }, prefer: { flat: true } } };
const poiAnswer = { ok: true, source: "OpenStreetMap", license: "ODbL", attribution: "© les contributeurs d’OpenStreetMap", fetchedAt: "2026-11-25T09:41:00Z", truncated: false, pois: [
  { id: "node/2", kind: "bike_repair", lat: 48.5912, lon: 7.7455, name: "Atelier du Canal", openingHours: "Mo-Fr 09:00-18:00", fee: null, access: "customers", osmUpdatedAt: null },
  { id: "node/1", kind: "water", lat: 48.5843, lon: 7.7461, name: null, openingHours: null, fee: "no", access: null, osmUpdatedAt: "2024-06-02T10:00:00Z" }] };

/** A journal page with a synthetic account. `seed`: which routes the stand-in server starts with; `v2`: whether it knows the V1.7.7 functions. */
async function fixture({ gps = true, v2 = true, seed = "one", guest = false, width = 360, height = 780, plan = { status: 503, body: { ok: false, code: "ROUTING_NOT_CONFIGURED" } }, poi = { status: 503, body: { ok: false, code: "POI_NOT_CONFIGURED" } }, session = "plain" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: SHOTS ? 2 : 1, serviceWorkers: "block", acceptDownloads: true, locale: "fr-FR", timezoneId: "Europe/Paris",
    geolocation: { latitude: 48.5839, longitude: 7.7455, accuracy: 9 }, permissions: ["geolocation"] });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const functions = { plan: [], poi: [], planAnswer: plan, poiAnswer: poi };
  await context.route("**/.netlify/functions/route-plan", r => { functions.plan.push({ body: r.request().postDataJSON(), auth: r.request().headers().authorization }); r.fulfill({ status: functions.planAnswer.status, contentType: "application/json", body: JSON.stringify(functions.planAnswer.body) }); });
  await context.route("**/.netlify/functions/poi-nearby", r => { functions.poi.push({ body: r.request().postDataJSON(), auth: r.request().headers().authorization }); r.fulfill({ status: functions.poiAnswer.status, contentType: "application/json", body: JSON.stringify(functions.poiAnswer.body) }); });
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  // Every address outside 127.0.0.1 is refused above, so nothing can leave. What is recorded here is what was ATTEMPTED once the
  // synthetic account is in place. The legacy engine of the page still polls its own backend with the client it created at load
  // (adventure snapshot, sport catalogue): those attempts are not this feature's and are listed apart — but none of them may be a
  // route or a place call, which must all go through the page's current client.
  const outside = [], engine = []; let watching = false;
  context.on("request", r => { if (!watching || !/^https?:/.test(r.url()) || r.url().startsWith(BASE)) return; (BACKEND && r.url().startsWith(BACKEND) ? engine : outside).push(r.url()); });
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("#jr-q").waitFor();
  await page.evaluate(({ gps, v2, seed, session, OWNER, guest }) => {
    if (!guest) window.state.user.id = OWNER; // a discovery account keeps the guest_… id the page gave it
    window.rpcCalls = [];
    const t0 = Date.UTC(2026, 10, 2, 8, 0, 0), day = 86400000;
    // 400 positions heading north, 5 m and 1 s apart (2 km); `lon` moves the whole line east: another road.
    const track = (lon, t = t0) => ({ v: 1, t0: t, segs: [Array.from({ length: 400 }, (_, i) => [Math.round((48.85 + i * 0.000045) * 1e5), Math.round(lon * 1e5), i, 1000 + i])] });
    const summary = (movingS) => ({ v: 1, rules: "gps-engine-v1", family: "run", autoPause: true, elapsedS: movingS + 95, movingS, stoppedS: 65, pausedS: 30, missingS: 0, distanceM: 2000, gapDistanceM: 0, ascentM: 40, descentM: 2, altitude: "gnss", points: 400, rejected: 3 });
    const route = (id, over = {}) => ({ id, clientRouteId: `seed-${id}`, sport: "running", startedAt: new Date(t0).toISOString(), distanceM: 2000, durationS: 400, ascentM: 40, points: 400, eventId: null, name: null, origin: "recorded", summary: null, track: track(2.35), ...over });
    const seeds = {
      none: [],
      one: [route("r1", { eventId: "evt-session-0001", name: "Canal du matin", summary: summary(400) })],
      compare: [route("r1", { eventId: "evt-session-0001", name: "Canal du matin", summary: summary(400), startedAt: new Date(t0).toISOString() }),
        route("r2", { summary: summary(372), startedAt: new Date(t0 - 7 * day).toISOString(), track: track(2.35, t0 - 7 * day) }),
        route("r3", { summary: summary(390), startedAt: new Date(t0 - 14 * day).toISOString(), track: track(2.37, t0 - 14 * day) }), // same length, another road
        route("r4", { summary: null, durationS: 431, startedAt: new Date(t0 - 21 * day).toISOString(), track: track(2.35, t0 - 21 * day) }), // saved before the summary existed
        route("r5", { sport: "cycling", summary: summary(200), startedAt: new Date(t0 - 28 * day).toISOString() })],
    };
    const db = (window.fakeServer = { routes: seeds[seed], places: [], serial: 0, v2 });
    const unknown = (fn) => ({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null }, status: 404 });
    const refuse = (message) => ({ data: null, error: { code: "22023", message }, status: 400 });
    const meta = (r, full, version) => ({ id: r.id, sport: r.sport, startedAt: r.startedAt, distanceM: r.distanceM, durationS: r.durationS, ascentM: r.ascentM, points: r.points, eventId: r.eventId,
      ...(version === 2 ? { name: r.name, origin: r.origin, summary: r.summary } : {}), ...(full ? { track: r.track } : {}) });
    const V2 = new Set(["titan_routes_v2", "titan_route_get_v2", "titan_route_save_v2", "titan_route_rename_v1", "titan_places_v1", "titan_place_save_v1", "titan_place_delete_v1"]);
    window.titanClient = { auth: { getSession: async () => ({ data: { session: { access_token: "synthetic-token-synthetic-token", user: { id: OWNER } } } }) },
      rpc: async (fn, a) => {
        window.rpcCalls.push({ fn, args: a });
        if (!navigator.onLine) return { data: null, error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" }, status: 0 };
        if (V2.has(fn) && !db.v2) return unknown(fn);
        const version = fn.endsWith("_v2") ? 2 : 1, sorted = () => [...db.routes].sort((x, y) => y.startedAt.localeCompare(x.startedAt));
        if (fn === "titan_routes_v1" || fn === "titan_routes_v2") return { data: sorted().filter((r) => !a.p_before || r.startedAt < a.p_before).slice(0, a.p_limit || 50).map((r) => meta(r, false, version)) };
        if (fn === "titan_route_get_v1" || fn === "titan_route_get_v2") { const r = db.routes.find((x) => x.id === a.p_id); return r ? { data: meta(r, true, version) } : refuse("ROUTE_NOT_FOUND"); }
        if (fn === "titan_route_for_event_v1") { const r = db.routes.find((x) => x.eventId === a.p_event_id); return { data: r ? meta(r, false, 1) : null }; }
        if (fn === "titan_route_delete_v1") { const n = db.routes.length; db.routes = db.routes.filter((x) => x.id !== a.p_id); return { data: db.routes.length < n }; }
        if (fn === "titan_route_save_v1" || fn === "titan_route_save_v2") {
          const known = db.routes.find((x) => x.clientRouteId === a.p_client_route_id);
          if (known) return { data: { id: known.id, created: false } };
          const r = { id: `new-${++db.serial}`, clientRouteId: a.p_client_route_id, sport: a.p_sport, startedAt: a.p_started_at, distanceM: a.p_distance_m, durationS: a.p_duration_s, ascentM: a.p_ascent_m,
            points: a.p_track.segs.reduce((n, s) => n + s.length, 0), eventId: null, name: version === 2 ? a.p_name : null, origin: version === 2 ? a.p_origin : "recorded", summary: version === 2 ? a.p_summary : null, track: a.p_track };
          db.routes.push(r);
          return { data: { id: r.id, created: true } };
        }
        if (fn === "titan_route_rename_v1") { const r = db.routes.find((x) => x.id === a.p_id); if (r) r.name = a.p_name.trim() || null; return { data: !!r }; }
        if (fn === "titan_route_link_v1") return { data: true };
        if (fn === "titan_places_v1") return { data: db.places.map((p) => ({ ...p })) };
        if (fn === "titan_place_save_v1") {
          const cur = db.places.find((p) => p.clientPlaceId === a.p_client_place_id), row = { id: cur ? cur.id : `place-${++db.serial}`, clientPlaceId: a.p_client_place_id, name: a.p_name, kind: a.p_kind, lat: a.p_lat, lon: a.p_lon, note: a.p_note, updatedAt: new Date().toISOString() };
          db.places = [...db.places.filter((p) => p !== cur), row];
          return { data: { id: row.id, created: !cur } };
        }
        if (fn === "titan_place_delete_v1") { const n = db.places.length; db.places = db.places.filter((p) => p.id !== a.p_id); return { data: db.places.length < n }; }
        return { data: null };
      } };
    const old = window.titanFlags.enabled;
    window.titanFlags.enabled = (k, f) => (k === "screens.routes" ? true : k === "screens.gps" ? gps : old(k, f));
    const gpsDigest = { v: 1, rules: "gps-engine-v1", family: "run", autoPause: true, elapsedS: 495, movingS: 400, stoppedS: 65, pausedS: 30, missingS: 0, distanceM: 2000, gapDistanceM: 0, ascentM: 40, descentM: 2, altitude: "gnss", points: 400, rejected: 3 };
    window.state.history = [{ id: "s1", client_event_id: "evt-session-0001", user_id: OWNER, date: "2026-11-02T08:00:00.000Z", created_at: "2026-11-02T09:00:00.000Z", sport: "running", val: 2, unit: "km",
      details: { duration: 7, client_event_id: "evt-session-0001", ...(session === "gps" ? { gps: gpsDigest } : session === "gps-hole" ? { gps: { ...gpsDigest, autoPause: false, missingS: 48, altitude: "unreliable", ascentM: null } } : {}) }, syncStatus: "confirmed" }];
    window.state.archivedHistory = [];
    window.dispatchEvent(new Event("titan:history-updated"));
  }, { gps, v2, seed, session, OWNER, guest });
  watching = true;
  const calls = (prefix = "titan_") => page.evaluate((p) => window.rpcCalls.filter((c) => c.fn.startsWith(p)).map((c) => c.fn), prefix);
  const sheet = page.locator("dialog.asc-sheet[open]").last();
  const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(350); await page.screenshot({ path: `${ROOT}docs/v177/${name}.png` }); } };
  const finish = async () => {
    assert.deepEqual(errors, [], "no script error");
    assert.deepEqual(outside, [], "no request is even attempted outside 127.0.0.1 (no map server, no routing provider, no OpenStreetMap)");
    assert.deepEqual(engine.filter((u) => /route|place|plan|poi/i.test(u)), [], "no route or place call bypasses the page's client");
  };
  // After « Enregistrer », the library ignores taps for 450 ms (the second tap of a double tap): a person's next tap comes later.
  const afterSave = () => page.waitForTimeout(500);
  const openLibrary = async () => { await page.locator("[data-routes-open]").click(); await page.locator("[data-rt-view='list'] [data-rt-items]").waitFor(); };
  const axe = async (what) => {
    await page.waitForTimeout(350); // the sheet's entrance fades in: contrast is measured once it is fully opaque
    if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(axeSource);
    const found = await page.evaluate(async () => (await window.axe.run("dialog.asc-sheet[open]:last-of-type", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations
      .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(" ")} — ${v.nodes[0].failureSummary?.split("\n")[1] || ""}`));
    assert.deepEqual(found, [], `axe: ${what}`);
  };
  const noSideScroll = async (what) => assert.deepEqual(await page.evaluate(() => { const b = document.querySelector("dialog.asc-sheet[open]:last-of-type .asc-sheet-body"); return [document.documentElement.scrollWidth <= window.innerWidth, b.scrollWidth <= b.clientWidth]; }), [true, true], `no horizontal scroll: ${what}`);
  return { context, page, errors, functions, calls, sheet, shot, finish, openLibrary, afterSave, axe, noSideScroll };
}

test("screens.gps off: the library is the one from before — a list, a map, two downloads, a deletion, and only the v1 readers", async () => {
  const f = await fixture({ gps: false }), { page } = f;
  try {
    await page.locator("[data-routes-open]").click();
    await page.locator("[data-rt-open='r1']").waitFor();
    for (const added of ["[data-rt-import]", "[data-rt-plan]", "[data-rt-places]", "[data-rt-q]", ".rt-origin"]) assert.equal(await page.locator(added).count(), 0, added);
    assert.match(await page.locator("[data-rt-open='r1']").innerText(), /Course à pied/);
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("svg.rt-map").waitFor();
    for (const added of ["[data-rt-follow]", "[data-rt-rename]", "[data-rt-compare]", "[data-rt-copy]"]) assert.equal(await page.locator(added).count(), 0, added);
    assert.equal(await page.locator("[data-rt-gpx]").count(), 1);
    assert.equal(await page.locator("[data-rt-share]").count(), 1);
    await page.locator("[data-rt-del]").click();
    await page.getByText("Aucun parcours pour le moment").waitFor();
    assert.deepEqual([...new Set(await f.calls("titan_route"))].sort(), ["titan_route_delete_v1", "titan_route_get_v1", "titan_routes_v1"]);
    assert.equal(await page.evaluate((o) => Object.keys(localStorage).filter((k) => k.startsWith("titan.routes.") || k.startsWith("titan.gps.") || k.startsWith("titan.places.")).length, OWNER), 0, "nothing new is kept in the browser");
    await f.finish();
  } finally { await f.context.close(); }
});

test("import: a valid GPX is previewed, saved once even on a double tap, and listed as « Importé »; an invalid file gives the parser's reason", async () => {
  const f = await fixture(), { page } = f;
  try {
    await f.openLibrary();
    assert.match(await page.locator("[data-rt-open='r1']").innerText(), /Canal du matin[\s\S]*Enregistré/);
    // Not a GPX: the reason comes from the parser, nothing is previewed, nothing is sent.
    await page.locator("[data-rt-file]").setInputFiles({ name: "notes.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from("ceci n'est pas un fichier GPX") });
    await page.waitForFunction(() => /incomplet ou non pris en charge/.test(document.querySelector("[data-rt-status]")?.textContent || ""));
    await page.locator("[data-rt-file]").setInputFiles({ name: "vide.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from('<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="48.1" lon="7.1"/></trkseg></trk></gpx>') });
    await page.waitForFunction(() => /ne contient pas de trace exploitable/.test(document.querySelector("[data-rt-status]")?.textContent || ""));
    assert.equal(await page.locator("[data-rt-view='import']").count(), 0);
    await page.locator("[data-rt-file]").setInputFiles(gpxFile());
    await page.locator("[data-rt-view='import'] svg.rt-map polyline").waitFor();
    const text = await f.sheet.innerText();
    assert.match(text, /Aperçu de l’import/);
    assert.match(text, /Points lus\s*150/);
    assert.match(text, /Points ignorés\s*0/);
    assert.match(text, /Tronçons\s*1/);
    assert.match(text, /Dénivelé calculé sur les altitudes du fichier, non vérifiées/);
    assert.match(text, /ne compte pas comme une séance/);
    assert.equal(await page.locator("[data-rt-name]").inputValue(), "Tour du lac");
    const sports = await page.locator("[data-rt-sport] option").allInnerTexts();
    assert.ok(sports.includes("Randonnée") && sports.includes("VTT") && !sports.includes("Musculation") && !sports.includes("Natation"), "GPS sports only");
    await page.locator("[data-rt-sport]").selectOption("hiking");
    await f.axe("import preview");
    await f.shot("web-import-apercu");
    assert.equal((await f.calls("titan_route_save")).length, 0, "nothing is saved before the athlete asks");
    await page.locator("[data-rt-save]").evaluate((b) => { b.click(); b.click(); }); // a double tap: two clicks before anything could be redrawn
    await page.locator("[data-rt-flash]").waitFor();
    assert.match(await page.locator("[data-rt-flash]").innerText(), /Parcours enregistré dans Mes parcours/);
    assert.deepEqual(await f.calls("titan_route_save"), ["titan_route_save_v2"], "exactly one save");
    const saved = await page.evaluate(() => window.rpcCalls.find((c) => c.fn === "titan_route_save_v2").args);
    assert.deepEqual([saved.p_name, saved.p_origin, saved.p_sport, saved.p_summary, saved.p_duration_s], ["Tour du lac", "imported", "hiking", null, 0]);
    assert.match(saved.p_client_route_id, /^imp-[0-9a-f]{16}$/);
    assert.equal(saved.p_track.segs[0].length, 150);
    await f.afterSave();
    const row = page.locator("[data-rt-open='new-1']");
    assert.match(await row.innerText(), /Tour du lac[\s\S]*Importé/);
    // The same file again is the same route: the server answers from the first save and the list does not grow.
    await page.locator("[data-rt-file]").setInputFiles(gpxFile());
    await page.locator("[data-rt-save]").click();
    await page.getByText("déjà dans ta bibliothèque").waitFor();
    assert.equal(await page.locator("[data-rt-open]").count(), 2);
    await f.afterSave();
    // Search by name.
    await page.locator("[data-rt-q]").fill("lac");
    assert.deepEqual(await page.locator("[data-rt-open]").evaluateAll((n) => n.map((x) => x.dataset.rtOpen)), ["new-1"]);
    await page.locator("[data-rt-q]").fill("zzz");
    await page.getByText("Aucun parcours ne porte ce nom").waitFor();
    await page.locator("[data-rt-q]").fill("");
    await f.axe("library list");
    await f.noSideScroll("library list");
    await f.shot("web-bibliotheque");
    await f.finish();
  } finally { await f.context.close(); }
});

test("detail: figures of a recorded outing, rename, the offline copy and its removal, deletion only after a confirmation", async () => {
  const f = await fixture(), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-view='detail'] svg.rt-map").waitFor();
    const text = await f.sheet.innerText();
    assert.match(text, /En mouvement\s*6 min 40/);
    assert.match(text, /Temps total\s*8 min 15/);
    assert.match(text, /À l’arrêt\s*1 min 05/);
    assert.match(text, /Une copie hors ligne contient la trace, pas un fond de carte/);
    assert.match(text, /Suivre un parcours est une indication/);
    assert.match(await page.locator("[data-rt-copy-state]").innerText(), /Copie sur cet appareil : \d+ Ko/);
    assert.equal(await page.locator("[data-rt-copy-state]").getAttribute("data-rt-copy-state"), "kept");
    await f.axe("route detail");
    await f.noSideScroll("route detail");
    await f.shot("web-parcours-detail");
    // Rename.
    await page.locator("[data-rt-rename]").click();
    await page.locator("[data-rt-new-name]").fill("Canal, version courte");
    await page.locator("[data-rt-rename-form] [type=submit]").click();
    await page.getByText("Nom enregistré.").waitFor();
    assert.equal(await page.locator("[data-rt-title]").innerText(), "Canal, version courte");
    assert.deepEqual(await page.evaluate(() => window.rpcCalls.filter((c) => c.fn === "titan_route_rename_v1").map((c) => c.args)), [{ p_id: "r1", p_name: "Canal, version courte" }]);
    // The copy can be removed, and is not silently brought back by opening the route again.
    await page.locator("[data-rt-copy-del]").click();
    assert.equal(await page.locator("[data-rt-copy-state]").getAttribute("data-rt-copy-state"), "none");
    await page.locator("[data-rt-back]").first().click();
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-view='detail'] svg.rt-map").waitFor();
    assert.equal(await page.locator("[data-rt-copy-state]").getAttribute("data-rt-copy-state"), "none");
    await page.locator("[data-rt-copy-add]").click();
    assert.equal(await page.locator("[data-rt-copy-state]").getAttribute("data-rt-copy-state"), "kept");
    // Both downloads are still there; the shareable one has neither time nor altitude.
    const full = page.waitForEvent("download");
    await page.locator("[data-rt-gpx]").click();
    const gpx = readFileSync(await (await full).path(), "utf8");
    assert.match(gpx, /<name>Canal, version courte<\/name>/); assert.match(gpx, /<time>2026-11-02T08:00:00\.000Z<\/time>/);
    const shared = page.waitForEvent("download");
    await page.locator("[data-rt-share]").click();
    const light = readFileSync(await (await shared).path(), "utf8");
    assert.ok(!light.includes("<time>") && !light.includes("<ele>") && (light.match(/<trkpt/g) || []).length < (gpx.match(/<trkpt/g) || []).length);
    // Deletion asks first: « Annuler » keeps everything.
    await page.locator("[data-rt-del]").click();
    const confirm = page.locator("dialog.asc-sheet[open]").last();
    assert.match(await confirm.innerText(), /Supprimer ce parcours \?[\s\S]*Canal, version courte[\s\S]*ne peut pas être annulée/);
    await confirm.locator("[data-cancel]").click();
    assert.equal((await f.calls("titan_route_delete")).length, 0);
    assert.equal(await page.locator("[data-rt-title]").count(), 1);
    await page.locator("[data-rt-del]").click();
    await page.locator("dialog.asc-sheet[open]").last().locator("[data-ok]").click();
    await page.getByText("Parcours supprimé.").waitFor();
    assert.deepEqual(await f.calls("titan_route_delete"), ["titan_route_delete_v1"]);
    assert.equal(await page.locator("[data-rt-open]").count(), 0);
    assert.equal(await page.evaluate((o) => JSON.parse(localStorage.getItem(`titan.routes.offline.v1:${o}`)).items.length, OWNER), 0, "the offline copy left with it");
    await f.finish();
  } finally { await f.context.close(); }
});

test("« Suivre ce parcours » writes the hand-off for the outing page and goes to /sortie", async () => {
  const f = await fixture(), { page } = f;
  try {
    // The outing page belongs to another module: a blank page stands at its address, so the hand-off is read exactly as it was written.
    await f.context.route(/\/sortie(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html lang=\"fr\"><title>sortie</title><body>sortie</body></html>" }));
    await f.openLibrary();
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-follow]").click();
    await page.waitForURL(/\/sortie$/);
    const handoff = await page.evaluate((o) => JSON.parse(localStorage.getItem(`titan.gps.follow.v1:${o}`)), OWNER);
    assert.deepEqual(Object.keys(handoff).sort(), ["at", "id", "route"]);
    assert.equal(handoff.id, "r1");
    assert.ok(Date.now() - handoff.at < 60000);
    assert.deepEqual([handoff.route.v, handoff.route.name, handoff.route.sport, handoff.route.origin, handoff.route.points, handoff.route.segs.length], [1, "Canal du matin", "running", "recorded", 400, 1]);
    assert.ok(Math.abs(handoff.route.distanceM - 2000) < 30);
    assert.ok(Math.abs(handoff.route.segs[0][0].lat - 48.85) < 1e-4 && Math.abs(handoff.route.segs[0][0].lon - 2.35) < 1e-4);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("« Suivre maintenant » from an import preview hands the route over without saving it", async () => {
  const f = await fixture({ seed: "none" }), { page } = f;
  try {
    await f.context.route(/\/sortie(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html lang=\"fr\"><title>sortie</title><body>sortie</body></html>" }));
    await f.openLibrary();
    await page.getByText("Aucun parcours pour le moment").waitFor();
    await page.locator("[data-rt-file]").setInputFiles(gpxFile("Repérage"));
    await page.locator("[data-rt-sport]").selectOption("mountain_bike");
    const saves = await f.calls("titan_route_save");
    await page.locator("[data-rt-follow-now]").click();
    await page.waitForURL(/\/sortie$/);
    const handoff = await page.evaluate((o) => JSON.parse(localStorage.getItem(`titan.gps.follow.v1:${o}`)), OWNER);
    assert.deepEqual([handoff.id, handoff.route.name, handoff.route.sport, handoff.route.origin, handoff.route.points], [null, "Repérage", "mountain_bike", "imported", 150]);
    assert.deepEqual(saves, []);
  } finally { await f.context.close(); }
});

test("offline: the list is made of the copies kept in this browser, and a kept route still opens and can be followed", async () => {
  const f = await fixture({ seed: "compare" }), { page } = f;
  try {
    await f.openLibrary();
    assert.equal(await page.locator("[data-rt-open]").count(), 5);
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-view='detail'] svg.rt-map").waitFor(); // opening a route keeps its copy
    await f.sheet.locator("[data-close]").click();
    await f.context.setOffline(true);
    await f.openLibrary();
    await page.locator("[data-rt-offline-note]").waitFor();
    assert.match(await page.locator("[data-rt-offline-note]").innerText(), /Hors ligne : parcours gardés sur cet appareil/);
    assert.deepEqual(await page.locator("[data-rt-open]").evaluateAll((n) => n.map((x) => x.dataset.rtOpen)), ["r1"], "only what was copied here");
    const before = (await f.calls("titan_route")).length;
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-view='detail'] svg.rt-map").waitFor();
    assert.match(await f.sheet.innerText(), /Canal du matin[\s\S]*affiché depuis la copie gardée sur cet appareil/);
    assert.equal(await page.locator("[data-rt-follow]").isEnabled(), true);
    assert.equal((await f.calls("titan_route")).length, before, "no request is attempted while offline");
    // An import made offline is kept here and leaves for the library when the network is back.
    await page.locator("[data-rt-back]").first().click();
    await page.locator("[data-rt-file]").setInputFiles(gpxFile("Boucle hors réseau"));
    await page.locator("[data-rt-save]").click();
    await page.getByText("Il partira vers ta bibliothèque au retour du réseau").waitFor();
    assert.match(await page.locator("[data-rt-open^='local:']").innerText(), /Boucle hors réseau[\s\S]*En attente d’envoi/);
    assert.equal((await f.calls("titan_route_save")).length, 0);
    await f.context.setOffline(false);
    await page.locator("[data-rt-open='new-1']").waitFor();
    assert.deepEqual(await f.calls("titan_route_save"), ["titan_route_save_v2"]);
    assert.equal(await page.locator("[data-rt-open^='local:']").count(), 0);
    assert.equal(await page.evaluate(() => window.fakeServer.routes.filter((r) => r.name === "Boucle hors réseau" && r.origin === "imported").length), 1);
    await f.finish();
  } finally { await f.context.close(); }
});

test("a server without the V1.7.7 functions: read and saved through v1, the name kept in this browser and the screen says so", async () => {
  const f = await fixture({ v2: false }), { page } = f;
  try {
    await f.openLibrary();
    assert.match(await page.locator("[data-rt-open='r1']").innerText(), /Course à pied[\s\S]*Enregistré/, "a v1 row: no name, recorded");
    await page.locator("[data-rt-v1]").waitFor();
    await page.locator("[data-rt-file]").setInputFiles(gpxFile());
    await page.locator("[data-rt-save]").click();
    await page.locator("[data-rt-flash]").waitFor();
    assert.match(await page.locator("[data-rt-flash]").innerText(), /Nom gardé sur cet appareil : ta bibliothèque en ligne ne prend pas encore les noms/);
    assert.deepEqual(await f.calls("titan_route_save"), ["titan_route_save_v1"], "v2 was refused once by the first read; the save goes straight to v1");
    const saved = await page.evaluate(() => window.rpcCalls.find((c) => c.fn === "titan_route_save_v1").args);
    assert.deepEqual(Object.keys(saved).sort(), ["p_ascent_m", "p_client_route_id", "p_distance_m", "p_duration_s", "p_sport", "p_started_at", "p_track"]);
    assert.match(await page.locator("[data-rt-open='new-1']").innerText(), /Tour du lac[\s\S]*Importé/, "name and origin come from this browser");
    assert.deepEqual(await page.evaluate(() => window.rpcCalls.filter((c) => c.fn === "titan_routes_v2").length), 1, "the unknown function is asked once, not at every screen");
    // Rename: the server cannot keep it yet.
    await f.afterSave();
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-rename]").click();
    await page.locator("[data-rt-new-name]").fill("Sortie du lundi");
    await page.locator("[data-rt-rename-form] [type=submit]").click();
    await page.getByText("Nom gardé sur cet appareil : ta bibliothèque en ligne ne prend pas encore les noms.").waitFor();
    assert.equal(await page.locator("[data-rt-title]").innerText(), "Sortie du lundi");
    assert.equal(await page.locator("[data-rt-name-local]").count(), 1);
    await page.locator("[data-rt-back]").first().click();
    assert.match(await page.locator("[data-rt-open='r1']").innerText(), /Sortie du lundi/);
    await f.finish();
  } finally { await f.context.close(); }
});

test("comparison: outings on the same road are ranked on moving time, another road is left out, an outing without summary is shown apart", async () => {
  const f = await fixture({ seed: "compare" }), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-compare]").click();
    await page.locator("[data-rt-comparable]").waitFor();
    const text = await f.sheet.innerText();
    assert.match(text, /Même parcours : au moins 90 % de chaque trace à moins de 40 m de l’autre/);
    const lines = await page.locator("[data-rt-comparable] li").allInnerTexts();
    assert.equal(lines.length, 2);
    assert.match(lines[0], /26 oct\. 2026[\s\S]*6 min 12[\s\S]*Meilleur temps/);
    assert.match(lines[1], /2 nov\. 2026 · cette sortie[\s\S]*6 min 40/);
    assert.match(lines[0], /\/km/, "a foot sport reads a pace");
    assert.match(await page.locator("[data-rt-approx]").innerText(), /12 oct\. 2026[\s\S]*7 min · temps actif, arrêts compris[\s\S]*jamais retenues pour un meilleur temps/);
    assert.match(await page.locator("[data-rt-other]").innerText(), /1 sortie proche en distance ne suit pas ce parcours/);
    assert.ok(!/record/i.test(text), "no « record » wording");
    assert.ok(!/Vélo/.test(await page.locator("[data-rt-result]").innerText()), "another family of sport is never a candidate");
    await f.axe("comparison");
    await f.noSideScroll("comparison");
    await f.shot("web-comparaison");
    // By hand, with any route: said to be indicative when the roads differ.
    await page.locator("[data-rt-with]").selectOption("r3");
    await page.locator("[data-rt-indicative]").waitFor();
    assert.match(await page.locator("[data-rt-indicative]").innerText(), /Parcours différents : comparaison indicative/);
    assert.equal(await page.locator(".rt-table tbody tr").count(), 2);
    await f.finish();
  } finally { await f.context.close(); }
});

test("comparison with a single outing: no best time, « Aucune autre sortie sur ce parcours », and the manual comparison", async () => {
  const f = await fixture({ seed: "one" }), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-file]").setInputFiles(gpxFile());
    await page.locator("[data-rt-save]").click();
    await page.locator("[data-rt-open='new-1']").waitFor();
    await f.afterSave();
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-compare]").click();
    await page.locator("[data-rt-none]").waitFor();
    assert.match(await page.locator("[data-rt-none]").innerText(), /Aucune autre sortie sur ce parcours/);
    assert.equal(await page.locator("[data-rt-best]").count(), 0);
    assert.match(await page.locator("[data-rt-comparable]").innerText(), /Il faut au moins deux sorties comparables/);
    await page.locator("[data-rt-with]").selectOption("new-1");
    assert.match(await page.locator("[data-rt-indicative]").innerText(), /Parcours différents : comparaison indicative/);
    assert.match(await page.locator(".rt-table").innerText(), /tracé à suivre/);
    await f.finish();
  } finally { await f.context.close(); }
});

test("planner: « not configured » says what is needed and what works meanwhile; offline says so; nothing is drawn", async () => {
  const f = await fixture(), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-plan]").click();
    await page.locator("[data-pl-view='form'] [data-pl-go]").waitFor();
    assert.match(await f.sheet.innerText(), /Pas de recherche d’adresse dans TITAN/);
    assert.equal(await page.locator("[data-pl-state]").count(), 0, "nothing is assumed before asking");
    // A point by typed coordinates, the other from the start of a library route.
    await page.locator("[data-pl-coords='0']").fill("48.5839, 7.7455");
    await page.locator("[data-pl-fill='1']").selectOption({ label: "Canal du matin" });
    await page.waitForFunction(() => /^48\.85000, 2\.35000$/.test(document.querySelector("[data-pl-coords='1']")?.value || ""));
    assert.match(await page.locator("[data-pl-note='1']").innerText(), /Départ de « Canal du matin »/);
    // An invalid point is said about that point, and nothing is sent.
    await page.locator("[data-pl-coords='0']").fill("12 rue des Lilas");
    await page.locator("[data-pl-go]").click();
    await page.waitForFunction(() => /Le départ n’a pas de position valide/.test(document.querySelector("[data-pl-status]")?.textContent || ""));
    assert.equal(f.functions.plan.length, 0);
    await page.locator("[data-pl-coords='0']").fill("48.5839, 7.7455");
    await page.locator("[data-pl-go]").click();
    await page.locator("[data-pl-state='not_configured']").waitFor();
    const panel = await page.locator("[data-pl-state='not_configured']").innerText();
    assert.match(panel, /La planification n’est pas encore activée sur le serveur/);
    assert.match(panel, /fournisseur d’itinéraires, configuré sur le serveur de TITAN/);
    assert.match(panel, /importer un GPX[\s\S]*suivre un parcours que tu as déjà enregistré[\s\S]*revenir par le même chemin/);
    assert.equal(await page.locator("svg.rt-map").count(), 0, "no made-up line");
    assert.deepEqual(f.functions.plan.map((c) => c.body), [{ profile: "run", points: [[48.5839, 7.7455], [48.85, 2.35]] }]);
    assert.equal(f.functions.plan[0].auth, "Bearer synthetic-token-synthetic-token");
    assert.equal(await page.locator("[data-pl-coords='0']").inputValue(), "48.5839, 7.7455", "what was typed is kept");
    await f.axe("planner, not configured");
    await f.noSideScroll("planner, not configured");
    await f.shot("web-planification-non-configuree");
    // Reorder and remove: a via point is added, moved, dropped.
    await page.locator("[data-pl-via]").click();
    await page.locator("[data-pl-coords='1']").fill("48.6, 7.8");
    await page.locator("[data-pl-down='1']").click();
    assert.deepEqual(await page.locator("[data-pl-coords]").evaluateAll((n) => n.map((x) => x.value)), ["48.5839, 7.7455", "48.85000, 2.35000", "48.6, 7.8"]);
    await page.locator("[data-pl-drop='1']").click();
    assert.equal(await page.locator("[data-pl-coords]").count(), 2);
    // Offline.
    await f.context.setOffline(true);
    await page.locator("[data-pl-view='form'] > [data-pl-go]").click();
    await page.locator("[data-pl-state='offline']").waitFor();
    assert.match(await page.locator("[data-pl-state='offline']").innerText(), /Le calcul d’itinéraire demande une connexion\. Tes parcours enregistrés restent utilisables\./);
    assert.equal(f.functions.plan.length, 1, "no request while offline");
    await f.context.setOffline(false);
    // Each refusal has its sentence.
    for (const [status, code, state, words] of [[422, "NO_ROUTE", "no_route", /Aucun itinéraire trouvé avec ce profil/], [429, "RATE_LIMITED", "rate", /Trop de calculs en peu de temps/], [503, "QUOTA_EXCEEDED", "quota", /quota de calculs/], [502, "UPSTREAM_UNAVAILABLE", "unavailable", /n’a pas répondu correctement/]]) {
      f.functions.planAnswer = { status, body: { ok: false, code } };
      await page.locator("[data-pl-view='form'] > [data-pl-go]").click();
      await page.locator(`[data-pl-state='${state}']`).waitFor();
      assert.match(await page.locator(`[data-pl-state='${state}']`).innerText(), words);
    }
    assert.equal(await page.locator("[data-pl-state='unavailable'] [data-pl-go]").count(), 1, "a failure offers to try again");
    await f.finish();
  } finally { await f.context.close(); }
});

test("planner: a loop is shown with the provider's own figures, surfaces as bars, asked beside obtained, then saved as « Planifié »", async () => {
  const f = await fixture({ plan: { status: 200, body: planAnswer } }), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-plan]").click();
    await page.locator("[data-pl-sport]").selectOption("hiking");
    assert.equal(await page.locator("[data-pl-profile]").inputValue(), "hike", "the profile follows the sport");
    await page.locator("[data-pl-mode='loop']").click();
    // « Ma position » is explained before the browser is asked.
    await page.locator("[data-pl-fill='loop']").selectOption("here");
    assert.match(await page.locator(".rt-ask").innerText(), /ton navigateur va te demander l’autorisation de lire ta position, une seule fois/);
    assert.equal(await page.locator("[data-pl-coords='loop']").inputValue(), "", "nothing is read before the athlete agrees");
    await page.locator("[data-ask-ok]").click();
    await page.waitForFunction(() => /^48\.58390, 7\.74550$/.test(document.querySelector("[data-pl-coords='loop']")?.value || ""));
    assert.match(await page.locator("[data-pl-note='loop']").innerText(), /Ma position, lue à ± 9 m/);
    await page.locator("[data-pl-km]").fill("20");
    await page.locator("[data-pl-ceiling]").fill("300");
    await page.locator("[data-pl-prefer='flat']").check();
    await f.axe("planner form");
    await f.noSideScroll("planner form");
    await page.locator("[data-pl-go]").click();
    await page.locator("[data-pl-view='result'] svg.rt-map polyline").waitFor();
    assert.deepEqual(f.functions.plan[0].body, { profile: "hike", loop: { start: [48.5839, 7.7455], distanceM: 20000, seed: 0 }, prefer: { flat: true } });
    const text = await f.sheet.innerText();
    assert.match(text, /Durée estimée par openrouteservice\s*4 h 30|4 h 30\s*Durée estimée par openrouteservice/);
    assert.match(text, /La durée est l’estimation de openrouteservice, pas une prévision de TITAN/);
    assert.match(text, /Distance demandée : 20,0 km · obtenue : 21,4 km \(\+7 %\)\. La longueur d’une boucle est une préférence, pas une garantie\./);
    assert.match(text, /D\+ souhaité : 300 m au plus · obtenu : 420 m — au-dessus de ton souhait\. Préférence, pas garantie/);
    assert.match(text, /Préférences transmises : plutôt plat/);
    assert.match(text, /Boucle demandée : 20,0 km ; boucle calculée : 21,4 km\./);
    assert.match(text, /openrouteservice\.org \(HeiGIT\) · Données © les contributeurs d’OpenStreetMap/);
    assert.match(text, /Tracé indicatif : TITAN ne connaît ni l’état des chemins ni la circulation/);
    assert.equal(await page.locator("[data-pl-shares='Revêtement'] .pl-bar").getAttribute("aria-label"), "Revêtement : Asphalte 62 %, Gravier 30 %, Non renseigné 8 %");
    assert.deepEqual(await page.locator("[data-pl-shares='Revêtement'] .pl-legend li").allInnerTexts(), ["Asphalte · 62 %", "Gravier · 30 %", "Non renseigné · 8 %"]);
    assert.equal(await page.locator("[data-pl-shares='Type de voie'] .pl-bar-part").count(), 2);
    const widths = await page.locator("[data-pl-shares='Revêtement'] .pl-bar-part").evaluateAll((n) => n.map((x) => x.getBoundingClientRect().width));
    assert.ok(widths[0] > widths[1] && widths[1] > widths[2] && widths[2] > 1, `bars follow the shares: ${widths}`);
    await f.axe("planner result");
    await f.noSideScroll("planner result");
    await page.locator("[data-pl-view='result'] .rt-legend").evaluate((n) => n.scrollIntoView({ block: "start" })); // figures, asked beside obtained and the bars in one picture
    await f.shot("web-planification");
    // « Autre proposition » asks again with another seed.
    await page.locator("[data-pl-again]").click();
    await page.waitForFunction(() => document.querySelector("[data-pl-view='result'] [data-pl-save]"));
    assert.equal(f.functions.plan.length, 2);
    assert.notEqual(f.functions.plan[1].body.loop.seed, 0);
    assert.ok(Number.isInteger(f.functions.plan[1].body.loop.seed) && f.functions.plan[1].body.loop.seed <= 99);
    // Saved once, as planned, with its name.
    await page.locator("[data-pl-name]").fill("Boucle des étangs");
    await page.locator("[data-pl-save]").evaluate((b) => { b.click(); b.click(); });
    await page.getByText("Parcours enregistré dans Mes parcours.").first().waitFor();
    assert.deepEqual(await f.calls("titan_route_save"), ["titan_route_save_v2"]);
    const saved = await page.evaluate(() => window.rpcCalls.find((c) => c.fn === "titan_route_save_v2").args);
    assert.deepEqual([saved.p_name, saved.p_origin, saved.p_sport, saved.p_distance_m, saved.p_ascent_m, saved.p_duration_s, saved.p_summary], ["Boucle des étangs", "planned", "hiking", 21400, 420, 0, null]);
    assert.equal(await page.locator("[data-pl-save]").count(), 0);
    assert.equal(await page.locator("[data-pl-saved]").isDisabled(), true, "saved: the button stays in place, disabled, so a late tap lands on nothing");
    await f.sheet.locator("[data-close]").click();
    assert.match(await page.locator("[data-rt-open='new-1']").innerText(), /Boucle des étangs[\s\S]*Planifié/);
    // An answer without surfaces says so instead of drawing bars.
    f.functions.planAnswer = { status: 200, body: { ...planAnswer, surface: null, waytype: null, durationS: null, ascentM: null, descentM: null } };
    await page.locator("[data-rt-plan]").click();
    await page.locator("[data-pl-coords='0']").fill("48.5839, 7.7455");
    await page.locator("[data-pl-coords='1']").fill("48.6, 7.8");
    await page.locator("[data-pl-go]").click();
    await page.locator("[data-pl-view='result']").waitFor();
    const bare = await f.sheet.innerText();
    assert.match(bare, /Revêtement : donnée non fournie par le fournisseur/);
    assert.match(bare, /Le fournisseur ne donne pas de durée pour ce tracé/);
    assert.equal(await page.locator(".pl-bar").count(), 0);
    assert.ok(!/Durée estimée/.test(bare));
    await f.finish();
  } finally { await f.context.close(); }
});

test("Mes points: add by typed coordinates, edit, delete after a confirmation, and each change is synchronised", async () => {
  const f = await fixture(), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-places]").click();
    await page.locator("[data-pl-view='places'] [data-pl-add]").waitFor();
    await page.locator("[data-pl-sync][data-state='synced']").waitFor();
    await page.locator("[data-pl-add]").click();
    await page.locator("[data-pl-name]").fill("Fontaine du parc");
    await page.locator("[data-pl-coords]").fill("Strasbourg");
    await page.locator("[data-pl-form] [type=submit]").click();
    assert.match(await page.locator("[data-pl-error]").innerText(), /Indique une position valide, par exemple « 48\.5839, 7\.7455 »/);
    await f.axe("point form");
    await page.locator("[data-pl-coords]").fill("48.5839, 7.7455");
    await page.locator("[data-pl-note]").fill("Coupée en hiver");
    await page.locator("[data-pl-form] [type=submit]").click();
    await page.locator(".pl-item").waitFor();
    assert.match(await page.locator(".pl-item").innerText(), /Fontaine du parc[\s\S]*Point d’eau[\s\S]*48\.58390, 7\.74550[\s\S]*Coupée en hiver/);
    await page.waitForFunction(() => window.fakeServer.places.length === 1);
    assert.deepEqual(await page.evaluate(() => { const p = window.fakeServer.places[0]; return [p.name, p.kind, p.lat, p.lon, p.note]; }), ["Fontaine du parc", "water", 48.5839, 7.7455, "Coupée en hiver"]);
    // A second point from the position, asked once and explained first.
    await page.locator("[data-pl-add]").click();
    await page.locator("[data-pl-name]").fill("Abri du col");
    await page.locator("[data-pl-kind]").selectOption("shelter");
    await page.locator("[data-pl-here]").click();
    assert.match(await page.locator(".rt-ask").innerText(), /une seule fois/);
    await page.locator("[data-ask-ok]").click();
    await page.waitForFunction(() => document.querySelector("[data-pl-coords]")?.value === "48.58390, 7.74550");
    await page.locator("[data-pl-form] [type=submit]").click();
    await page.waitForFunction(() => document.querySelectorAll(".pl-item").length === 2 && window.fakeServer.places.length === 2);
    await page.locator("[data-pl-sync][data-state='synced']").waitFor();
    await f.axe("places list");
    await f.noSideScroll("places list");
    await f.shot("web-points");
    // Edit.
    await page.locator(".pl-item", { hasText: "Fontaine du parc" }).locator("[data-pl-edit]").click();
    await page.locator("[data-pl-name]").fill("Fontaine du parc (nord)");
    await page.locator("[data-pl-form] [type=submit]").click();
    await page.waitForFunction(() => window.fakeServer.places.some((p) => p.name === "Fontaine du parc (nord)"));
    assert.equal(await page.evaluate(() => window.fakeServer.places.length), 2, "an edit updates the same point");
    // Delete: asked first.
    await page.locator(".pl-item", { hasText: "Abri du col" }).locator("[data-pl-del]").click();
    const confirm = page.locator("dialog.asc-sheet[open]").last();
    assert.match(await confirm.innerText(), /Supprimer ce point \?[\s\S]*Abri du col/);
    await confirm.locator("[data-cancel]").click();
    assert.equal(await page.locator(".pl-item").count(), 2);
    await page.locator(".pl-item", { hasText: "Abri du col" }).locator("[data-pl-del]").click();
    await page.locator("dialog.asc-sheet[open]").last().locator("[data-ok]").click();
    await page.waitForFunction(() => document.querySelectorAll(".pl-item").length === 1 && window.fakeServer.places.length === 1);
    const fns = await f.calls("titan_place");
    assert.ok(fns.filter((x) => x === "titan_place_save_v1").length === 3 && fns.filter((x) => x === "titan_place_delete_v1").length === 1 && fns.includes("titan_places_v1"), fns.join(","));
    await page.waitForFunction((o) => JSON.parse(localStorage.getItem(`titan.places.v1:${o}`)).every((p) => !p.dirty && !p.deleted), OWNER);
    const stored = await page.evaluate((o) => JSON.parse(localStorage.getItem(`titan.places.v1:${o}`)), OWNER);
    assert.deepEqual(stored.map((p) => [p.name, !!p.dirty, !!p.deleted, !!p.serverId]), [["Fontaine du parc (nord)", false, false, true]]);
    // The public API the outing page uses.
    assert.deepEqual(await page.evaluate(() => window.TitanPlaces.list().map((p) => p.name)), ["Fontaine du parc (nord)"]);
    await f.finish();
  } finally { await f.context.close(); }
});

test("Mes points on a server without the functions: kept in this browser, and the screen says where they are", async () => {
  const f = await fixture({ v2: false }), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-places]").click();
    await page.locator("[data-pl-sync][data-state='local-only']").waitFor();
    assert.match(await page.locator("[data-pl-sync]").innerText(), /Enregistrés sur cet appareil seulement pour l’instant/);
    await page.locator("[data-pl-add]").click();
    await page.locator("[data-pl-name]").fill("Atelier vélo");
    await page.locator("[data-pl-kind]").selectOption("bike_repair");
    await page.locator("[data-pl-coords]").fill("48,5839 ; 7,7455");
    await page.locator("[data-pl-form] [type=submit]").click();
    await page.locator(".pl-item").waitFor();
    assert.match(await page.locator("[data-pl-sync]").innerText(), /Enregistrés sur cet appareil seulement pour l’instant/);
    assert.deepEqual(await page.evaluate((o) => JSON.parse(localStorage.getItem(`titan.places.v1:${o}`)).map((p) => [p.name, p.kind, p.lat, p.lon, p.dirty]), OWNER), [["Atelier vélo", "bike_repair", 48.5839, 7.7455, true]]);
    assert.equal((await f.calls("titan_place_save")).length, 0, "nothing is sent to a function the server does not have");
    await f.finish();
  } finally { await f.context.close(); }
});

test("Points utiles: nothing is asked before the athlete searches; « not configured » is said plainly; a result quotes its source and its hours", async () => {
  const f = await fixture(), { page } = f;
  try {
    await f.openLibrary();
    await page.locator("[data-rt-places]").click();
    await page.locator("[data-pl-tab='poi']").click();
    await page.locator("[data-poi-go]").waitFor();
    assert.match(await f.sheet.innerText(), /rien n’est demandé tant que tu ne lances pas une recherche/);
    assert.equal(f.functions.poi.length, 0);
    assert.deepEqual(await page.locator(".pl-chip span").allInnerTexts(), ["Eau", "Toilettes", "Abris", "Réparation vélo"]);
    await page.locator("[data-poi-kind][value='bike_repair']").check();
    await page.locator("[data-poi-go]").click();
    assert.match(await page.locator(".rt-ask").innerText(), /Pour chercher autour de toi, ton navigateur va te demander/);
    assert.equal(f.functions.poi.length, 0, "not before the position is agreed");
    await page.locator("[data-ask-ok]").click();
    await page.locator("[data-poi-state='not_configured']").waitFor();
    assert.match(await page.locator("[data-poi-state='not_configured']").innerText(), /n’est pas encore activée[\s\S]*OpenStreetMap configuré sur le serveur[\s\S]*« Mes points » fonctionnent sans ce service/);
    assert.deepEqual(f.functions.poi[0].body, { kinds: ["water", "bike_repair"], around: { lat: 48.5839, lon: 7.7455, radiusM: 1000 } });
    assert.equal(await page.locator(".poi-item").count(), 0, "no made-up result");
    // Configured: the list, nearest first, with what OpenStreetMap says and nothing more.
    f.functions.poiAnswer = { status: 200, body: poiAnswer };
    await page.locator("[data-poi-go]").click();
    await page.locator("[data-ask-ok]").click();
    await page.locator(".poi-item").first().waitFor();
    assert.equal(await page.locator("[data-poi-source]").innerText(), "Source : OpenStreetMap (ODbL), relevé du 25/11 à 10:41 · © les contributeurs d’OpenStreetMap");
    const items = await page.locator(".poi-item").allInnerTexts();
    assert.equal(items.length, 2);
    assert.match(items[0], /Point d’eau[\s\S]*à \d+ m · fiche modifiée en 2024[\s\S]*Indiqué gratuit \(non vérifié\)/);
    assert.match(items[1], /Atelier du Canal[\s\S]*Réparation vélo[\s\S]*à \d+ m · fraîcheur inconnue[\s\S]*Horaires indiqués : Mo-Fr 09:00-18:00 \(non vérifiés\)[\s\S]*Accès indiqué : customers \(non vérifié\)/);
    assert.ok(!/\bouvert/i.test(items.join(" ")), "never « ouvert »");
    await f.axe("points utiles");
    await f.noSideScroll("points utiles");
    await f.shot("web-points-utiles");
    await page.locator(".poi-item").nth(1).locator("[data-poi-keep]").click();
    await page.waitForFunction(() => window.fakeServer.places.some((p) => p.name === "Atelier du Canal" && p.kind === "bike_repair"));
    assert.match(await page.locator(".poi-item").nth(1).locator("[data-poi-kept]").innerText(), /Ajouté à tes points/);
    // Along a library route: the route is thinned and the points come back in the order they are met.
    await page.locator("[data-poi-mode][value='along']").check();
    await page.locator("[data-poi-route] option[value='r1']").waitFor({ state: "attached" });
    await page.locator("[data-poi-route]").selectOption("r1");
    f.functions.poiAnswer = { status: 200, body: { ...poiAnswer, pois: [{ ...poiAnswer.pois[0], lat: 48.866, lon: 2.3503 }, { ...poiAnswer.pois[1], lat: 48.852, lon: 2.3498 }] } };
    await page.locator("[data-poi-go]").click();
    await page.waitForFunction(() => /du parcours/.test(document.querySelector(".poi-item")?.textContent || ""));
    const along = f.functions.poi[f.functions.poi.length - 1].body;
    assert.deepEqual(Object.keys(along).sort(), ["along", "kinds"]);
    assert.ok(along.along.points.length >= 2 && along.along.points.length <= 60 && along.along.radiusM === 300);
    const met = await page.locator(".poi-item").allInnerTexts();
    assert.match(met[0], /Point d’eau[\s\S]*km 0,2 du parcours · à \d+ m du tracé/);
    assert.match(met[1], /Atelier du Canal[\s\S]*km 1,8 du parcours/);
    // Offline: the last list is still there, dated, and no request is attempted.
    await f.sheet.locator("[data-close]").click();
    await f.context.setOffline(true);
    const sent = f.functions.poi.length;
    await page.locator("[data-rt-places]").click();
    await page.locator("[data-pl-tab='poi']").click();
    await page.locator("[data-poi-results]").waitFor();
    assert.match(await page.locator("[data-poi-results]").innerText(), /Dernier relevé gardé sur cet appareil[\s\S]*Source : OpenStreetMap \(ODbL\), relevé du 25\/11 à 10:41/);
    await page.locator("[data-poi-go]").click();
    await page.locator("[data-poi-state='offline']").waitFor();
    assert.equal(f.functions.poi.length, sent);
    await f.context.setOffline(false);
    await f.finish();
  } finally { await f.context.close(); }
});

test("journal: a session recorded with the GPS shows its bilan, and the detail computed on the library trace", async () => {
  const f = await fixture({ session: "gps" }), { page } = f;
  try {
    await page.locator(".jr-row[data-open]").first().click();
    const bilan = page.locator("dialog.asc-sheet[open] [data-gps-bilan]");
    await bilan.waitFor();
    const text = await bilan.innerText();
    assert.match(text, /En mouvement\s*6 min 40/);
    assert.match(text, /Temps total\s*8 min 15/);
    assert.match(text, /À l’arrêt\s*1 min 05/);
    assert.match(text, /En pause\s*30 s/);
    assert.ok(!/Sans position/.test(text), "no hole in this outing: the line is not shown");
    assert.match(text, /Moyenne en mouvement\s*3:20 \/km/);
    assert.match(text, /Moyenne globale\s*4:0[78] \/km/);
    assert.match(text, /Dénivelé positif\s*40 m · altitude du GPS/);
    assert.match(text, /Durée de la séance = temps en mouvement\./);
    assert.match(await bilan.locator(".rt-timebar").first().getAttribute("aria-label"), /Répartition du temps : en mouvement 6 min 40, à l’arrêt 1 min 05, en pause 30 s/);
    // The linked route carries its times: the detail is offered, computed here, and says it is not the reference.
    await bilan.locator("[data-gps-detail]").click();
    await bilan.locator("[data-gps-splits]").waitFor();
    assert.equal(await bilan.locator("[data-gps-detail]").getAttribute("aria-expanded"), "true");
    const detail = await bilan.locator("[data-gps-detail-out]").innerText();
    assert.match(detail, /allégée \(3 000 points au plus\) : ces chiffres peuvent différer légèrement du bilan enregistré ci-dessus, qui reste la référence/);
    assert.equal(await bilan.locator("[data-gps-splits] tbody tr").count(), 2, "two kilometres");
    assert.match(await bilan.locator("[data-gps-splits]").innerText(), /Allure[\s\S]*3:2\d \/km/);
    assert.equal(await page.locator("dialog.asc-sheet[open] svg.rt-map").count(), 1, "the map of the linked route is still there");
    assert.equal(await page.locator("dialog.asc-sheet[open] [data-rt-library]").count(), 1);
    await f.axe("session detail with the GPS bilan");
    await f.noSideScroll("session detail");
    await bilan.scrollIntoViewIfNeeded();
    await f.shot("web-journal-bilan");
    await f.finish();
  } finally { await f.context.close(); }
});

test("journal: a hole, an unreliable altitude and no automatic pause are said as they are; a session without GPS keeps its display", async () => {
  const hole = await fixture({ session: "gps-hole" });
  try {
    await hole.page.locator(".jr-row[data-open]").first().click();
    const text = await hole.page.locator("dialog.asc-sheet[open] [data-gps-bilan]").innerText();
    assert.match(text, /Sans position\s*48 s/);
    assert.match(text, /Dénivelé positif\s*pas assez fiable/);
    assert.match(text, /Pause automatique désactivée : la durée de la séance garde les arrêts détectés/);
    assert.match(text, /Le temps sans position fiable n’est pas compté comme effort/);
    await hole.finish();
  } finally { await hole.context.close(); }
  const plain = await fixture({ session: "plain" });
  try {
    await plain.page.locator(".jr-row[data-open]").first().click();
    await plain.page.locator("dialog.asc-sheet[open] svg.rt-map").waitFor();
    assert.equal(await plain.page.locator("[data-gps-bilan]").count(), 0);
    assert.equal(await plain.page.locator("[data-gps-detail]").count(), 0);
    await plain.finish();
  } finally { await plain.context.close(); }
});

test("discovery account: no server library — the screens say so, and what can live in this browser does", async () => {
  const f = await fixture({ guest: true, seed: "none" }), { page } = f;
  try {
    const owner = await page.evaluate(() => window.state.user.id);
    assert.match(owner, /^guest_/);
    await f.openLibrary();
    assert.match(await page.locator("[data-rt-guest]").innerText(), /Mes parcours demande un compte[\s\S]*reste sur cet appareil seulement, sans sauvegarde ni synchronisation/);
    await page.locator("[data-rt-file]").setInputFiles(gpxFile("Repérage du dimanche"));
    assert.equal(await page.locator("[data-rt-save]").innerText(), "Garder sur cet appareil");
    await page.locator("[data-rt-save]").click();
    await page.getByText("Parcours gardé sur cet appareil seulement (mode découverte).").waitFor();
    await f.afterSave();
    assert.match(await page.locator("[data-rt-open^='local:']").innerText(), /Repérage du dimanche[\s\S]*Importé[\s\S]*Sur cet appareil/);
    await page.locator("[data-rt-open^='local:']").click();
    await page.locator("[data-rt-view='detail'] svg.rt-map").waitFor();
    assert.equal(await page.locator("[data-rt-follow]").isEnabled(), true, "a route kept here can be followed");
    assert.equal(await page.locator("[data-rt-rename]").count() + await page.locator("[data-rt-compare]").count(), 0, "nothing that needs the server is offered");
    await page.locator("[data-rt-back]").first().click();
    // The planner needs an account, and says what works without one.
    await page.locator("[data-rt-plan]").click();
    assert.match(await page.locator("[data-pl-state='guest']").innerText(), /La planification demande un compte[\s\S]*importer un GPX et le suivre/);
    assert.equal(await page.locator("[data-pl-go]").count(), 0);
    await f.sheet.locator("[data-close]").click();
    // Personal points live in this browser.
    await page.locator("[data-rt-places]").click();
    assert.match(await page.locator("[data-pl-sync][data-state='guest']").innerText(), /Mode découverte : tes points restent sur cet appareil seulement/);
    await page.locator("[data-pl-add]").click();
    await page.locator("[data-pl-name]").fill("Fontaine");
    await page.locator("[data-pl-coords]").fill("48.5839, 7.7455");
    await page.locator("[data-pl-form] [type=submit]").click();
    await page.locator(".pl-item").waitFor();
    assert.equal(await page.evaluate((o) => JSON.parse(localStorage.getItem(`titan.places.v1:${o}`)).length, owner), 1);
    await page.locator("[data-pl-tab='poi']").click();
    await page.locator("[data-poi-go]").click();
    assert.match(await page.locator("[data-poi-state='guest']").innerText(), /demande un compte/);
    assert.deepEqual(await f.calls("titan_route"), [], "no route function is called for a discovery account");
    assert.deepEqual(await f.calls("titan_place"), []);
    assert.equal(f.functions.plan.length + f.functions.poi.length, 0);
    await f.finish();
  } finally { await f.context.close(); }
});

test("320 px: the library, the planner and the points never scroll sideways, and their actions are at least 44 px high", async () => {
  const f = await fixture({ width: 320, height: 640, seed: "compare", plan: { status: 200, body: planAnswer } }), { page } = f;
  try {
    const tall = async (what) => assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("dialog.asc-sheet[open]:last-of-type :is(button, select, input:not([type=checkbox]):not([type=radio]):not([type=file]))")].filter((n) => n.offsetParent && !n.matches("[data-close]")).map((n) => [n.getAttribute("aria-label") || n.textContent.trim().slice(0, 30) || n.className, Math.round(n.getBoundingClientRect().height)]).filter(([, h]) => h < 44)), [], `44 px targets: ${what}`);
    await f.openLibrary();
    await f.noSideScroll("library"); await tall("library");
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("[data-rt-view='detail'] svg.rt-map").waitFor();
    await f.noSideScroll("detail"); await tall("detail");
    await page.locator("[data-rt-rename]").click();
    await f.noSideScroll("rename"); await tall("rename");
    await page.locator("[data-rt-compare]").click();
    await page.locator("[data-rt-comparable]").waitFor();
    await page.locator("[data-rt-with]").selectOption("r3");
    await page.locator(".rt-table").waitFor();
    await f.noSideScroll("comparison"); await tall("comparison");
    await page.locator("[data-rt-back-detail]").click();
    await page.locator("[data-rt-back]").first().click();
    await page.locator("[data-rt-file]").setInputFiles(gpxFile("Un nom de parcours volontairement très long pour vérifier le retour à la ligne"));
    await page.locator("[data-rt-view='import']").waitFor();
    await f.noSideScroll("import"); await tall("import");
    await page.locator("[data-rt-back]").first().click();
    await page.locator("[data-rt-plan]").click();
    await page.locator("[data-pl-go]").waitFor();
    await page.locator("[data-pl-via]").click();
    await f.noSideScroll("planner form"); await tall("planner form");
    await page.locator("[data-pl-drop='1']").click();
    await page.locator("[data-pl-coords='0']").fill("48.5839, 7.7455");
    await page.locator("[data-pl-coords='1']").fill("48.6, 7.8");
    await page.locator("[data-pl-go]").click();
    await page.locator("[data-pl-view='result']").waitFor();
    await f.noSideScroll("planner result"); await tall("planner result");
    await f.sheet.locator("[data-close]").click();
    await page.locator("[data-rt-places]").click();
    await page.locator("[data-pl-add]").click();
    await f.noSideScroll("point form"); await tall("point form");
    await page.locator("[data-pl-cancel]").click();
    await page.locator("[data-pl-tab='poi']").click();
    await page.locator("[data-poi-mode][value='along']").check();
    await f.noSideScroll("points utiles"); await tall("points utiles");
    await f.finish();
  } finally { await f.context.close(); }
});
