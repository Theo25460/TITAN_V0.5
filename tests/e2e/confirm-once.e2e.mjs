// AND14: the shared confirmation sheet (purchase, sign-out, account deletion) runs its action once however often the button is pressed.
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

test("a repeated press on the confirm button runs the action once and keeps the sheet busy meanwhile (AND14)", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.titanShell?.confirm);
  await page.evaluate(() => {
    window.runs = 0;
    window.titanShell.confirm({ title: "Test", message: "x", confirmLabel: "Valider", action: async () => { window.runs++; await new Promise((r) => setTimeout(r, 400)); } });
  });
  await page.locator("dialog[open] [data-ok]").waitFor();
  await page.evaluate(() => { const ok = document.querySelector("dialog[open] [data-ok]"); ok.click(); ok.click(); ok.click(); });
  assert.equal(await page.locator("dialog[open]").getAttribute("aria-busy"), "true");
  await page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => {});
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.runs), 1);
  await context.close();
});
