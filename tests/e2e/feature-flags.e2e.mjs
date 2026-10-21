// IDEA10 / ADS17: window.titanFlags answers from the server when the flag exists and from the caller's default otherwise;
// a flag switched off wins over the default; values are cached per account; an old or unreachable server changes nothing.
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

const A = "00000000-0000-4000-8000-0000000000f1";
const B = "00000000-0000-4000-8000-0000000000f2";

async function open(mode = "ok", user = A) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.titanFlags);
  await install(page, mode, user);
  return { page, context, errors };
}
async function install(page, mode, user) {
  await page.evaluate(({ mode, user }) => {
    const calls = [];
    window.__flags = { calls, answer: { "ads.web": false, "rpg.rollout": true, "bad key": true, "ads.android": "yes" } };
    window.titanClient = {
      auth: { getSession: async () => ({ data: { session: mode === "nosession" ? null : { user: { id: user } } } }) },
      rpc: async (name) => {
        calls.push(name);
        if (name === "titan_verification_requests_v1" || name === "titan_my_verification_requests_v1") return { data: { open: 0, requests: [] }, error: null };
        if (mode === "old") return { data: null, error: { message: "Could not find the function", code: "PGRST202" } };
        if (mode === "throws") throw new Error("offline");
        return { data: { version: 1, flags: window.__flags.answer }, error: null };
      },
    };
    window.state.user.id = user;
    window.dispatchEvent(new Event("titan:account-changed"));
  }, { mode, user });
}
const enabled = (page, key, fallback) => page.evaluate(([k, f]) => window.titanFlags.enabled(k, f), [key, fallback]);

test("the server value wins when the flag exists; the default applies when it does not", async () => {
  const { page, context, errors } = await open();
  await page.waitForFunction(() => window.__flags.calls.includes("titan_feature_flags_v1"));
  await page.waitForFunction(() => window.titanFlags.enabled("rpg.rollout", false) === true);
  assert.equal(await enabled(page, "ads.web", true), false, "a flag switched off beats a default of true");
  assert.equal(await enabled(page, "rpg.rollout", false), true);
  assert.equal(await enabled(page, "never.created", true), true, "an unknown flag keeps the caller's default");
  assert.equal(await enabled(page, "never.created"), false, "and the default of the default is off");
  assert.equal(await enabled(page, "bad key", false), false, "malformed keys are ignored");
  assert.equal(await enabled(page, "ads.android", false), false, "non-boolean values are ignored");
  assert.deepEqual(errors, []);
  await context.close();
});

test("values are cached per account and survive a server that cannot be reached", async () => {
  const { page, context } = await open();
  await page.waitForFunction(() => window.titanFlags.enabled("rpg.rollout", false) === true);
  const cached = await page.evaluate((id) => JSON.parse(localStorage.getItem("titan_flags_v1:" + id)), A);
  assert.equal(cached.flags["rpg.rollout"], true);
  await page.evaluate(() => { window.__flags.calls.length = 0; window.dispatchEvent(new Event("titan:history-updated")); });
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => window.__flags.calls.filter((c) => c === "titan_feature_flags_v1")), [], "fresh cache: no new request within ten minutes");
  // Same account, now unreachable: the device keeps the last answer.
  await page.evaluate(() => { window.titanFlags.refresh(); });
  await install(page, "throws", A);
  await page.waitForTimeout(200);
  assert.equal(await enabled(page, "rpg.rollout", false), true, "an unreachable server keeps the cached value");
  // Another account does not inherit it.
  await page.evaluate((id) => {
    localStorage.setItem("titan_flags_v1:" + id, JSON.stringify({ at: Date.now(), flags: { "rpg.rollout": false } }));
    window.dispatchEvent(new Event("titan:account-changing")); window.state.user.id = id;
  }, B);
  await install(page, "throws", B);
  await page.waitForTimeout(200);
  assert.equal(await enabled(page, "rpg.rollout", true), false, "another account reads its own cache, not the previous account's value");
  assert.equal(await enabled(page, "ads.web", true), true, "and starts from the defaults for what it has not cached");
  await context.close();
});

test("a server without the function changes nothing", async () => {
  const { page, context, errors } = await open("old");
  await page.waitForFunction(() => window.__flags.calls.includes("titan_feature_flags_v1"));
  assert.equal(await enabled(page, "ads.web", true), true);
  assert.equal(await enabled(page, "ads.web", false), false);
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__flags.calls.filter((c) => c === "titan_feature_flags_v1").length), 1, "a failing server is asked once, not on every update");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a signed-in account is not read before the app has loaded it; a visitor is read at once", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__early = [];
    let client;
    Object.defineProperty(window, "titanClient", { configurable: true, get: () => client, set: (c) => { client = c && { ...c, rpc: (name, ...a) => { window.__early.push(name); return c.rpc(name, ...a); } }; } });
  });
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.titanFlags);
  await page.waitForTimeout(300);
  const early = await page.evaluate(() => window.__early.filter((n) => n === "titan_feature_flags_v1" || n === "titan_my_verification_requests_v1"));
  assert.ok(!early.includes("titan_my_verification_requests_v1"), "no verification read before an account is loaded");
  await context.close();
});
