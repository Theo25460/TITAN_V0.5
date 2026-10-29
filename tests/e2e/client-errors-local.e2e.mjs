// AND15: front errors are kept on the device only. A crash reports nothing to any server unless the player sends a support report.
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

test("an uncaught error and a rejected promise are stored locally and trigger no request (AND15)", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  const outgoing = [];
  await context.route("**/*", (route) => {
    const request = route.request();
    // Ordinary configuration reads are not crash reports: only writes, or anything carrying the synthetic error text, count.
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) || `${request.url()} ${request.postData() || ""}`.includes("synthetic")) outgoing.push(`${request.method()} ${request.url()}`);
    return new URL(request.url()).hostname === "127.0.0.1" ? route.continue() : route.abort("internetdisconnected");
  });
  const page = await context.newPage();
  await page.goto(BASE + "/training?sport=running");
  await page.waitForFunction(() => typeof window.titanGetClientErrors === "function");
  await page.waitForTimeout(500);
  const before = outgoing.length;
  await page.evaluate(() => {
    setTimeout(() => { throw new Error("synthetic crash"); }, 0);
    Promise.reject(new Error("synthetic rejection"));
  });
  await page.waitForFunction(() => window.titanGetClientErrors().length >= 2);
  await page.waitForTimeout(500);
  const errors = await page.evaluate(() => window.titanGetClientErrors().map((e) => e.message));
  assert.ok(errors.some((m) => m.includes("synthetic crash")) && errors.some((m) => m.includes("synthetic rejection")));
  assert.deepEqual(outgoing.slice(before), [], "the crash report stays on the device");
  await context.close();
});
