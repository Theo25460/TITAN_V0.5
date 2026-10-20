// Comparison recovery on the real Stats screen with synthetic aggregate responses.
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
  assert.ok(ready, "local report server started");
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

async function comparisonPage(width = 360, access = "plus") {
  const fixture = await newPage(width);
  const { page } = fixture;
  await page.route("**/js/app/analyses.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  assert.equal(await page.locator("#analyses").count(), 1, "Progrès has the secondary comparison panel");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate((access) => {
    const owner = "00000000-0000-4000-8000-000000000123";
    if (access !== "guest") window.state.user.id = owner;
    window.state.user.is_elite = true; // Cannot unlock anything on its own.
    window.compareAccess = access;
    window.compareCalls = [];
    window.makeComparison = (p) => {
      if (window.compareAccess === "free") return { version: 1, owner: window.state.user.id, available: false, reason: "premium_required" };
      const end = new Date("2026-10-05T12:00:00Z");
      const shift = (d, days) => { const v = new Date(d); v.setUTCDate(v.getUTCDate() + days); return v.toISOString().slice(0, 10); };
      const period = (part) => {
        const to = shift(end, -part * p.p_weeks * 7), from = shift(end, -(part + 1) * p.p_weeks * 7);
        const start = new Date(from + "T12:00:00Z");
        return { from, to, sessions: part ? 4 : 8, active_days: part ? 2 : 4, minutes: part ? 0 : 240, estimated_sessions: part ? 0 : 1,
          series: Array.from({ length: p.p_weeks }, (_, i) => ({ from: shift(start, i * 7), to: shift(start, (i + 1) * 7), sessions: i === p.p_weeks - 1 ? (part ? 4 : 8) : 0, active_days: i === p.p_weeks - 1 ? (part ? 2 : 4) : 0, minutes: i === p.p_weeks - 1 && !part ? 240 : 0 })),
          sources: [{ id: "00000000-0000-4000-8000-000000000999", sport: p.p_sport || "running", date: shift(new Date(to + "T12:00:00Z"), -3) + "T12:00:00Z", minutes: part ? 0 : 30, estimated: !part }] };
      };
      return { version: 1, owner: window.state.user.id, available: true, as_of: "2026-10-08T12:00:00Z", timezone: p.p_timezone, weeks: p.p_weeks, sport: p.p_sport, recent: period(0), previous: period(1) };
    };
    window.titanClient = { rpc: async (name, params) => {
      if (name !== "titan_compare_periods") throw Error("unexpected analysis RPC");
      window.compareCalls.push(params);
      if (window.compareAccess === "missing") return { error: { code: "PGRST202", message: "Could not find function" } };
      if (window.compareAccess === "error") return { error: { message: "Network request failed" } };
      return { data: window.makeComparison(params) };
    } };
  }, access);
  await page.addScriptTag({ path: ROOT + "/js/app/analyses.js" });
  await page.waitForSelector("#compare-panel summary");
  return fixture;
}

async function openComparison(width = 360) {
  const fixture = await comparisonPage(width);
  await fixture.page.locator('#compare-panel > summary').click();
  await fixture.page.locator('#compare-period-title').waitFor();
  return fixture;
}
const focusId = page => page.evaluate(() => document.activeElement?.id);
async function hold(page) {
  await page.evaluate(() => { window.titanClient.rpc = (name, params) => { if (name !== 'titan_compare_periods') return Promise.resolve({ error: { code: 'PGRST202' } }); window.compareCalls.push(params); return new Promise(resolve => { window.releaseComparison = mode => resolve(mode === 'error' ? { error: { message: 'Network failed' } } : mode === 'missing' ? { error: { code: 'PGRST202' } } : mode === 'free' ? { data: { version: 1, owner: window.state.user.id, available: false, reason: 'premium_required' } } : mode === 'invalid' ? { data: {} } : { data: window.makeComparison(params) }); }); }; });
}
async function settle(page, mode = 'ok') {
  await page.evaluate(mode => window.releaseComparison(mode), mode);
  await page.waitForFunction(() => !document.querySelector('#compare-output').hasAttribute('aria-busy'));
}
for (const mode of ['ok', 'error', 'invalid', 'free', 'missing']) test(`comparison recovery: calculation ${mode} restores a useful keyboard target`, async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await openComparison(width);
    try {
      await hold(page); await page.locator('#compare-submit').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => Boolean(window.releaseComparison));
      assert.equal(await page.locator('#compare-submit').isDisabled(), true);
      assert.equal(await page.locator('#compare-status').evaluate(el => Boolean(el.closest('[aria-busy="true"]'))), false);
      await settle(page, mode);
      assert.equal(await focusId(page), mode === 'ok' ? 'compare-period-title' : 'compare-submit');
      assert.equal(await page.locator('#compare-submit').isEnabled(), true);
      if (mode === 'error' || mode === 'invalid') {
        assert.match(await page.locator('#compare-status').textContent(), /pas répondu correctement/);
        assert.equal(await page.evaluate(() => window.compareCalls.length), 2);
        await page.keyboard.press('Enter'); await page.waitForFunction(() => window.compareCalls.length === 3);
        await settle(page); assert.equal(await focusId(page), 'compare-period-title');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
for (const selector of ['#compare-weekly > summary', '#compare-output details:last-child > summary', '#compare-save-view']) test(`comparison recovery: refresh recovers focus from removed ${selector}`, async () => {
  const { page, context, errors } = await openComparison();
  try {
    await hold(page); await page.locator(selector).focus();
    await page.evaluate(() => window.dispatchEvent(new Event('titan:history-updated')));
    await page.waitForFunction(() => Boolean(window.releaseComparison)); await settle(page);
    assert.equal(await focusId(page), 'compare-period-title'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
for (const selector of ['#compare-weeks', '#compare-sport-q', '#compare-panel > summary']) test(`comparison recovery: passive refresh preserves surviving ${selector}`, async () => {
  const { page, context, errors } = await openComparison();
  try {
    await hold(page); await page.locator(selector).focus();
    await page.evaluate(() => window.dispatchEvent(new Event('titan:history-updated')));
    await page.waitForFunction(() => Boolean(window.releaseComparison)); await settle(page);
    assert.equal(await page.locator(selector).evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
for (const kind of ['outside', 'dialog']) test(`comparison recovery: completion respects a newer ${kind}`, async () => {
  const { page, context, errors } = await openComparison();
  try {
    await hold(page); await page.locator('#compare-submit').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(window.releaseComparison));
    await page.evaluate(kind => {
      const el = document.createElement(kind === 'dialog' ? 'dialog' : 'button'); el.id = 'other-focus';
      el.textContent = 'Autre action'; document.body.append(el);
      if (kind === 'dialog') { el.tabIndex = -1; el.showModal(); } el.focus();
    }, kind);
    await settle(page, 'error'); assert.equal(await focusId(page), 'other-focus'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('comparison recovery: a superseding refresh keeps responsibility for lost focus', async () => {
  const { page, context, errors } = await openComparison();
  try {
    await hold(page); await page.locator('#compare-weekly > summary').focus();
    await page.evaluate(() => window.dispatchEvent(new Event('titan:history-updated')));
    await page.waitForFunction(() => Boolean(window.releaseComparison));
    await page.evaluate(() => { window.oldReleaseComparison = window.releaseComparison; window.dispatchEvent(new Event('titan:history-updated')); });
    await page.waitForFunction(() => window.compareCalls.length === 3); await settle(page);
    assert.equal(await focusId(page), 'compare-period-title');
    await page.evaluate(() => window.oldReleaseComparison('error'));
    assert.equal(await focusId(page), 'compare-period-title'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
for (const cancel of ['close', 'period', 'account']) test(`comparison recovery: ${cancel} invalidates late content and focus`, async () => {
  const { page, context, errors } = await openComparison();
  try {
    await hold(page); await page.locator('#compare-submit').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(window.releaseComparison));
    if (cancel === 'close') await page.locator('#compare-panel > summary').click();
    if (cancel === 'period') { await page.locator('#compare-weeks').focus(); await page.locator('#compare-weeks').selectOption('12'); }
    if (cancel === 'account') await page.evaluate(() => {
      window.dispatchEvent(new Event('titan:account-changing'));
      window.titanAccountTransition = { epoch: (window.titanAccountTransition?.epoch || 0) + 1, active: true };
      const button = document.createElement('button'); button.id = 'account-focus'; button.textContent = 'Compte'; document.body.append(button); button.focus();
    });
    await page.waitForFunction(() => !document.querySelector('#compare-output').hasAttribute('aria-busy'));
    await page.evaluate(() => window.releaseComparison('ok'));
    assert.equal(await page.locator('#compare-output').textContent(), '');
    if (cancel === 'close') assert.equal(await page.locator('#compare-panel > summary').evaluate(el => el === document.activeElement), true);
    else assert.equal(await focusId(page), cancel === 'period' ? 'compare-weeks' : 'account-focus');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('comparison recovery: timeout allows explicit retry without automatic resend', async () => {
  const { page, context, errors } = await openComparison();
  try {
    await hold(page);
    await page.evaluate(() => { const native = window.setTimeout; window.setTimeout = (cb, delay, ...args) => native(cb, delay === 15000 ? 0 : delay, ...args); });
    await page.locator('#compare-submit').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#compare-status').textContent.includes('15 secondes'));
    assert.equal(await focusId(page), 'compare-submit'); assert.equal(await page.locator('#compare-submit').isEnabled(), true);
    assert.equal(await page.evaluate(() => window.compareCalls.length), 2);
    await page.evaluate(() => window.releaseComparison('ok'));
    assert.equal(await page.locator('#compare-output').textContent(), ''); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
