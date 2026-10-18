// Report pagination on the real Stats screen with synthetic aggregate responses.
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

async function reportPage(width = 360, access = "plus", many = false) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/rapports.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  assert.equal(await page.locator("#bilans").count(), 1, "secondary report surface exists");
  // Finish the real guest adventure boot before replacing the authenticated report gateway.
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(({ access, many }) => {
    if (access !== "guest") window.state.user.id = "00000000-0000-4000-8000-000000000123";
    window.state.user.is_elite = true;
    window.reportAccess = access; window.reportMany = many; window.reportFactor = 1; window.reportCalls = [];
    window.makeReport = p => {
      const owner = window.state.user.id;
      if (window.reportAccess === "free") return { version: 1, owner, available: false, reason: "premium_required" };
      const annual = p.p_period === "year", previous = p.p_offset === 1;
      const from = annual ? (previous ? "2023-01-01" : "2024-01-01") : (previous ? "2024-02-01" : "2024-03-01");
      const to = annual ? (previous ? "2024-01-01" : "2025-01-01") : (previous ? "2024-03-01" : "2024-04-01");
      const shift = n => { const d = new Date(from + "T12:00:00Z"); annual ? d.setUTCMonth(d.getUTCMonth() + n) : d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
      const size = annual ? (previous ? 12 : 3) : (previous ? 29 : 15), f = window.reportFactor;
      const sports = window.reportMany ? Array.from({ length: 200 }, (_, i) => ({ sport: "sport_" + i, sessions: 1, active_days: 1, minutes: f, estimated_sessions: 0 }))
        : [{ sport: "running", sessions: 1, active_days: 1, minutes: 30 * f, estimated_sessions: 1 }, { sport: "yoga", sessions: 1, active_days: 1, minutes: 20 * f, estimated_sessions: 0 }];
      const sessions = window.reportMany ? 200 : 2, minutes = window.reportMany ? 200 * f : 50 * f, estimated_sessions = window.reportMany ? 0 : 1;
      const sources = window.reportMany ? Array.from({ length: 5 }, (_, i) => ({ id: "00000000-0000-4000-8000-" + String(999 - i).padStart(12, "0"), sport: "sport_" + i, date: from + "T12:00:00Z", minutes: f, estimated: false }))
        : [{ id: "00000000-0000-4000-8000-000000000999", sport: "yoga", date: from + "T13:00:00Z", minutes: 20 * f, estimated: false }, { id: "00000000-0000-4000-8000-000000000998", sport: "running", date: from + "T12:00:00Z", minutes: 30 * f, estimated: true }];
      return { version: 1, owner, available: true, period: p.p_period, offset: p.p_offset, timezone: p.p_timezone, as_of: "2024-03-15T12:00:00Z", from, to, current: !previous,
        sessions, active_days: 1, minutes, estimated_sessions, sports, sources,
        series: Array.from({ length: size }, (_, i) => ({ from: shift(i), to: shift(i + 1), sessions: i === 0 ? sessions : 0, active_days: i === 0 ? 1 : 0, minutes: i === 0 ? minutes : 0, estimated_sessions: i === 0 ? estimated_sessions : 0 })) };
    };
    window.titanClient = { rpc: async (name, params) => {
      if (name !== "titan_practice_report") throw Error("unexpected report RPC");
      window.reportCalls.push(params);
      if (window.reportAccess === "missing") return { error: { code: "PGRST202" } };
      if (window.reportAccess === "error") return { error: { message: "Network failed" } };
      return { data: window.makeReport(params) };
    } };
  }, { access, many });
  await page.addScriptTag({ path: ROOT + "/js/app/rapports.js" });
  await page.waitForSelector("#report-panel > summary");
  return fixture;
}

async function openReport(width = 360) {
  const fixture = await reportPage(width, 'plus', true);
  await fixture.page.locator('#report-panel > summary').click();
  await fixture.page.locator('.report-results').waitFor();
  return fixture;
}
const focusId = page => page.evaluate(() => document.activeElement?.id);

// The real report code runs against a controllable, synthetic RPC boundary.
async function hold(page) {
  await page.evaluate(() => { window.titanClient.rpc = (name, params) => { window.reportCalls.push(params); return new Promise(resolve => { window.releaseReport = mode => resolve(mode === 'error' ? { error: { message: 'Network failed' } } : mode === 'free' ? { data: { version: 1, owner: window.state.user.id, available: false, reason: 'premium_required' } } : mode === 'invalid' ? { data: {} } : { data: window.makeReport(params) }); }); }; });
}
async function settle(page, mode = 'ok') {
  await page.evaluate(mode => window.releaseReport(mode), mode);
  await page.waitForFunction(() => !document.querySelector('#report-output').hasAttribute('aria-busy'));
}
for (const mode of ['ok', 'error', 'invalid', 'free']) test(`report recovery: export ${mode} restores a useful keyboard target`, async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await openReport(width);
    try {
      await hold(page); await page.locator('#report-export').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => Boolean(window.releaseReport));
      assert.equal(await page.locator('#report-submit').isDisabled(), true);
      assert.equal(await page.locator('#report-status').evaluate(el => Boolean(el.closest('[aria-busy="true"]'))), false);
      const download = mode === 'ok' ? page.waitForEvent('download') : null;
      await settle(page, mode); if (download) await download;
      assert.equal(await focusId(page), mode === 'ok' ? 'report-title' : 'report-submit');
      assert.equal(await page.locator('#report-submit').isEnabled(), true);
      if (mode === 'error' || mode === 'invalid') {
        assert.match(await page.locator('#report-status').textContent(), /pas répondu correctement/);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.reportCalls.length === 3);
        await settle(page); assert.equal(await focusId(page), 'report-title');
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('report recovery: explicit recalculation announces its fresh result with keyboard focus', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-submit').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(window.releaseReport)); await settle(page);
    assert.equal(await focusId(page), 'report-title'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const target of ['outside', 'period', 'dialog']) test(`report recovery: completion respects ${target} focus`, async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-export').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(window.releaseReport));
    await page.evaluate(target => {
      if (target === 'period') return document.querySelector('#report-period').focus();
      const el = document.createElement(target === 'dialog' ? 'dialog' : 'button'); el.id = 'other-focus';
      el.textContent = 'Autre action'; document.body.append(el);
      if (target === 'dialog') { el.tabIndex = -1; el.showModal(); } el.focus();
    }, target);
    await settle(page, 'error');
    assert.equal(await focusId(page), target === 'period' ? 'report-period' : 'other-focus'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: closed panel rejects the old response and leaves its summary focused', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-export').click();
    await page.waitForFunction(() => Boolean(window.releaseReport));
    await page.locator('#report-panel > summary').click();
    await page.waitForFunction(() => !document.querySelector('#report-output').hasAttribute('aria-busy'));
    await page.evaluate(() => window.releaseReport('ok'));
    assert.equal(await page.locator('#report-output').textContent(), '');
    assert.equal(await page.locator('#report-panel > summary').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: a background refresh does not move focus out of the summary', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-panel > summary').focus();
    await page.evaluate(() => window.dispatchEvent(new Event('titan:history-updated')));
    await page.waitForFunction(() => Boolean(window.releaseReport)); await settle(page);
    assert.equal(await page.locator('#report-panel > summary').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: an old account response cannot restore content or focus', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-export').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(window.releaseReport));
    await page.evaluate(() => {
      window.dispatchEvent(new Event('titan:account-changing'));
      window.titanAccountTransition = { epoch: (window.titanAccountTransition?.epoch || 0) + 1, active: true };
      const button = document.createElement('button'); button.id = 'account-focus'; button.textContent = 'Compte'; document.body.append(button); button.focus();
      window.releaseReport('ok');
    });
    assert.equal(await page.locator('#report-output').textContent(), '');
    assert.equal(await focusId(page), 'account-focus'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: period change cancels the previous export without stealing focus', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-export').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(window.releaseReport));
    await page.locator('#report-period').focus(); await page.locator('#report-period').selectOption('month:1');
    await page.evaluate(() => window.releaseReport('ok'));
    assert.match(await page.locator('#report-status').textContent(), /Période modifiée/);
    assert.equal(await page.locator('#report-output').textContent(), '');
    assert.equal(await focusId(page), 'report-period'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: timeout enables explicit retry and does not resend automatically', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page);
    await page.evaluate(() => { const native = window.setTimeout; window.setTimeout = (callback, delay, ...args) => native(callback, delay === 15000 ? 0 : delay, ...args); });
    await page.locator('#report-export').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#report-status').textContent.includes('15 secondes'));
    assert.equal(await focusId(page), 'report-submit');
    assert.equal(await page.locator('#report-submit').isEnabled(), true);
    assert.equal(await page.evaluate(() => window.reportCalls.length), 2);
    await page.evaluate(() => window.releaseReport('ok'));
    assert.equal(await page.locator('#report-output').textContent(), '');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: background refresh preserves the surviving period selector', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-period').focus();
    await page.evaluate(() => window.dispatchEvent(new Event('titan:history-updated')));
    await page.waitForFunction(() => Boolean(window.releaseReport)); await settle(page);
    assert.equal(await focusId(page), 'report-period'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: refresh recovers focus from a replaced calendar summary', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-calendar > summary').focus();
    await page.evaluate(() => window.dispatchEvent(new Event('titan:history-updated')));
    await page.waitForFunction(() => Boolean(window.releaseReport)); await settle(page);
    assert.equal(await focusId(page), 'report-title'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report recovery: a superseding refresh keeps responsibility for focus lost by its pending export', async () => {
  const { page, context, errors } = await openReport();
  try {
    await hold(page); await page.locator('#report-export').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => Boolean(window.releaseReport));
    await page.evaluate(() => { window.oldReleaseReport = window.releaseReport; window.dispatchEvent(new Event('titan:history-updated')); });
    await page.waitForFunction(() => window.reportCalls.length === 3); await settle(page);
    assert.equal(await focusId(page), 'report-title');
    await page.evaluate(() => window.oldReleaseReport('error'));
    assert.equal(await focusId(page), 'report-title'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
