// IDEA08: a user-level reduced-motion setting, persisted locally, on top of the system preference.
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


test('reduced motion can be switched on from the Plus menu, persists and can be switched off', async () => {
  const { page, context, errors } = await newPage(390);
  try {
    await page.goto(BASE + '/aujourdhui', { waitUntil: 'load' });
    const motion = () => page.evaluate(() => document.documentElement.getAttribute('data-motion'));
    const duration = () => page.evaluate(() => getComputedStyle(document.querySelector('.asc-btn') || document.body).transitionDuration);
    assert.equal(await motion(), null);
    await page.locator('[data-shell-more]').first().click();
    const toggle = page.locator('[data-motion-toggle]');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await motion(), 'reduced');
    assert.match(await duration(), /^0(\.0+1)?m?s$|^1e-05s$|0\.00001s/);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await motion(), 'reduced', 'kept after a reload');
    await page.locator('[data-shell-more]').first().click();
    await page.locator('[data-motion-toggle]').click();
    assert.equal(await motion(), null);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
