// COM-D1: the Pionnier badge. The player sees its own badge on the Profil; the administrator lists candidates from the announced rule,
// grants from the list, and withdraws. Recorders replace the project: nothing here reaches a real one.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000601";
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function newPage(width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  return { context, page, errors };
}

async function profile(granted) {
  const f = await newPage(), { page } = f;
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ owner, granted }) => {
    const client = window.titanClient;
    client.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-pioneer-token" } }, error: null });
    client.rpc = (name) => {
      let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
      if (name === "titan_public_card_settings") out = { data: { enabled: false, slug: "abcdefghij", show: { titles: true } }, error: null };
      if (name === "titan_expedition_titles") out = { data: [], error: null };
      if (name === "titan_displayed_title") out = { data: { key: null, label: null }, error: null };
      if (name === "titan_pioneer_v1") out = { data: granted ? { granted: true, cohort: "Fondateurs 2026", grantedAt: "2026-10-29T08:00:00Z" } : { granted: false }, error: null };
      const result = Promise.resolve(out); result.setHeader = () => result; return result;
    };
    window.state.user.id = owner;
    const snapshot = { ...window.TitanAdventure.snapshot, owner };
    window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { owner: OWNER, granted });
  return f;
}

test("pioneer badge: the player reads its own badge on the Profil, and nothing when it has none", async () => {
  const yes = await profile(true);
  try {
    const chip = yes.page.locator("[data-pf-pioneer]");
    await chip.waitFor();
    assert.match(await chip.innerText(), /Pionnier · Fondateurs 2026/);
    assert.equal(await yes.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(yes.errors, []);
  } finally { await yes.context.close(); }
  const no = await profile(false);
  try {
    await no.page.waitForTimeout(800);
    assert.equal(await no.page.locator("[data-pf-pioneer]").count(), 0);
  } finally { await no.context.close(); }
});

function fakeAdmin() {
  const calls = [];
  const db = { holders: [{ id: "u1", username: "Ancienne", cohort: "Fondateurs 2026", grantedAt: "2026-10-01T08:00:00Z" }],
    candidates: [{ id: "u2", username: "Alex", createdAt: "2026-09-01T08:00:00Z", sessions: 12 }, { id: "u3", username: "Sam", createdAt: "2026-09-10T08:00:00Z", sessions: 4 }] };
  const fail = (message, code) => ({ data: null, error: { message, code } });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "adm", email: "admin@example.test" } }, error: null }), signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => { throw new Error("direct table access is not expected"); },
    rpc: async (name, params = {}) => {
      calls.push({ name, params });
      if (name === "titan_admin_get_context_v1") return { data: { isAdmin: true, role: "admin" }, error: null };
      if (name === "titan_pioneer_list_v1") return { data: db.holders, error: null };
      if (name === "titan_pioneer_candidates_v1") return { data: db.candidates, error: null };
      if (name === "titan_pioneer_grant_v1") { const c = db.candidates.find(x => x.id === params.p_user); db.holders.push({ id: c.id, username: c.username, cohort: params.p_cohort, grantedAt: "2026-10-29T08:00:00Z" }); return { data: true, error: null }; }
      if (name === "titan_pioneer_revoke_v1") { db.holders = db.holders.filter(x => x.id !== params.p_user); return { data: true, error: null }; }
      return fail("unexpected rpc " + name);
    },
  };
  window.__calls = calls;
  Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
}

test("admin pioneers: the rule lists candidates, only checked accounts are granted, a holder can be withdrawn", async () => {
  const { context, page, errors } = await newPage(1280);
  try {
    await page.addInitScript(fakeAdmin);
    await page.goto(BASE + "/admin#pioneers", { waitUntil: "load" });
    await page.locator("[data-pioneer-form]").waitFor();
    await page.locator("[data-pioneer-find]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_pioneer_candidates_v1")), false, "no search without a date");
    await page.locator("[name=before]").fill("2026-10-01");
    await page.locator("[data-pioneer-find]").click();
    await page.locator("[name=candidate]").first().waitFor();
    assert.equal(await page.locator("[name=candidate]").count(), 2);
    assert.deepEqual(await page.evaluate(() => window.__calls.find(c => c.name === "titan_pioneer_candidates_v1").params.p_min_sessions), 3);
    await page.locator("[data-pioneer-grant]").click();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.name === "titan_pioneer_grant_v1")), false, "nothing granted without a tick");
    await page.locator("[name=candidate]").first().check();
    await page.locator("[data-pioneer-grant]").click();
    await page.locator("[data-confirm-ok]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_pioneer_grant_v1"));
    const grants = await page.evaluate(() => window.__calls.filter(c => c.name === "titan_pioneer_grant_v1").map(c => c.params));
    assert.deepEqual(grants, [{ p_user: "u2", p_cohort: "Fondateurs 2026" }]);
    await page.getByRole("button", { name: /Retirer le badge de Ancienne/ }).click();
    await page.locator("[data-confirm-ok]").click();
    await page.waitForFunction(() => window.__calls.some(c => c.name === "titan_pioneer_revoke_v1" && c.params.p_user === "u1"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
