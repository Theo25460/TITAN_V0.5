import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
let browser, server, base;
const ROOT = new URL('../..', import.meta.url).pathname;
before(async () => {
  const port = await new Promise(resolve => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['tools/local-static-server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function fixture({ slow = false, missing = false, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/adventure');
  await page.waitForFunction(() => window.TitanAdventure?.status === 'ready');
  await page.evaluate(({ slow, missing }) => {
    const owner = '00000000-0000-4000-8000-000000000123', at = '2026-11-05T12:00:00Z';
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: state.user.id }, access_token: `token-${state.user.id}` } } });
    window.journeyCalls = [];
    window.journeyData = { version: 1, owner, configVersion: 1, totalSteps: 35000, goal: 30000000, today: { day: '2026-11-05', steps: 5000, sources: ['health_connect'], updatedAt: at }, discoveries: [
      { id: 'a', steps: 10000, world: 'aube', name: 'La première trace', story: 'La brume se lève.', kind: 'milestone', earnedAt: at },
      { id: 'b', steps: 30000, world: 'aube', name: 'Le refuge des cèdres', story: 'Une lumière attend au refuge.', kind: 'milestone', earnedAt: null },
      { id: 'c', steps: 75000, world: 'aube', name: 'La source', story: 'Le chemin rejoint la source.', kind: 'milestone', earnedAt: null },
    ], career: { level: 8, milestones: [
      { id: 'c5', level: 5, title: 'Premier souvenir', description: 'La mémoire de tes premières séances.', earnedAt: at },
      { id: 'c10', level: 10, title: 'Passeur', description: 'Le prochain souvenir.', earnedAt: null },
    ] } };
    window.titanClient.rpc = name => ({ setHeader: async (header, token) => {
      journeyCalls.push({ name, header, token });
      if (slow) await new Promise(resolve => { window.releaseJourney = resolve; });
      if (missing) return { data: null, error: { code: 'PGRST202', message: 'missing' } };
      if (name === 'titan_journey_sync_v1') journeyData.discoveries[1].earnedAt = new Date().toISOString();
      return { data: structuredClone(journeyData), error: null };
    } });
    window.TitanJourneyPanel.reset();
    const host = document.createElement('section');
    host.dataset.journeyHost = '';
    host.id = 'journey-test';
    document.querySelector('main')?.replaceChildren(host);
    if (!host.isConnected) document.body.replaceChildren(host);
    window.TitanJourneyPanel.mount(host);
  }, { slow, missing });
  return { context, page, errors };
}
test('the direct Sentiers link scrolls after the adventure has loaded', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 850 }, serviceWorkers: 'block' });
  try {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await context.newPage();
    await page.goto(base + '/adventure#sentiers');
    await page.waitForFunction(() => {
      const target = document.querySelector('#sentiers');
      return target && scrollY > 0 && target.getBoundingClientRect().top < innerHeight / 2;
    });
  } finally { await context.close(); }
});
test('320px map, explicit single reveal, dated album and separate career', async () => {
  const { context, page, errors } = await fixture({ width: 320 });
  try {
    const panel = page.locator('#journey-test');
    await panel.getByText('Révéler mes découvertes').waitFor();
    assert.match((await panel.innerText()).replace(/\s/g, ' '), /30 000 000/);
    assert.equal(await page.evaluate(() => journeyCalls.some(n => n.name.includes('sync'))), false);
    await panel.getByRole('button', { name: 'Révéler mes découvertes' }).dblclick();
    await page.getByText('Découverte confirmée', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => journeyCalls.filter(n => n.name.includes('sync')).length), 1);
    await page.getByRole('button', { name: 'Continuer l’aventure' }).click();
    await panel.getByText(/Journal de voyage/).click();
    assert.match(await panel.innerText(), /Une lumière attend au refuge/);
    assert.match(await panel.innerText(), /Niveau 10 · Passeur/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => journeyCalls.every(r => r.header === 'Authorization' && r.token === 'Bearer token-00000000-0000-4000-8000-000000000123')), true);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_EVIDENCE) { mkdirSync(process.env.TITAN_EVIDENCE, { recursive: true }); await panel.screenshot({ path: `${process.env.TITAN_EVIDENCE}/sentiers-web-320.png` }); }
  } finally { await context.close(); }
});
test('missing RPC retries only on action and never writes', async () => {
  const { context, page } = await fixture({ missing: true });
  try {
    const panel = page.locator('#journey-test');
    await panel.locator('[data-journey-status]').waitFor();
    await panel.getByRole('button', { name: 'Réessayer' }).click();
    await panel.locator('[data-journey-status]').waitFor();
    assert.equal(await page.evaluate(() => journeyCalls.length), 2);
    assert.equal(await page.evaluate(() => journeyCalls.some(n => n.name.includes('sync'))), false);
  } finally { await context.close(); }
});
test('old-owner in-flight response cannot repaint after account transition', async () => {
  const { context, page } = await fixture({ slow: true });
  try {
    await page.waitForFunction(() => typeof releaseJourney === 'function');
    await page.evaluate(() => { state.user.id = '00000000-0000-4000-8000-000000000456'; dispatchEvent(new Event('titan:account-changing')); releaseJourney(); });
    await page.waitForTimeout(80);
    assert.doesNotMatch(await page.locator('#journey-test').innerText(), /première trace|Passeur|refuge des cèdres/);
  } finally { await context.close(); }
});
