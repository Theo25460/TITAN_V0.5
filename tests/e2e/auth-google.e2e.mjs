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

async function login({ flags = { "auth.google": true }, flagsError = false, next = "", extra = "", session = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/js/app/auth.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/login" + (next || extra ? "?" + [next ? "next=" + encodeURIComponent(next) : "", extra].filter(Boolean).join("&") : ""), { waitUntil: "load" });
  await page.evaluate(({ flags, flagsError, session }) => {
    window.oauthCalls = [];
    const client = window.initTitanSupabaseClient();
    client.auth.getSession = async () => ({ data: { session } });
    client.auth.signInWithOAuth = async params => { window.oauthCalls.push(params); return { data: {}, error: null }; };
    client.rpc = name => Promise.resolve(name === "titan_feature_flags_v1" ? (flagsError ? { data: null, error: { message: "boom" } } : { data: { version: 1, flags }, error: null }) : { data: null, error: { code: "PGRST202", message: "Could not find" } });
  }, { flags, flagsError, session });
  await page.addScriptTag({ path: ROOT + "/js/app/auth.js" });
  if (!session) await page.locator("#auth-form").waitFor();
  return { page, context, errors };
}

const AUTH_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" };
const EMAIL_USER = { id: "00000000-0000-4000-8000-000000000001", email: "recipient@example.test", app_metadata: {}, user_metadata: {}, aud: "authenticated" };
const sdkPage = async context => {
  const page = await context.newPage();
  await page.route(`${BASE}/oauth-test*`, route => route.fulfill({ contentType: "text/html", body: '<script src="/js/vendor/supabase-2.111.0.js"></script><script src="/js/config.js"></script>' }));
  await page.goto(BASE + "/oauth-test");
  return page;
};

test("a URL with another account's implicit OAuth tokens cannot sign in the browser", async () => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    let userReads = 0;
    await context.route("**/auth/v1/user", route => {
      if (route.request().method() === "GET") userReads++;
      return route.fulfill({ status: 200, headers: AUTH_HEADERS,
        json: { id: "attacker-account", email: "attacker@example.test", app_metadata: {}, user_metadata: {}, aud: "authenticated" } });
    });
    const page = await sdkPage(context);
    await page.goto(BASE + "/oauth-test#access_token=synthetic-attacker-token&refresh_token=synthetic-attacker-refresh&expires_in=3600&token_type=bearer");
    const session = await page.evaluate(async () => (await window.titanClient.auth.getSession()).data.session);
    assert.equal(session, null);
    assert.equal(userReads, 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_supabase_auth_v1")), null);
  } finally { await context.close(); }
});

for (const flow of ["google", "signup"]) {
  test(`${flow} uses PKCE and can redeem a provider code in the initiating browser`, async () => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      let signup = null, exchanged = null;
      await context.route("**/auth/v1/signup?*", route => {
        if (route.request().method() === "POST") signup = { body: route.request().postDataJSON(), url: new URL(route.request().url()) };
        return route.fulfill({ status: 200, headers: AUTH_HEADERS, json: EMAIL_USER });
      });
      await context.route("**/auth/v1/token?grant_type=pkce", route => {
        if (route.request().method() === "POST") exchanged = route.request().postDataJSON();
        return route.fulfill({ status: 200, headers: AUTH_HEADERS, json: { user: EMAIL_USER, access_token: "synthetic-pkce-access", refresh_token: "synthetic-pkce-refresh", expires_in: 3600, token_type: "bearer" } });
      });
      const page = await sdkPage(context);
      const started = await page.evaluate(async kind => {
        const auth = window.titanClient.auth, redirect = location.origin + "/oauth-test";
        const result = kind === "google"
          ? await auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect, skipBrowserRedirect: true } })
          : await auth.signUp({ email: "recipient@example.test", password: "synthetic-password", options: { emailRedirectTo: redirect } });
        return { url: result.data?.url, error: result.error?.message };
      }, flow);
      assert.equal(started.error, undefined);
      const authorize = flow === "google" ? new URL(started.url) : signup.url;
      const challenge = flow === "google" ? authorize.searchParams.get("code_challenge") : signup.body.code_challenge;
      const method = flow === "google" ? authorize.searchParams.get("code_challenge_method") : signup.body.code_challenge_method;
      assert.equal(method, "s256");
      const callback = new URL(authorize.searchParams.get("redirect_to"));
      callback.searchParams.set("code", "synthetic-provider-code");
      await page.goto(callback.href);
      assert.equal(await page.evaluate(async () => (await window.titanClient.auth.getSession()).data.session?.user?.email), EMAIL_USER.email);
      assert.equal(exchanged.auth_code, "synthetic-provider-code");
      const expectedChallenge = await page.evaluate(async verifier => {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        return btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      }, exchanged.code_verifier);
      assert.equal(challenge, expectedChallenge);
      assert.equal(new URL(page.url()).searchParams.get("code"), null);
    } finally { await context.close(); }
  });
}

test("a password recovery link works in a separate mail browser with an isolated session", async () => {
  const requester = await browser.newContext({ serviceWorkers: "block" });
  const mailBrowser = await browser.newContext({ serviceWorkers: "block" });
  try {
    for (const context of [requester, mailBrowser]) await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    let recover = null, update = null;
    await requester.route("**/auth/v1/recover?*", route => {
      if (route.request().method() === "POST") recover = { data: route.request().postDataJSON(), url: new URL(route.request().url()) };
      return route.fulfill({ status: 200, headers: AUTH_HEADERS, json: {} });
    });
    await mailBrowser.route("**/auth/v1/user", route => {
      if (route.request().method() === "PUT") update = { data: route.request().postDataJSON(), token: route.request().headers().authorization };
      return route.fulfill({ status: 200, headers: AUTH_HEADERS, json: EMAIL_USER });
    });
    const requestPage = await requester.newPage();
    await requestPage.goto(BASE + "/login");
    await requestPage.locator('[name="email"]').fill(EMAIL_USER.email);
    await requestPage.locator('[data-forgot]').click();
    await requestPage.getByText("Lien envoyé", { exact: true }).waitFor();
    assert.equal(recover.data.email, EMAIL_USER.email);
    assert.equal(recover.data.code_challenge, null);
    assert.equal(recover.url.searchParams.get("redirect_to"), "https://titan-app.fr/update-password");

    const reset = await mailBrowser.newPage();
    await reset.goto(BASE + "/update-password#access_token=synthetic-recovery-access&refresh_token=synthetic-recovery-refresh&expires_in=3600&token_type=bearer&type=recovery");
    await reset.getByText(`Compte concerné par ce lien : ${EMAIL_USER.email}`).waitFor();
    assert.equal(await reset.evaluate(async () => (await window.titanClient.auth.getSession()).data.session), null);
    await reset.locator("#pw").fill("new-synthetic-password");
    await reset.locator("#pw2").fill("new-synthetic-password");
    await reset.locator("#pw-save").click();
    await reset.waitForURL("**/login");
    assert.deepEqual(update, { data: { password: "new-synthetic-password", code_challenge: null, code_challenge_method: null }, token: "Bearer synthetic-recovery-access" });
    assert.equal(await reset.evaluate(() => sessionStorage.getItem("titan_password_recovery_v1")), null);
    assert.equal(await reset.evaluate(async () => (await window.titanClient.auth.getSession()).data.session), null);
  } finally { await requester.close(); await mailBrowser.close(); }
});

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
    assert.deepEqual(await page.evaluate(() => window.oauthCalls[0]), { provider: "google", options: { redirectTo: "https://titan-app.fr/login?via=google&next=%2Frecords" } });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("google sign-in: without a requested page a new account lands on the first-launch steps; the page stays usable", async () => {
  const { page, context } = await login();
  try {
    await page.locator("[data-google]").click();
    await page.waitForFunction(() => window.oauthCalls.length === 1);
    assert.equal(await page.evaluate(() => window.oauthCalls[0].options.redirectTo), "https://titan-app.fr/login?via=google&next=%2Fonboarding");
    await page.locator("#auth-form").waitFor();
    assert.equal(await page.locator("[data-google]").isEnabled(), true);
  } finally { await context.close(); }
});

test("google sign-in: a refusal or an error from Google is told on the form and the address is cleaned", async () => {
  for (const [extra, expected] of [["via=google&error=access_denied&error_description=User+denied", /annulée/], ["via=google&error=server_error&error_description=boom", /n’a pas abouti/]]) {
    const { page, context } = await login({ extra });
    try {
      await page.waitForFunction(() => document.querySelector(".auth-msg")?.textContent);
      assert.match(await page.locator(".auth-msg").innerText(), expected);
      assert.equal(await page.evaluate(() => location.search.includes("error")), false);
    } finally { await context.close(); }
  }
});

test("google sign-in: coming back signed in continues to the requested page, never to another origin", async () => {
  const { page, context } = await login({ extra: "via=google", next: "/records", session: { user: { id: "u" } } });
  try {
    await page.waitForURL(/\/records/, { timeout: 5000 });
  } finally { await context.close(); }
  const evil = await login({ extra: "via=google", next: "https://evil.example/x", session: { user: { id: "u" } } });
  try {
    await evil.page.waitForTimeout(800);
    assert.equal(new URL(evil.page.url()).origin, new URL(BASE).origin);
  } finally { await evil.context.close(); }
});
