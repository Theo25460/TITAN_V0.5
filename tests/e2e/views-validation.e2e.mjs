// Real saved-view UI and validator with synthetic RPC receipts; no production accounts.
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
  assert.ok(ready, "local brand-asset server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

async function editView(width = 360) {
  const fixture = await newPage(width), { page } = fixture;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/js/app/vues.js?*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(BASE + '/stats');
  await page.waitForFunction(() => window.TitanAdventure?.status === 'ready' && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(() => {
    window.state.user.id = '00000000-0000-4000-8000-000000000123';
    const stamp = '2026-10-09T20:00:00Z';
    window.viewRows = [{ id: '00000000-0000-4000-8000-000000000333', name: 'Vue de test', kind: 'report', options: { period: 'year', offset: 1 }, revision: 1, created_at: stamp, updated_at: stamp }];
    window.viewCalls = []; window.viewMode = 'ok';
    window.titanClient = { rpc: async (name, params) => {
      window.viewCalls.push({ name, params: structuredClone(params) });
      if (name === 'titan_analysis_views') return { data: { version: 1, owner: window.state.user.id, available: true, limit: 10, count: window.viewRows.length, views: structuredClone(window.viewRows) } };
      if (name !== 'titan_mutate_analysis_view') throw Error('Unexpected fixture RPC');
      if (window.viewMode === 'error') return { error: { message: 'Synthetic network failure' } };
      if (window.viewMode === 'hold') return new Promise(resolve => { window.releaseViewFailure = () => resolve({ error: { message: 'Synthetic network failure' } }); });
      const old = window.viewRows.find(view => view.id === params.p_id);
      const view = { ...old, name: params.p_name, kind: params.p_kind, options: params.p_options, revision: old.revision + 1, updated_at: '2026-10-10T20:00:00Z' };
      window.viewRows = [view];
      return { data: { version: 1, owner: window.state.user.id, action: 'save', view } };
    } };
  });
  await page.addScriptTag({ path: ROOT + '/js/app/vues.js' });
  await page.locator('#views-panel > summary').click();
  await page.locator('[data-view-action="edit"]').click();
  return { ...fixture, errors };
}
const mutations = page => page.evaluate(() => window.viewCalls.filter(call => call.name === 'titan_mutate_analysis_view').length);
async function refuseName(page, value) {
  await page.locator('#views-name').fill(value);
  await page.locator('#views-submit').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#views-name').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#views-name-error').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'views-name');
  assert.equal(await mutations(page), 0);
}

test('view name: invalid input is linked, focused and corrected at mobile and desktop widths', async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await editView(width);
    try {
      await page.evaluate(() => {
        const help = document.createElement('p'); help.id = 'fixture-name-help'; help.textContent = 'Indication conservée';
        document.querySelector('#views-draft-form').append(help);
        document.querySelector('#views-name').setAttribute('aria-describedby', help.id);
      });
      await refuseName(page, '   ');
      assert.deepEqual((await page.locator('#views-name').getAttribute('aria-describedby')).split(/\s+/), ['fixture-name-help', 'views-name-error']);
      assert.match(await page.locator('#views-name-error').textContent(), /1 à 40/);
      await page.locator('#views-name').fill('Nom corrigé');
      assert.equal(await page.locator('#views-name').getAttribute('aria-invalid'), null);
      assert.equal(await page.locator('#views-name').getAttribute('aria-describedby'), 'fixture-name-help');
      assert.equal(await page.locator('#views-name-error').isHidden(), true);
      await page.locator('#views-submit').click();
      await page.getByRole('heading', { name: 'Nom corrigé', exact: true }).waitFor();
      assert.equal(await mutations(page), 1);
      assert.equal(await page.locator('#views-draft-form').isHidden(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('view name: the native required refusal uses the same accessible field error', async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await editView(width);
    try {
      assert.equal(await page.locator('#views-name').getAttribute('required'), '');
      await refuseName(page, '');
      await page.locator('#views-name').fill('Nom renseigné');
      assert.equal(await page.locator('#views-name-error').isHidden(), true);
      await page.locator('#views-submit').click();
      await page.getByRole('heading', { name: 'Nom renseigné', exact: true }).waitFor();
      assert.equal(await mutations(page), 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('view name: overlong names are refused again after editing without sending a mutation', async () => {
  const { page, context, errors } = await editView();
  try {
    await refuseName(page, 'x'.repeat(41));
    await page.locator('#views-name').fill('Corrigé');
    assert.equal(await page.locator('#views-name-error').isHidden(), true);
    await refuseName(page, 'y'.repeat(41));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('view name: existing one-character, Unicode40 and whitespace normalization rules are preserved', async () => {
  for (const value of ['A', '🙂'.repeat(40), '  Nom normalisé  ']) {
    const { page, context, errors } = await editView();
    try {
      await page.locator('#views-name').fill(value);
      await page.locator('#views-submit').click();
      await page.getByRole('heading', { name: value.trim(), exact: true }).waitFor();
      assert.equal(await mutations(page), 1);
      assert.equal(await page.evaluate(() => window.viewCalls.find(call => call.name === 'titan_mutate_analysis_view').params.p_name), value.trim());
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('view name: cancelling and reopening removes the previous local diagnostic', async () => {
  const { page, context, errors } = await editView();
  try {
    await refuseName(page, '   ');
    await page.locator('#views-cancel').click();
    await page.locator('[data-view-action="edit"]').click();
    assert.equal(await page.locator('#views-name').inputValue(), 'Vue de test');
    assert.equal(await page.locator('#views-name').getAttribute('aria-invalid'), null);
    assert.equal(await page.locator('#views-name-error').isHidden(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('view name: network failure retains the draft and its general message during correction', async () => {
  const { page, context, errors } = await editView();
  try {
    await page.locator('#views-name').fill('Essai réseau');
    await page.evaluate(() => { window.viewMode = 'error'; });
    await page.locator('#views-submit').click();
    await page.waitForFunction(() => document.querySelector('#views-status').textContent.includes('vérifie la liste'));
    const message = await page.locator('#views-status').textContent();
    await page.locator('#views-name').fill('Reprise');
    assert.equal(await page.locator('#views-status').textContent(), message);
    assert.equal(await page.locator('#views-name').getAttribute('aria-invalid'), null);
    assert.equal(await page.locator('#views-draft-form').isVisible(), true);
    await page.evaluate(() => { window.viewMode = 'ok'; });
    await page.locator('#views-submit').click();
    await page.getByRole('heading', { name: 'Reprise', exact: true }).waitFor();
    assert.equal(await mutations(page), 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('view name: pending save remains single and retains the draft on failure', async () => {
  const { page, context, errors } = await editView();
  try {
    await page.locator('#views-name').fill('Brouillon conservé');
    await page.evaluate(() => { window.viewMode = 'hold'; });
    await page.locator('#views-submit').click();
    await page.waitForFunction(() => typeof window.releaseViewFailure === 'function');
    assert.equal(await page.locator('#views-name').isDisabled(), true);
    assert.equal(await page.locator('#views-cancel').isDisabled(), true);
    await page.evaluate(() => document.querySelector('#views-draft-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(await mutations(page), 1);
    await page.evaluate(() => window.releaseViewFailure());
    await page.waitForFunction(() => !document.querySelector('#views-name').disabled);
    assert.equal(await page.locator('#views-name').inputValue(), 'Brouillon conservé');
    assert.equal(await page.locator('#views-draft-form').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('view name: an account transition clears the old draft and its error', async () => {
  const { page, context, errors } = await editView();
  try {
    await refuseName(page, '   ');
    await page.evaluate(() => window.dispatchEvent(new Event('titan:account-changing')));
    assert.equal(await page.locator('#views-draft-form').isHidden(), true);
    assert.equal(await page.locator('#views-name').getAttribute('aria-invalid'), null);
    assert.equal(await page.locator('#views-name-error').isHidden(), true);
    assert.equal(await mutations(page), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('view name: the versioned page does not reuse the preceding script resource', async () => {
  const { page, context } = await newPage();
  try {
    await page.route('**/js/app/vues.js?v=300.2', route => route.fulfill({ contentType: 'text/javascript', body: 'window.legacyViewScript=true;' }));
    await page.goto(BASE + '/stats');
    assert.equal(await page.locator('script[src*="/js/app/vues.js?"]').getAttribute('src'), '/js/app/vues.js?v=300.3');
    await page.locator('#views-panel').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#views-name-error').count(), 1);
    assert.equal(await page.evaluate(() => Boolean(window.legacyViewScript)), false);
  } finally { await context.close(); }
});
