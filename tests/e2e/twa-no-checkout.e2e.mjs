// GP01, AND02: inside the Android app the Atelier offers no way to pay (store billing rules); on the web the button is there.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function atelier(url, { webCheckout = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  // The dormant Paddle path can only be exercised by forcing the switch, the way tests stub other config.
  if (webCheckout) await context.addInitScript(() => Object.defineProperty(window, "TITAN_PAYMENTS", { configurable: true, get: () => ({ webCheckout: true }), set() {} }));
  const page = await context.newPage();
  await page.goto(BASE + url);
  await page.locator("#plus").waitFor();
  const result = { checkout: await page.locator("[data-checkout]").count(), note: await page.locator("#plus .asc-note").count() };
  await context.close();
  return result;
}

test("inside the Android app the Atelier shows no checkout button and says TITAN+ is coming through Google Play", async () => {
  assert.deepEqual(await atelier("/boutique?source=twa"), { checkout: 0, note: 1 });
});

test("founder decision 21/10/2026: on the web the Atelier shows no checkout button, only that TITAN+ is coming soon", async () => {
  assert.deepEqual(await atelier("/boutique"), { checkout: 0, note: 1 });
});

test("the dormant web checkout only appears when the switch is forced on, never inside the Android app", async () => {
  assert.deepEqual(await atelier("/boutique", { webCheckout: true }), { checkout: 1, note: 0 });
  assert.deepEqual(await atelier("/boutique?source=twa", { webCheckout: true }), { checkout: 0, note: 1 });
});
