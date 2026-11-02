// Login page: "Continuer avec Google" appears only when the server flag auth.google is on, tells what is received, and starts the Supabase OAuth flow
// for the page the player asked for. The provider itself must also be switched on in the Supabase dashboard (an external step, not tested here).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
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

async function login({ flags = { "auth.google": true }, flagsError = false, next = "" } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/js/app/auth.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/login" + (next ? "?next=" + encodeURIComponent(next) : ""), { waitUntil: "load" });
  await page.evaluate(({ flags, flagsError }) => {
    window.oauthCalls = [];
    const client = window.initTitanSupabaseClient();
    client.auth.getSession = async () => ({ data: { session: null } });
    client.auth.signInWithOAuth = async params => { window.oauthCalls.push(params); return { data: {}, error: null }; };
    client.rpc = name => Promise.resolve(name === "titan_feature_flags_v1" ? (flagsError ? { data: null, error: { message: "boom" } } : { data: { version: 1, flags }, error: null }) : { data: null, error: { code: "PGRST202", message: "Could not find" } });
  }, { flags, flagsError });
  await page.addScriptTag({ path: ROOT + "/js/app/auth.js" });
  await page.locator("#auth-form").waitFor();
  return { page, context, errors };
}

test("google sign-in: not shown when the flag is off, absent or unreadable", async () => {
  for (const options of [{ flags: {} }, { flags: { "auth.google": false } }, { flagsError: true }]) {
    const { page, context, errors } = await login(options);
    try {
      await page.waitForTimeout(400);
      assert.equal(await page.locator("[data-google]").count(), 0, JSON.stringify(options));
      assert.equal(await page.locator("[data-guest]").count(), 1, "the other ways in stay");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("google sign-in: shown with the flag on, says what TITAN receives, starts OAuth for the requested page", async () => {
  const { page, context, errors } = await login({ next: "/records" });
  try {
    const button = page.locator("[data-google]");
    await button.waitFor();
    assert.match(await page.locator(".auth-google-note").innerText(), /conditions d’utilisation[\s\S]*politique de confidentialité[\s\S]*ton nom et ton adresse e-mail, rien d’autre/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await button.click();
    await page.waitForFunction(() => window.oauthCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.oauthCalls[0]), { provider: "google", options: { redirectTo: "https://titan-app.fr/records" } });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("google sign-in: without a requested page a new account lands on the first-launch steps; the page stays usable", async () => {
  const { page, context } = await login();
  try {
    await page.locator("[data-google]").click();
    await page.waitForFunction(() => window.oauthCalls.length === 1);
    assert.equal(await page.evaluate(() => window.oauthCalls[0].options.redirectTo), "https://titan-app.fr/onboarding");
    await page.locator("#auth-form").waitFor();
    assert.equal(await page.locator("[data-google]").isEnabled(), true);
  } finally { await context.close(); }
});
