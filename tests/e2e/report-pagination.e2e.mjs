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

test('report pagination: reaching the last page keeps keyboard focus on Previous', async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await openReport(width);
    try {
      await page.locator('#report-next').focus();
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Enter');
        if (i < 8) assert.equal(await focusId(page), 'report-next');
      }
      assert.match(await page.locator('#report-page').textContent(), /Page 10 sur 10/);
      assert.equal(await page.locator('#report-next').isDisabled(), true);
      assert.equal(await focusId(page), 'report-prev');
      assert.equal(await page.locator('#report-sport-rows tr').count(), 20);
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#report-page').textContent(), /Page 9 sur 10/);
      assert.equal(await page.evaluate(() => window.reportCalls.length), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('report pagination: returning to the first page keeps keyboard focus on Next', async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await openReport(width);
    try {
      await page.locator('#report-next').click();
      await page.locator('#report-prev').focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#report-page').textContent(), /Page 1 sur 10/);
      assert.equal(await page.locator('#report-prev').isDisabled(), true);
      assert.equal(await focusId(page), 'report-next');
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#report-page').textContent(), /Page 2 sur 10/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('report pagination: commands describe the sports page and reference its rows', async () => {
  const { page, context, errors } = await openReport();
  try {
    for (const name of ['Page précédente des sports', 'Page suivante des sports']) {
      const button = page.getByRole('button', { name, exact: true });
      assert.equal(await button.count(), 1);
      assert.equal(await button.getAttribute('aria-controls'), 'report-sport-rows');
    }
    assert.equal(await page.locator('#report-sport-search').getAttribute('aria-controls'), 'report-sport-rows');
    assert.equal(await page.locator('#report-sport-rows').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report pagination: user filtering keeps focus in search and resets paging without a new RPC', async () => {
  const { page, context, errors } = await openReport();
  try {
    await page.locator('#report-next').click();
    const search = page.locator('#report-sport-search');
    await search.fill('sport_199');
    assert.match(await page.locator('#report-page').textContent(), /Page 1 sur 1.*1 sport/);
    assert.equal(await page.locator('#report-sport-rows tr').count(), 1);
    assert.equal(await focusId(page), 'report-sport-search');
    await search.fill('aucun-resultat-fixture');
    assert.match(await page.locator('#report-sport-rows').textContent(), /Aucun sport trouvé/);
    assert.equal(await focusId(page), 'report-sport-search');
    assert.equal(await page.locator('#report-prev').isDisabled(), true);
    assert.equal(await page.locator('#report-next').isDisabled(), true);
    await search.fill('');
    assert.match(await page.locator('#report-page').textContent(), /Page 1 sur 10.*200 sport/);
    assert.equal(await page.locator('#report-sport-rows tr').count(), 20);
    assert.equal(await page.evaluate(() => window.reportCalls.length), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report pagination: if both page buttons become unavailable the focus returns to search', async () => {
  const { page, context, errors } = await openReport();
  try {
    await page.locator('#report-next').focus();
    await page.evaluate(() => {
      const search = document.querySelector('#report-sport-search');
      search.value = 'aucun-resultat-fixture'; search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await focusId(page), 'report-sport-search');
    assert.equal(await page.locator('#report-prev').isDisabled(), true);
    assert.equal(await page.locator('#report-next').isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('report pagination: the new page does not execute the previous script resource', async () => {
  const { page, context, errors } = await newPage();
  try {
    await page.route('**/js/app/rapports.js?v=300.2', route => route.fulfill({ contentType: 'text/javascript', body: 'window.legacyReportScript=true;' }));
    await page.goto(BASE + '/stats');
    assert.equal(await page.locator('script[src*="/js/app/rapports.js?"]').getAttribute('src'), '/js/app/rapports.js?v=300.4');
    await page.locator('#report-panel').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => Boolean(window.legacyReportScript)), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
