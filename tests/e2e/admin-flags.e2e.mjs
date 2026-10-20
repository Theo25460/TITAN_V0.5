// IDEA10 / ADS17: the flags page of the admin control center, driven in Chromium with a recording client (nothing real is reached).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const evil = '<img src=x onerror="window.pwned=1">';
function installFake({ mode, evil }) {
  const calls = [];
  const db = { flags: mode === "empty" ? [] : [
    { key: "ads.web", enabled: true, rollout: 100, description: `Publicités du site ${evil}`, updatedAt: "2026-10-20T08:00:00Z" },
    { key: "rpg.rollout", enabled: true, rollout: 30, description: null, updatedAt: "2026-10-20T08:00:00Z" },
  ] };
  window.__flags = { calls, db };
  const fail = (message, code) => ({ data: null, error: { message, code } });
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "adm", email: "admin@example.test" } }, error: null }),
      signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => { throw new Error("direct table access is not expected"); },
    rpc: async (name, params = {}) => {
      calls.push({ name, params });
      if (name === "titan_admin_get_context_v1") return { data: { isAdmin: true, role: "admin" }, error: null };
      if (name === "titan_admin_feature_flags_v1") {
        if (mode === "old") return fail("Could not find the function public.titan_admin_feature_flags_v1 in the schema cache", "PGRST202");
        if (mode === "forbidden") return fail("ADMIN_ONLY", "42501");
        return { data: { version: 1, flags: db.flags }, error: null };
      }
      if (name === "titan_admin_feature_flag_set_v1") {
        if (mode === "refuse") return fail("KEY_INVALID", "22023");
        if (mode === "stale") return fail("FLAG_CHANGED", "23514");
        const i = db.flags.findIndex((f) => f.key === params.p_key);
        const next = { key: params.p_key, enabled: params.p_enabled, rollout: params.p_rollout, description: params.p_description || (i >= 0 ? db.flags[i].description : null), updatedAt: "2026-10-20T09:00:00Z" };
        if (i >= 0) db.flags[i] = next; else db.flags.push(next);
        return { data: { version: 1 }, error: null };
      }
      return fail("unexpected rpc " + name);
    },
  };
  Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
}
async function open(mode = "ok") {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(installFake, { mode, evil });
  await page.goto(BASE + "/admin#flags", { waitUntil: "load" });
  return { page, context, errors };
}
const calls = (page, name) => page.evaluate((n) => window.__flags.calls.filter((c) => c.name === n).map((c) => c.params), name);

test("flags page: listed with escaped text; a switch-off is one click and is sent as such", async () => {
  const { page, context, errors } = await open();
  const table = page.locator("[data-flag-table]");
  await table.waitFor();
  assert.equal(await table.locator("img").count(), 0, "descriptions are escaped");
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  const row = table.locator('[data-flag-key="ads.web"]');
  await row.locator("[name=enabled]").uncheck();
  await row.locator("[data-flag-save]").click();
  await page.waitForFunction(() => window.__flags.db.flags.find((f) => f.key === "ads.web").enabled === false);
  const sent = (await calls(page, "titan_admin_feature_flag_set_v1"))[0];
  assert.deepEqual(sent, { p_key: "ads.web", p_enabled: false, p_rollout: 100, p_description: null, p_expected_updated_at: "2026-10-20T08:00:00Z", p_create: false });
  await page.locator('[data-flag-key="ads.web"] [name=enabled]:not(:checked)').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("flags page: a new flag needs a key and a valid percentage; nothing is sent otherwise", async () => {
  const { page, context } = await open();
  const fresh = page.locator("[data-flag-new]");
  await fresh.waitFor();
  await fresh.locator("[data-flag-save]").click();
  assert.equal((await calls(page, "titan_admin_feature_flag_set_v1")).length, 0, "no key, no request");
  await fresh.locator("[name=key]").fill("screens.new");
  await fresh.locator("[name=rollout]").fill("150");
  await fresh.locator("[data-flag-save]").click();
  assert.equal((await calls(page, "titan_admin_feature_flag_set_v1")).length, 0, "150 % is refused before sending");
  await fresh.locator("[name=rollout]").fill("25");
  await fresh.locator("[name=description]").fill("Nouvel écran de récompenses");
  await fresh.locator("[name=enabled]").check();
  await fresh.locator("[data-flag-save]").click();
  await page.waitForFunction(() => window.__flags.db.flags.some((f) => f.key === "screens.new"));
  assert.deepEqual((await calls(page, "titan_admin_feature_flag_set_v1"))[0], { p_key: "screens.new", p_enabled: true, p_rollout: 25, p_description: "Nouvel écran de récompenses", p_expected_updated_at: null, p_create: true });
  await page.locator('[data-flag-key="screens.new"]').waitFor();
  await context.close();
});

test("flags page: server refusal, empty list, old server and non-administrator are explained", async () => {
  let r = await open("refuse");
  await r.page.locator("[data-flag-new] [name=key]").fill("ok.key");
  await r.page.locator("[data-flag-new] [data-flag-save]").click();
  await r.page.getByText(/Clé invalide/).first().waitFor();
  await r.context.close();
  r = await open("empty");
  await r.page.getByText(/Aucun drapeau pour l’instant/).waitFor();
  await r.context.close();
  r = await open("old");
  await r.page.getByText(/ne sont pas disponibles sur ce serveur/).waitFor();
  assert.equal(await r.page.locator("[data-flag-table]").count(), 0);
  await r.context.close();
  r = await open("forbidden");
  await r.page.getByText(/réservée aux administrateurs/).waitFor();
  await r.context.close();
});

test("flags page: a save from a stale list is refused, explained, and the list is refreshed", async () => {
  const { page, context } = await open("stale");
  const row = page.locator('[data-flag-key="ads.web"]');
  await row.waitFor();
  const before = (await calls(page, "titan_admin_feature_flags_v1")).length;
  await row.locator("[name=enabled]").uncheck();
  await row.locator("[data-flag-save]").click();
  await page.getByText(/modifié entre-temps/).first().waitFor();
  await page.waitForFunction((n) => window.__flags.calls.filter((c) => c.name === "titan_admin_feature_flags_v1").length > n, before);
  await context.close();
});
