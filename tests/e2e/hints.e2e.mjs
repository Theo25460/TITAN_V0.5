// QG: last month's report is offered once in the first week of a month, dismissible, and opens the previous month.
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


async function visit(path, context) {
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => document.getElementById("contenu"));
  return { page, errors };
}
const fresh = () => browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" }).then(async c => { await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected")); return c; });

test("hints: shown on the first visits of a screen, readable, dismissible for good", async () => {
  const context = await fresh();
  try {
    const { page, errors } = await visit("/records", context);
    const hint = page.locator("[data-hint=records]");
    await hint.waitFor();
    assert.equal(await hint.getAttribute("role"), "note");
    assert.match(await hint.innerText(), /bat ta marque précédente/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await hint.getByRole("button", { name: "Compris" }).click();
    assert.equal(await page.locator("[data-hint=records]").count(), 0);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("contenu"));
    await page.waitForTimeout(300);
    assert.equal(await page.locator("[data-hint=records]").count(), 0, "dismissed for good");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("hints: a screen stops showing its hint after three visits even if never dismissed, each screen has its own", async () => {
  const context = await fresh();
  try {
    for (let i = 1; i <= 3; i++) {
      const { page } = await visit("/objectifs", context);
      await page.locator("[data-hint=goals]").waitFor();
      await page.close();
    }
    const { page } = await visit("/objectifs", context);
    await page.waitForTimeout(300);
    assert.equal(await page.locator("[data-hint=goals]").count(), 0);
    const other = await visit("/prevoir", context);
    await other.page.locator("[data-hint=planner]").waitFor();
  } finally { await context.close(); }
});

test("hints: no hint on other screens", async () => {
  const context = await fresh();
  try {
    const { page } = await visit("/aujourdhui", context);
    await page.waitForTimeout(300);
    assert.equal(await page.locator("[data-hint]").count(), 0);
  } finally { await context.close(); }
});
