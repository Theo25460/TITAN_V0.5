// SHOP06: the worn title appears on the public card, read as a second best-effort call.
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


async function titledPage(title, width = 360) {
  const f = await newPage(width), { page } = f;
  await page.route('**/js/app/athlete.js?*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(BASE + '/u/abcd123456', { waitUntil: 'load' });
  await page.evaluate((title) => {
    window.titanClient = { rpc: (name) => {
      if (name === 'titan_public_card') return Promise.resolve({ data: { name: 'Athlète test', avatar: 'scout', sports: [], titles: [] } });
      if (name === 'titan_public_card_title') return title === 'throw' ? (() => { throw Error('Network failed'); })() : Promise.resolve(title === 'missing' ? { error: { code: 'PGRST202' } } : { data: title });
      throw Error('unexpected athlete RPC');
    } };
  }, title);
  await page.addScriptTag({ path: ROOT + '/js/app/athlete.js' });
  await page.waitForFunction(() => document.querySelector('#athlete').getAttribute('aria-busy') === 'false');
  return f;
}

test('the public card shows an insignia title under the name, named by the catalogue', async () => {
  const { page, context, errors } = await titledPage({ key: 'chapter:aube:1', label: null });
  try {
    await page.locator('[data-pf-title]').waitFor();
    const expected = await page.evaluate(() => window.TitanCodex.worlds[0].chapters[0].title);
    assert.match(await page.locator('[data-pf-title]').innerText(), new RegExp(expected));
    assert.equal(await page.locator('#athlete h1 + [data-pf-title]').count(), 1, 'right under the name');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the public card shows an expedition title with the server wording', async () => {
  const { page, context, errors } = await titledPage({ key: 'exp:automne-2026', label: 'Passe-brume' });
  try {
    await page.locator('[data-pf-title]').waitFor();
    assert.match(await page.locator('[data-pf-title]').innerText(), /Passe-brume/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('no title, an older server or a failed title read leaves a complete card without a title', async () => {
  for (const title of [{ key: null, label: null }, null, 'missing', 'throw', { key: 'Champion', label: null }]) {
    const { page, context, errors } = await titledPage(title);
    try {
      assert.match(await page.locator('#athlete h1').innerText(), /Athlète test/);
      await page.waitForTimeout(150);
      assert.equal(await page.locator('[data-pf-title]').count(), 0, JSON.stringify(title));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
