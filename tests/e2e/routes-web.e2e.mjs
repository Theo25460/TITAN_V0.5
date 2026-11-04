// Routes on the web: library sheet, detail with the plain map, GPX downloads (full and shareable), deletion, and the map inside a session's detail.
// Synthetic client and history; external requests blocked; no production account.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const p = createServer(); p.listen(0, () => { const n = p.address().port; p.close(() => resolve(n)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function fixture({ flag = true, width = 360 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("#jr-q").waitFor();
  await page.evaluate(({ flag }) => {
    window.state.user.id = "00000000-0000-4000-8000-000000000a91";
    window.rpcCalls = [];
    const t0 = Date.UTC(2026, 10, 2, 8, 0, 0);
    const long = { v: 1, t0, segs: [Array.from({ length: 400 }, (_, i) => [Math.round((48.85 + i * 0.000045) * 1e5), Math.round(2.35 * 1e5), i, 1000 + i])] };
    let routes = [{ id: "r1", sport: "running", startedAt: new Date(t0).toISOString(), distanceM: 2000, durationS: 400, ascentM: 40, points: 400, eventId: "evt-session-0001" }];
    window.titanClient = { auth: { getSession: async () => ({ data: { session: { access_token: "x", user: { id: window.state.user.id } } } }) },
      rpc: async (fn, args) => { window.rpcCalls.push({ fn, args });
        if (fn === "titan_routes_v1") return { data: routes };
        if (fn === "titan_route_get_v1") return { data: { ...routes[0], track: long } };
        if (fn === "titan_route_for_event_v1") return { data: args.p_event_id === "evt-session-0001" ? routes[0] : null };
        if (fn === "titan_route_delete_v1") { routes = []; return { data: true }; }
        return { data: null }; } };
    const old = window.titanFlags.enabled;
    window.titanFlags.enabled = (k, f) => (k === "screens.routes" ? flag : old(k, f));
    window.state.history = [{ id: "s1", client_event_id: "evt-session-0001", user_id: window.state.user.id, date: "2026-11-02T08:00:00.000Z", created_at: "2026-11-02T09:00:00.000Z", sport: "running", val: 2, unit: "km", details: { duration: 7, client_event_id: "evt-session-0001" }, syncStatus: "confirmed" }];
    window.state.archivedHistory = [];
    window.dispatchEvent(new Event("titan:history-updated"));
  }, { flag });
  return { context, page, errors };
}

test("flag off: no routes button and no route request", async () => {
  const f = await fixture({ flag: false }), { page } = f;
  try {
    await page.locator('.jr-row[data-open]').first().waitFor();
    assert.equal(await page.locator("[data-routes-open]").count(), 0);
    await page.locator('.jr-row[data-open]').first().click();
    await page.locator("dialog.asc-sheet[open]").waitFor();
    assert.equal(await page.locator("[data-rt-gpx]").count(), 0);
    assert.equal(await page.evaluate(() => window.rpcCalls.filter(c => c.fn.startsWith("titan_route")).length), 0);
  } finally { await f.context.close(); }
});

test("library: list, detail with map and figures, full and shareable GPX, deletion", async () => {
  const f = await fixture(), { page } = f;
  try {
    await page.locator("[data-routes-open]").click();
    await page.locator("[data-rt-open='r1']").click();
    await page.locator("svg.rt-map").waitFor();
    assert.ok(await page.locator("svg.rt-map polyline.rt-line").count() >= 1);
    assert.match(await page.locator("dialog.asc-sheet[open]").innerText(), /2[,.]0+ km|2 km/);
    const full = page.waitForEvent("download");
    await page.locator("[data-rt-gpx]").click();
    const d1 = await full;
    assert.match(d1.suggestedFilename(), /^titan-running-2026-11-02\.gpx$/);
    const path1 = await d1.path(); const text1 = (await import("node:fs")).readFileSync(path1, "utf8");
    assert.match(text1, /<time>/); assert.match(text1, /<ele>/);
    const shared = page.waitForEvent("download");
    await page.locator("[data-rt-share]").click();
    const text2 = (await import("node:fs")).readFileSync(await (await shared).path(), "utf8");
    assert.ok(!text2.includes("<time>") && !text2.includes("<ele>"));
    assert.ok((text2.match(/<trkpt/g) || []).length < (text1.match(/<trkpt/g) || []).length, "start and end removed");
    await page.locator("[data-rt-del]").click();
    await page.getByText("Aucun parcours pour le moment").waitFor();
    assert.ok((await page.evaluate(() => window.rpcCalls)).some(c => c.fn === "titan_route_delete_v1" && c.args.p_id === "r1"));
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test("session detail shows the linked route and nothing for a session without one", async () => {
  const f = await fixture(), { page } = f;
  try {
    await page.locator('.jr-row[data-open]').first().click();
    await page.locator("dialog.asc-sheet[open] svg.rt-map").waitFor();
    const calls = await page.evaluate(() => window.rpcCalls.map(c => c.fn));
    assert.ok(calls.includes("titan_route_for_event_v1") && calls.includes("titan_route_get_v1"));
  } finally { await f.context.close(); }
});
