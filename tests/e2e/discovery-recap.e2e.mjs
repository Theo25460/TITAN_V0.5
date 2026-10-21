// ACT04: the discovery recap offers the account creation it proposes, as a real action.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(BASE + "/")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "local athlete server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}


test('a discovery session recap offers a concrete signup action next to Terminé and keeps the session', async () => {
  const { page, context, errors } = await newPage(390);
  try {
    await page.goto(BASE + '/training', { waitUntil: 'load' });
    await page.locator('#sport-q').fill('course');
    await page.locator('#sport-results [data-sport="running"]').click();
    await page.locator('[data-k="distance"]').fill('5');
    await page.locator('[data-k="duration"]').fill('30').catch(() => {});
    await page.locator('[data-act="save"]').click();
    const dialog = page.locator('dialog.asc-sheet[open]');
    await dialog.waitFor();
    const signup = dialog.locator('[data-moment-signup]');
    assert.equal(await signup.getAttribute('href'), '/login?mode=signup');
    assert.match(await signup.innerText(), /Créer un compte et garder ma séance/);
    assert.equal(await dialog.locator('[data-moment="done"]').count(), 1);
    assert.equal(await page.evaluate(() => (window.state.history || []).length), 1, 'the session is kept locally');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
