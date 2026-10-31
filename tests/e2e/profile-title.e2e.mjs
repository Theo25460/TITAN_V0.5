// SHOP06: wear an earned title from Profil; the server (mocked here with the same RPC contract) decides what is earned.
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


const OWNER = "00000000-0000-4000-8000-000000000321";
async function profilePage({ holdTitle = false } = {}) {
  const f = await newPage(390), { page } = f;
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ owner, holdTitle }) => {
    window.titanSetCalls = [];
    window.titanWornKey = holdTitle ? "exp:automne-2026" : null;
    window.titanTitleSessionOwner = owner;
    const client = window.titanClient;
    client.auth.getSession = async () => ({ data: { session: { user: { id: window.titanTitleSessionOwner }, access_token: "synthetic-title-token" } }, error: null });
    client.rpc = (name, args = {}) => {
      const run = () => {
        if (name === "titan_public_card_settings") return { data: { enabled: false, slug: "abcdefghij", show: { titles: true } }, error: null };
        if (name === "titan_expedition_titles") return { data: [{ id: "automne-2026", title: "Passe-brume", expedition: "La traversée des brumes", ended_at: "2026-11-16" }], error: null };
        if (name === "titan_displayed_title") return { data: { key: window.titanWornKey, label: window.titanWornKey === "exp:automne-2026" ? "Passe-brume" : null }, error: null };
        if (name === "titan_set_displayed_title") {
          window.titanSetCalls.push(args.p_key);
          if (args.p_key === "chapter:aube:2") return { data: null, error: { code: "42501", message: "NOT_EARNED" } };
          window.titanWornKey = args.p_key;
          return { data: { key: args.p_key, label: args.p_key === "exp:automne-2026" ? "Passe-brume" : null }, error: null };
        }
        return { data: null, error: { code: "PGRST202", message: "Could not find" } };
      };
      const result = name === "titan_displayed_title" && holdTitle
        ? new Promise(resolve => { window.titanReleaseTitle = () => resolve(run()); })
        : Promise.resolve(run());
      result.setHeader = () => result;
      return result;
    };
    window.state.user.id = owner;
    const snapshot = { ...window.TitanAdventure.snapshot, owner, rewards: [{ world: "aube", chapter: 1, earned_at: "2026-10-01T10:00:00Z" }] };
    window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { owner: OWNER, holdTitle });
  return f;
}

test('an earned insignia or expedition title can be worn, shown on the profile and taken off', async () => {
  const { page, context, errors } = await profilePage();
  try {
    const plus = page.locator('#profil a').filter({has:page.locator('.asc-row-title', {hasText:/^TITAN\+$/})});
    assert.equal(await plus.getAttribute('href'), '/titan-plus', 'inactive TITAN+ opens the coming-soon page');
    assert.doesNotMatch(await plus.textContent(), /campagnes/);
    const block = page.locator('[data-title-block]');
    await block.waitFor();
    assert.ok(await page.locator('#profil a[href="/service"]').count() >= 1, 'Assistance is reachable from the profile settings (UX12)');
    assert.match(await block.locator('[data-worn-title]').innerText(), /Aucun titre porté/);
    const buttons = block.locator('[data-wear-title]:not([data-wear-title=""])');
    assert.equal(await buttons.count(), 2, 'one insignia and one expedition title');
    await block.locator('[data-wear-title="exp:automne-2026"]').click();
    await page.waitForFunction(() => document.querySelector('[data-pf-title]')?.textContent.includes('Passe-brume'));
    assert.deepEqual(await page.evaluate(() => window.titanSetCalls), ['exp:automne-2026']);
    assert.equal(await block.locator('[data-wear-title="exp:automne-2026"]').getAttribute('aria-pressed'), 'true');
    await block.locator('[data-wear-title="chapter:aube:1"]').click();
    await page.waitForFunction(() => window.titanWornKey === 'chapter:aube:1');
    assert.match(await page.locator('[data-pf-title]').innerText(), /\S/);
    await block.locator('[data-wear-title=""]').click();
    await page.waitForFunction(() => window.titanWornKey === null);
    assert.equal(await page.locator('[data-pf-title]').count(), 0);
    assert.match(await block.locator('[data-worn-title]').innerText(), /Aucun titre porté/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a refusal from the server never changes the worn title nor the profile', async () => {
  const { page, context, errors } = await profilePage();
  try {
    await page.locator('[data-title-block]').waitFor();
    // The server refuses an insignia that is not earned: the profile keeps its state and says so.
    await page.evaluate(() => { document.querySelector('[data-title-block] ul').insertAdjacentHTML('beforeend', '<li><button type="button" data-wear-title="chapter:aube:2">x</button></li>'); });
    await page.locator('[data-wear-title="chapter:aube:2"]').click();
    await page.waitForFunction(() => window.titanSetCalls.includes('chapter:aube:2'));
    assert.equal(await page.evaluate(() => window.titanWornKey), null);
    assert.equal(await page.locator('[data-pf-title]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a silent SDK session rollover during the worn-title read discards the private title', async () => {
  const { page, context, errors } = await profilePage({ holdTitle: true });
  try {
    await page.waitForFunction(() => typeof window.titanReleaseTitle === "function");
    await page.evaluate(async () => {
      window.titanTitleSessionOwner = "00000000-0000-4000-8000-000000000654";
      window.titanReleaseTitle();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await page.locator('[data-pf-title]').count(), 0, 'the old account title cannot render under the new SDK session');
    assert.equal(await page.locator('[data-title-block]').count(), 0, 'no title picker for an obsolete session');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('an ultra-distance session shows its endurance souvenirs in the Collection, decorative only', async () => {
  const { page, context, errors } = await profilePage();
  try {
    await page.locator('[data-title-block]').waitFor();
    assert.equal(await page.locator('[data-endurance-block]').count(), 0, 'nothing before a long effort');
    await page.evaluate(() => {
      window.state.history = [{ id: 'long-1', client_event_id: 'long-1', sport: 'cycling', unit: 'km', val: 320, xp: 1800, date: new Date(Date.now() - 86400000).toISOString(), syncStatus: 'confirmed', details: { duration: 1200, elevation: 4200, serverReward: true } }];
      dispatchEvent(new CustomEvent('titan:history-updated'));
    });
    const block = page.locator('[data-endurance-block]');
    await block.waitFor();
    const text = await block.innerText();
    assert.match(text, /Ultra : 300 km/);
    assert.match(text, /3 000 m de dénivelé/);
    assert.match(text, /sans XP en plus/);
    assert.equal(await block.locator('[data-endurance="endurance:distance:300"]').count(), 1);
    await block.locator('[data-endurance-card]').click();
    await page.getByRole('dialog', { name: 'Image à partager', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.cd-preview img')?.src.startsWith('data:image/png'));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
