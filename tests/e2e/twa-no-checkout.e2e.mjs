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

async function atelier(url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + url);
  await page.locator("#plus").waitFor();
  const result = { checkout: await page.locator("[data-checkout]").count(), note: await page.locator("#plus .asc-note").count() };
  await context.close();
  return result;
}

test("inside the Android app the Atelier shows no checkout button and points to the website", async () => {
  assert.deepEqual(await atelier("/boutique?source=twa"), { checkout: 0, note: 1 });
});

test("on the web the Atelier keeps its TITAN+ checkout button", async () => {
  assert.deepEqual(await atelier("/boutique"), { checkout: 1, note: 0 });
});
