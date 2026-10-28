// IDEA09: a recent copy of the shared catalogues is reused without asking the server again; an old one is refreshed.
// The remote side is synthetic; nothing leaves the machine.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const SPORT = { id: "running", label: "Course à pied", category: "cardio", unit: "km", form_type: "distance", extra_fields: [], is_active: true };
async function visit(ageMs, path = "/aujourdhui") {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const seen = [];
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.pathname.startsWith("/rest/v1/")) return route.abort("internetdisconnected");
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    seen.push(url.pathname.replace("/rest/v1/", ""));
    return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: url.pathname.endsWith("/sports") ? JSON.stringify([SPORT]) : "[]" });
  });
  await context.addInitScript(({ age, sport }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("titan_data_cache_v2", JSON.stringify({ version: "v2", cachedAt: Date.now() - age, data: { mobs: [], bosses: [], creatures: [], talents: [], sports: [sport], achievements: [], globalConf: [], funStats: [], shopItems: [], userUnlocks: [], shopHistory: [], socialChallenges: [] } }));
  }, { age: ageMs, sport: SPORT });
  const page = await context.newPage();
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TITAN_DB_STATUS && window.TITAN_DB_STATUS.cache, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({ reused: !!window.TITAN_DB_STATUS.catalogReused, cachedAt: JSON.parse(localStorage.getItem("titan_data_cache_v2") || "{}").cachedAt }));
  await context.close();
  return { seen, ...state };
}

test("catalogue cache: a copy of 2 minutes is reused, the server is not asked for the sports", async () => {
  const r = await visit(2 * 60 * 1000);
  assert.equal(r.reused, true);
  assert.ok(!r.seen.some(p => p.startsWith("sports")), `no sports request: ${r.seen.join(",")}`);
  assert.ok(Date.now() - r.cachedAt > 60 * 1000, "reusing never refreshes the age of the copy");
});

test("catalogue cache: a copy of 30 minutes is refreshed from the server", async () => {
  const r = await visit(30 * 60 * 1000);
  assert.equal(r.reused, false);
  assert.ok(r.seen.some(p => p.startsWith("sports")), `sports requested: ${r.seen.join(",")}`);
});
