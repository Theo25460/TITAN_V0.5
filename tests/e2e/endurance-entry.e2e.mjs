// V11-11: endurance entry without a known distance, ultra-distance beyond 300 km, and implausible speeds refused.
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


async function openSport(page, query, sport) {
  await page.goto(BASE + '/training', { waitUntil: 'load' });
  await page.locator('#sport-q').fill(query);
  await page.locator(`#sport-results [data-sport="${sport}"]`).click();
}
const lastLog = (page) => page.evaluate(() => { const h = window.state?.history || []; return h[h.length - 1] || null; });

test('a run logged by duration alone is saved as minutes, never as 0 km', async () => {
  const { page, context, errors } = await newPage(390);
  try {
    await openSport(page, 'course', 'running');
    await page.locator('[data-k="durM"]').fill('40');
    await page.locator('[data-act="save"]').click();
    await page.locator('dialog.asc-sheet[open]').waitFor();
    const log = await lastLog(page);
    assert.equal(log.unit, 'min');
    assert.equal(Number(log.val), 40);
    assert.ok(Number(log.val) > 0 && !(log.unit === 'km' && Number(log.val) === 0));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('nothing at all (no distance, no duration) is refused with a clear message', async () => {
  const { page, context } = await newPage(390);
  try {
    await openSport(page, 'course', 'running');
    await page.locator('[data-act="save"]').click();
    assert.match(await page.locator('#training, main').first().innerText(), /Indique la distance, ou au moins la durée/);
    assert.equal(await page.locator('dialog.asc-sheet[open]').count(), 0);
  } finally { await context.close(); }
});

test('an ultra-distance effort beyond 300 km is accepted when its duration makes it plausible', async () => {
  const { page, context, errors } = await newPage(390);
  try {
    await openSport(page, 'velo', 'cycling');
    await page.locator('[data-k="distance"]').fill('420');
    await page.locator('[data-k="durH"]').fill('20');
    await page.locator('[data-act="save"]').click();
    await page.locator('dialog.asc-sheet[open]').waitFor();
    const log = await lastLog(page);
    assert.equal(log.unit, 'km');
    assert.equal(Number(log.val), 420);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('beyond 300 km without a duration, or at an impossible average speed, the entry is refused', async () => {
  for (const [km, h, message] of [['420', '', /indique aussi la durée/], ['600', '1', /vitesse moyenne semble irréaliste/], ['1200', '24', /limitée à 1000 km/]]) {
    const { page, context } = await newPage(390);
    try {
      await openSport(page, 'velo', 'cycling');
      await page.locator('[data-k="distance"]').fill(km);
      if (h) await page.locator('[data-k="durH"]').fill(h);
      await page.locator('[data-act="save"]').click();
      assert.match(await page.locator('main').first().innerText(), message, `${km} km ${h} h`);
      assert.equal(await page.locator('dialog.asc-sheet[open]').count(), 0);
      assert.equal(await page.evaluate(() => (window.state?.history || []).length), 0, 'nothing is recorded');
    } finally { await context.close(); }
  }
});
