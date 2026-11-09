// TITAN 300 — end-to-end smoke tests on the built site (dist/), in Chromium, network to third parties cut.
// Run: pnpm run test:e2e   (builds dist, serves it on a free port, drives a real browser)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../..", import.meta.url).pathname;
let server;
let browser;
let BASE;

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function newPage(width = 390) {
  const context = await browser.newContext({ viewport: { width, height: width > 900 ? 900 : 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  // Founder decision of 21/10/2026: the web checkout is off in js/config.js. The dormant Paddle path (kept for history) is still covered by
  // these tests, so they force the switch the same way other tests stub config.
  await context.addInitScript(() => Object.defineProperty(window, "TITAN_PAYMENTS", { configurable: true, get: () => ({ webCheckout: true }), set() {} }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, context, errors };
}

async function authPage({ hold = [], signup = false, width = 360, next = "" } = {}) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/auth.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/login?mode=" + (signup ? "signup" : "signin") + (next ? "&next=" + encodeURIComponent(next) : ""), { waitUntil: "load" });
  await page.evaluate(hold => {
    window.authCalls = [];
    window.authHold = hold;
    window.authResponses = {
      signInWithPassword: { error: { message: "Invalid login credentials" } },
      signUp: { data: { user: { id: "00000000-0000-4000-8000-000000000123" }, session: null }, error: null },
      resetPasswordForEmail: { data: {}, error: null },
      resend: { data: {}, error: null },
      signOut: { error: null },
    };
    const client = window.initTitanSupabaseClient();
    client.auth.getSession = async () => ({ data: { session: null } });
    for (const name of Object.keys(window.authResponses)) client.auth[name] = params => {
      const call = { name, params };
      window.authCalls.push(call);
      return window.authHold.includes(name)
        ? new Promise(resolve => { call.release = response => resolve(response || window.authResponses[name]); })
        : Promise.resolve(window.authResponses[name]);
    };
  }, hold);
  await page.addScriptTag({ path: ROOT + "/js/app/auth.js" });
  await page.locator("#auth-form").waitFor();
  return fixture;
}

async function fillAuth(page, signup = false) {
  if (signup) await page.locator('[name="name"]').fill("Fixture Titan");
  await page.locator('[name="email"]').fill("fixture@example.test");
  await page.locator('[name="password"]').fill("synthetic-password");
  if (signup) await page.locator('[name="terms"]').check();
}

async function releaseAuth(page, index, response) {
  await page.evaluate(async ({ index, response }) => {
    window.authCalls[index].release(response);
    await new Promise(requestAnimationFrame);
  }, { index, response });
}

test("auth pending actions: repeated recovery requests send once and failure retains the fields for retry", async () => {
  const { page, context, errors } = await authPage({ hold: ["resetPasswordForEmail"] });
  await fillAuth(page);
  await page.evaluate(() => {
    const button = document.querySelector("[data-forgot]");
    for (let i = 0; i < 3; i++) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForFunction(() => window.authCalls.length > 0);
  assert.equal(await page.evaluate(() => window.authCalls.length), 1);
  assert.equal(await page.locator('[name="email"]').isDisabled(), true);
  assert.equal(await page.locator("#auth-form").getAttribute("aria-busy"), "true");
  await page.getByRole("status").filter({ hasText: "Envoi en cours" }).waitFor();
  await releaseAuth(page, 0, { error: { message: "Network failed to fetch" } });
  await page.getByRole("alert").filter({ hasText: "Vérifie ton réseau" }).waitFor();
  assert.equal(await page.locator('[name="email"]').inputValue(), "fixture@example.test");
  assert.equal(await page.locator('[name="password"]').inputValue(), "synthetic-password");
  assert.equal(await page.locator("[data-forgot]").isEnabled(), true);
  await page.evaluate(() => { window.authHold = []; });
  await page.locator("[data-forgot]").click();
  await page.getByRole("heading", { name: "Lien envoyé" }).waitFor();
  await page.locator('.auth-sent [data-mode="signin"]').click();
  assert.equal(await page.locator('[name="email"]').inputValue(), "fixture@example.test");
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth pending actions: signing in cannot race a mode change recovery or discovery", async () => {
  const { page, context, errors } = await authPage({ hold: ["signInWithPassword"] });
  await fillAuth(page);
  await page.locator(".auth-submit").click();
  await page.waitForFunction(() => window.authCalls.length === 1);
  const snapshot = await page.evaluate(() => {
    for (const selector of ['[data-mode="signup"]', "[data-forgot]", "[data-guest]"]) {
      document.querySelector(selector)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    return { signup: !!document.querySelector('[name="name"]'), calls: window.authCalls.map(c => c.name) };
  });
  assert.equal(snapshot.signup, false);
  assert.deepEqual(snapshot.calls, ["signInWithPassword"]);
  assert.equal(await page.locator('[name="password"]').isDisabled(), true);
  await releaseAuth(page, 0);
  await page.getByRole("alert").filter({ hasText: "incorrect" }).waitFor();
  assert.equal(await page.locator('[data-mode="signup"]').isEnabled(), true);
  await page.locator('[data-mode="signup"]').click();
  await page.locator('[name="name"]').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth pending actions: signup freezes its consent and draft until its own response", async () => {
  const { page, context, errors } = await authPage({ signup: true, hold: ["signUp"] });
  await fillAuth(page, true);
  await page.locator('[name="analytics"]').check();
  await page.locator(".auth-submit").click();
  await page.waitForFunction(() => window.authCalls.length === 1);
  assert.equal(await page.locator('[name="analytics"]').isDisabled(), true);
  assert.equal(await page.locator('[name="terms"]').isDisabled(), true);
  assert.equal(await page.locator('[name="name"]').isDisabled(), true);
  await page.evaluate(() => {
    document.querySelector('[data-mode="signin"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelector("#auth-form").requestSubmit();
  });
  assert.equal(await page.locator('[name="name"]').count(), 1);
  assert.equal(await page.evaluate(() => window.authCalls.length), 1);
  await releaseAuth(page, 0, { error: { message: "Network failed to fetch" } });
  await page.getByRole("alert").filter({ hasText: "Vérifie ton réseau" }).waitFor();
  assert.equal(await page.locator('[name="analytics"]').isChecked(), true);
  assert.equal(await page.locator('[name="name"]').inputValue(), "Fixture Titan");
  assert.equal(await page.locator('[name="password"]').isEnabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth pending actions: synthetic resend activations cannot send several confirmation emails", async () => {
  const { page, context, errors } = await authPage({ signup: true, hold: ["resend"] });
  await fillAuth(page, true);
  await page.locator(".auth-submit").click();
  await page.locator(".auth-sent").waitFor();
  await page.evaluate(() => {
    const button = document.querySelector("[data-resend]");
    for (let i = 0; i < 3; i++) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForFunction(() => window.authCalls.some(c => c.name === "resend"));
  assert.equal(await page.evaluate(() => window.authCalls.filter(c => c.name === "resend").length), 1);
  const index = await page.evaluate(() => window.authCalls.findIndex(c => c.name === "resend"));
  await releaseAuth(page, index);
  await page.getByRole("alert").filter({ hasText: "E-mail renvoyé" }).waitFor();
  assert.equal(await page.locator('[data-mode="signin"]').isEnabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth pending actions: a failed resend can retry immediately and a successful one keeps its cooldown", async () => {
  const { page, context, errors } = await authPage({ signup: true, hold: ["resend"] });
  await fillAuth(page, true);
  await page.locator(".auth-submit").click();
  await page.locator(".auth-sent").waitFor();
  await page.locator("[data-resend]").click();
  await page.waitForFunction(() => window.authCalls.some(c => c.name === "resend"));
  const first = await page.evaluate(() => window.authCalls.findIndex(c => c.name === "resend"));
  await releaseAuth(page, first, { error: { message: "Network failed to fetch" } });
  await page.getByRole("alert").filter({ hasText: "Vérifie ton réseau" }).waitFor();
  assert.equal(await page.locator("[data-resend]").isEnabled(), true);
  await page.clock.install();
  await page.locator("[data-resend]").click();
  await page.waitForFunction(() => window.authCalls.filter(c => c.name === "resend").length === 2);
  assert.equal(await page.locator(".auth-msg").textContent(), "");
  const retry = await page.evaluate(() => window.authCalls.findLastIndex(c => c.name === "resend"));
  await releaseAuth(page, retry);
  assert.equal(await page.locator("[data-resend]").isDisabled(), true);
  await page.evaluate(() => document.querySelector("[data-resend]").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(await page.evaluate(() => window.authCalls.filter(c => c.name === "resend").length), 2);
  await page.clock.fastForward(31000);
  assert.equal(await page.locator("[data-resend]").isEnabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth pending actions: retry removes the old error and preserves credentials after another failure", async () => {
  const { page, context, errors } = await authPage();
  await fillAuth(page);
  await page.locator(".auth-submit").click();
  await page.getByRole("alert").filter({ hasText: "incorrect" }).waitFor();
  await page.evaluate(() => { window.authHold = ["signInWithPassword"]; });
  await page.locator('[name="password"]').fill("corrected-password");
  await page.locator(".auth-submit").click();
  await page.waitForFunction(() => window.authCalls.length === 2);
  assert.equal(await page.locator(".auth-msg").textContent(), "");
  const box = await page.getByRole("status").boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height);
  await releaseAuth(page, 1, { error: { message: "Network failed to fetch" } });
  await page.getByRole("alert").filter({ hasText: "Vérifie ton réseau" }).waitFor();
  assert.equal(await page.locator('[name="email"]').inputValue(), "fixture@example.test");
  assert.equal(await page.locator('[name="password"]').inputValue(), "corrected-password");
  assert.equal(await page.locator(".auth-submit").isEnabled(), true);
  assert.equal(await page.locator("#auth-form").getAttribute("aria-busy"), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth pending actions: discovery signs out once before navigating", async () => {
  const { page, context, errors } = await authPage({ hold: ["signOut"] });
  await page.evaluate(() => {
    const button = document.querySelector("[data-guest]");
    for (let i = 0; i < 3; i++) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForFunction(() => window.authCalls.length > 0);
  assert.equal(await page.evaluate(() => window.authCalls.length), 1);
  assert.match(page.url(), /\/login\?/);
  await Promise.all([
    page.waitForURL("**/onboarding"),
    page.evaluate(() => window.authCalls[0].release()),
  ]);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("titan_enter_discovery")), "1");
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth pending actions: a failed signin returns keyboard focus to its retry button", async () => {
  const { page, context, errors } = await authPage();
  await fillAuth(page);
  await page.locator(".auth-submit").click();
  await page.getByRole("alert").filter({ hasText: "incorrect" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".auth-submit")), true);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const width of [360, 1280]) {
  test(`auth modes: native buttons retain email and clear only the replaced form at ${width}px`, async t => {
    const { page, context, errors } = await authPage({ width });
    t.after(() => context.close());
    await page.locator('[name="email"]').fill("fixture@example.test");
    await page.locator('[name="password"]').fill("synthetic-password");
    await page.locator('[data-mode="signup"]').focus(); await page.keyboard.press("Space");
    assert.equal(await page.locator('[name="email"]').inputValue(), "fixture@example.test", "typed email survives before any submit");
    const group = page.getByRole("group", { name: "Connexion ou inscription", exact: true });
    assert.equal(await group.getByRole("button").count(), 2);
    assert.equal(await group.locator('[aria-pressed="true"]').getAttribute("data-mode"), "signup");
    assert.equal(await page.getByRole("tab").count(), 0, "form switching uses native buttons");
    assert.equal(await page.evaluate(() => document.activeElement?.name), "name");
    assert.equal(await page.locator('[name="password"]').inputValue(), "", "password is not carried between forms");
    await page.locator('[name="email"]').fill("edited@example.test");
    await page.locator('[name="name"]').fill("Fixture Athlete");
    await page.locator('[name="terms"]').check();
    await page.locator('[name="analytics"]').check();
    await page.locator('[data-mode="signin"]').focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator('[name="email"]').inputValue(), "edited@example.test");
    assert.equal(await page.evaluate(() => document.activeElement?.name), "email");
    assert.equal(await page.getByRole("group", { name: "Connexion ou inscription" }).locator('[aria-pressed="true"]').getAttribute("data-mode"), "signin");
    await page.locator('[data-mode="signup"]').focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator('[name="name"]').inputValue(), "");
    assert.equal(await page.locator('[name="terms"]').isChecked(), false);
    assert.equal(await page.locator('[name="analytics"]').isChecked(), false);
    assert.equal(await page.evaluate(() => window.authCalls.length), 0);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth), 0);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-auth-modes-${width}.png`, fullPage: true });
  });
}

test("auth modes: invalid special characters remain inert text across a mode round trip", async t => {
  const { page, context, errors } = await authPage();
  t.after(() => context.close());
  const raw = 'a"><svg onload=window.modeInjected=true>@example.test';
  await page.locator('[name="email"]').fill(raw);
  const typed = await page.locator('[name="email"]').inputValue();
  await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
  await page.locator('[name="email"][aria-invalid="true"]').waitFor();
  for (const mode of ["signup", "signin"]) {
    await page.locator(`[data-mode="${mode}"]`).focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator('[name="email"]').inputValue(), typed);
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0, "old field error does not survive a form replacement");
    assert.equal(await page.locator(".auth-msg").textContent(), "");
  }
  assert.equal(await page.locator('#auth svg[onload]').count(), 0);
  assert.equal(await page.evaluate(() => Boolean(window.modeInjected)), false);
  assert.equal(await page.evaluate(() => window.authCalls.length), 0);
  assert.deepEqual(errors, []);
});

test("auth modes: pending signin ignores synthetic mode switches and keeps its captured request", async t => {
  const { page, context, errors } = await authPage({ hold: ["signInWithPassword"] });
  t.after(() => context.close());
  await fillAuth(page);
  await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Connexion" }).waitFor();
  await page.evaluate(() => document.querySelector('[data-mode="signup"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(await page.locator('[name="name"]').count(), 0);
  assert.equal(await page.locator('[name="email"]').inputValue(), "fixture@example.test");
  assert.equal(await page.evaluate(() => window.authCalls.length), 1);
  await page.evaluate(() => window.authCalls[0].release());
  await page.getByRole("alert").filter({ hasText: "incorrect" }).waitFor();
  await page.locator('[data-mode="signup"]').focus(); await page.keyboard.press("Enter");
  assert.equal(await page.locator('[name="email"]').inputValue(), "fixture@example.test");
  assert.deepEqual(errors, []);
});

test("auth modes: returning from sent recovery keeps its email without a current form", async t => {
  const { page, context, errors } = await authPage();
  t.after(() => context.close());
  await page.locator('[name="email"]').fill("fixture@example.test");
  await page.locator("[data-forgot]").focus(); await page.keyboard.press("Enter");
  await page.locator(".auth-sent").waitFor();
  await page.locator('[data-mode="signin"]').focus(); await page.keyboard.press("Enter");
  assert.equal(await page.locator('[name="email"]').inputValue(), "fixture@example.test");
  assert.equal(await page.evaluate(() => document.activeElement?.name), "email");
  assert.equal(await page.evaluate(() => window.authCalls.length), 1);
  assert.deepEqual(errors, []);
});

async function authInvalidField(page, name, text) {
  const field = page.locator(`[name="${name}"]`);
  await page.getByRole("alert").filter({ hasText: text }).waitFor();
  assert.equal(await field.getAttribute("aria-invalid"), "true", `${name} marked invalid`);
  assert.equal(await field.evaluate(el => document.activeElement === el), true, `${name} focused`);
  assert.equal(await field.evaluate(el => (el.getAttribute("aria-describedby") || "").split(/\s+/).some(id => document.getElementById(id)?.classList.contains("auth-msg"))), true, `${name} linked to its actual error`);
  assert.equal(await page.evaluate(() => window.authCalls.length), 0, "local invalid data never reaches Auth");
  assert.equal(await page.evaluate(() => window.authValidationConsentCalls?.length || 0), 0, "local invalid data never writes consent");
}

for (const width of [360, 1280]) {
  test(`auth validation: signin links errors, focuses correction and leaves server failures generic at ${width}px`, async t => {
    const { page, context, errors } = await authPage({ width });
    t.after(() => context.close());
    await page.locator('[name="email"]').evaluate(el => {
      const hint = document.createElement("p"); hint.id = "existing-email-hint"; hint.textContent = "Synthetic existing help"; el.after(hint); el.setAttribute("aria-describedby", hint.id);
    });
    await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
    await authInvalidField(page, "email", "e-mail valide");
    await page.keyboard.type("fixture@example.test");
    assert.notEqual(await page.locator('[name="email"]').getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator('[name="email"]').getAttribute("aria-describedby"), "existing-email-hint", "existing help retained");
    await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
    await authInvalidField(page, "password", "Indique ton mot de passe");
    await page.keyboard.type("synthetic-password");
    await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
    await page.getByRole("alert").filter({ hasText: "incorrect" }).waitFor();
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0, "server credentials failure does not guess a bad field");
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".auth-submit")), true);
    assert.equal(await page.evaluate(() => window.authCalls.length), 1);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-auth-validation-signin-${width}.png`, fullPage: true });
  });
  test(`auth validation: signup guides each local field without consent or Auth before correction at ${width}px`, async t => {
    const { page, context, errors } = await authPage({ width, signup: true });
    t.after(() => context.close());
    await page.evaluate(() => {
      window.authValidationConsentCalls = [];
      const set = window.TitanAnalytics.setConsent.bind(window.TitanAnalytics);
      window.TitanAnalytics.setConsent = (...args) => { window.authValidationConsentCalls.push(args); return set(...args); };
    });
    await fillAuth(page, true);
    await page.locator('[name="name"]').fill("A");
    await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
    await authInvalidField(page, "name", "2 caractères");
    await page.keyboard.type("thlete");
    await page.locator('[name="password"]').fill("short");
    await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
    await authInvalidField(page, "password", "8 caractères");
    await page.keyboard.type("-valid");
    await page.locator('[name="terms"]').uncheck();
    await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
    await authInvalidField(page, "terms", "Accepte les conditions");
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-auth-validation-signup-${width}.png`, fullPage: true });
    await page.keyboard.press("Space");
    assert.notEqual(await page.locator('[name="terms"]').getAttribute("aria-invalid"), "true");
    await page.locator(".auth-submit").focus(); await page.keyboard.press("Enter");
    await page.locator(".auth-sent").waitFor();
    assert.equal(await page.evaluate(() => window.authCalls.length), 1);
    assert.deepEqual(errors, []);
  });
}

test("auth validation: recovery points at email and pending work ignores synthetic correction", async t => {
  const { page, context, errors } = await authPage({ hold: ["resetPasswordForEmail"] });
  t.after(() => context.close());
  await page.locator("[data-forgot]").focus(); await page.keyboard.press("Enter");
  await authInvalidField(page, "email", "Indique ton e-mail");
  await page.keyboard.type("fixture@example.test");
  await page.locator("[data-forgot]").focus(); await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Envoi" }).waitFor();
  await page.evaluate(() => {
    const el = document.querySelector('[name="email"]'); el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#auth-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
  assert.equal(await page.evaluate(() => window.authCalls.length), 1);
  await page.evaluate(() => window.authCalls[0].release());
  await page.locator(".auth-sent").waitFor();
  assert.deepEqual(errors, []);
});

test("auth journeys: invalid signup never reaches auth and its valid correction can continue", async () => {
  const { page, context, errors } = await authPage({ signup: true });
  await fillAuth(page, true);
  await page.locator('[name="name"]').fill("A");
  await page.locator(".auth-submit").click();
  await page.getByRole("alert").filter({ hasText: "2 caractères" }).waitFor();
  await page.locator('[name="name"]').fill("Fixture Titan");
  await page.locator('[name="password"]').fill("short");
  await page.locator(".auth-submit").click();
  await page.getByRole("alert").filter({ hasText: "8 caractères" }).waitFor();
  await page.locator('[name="password"]').fill("synthetic-password");
  await page.locator('[name="terms"]').uncheck();
  await page.locator(".auth-submit").click();
  await page.getByRole("alert").filter({ hasText: "Accepte les conditions" }).waitFor();
  assert.equal(await page.evaluate(() => window.authCalls.length), 0);
  await page.locator('[name="terms"]').check();
  await page.locator(".auth-submit").click();
  await page.locator(".auth-sent").waitFor();
  assert.equal(await page.evaluate(() => window.authCalls.length), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("auth journeys: successful signin follows a local destination and rejects an external one", async () => {
  for (const [width, next, destination] of [[360, "/social#guilde", "/social#guilde"], [1280, "https://example.test/foreign", "/aujourdhui"]]) {
    const { page, context, errors } = await authPage({ width, next });
    await page.evaluate(() => { window.authResponses.signInWithPassword = { data: { user: { id: "fixture-account" } }, error: null }; });
    await fillAuth(page);
    await page.locator(".auth-submit").click();
    await page.waitForURL(BASE + destination);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

async function passwordPage({ hold = false, session = true, sessionError = false, width = 360, clock = false } = {}) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/update-password.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/update-password", { waitUntil: "load" });
  if (clock) await page.clock.install();
  await page.evaluate(({ hold, session, sessionError }) => {
    window.passwordCalls = [];
    window.passwordHold = hold;
    window.passwordResponse = { error: { message: "Network failed to fetch" } };
    const client = window.initTitanSupabaseClient();
    client.auth.onAuthStateChange = callback => {
      window.passwordEvent = callback;
      queueMicrotask(() => callback("INITIAL_SESSION", session ? { user: { id: "fixture-account" } } : null));
      return { data: { subscription: { unsubscribe() {} } } };
    };
    client.auth.getSession = async () => {
      if (sessionError) throw new Error("Network failed to fetch");
      return { data: { session: session ? { user: { id: "fixture-account" } } : null }, error: null };
    };
    client.auth.updateUser = params => {
      const call = { params };
      window.passwordCalls.push(call);
      return window.passwordHold
        ? new Promise(resolve => { call.release = response => resolve(response || window.passwordResponse); })
        : Promise.resolve(window.passwordResponse);
    };
  }, { hold, session, sessionError });
  await page.addScriptTag({ path: ROOT + "/js/app/update-password.js" });
  return fixture;
}

async function fillPassword(page, value = "synthetic-password") {
  await page.locator("#pw").fill(value);
  await page.locator("#pw2").fill(value);
}

async function passwordInvalidField(page, id, text) {
  await page.getByRole("alert").filter({ hasText: text }).waitFor();
  const field = page.locator(`#${id}`);
  assert.equal(await field.getAttribute("aria-invalid"), "true");
  assert.equal(await field.evaluate(el => document.activeElement === el), true);
  assert.equal(await field.evaluate(el => (el.getAttribute("aria-describedby") || "").split(/\s+/).some(id => document.getElementById(id)?.id === "pw-msg")), true);
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 0);
}
for (const width of [360, 1280]) {
  test(`password validation: length and mismatch identify their fields and either password can correct confirmation at ${width}px`, async t => {
    const { page, context, errors } = await passwordPage({ width });
    t.after(() => context.close());
    await fillPassword(page, "short");
    await page.locator("#pw-save").focus(); await page.keyboard.press("Enter");
    await passwordInvalidField(page, "pw", "8 caractères");
    await page.keyboard.press("Control+A"); await page.keyboard.type("synthetic-password");
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
    assert.equal(await page.locator("#pw-msg").isHidden(), true);
    await page.locator("#pw2").fill("different-password");
    await page.locator("#pw-save").focus(); await page.keyboard.press("Enter");
    await passwordInvalidField(page, "pw2", "ne correspondent pas");
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-password-validation-${width}.png`, fullPage: true });
    await page.locator("#pw").focus(); await page.keyboard.press("Control+A"); await page.keyboard.type("different-password");
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0, "editing the first password clears its confirmation dependency");
    assert.equal(await page.locator("#pw-msg").isHidden(), true);
    await page.locator("#pw-save").focus(); await page.keyboard.press("Enter");
    await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0, "server error remains generic");
    assert.equal(await page.evaluate(() => window.passwordCalls.length), 1);
    assert.deepEqual(errors, []);
  });
}
test("password validation: correcting confirmation retains preexisting help and never erases a generic server error", async t => {
  const { page, context, errors } = await passwordPage();
  t.after(() => context.close());
  await fillPassword(page);
  await page.locator("#pw2").evaluate(el => { const hint=document.createElement("p"); hint.id="pw-existing-help"; hint.textContent="Synthetic help"; el.after(hint); el.setAttribute("aria-describedby",hint.id); });
  await page.locator("#pw2").fill("different-password");
  await page.locator("#pw-save").focus(); await page.keyboard.press("Enter");
  await passwordInvalidField(page, "pw2", "ne correspondent pas");
  await page.keyboard.press("Control+A"); await page.keyboard.type("synthetic-password");
  assert.equal(await page.locator("#pw2").getAttribute("aria-describedby"), "pw-existing-help");
  await page.locator("#pw-save").focus(); await page.keyboard.press("Enter");
  await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
  await page.locator("#pw2").fill("edited-password");
  await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
  assert.deepEqual(errors, []);
});
test("password validation: pending updates ignore synthetic edits and submits", async t => {
  const { page, context, errors } = await passwordPage({ hold: true });
  t.after(() => context.close());
  await fillPassword(page);
  await page.locator("#pw-save").focus(); await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Enregistrement" }).waitFor();
  await page.evaluate(() => { document.querySelector("#pw").value="x"; document.querySelector("#pw").dispatchEvent(new Event("input",{bubbles:true})); document.querySelector("#pw-form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); });
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 1);
  assert.equal(await page.evaluate(() => window.passwordCalls[0].params.password), "synthetic-password");
  await page.evaluate(() => window.passwordCalls[0].release());
  await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
  assert.deepEqual(errors, []);
});
test("password validation: delayed session diagnostics preserve local field guidance", async t => {
  const { page, context, errors } = await passwordPage({ clock: true, session: false, sessionError: true });
  t.after(() => context.close());
  await fillPassword(page,"short");
  await page.locator("#pw-save").focus(); await page.keyboard.press("Enter");
  await passwordInvalidField(page,"pw","8 caractères");
  await page.clock.fastForward(1300);
  await passwordInvalidField(page,"pw","8 caractères");
  assert.deepEqual(errors, []);
});

test("password recovery: repeated submissions reserve one update before awaiting auth", async t => {
  const { page, context, errors } = await passwordPage({ hold: true });
  t.after(() => context.close());
  await fillPassword(page);
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) document.querySelector("#pw-form").requestSubmit();
  });
  await page.waitForFunction(() => window.passwordCalls.length > 0);
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 1);
  assert.deepEqual(await page.evaluate(() => window.passwordCalls[0].params), { password: "synthetic-password" });
  await page.evaluate(() => window.passwordCalls[0].release());
  await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
  assert.deepEqual(errors, []);
});

test("password recovery: pending update freezes both values and announces outside the busy form", async t => {
  const { page, context, errors } = await passwordPage({ hold: true });
  t.after(() => context.close());
  await fillPassword(page);
  await page.locator("#pw-save").click();
  await page.waitForFunction(() => window.passwordCalls.length === 1);
  assert.equal(await page.locator("#pw").isDisabled(), true);
  assert.equal(await page.locator("#pw2").isDisabled(), true);
  assert.equal(await page.locator("[data-reveal]").isDisabled(), true);
  assert.equal(await page.locator("#pw-form").getAttribute("aria-busy"), "true");
  assert.equal(await page.getByRole("status").count(), 1);
  assert.equal(await page.getByRole("status").evaluate(el => !!el.closest('[aria-busy="true"]')), false);
  await page.evaluate(() => document.querySelector("[data-reveal]").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(await page.locator("#pw").getAttribute("type"), "password");
  await page.evaluate(() => window.passwordCalls[0].release());
  await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
  assert.equal(await page.locator("#pw").inputValue(), "synthetic-password");
  assert.equal(await page.locator("#pw2").isEnabled(), true);
  assert.equal(await page.locator("#pw-form").getAttribute("aria-busy"), null);
  assert.equal(await page.getByRole("status").count(), 0);
  assert.deepEqual(errors, []);
});

test("password recovery: a failed update restores retry focus and retains the corrected draft", async t => {
  const { page, context, errors } = await passwordPage();
  t.after(() => context.close());
  await fillPassword(page);
  await page.locator("#pw-save").click();
  await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector("#pw-save")), true);
  await fillPassword(page, "corrected-password");
  await page.evaluate(() => { window.passwordHold = true; });
  await page.locator("#pw-save").click();
  await page.waitForFunction(() => window.passwordCalls.length === 2);
  assert.equal(await page.locator("#pw-msg").textContent(), "");
  await page.locator('.auth-legal a[href="/service"]').focus();
  await page.evaluate(() => window.passwordCalls[1].release({ error: { message: "New password should be different from the old password." } }));
  await page.getByRole("alert").filter({ hasText: "différent" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("href")), "/service");
  assert.equal(await page.locator("#pw").inputValue(), "corrected-password");
  assert.deepEqual(errors, []);
});

test("password recovery: delayed initial link diagnostics cannot overwrite an update failure", async t => {
  const { page, context, errors } = await passwordPage({ session: false, clock: true });
  t.after(() => context.close());
  await fillPassword(page);
  await page.locator("#pw-save").click();
  await page.getByRole("alert").filter({ hasText: "Réessaie" }).waitFor();
  await page.clock.fastForward(1300);
  assert.match(await page.locator("#pw-msg").textContent(), /n’a pas pu être enregistré/);
  assert.deepEqual(errors, []);
});

test("password recovery: session lookup rejection gives an actionable diagnostic without an unhandled error", async t => {
  const { page, context, errors } = await passwordPage({ session: false, sessionError: true, clock: true });
  t.after(() => context.close());
  await page.clock.fastForward(1300);
  assert.match(await page.locator("#pw-msg").textContent(), /réseau|vérifié/i);
  assert.deepEqual(errors, []);
  await fillPassword(page);
  await page.evaluate(() => { window.passwordResponse = { error: { message: "Auth session missing" } }; });
  await page.locator("#pw-save").click();
  await page.getByRole("alert").filter({ hasText: "Ce lien a expiré" }).waitFor();
});

test("password recovery: successful save stays locked until the existing QG redirect", async t => {
  const { page, context, errors } = await passwordPage({ clock: true, width: 1280 });
  t.after(() => context.close());
  await fillPassword(page);
  await page.evaluate(() => { window.passwordResponse = { error: null }; });
  await page.locator("#pw-save").click();
  await page.getByRole("alert").filter({ hasText: "Mot de passe enregistré" }).waitFor();
  await page.evaluate(() => document.querySelector("#pw-form").requestSubmit());
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 1);
  assert.equal(await page.locator("#pw").isDisabled(), true);
  await Promise.all([page.waitForURL("**/aujourdhui"), page.clock.fastForward(1300)]);
  assert.deepEqual(errors, []);
});

test("password recovery: local validation never updates auth and expired sessions keep the recovery guidance", async t => {
  const { page, context, errors } = await passwordPage({ session: false, clock: true });
  t.after(() => context.close());
  await page.clock.fastForward(1300);
  await page.getByRole("alert").filter({ hasText: "Demande un nouveau lien" }).waitFor();
  await fillPassword(page, "short");
  await page.locator("#pw-save").click();
  await page.getByRole("alert").filter({ hasText: "8 caractères" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), "pw");
  await page.locator("#pw").fill("synthetic-password");
  await page.locator("#pw-save").click();
  await page.getByRole("alert").filter({ hasText: "ne correspondent pas" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), "pw2");
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 0);
  await page.locator("#pw2").fill("synthetic-password");
  await page.evaluate(() => { window.passwordResponse = { error: { message: "Auth session missing" } }; });
  await page.locator("#pw-save").click();
  await page.getByRole("alert").filter({ hasText: "Ce lien a expiré" }).waitFor();
  assert.equal(await page.locator("#pw-save").isEnabled(), true);
  assert.deepEqual(errors, []);
});

async function onboardingPage({ mode = "pending", consent = true, width = 360, clock = false } = {}) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/onboarding.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/onboarding?again=1", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  if (clock) await page.clock.install();
  await page.evaluate(({ mode, consent }) => {
    window.onboardingCalls = [];
    window.onboardingEffects = [];
    window.onboardingMode = mode;
    window.onboardingConsent = consent;
    window.state.user.favoriteSports = [];
    window.state.user.weeklyGoalSessions = 3;
    window.state.user.onboardingComplete = false;
    delete window.state.user.onboardedAt;
    window.saveState = options => {
      const call = { options, snapshot: structuredClone(window.state.user) };
      window.onboardingCalls.push(call);
      if (window.onboardingMode === "throw") throw Error("Synthetic local write failure");
      if (window.onboardingMode === "reject") return Promise.reject(Error("Synthetic cloud failure"));
      if (window.onboardingMode === "instant") return;
      return new Promise(resolve => { call.release = resolve; });
    };
    window.TitanAnalytics.setConsent = value => {
      window.onboardingEffects.push({ name: "consent", value });
      return window.onboardingConsent;
    };
    const track = window.TitanAnalytics.track;
    window.TitanAnalytics.track = (name, props) => {
      if (name !== "onboarding_completed") return track(name, props);
      window.onboardingEffects.push({ name, props });
      return Promise.resolve(true);
    };
  }, { mode, consent });
  await page.addScriptTag({ path: ROOT + "/js/app/onboarding.js" });
  await page.locator("[data-next]").waitFor();
  return fixture;
}

async function onboardingToGo(page, { sport = true, target = 4, analytics = false } = {}) {
  let chosen = null;
  if (sport) {
    const pick = page.locator("[data-pick]").first();
    chosen = await pick.getAttribute("data-pick");
    await pick.click();
  }
  await page.locator("[data-next]").click();
  await page.locator(`[data-target="${target}"]`).click();
  await page.locator("[data-next]").click();
  await page.locator("[data-analytics]").setChecked(analytics);
  await page.locator("[data-next]").click();
  return chosen;
}

for (const width of [360, 1280]) {
  test(`onboarding radios: rhythm uses one Tab stop, wraps arrows and saves the keyboard choice at ${width}px`, async t => {
    const { page, context, errors } = await onboardingPage({ width });
    t.after(() => context.close());
    await page.locator("[data-next]").click();
    const group = page.getByRole("radiogroup", { name: "Jours actifs par semaine" });
    assert.equal(await group.locator('[tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[data-target="3"]').getAttribute("tabindex"), "0");
    await page.locator("[data-back]").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator('[data-target="3"]').evaluate(el => el === document.activeElement), true);
    for (const [key, target] of [["ArrowRight", 4], ["ArrowDown", 5], ["ArrowLeft", 4], ["ArrowUp", 3]]) {
      await page.keyboard.press(key);
      assert.equal(await page.locator(`[data-target="${target}"]`).getAttribute("aria-checked"), "true");
      assert.equal(await page.locator(`[data-target="${target}"]`).evaluate(el => el === document.activeElement), true);
      assert.equal(await group.locator('[tabindex="0"]').count(), 1);
    }
    await page.locator('[data-target="1"]').click();
    await page.keyboard.press("ArrowUp");
    assert.equal(await page.locator('[data-target="7"]').getAttribute("aria-checked"), "true");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.locator('[data-target="1"]').getAttribute("aria-checked"), "true");
    await page.locator('[data-target="6"]').focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator('[data-target="6"]').getAttribute("aria-checked"), "true");
    assert.equal(await page.locator('[data-target="6"]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("[data-back]").evaluate(el => el === document.activeElement), true);
    await page.locator("[data-next]").click();
    await page.locator("[data-back]").click();
    assert.equal(await page.locator('[data-target="6"]').getAttribute("aria-checked"), "true");
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-radio-onboarding-${width}.png`, fullPage: true });
    await page.locator("[data-next]").click();
    await page.locator("[data-next]").click();
    await page.locator('[data-finish][href="/aujourdhui"]').click();
    assert.equal(await page.evaluate(() => window.onboardingCalls[0].snapshot.weeklyGoalSessions), 6);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
  });
}

test("onboarding finish: repeated activations save consent preferences and completion once", async t => {
  const { page, context, errors } = await onboardingPage();
  t.after(() => context.close());
  const sport = await onboardingToGo(page, { analytics: true });
  await page.evaluate(() => {
    const link = document.querySelector('[data-finish][href="/aujourdhui"]');
    for (let i = 0; i < 3; i++) link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.evaluate(() => window.onboardingCalls.length), 1);
  assert.deepEqual(await page.evaluate(() => window.onboardingCalls[0].options), { forceCloud: true });
  assert.deepEqual(await page.evaluate(() => window.onboardingCalls[0].snapshot.favoriteSports), [sport]);
  assert.equal(await page.evaluate(() => window.onboardingCalls[0].snapshot.weeklyGoalSessions), 4);
  assert.deepEqual(await page.evaluate(() => window.onboardingEffects), [{ name: "consent", value: true }, { name: "onboarding_completed", props: { count: 1 } }]);
  assert.deepEqual(errors, []);
});

test("onboarding finish: pending preparation blocks Return and the conflicting destination", async t => {
  const { page, context, errors } = await onboardingPage();
  t.after(() => context.close());
  await onboardingToGo(page);
  await page.locator('[data-finish][href="/aujourdhui"]').click();
  assert.equal(await page.locator("[data-back]").isDisabled(), true);
  await page.evaluate(() => {
    document.querySelector("[data-back]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.querySelector('.ob-go a[href^="/training"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.locator("[data-analytics]").count(), 0);
  assert.equal(await page.evaluate(() => window.onboardingCalls.length), 1);
  assert.deepEqual(errors, []);
});

test("onboarding finish: busy choices expose one visible status outside the busy section", async t => {
  const { page, context, errors } = await onboardingPage();
  t.after(() => context.close());
  await onboardingToGo(page);
  await page.locator('[data-finish][href="/aujourdhui"]').click();
  assert.equal(await page.locator("#onboarding").getAttribute("aria-busy"), "true");
  assert.equal(await page.getByRole("status").filter({ hasText: "Préparation" }).count(), 1);
  const status = page.getByRole("status").filter({ hasText: "Préparation" });
  assert.equal(await status.evaluate(el => !!el.closest('[aria-busy="true"]')), false);
  for (const link of await page.locator(".ob-go a").all()) {
    assert.equal(await link.getAttribute("aria-disabled"), "true");
    assert.equal(await link.getAttribute("tabindex"), "-1");
  }
  const box = await status.boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height);
  assert.deepEqual(errors, []);
});

test("onboarding finish: synchronous preparation failure preserves choices and enables a focused retry", async t => {
  const { page, context, errors } = await onboardingPage({ mode: "throw" });
  t.after(() => context.close());
  const sport = await onboardingToGo(page, { target: 6, analytics: true });
  await page.locator('[data-finish][href="/aujourdhui"]').click();
  assert.equal(await page.locator(".ob-finish-error[role=alert]").count(), 1);
  assert.deepEqual(errors, []);
  assert.equal(await page.locator("[data-back]").isEnabled(), true);
  assert.equal(await page.locator("#onboarding").getAttribute("aria-busy"), null);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("href")), "/aujourdhui");
  await page.evaluate(() => { window.onboardingMode = "pending"; });
  await page.locator('[data-finish][href="/aujourdhui"]').click();
  assert.equal(await page.locator(".ob-finish-error").count(), 0);
  assert.equal(await page.evaluate(() => window.onboardingCalls.length), 2);
  const snapshot = await page.evaluate(() => window.onboardingCalls[1].snapshot);
  assert.deepEqual(snapshot.favoriteSports, [sport]);
  assert.equal(snapshot.weeklyGoalSessions, 6);
  await Promise.all([page.waitForURL("**/aujourdhui"), page.evaluate(() => window.onboardingCalls[1].release())]);
  assert.deepEqual(errors, []);
});

test("onboarding finish: a failed consent save shows one warning and Continue sends no second preparation", async t => {
  const { page, context, errors } = await onboardingPage({ consent: false });
  t.after(() => context.close());
  await onboardingToGo(page, { analytics: true });
  await page.locator('[data-finish][href="/aujourdhui"]').click();
  await page.evaluate(() => {
    const link = document.querySelector('[data-finish][href="/aujourdhui"]');
    for (let i = 0; i < 2; i++) link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    window.onboardingCalls.forEach(call => call.release());
  });
  await page.getByRole("alert").filter({ hasText: "rechargement" }).first().waitFor();
  assert.equal(await page.getByRole("alert").filter({ hasText: "rechargement" }).count(), 1);
  assert.equal(await page.locator("[data-finish]").count(), 0);
  assert.equal(await page.locator(".ob-go a[href='/aujourdhui']").textContent(), "Continuer");
  await page.locator(".ob-go a[href='/aujourdhui']").click();
  await page.waitForURL("**/aujourdhui");
  assert.deepEqual(errors, []);
});

test("onboarding finish: the first chosen training destination survives another activation", async t => {
  const { page, context, errors } = await onboardingPage({ width: 1280 });
  t.after(() => context.close());
  const sport = await onboardingToGo(page);
  await page.locator('.ob-go a[href^="/training"]').click();
  await page.evaluate(() => document.querySelector('[data-finish][href="/aujourdhui"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  assert.equal(await page.evaluate(() => window.onboardingCalls.length), 1);
  await Promise.all([page.waitForURL(BASE + "/training?sport=" + encodeURIComponent(sport)), page.evaluate(() => window.onboardingCalls[0].release())]);
  assert.deepEqual(errors, []);
});

test("onboarding finish: cloud rejection and the existing 2.5 second cap both allow the saved local journey", async t => {
  for (const mode of ["reject", "pending"]) {
    const { page, context, errors } = await onboardingPage({ mode, clock: true });
    t.after(() => context.close());
    await onboardingToGo(page, { sport: false });
    await page.locator('[data-finish][href="/aujourdhui"]').click();
    if (mode === "pending") {
      await page.clock.fastForward(2499);
      assert.match(page.url(), /\/onboarding\?again=1$/);
      assert.equal(await page.evaluate(() => window.onboardingCalls.length), 1);
      await Promise.all([page.waitForURL("**/aujourdhui"), page.clock.fastForward(1)]);
    } else await page.waitForURL("**/aujourdhui");
    assert.deepEqual(errors, []);
  }
});

test("onboarding finish: five sports rhythm and optional analytics remain editable before preparation", async t => {
  const { page, context, errors } = await onboardingPage();
  t.after(() => context.close());
  const ids = await page.locator("[data-pick]").evaluateAll(els => els.slice(0, 6).map(el => el.dataset.pick));
  assert.equal(ids.length, 6);
  for (const id of ids) await page.locator(`[data-pick="${id}"]`).click();
  assert.equal(await page.locator('[data-pick][aria-pressed="true"]').count(), 5);
  await page.getByText("5 sports maximum", { exact: false }).waitFor();
  await page.locator("[data-next]").click();
  await page.locator('[data-target="7"]').click();
  await page.locator("[data-next]").click();
  await page.locator("[data-analytics]").check();
  await page.locator("[data-back]").click();
  assert.equal(await page.locator('[data-target="7"]').getAttribute("aria-checked"), "true");
  await page.locator("[data-next]").click();
  assert.equal(await page.locator("[data-analytics]").isChecked(), true);
  await page.locator("[data-next]").click();
  assert.equal(await page.evaluate(() => window.onboardingCalls.length), 0);
  await page.locator('[data-finish][href="/aujourdhui"]').click();
  assert.deepEqual(await page.evaluate(() => window.onboardingCalls[0].snapshot.favoriteSports), ids.slice(0, 5));
  assert.equal(await page.evaluate(() => window.onboardingCalls[0].snapshot.weeklyGoalSessions), 7);
  assert.deepEqual(errors, []);
});

test("onboarding finish: small screens contain the sports choice while pending and after a consent warning", async t => {
  for (const width of [320, 360, 1280]) {
    const { page, context, errors } = await onboardingPage({ width, consent: false });
    t.after(() => context.close());
    await onboardingToGo(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('[data-finish][href="/aujourdhui"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => window.onboardingCalls[0].release());
    await page.getByRole("alert").filter({ hasText: "rechargement" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator(".ob-go a[href='/aujourdhui']").isVisible(), true);
    assert.deepEqual(errors, []);
  }
});

async function communityPage({ hold = [], guild = false, wrongOwner = false, width = 360, overview = {}, hash = "" } = {}) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/communaute.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/social" + hash, { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(({ hold, guild, wrongOwner, overview }) => {
    window.state.user.id = "alice";
    window.communityCalls = [];
    window.communityHold = hold;
    window.communityGuild = guild;
    window.communityWrongOwner = wrongOwner;
    window.communityOverview = (owner, label = owner) => ({
      me: { id: window.communityWrongOwner ? "other" : owner, friend_code: "TN-" + label, findable: true },
      friends: [{ id: "friend-" + owner, name: "Ami privé " + label, avatar: "scout" }],
      requests_in: [], requests_out: [], challenges: [], expedition: null,
      moments: [{ id: "moment-" + owner, kind: "session", title: "Moment privé " + label, created_at: new Date().toISOString(), mine: true },
        { id: "friend-moment-" + owner, kind: "session", title: "Moment ami " + label, created_at: new Date().toISOString(), author: { name: "Ami privé " + label, avatar: "scout" }, mine: false }],
      guild: window.communityGuild ? { minutes: 30, target: 300, members: [] } : null,
      ...overview,
    });
    window.titanClient = { auth: { getSession: async () => ({ data: { session: { user: { id: window.state.user.id }, access_token: "fixture-token" } } }) }, rpc: (name, params) => {
      // Other boot modules may refresh on reconnect; keep this transport fixture scoped to social RPCs.
      if (!/^titan_(social_|get_my_guild$|moment_|challenge_|expedition_|create_guild$|join_guild$|leave_guild$|send_guild_message$|guild_)/.test(name)) {
        return Promise.resolve({ error: { code: "PGRST202" } });
      }
      const owner = window.state.user.id;
      const data = name === "titan_social_overview" ? window.communityOverview(owner)
        : name === "titan_get_my_guild" ? { name: "Guilde privée " + owner, code: "G-AB12", owner_id: owner, messages: [{ sender_name: "Ami", content: "Discussion privée " + owner }] }
        : { status: "sent" };
      const call = { name, params, owner, response: { data } };
      window.communityCalls.push(call);
      const result = window.communityHold.includes(name) ? new Promise(resolve => { call.release = response => resolve(response || call.response); }) : Promise.resolve(call.response);
      const query = { setHeader: () => query, then: (yes, no) => result.then(response => {
        yes(response);
        if (window.communityMicrotaskAfter === name) {
          window.communityMicrotaskAfter = null;
          queueMicrotask(() => window.communitySwitch("bob"));
        }
      }, no) };
      return query;
    } };
    window.communitySwitch = (owner, finish = true) => {
      window.titanAccountTransition = { active: true, owner, epoch: window.titanAccountTransition.epoch + 1 };
      window.dispatchEvent(new CustomEvent("titan:account-changing"));
      window.state.user.id = owner;
      if (finish) {
        window.titanAccountTransition.active = false;
        window.dispatchEvent(new CustomEvent("titan:account-changed"));
      }
    };
  }, { hold, guild, wrongOwner, overview });
  await page.addScriptTag({ path: ROOT + "/js/app/communaute.js" });
  await page.waitForFunction(() => window.communityCalls.length > 0);
  if (!hold.includes("titan_social_overview") && !(guild && hold.includes("titan_get_my_guild"))) {
    await page.waitForFunction(() => document.querySelector("#communaute").getAttribute("aria-busy") === "false");
  }
  return fixture;
}

async function releaseCommunity(page, index, response) {
  await page.evaluate(async ({ index, response }) => {
    window.communityCalls[index].release(response);
    await new Promise(requestAnimationFrame);
  }, { index, response });
}

test("community pending actions: repeated guild message submissions send once and an error keeps the draft retryable", async () => {
  const { page, context, errors } = await communityPage({ guild: true, hold: ["titan_send_guild_message"] });
  await page.locator('[data-guild-message] [name="content"]').fill("Bravo l’équipe");
  await page.evaluate(() => {
    const form = document.querySelector("[data-guild-message]");
    for (let i = 0; i < 3; i++) form.requestSubmit();
  });
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_send_guild_message"));
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_send_guild_message").length), 1);
  assert.equal(await page.locator('[data-guild-message] [name="content"]').isDisabled(), true);
  await page.getByRole("status").filter({ hasText: "Envoi en cours" }).first().waitFor();
  const progress = await page.getByRole("status").filter({ hasText: "Envoi en cours" }).first().boundingBox();
  assert.ok(progress.y >= 0 && progress.y + progress.height <= page.viewportSize().height, "the pending message remains visible beside the submitted guild draft");
  const index = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_send_guild_message"));
  await releaseCommunity(page, index, { error: { message: "CHAT_RATE_LIMIT" } });
  assert.equal(await page.locator('[data-guild-message] [name="content"]').inputValue(), "Bravo l’équipe");
  assert.equal(await page.locator('[data-guild-message] [name="content"]').isEnabled(), true);
  await page.evaluate(() => { window.communityHold = []; });
  await page.locator('[data-guild-message] button').click();
  await page.waitForFunction(() => window.communityCalls.filter(c => c.name === "titan_send_guild_message").length === 2);
  await page.waitForFunction(() => document.querySelector('[data-guild-message] [name="content"]').value === "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community pending actions: accepting and declining the same request cannot race", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_social_respond"], overview: {
    requests_in: [{ id: "zoe", name: "Zoé", avatar: "scout" }],
  } });
  await page.evaluate(() => {
    document.querySelector("[data-accept]").click();
    document.querySelector("[data-decline]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_social_respond"));
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_social_respond").length), 1);
  assert.equal(await page.locator("[data-decline]").isDisabled(), true);
  const index = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_social_respond"));
  await releaseCommunity(page, index);
  await page.waitForFunction(() => !document.querySelector("[data-accept]").disabled);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community pending actions: a challenge form handler cannot create the same draft repeatedly", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_challenge_create"] });
  await page.locator("[data-new-challenge]").click();
  await page.locator('dialog [name="invite"]').check();
  await page.evaluate(() => {
    const form = document.querySelector("dialog[open] form");
    for (let i = 0; i < 3; i++) form.requestSubmit();
  });
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_challenge_create"));
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_challenge_create").length), 1);
  assert.equal(await page.locator('dialog [name="title"]').isDisabled(), true);
  const index = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_challenge_create"));
  await releaseCommunity(page, index);
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("community pending actions: closing a challenge while it is being sent cannot imply cancellation", async () => {
  for (const close of ["button", "header", "escape", "backdrop"]) {
    const { page, context, errors } = await communityPage({ hold: ["titan_challenge_create"] });
    await page.locator("[data-new-challenge]").click();
    await page.locator('dialog [name="invite"]').check();
    await page.locator('dialog [type="submit"]').click();
    await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_challenge_create"));
    if (close === "button") await page.locator("dialog [data-cancel]").evaluate(el => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    if (close === "header") await page.locator("dialog [data-close]").evaluate(el => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    if (close === "escape") await page.keyboard.press("Escape");
    if (close === "backdrop") await page.locator("dialog[open]").evaluate(el => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(await page.locator("dialog[open]").count(), 1, close);
    const index = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_challenge_create"));
    await releaseCommunity(page, index, { error: { message: "CHALLENGE_INVALID" } });
    await page.waitForFunction(() => !document.querySelector("dialog [data-cancel]").disabled);
    await page.locator("dialog [data-cancel]").click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("community pending actions: same-session refresh cannot erase a guild draft still being sent", async () => {
  const { page, context, errors } = await communityPage({ guild: true, hold: ["titan_send_guild_message"] });
  await page.locator('[data-guild-message] [name="content"]').fill("On continue demain");
  await page.locator('[data-guild-message] button').click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_send_guild_message"));
  const before = await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_social_overview").length);
  await page.evaluate(async () => {
    window.dispatchEvent(new Event("online"));
    await new Promise(requestAnimationFrame);
  });
  assert.equal(await page.locator('[data-guild-message] [name="content"]').inputValue(), "On continue demain");
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_social_overview").length), before);
  const index = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_send_guild_message"));
  await releaseCommunity(page, index, { error: { message: "CHAT_RATE_LIMIT" } });
  assert.equal(await page.locator('[data-guild-message] [name="content"]').inputValue(), "On continue demain");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community pending actions: reconnecting while a message is unresolved keeps the wait explicit and blocks a second send", async () => {
  const { page, context, errors } = await communityPage({ guild: true, hold: ["titan_send_guild_message"] });
  await page.locator('[data-guild-message] [name="content"]').fill("Message avant déconnexion");
  await page.locator('[data-guild-message] button').click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_send_guild_message"));
  await context.setOffline(true);
  await page.getByRole("heading", { name: "Hors ligne", exact: true }).waitFor();
  await context.setOffline(false);
  await page.getByText("Discussion privée alice", { exact: false }).waitFor();
  assert.equal(await page.getByRole("status").filter({ hasText: "Envoi en cours" }).count(), 1);
  assert.equal(await page.locator('[data-guild-message] [name="content"]').isDisabled(), true);
  await page.evaluate(() => document.querySelector("[data-guild-message]").requestSubmit());
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_send_guild_message").length), 1);
  const index = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_send_guild_message"));
  await releaseCommunity(page, index, { error: { message: "CHAT_RATE_LIMIT" } });
  assert.equal(await page.locator('[data-guild-message] [name="content"]').isEnabled(), true);
  assert.equal(await page.getByRole("status").filter({ hasText: "Envoi en cours" }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community pending actions: completion from an old account cannot unlock the new account's message", async () => {
  const { page, context, errors } = await communityPage({ guild: true, hold: ["titan_send_guild_message"] });
  await page.locator('[data-guild-message] [name="content"]').fill("Message Alice");
  await page.locator('[data-guild-message] button').click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_send_guild_message"));
  const alice = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_send_guild_message"));
  await page.evaluate(() => window.communitySwitch("bob"));
  await page.getByText("Discussion privée bob", { exact: false }).waitFor();
  await page.locator('[data-guild-message] [name="content"]').fill("Message Bob");
  await page.locator('[data-guild-message] button').click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_send_guild_message" && c.owner === "bob"));
  await releaseCommunity(page, alice);
  assert.equal(await page.locator('[data-guild-message] [name="content"]').isDisabled(), true);
  await page.evaluate(async () => {
    document.querySelector("[data-guild-message]").requestSubmit();
    await new Promise(requestAnimationFrame);
  });
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_send_guild_message" && c.owner === "bob").length), 1);
  const bob = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_send_guild_message" && c.owner === "bob"));
  await releaseCommunity(page, bob);
  await page.waitForFunction(() => !document.querySelector('[data-guild-message] [name="content"]').disabled);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community pending actions: challenge failure restores the draft and the next attempt clears its old error", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_challenge_create"] });
  await page.locator("[data-new-challenge]").click();
  await page.locator('dialog [name="title"]').fill("Une semaine ensemble");
  await page.locator('dialog [name="target"]').fill("600");
  await page.locator('dialog [name="invite"]').check();
  await page.locator('dialog [type="submit"]').click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_challenge_create"));
  const index = await page.evaluate(() => window.communityCalls.findIndex(c => c.name === "titan_challenge_create"));
  await releaseCommunity(page, index, { error: { message: "CHALLENGE_INVALID" } });
  await page.getByRole("alert").filter({ hasText: "Vérifie la mesure" }).waitFor();
  assert.equal(await page.locator('dialog [name="title"]').inputValue(), "Une semaine ensemble");
  assert.equal(await page.locator('dialog [name="target"]').inputValue(), "600");
  assert.equal(await page.locator('dialog [name="invite"]').isChecked(), true);
  assert.equal(await page.locator('dialog [type="submit"]').isEnabled(), true);
  await page.locator('dialog [type="submit"]').click();
  await page.waitForFunction(() => window.communityCalls.filter(c => c.name === "titan_challenge_create").length === 2);
  assert.equal(await page.locator('dialog .jr-edit-error').textContent(), "");
  assert.equal(await page.locator('dialog [name="title"]').isDisabled(), true);
  const retry = await page.evaluate(() => window.communityCalls.findLastIndex(c => c.name === "titan_challenge_create"));
  await releaseCommunity(page, retry);
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("community hierarchy: section shortcuts explain their destinations and keyboard navigation keeps every action reachable", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await communityPage({ width, overview: {
      requests_in: [{ id: "zoe", name: "Zoé", avatar: "scout" }],
    } });
    const nav = page.getByRole("navigation", { name: "Dans la communauté" });
    assert.deepEqual(await nav.locator("a").evaluateAll(links => links.map(a => a.getAttribute("href"))), ["#moments", "#amis", "#defis", "#guilde"]);
    assert.match(await nav.locator('a[href="#amis"]').textContent(), /1 demande/);
    assert.match(await nav.locator('a[href="#moments"]').textContent(), /2 Moments/);
    for (const id of ["amis", "defis", "guilde", "moments"]) {
      const link = nav.locator(`a[href="#${id}"]`);
      assert.equal(await link.evaluate(el => el.getBoundingClientRect().height >= 44), true);
      await link.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(id => location.hash === "#" + id && document.activeElement.id === id, id);
      const target = page.locator("#" + id);
      assert.equal(await target.isVisible(), true);
      assert.equal(await target.evaluate(el => el.getBoundingClientRect().top >= document.querySelector(".asc-topbar").getBoundingClientRect().bottom), true);
    }
    assert.equal(await page.getByRole("button", { name: "Accepter", exact: true }).count(), 1);
    await page.getByRole("textbox", { name: "Nom de la guilde", exact: true }).fill("Les grimpeurs");
    await page.getByRole("textbox", { name: "Code de guilde", exact: true }).fill("G-AB12");
    assert.equal(await page.locator("[data-new-challenge]").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("community hierarchy: empty sections offer a useful next step without invented social counts or rankings", async () => {
  const { page, context, errors } = await communityPage({ overview: { friends: [], moments: [], requests_in: [], requests_out: [], challenges: [] } });
  const nav = page.getByRole("navigation", { name: "Dans la communauté" });
  assert.match(await nav.locator('a[href="#moments"]').textContent(), /Aucun Moment/);
  assert.match(await nav.locator('a[href="#amis"]').textContent(), /Ajouter un ami/);
  assert.match(await nav.locator('a[href="#defis"]').textContent(), /Avec tes amis/);
  assert.match(await nav.locator('a[href="#guilde"]').textContent(), /Rejoindre une équipe/);
  await page.locator('#moments a[href="/records"]').click();
  await page.waitForURL("**/records");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community hierarchy: an incoming deep link lands on the asynchronously loaded section", async () => {
  const { page, context, errors } = await communityPage({ hash: "#guilde", guild: true });
  await page.waitForFunction(() => {
    const target = document.getElementById("guilde"), top = target?.getBoundingClientRect().top;
    return top >= document.querySelector(".asc-topbar").getBoundingClientRect().bottom && top < innerHeight - 100;
  });
  assert.equal(await page.getByRole("region", { name: "Guilde privée alice", exact: true }).count(), 1);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("On y va !");
  await page.getByRole("button", { name: "Envoyer le message", exact: true }).click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_send_guild_message"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: changing account clears private content and open dialogs immediately", async () => {
  const { page, context, errors } = await communityPage();
  await page.locator("[data-friend-menu]").click();
  await page.getByRole("dialog", { name: "Ami privé alice" }).waitFor();
  await page.evaluate(() => window.communitySwitch("bob", false));
  assert.equal(await page.locator("#communaute").textContent().then(t => t.includes("privé alice")), false);
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.locator("#communaute").getAttribute("aria-busy"), "false");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: an old overview cannot render after an account transition and the new account reloads", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_social_overview"] });
  await page.evaluate(() => window.communitySwitch("bob", false));
  await releaseCommunity(page, 0);
  assert.equal(await page.locator("#communaute").textContent().then(t => t.includes("privé alice")), false);
  await page.evaluate(() => {
    window.communityHold = [];
    window.titanAccountTransition.active = false;
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  });
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  assert.equal(await page.locator(".cm-code-value").textContent(), "TN-bob");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: a late guild response cannot survive a new epoch for the same account", async () => {
  const { page, context, errors } = await communityPage({ guild: true, hold: ["titan_get_my_guild"] });
  await page.waitForFunction(() => window.communityCalls.length === 2);
  await page.evaluate(() => window.communitySwitch("alice", false));
  await releaseCommunity(page, 1);
  assert.equal(await page.locator("#communaute").textContent().then(t => t.includes("Discussion privée alice")), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: the newest overview wins over an earlier delayed error", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_social_overview"] });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => window.communityCalls.length === 2);
  const fresh = await page.evaluate(() => ({ data: window.communityOverview("alice", "récent") }));
  await releaseCommunity(page, 1, fresh);
  await page.getByText("Moment privé récent", { exact: true }).waitFor();
  await releaseCommunity(page, 0, { error: { code: "PGRST202" } });
  assert.equal(await page.getByText("Moment privé récent", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("heading", { name: "Communauté bientôt disponible" }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: an overview for an unexpected owner is never displayed", async () => {
  const { page, context, errors } = await communityPage({ wrongOwner: true });
  assert.equal(await page.locator(".cm-code-value").count(), 0);
  await page.getByRole("heading", { name: "Communauté indisponible" }).waitFor();
  assert.equal(await page.locator("#communaute [data-retry]").count(), 1);
  await page.evaluate(() => { window.communityWrongOwner = false; });
  await page.locator("#communaute [data-retry]").click();
  await page.getByText("Moment privé alice", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: a previous confirmation cannot send its action in another session", async () => {
  const { page, context, errors } = await communityPage();
  await page.locator("[data-delete-moment]").click();
  await page.evaluate(() => {
    window.previousCommunityOK = document.querySelector("dialog [data-ok]");
    window.communitySwitch("bob");
    window.previousCommunityOK.click();
  });
  assert.equal(await page.evaluate(() => window.communityCalls.some(c => c.name === "titan_moment_delete")), false);
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: a late cheer failure cannot post feedback to the next account", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_moment_cheer"] });
  await page.locator("[data-cheer]").click();
  await page.waitForFunction(() => window.communityCalls.length === 2);
  await page.evaluate(() => window.communitySwitch("bob"));
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  await releaseCommunity(page, 1, { error: { message: "Network failed" } });
  assert.equal(await page.locator(".asc-toasts").textContent(), "");
  assert.equal(await page.locator(".cm-code-value").textContent(), "TN-bob");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: a previous challenge draft cannot submit its private invitees after transition", async () => {
  const { page, context, errors } = await communityPage();
  await page.locator("[data-new-challenge]").click();
  await page.locator('dialog [name="invite"]').check();
  await page.evaluate(() => {
    window.previousCommunityDraft = document.querySelector("dialog form");
    window.communitySwitch("bob");
    window.previousCommunityDraft.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.evaluate(() => window.communityCalls.some(c => c.name === "titan_challenge_create")), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: an old confirmation response cannot refresh or notify the new account", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_moment_delete"] });
  await page.locator("[data-delete-moment]").click();
  await page.locator("dialog [data-ok]").click();
  await page.waitForFunction(() => window.communityCalls.length === 2);
  assert.equal(await page.evaluate(() => window.communityCalls[1].owner), "alice");
  await page.evaluate(() => window.communitySwitch("bob"));
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  await releaseCommunity(page, 1);
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.evaluate(() => window.communityCalls.length), 3, "only the new account overview follows the transition");
  assert.equal(await page.locator(".asc-toasts").textContent(), "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: normal friend, challenge and guild actions still work in their current session", async () => {
  const { page, context, errors } = await communityPage({ guild: true, width: 1280 });
  await page.locator("[data-add-friend] [name=code]").fill("tn-ab12");
  await page.locator("[data-add-friend] button").click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_social_request"));
  await page.getByText("Moment privé alice", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.communityCalls.find(c => c.name === "titan_social_request").params.p_code), "TN-AB12");
  await page.locator("[data-friend-menu]").click();
  // A same-session refresh must not invalidate an already open friend menu.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByText("Moment privé alice", { exact: true }).waitFor();
  await page.locator('dialog [data-m="remove"]').click();
  await page.locator("dialog [data-ok]").click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_social_remove"));
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.getByText("Moment privé alice", { exact: true }).waitFor();
  await page.locator("[data-friend-menu]").click();
  const refreshing = await page.evaluate(() => {
    window.communityHold = ["titan_social_overview"];
    const index = window.communityCalls.length;
    window.dispatchEvent(new Event("online"));
    return index;
  });
  await page.locator('dialog [data-m="challenge"]').click();
  await page.getByRole("dialog", { name: "Nouveau défi" }).waitFor();
  await page.evaluate(() => { window.communityHold = []; });
  await releaseCommunity(page, refreshing);
  await page.locator('dialog [name="invite"]').check();
  await page.locator('dialog button[type="submit"]').click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_challenge_create"));
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.getByText("Moment privé alice", { exact: true }).waitFor();
  await page.locator("[data-guild-message] [name=content]").fill("Bravo l’équipe");
  await page.locator("[data-guild-message] button").click();
  await page.waitForFunction(() => window.communityCalls.some(c => c.name === "titan_send_guild_message"));
  await page.getByText("Moment privé alice", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.communityCalls.every(c => c.owner === "alice")), true);
  assert.deepEqual(await page.evaluate(() => window.communityCalls.find(c => c.name === "titan_challenge_create").params.p_invitees), ["friend-alice"]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: offline recovery and guest sign-out clear private content without guest RPCs", async () => {
  const { page, context, errors } = await communityPage();
  await context.setOffline(true);
  await page.getByRole("heading", { name: "Hors ligne", exact: true }).waitFor();
  assert.equal(await page.locator("#communaute").textContent().then(t => t.includes("privé alice")), false);
  await context.setOffline(false);
  await page.getByText("Moment privé alice", { exact: true }).waitFor();
  const calls = await page.evaluate(() => window.communityCalls.length);
  await page.evaluate(() => window.communitySwitch("guest_signed_out"));
  await page.getByRole("heading", { name: "Avancer avec les autres, sans bruit." }).waitFor();
  assert.equal(await page.locator("#communaute").getAttribute("aria-busy"), "false");
  assert.equal(await page.evaluate(() => window.communityCalls.length), calls);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: replacing the client rejects its late overview and focus loads the current session", async () => {
  const { page, context, errors } = await communityPage({ hold: ["titan_social_overview"] });
  await page.evaluate(() => {
    const auth = window.titanClient.auth;
    window.titanClient = { auth, rpc: () => ({ setHeader: () => Promise.resolve({ data: window.communityOverview("alice", "nouveau client") }) }) };
  });
  await releaseCommunity(page, 0);
  assert.equal(await page.locator(".cm-code-value").count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("Moment privé nouveau client", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: previous private notifications disappear as soon as the account changes", async () => {
  const { page, context, errors } = await communityPage();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true }));
  await page.locator("[data-copy-code]").click();
  await page.locator(".asc-toasts").getByText("TN-alice", { exact: true }).waitFor();
  await page.evaluate(() => window.communitySwitch("bob", false));
  assert.equal(await page.locator(".asc-toasts").textContent(), "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: the real SDK pins a mutation to its captured owner when the auth lookup changes", async () => {
  const { page, context, errors } = await communityPage();
  await page.evaluate(() => {
    window.communityHeaders = [];
    const client = window.supabase.createClient("https://fixture.invalid", "fixture-anon", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        const header = new Headers(options.headers).get("Authorization");
        const name = String(url).split("/").pop();
        window.communityHeaders.push({ name, h…44672 tokens truncated….tabIndex, panel: panel && { role: panel.getAttribute("role"), label: panel.getAttribute("aria-labelledby"), hidden: panel.hidden, tabIndex: panel.tabIndex } };
      }));
      const state = await inspect(); assert.equal(state.length, count);
      for (const tab of state) { assert.ok(tab.id && tab.panel); assert.equal(tab.panel.role, "tabpanel"); assert.equal(tab.panel.label, tab.id); assert.equal(tab.panel.hidden, !tab.selected); }
      assert.equal(state.filter(t => t.tabIndex === 0).length, 1);
      await tabs.first().focus(); await page.keyboard.press("Tab");
      assert.equal(await page.getByRole("tabpanel").evaluate(el => el === document.activeElement), true, "Tab exits the tablist to its content");
      await page.keyboard.press("Shift+Tab"); await tabFocus(page, 0);
      await page.keyboard.press("ArrowRight"); await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab"); await tabFocus(page, 0);
      await tabs.last().click(); await tabFocus(page, count - 1);
      const after = await inspect(); assert.equal(after.filter(t => t.selected).length, 1);
      assert.equal(after.filter(t => !t.panel.hidden).length, 1);
      assert.equal(after.at(-1).panel.hidden, false);
      assert.deepEqual(errors, []); await context.close();
    }
  });
}

test("tab focus: coaching keeps a pending tab through snapshot/detail renders without stealing outside focus", async () => {
  for (const width of [360, 1280]) {
    const fixture = await coachingTabsPage(width, { linked: true }), { page, context, errors } = fixture;
    const outsideControl = await outsideTabControl(page, "coaching");
    fixture.hold.add("sessions"); fixture.hold.add("assignments");
    await page.getByRole("tab").last().click();
    await fixture.waitPending(2);
    await page.getByRole("tab").first().focus();
    for (const pending of fixture.pending.splice(0)) pending.resolve();
    await page.getByText("Prépare une séance : l’athlète choisit de l’accepter.", { exact: true }).waitFor(); await tabFocus(page, 0);
    fixture.hold.clear();
    for (const outside of [false, true]) {
      fixture.hold.add("snapshot"); await page.evaluate(() => { window.tabBeforeRefresh = document.querySelector('[role="tab"]'); dispatchEvent(new Event("online")); });
      await fixture.waitPending(1);
      if (outside) await outsideControl.focus();
      else await page.getByRole("tab").first().focus();
      for (const pending of fixture.pending.splice(0)) pending.resolve();
      await page.waitForFunction(() => !window.tabBeforeRefresh.isConnected);
      if (outside) assert.equal(await outsideControl.evaluate(el => el === document.activeElement), true);
      else await tabFocus(page, 0);
      fixture.hold.clear();
    }
    assert.deepEqual(errors, []); await context.close();
  }
});

test("tab focus: atelier refresh preserves unselected focus and respects an outside control", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await atelierPage(width);
    const outsideControl = await outsideTabControl(page, "atelier");
    for (const outside of [false, true]) {
      await page.getByRole("tab").last().focus();
      await page.evaluate(() => { const rpc = window.titanClient.rpc; window.titanClient.rpc = name => name === "titan_atelier" ? new Promise(resolve => { window.finishTabRefresh = () => resolve({ data: structuredClone(window.atelierFixture) }); }) : rpc(name); window.tabBeforeRefresh = document.querySelector('[role="tab"]'); dispatchEvent(new Event("online")); });
      await page.waitForFunction(() => typeof window.finishTabRefresh === "function");
      if (outside) await outsideControl.focus();
      await page.evaluate(() => { window.finishTabRefresh(); delete window.finishTabRefresh; });
      await page.waitForFunction(() => !window.tabBeforeRefresh.isConnected);
      if (outside) assert.equal(await outsideControl.evaluate(el => el === document.activeElement), true);
      else await tabFocus(page, 2);
      assert.equal(await page.getByRole("tab").first().getAttribute("aria-selected"), "true");
    }
    assert.deepEqual(errors, []); await context.close();
  }
});

test("tab keyboard: unavailable coaching and an empty atelier catalog remain navigable", async () => {
  for (const width of [360, 1280]) {
    const coach = await coachingTabsPage(width, { unavailable: true });
    await coach.page.getByRole("tab").first().focus(); await coach.page.keyboard.press("ArrowRight"); await tabFocus(coach.page, 1);
    await coach.page.keyboard.press("Space"); await tabFocus(coach.page, 1); assert.equal(await coach.page.getByRole("tab").last().getAttribute("aria-selected"), "true");
    assert.deepEqual(coach.errors, []); await coach.context.close();
    const atelier = await atelierPage(width);
    await atelier.page.evaluate(() => { window.atelierFixture.items = []; dispatchEvent(new Event("online")); });
    await atelier.page.locator("[data-collection-empty]").waitFor();
    await atelier.page.getByRole("tab").first().focus(); await atelier.page.keyboard.press("End"); await atelier.page.keyboard.press("Enter"); await tabFocus(atelier.page, 2);
    assert.equal(await atelier.page.getByRole("tabpanel").getByText("Aucune pièce dans cette catégorie pour le moment.", { exact: true }).count(), 1);
    assert.deepEqual(atelier.errors, []); await atelier.context.close();
  }
});

// Keep the real checkout helper, Atelier and analytics transport; replace only external boundaries.
async function checkoutPage(width = 360, configured = true, granted = true, existing = null) {
  const fixture = await atelierPage(width, false, false, existing);
  await fixture.page.evaluate(({ configured, granted }) => {
    if (granted !== null) window.TitanAnalytics.setConsent(granted);
    window.checkoutWrites = []; window.checkoutOpens = []; window.activationToasts = [];
    window.checkoutReceiptTasks = [];
    if (navigator.locks?.request) {
      const request = navigator.locks.request.bind(navigator.locks);
      navigator.locks.request = (...args) => { const pending = request(...args); window.checkoutReceiptTasks.push(pending); return pending; };
    }
    window.checkoutMetricStatus = 201;
    window.titanClient.auth = { getSession: async () => ({ data: { session: { user: { id: window.state.user.id }, access_token: "fixture-token" } } }) };
    const nativeFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (new URL(input).pathname !== "/rest/v1/analytics_events") return nativeFetch(input, init);
      const row = JSON.parse(init.body); window.checkoutWrites.push(row);
      if (row.event_name === "premium_activated" && window.checkoutMetricGate) await window.checkoutMetricGate;
      return new Response(null, { status: window.checkoutMetricStatus });
    };
    const toast = window.titanShell.toast.bind(window.titanShell);
    window.titanShell.toast = options => { if (options.title === "TITAN+ est actif") window.activationToasts.push(options); return toast(options); };
    window.TITAN_PADDLE = configured ? { clientToken: "fixture-token", elitePriceId: "pri_fixture", environment: "sandbox" } : {};
    window.loadTitanPaddleSdk = async () => {
      window.checkoutSdkWaiting = true;
      if (window.checkoutSdkGate) await window.checkoutSdkGate;
      return { Environment: { set() {} }, Initialize() {}, Checkout: { open: data => window.checkoutOpens.push(data) } };
    };
    const open = window.openEliteCheckout;
    window.openEliteCheckout = options => window.checkoutOpening = open(options);
    const track = window.TitanAnalytics.track;
    window.TitanAnalytics.track = (name, props) => {
      const result = track(name, props);
      if (name === "premium_activated") window.checkoutActivation = result;
      return result;
    };
  }, { configured, granted });
  return fixture;
}
async function clickCheckout(page) {
  await page.click("[data-checkout]");
  await page.evaluate(() => window.checkoutOpening);
  await page.waitForFunction(() => !document.querySelector("[data-checkout]")?.disabled);
}
async function confirmCheckout(page) {
  await page.evaluate(() => { window.atelierFixture.plus.active = true; dispatchEvent(new Event("online")); });
  await page.waitForFunction(() => window.state.user.is_elite === true);
  await settleCheckout(page);
}
async function settleCheckout(page) {
  await page.evaluate(async () => {
    await Promise.all(window.checkoutReceiptTasks || []);
    await window.checkoutActivation;
    await Promise.all(window.checkoutReceiptTasks || []);
  });
}

test("checkout attribution: missing payment configuration leaves no activation receipt but preserves click intent", async () => {
  const { page, context, errors } = await checkoutPage(360, false);
  await clickCheckout(page);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("titan_checkout_started"))), []);
  await page.waitForFunction(() => window.checkoutWrites.some(r => r.event_name === "premium_checkout_started"));
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: SDK rejection and opening exception cannot leave an activation receipt", async () => {
  for (const failure of ["load", "open"]) {
    const { page, context, errors } = await checkoutPage();
    await page.evaluate(failure => {
      const load = window.loadTitanPaddleSdk;
      window.loadTitanPaddleSdk = async () => {
        if (failure === "load") throw Error("Synthetic SDK unavailable");
        const sdk = await load(); sdk.Checkout.open = () => { throw Error("Synthetic opening failure"); }; return sdk;
      };
    }, failure);
    await clickCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutOpening), false);
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("titan_checkout_started"))), []);
    assert.equal(await page.locator("[data-checkout]").getAttribute("aria-busy"), null);
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("checkout attribution: older RPC and compatibility-profile reads from a replaced client cannot overwrite a newer Free status", async () => {
  for (const gateway of ["rpc", "profile"]) {
    const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
    await page.evaluate(gateway => {
      const pending = [];
      const original = window.titanClient.rpc;
      const response = () => gateway === "rpc" ? { data: structuredClone(window.atelierFixture) }
        : { data: { is_elite: false, elite_renews_at: null, elite_ends_at: null } };
      window.readsPending = pending;
      if (gateway === "rpc") window.titanClient.rpc = name => name === "titan_atelier" ? new Promise(resolve => pending.push(resolve)) : original(name);
      else {
        window.titanClient.rpc = async () => ({ error: { code: "PGRST202" } });
        window.titanClient.from = table => {
          if (table !== "profiles") throw Error("Unexpected table");
          return { select: () => ({ eq: (field, owner) => {
            if (field !== "id" || owner !== window.state.user.id) throw Error("Unexpected profile owner");
            return { maybeSingle: () => new Promise(resolve => pending.push(resolve)) };
          } }) };
        };
        // Drop the already loaded Atelier through the real account lifecycle so fallback is reachable.
        const epoch = window.titanAccountTransition.epoch;
        window.titanAccountTransition = { epoch: epoch + 1, active: true }; dispatchEvent(new CustomEvent("titan:account-changing"));
        window.titanAccountTransition = { epoch: epoch + 1, active: false };
      }
      window.freeReadResponse = response(); dispatchEvent(new Event("online"));
    }, gateway);
    await page.waitForFunction(() => window.readsPending.length === 1);
    // Same-client reconnects share one read; replace the client to invalidate the old one.
    await page.evaluate(() => {
      window.titanClient = { ...window.titanClient };
      dispatchEvent(new Event("online"));
    });
    await page.waitForFunction(() => window.readsPending.length === 2);
    await page.evaluate(() => { window.state.user.is_elite = true; window.readsPending[1](window.freeReadResponse); });
    await page.waitForFunction(() => window.state.user.is_elite === false);
    await page.evaluate(gateway => {
      const stale = structuredClone(window.freeReadResponse);
      if (gateway === "rpc") stale.data.plus.active = true; else stale.data.is_elite = true;
      window.readsPending[0](stale);
    }, gateway);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.state.user.is_elite), false);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("checkout attribution: another account cannot consume the receipt and its owner receives one activation", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await checkoutPage(width);
    await clickCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutOpens[0].customData.user_id), "00000000-0000-4000-8000-000000000123");
    await page.evaluate(() => { window.state.user.id = "00000000-0000-4000-8000-000000000456"; });
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0, "B must not inherit A's checkout");
    assert.ok(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")));
    await page.evaluate(() => { window.state.user.id = "00000000-0000-4000-8000-000000000123"; window.state.user.is_elite = false; });
    await confirmCheckout(page);
    assert.deepEqual(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").map(r => r.user_id)), ["00000000-0000-4000-8000-000000000123"]);
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")), null);
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("checkout attribution: a refused metric retains the receipt for a fresh server confirmation", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => { window.checkoutMetricStatus = 500; });
  await confirmCheckout(page);
  assert.ok(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")), "failed delivery remains retryable");
  await page.evaluate(() => { window.checkoutMetricStatus = 201; window.state.user.is_elite = false; });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 2);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.state.user.credits), 2000);
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:00000000-0000-4000-8000-000000000123")), null);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: a session round trip during SDK loading prevents opening the old checkout", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => { window.checkoutSdkGate = new Promise(resolve => { window.finishCheckoutSdk = resolve; }); });
  await page.click("[data-checkout]"); await page.waitForFunction(() => window.checkoutSdkWaiting);
  await page.evaluate(() => {
    const epoch = window.titanAccountTransition?.epoch || 0;
    window.titanAccountTransition = { epoch: epoch + 1, active: true }; dispatchEvent(new CustomEvent("titan:account-changing"));
    window.state.user.id = "00000000-0000-4000-8000-000000000456";
    window.state.user.id = "00000000-0000-4000-8000-000000000123";
    window.titanAccountTransition = { epoch: epoch + 2, active: false }; dispatchEvent(new CustomEvent("titan:account-changed"));
    window.finishCheckoutSdk();
  });
  assert.equal(await page.evaluate(() => window.checkoutOpening), false);
  assert.equal(await page.evaluate(() => window.checkoutOpens.length), 0);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("titan_checkout_started"))), []);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: a stale server response after A to B to A cannot confirm activation", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    const rpc = window.titanClient.rpc;
    window.titanClient.rpc = name => name === "titan_atelier" ? new Promise(resolve => { window.finishOldAtelier = resolve; }) : rpc(name);
    dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => !!window.finishOldAtelier);
  await page.evaluate(() => {
    const epoch = window.titanAccountTransition?.epoch || 0;
    window.titanAccountTransition = { epoch: epoch + 1, active: true }; dispatchEvent(new CustomEvent("titan:account-changing"));
    window.state.user.id = "00000000-0000-4000-8000-000000000456";
    window.state.user.id = "00000000-0000-4000-8000-000000000123";
    window.titanAccountTransition = { epoch: epoch + 2, active: false };
    const response = structuredClone(window.atelierFixture); response.plus.active = true;
    window.finishOldAtelier({ data: response });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.state.user.is_elite), false);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: denied consent keeps functional activation and cannot revive the receipt", async () => {
  const { page, context, errors } = await checkoutPage(360, true, false); await clickCheckout(page); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.checkoutWrites.length), 0);
  await page.evaluate(() => { window.TitanAnalytics.setConsent(true); window.state.user.is_elite = false; });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: legacy, future and expired receipts cannot produce an activation", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => { localStorage.setItem("titan_checkout_started_v1", String(Date.now())); });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  await page.evaluate(() => {
    const owner = window.state.user.id;
    localStorage.setItem("titan_checkout_started_v2:" + owner, JSON.stringify({ v: 2, owner, at: Date.now(), notified: false }));
    window.state.user.is_elite = false;
  });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1, "an owned legacy receipt keeps the functional server confirmation");
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0, "legacy has no reliable preference snapshot");
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v2:" + window.state.user.id)), null);
  for (const at of [Date.now() + 86400000, Date.now() - 4 * 86400000]) {
    await page.evaluate(at => {
      const owner = window.state.user.id;
      localStorage.setItem("titan_checkout_started_v3:" + owner, JSON.stringify({ v: 3, owner, at, notified: false, consent: window.TitanAnalytics.consentSnapshot() }));
      window.state.user.is_elite = false;
    }, at);
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), null);
  }
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout attribution: an older ack cannot erase a newer receipt and concurrent refreshes send once", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    window.checkoutMetricGate = new Promise(resolve => { window.finishCheckoutMetric = resolve; });
    window.atelierFixture.plus.active = true; dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => window.checkoutWrites.some(r => r.event_name === "premium_activated"));
  assert.ok(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), "the receipt remains until the HTTP ack");
  await page.evaluate(() => {
    dispatchEvent(new Event("online"));
    const owner = window.state.user.id;
    window.newReceipt = JSON.stringify({ v: 3, owner, at: Date.now(), notified: false, consent: window.TitanAnalytics.consentSnapshot() });
    localStorage.setItem("titan_checkout_started_v3:" + owner, window.newReceipt);
    window.finishCheckoutMetric();
  });
  await page.evaluate(() => window.checkoutActivation);
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id) === window.newReceipt), true);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("consent replay: refusal then agreement between confirmations cannot revive a failed activation", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await checkoutPage(width);
    await page.evaluate(() => {
      const NativeDate = Date, fixed = Date.now();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
      window.TitanAnalytics.setConsent(true); // All following preference changes have the same timestamp.
    });
    await clickCheckout(page);
    await page.evaluate(() => { window.checkoutMetricStatus = 500; }); await confirmCheckout(page);
    await page.evaluate(() => {
      window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true);
      window.checkoutMetricStatus = 201; window.state.user.is_elite = false;
    });
    await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1, "only the pre-refusal failed attempt exists");
    assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
    assert.equal(await page.evaluate(() => window.state.user.credits), 2000);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("consent replay: refusal during a failed ack prevents a later retry", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    window.checkoutMetricStatus = 500;
    window.checkoutMetricGate = new Promise(resolve => { window.finishCheckoutMetric = resolve; });
    window.atelierFixture.plus.active = true; dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => window.checkoutWrites.some(r => r.event_name === "premium_activated"));
  await page.evaluate(() => { window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true); window.finishCheckoutMetric(); });
  await page.evaluate(() => window.checkoutActivation);
  await page.evaluate(() => { window.checkoutMetricStatus = 201; window.state.user.is_elite = false; }); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
  assert.deepEqual(errors, []); await context.close();
});

test("consent replay: a changed preference during SDK loading preserves payment and functional activation only", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => { window.checkoutSdkGate = new Promise(resolve => { window.finishCheckoutSdk = resolve; }); });
  await page.click("[data-checkout]"); await page.waitForFunction(() => window.checkoutSdkWaiting);
  await page.evaluate(() => { window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true); window.finishCheckoutSdk(); });
  assert.equal(await page.evaluate(() => window.checkoutOpening), true);
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutOpens.length), 1);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("consent replay: preference changes on the real profile survive leaving and reopening Atelier", async () => {
  for (const changed of [false, true]) {
    const fixture = await checkoutPage(), { page, context, errors } = fixture; await clickCheckout(page);
    await page.evaluate(() => { window.checkoutMetricStatus = 500; }); await confirmCheckout(page);
    await page.goto(BASE + "/profile", { waitUntil: "load" });
    await page.locator('[data-profile-group="account"] > summary').click();
    await page.locator("[data-analytics]").waitFor();
    assert.equal(await page.locator("[data-analytics]").isChecked(), true);
    if (changed) { await page.locator("[data-analytics]").uncheck(); await page.locator("[data-analytics]").check(); }
    await checkoutPage(360, true, null, fixture); await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), changed ? 0 : 1);
    assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("consent replay: refusal in another real tab prevents old conversion while a new checkout remains measurable", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => { window.checkoutMetricStatus = 500; }); await confirmCheckout(page);
  const prefs = await context.newPage(); await prefs.goto(BASE + "/profile", { waitUntil: "load" });
  await prefs.locator('[data-profile-group="account"] > summary').click();
  await prefs.locator("[data-analytics]").uncheck(); await prefs.locator("[data-analytics]").check(); await prefs.close();
  await page.evaluate(() => { window.checkoutMetricStatus = 201; window.state.user.is_elite = false; }); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  // A fresh page removes the old SDK-opening lock without bypassing its production guard.
  await checkoutPage(360, true, null, { page, context, errors }); await clickCheckout(page); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("consent storage: the real profile warns when a refusal cannot be saved", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  await page.locator('[data-profile-group="account"] > summary').click();
  await page.locator("[data-analytics]").waitFor();
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
    window.privacyToasts = [];
    const toast = window.titanShell.toast.bind(window.titanShell);
    window.titanShell.toast = options => { window.privacyToasts.push(options); return toast(options); };
  });
  await page.locator("[data-analytics]").uncheck();
  assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
  const notice = await page.evaluate(() => window.privacyToasts.at(-1));
  assert.equal(notice.type, "warn");assert.match(notice.message, /rechargement/);
  assert.doesNotMatch(notice.message, /Plus rien n’est envoyé/);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout confirmation: failed notification persistence still confirms functionally once in the page", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("titan_checkout_started")) throw Error("Synthetic receipt write failure"); return save.call(this, key, value); };
    window.checkoutMetricStatus = 500;
  });
  await confirmCheckout(page); await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 2, "unchanged consent permits legitimate failed-ack retries");
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: preference invalidation cannot erase a newer receipt from another tab", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => {
    const key = "titan_checkout_started_v3:" + window.state.user.id;
    const receipt = JSON.parse(localStorage.getItem(key)); receipt.notified = true; localStorage.setItem(key, JSON.stringify(receipt));
    window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true);
    window.newReceipt = JSON.stringify({ v: 3, owner: window.state.user.id, at: Date.now(), notified: false, consent: window.TitanAnalytics.consentSnapshot() });
    const snapshot = window.TitanAnalytics.consentSnapshot;
    window.TitanAnalytics.consentSnapshot = () => { localStorage.setItem(key, window.newReceipt); window.TitanAnalytics.consentSnapshot = snapshot; return snapshot(); };
  });
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), await page.evaluate(() => window.newReceipt));
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.deepEqual(errors, []); await context.close();
});

test("consent storage: signup exposes an unsaved choice before automatic navigation", async () => {
  for (const session of [false, true]) {
    const { page, context, errors } = await newPage(); await page.goto(BASE + "/login?mode=signup", { waitUntil: "load" });
    await page.evaluate(session => {
      localStorage.setItem("titan_privacy_v1", JSON.stringify({ analytics: "granted" }));
      const save = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
      const client = window.initTitanSupabaseClient(), user = { id: "00000000-0000-4000-8000-000000000123" };
      client.auth.signUp = async () => ({ data: { user, session: session ? { user, access_token: "fixture-token" } : null }, error: null });
      client.auth.getSession = async () => ({ data: { session: null } });
    }, session);
    await page.fill("[name=name]", "Test consentement"); await page.fill("[name=email]", "fixture@example.test");
    await page.fill("[name=password]", "synthetic-password"); await page.check("[name=terms]"); await page.click(".auth-submit");
    await page.getByRole("alert").filter({ hasText: "rechargement" }).waitFor({ timeout: 3000 });
    assert.match(page.url(), /\/login\?mode=signup$/);assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
    if (session) { await page.locator("#auth a[href='/onboarding']").click(); await page.waitForURL("**/onboarding"); }
    else assert.equal(await page.locator(".auth-sent").count(), 1);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("consent storage: onboarding shows an unsaved choice before continuing", async () => {
  const { page, context, errors } = await newPage();
  await page.addInitScript(() => { localStorage.setItem("titan_privacy_v1", JSON.stringify({ analytics: "granted" })); });
  await page.goto(BASE + "/onboarding?again=1", { waitUntil: "load" });
  await page.locator("[data-next]").click(); await page.locator("[data-next]").click(); await page.locator("[data-analytics]").uncheck();
  await page.locator("[data-next]").click();
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
  });
  await page.locator("[data-finish][href='/aujourdhui']").click();
  await page.getByRole("alert").filter({ hasText: "rechargement" }).waitFor({ timeout: 3000 });
  assert.match(page.url(), /\/onboarding\?again=1$/);assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
  assert.equal(await page.evaluate(() => window.state.user.onboardingComplete), true);
  await page.locator(".ob-go a[href='/aujourdhui']").click(); await page.waitForURL("**/aujourdhui");
  assert.deepEqual(errors, []); await context.close();
});

test("consent storage: an unsaved agreement yields to a refusal in a real second tab", async () => {
  const { page, context, errors } = await checkoutPage();
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === "titan_privacy_v1") throw Error("Synthetic write failure"); return save.call(this, key, value); };
    window.TitanAnalytics.setConsent(true);
  });
  await clickCheckout(page);
  const prefs = await context.newPage(); await prefs.goto(BASE + "/profile", { waitUntil: "load" });
  await prefs.locator('[data-profile-group="account"] > summary').click();
  await prefs.locator("[data-analytics]").uncheck();
  await confirmCheckout(page);
  assert.equal(await page.evaluate(() => window.TitanAnalytics.consent()), "denied");
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: a real cross-tab lock protects confirmation from concurrent replacement", async () => {
  const { page, context, errors } = await checkoutPage(); await clickCheckout(page);
  await page.evaluate(() => { window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true); });
  const writer = await context.newPage(); await writer.goto(BASE + "/legal_privacy", { waitUntil: "load" });
  await writer.evaluate(() => {
    window.writerLock = navigator.locks.request("titan_checkout_receipt:00000000-0000-4000-8000-000000000123", async () => {
      window.writerLocked = true; await new Promise(resolve => { window.releaseWriter = resolve; });
    });
  });
  await writer.waitForFunction(() => window.writerLocked);
  await page.evaluate(() => { window.atelierFixture.plus.active = true; dispatchEvent(new Event("online")); });
  await page.waitForFunction(async () => (await navigator.locks.query()).pending.some(l => l.name === "titan_checkout_receipt:" + window.state.user.id), null, { timeout: 2000 });
  await writer.evaluate(() => {
    const owner = "00000000-0000-4000-8000-000000000123";
    localStorage.setItem("titan_checkout_started_v3:" + owner, JSON.stringify({ v: 3, owner, at: Date.now(), notified: false, consent: localStorage.getItem("titan_privacy_v1") }));
    window.releaseWriter();
  });
  await settleCheckout(page);
  assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 1, "the current replacement is measured after the writer releases its lock");
  assert.equal(await page.evaluate(() => window.activationToasts.length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: opening waits for a real cross-tab receipt writer before changing storage", async () => {
  const { page, context, errors } = await checkoutPage();
  const writer = await context.newPage(); await writer.goto(BASE + "/legal_privacy", { waitUntil: "load" });
  await writer.evaluate(() => {
    window.writerLock = navigator.locks.request("titan_checkout_receipt:00000000-0000-4000-8000-000000000123", async () => {
      window.writerLocked = true; await new Promise(resolve => { window.releaseWriter = resolve; });
    });
  });
  await writer.waitForFunction(() => window.writerLocked); await page.click("[data-checkout]");
  await page.waitForFunction(async () => (await navigator.locks.query()).pending.some(l => l.name === "titan_checkout_receipt:" + window.state.user.id), null, { timeout: 2000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), null);
  await writer.evaluate(() => { window.releaseWriter(); });
  await page.waitForFunction(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id));
  assert.equal(await page.evaluate(() => window.checkoutOpens.length), 1);
  assert.deepEqual(errors, []); await context.close();
});

test("checkout receipt: browsers without locks keep functional confirmation read-only", async () => {
  for (const existing of [false, true]) {
    const { page, context, errors } = await checkoutPage();
    if (existing) await clickCheckout(page);
    const raw = await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id));
    await page.evaluate(() => { Object.defineProperty(navigator, "locks", { value: undefined, configurable: true }); });
    if (!existing) await clickCheckout(page);
    await confirmCheckout(page); await confirmCheckout(page);
    assert.equal(await page.evaluate(() => window.state.user.is_elite), true);
    assert.equal(await page.evaluate(() => window.checkoutOpens.length), 1);
    assert.equal(await page.evaluate(() => window.activationToasts.length), existing ? 1 : 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v3:" + window.state.user.id)), raw);
    assert.equal(await page.evaluate(() => window.checkoutWrites.filter(r => r.event_name === "premium_activated").length), 0);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("atelier: Free can buy a formerly exclusive frame permanently at 360 and 1280 px", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await atelierPage(width);
    assert.match(await page.locator('[data-buy="cos_frame_aegis"]').innerText(), /Débloquer/);
    assert.match(await page.locator("#collection").innerText(), /1[\s\u202f\u00a0]?400/);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-fair-free-${width}.png`, fullPage: true });
    await page.click('[data-buy="cos_frame_aegis"]');
    assert.match(await page.locator("dialog[open]").innerText(), /gardée dans ta collection|permanent/i);
    await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
    await page.waitForSelector("dialog[open]", { state: "hidden" });
    assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
    assert.match(await page.locator("#collection").innerText(), /Acquis définitivement/);
    assert.equal(await page.evaluate(() => window.state.user.credits), 600);
    assert.equal(await page.evaluate(() => window.titanShell.look().frame), "frame-aegis", "earned frame reaches the shared shell");
    await page.locator('.asc-avatar[data-frame="frame-aegis"]').first().waitFor({ state: "attached" });
    assert.ok(await page.locator('.asc-avatar[data-frame="frame-aegis"]').count(), "navigation displays the earned frame");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `Atelier overflow at ${width}`);
    assert.deepEqual(errors, []);
    const resolved = await page.evaluate(() => window.atelierFixture);
    await page.goto(BASE + "/profile", { waitUntil: "load" });
    await page.evaluate(async (resolved) => {
      const u = window.state.user;
      u.id = "00000000-0000-4000-8000-000000000123";
      u.is_elite = false;
      // Reconnection restores a raw stored preference containing an old, expired borrowed ambiance.
      u.appearance = { frame: "frame-aegis", map: "map-aurora" };
      delete u.appearanceAccess;
      window.titanClient = { rpc: async (name) => name === "titan_atelier" ? { data: resolved } : { error: { code: "PGRST202" } } };
      await window.titanSyncAppearance();
      window.titanShell.refresh();
      dispatchEvent(new CustomEvent("titan:history-updated"));
    }, resolved);
    await page.waitForSelector('.pf-avatar[data-frame="frame-aegis"]');
    const sportFixture = await seedSports(page);
    await page.locator('[data-profile-group="sport"] > summary').click();
    await page.getByRole("searchbox", { name: "Rechercher un sport" }).fill(sportFixture.target.label);
    await page.selectOption("#mastery-scope", "favorites");
    await page.waitForSelector("#maitrise .pf-mastery-row");
    assert.equal(await page.locator("#maitrise .pf-mastery-row").count(), 1);
    assert.equal(await page.locator('.pf-avatar[data-frame="frame-aegis"]').count(), 1, "200-sport mastery rerenders keep the acquired frame");
    assert.equal(await page.evaluate(() => window.titanShell.look().map), undefined, "raw expired preference is never reauthorized on navigation");
    assert.equal(await page.evaluate(async (resolved) => {
      let finish;
      window.titanClient.rpc = () => new Promise((resolve) => { finish = resolve; });
      const pending = window.titanSyncAppearance();
      window.state.user.id = "00000000-0000-4000-8000-000000000456";
      window.state.user.appearance = {};
      finish({ data: resolved });
      await pending;
      return window.titanShell.look().frame;
    }, resolved), undefined, "late response from the previous user is ignored");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("atelier: a subscriber can purchase a borrowed piece and keep it when Titan+ ends", async () => {
  const { page, context, errors } = await atelierPage(360, true);
  assert.match(await page.locator("#collection").innerText(), /Accès temporaire TITAN\+/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').evaluate((b) =>
    b.getBoundingClientRect().right <= b.closest(".at-body").getBoundingClientRect().right + 1), true, "purchase control stays inside its card body");
  if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: "/tmp/titan-fair-plus-360.png", fullPage: true });
  await page.click('[data-buy="cos_frame_aegis"]');
  await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
  await page.waitForSelector("dialog[open]", { state: "hidden" });
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.plus.active = false;
    for (const i of d.items) if (!i.permanent) i.owned = false;
    dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => window.state.user.is_elite === false);
  assert.match(await page.locator("#collection").innerText(), /Acquis définitivement/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
  assert.equal(await page.evaluate(() => window.state.user.appearance.frame), "frame-aegis");
  assert.equal(await page.evaluate(() => window.titanShell.look().frame), "frame-aegis", "permanent access survives expiry on all shell consumers");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier inventory: acquired pieces exclude borrowed access and stay available after removing a style", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await atelierPage(width, true);
    assert.equal(await page.locator('[data-collection="owned"]').count(), 1, "inventory filter is available");
    await page.click('[data-collection="owned"]');
    assert.equal(await page.locator("#collection .at-item").count(), 1, "only the base frame is permanently acquired");
    assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0, "a borrowed piece is not in the permanent inventory");
    await page.click('[data-collection="all"]');
    await page.click('[data-buy="cos_frame_aegis"]');
    await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
    await page.waitForSelector("dialog[open]", { state: "hidden" });
    await page.click('[data-collection="owned"]');
    assert.equal(await page.locator("#collection .at-item").count(), 2);
    assert.equal(await page.locator('[data-remove="frame"]').count(), 1, "an equipped piece can be removed");
    await page.locator('[data-remove="frame"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.state.user.appearance.frame === "frame-standard");
    assert.equal(await page.locator('[data-wear="cos_frame_aegis"]').count(), 1, "removing does not discard the purchase");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.wear), "cos_frame_aegis", "keyboard focus stays on the removed piece");
    assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
    assert.equal(await page.evaluate(() => window.state.user.credits), 600, "removing never spends credits");
    assert.equal(await page.evaluate(() => window.titanShell.look().frame), undefined, "the base frame removes the visible decoration");
    await page.waitForFunction(() => !document.querySelector('.asc-avatar[data-frame="frame-aegis"]'));
    assert.equal(await page.locator('.asc-avatar[data-frame="frame-aegis"]').count(), 0);
    assert.equal(await page.evaluate(() => window.atelierCalls.filter((c) => c.name === "titan_purchase_shop_item").length), 1);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.titanShell.look().frame === "frame-aegis");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-inventory-${width}.png`, fullPage: true, animations: "disabled" });
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("atelier inventory: locked filter has a useful empty state and legacy purchases stay acquired", async () => {
  const { page, context, errors } = await atelierPage(360, false, true);
  assert.equal(await page.locator('[data-collection="owned"]').count(), 1);
  await page.click('[data-collection="owned"]');
  assert.equal(await page.locator('[data-wear="cos_frame_neon"]').count(), 1);
  await page.click('[data-collection="locked"]');
  assert.equal(await page.locator("#collection .at-item").count(), 2, "old subscription pieces are still not acquired");
  await page.click('[data-slot="map"][role="tab"]');
  await page.click('[data-collection="owned"]');
  assert.equal(await page.locator("#collection .at-item").count(), 1);
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.items.find((i) => i.id === "cos_map_aurora").owned = true;
    d.items.find((i) => i.id === "cos_map_aurora").unlock = "credits";
    dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => document.querySelectorAll("#collection .at-item").length === 2);
  await page.click('[data-collection="locked"]');
  assert.equal(await page.locator("#collection .at-item").count(), 0);
  assert.ok(await page.locator('[data-collection-empty]').isVisible());
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier preview: frame, ambiance and card previews do not change balance or equipped appearance", async () => {
  const { page, context, errors } = await atelierPage(360);
  for (const [slot, id, previewSelector] of [["frame", "cos_frame_aegis", '[data-frame="frame-aegis"]'], ["map", "cos_map_aurora", '[data-ambiance="map-aurora"]'], ["card", "cos_card_obsidian", '[data-card="card-obsidian"]']]) {
    await page.click(`[data-slot="${slot}"][role="tab"]`);
    assert.equal(await page.locator(`[data-preview="${id}"]`).count(), 1, "each piece has an explicit preview");
    const before = await page.evaluate(() => ({ credits: window.state.user.credits, appearance: structuredClone(window.state.user.appearance), calls: window.atelierCalls.length }));
    await page.click(`[data-preview="${id}"]`);
    const dialog = page.locator("dialog[open]");
    assert.equal(await dialog.locator(previewSelector).count(), 1);
    assert.equal(await dialog.locator('[data-buy], [data-wear]').count(), 0, "preview cannot silently acquire or equip");
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-preview-${slot}-360.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => ({ credits: window.state.user.credits, appearance: structuredClone(window.state.user.appearance), calls: window.atelierCalls.length })), before);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: the next rewards are listed in order of reach, never as a purchase of TITAN+", async () => {
  const { page, context, errors } = await atelierPage(360, false, false);
  const next = page.locator("[data-upcoming]");
  assert.equal(await next.locator("li").count(), 3);
  const names = await next.locator("li strong").allInnerTexts();
  assert.deepEqual(names, ["Obsidienne", "Aurores", "Cadre Aegis"], "closest first");
  assert.match(await next.innerText(), /Tu peux le débloquer maintenant/);
  assert.equal(await next.locator("[data-buy], [data-checkout], [data-play-checkout]").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: an older server shows a catalog update notice without inventing a free price", async () => {
  const { page, context, errors } = await atelierPage(360, false, true);
  assert.match(await page.locator("#atelier").innerText(), /Mise à jour du catalogue en attente/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
  assert.equal(await page.locator("[data-goto-plus]").count(), 2);
  const neon = page.locator('article').filter({ has: page.locator('[data-wear="cos_frame_neon"]') });
  assert.match(await neon.innerText(), /Acquis définitivement/, "legacy purchase without new fields stays permanent");
  assert.deepEqual(errors, []);
  await context.close();
});

test("shell: a borrowed cached style expires by date while an earned style stays visible", async () => {
  const { page, context, errors } = await atelierPage(360, true);
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.appearance = { frame: "frame-aegis", map: "map-aurora" };
    d.items.find((i) => i.id === "cos_map_aurora").permanent = true;
    d.plus.ends_at = new Date(Date.now() - 1000).toISOString();
    window.titanApplyAtelierAppearance(d, window.state.user.id);
  });
  assert.equal(await page.evaluate(() => window.titanShell.look().frame), undefined, "stale true flag cannot keep a borrowed style");
  assert.equal(await page.evaluate(() => window.titanShell.look().map), "map-aurora", "date does not remove a permanent acquisition");
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: a delayed response cannot copy the previous user's balance or appearance", async () => {
  const { page, context, errors } = await atelierPage(360);
  assert.equal(await page.evaluate(async () => {
    let finish;
    const previous = structuredClone(window.atelierFixture);
    previous.appearance = { frame: "frame-aegis" };
    window.titanClient.rpc = () => new Promise((resolve) => { finish = resolve; });
    dispatchEvent(new Event("online"));
    window.state.user.id = "00000000-0000-4000-8000-000000000456";
    window.state.user.appearance = {};
    window.state.user.credits = 777;
    finish({ data: previous });
    await new Promise((r) => setTimeout(r, 30));
    return window.state.user.credits === 777 && !window.state.user.appearance.frame;
  }), true, "obsolete response belongs to the previous user");
  assert.deepEqual(errors, []);
  await context.close();
});

async function bootstrapPage(gate = null, fromGuest = false, emptyHistory = false) {
  const fixture = await newPage(360);
  await fixture.page.goto(BASE + "/profile", { waitUntil: "load" });
  await fixture.page.evaluate(({ gate, fromGuest, emptyHistory }) => {
    const a = "00000000-0000-4000-8000-000000000123";
    const b = "00000000-0000-4000-8000-000000000456";
    window.state.user.id = fromGuest ? "guest_bootstrap" : a;
    const f = window.bootstrapFixture = {
      a, b, actor: a, entered: false, heldOnce: false, calls: [],
      profile: { id: a, username: "Compte A", credits: 10, xp: 0, level: 1, friend_code: gate === "friend" ? null : "A-FRIEND", state_version: 1 },
    };
    const step = async (name, value) => {
      f.calls.push({ name, owner: window.state.user.id });
      if (name === gate && !f.heldOnce) {
        f.heldOnce = f.entered = true;
        await new Promise(resolve => { f.release = resolve; });
      }
      return value;
    };
    window.TITAN_DB_STATUS.issues = [];
    window.titanMaybeSubmitCacheReconciliation = undefined;
    window.titanClient = {
      auth: { getSession: () => step("session", { data: { session: { user: { id: f.actor, user_metadata: {} } } } }), onAuthStateChange() {} },
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: () => step("profile", { data: gate === "create" ? null : structuredClone(f.profile) }) }),
      rpc: (name) => {
        if (name === "titan_save_profile_state") return step("create", { data: structuredClone(f.profile) });
        if (name === "titan_assign_friend_code") return step("friend", { data: "A-FRIEND" });
        if (name === "titan_atelier") return step("appearance", { data: { owner: f.actor, appearance: {}, items: [], plus: { active: false } } });
        return Promise.resolve({ error: { code: "PGRST202" } });
      },
    };
    window.TitanTraining.paginate = (_client, owner) => {
      // RLS would return no A rows after authentication has moved to B. A request
      // begun before that switch may still complete later with A's own rows.
      const logs = !emptyHistory && owner === f.actor ? [{ id: "A-session", user_id: a, client_event_id: "A-event", sport: "running", category: "endurance", unit: "min", val: 30, date: new Date().toISOString(), details: { duration: 30 }, xp: 0 }] : [];
      return step("history", { logs, total: logs.length });
    };
    Object.assign(window.TitanQueue, {
      migrate: () => step("migrate"), refresh: () => step("refresh", []),
      saveHistory: () => step("saveHistory"), list: () => [],
    });
    // Exercise the real bootstrap while keeping unrelated page-start timers from
    // launching a third synchronization during this deliberately controlled race.
    const sync = window.syncWithSupabase;
    window.syncWithSupabase = () => Promise.resolve();
    f.run = () => sync();
    f.start = () => { f.pending = sync(); };
  }, { gate, fromGuest, emptyHistory });
  return fixture;
}

test("bootstrap: delayed responses never replace another account's profile or history", async () => {
  for (const [gate, emptyHistory] of [...["session", "profile", "create", "friend", "appearance", "history", "migrate", "refresh", "saveHistory"].map(x => [x, false]), ["appearance", true]]) {
    const { page, context, errors } = await bootstrapPage(gate, false, emptyHistory);
    await page.evaluate(() => { window.bootstrapFixture.start(); });
    await page.waitForFunction(() => window.bootstrapFixture.entered);
    const result = await page.evaluate(async () => {
      const f = window.bootstrapFixture;
      f.actor = f.b;
      Object.assign(window.state.user, { id: f.b, name: "Compte B", credits: 777, xp: 123, level: 3 });
      window.state.history = [{ id: "B-session", user_id: f.b, sport: "yoga", unit: "min", val: 20, date: new Date().toISOString(), details: { duration: 20 } }];
      window.state.archivedHistory = [{ id: "B-archive", user_id: f.b }];
      window.state.meta = { profileVersion: 77, historyTotal: 2, owner: f.b };
      window.titanCloudHistoryLoadedAt = 444;
      const expected = structuredClone(window.state);
      const callCount = f.calls.length;
      f.release();
      await f.pending;
      return { expected, actual: window.state, lateCalls: f.calls.slice(callCount), loadedAt: window.titanCloudHistoryLoadedAt, issues: window.TITAN_DB_STATUS.issues };
    });
    assert.deepEqual(result.actual, result.expected, `${gate}: B's identity, balance, history and metadata stay intact`);
    assert.deepEqual(result.lateCalls, [], `${gate}: obsolete bootstrap stops before further account operations`);
    assert.equal(result.loadedAt, 444);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("bootstrap: the normal guest-to-account synchronization still loads confirmed history", async () => {
  const { page, context, errors } = await bootstrapPage(null, true);
  const result = await page.evaluate(async () => {
    window.bootstrapFixture.start();
    await window.bootstrapFixture.pending;
    return { id: window.state.user.id, credits: window.state.user.credits, history: window.state.history, version: window.state.meta.profileVersion, issues: window.TITAN_DB_STATUS.issues };
  });
  assert.equal(result.id, "00000000-0000-4000-8000-000000000123");
  assert.equal(result.credits, 10);
  assert.equal(result.history[0]?.id, "A-session");
  assert.equal(result.history[0]?.syncStatus, "confirmed");
  assert.equal(result.version, 1);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("bootstrap: an older synchronization cannot overwrite a newer one for the same account", async () => {
  const { page, context, errors } = await bootstrapPage("profile");
  await page.evaluate(() => { window.bootstrapFixture.start(); });
  await page.waitForFunction(() => window.bootstrapFixture.entered);
  const result = await page.evaluate(async () => {
    const f = window.bootstrapFixture;
    f.profile = { ...f.profile, username: "Profil récent", credits: 55, state_version: 2 };
    await f.run();
    const expected = structuredClone(window.state);
    const callCount = f.calls.length;
    f.release();
    await f.pending;
    return { expected, actual: window.state, lateCalls: f.calls.slice(callCount), issues: window.TITAN_DB_STATUS.issues };
  });
  assert.equal(result.expected.user.credits, 55);
  assert.deepEqual(result.actual, result.expected, "the newer profile and history win");
  // The successful newer sync also starts independent Auth reads from the page.
  // The older bootstrap already read its session before its held profile request.
  assert.deepEqual(result.lateCalls.filter(call => call.name !== "session"), []);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test("app pages fit a 360 px screen without errors", async () => {
  const { page, errors } = await newPage(360);
  for (const path of ["/aujourdhui", "/training", "/journal", "/stats", "/records", "/objectifs", "/prevoir", "/adventure", "/profile", "/social", "/coaching", "/boutique", "/onboarding", "/login"]) {
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${path} overflows`);
  }
  assert.deepEqual(errors, []);
});

test("offline: the app shell opens from the service worker cache", async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const own = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 600));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
    const page = await context.newPage();
    await page.goto(origin + "/aujourdhui", { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("titan_sw_dev", "1"));
    await page.reload({ waitUntil: "load" });
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
    await page.waitForFunction(async () => (await (await caches.open("titan-os-v300-ascension")).keys()).length > 50, null, { timeout: 30000 });
    own.kill();
    await new Promise((r) => setTimeout(r, 300));
    await page.goto(origin + "/training", { waitUntil: "load" });
    assert.match(await page.title(), /Séance|séance/);
    await page.goto(origin + "/fonctionnalites", { waitUntil: "load" });
    assert.match(await page.title(), /Hors ligne/);
    await context.close();
  } finally {
    own.kill();
  }
});

// Local fixtures only: no session is written to the backend or persisted in the user's account.
async function seedSports(page, count = 200) {
  await page.waitForFunction(() => window.state?.user && window.TitanProgress && window.TitanSports);
  return page.evaluate((count) => {
    const sports = window.TitanSports.all().slice(0, count);
    window.state.user.favoriteSports = [sports.at(-1).id];
    window.state.history = sports.map((s, i) => ({
      id: `fixture-${i}`, sport: s.id, unit: "min", val: 30, xp: 0,
      date: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      details: { duration: 30 },
    }));
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
    return { count: sports.length, target: sports.at(-1), first: sports[0] };
  }, count);
}

test("records: 200 sports are paginated, searchable and retain their source session", async () => {
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/records", { waitUntil: "load" });
  const fixture = await seedSports(page);
  assert.equal(fixture.count, 200);
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".rc-sport").count(), 12, "only a bounded page of sports is rendered");
  await page.getByRole("button", { name: "Page suivante" }).click();
  assert.equal(await page.locator(".rc-sport").count(), 12);
  await page.getByRole("searchbox", { name: "Rechercher un sport" }).fill(fixture.target.label);
  await page.waitForTimeout(100);
  assert.ok(await page.locator(".rc-sport").count() <= 12);
  assert.match(await page.locator("#records").innerText(), new RegExp(fixture.target.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.locator(".rc-sport [data-record]").first().click();
  assert.equal(await page.locator('dialog[open] a[href^="/journal?session="]').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

async function profileRadioPage(width) {
  const fixture = await newPage(width), { page } = fixture;
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  for (const key of ["identity", "sport", "account", "preferences"]) {
    await page.locator(`[data-profile-group="${key}"] > summary`).click();
  }
  await page.locator('[data-cadence="3"]').waitFor();
  return fixture;
}

// Read fixtures keep the SDK RPC transport and inspect both account-bound requests.
async function profileReadsPage(t, { sessionOwner = "a", rollover = false, allowWrites = false, allowDeletion = false } = {}) {
  const f = await profileRadioPage(360), { page } = f;
  t.after(async () => { await f.context.close(); assert.deepEqual(f.errors, []); });
  const requests = [];
  await page.route(/\/rest\/v1\/rpc\/(titan_public_card_settings|titan_expedition_titles)$/, async route => {
    const kind = route.request().url().split('/').at(-1), bearer = route.request().headers().authorization;
    const request = { kind, bearer, index: requests.length };
    requests.push(request);
    const response = await new Promise(resolve => { request.resolve = resolve; });
    const label = `read-${response.label || request.index}`;
    await route.fulfill({ status: response.status || 200, contentType: "application/json", body: JSON.stringify(response.status ? { code: response.code || "XX000", message: "synthetic failure" } : kind === "titan_public_card_settings" ? { enabled: true, slug: label, show: {} } : [{ title: label, expedition: "Synthetic expedition" }]) });
  });
  await page.evaluate(({ sessionOwner, rollover, allowWrites, allowDeletion }) => {
    window.profileReadSettled = 0; window.profileReadSessionCalls = 0;
    window.readOwnerId = letter => letter === "a" ? "00000000-0000-4000-8000-000000000111" : "00000000-0000-4000-8000-000000000222";
    window.profileReadSessionOwner = sessionOwner;
    const client = window.titanClient, rpc = client.rpc.bind(client);
    client.auth.getSession = async () => {
      window.profileReadSessionCalls++;
      // The SDK switches after the protected reads return. An independent panel can check
      // the session before those requests finish without changing the test's account.
      const letter = rollover && window.profileReadSettled > 0 ? "b" : window.profileReadSessionOwner;
      return { data: { session: { user: { id: window.readOwnerId(letter) }, access_token: `read-${letter}-token` } }, error: null };
    };
    client.rpc = (name, ...args) => {
      if (!["titan_public_card_settings", "titan_expedition_titles"].includes(name) && !(allowWrites && name === "titan_public_card_save") && !(allowDeletion && name === "delete_own_account")) return Promise.resolve({ data: null, error: { code: "PGRST202" } });
      const builder = rpc(name, ...args), then = builder.then.bind(builder);
      builder.then = (resolve, reject) => then(value => { if (name === "delete_own_account") window.deleteRpcSettled++; else if (name === "titan_public_card_save") window.profileWriteSettled++; else window.profileReadSettled++; return resolve(value); }, reject);
      return builder;
    };
    window.qrcode = () => ({ addData() {}, make() {}, createSvgTag: () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });
    window.state.user.id = window.readOwnerId("a");
    const snapshot = { ...window.TitanAdventure.snapshot, owner: window.state.user.id };
    window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { sessionOwner, rollover, allowWrites, allowDeletion });
  f.requests = requests;
  f.waitRequests = async n => { const end = Date.now() + 2500; while (requests.length < n && Date.now() < end) await new Promise(r => setTimeout(r, 20)); assert.equal(requests.length, n, "each account starts its own pair of reads"); };
  f.respond = async (indices, response = {}) => {
    for (const i of indices) requests[i].resolve(response);
    await page.waitForFunction(n => window.profileReadSettled >= n, indices.length + (f.settled || 0));
    f.settled = (f.settled || 0) + indices.length;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  f.change = async (kind = "owner", letter = "b") => {
    await page.evaluate(async ({ kind, letter }) => {
      if (kind !== "client") { window.titanInvalidateAccountSession(window.state.user.id); window.titanAccountTransition.active = false; }
      if (kind === "owner" || kind === "guest") window.state.user.id = kind === "guest" ? "guest_reads" : window.readOwnerId(letter);
      if (kind === "client") window.titanClient = Object.create(window.titanClient);
      window.profileReadSessionOwner = letter;
      if (window.TitanAdventure.snapshot) window.TitanAdventure.snapshot.owner = window.state.user.id;
      dispatchEvent(new CustomEvent("titan:history-updated"));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { kind, letter });
  };
  return f;
}

// The real local purge runs only against synthetic storage. Reload serves an inert
// same-origin page so app startup cannot recreate keys and hide a mistaken purge.
async function cacheConfirmationPage(t, { guest = false } = {}) {
  const f = await profileReadsPage(t), { page } = f;
  await f.waitRequests(2); await f.respond([0, 1]);
  if (guest) await f.change("guest");
  f.reloads = 0;
  await page.route(BASE + "/profile", route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    f.reloads++;
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Cache reload fixture</title><p>Reloaded</p>" });
  });
  await page.evaluate(() => {
    localStorage.setItem("cache_fixture_preference", "keep-until-confirmed");
    localStorage.setItem("sb-cache-fixture-auth-token", "synthetic-auth");
    for (const key of ["titan_training_draft_fixture", "titan_seance_draft_fixture", "titan_pending_training_logs_v1", "titan_guest_device_id_v1", "titan_guest_imported_v1"]) localStorage.setItem(key, "synthetic-preserved");
    sessionStorage.setItem("cache_fixture_session", "keep-until-confirmed");
    window.cacheFixtureClear = window.titanSafeClearCache;
  });
  f.open = () => page.locator("[data-clear-cache]").click();
  f.confirm = () => page.locator("dialog[open] [data-ok]").click();
  f.snapshot = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  f.assertUntouched = async () => {
    assert.equal(f.reloads, 0, "obsolete or failed confirmation must not reload");
    const s = await f.snapshot();
    assert.equal(s.local.cache_fixture_preference, "keep-until-confirmed");
    assert.equal(s.local["sb-cache-fixture-auth-token"], "synthetic-auth");
    assert.equal(s.session.cache_fixture_session, "keep-until-confirmed");
  };
  return f;
}

for (const guest of [false, true]) test(`cache confirmation: ${guest ? "discovery" : "member"} clears only after confirmation and preserves pending drafts`, async t => {
  const f = await cacheConfirmationPage(t, { guest }); await f.open(); await f.assertUntouched(); await f.confirm();
  assert.equal(f.reloads, 1);
  const s = await f.snapshot();
  assert.equal(s.local.cache_fixture_preference, undefined);
  assert.equal(s.local["sb-cache-fixture-auth-token"], undefined);
  assert.equal(s.session.cache_fixture_session, undefined);
  for (const key of ["titan_training_draft_fixture", "titan_seance_draft_fixture", "titan_pending_training_logs_v1", "titan_guest_device_id_v1", "titan_guest_imported_v1"]) assert.equal(s.local[key], "synthetic-preserved");
});

for (const kind of ["owner", "silent-owner", "client", "epoch", "roundtrip", "active", "guest"]) test(`cache confirmation: stale ${kind} cannot erase another context`, async t => {
  const f = await cacheConfirmationPage(t); await f.open();
  if (kind === "active") await f.page.evaluate(() => { window.titanAccountTransition.active = true; });
  else if (kind === "silent-owner") await f.page.evaluate(() => { window.state.user.id = window.readOwnerId("b"); });
  else if (kind === "roundtrip") {
    // Observed A -> B -> A with the same client and epoch still invalidates the
    // original confirmation through the Profile context identity.
    for (const letter of ["b", "a"]) await f.page.evaluate(async letter => {
      window.state.user.id = window.readOwnerId(letter);
      dispatchEvent(new CustomEvent("titan:history-updated"));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, letter);
  }
  else await f.change(kind);
  await f.confirm(); await f.assertUntouched();
  assert.equal(await f.page.locator("dialog[open]").count(), 1);
  assert.match(await f.page.locator("dialog[open] [data-error]").innerText(), /compte.*chang|contexte.*chang/i);
});

test("cache confirmation: repeated openings share a window and cancellation permits a fresh confirmation", async t => {
  const f = await cacheConfirmationPage(t);
  await f.page.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector("[data-clear-cache]").click(); });
  assert.equal(await f.page.locator("dialog[open]").count(), 1);
  await f.page.locator("dialog[open] [data-cancel]").click(); await f.assertUntouched();
  await f.open(); assert.equal(await f.page.locator("dialog[open]").count(), 1); await f.confirm(); assert.equal(f.reloads, 1);
});

test("cache confirmation: a failed purge stays open for an explicit retry", async t => {
  const f = await cacheConfirmationPage(t); await f.open();
  await f.page.evaluate(() => { window.titanSafeClearCache = () => { throw new Error("synthetic private storage detail"); }; });
  await f.confirm(); await f.assertUntouched();
  const text = await f.page.locator("dialog[open] [data-error]").innerText();
  assert.match(text, /cache|nettoyage/i); assert.doesNotMatch(text, /synthetic private/);
  assert.equal(await f.page.locator("dialog[open] [data-ok]").isEnabled(), true);
  await f.page.evaluate(() => { window.titanSafeClearCache = window.cacheFixtureClear; });
  await f.confirm(); assert.equal(f.reloads, 1);
});

test("cache confirmation: closing an old dialog cannot release the new account reservation", async t => {
  const f = await cacheConfirmationPage(t); await f.open(); await f.change();
  await f.page.evaluate(() => document.querySelector("[data-clear-cache]").click());
  assert.equal(await f.page.locator("dialog[open]").count(), 2);
  // Native close is an allowed account-guard path, even for a lower modal.
  await f.page.locator("dialog[open]").first().evaluate(d => d.close());
  await f.page.evaluate(() => document.querySelector("[data-clear-cache]").click());
  assert.equal(await f.page.locator("dialog[open]").count(), 1);
  await f.assertUntouched(); await f.confirm(); assert.equal(f.reloads, 1);
});

test("cache confirmation: an active account transition cannot open a new dialog", async t => {
  const f = await cacheConfirmationPage(t);
  await f.page.evaluate(() => { window.titanAccountTransition.active = true; document.querySelector("[data-clear-cache]").click(); });
  assert.equal(await f.page.locator("dialog[open]").count(), 0); await f.assertUntouched();
});

test("cache confirmation: an unavailable purge helper never reports success by reloading", async t => {
  const f = await cacheConfirmationPage(t); await f.open();
  await f.page.evaluate(() => { window.titanSafeClearCache = undefined; });
  await f.confirm(); await f.assertUntouched();
  assert.match(await f.page.locator("dialog[open] [data-error]").innerText(), /cache|nettoyage/i);
});

async function deleteAccountPage(t, { holdSession = false, holdQueue = false, rollover = false } = {}) {
  const f = await profileReadsPage(t, { allowDeletion: true }), { page } = f;
  await f.waitRequests(2); await f.respond([0, 1], { label: "account-a" });
  f.deletions = []; f.effects = [];
  await page.exposeFunction("recordDeletionEffect", effect => { f.effects.push(effect); });
  await page.route("**/rest/v1/rpc/delete_own_account", async route => {
    const bearer = route.request().headers().authorization, call = { bearer, index: f.deletions.length };
    f.deletions.push(call);
    const response = await new Promise(resolve => { call.resolve = resolve; });
    const letter = bearer === "Bearer delete-b-token" ? "b" : "a";
    const userId = letter === "a" ? "00000000-0000-4000-8000-000000000111" : "00000000-0000-4000-8000-000000000222";
    await route.fulfill({ status: response.status || 200, contentType: "application/json", body: JSON.stringify(response.status ? { code: "XX000", message: "synthetic failure" } : { userId: response.foreign ? "foreign" : userId, deleted: { auth_users: 1 } }) });
  });
  await page.evaluate(({ holdSession, holdQueue, rollover }) => {
    window.deleteRpcSettled = 0; window.deleteAuthCalls = 0; window.deleteFixtureArmed = false; window.deleteSessionOwner = "a"; window.deleteQueueFailures = 0;
    localStorage.setItem("sb-deletion-fixture-auth-token", "synthetic-a");
    document.addEventListener("submit", e => {
      if (!window.deleteFixtureArmed && e.target.closest('dialog[aria-label="Supprimer mon compte ?"]')) {
        window.deleteFixtureArmed = true; window.deleteAuthCalls = 0;
      }
    }, true);
    window.titanClient.auth.getSession = async () => {
      const call = window.deleteFixtureArmed ? ++window.deleteAuthCalls : 0;
      const letter = rollover && call > 1 ? "b" : window.deleteSessionOwner;
      const session = { user: { id: window.readOwnerId(letter) }, access_token: `delete-${letter}-token` };
      if (holdSession && call === 1) await new Promise(resolve => { window.releaseDeleteSession = resolve; });
      return { data: { session }, error: null };
    };
    window.titanClient.auth.signOut = async () => { await window.recordDeletionEffect({ kind: "signOut" }); return { error: null }; };
    window.TitanQueue.deleteOwner = async owner => {
      await window.recordDeletionEffect({ kind: "queue", owner });
      if (holdQueue) await new Promise(resolve => { window.releaseDeleteQueue = resolve; });
      if (window.deleteQueueFailures > 0) { window.deleteQueueFailures--; throw new Error("synthetic storage failure"); }
    };
    const clear = window.titanSafeClearCache;
    window.titanSafeClearCache = () => { window.recordDeletionEffect({ kind: "cache" }); clear(); };
  }, { holdSession, holdQueue, rollover });
  f.open = async () => { await page.locator('[data-delete]').click(); await page.locator('dialog[open] [name="confirm"]').fill("SUPPRIMER"); };
  f.submit = async () => page.locator('dialog[open] [type="submit"]').click();
  f.waitDeletions = async n => { const end = Date.now() + 3000; while (f.deletions.length < n && Date.now() < end) await new Promise(r => setTimeout(r, 20)); assert.equal(f.deletions.length, n); };
  f.reply = async (index = 0, response = {}) => { f.deletions[index].resolve(response); };
  f.settle = async () => {
    try { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
    catch (error) { if (!/Execution context was destroyed/.test(error.message)) throw error; await page.waitForLoadState("domcontentloaded"); }
  };
  f.switchAccount = async (kind = "owner", letter = "b") => {
    await page.evaluate(letter => { window.deleteSessionOwner = letter; }, letter);
    const count = f.requests.length;
    await f.change(kind, letter); await f.waitRequests(count + 2); await f.respond([count, count + 1], { label: `account-${letter}` });
  };
  return f;
}

test("account deletion context: confirmed deletion cleans only A without a dynamic SDK signout", async t => {
  const f = await deleteAccountPage(t); await f.open(); await f.submit(); await f.waitDeletions(1);
  assert.equal(f.deletions[0].bearer, "Bearer delete-a-token"); await f.reply();
  await f.page.waitForURL(BASE + "/");
  assert.deepEqual(f.effects.map(e => e.kind), ["queue", "cache"]);
  assert.match(f.effects[0].owner, /111$/);
  assert.equal(await f.page.evaluate(() => localStorage.getItem("sb-deletion-fixture-auth-token")), null);
});

test("account deletion: an active TITAN+ subscription is mentioned before deleting, and only then", async t => {
  const f = await deleteAccountPage(t);
  await f.page.locator('[data-delete]').click();
  assert.equal(await f.page.locator("dialog[open] [data-delete-plus]").count(), 0, "no warning without a subscription");
  await f.page.locator("dialog[open] [data-cancel]").click();
  await f.page.evaluate(() => { window.state.user.is_elite = true; });
  await f.page.locator('[data-delete]').click();
  assert.match(await f.page.locator("dialog[open] [data-delete-plus]").innerText(), /pas résilié automatiquement/);
  assert.equal(f.deletions.length, 0, "opening the dialog sends nothing");
});

test("account deletion context: validation prevents any request", async t => {
  const f = await deleteAccountPage(t); await f.page.locator('[data-delete]').click(); await f.submit();
  assert.equal(f.deletions.length, 0); assert.deepEqual(f.effects, []);
  assert.match(await f.page.locator('dialog[open] [role="alert"]').innerText(), /Écris SUPPRIMER/);
});

test("account deletion context: repeated openings share one confirmation", async t => {
  const f = await deleteAccountPage(t);
  await f.page.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('[data-delete]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  assert.equal(await f.page.locator('dialog[open]').count(), 1);
  assert.equal(f.deletions.length, 0);
});

test("account deletion context: repeated submits reserve one request and block all sheet closures", async t => {
  const f = await deleteAccountPage(t); await f.open(); await f.submit(); await f.waitDeletions(1);
  await f.page.evaluate(() => { const form = document.querySelector('dialog[open] form'); for (let i = 0; i < 3; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await f.settle(); assert.equal(f.deletions.length, 1);
  assert.equal(await f.page.locator('dialog[open] [name="confirm"]').isDisabled(), true);
  assert.equal(await f.page.locator('dialog[open] [data-cancel]').isDisabled(), true);
  assert.equal(await f.page.locator('dialog[open] [data-close]').isDisabled(), true);
  assert.equal(await f.page.locator('dialog[open] [data-delete-progress][role="status"]').count(), 1);
  await f.page.keyboard.press("Escape");
  await f.page.evaluate(() => { const d = document.querySelector('dialog[open]'); d.querySelector('[data-close]').dispatchEvent(new MouseEvent("click", { bubbles: true })); d.querySelector('[data-cancel]').dispatchEvent(new MouseEvent("click", { bubbles: true })); d.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  assert.equal(await f.page.locator('dialog[open]').count(), 1);
  await f.reply(0, { status: 503 }); await f.page.locator('dialog[open] [type="submit"]:enabled').waitFor();
});

test("account deletion context: confirmation opened by A cannot submit for B", async t => {
  const f = await deleteAccountPage(t); await f.open(); await f.switchAccount(); await f.submit(); await f.settle();
  assert.equal(f.deletions.length, 0); assert.deepEqual(f.effects, []);
});

for (const change of ["owner", "roundtrip", "epoch", "client"]) {
  test(`account deletion context: late reply after ${change} cannot clean or navigate the new context`, async t => {
    const f = await deleteAccountPage(t); await f.open(); await f.submit(); await f.waitDeletions(1);
    if (change === "roundtrip") { await f.switchAccount(); await f.switchAccount("owner", "a"); }
    else await f.switchAccount(change, change === "owner" ? "b" : "a");
    await f.reply(); await f.settle();
    assert.deepEqual(f.effects, []); assert.equal(new URL(f.page.url()).pathname, "/profile");
    assert.equal(await f.page.locator('dialog[open] [data-close]').isEnabled(), true);
  });
}

test("account deletion context: session resolving after the account change starts no RPC", async t => {
  const f = await deleteAccountPage(t, { holdSession: true }); await f.open(); await f.submit(); await f.page.waitForFunction(() => window.releaseDeleteSession);
  await f.switchAccount(); await f.page.evaluate(() => window.releaseDeleteSession()); await f.settle();
  assert.equal(f.deletions.length, 0); assert.deepEqual(f.effects, []);
});

test("account deletion context: foreign initial session sends no RPC", async t => {
  const f = await deleteAccountPage(t); await f.open(); await f.page.evaluate(() => { window.deleteSessionOwner = "b"; }); await f.submit(); await f.settle();
  assert.equal(f.deletions.length, 0); assert.deepEqual(f.effects, []);
});

test("account deletion context: silent SDK rollover cannot trigger local cleanup", async t => {
  const f = await deleteAccountPage(t, { rollover: true }); await f.open(); await f.submit(); await f.waitDeletions(1);
  assert.equal(f.deletions[0].bearer, "Bearer delete-a-token"); await f.reply(); await f.settle();
  assert.deepEqual(f.effects, []); assert.equal(new URL(f.page.url()).pathname, "/profile");
});

test("account deletion context: a foreign response cannot authorize local cleanup", async t => {
  const f = await deleteAccountPage(t); await f.open(); await f.submit(); await f.waitDeletions(1); await f.reply(0, { foreign: true }); await f.settle();
  assert.deepEqual(f.effects, []); assert.equal(new URL(f.page.url()).pathname, "/profile");
});

test("account deletion context: current RPC failure preserves the form and allows an explicit retry", async t => {
  const f = await deleteAccountPage(t); await f.open(); await f.submit(); await f.waitDeletions(1); await f.reply(0, { status: 503 });
  await f.page.locator('dialog[open] [type="submit"]:enabled').waitFor();
  assert.equal(await f.page.locator('dialog[open] [name="confirm"]').inputValue(), "SUPPRIMER"); assert.deepEqual(f.effects, []);
  await f.submit(); await f.waitDeletions(2); await f.reply(1); await f.page.waitForURL(BASE + "/");
  assert.deepEqual(f.effects.map(e => e.kind), ["queue", "cache"]);
});

test("account deletion context: account change during A queue cleanup cannot clear B cache or redirect", async t => {
  const f = await deleteAccountPage(t, { holdQueue: true }); await f.open(); await f.submit(); await f.waitDeletions(1); await f.reply();
  await f.page.waitForFunction(() => window.releaseDeleteQueue); await f.switchAccount();
  await f.page.evaluate(() => window.releaseDeleteQueue()); await f.settle();
  assert.deepEqual(f.effects.map(e => e.kind), ["queue"]); assert.match(f.effects[0].owner, /111$/); assert.equal(new URL(f.page.url()).pathname, "/profile");
});

test("account deletion context: cleanup retry never resends a confirmed account deletion", async t => {
  const f = await deleteAccountPage(t); await f.page.evaluate(() => { window.deleteQueueFailures = 1; }); await f.open(); await f.submit(); await f.waitDeletions(1); await f.reply(); await f.settle();
  assert.equal(f.effects.some(e => e.kind === "cache"), false);
  await f.page.locator('dialog[open] [type="submit"]:enabled').waitFor();
  assert.equal(await f.page.locator('dialog[open] [type="submit"]').innerText(), "Réessayer le nettoyage");
  assert.equal(f.deletions.length, 1); assert.deepEqual(f.effects.map(e => e.kind), ["queue"]);
  await f.submit(); await f.page.waitForURL(BASE + "/");
  assert.equal(f.deletions.length, 1); assert.deepEqual(f.effects.map(e => e.kind), ["queue", "queue", "cache"]);
});

test("account deletion context: silent session change during queue cleanup cannot clear another session", async t => {
  const f = await deleteAccountPage(t, { holdQueue: true }); await f.open(); await f.submit(); await f.waitDeletions(1); await f.reply();
  await f.page.waitForFunction(() => window.releaseDeleteQueue);
  await f.page.evaluate(() => { window.deleteSessionOwner = "b"; window.releaseDeleteQueue(); }); await f.settle();
  assert.deepEqual(f.effects.map(e => e.kind), ["queue"]);
  assert.equal(new URL(f.page.url()).pathname, "/profile");
});

async function publicCardActionsPage(t, { holdSession = false, rollover = false } = {}) {
  const f = await profileReadsPage(t, { allowWrites: true }), { page } = f;
  await f.waitRequests(2); await f.respond([0, 1], { label: "account-a" });
  f.writes = [];
  await page.route("**/rest/v1/rpc/titan_public_card_save", async route => {
    const bearer = route.request().headers().authorization;
    const params = route.request().postDataJSON(), index = f.writes.length;
    const call = { bearer, params, index }; f.writes.push(call);
    const reply = await new Promise(resolve => { call.resolve = resolve; });
    const letter = bearer === "Bearer read-b-token" ? "b" : "a";
    const data = { enabled: params.p_enabled ?? true, show: params.p_show || {}, slug: `card-${letter}-${index}` };
    await route.fulfill({ status: reply.status || 200, contentType: "application/json", body: JSON.stringify(reply.status ? { code: reply.code || "XX000", message: "synthetic unavailable" } : data) });
  });
  await page.evaluate(({ holdSession, rollover }) => {
    window.profileWriteSettled = 0; window.cardWriteAuthCalls = 0;
    window.cardWriteSessionOwner = "a";
    window.titanClient.auth.getSession = async () => {
      const call = ++window.cardWriteAuthCalls;
      const letter = rollover && call > 1 ? "b" : window.cardWriteSessionOwner;
      const session = { user: { id: window.readOwnerId(letter) }, access_token: `read-${letter}-token` };
      if (holdSession && call === 1) await new Promise(resolve => { window.releaseCardWriteSession = resolve; });
      return { data: { session }, error: null };
    };
    const reset = window.TitanCard.resetLink;
    window.cardLinkResets = 0;
    window.TitanCard.resetLink = (...args) => { window.cardLinkResets++; return reset?.(...args); };
  }, { holdSession, rollover });
  f.waitWrites = async n => { const end = Date.now() + 3000; while (f.writes.length < n && Date.now() < end) await new Promise(r => setTimeout(r, 20)); assert.equal(f.writes.length, n); };
  f.finish = async (index = 0, reply = {}) => {
    f.writes[index].resolve(reply);
    f.writeFinished = (f.writeFinished || 0) + 1;
    await page.waitForFunction(n => window.profileWriteSettled >= n, f.writeFinished);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  f.switchAccount = async (kind = "owner", letter = "b") => {
    await page.evaluate(letter => { window.cardWriteSessionOwner = letter; }, letter);
    const count = f.requests.length;
    await f.change(kind, letter); await f.waitRequests(count + 2);
    await f.respond([count, count + 1], { label: `account-${letter}` });
  };
  f.settle = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return f;
}

for (const field of ["enabled", "name"]) {
  test(`public card actions: ${field} changes reach the server and use its canonical response`, async t => {
    const f = await publicCardActionsPage(t);
    await f.page.locator(field === "enabled" ? '[data-card-enabled]' : '[data-card-show="name"]').click(); await f.waitWrites(1);
    assert.equal(f.writes[0].bearer, "Bearer read-a-token");
    assert.deepEqual(f.writes[0].params, { p_enabled: field === "enabled" ? false : null, p_show: field === "name" ? { name: false } : {}, p_new_link: false });
    await f.finish();
    assert.equal(await f.page.locator(field === "enabled" ? '[data-card-enabled]' : '[data-card-show="name"]').isChecked(), false);
    assert.equal(await f.page.evaluate(() => window.cardLinkResets), 1);
  });
}

test("public card actions: all changes share one reservation and announce progress through a rerender", async t => {
  const f = await publicCardActionsPage(t); await f.page.locator('[data-card-show="name"]').click(); await f.waitWrites(1);
  await f.page.evaluate(() => {
    for (const key of ["level", "sports", "titles"]) { const input = document.querySelector(`[data-card-show="${key}"]`); input.checked = false; input.dispatchEvent(new Event("change", { bubbles: true })); }
    document.querySelector('[data-card-relink]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    dispatchEvent(new CustomEvent("titan:history-updated"));
  });
  await f.settle();
  assert.equal(f.writes.length, 1);
  assert.equal(await f.page.locator('dialog[open]').count(), 0);
  assert.equal(await f.page.locator('#public input[type="checkbox"]:enabled, #public [data-card-relink]:enabled').count(), 0);
  assert.equal(await f.page.locator('#public [data-card-progress][role="status"]').count(), 1);
  assert.equal(await f.page.locator('#public .pf-public').getAttribute("aria-busy"), "true");
  assert.equal(await f.page.locator('#public .pf-public [data-card-progress]').count(), 0, "progress remains outside the busy region");
  await f.finish();
  assert.equal(await f.page.locator('#public [data-card-progress]').count(), 0);
  assert.equal(await f.page.locator('[data-card-show="level"]').isChecked(), true);
});

test("public card actions: keyboard focus returns to its setting after confirmation", async t => {
  const f = await publicCardActionsPage(t);
  await f.page.locator('[data-card-show="name"]').focus(); await f.page.keyboard.press("Space"); await f.waitWrites(1); await f.finish();
  // Later queued profile renders must preserve the same control as well.
  await f.page.evaluate(() => dispatchEvent(new CustomEvent("titan:history-updated"))); await f.settle();
  assert.equal(await f.page.evaluate(() => document.activeElement?.dataset.cardShow), "name");
});

test("public card actions: a delayed response preserves focus moved to the sport search", async t => {
  const f = await publicCardActionsPage(t); await f.page.locator('[data-card-show="name"]').click(); await f.waitWrites(1);
  await f.page.locator('#mastery-query').focus(); await f.finish();
  assert.equal(await f.page.evaluate(() => document.activeElement.id), "mastery-query");
});

test("public card actions: a current failure restores the last confirmed setting and permits retry", async t => {
  const f = await publicCardActionsPage(t); await f.page.locator('[data-card-show="name"]').click(); await f.waitWrites(1); await f.finish(0, { status: 503 });
  assert.equal(await f.page.locator('[data-card-show="name"]').isChecked(), true);
  assert.equal(await f.page.locator('[data-card-show="name"]').isEnabled(), true);
  assert.equal(await f.page.getByText("Modification non confirmée. Vérifie ta connexion, puis réessaie.", { exact: true }).count(), 1);
  await f.page.locator('[data-card-show="name"]').click(); await f.waitWrites(2); await f.finish(1);
  assert.equal(await f.page.locator('[data-card-show="name"]').isChecked(), false);
});

for (const change of ["owner", "roundtrip", "epoch", "client"]) {
  test(`public card actions: discards an old response and notice after ${change}`, async t => {
    const f = await publicCardActionsPage(t); await f.page.locator('[data-card-enabled]').click(); await f.waitWrites(1);
    if (change === "roundtrip") { await f.switchAccount(); await f.switchAccount("owner", "a"); }
    else await f.switchAccount(change, change === "owner" ? "b" : "a");
    await f.finish();
    assert.equal(await f.page.locator('[data-card-enabled]').isChecked(), true);
    assert.doesNotMatch(await f.page.locator('#public input[readonly]').inputValue(), /card-a-0/);
    assert.equal(await f.page.getByText("Profil public désactivé", { exact: true }).count(), 0);
    assert.equal(await f.page.evaluate(() => window.cardLinkResets), 0);
  });
}

test("public card actions: obsolete errors cannot release the new account reservation", async t => {
  const f = await publicCardActionsPage(t); await f.page.locator('[data-card-show="name"]').click(); await f.waitWrites(1);
  await f.switchAccount(); await f.page.locator('[data-card-show="level"]').click(); await f.waitWrites(2);
  await f.finish(0, { status: 503 });
  assert.equal(await f.page.locator('[data-card-show="level"]').isDisabled(), true);
  assert.equal(await f.page.getByText("Modification non confirmée. Vérifie ta connexion, puis réessaie.", { exact: true }).count(), 0);
  await f.finish(1);
  assert.equal(await f.page.locator('[data-card-show="level"]').isChecked(), false);
  assert.equal(f.writes[1].bearer, "Bearer read-b-token");
});

test("public card actions: stale preflight session starts no mutation", async t => {
  const f = await publicCardActionsPage(t, { holdSession: true }); await f.page.locator('[data-card-show="name"]').click();
  await f.page.waitForFunction(() => window.releaseCardWriteSession); await f.switchAccount();
  await f.page.evaluate(() => window.releaseCardWriteSession()); await f.settle();
  assert.equal(f.writes.length, 0);
  assert.equal(await f.page.locator('[data-card-show="name"]').isChecked(), true);
});

test("public card actions: foreign initial session sends no mutation", async t => {
  const f = await publicCardActionsPage(t);
  await f.page.evaluate(() => { window.cardWriteSessionOwner = "b"; });
  await f.page.locator('[data-card-show="name"]').click(); await f.settle();
  assert.equal(f.writes.length, 0);
  assert.equal(await f.page.locator('[data-card-show="name"]').isChecked(), true);
});

test("public card actions: bearer stays A during SDK rollover and the result is not applied", async t => {
  const f = await publicCardActionsPage(t, { rollover: true }); await f.page.locator('[data-card-show="name"]').click(); await f.waitWrites(1);
  assert.equal(f.writes[0].bearer, "Bearer read-a-token"); await f.finish();
  assert.equal(await f.page.locator('[data-card-show="name"]').isChecked(), true);
  assert.equal(await f.page.evaluate(() => window.cardLinkResets), 0);
});

test("public card actions: repeated link clicks open one confirmation and submit once", async t => {
  const f = await publicCardActionsPage(t);
  await f.page.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('[data-card-relink]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  assert.equal(await f.page.locator('dialog[open]').count(), 1);
  await f.page.locator('dialog[open] [data-ok]').click(); await f.waitWrites(1);
  await f.page.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('dialog[open] [data-ok]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].params.p_new_link, true);
  await f.finish(); await f.page.locator('dialog[open]').waitFor({ state: "detached" });
  assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/card-a-0");
});

test("public card actions: confirmation opened for A cannot renew B link", async t => {
  const f = await publicCardActionsPage(t); await f.page.locator('[data-card-relink]').click(); await f.switchAccount();
  await f.page.locator('dialog[open] [data-ok]').click(); await f.settle();
  assert.equal(f.writes.length, 0);
  assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/read-account-b");
});

test("public card actions: a failed link renewal keeps its dialog and allows explicit retry", async t => {
  const f = await publicCardActionsPage(t); await f.page.locator('[data-card-relink]').click(); await f.page.locator('dialog[open] [data-ok]').click(); await f.waitWrites(1);
  await f.finish(0, { status: 503 });
  assert.equal(await f.page.locator('dialog[open] [data-ok]').isEnabled(), true);
  assert.match(await f.page.locator('dialog[open] [role="alert"]').innerText(), /n’a pas pu être confirmé/);
  await f.page.locator('dialog[open] [data-ok]').click(); await f.waitWrites(2); await f.finish(1);
  await f.page.locator('dialog[open]').waitFor({ state: "detached" });
  assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/card-a-1");
});

test("profile reads: both RPCs use the account bearer and show their results", async t => {
  const f = await profileReadsPage(t); await f.waitRequests(2);
  assert.deepEqual(f.requests.map(r => r.bearer), ["Bearer read-a-token", "Bearer read-a-token"]);
  await f.respond([0, 1], { label: "account-a" });
  assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/read-account-a");
  assert.match(await f.page.locator('#collection').innerText(), /read-account-a/);
});

test("profile reads: next account loads while the old pair is pending and ignores its late success", async t => {
  const f = await profileReadsPage(t); await f.waitRequests(2); await f.change(); await f.waitRequests(4);
  assert.deepEqual(f.requests.slice(2).map(r => r.bearer), ["Bearer read-b-token", "Bearer read-b-token"]);
  await f.respond([2, 3], { label: "account-b" }); await f.respond([0, 1], { label: "old-a" });
  assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/read-account-b");
  assert.match(await f.page.locator('#collection').innerText(), /read-account-b/);
  assert.doesNotMatch(await f.page.locator('#collection').innerText(), /read-old-a/);
});

test("profile reads: cached card and titles disappear immediately for the next account", async t => {
  const f = await profileReadsPage(t); await f.waitRequests(2); await f.respond([0, 1], { label: "old-a" });
  await f.change();
  assert.equal(await f.page.locator('#public input[readonly]').count(), 0);
  assert.doesNotMatch(await f.page.locator('#collection').innerText(), /read-old-a/);
  await f.waitRequests(4); await f.respond([2, 3], { label: "account-b" });
});

test("profile reads: discovery never inherits a cached account title or card", async t => {
  const f = await profileReadsPage(t); await f.waitRequests(2); await f.respond([0, 1], { label: "old-a" });
  await f.change("guest");
  assert.equal(await f.page.locator('#public').count(), 0);
  assert.doesNotMatch(await f.page.locator('#collection').innerText(), /read-old-a/);
  assert.equal(f.requests.length, 2);
});

for (const kind of ["epoch", "client"]) {
  test(`profile reads: a ${kind} change of the same owner invalidates old replies`, async t => {
    const f = await profileReadsPage(t); await f.waitRequests(2); await f.change(kind, "a"); await f.waitRequests(4);
    await f.respond([2, 3], { label: "new-context" }); await f.respond([0, 1], { label: "obsolete" });
    assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/read-new-context");
    assert.doesNotMatch(await f.page.locator('#collection').innerText(), /read-obsolete/);
  });
}

test("profile reads: an old missing-RPC error cannot mark the new account unavailable after A B A", async t => {
  const f = await profileReadsPage(t); await f.waitRequests(2); await f.change(); await f.waitRequests(4);
  await f.change("owner", "a"); await f.waitRequests(6);
  await f.respond([0, 1], { status: 404, code: "PGRST202" });
  await f.respond([2, 3], { label: "old-b" }); await f.respond([4, 5], { label: "fresh-a" });
  assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/read-fresh-a");
  assert.doesNotMatch(await f.page.locator('#public').innerText(), /prochaine mise à jour/);
});

test("profile reads: a foreign initial session sends neither RPC", async t => {
  const f = await profileReadsPage(t, { sessionOwner: "b" });
  await f.page.waitForFunction(() => window.profileReadSessionCalls > 0);
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(f.requests.length, 0);
  assert.equal(await f.page.locator('#public input[readonly]').count(), 0);
});

test("profile reads: silent SDK rollover cannot display the response under another session", async t => {
  const f = await profileReadsPage(t, { rollover: true }); await f.waitRequests(2);
  assert.deepEqual(f.requests.map(r => r.bearer), ["Bearer read-a-token", "Bearer read-a-token"]);
  await f.respond([0, 1], { label: "old-a" });
  assert.equal(await f.page.locator('#public input[readonly]').count(), 0);
  assert.doesNotMatch(await f.page.locator('#collection').innerText(), /read-old-a/);
});

test("profile reads: a current server failure keeps successful titles and retries on the next refresh", async t => {
  const f = await profileReadsPage(t); await f.waitRequests(2);
  const card = f.requests.findIndex(r => r.kind === "titan_public_card_settings"), title = 1 - card;
  await f.respond([card], { status: 503 }); await f.respond([title], { label: "title-ok" });
  assert.match(await f.page.locator('#collection').innerText(), /read-title-ok/);
  assert.match(await f.page.locator('#public').innerText(), /indisponible/);
  await f.page.evaluate(() => dispatchEvent(new CustomEvent("titan:history-updated"))); await f.waitRequests(4);
  await f.respond([2, 3], { label: "retry-ok" });
  assert.equal(await f.page.locator('#public input[readonly]').inputValue(), "https://titan-app.fr/u/read-retry-ok");
});

// Synthetic accounts only. Keep the real RPC builder and intercept its HTTP transport.
async function profileExportPage(t, { hold = true, holdSession = false, rollover = false, mode = "ok", guest = false } = {}) {
  const f = await profileRadioPage(360), { page } = f;
  t.after(async () => { await f.context.close(); assert.deepEqual(f.errors, []); });
  const releases = [];
  await page.route("**/rest/v1/rpc/export_own_data", async route => {
    const bearer = route.request().headers().authorization;
    await page.evaluate(bearer => window.exportHeaders.push(bearer), bearer);
    if (hold) await new Promise(resolve => releases.push(resolve));
    const owner = bearer === "Bearer fixture-b-token" ? "00000000-0000-4000-8000-000000000222" : "00000000-0000-4000-8000-000000000111";
    await route.fulfill({ status: mode === "error" ? 503 : 200, contentType: "application/json", body: JSON.stringify(mode === "error" ? { message: "synthetic unavailable" } : { userId: mode === "foreign" ? "other-owner" : owner, sessions: [] }) });
  });
  await page.evaluate(({ holdSession, rollover, guest }) => {
    window.exportFiles = []; window.exportHeaders = []; window.exportSettled = 0; window.exportSessionCalls = 0; window.exportFixtureReady = false;
    const blobs = new Map(), create = URL.createObjectURL.bind(URL), click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download?.startsWith("titan-export-")) { const blob = blobs.get(this.href); window.exportFiles.push(blob); return; }
      return click.call(this);
    };
    const owner = "00000000-0000-4000-8000-000000000111";
    if (!guest) {
      window.state.user.id = owner; window.state.user.name = "Snapshot initial";
      const snapshot = { ...window.TitanAdventure.snapshot, owner };
      window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    }
    const client = window.titanClient, rpc = client.rpc.bind(client);
    window.exportSessionOwner = owner;
    client.auth.getSession = async () => {
      const call = window.exportFixtureReady ? ++window.exportSessionCalls : 0;
      if (holdSession && call === 1) await new Promise(resolve => { window.releaseExportSession = resolve; });
      const id = rollover && call > 1 ? "00000000-0000-4000-8000-000000000222" : window.exportSessionOwner;
      return { data: { session: { user: { id }, access_token: id === owner ? "fixture-a-token" : "fixture-b-token" } }, error: null };
    };
    client.rpc = (name, ...args) => {
      if (name !== "export_own_data") {
        const unavailable = Promise.resolve({ error: { code: "PGRST202" }, data: null });
        unavailable.setHeader = () => unavailable;
        return unavailable;
      }
      const builder = rpc(name, ...args), then = builder.then.bind(builder);
      builder.then = (resolve, reject) => then(value => { window.exportSettled++; return resolve(value); }, reject);
      return builder;
    };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { holdSession, rollover, guest });
  // Finish initial profile reads before arming export-specific session delays/rollovers.
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.exportFixtureReady = true;
  });
  f.release = async (index = 0) => { releases[index](); await page.waitForFunction(n => window.exportSettled >= n, index + 1); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
  f.request = async (count = 1) => page.waitForFunction(n => window.exportHeaders.length >= n, count, { timeout: 3000 });
  f.files = async () => page.evaluate(() => Promise.all(window.exportFiles.map(async b => JSON.parse(await b.text()))));
  return f;
}

async function changeExportContext(page, change) {
  await page.evaluate(async change => {
    const owner = window.state.user.id;
    window.titanInvalidateAccountSession(owner);
    if (change === "owner" || change === "roundtrip") window.state.user.id = "00000000-0000-4000-8000-000000000222";
    if (change === "client") window.titanClient = {};
    window.titanAccountTransition.active = false;
    dispatchEvent(new CustomEvent("titan:history-updated"));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (change === "roundtrip") { window.state.user.id = owner; dispatchEvent(new CustomEvent("titan:history-updated")); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
  }, change);
}

test("profile export: repeated clicks reserve a single request", async t => {
  const f = await profileExportPage(t);
  await f.page.evaluate(() => { for (let i = 0; i < 4; i++) document.querySelector('[data-export-json]').dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await f.request();
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await f.page.evaluate(() => window.exportHeaders.length), 1);
  assert.equal(await f.page.locator('[data-export-json]').isDisabled(), true);
  assert.equal(await f.page.locator('[data-export-progress][role="status"]').count(), 1);
  await f.release(); assert.equal((await f.files()).length, 1);
  assert.equal(await f.page.locator('[data-export-json]').isEnabled(), true);
});

test("profile export: snapshots local state and binds the request bearer", async t => {
  const f = await profileExportPage(t);
  await f.page.locator('[data-export-json]').click(); await f.request();
  await f.page.evaluate(() => { window.state.user.name = "Later mutation"; });
  await f.release(); const files = await f.files();
  assert.equal(files[0].localState.user.name, "Snapshot initial");
  assert.equal(files[0].cloud.userId, files[0].localState.user.id);
  assert.deepEqual(await f.page.evaluate(() => window.exportHeaders), ["Bearer fixture-a-token"]);
});

for (const change of ["owner", "roundtrip", "client", "epoch"]) {
  test(`profile export: discards a delayed file after ${change}`, async t => {
    const f = await profileExportPage(t); await f.page.locator('[data-export-json]').click(); await f.request();
    await changeExportContext(f.page, change); await f.release(); assert.deepEqual(await f.files(), []);
  });
}

test("profile export: obsolete response cannot release a newer export", async t => {
  const f = await profileExportPage(t); await f.page.locator('[data-export-json]').click(); await f.request();
  await changeExportContext(f.page, "owner");
  await f.page.evaluate(() => { window.exportSessionOwner = window.state.user.id; });
  await f.page.locator('[data-export-json]').click(); await f.request(2);
  await f.release(0); assert.deepEqual(await f.files(), []);
  assert.equal(await f.page.locator('[data-export-json]').isDisabled(), true);
  await f.release(1); const files = await f.files();
  assert.equal(files.length, 1); assert.match(files[0].cloud.userId, /222$/);
});

test("profile export: obsolete session resolution starts no RPC", async t => {
  const f = await profileExportPage(t, { holdSession: true }); await f.page.locator('[data-export-json]').click();
  await f.page.waitForFunction(() => window.releaseExportSession);
  await changeExportContext(f.page, "epoch");
  await f.page.evaluate(async () => { window.releaseExportSession(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  assert.deepEqual(await f.files(), []); assert.deepEqual(await f.page.evaluate(() => window.exportHeaders), []);
});

test("profile export: foreign initial session produces no file or RPC", async t => {
  const f = await profileExportPage(t, { hold: false });
  await f.page.evaluate(() => { window.exportSessionOwner = "foreign"; });
  await f.page.locator('[data-export-json]').click();
  await f.page.waitForFunction(() => window.exportSessionCalls > 0 && !document.querySelector('[data-export-json]').disabled);
  assert.deepEqual(await f.files(), []); assert.deepEqual(await f.page.evaluate(() => window.exportHeaders), []);
});

for (const mode of ["ok", "error"]) {
  test(`profile export: SDK rollover blocks delivery including ${mode} response`, async t => {
    const f = await profileExportPage(t, { rollover: true, mode });
    await f.page.locator('[data-export-json]').click(); await f.request(); await f.release();
    assert.deepEqual(await f.page.evaluate(() => window.exportHeaders), ["Bearer fixture-a-token"]);
    assert.deepEqual(await f.files(), []);
  });
}

test("profile export: rejects a cloud response owned by another account", async t => {
  const f = await profileExportPage(t, { mode: "foreign" }); await f.page.locator('[data-export-json]').click(); await f.request(); await f.release();
  assert.deepEqual(await f.files(), []);
});

test("profile export: unavailable server yields an explicit local-only file", async t => {
  const f = await profileExportPage(t, { mode: "error" }); await f.page.locator('[data-export-json]').click(); await f.request(); await f.release();
  const files = await f.files(); assert.equal(files.length, 1); assert.equal(files[0].source, "device"); assert.equal(files[0].cloud, undefined);
  assert.equal(await f.page.getByText("Le fichier contient seulement les données de cet appareil.", { exact: true }).count(), 1);
});

test("profile export: discovery retains its local export without an RPC", async t => {
  const f = await profileExportPage(t, { guest: true }); await f.page.locator('[data-export-json]').click();
  await f.page.waitForFunction(() => window.exportFiles.length === 1);
  assert.equal((await f.files())[0].source, "device"); assert.deepEqual(await f.page.evaluate(() => window.exportHeaders), []);
});

for (const width of [360, 1280]) {
  test(`profile radios: cadence wraps, preserves focus through updates and persists at ${width}px`, async t => {
    const { page, context, errors } = await profileRadioPage(width);
    t.after(() => context.close());
    const group = page.getByRole("radiogroup", { name: "Cadence", exact: true });
    assert.equal(await group.locator('[tabindex="0"]').count(), 1);
    await page.locator('[data-avatar="scout"]').focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="radiogroup"][aria-label="Personnage"]') === null), true);
    await page.locator('[data-cadence="3"]').focus();
    for (const [key, target] of [["ArrowRight", 4], ["ArrowDown", 5], ["ArrowLeft", 4], ["ArrowUp", 3]]) {
      await page.keyboard.press(key);
      await page.waitForFunction(target => document.querySelector(`[data-cadence="${target}"]`)?.getAttribute("aria-checked") === "true", target);
      assert.equal(await page.evaluate(target => document.activeElement?.dataset.cadence === String(target), target), true);
    }
    await page.locator('[data-cadence="1"]').click();
    await page.waitForFunction(() => document.querySelector('[data-cadence="1"]')?.getAttribute("aria-checked") === "true");
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(() => document.querySelector('[data-cadence="7"]')?.getAttribute("aria-checked") === "true");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector('[data-cadence="1"]')?.getAttribute("aria-checked") === "true");
    await page.locator('[data-cadence="6"]').focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.querySelector('[data-cadence="6"]')?.getAttribute("aria-checked") === "true");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.cadence), "6");
    assert.equal(await group.locator('[tabindex="0"]').count(), 1);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="radiogroup"][aria-label="Cadence"]') === null), true);
    await page.locator("#mastery-query").focus();
    await page.evaluate(async () => { dispatchEvent(new CustomEvent("titan:history-updated")); await new Promise(requestAnimationFrame); });
    assert.equal(await page.evaluate(() => document.activeElement.id), "mastery-query");
    await page.reload({ waitUntil: "load" });
    await page.locator('[data-profile-group="sport"] > summary').click();
    await page.locator('[data-cadence="6"][aria-checked="true"]').waitFor();
    assert.equal(await page.locator('[data-cadence="6"]').getAttribute("tabindex"), "0");
    assert.equal(await page.evaluate(() => window.state.user.weeklyGoalSessions), 6);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-radio-profile-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
  });

  test(`profile radios: avatars skip locked choices, retain focus and persist through existing actions at ${width}px`, async t => {
    const { page, context, errors } = await profileRadioPage(width);
    t.after(() => context.close());
    const group = page.getByRole("radiogroup", { name: "Personnage", exact: true });
    assert.equal(await group.locator('[tabindex="0"]').count(), 1);
    assert.equal(await group.locator('[aria-disabled="true"][tabindex="-1"]').count(), 4);
    const progression = await page.evaluate(() => ({ xp: window.TitanAdventure.snapshot.xp, level: window.TitanAdventure.snapshot.level }));
    await page.locator('[data-avatar="scout"]').focus();
    for (const [key, avatar] of [["ArrowLeft", "ranger"], ["ArrowRight", "scout"], ["ArrowUp", "ranger"], ["ArrowDown", "scout"]]) {
      await page.keyboard.press(key);
      await page.locator(`[data-avatar="${avatar}"][aria-checked="true"]`).waitFor();
      assert.equal(await page.evaluate(avatar => document.activeElement?.dataset.avatar === avatar, avatar), true, key);
      assert.equal(await group.locator('[tabindex="0"]').count(), 1);
    }
    await page.locator('[data-avatar="ranger"]').focus();
    await page.keyboard.press("Space");
    await page.locator('[data-avatar="ranger"][aria-checked="true"]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.avatar), "ranger");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="radiogroup"][aria-label="Personnage"]') === null), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.avatar), "ranger");
    await page.reload({ waitUntil: "load" });
    await page.locator('[data-profile-group="identity"] > summary').click();
    await page.locator('[data-avatar="ranger"][aria-checked="true"]').waitFor();
    assert.deepEqual(await page.evaluate(() => ({ xp: window.TitanAdventure.snapshot.xp, level: window.TitanAdventure.snapshot.level })), progression);
    assert.deepEqual(errors, []);
  });
}

test("profile radios: failed avatar persistence returns Tab entry to the checked unlocked choice", async t => {
  const { page, context, errors } = await profileRadioPage(360);
  t.after(() => context.close());
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("titan_adventure_v1:")) throw new DOMException("Synthetic write failure", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await page.locator('[data-avatar="scout"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.locator(".asc-toasts").filter({ hasText: "enregistr" }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.avatar), "ranger");
  assert.equal(await page.locator('[data-avatar="scout"]').getAttribute("aria-checked"), "true");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.avatar), "scout");
  const locked = page.locator('[data-avatar="keeper"]');
  await locked.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  assert.equal(await locked.getAttribute("aria-checked"), "false");
  assert.equal(await page.locator('[data-avatar="scout"]').getAttribute("aria-checked"), "true");
  assert.deepEqual(errors, []);
});

test("profile radios: rapid reversal keeps the last avatar intent and serializes existing actions", async t => {
  const { page, context, errors } = await profileRadioPage(360);
  t.after(() => context.close());
  await page.evaluate(() => {
    const action = window.TitanAdventure.action;
    window.radioAvatarCalls = [];
    window.TitanAdventure.action = async (...args) => {
      const call = { avatar: args[1].avatar };
      window.radioAvatarCalls.push(call);
      await new Promise(resolve => { call.release = resolve; });
      return action(...args);
    };
  });
  await page.locator('[data-avatar="scout"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.radioAvatarCalls.length === 1);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.avatar), "scout");
  assert.equal(await page.evaluate(() => window.radioAvatarCalls.length), 1, "no simultaneous avatar action while the first is pending");
  await page.evaluate(() => window.radioAvatarCalls[0].release());
  await page.waitForFunction(() => window.radioAvatarCalls.length === 2, null, { timeout: 2000 });
  assert.deepEqual(await page.evaluate(() => window.radioAvatarCalls.map(call => call.avatar)), ["ranger", "scout"]);
  await page.evaluate(() => window.radioAvatarCalls[1].release());
  await page.locator('[data-avatar="scout"][aria-checked="true"]').waitFor();
  assert.equal(await page.evaluate(() => window.TitanAdventure.snapshot.avatar), "scout");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.avatar), "scout");
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-profile-group="identity"] > summary').click();
  await page.locator('[data-avatar="scout"][aria-checked="true"]').waitFor();
  assert.deepEqual(errors, []);
});

for (const transition of ["owner round trip", "same owner epoch", "client replacement", "client round trip"]) {
  test(`profile radios: pending avatar intent is discarded after ${transition}`, async t => {
    const { page, context, errors } = await profileRadioPage(360);
    t.after(() => context.close());
    await page.evaluate(() => {
      const action = window.TitanAdventure.action;
      window.radioAvatarCalls = [];
      window.TitanAdventure.refresh = async () => window.TitanAdventure.snapshot;
      window.TitanAdventure.action = async (...args) => {
        window.radioAvatarCalls.push(args[1].avatar);
        await new Promise(resolve => { window.releaseRadioAvatar = resolve; });
        return action(...args);
      };
    });
    await page.locator('[data-avatar="scout"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => window.radioAvatarCalls.length === 1);
    await page.keyboard.press("ArrowLeft");
    await page.evaluate(async transition => {
      const owner = window.state.user.id, client = window.titanClient;
      const observedRender = async () => {
        dispatchEvent(new CustomEvent("titan:history-updated"));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };
      if (transition === "owner round trip") {
        window.state.user.id = "guest_radio_other";
        await observedRender();
        window.state.user.id = owner;
        await observedRender();
      } else if (transition === "same owner epoch") {
        window.titanInvalidateAccountSession(owner);
        window.titanAccountTransition.active = false;
        dispatchEvent(new CustomEvent("titan:account-changed"));
      } else {
        window.titanClient = {};
        await observedRender();
        if (transition === "client round trip") {
          window.titanClient = client;
          await observedRender();
        }
      }
      window.releaseRadioAvatar();
    }, transition);
    await page.locator('[data-avatar="ranger"][aria-checked="true"]').waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(() => window.radioAvatarCalls), ["ranger"], "the old queued scout intent is not replayed");
    assert.deepEqual(errors, []);
  });
}

test("profile radios: a delayed avatar action never steals focus from outside its group", async t => {
  const { page, context, errors } = await profileRadioPage(360);
  t.after(() => context.close());
  await page.evaluate(() => {
    const action = window.TitanAdventure.action;
    window.TitanAdventure.action = async (...args) => {
      await new Promise(resolve => { window.releaseRadioAvatar = resolve; });
      return action(...args);
    };
  });
  await page.locator('[data-avatar="scout"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.releaseRadioAvatar);
  await page.locator("#mastery-query").focus();
  await page.evaluate(() => window.releaseRadioAvatar());
  await page.locator('[data-avatar="ranger"][aria-checked="true"]').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), "mastery-query");
  assert.deepEqual(errors, []);
});

test("mastery: the 200th sport is reachable, filters survive updates and typing retains focus", async () => {
  const { page, context, errors } = await newPage(360);
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  const fixture = await seedSports(page);
  await page.locator('[data-profile-group="sport"] > summary').click();
  await page.waitForTimeout(150);
  const search = page.getByRole("searchbox", { name: "Rechercher un sport" });
  assert.equal(await search.count(), 1, "mastery offers a search beyond the original eight rows");
  await search.pressSequentially(fixture.target.label, { delay: 15 });
  assert.equal(await search.inputValue(), fixture.target.label);
  assert.equal(await search.evaluate(el => el === document.activeElement), true);
  await page.selectOption("#mastery-scope", "favorites");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("titan:history-updated")));
  await page.waitForTimeout(100);
  assert.equal(await page.inputValue("#mastery-scope"), "favorites");
  assert.equal(await page.locator("#maitrise .pf-mastery-row").count(), 1);
  assert.ok((await page.locator("#maitrise").innerText()).includes(fixture.target.label));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("navigation: empty searches, no-data favorites, and small accounts remain usable", async () => {
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/records", { waitUntil: "load" });
  await seedSports(page, 2);
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".rc-sport").count(), 2);
  const search = page.getByRole("searchbox", { name: "Rechercher un sport" });
  await search.fill("<img src=x onerror=alert(1)>");
  assert.equal(await page.locator(".rc-sport").count(), 0);
  assert.equal(await page.locator("[data-nav-empty]").count(), 1);
  assert.equal(await page.locator("#records img").count(), 0);
  await search.fill("");
  await page.evaluate(() => {
    window.state.user.favoriteSports = ["yoga"];
    window.state.history = [];
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  });
  await page.waitForTimeout(100);
  await page.selectOption("#records-scope", "favorites");
  await page.getByRole("checkbox", { name: "Masquer les sports sans données" }).uncheck();
  assert.equal(await page.locator(".rc-sport").count(), 1);
  assert.ok((await page.locator(".rc-sport").innerText()).includes("Yoga"));
  assert.equal(await page.locator(".rc-sport [data-record]").count(), 0, "no fictitious record for an unpractised sport");
  assert.deepEqual(errors, []);
  await context.close();
});

// Published CMS content and analytics use the real page, entry point and SDK; only HTTP/auth boundaries are synthetic.
async function publicContentPage({consent="granted",content="published",blocked=false,missingCollector=false,metadata={},schema="normal"}={}) {
  const fixture=await newPage(),{page}=fixture;
  await page.addInitScript(({consent,content,blocked,metadata})=>{
    if(consent) localStorage.setItem("titan_privacy_v1",JSON.stringify({analytics:consent}));
    else localStorage.removeItem("titan_privacy_v1");
    window.publicWrites=[];window.publicQueries=[];
    if(blocked) window.publicMetricGate=new Promise(resolve=>{window.releasePublicMetric=resolve;});
    const native=window.fetch;
    window.fetch=async(input,init)=>{
      const url=new URL(input,location.origin);
      if(url.pathname==="/rest/v1/dynamic_pages") {
        window.publicQueries.push(url.search);
        const rows=content==="missing"?[]:[{id:"00000000-0000-4000-8000-000000000999",slug:"fixture-public",status:"published",title:"Contenu public de test",meta_title:"Contenu public de test",meta_description:"Un contenu publié de test",content:"<p>Un contenu publié lisible.</p>",cover_image_url:null,is_indexable:false,...metadata}];
        return new Response(JSON.stringify(content==="error"?{message:"Synthetic server failure"}:rows),{status:content==="error"?500:200,headers:{"content-type":"application/json"}});
      }
      if(url.pathname==="/rest/v1/analytics_events") {
        window.publicWrites.push({row:JSON.parse(init.body),authorization:new Headers(init.headers).get("Authorization")});
        if(window.publicMetricGate) await window.publicMetricGate;
        return new Response(null,{status:blocked?500:201});
      }
      return native(input,init);
    };
  },{consent,content,blocked,metadata});
  await page.route("**/js/config.js?*",r=>r.fulfill({contentType:"text/javascript",body:readFileSync(ROOT+"/js/config.js","utf8")+`\nwindow.initTitanSupabaseClient().auth.getSession=async()=>({data:{session:{user:{id:"00000000-0000-4000-8000-000000000123"},access_token:"fixture-public-token"}},error:null});`}));
  await page.route("**/js/content.js?*",r=>r.fulfill({contentType:"text/javascript",body:readFileSync(ROOT+"/js/content.js","utf8")+`\nconst publicTrack=window.titanTrackEvent;window.titanTrackEvent=(...args)=>window.publicTracked=publicTrack(...args);`}));
  if(missingCollector) await page.route("**/js/app/analytics.js?*",r=>r.abort("failed"));
  if(schema!=="normal") await page.route("**/dynamic-page?*",async route=>{
    const response=await page.request.get(route.request().url());
    const html=(await response.text()).replace(/<script[^>]*data-seo-schema[^>]*>[\s\S]*?<\/script>/,schema==="missing"?"":'<script type="application/ld+json" data-seo-schema>{broken</script>');
    await route.fulfill({contentType:"text/html",body:html});
  });
  await page.goto(BASE+"/dynamic-page?slug=fixture-public&utm_source=private-fixture",{waitUntil:"load",referer:BASE+"/private?notes=private-fixture"});
  await page.locator("#dynamic-page h1").filter({hasText:content==="published"?"Contenu public de test":"Page introuvable"}).waitFor();
  return fixture;
}

async function renderedPublicMetadata(page) {
  return page.evaluate(() => {
    const value = selector => document.querySelector(selector)?.getAttribute("content");
    const graph = JSON.parse(document.querySelector("script[data-seo-schema]").textContent)["@graph"];
    const webPage = graph.find(node => node["@type"] === "WebPage");
    return {
      title: document.title, description: value('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]').href,
      ogTitle: value('meta[property="og:title"]'), ogDescription: value('meta[property="og:description"]'),
      ogUrl: value('meta[property="og:url"]'), twitterTitle: value('meta[name="twitter:title"]'),
      twitterDescription: value('meta[name="twitter:description"]'),
      schemaName: webPage.name, schemaDescription: webPage.description, schemaUrl: webPage.url,
      robots: value('meta[name="robots"]'), googlebot: value('meta[name="googlebot"]'), bingbot: value('meta[name="bingbot"]'),
    };
  });
}

test("SEO metadata: served admin and public CMS use the current share image and page facts", async () => {
  const { page, context } = await newPage();
  for (const path of ["/admin", "/dynamic-page"]) {
    const response = await page.request.get(BASE + path);
    assert.equal(response.status(), 200);
    const metadata = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const value = selector => doc.querySelector(selector)?.getAttribute("content");
      const graph = JSON.parse(doc.querySelector("script[data-seo-schema]").textContent)["@graph"];
      return { image: value('meta[property="og:image"]'), secureImage: value('meta[property="og:image:secure_url"]'),
        imageType: value('meta[property="og:image:type"]'), twitterImage: value('meta[name="twitter:image"]'),
        appleTouch: doc.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"),
        organization: graph.find(node => node["@type"] === "Organization"),
        webPage: graph.find(node => node["@type"] === "WebPage"),
        productClaims: graph.filter(node => [node["@type"]].flat().some(type => ["SoftwareApplication", "WebApplication", "Product"].includes(type))),
        robots: value('meta[name="robots"]') };
    }, await response.text());
    assert.equal(metadata.image, "https://titan-app.fr/image/og-titan.jpg");
    assert.equal(metadata.secureImage, metadata.image);
    assert.equal(metadata.imageType, "image/jpeg");
    assert.equal(metadata.twitterImage, metadata.image);
    assert.equal(metadata.appleTouch, "/image/apple-touch-icon.png");
    assert.equal(metadata.organization.name, "TITAN");
    assert.equal(metadata.organization.logo.url, "https://titan-app.fr/image/logo-192.png");
    assert.deepEqual(metadata.productClaims, []);
    assert.equal(metadata.webPage.url, "https://titan-app.fr" + path);
    assert.match(metadata.robots, /noindex/);
  }
  await page.goto(BASE + "/");
  assert.deepEqual(await page.evaluate(async origin => {
    const image = new Image(); image.src = origin + "/image/og-titan.jpg"; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, BASE), [1200, 630]);
  await context.close();
});

test("SEO metadata: sitemap includes every served indexable public canonical", async () => {
  const { page, context } = await newPage();
  const pages = await Promise.all(readdirSync(ROOT + "/dist").filter(file => file.endsWith(".html")).map(async file => {
    const response = await page.request.get(BASE + "/" + file);
    return response.text();
  }));
  const sitemap = await (await page.request.get(BASE + "/sitemap.xml")).text();
  const inventory = await page.evaluate(({ pages, sitemap }) => {
    const parser = new DOMParser();
    const canonicals = pages.flatMap(html => {
      const doc = parser.parseFromString(html, "text/html");
      const robots = doc.querySelector('meta[name="robots"]')?.content;
      if (!robots || robots.includes("noindex")) return [];
      return [doc.querySelector('link[rel="canonical"]')?.getAttribute("href")];
    });
    const xml = parser.parseFromString(sitemap, "application/xml");
    return { canonicals, urls: [...xml.querySelectorAll("loc")].map(node => node.textContent), invalidXML: Boolean(xml.querySelector("parsererror")) };
  }, { pages, sitemap });
  assert.equal(inventory.invalidXML, false);
  assert.equal(new Set(inventory.urls).size, inventory.urls.length);
  assert.ok(inventory.canonicals.every(url => url?.startsWith("https://titan-app.fr/")));
  assert.deepEqual(inventory.urls.sort(), inventory.canonicals.sort());
  await context.close();
});

async function cmsLoadingPage(width, rejectClient = false) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/dynamic-page.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/dynamic-page?slug=fixture-public", { waitUntil: "load" });
  await page.evaluate(rejectClient => {
    const chain = { select() { return chain; }, eq() { return chain; }, maybeSingle: async () => ({ data: { title: "Contenu public synthétique", content: "<p>Texte publié synthétique.</p>", is_indexable: false } }) };
    window.waitForTitanSupabase = () => rejectClient ? Promise.reject(new Error("Synthetic client unavailable")) : new Promise(resolve => { window.finishCMSClient = () => resolve({ from: () => chain }); });
  }, rejectClient);
  await page.addScriptTag({ path: ROOT + "/js/dynamic-page.js" });
  return fixture;
}

test("CMS fallback: pending content is busy, announced and uses the current brand", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await cmsLoadingPage(width);
    assert.equal(await page.locator("#dynamic-page").getAttribute("aria-busy"), "true");
    assert.equal(await page.locator("#dynamic-status").count(), 1);
    assert.equal(await page.locator("#dynamic-status").getAttribute("role"), "status");
    assert.equal(await page.locator("#dynamic-status").textContent(), "Chargement de la page…");
    assert.equal(await page.getByText("TITAN OS", { exact: true }).count(), 0);
    assert.equal(await page.locator(".dynamic-brand").innerText(), "TITAN");
    await page.evaluate(() => { window.originalCMSStatus = document.getElementById("dynamic-status"); window.finishCMSClient(); });
    await page.getByRole("heading", { name: "Contenu public synthétique", exact: true }).waitFor();
    assert.equal(await page.locator("#dynamic-page").getAttribute("aria-busy"), "false");
    assert.equal(await page.locator("#dynamic-status").textContent(), "Page chargée.");
    assert.equal(await page.evaluate(() => window.originalCMSStatus === document.getElementById("dynamic-status")), true, "the live region persists across content replacement");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("CMS fallback: a rejected client initialization clears loading and provides recovery", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await cmsLoadingPage(width, true);
    assert.equal(await page.locator("#dynamic-page h1").textContent(), "Page introuvable");
    assert.equal(await page.locator("#dynamic-page").getAttribute("aria-busy"), "false");
    assert.equal(await page.locator("#dynamic-status").textContent(), "Page indisponible.");
    assert.equal(await page.locator("#dynamic-page").getByRole("link", { name: "Retour à l’accueil" }).getAttribute("href"), "/");
    assert.equal(await page.locator("#dynamic-page").getByRole("link", { name: "Assistance", exact: true }).getAttribute("href"), "/service");
    assert.deepEqual(errors, []); await context.close();
  }
});

test("CMS fallback: missing and failed published reads finish with a useful empty state", async () => {
  for (const content of ["missing", "error"]) {
    const { page, context, errors } = await publicContentPage({ consent: "denied", content });
    assert.equal(await page.locator("#dynamic-page").getAttribute("aria-busy"), "false");
    assert.equal(await page.locator("#dynamic-status").textContent(), "Page indisponible.");
    assert.equal(await page.getByText("Cette page n’est pas publiée ou n’existe plus.", { exact: true }).count(), 1);
    const back = page.locator("#dynamic-page").getByRole("link", { name: "Retour à l’accueil" });
    await back.focus(); await page.keyboard.press("Enter"); await page.waitForURL(BASE + "/");
    assert.deepEqual(errors, []); await context.close();
  }
});

test("CMS fallback: JavaScript-disabled readers get an explanation instead of endless loading", async () => {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false, serviceWorkers: "block" });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
    const page = await context.newPage(); await page.goto(BASE + "/dynamic-page?slug=fixture-public", { waitUntil: "load" });
    assert.equal(await page.getByText("Active JavaScript pour afficher ce contenu.", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Chargement...", { exact: true }).isVisible(), false);
    assert.equal(await page.locator(".dynamic-brand").innerText(), "TITAN");
    assert.notEqual(await page.locator("#dynamic-page").getAttribute("aria-busy"), "true");
    await page.getByRole("link", { name: "Assistance", exact: true }).click(); await page.waitForURL(BASE + "/service");
    await context.close();
  }
});

test("SEO metadata: published CMS title description and canonical agree across consumers", async () => {
  const { page, context, errors } = await publicContentPage({ consent: "denied" });
  const result = await renderedPublicMetadata(page);
  for (const key of ["title", "ogTitle", "twitterTitle", "schemaName"]) assert.equal(result[key], "Contenu public de test", key);
  for (const key of ["description", "ogDescription", "twitterDescription", "schemaDescription"]) assert.equal(result[key], "Un contenu publié de test", key);
  for (const key of ["canonical", "ogUrl", "schemaUrl"]) assert.equal(result[key], "https://titan-app.fr/dynamic-page?slug=fixture-public", key);
  for (const key of ["robots", "googlebot", "bingbot"]) assert.match(result[key], /noindex/, key);
  assert.deepEqual(errors, []); await context.close();
});

test("SEO metadata: CMS text remains literal in tags and JSON-LD", async () => {
  const title = 'Un titre </script><script>window.seoInjected=true</script> & "cité"';
  const description = 'Une description <img src=x onerror="window.seoInjected=true"> et des accents : été.';
  const { page, context, errors } = await publicContentPage({ consent: "denied", metadata: { meta_title: title, meta_description: description } });
  const result = await renderedPublicMetadata(page);
  for (const key of ["title", "ogTitle", "twitterTitle", "schemaName"]) assert.equal(result[key], title, key);
  for (const key of ["description", "ogDescription", "twitterDescription", "schemaDescription"]) assert.equal(result[key], description, key);
  assert.equal(await page.evaluate(() => window.seoInjected), undefined);
  assert.equal(await page.locator("#dynamic-page h1").textContent(), "Contenu public de test");
  assert.deepEqual(errors, []); await context.close();
});

test("SEO metadata: missing CMS fields and failed reads keep a coherent noindex fallback", async () => {
  for (const content of ["published", "missing", "error"]) {
    const { page, context, errors } = await publicContentPage({ consent: "denied", content, metadata: { meta_title: null, meta_description: "", is_indexable: true } });
    const result = await renderedPublicMetadata(page);
    const title = content === "published" ? "Contenu public de test" : "Page publique TITAN";
    for (const key of ["title", "ogTitle", "twitterTitle", "schemaName"]) assert.equal(result[key], title, key);
    assert.ok(result.description);
    for (const key of ["ogDescription", "twitterDescription", "schemaDescription"]) assert.equal(result[key], result.description, key);
    for (const key of ["canonical", "ogUrl", "schemaUrl"]) assert.equal(result[key], "https://titan-app.fr/dynamic-page" + (content === "published" ? "?slug=fixture-public" : ""), key);
    for (const key of ["robots", "googlebot", "bingbot"]) assert.match(result[key], /noindex/, key);
    assert.deepEqual(errors, []); await context.close();
  }
});

test("SEO metadata: missing or malformed JSON-LD never blocks published content", async () => {
  for (const schema of ["missing", "malformed"]) {
    for (const consent of ["denied", "granted"]) {
      const { page, context, errors } = await publicContentPage({ consent, schema });
      assert.equal(await page.locator("#dynamic-page h1").textContent(), "Contenu public de test");
      assert.equal(await page.locator('meta[property="og:title"]').getAttribute("content"), "Contenu public de test");
      assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
      if (consent === "granted") {
        await page.waitForFunction(() => window.publicWrites.length === 1);
        assert.equal(await page.evaluate(() => window.publicTracked), true);
        assert.deepEqual(await page.evaluate(() => window.publicWrites), [{ row: { event_name: "dynamic_page_opened", user_id: "00000000-0000-4000-8000-000000000123", page: "/dynamic-page", source: null, referrer: null, metadata: { consent: "granted", v: 300 } }, authorization: "Bearer fixture-public-token" }]);
      } else {
        assert.equal(await page.evaluate(() => window.publicTracked), false);
        assert.deepEqual(await page.evaluate(() => window.publicWrites), []);
      }
      assert.deepEqual(errors, []); await context.close();
    }
  }
});
test("public page analytics: refusal suppresses tracking while published content remains readable",async()=>{
  const {page,context,errors}=await publicContentPage({consent:"denied"});
  assert.equal(await page.evaluate(()=>window.publicTracked),false);assert.deepEqual(await page.evaluate(()=>window.publicWrites),[]);
  assert.match(await page.locator(".dynamic-content").innerText(),/publié lisible/);
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: an unanswered choice never carries account or URL attribution",async()=>{
  const {page,context,errors}=await publicContentPage({consent:null});
  assert.equal(await page.evaluate(()=>window.publicTracked),true);
  assert.deepEqual(await page.evaluate(()=>window.publicWrites),[{row:{event_name:"dynamic_page_opened",user_id:null,page:"/dynamic-page",source:null,referrer:null,metadata:{consent:"anonymous",v:300}},authorization:`Bearer ${await page.evaluate(()=>window.TITAN_SUPABASE_ANON_KEY)}`}]);
  const query=await page.evaluate(()=>window.publicQueries[0]);assert.match(query,/slug=eq.fixture-public/);assert.match(query,/status=eq.published/);
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: agreed published openings keep the stable name and a minimal payload",async()=>{
  const {page,context,errors}=await publicContentPage();assert.equal(await page.evaluate(()=>window.publicTracked),true);
  assert.deepEqual(await page.evaluate(()=>window.publicWrites),[{row:{event_name:"dynamic_page_opened",user_id:"00000000-0000-4000-8000-000000000123",page:"/dynamic-page",source:null,referrer:null,metadata:{consent:"granted",v:300}},authorization:"Bearer fixture-public-token"}]);
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: unavailable or missing CMS content creates no opening",async()=>{
  for(const content of ["missing","error"]){
    const {page,context,errors}=await publicContentPage({content});
    assert.equal(await page.evaluate(()=>window.publicTracked),undefined);assert.deepEqual(await page.evaluate(()=>window.publicWrites),[]);
    assert.equal(await page.locator(".dynamic-nav .dynamic-back[href='/']").isVisible(),true);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test("public page analytics: an unresolved or failed measure never blocks the rendered page",async()=>{
  const {page,context,errors}=await publicContentPage({blocked:true});
  await page.waitForFunction(()=>window.publicWrites.length===1);
  assert.equal(await page.locator("#dynamic-page h1").textContent(),"Contenu public de test");
  await page.evaluate(()=>window.releasePublicMetric());assert.equal(await page.evaluate(()=>window.publicTracked),false);
  await page.locator(".dynamic-back").click();await page.waitForURL(BASE+"/");
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: home navigation succeeds while the measure is still unresolved",async()=>{
  const {page,context,errors}=await publicContentPage({blocked:true});
  await page.waitForFunction(()=>window.publicWrites.length===1);
  await page.evaluate(()=>{window.publicTracked.then(()=>{window.publicMetricSettled=true;});});
  assert.equal(await page.evaluate(()=>window.publicMetricSettled===true),false);
  // Leave the real metric promise unresolved: navigation must not wait for its HTTP result.
  await page.locator(".dynamic-back").click({timeout:5000});await page.waitForURL(BASE+"/");
  assert.deepEqual(errors,[]);await context.close();
});
test("public page analytics: a missing collector leaves the page usable without unsafe fallback",async()=>{
  const {page,context,errors}=await publicContentPage({missingCollector:true});
  assert.equal(await page.evaluate(()=>window.publicTracked),false);assert.deepEqual(await page.evaluate(()=>window.publicWrites),[]);
  assert.equal(await page.locator("#dynamic-page h1").textContent(),"Contenu public de test");
  assert.deepEqual(errors,[]);await context.close();
});

async function adventureConfirmationPage() {
  const fixture = await newPage(), { page } = fixture;
  await page.goto(BASE + "/adventure", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(async () => {
    const owner = "00000000-0000-4000-8000-000000000123";
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-adventure-token" } } });
    window.adventureCharacter = (revision = 1, chapter = 1) => ({ version: 1, owner, level: 1, xp: 0, next_level_xp: 500,
      credits: 0, plus: false, avatar: "scout", selected_world: "aube", revision, generated_at: "2026-10-10T12:00:00Z",
      rewards: chapter > 1 ? [{ world: "aube", chapter: 1, source_ids: ["synthetic-session"], earned_at: "2026-10-10T12:00:00Z" }] : [],
      campaigns: [{ id: "aube", tier: "free", chapter, route: "rhythm", started_at: "2026-10-09T12:00:00Z", target: chapter === 1 ? 1 : 2,
        effort_target: 0, evidence: { days: chapter === 1 ? 1 : 0, effort: 0, source_ids: chapter === 1 ? ["synthetic-session"] : [] }, completed_at: null }] });
    // The real engine may also schedule a boot refresh; identify the held RPCs rather than their array positions.
    window.adventureRequests = [];
    const native = window.fetch;
    window.fetch = (input, init) => {
      const url = new URL(input, location.origin);
      if (!/^\/rest\/v1\/rpc\/titan_adventure_(snapshot|action)$/.test(url.pathname)) return native(input, init);
      if (!window.adventureRequests.length) {
        window.adventureRequests.push({ name: "boot" });
        return Promise.resolve(new Response(JSON.stringify(window.adventureCharacter()), { status: 200, headers: { "content-type": "application/json" } }));
      }
      return new Promise(resolve => {
        const request = { name: url.pathname.split("/").at(-1), params: JSON.parse(init.body),
          respond: (data, status = 200) => resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })) };
        window.adventureRequests.push(request);
        if (request.name === "titan_adventure_action") window.adventureActionRequest = request;
        if (request.name === "titan_adventure_snapshot" && window.captureAdventureRead) {
          window.adventureReadRequest = request;
          window.captureAdventureRead = false;
        }
      });
    };
    await window.TitanAdventure.refresh({ force: true });
  });
  await page.locator("[data-claim='1']").waitFor();
  return fixture;
}

test("adventure confirmation: late old cloud data cannot extinguish the earned map badge", async () => {
  const { page, context, errors } = await adventureConfirmationPage();
  await page.locator("[data-claim='1']").click();
  await page.waitForFunction(() => window.adventureActionRequest);
  await page.evaluate(() => { window.captureAdventureRead = true; window.adventureReading = window.TitanAdventure.refresh({ force: true }); });
  await page.waitForFunction(() => window.adventureReadRequest);
  await page.evaluate(() => window.adventureActionRequest.respond(window.adventureCharacter(2, 2)));
  await page.locator("[data-close-celebrate]").click();
  await page.locator(".av-node.is-earned").waitFor();
  await page.evaluate(async () => { window.adventureReadRequest.respond(window.adventureCharacter()); await window.adventureReading; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator(".av-node.is-earned").count(), 1);
  assert.equal(await page.locator(".av-node.is-active").getAttribute("data-chapter"), "2");
  assert.equal(await page.locator(".av-carnet-row.is-earned").count(), 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("titan_adventure_v1:00000000-0000-4000-8000-000000000123")).revision), 2);
  assert.deepEqual(errors, []); await context.close();
});

test("adventure confirmation: a late read error does not label the confirmed badge as cached", async () => {
  const { page, context, errors } = await adventureConfirmationPage();
  await page.locator("[data-claim='1']").click();
  await page.waitForFunction(() => window.adventureActionRequest);
  await page.evaluate(() => { window.captureAdventureRead = true; window.adventureReading = window.TitanAdventure.refresh({ force: true }); });
  await page.waitForFunction(() => window.adventureReadRequest);
  await page.evaluate(() => window.adventureActionRequest.respond(window.adventureCharacter(2, 2)));
  await page.locator("[data-close-celebrate]").click();
  await page.evaluate(async () => { window.adventureReadRequest.respond({ message: "Synthetic read failure" }, 500); await window.adventureReading; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator("#aventure").getByText("Dernière progression connue", { exact: false }).count(), 0);
  assert.equal(await page.locator(".av-node.is-earned").count(), 1);
  assert.equal(await page.evaluate(() => window.TitanAdventure.status), "ready");
  assert.deepEqual(errors, []); await context.close();
});

test("installed PWA: navigation and cosmetic resources bypass the previous cache on the first visit", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + "/aujourdhui", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("titan_sw_dev", "1"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const staleScripts = await Promise.all([["/js/state.js", "state"], ["/js/app/shell.js", "shell"], ["/js/app/atelier.js", "atelier"], ["/js/app/coaching.js", "coaching"], ["/js/main.js", "main"], ["/js/app/profil.js", "profil"], ["/js/app/auth.js", "auth"], ["/js/app/update-password.js", "password"], ["/js/app/onboarding.js", "onboarding"], ["/js/app/seance.js", "seance"], ["/js/content.js", "content"], ["/js/dynamic-page.js", "dynamic"], ["/js/renaissance-engine.js", "adventure"], ["/js/app/communaute.js", "community"]]
    .map(async ([path, marker]) => [path, marker, await (await fetch(BASE + path)).text()]));
  await page.evaluate(async (staleScripts) => {
    const cache = await caches.open("titan-os-v300-ascension");
    await cache.put("/css/ascension-app.css?v=300.0", new Response(".rc-sport { display: block; }", { headers: { "content-type": "text/css" } }));
    await cache.put("/service", new Response('<!doctype html><html lang="fr"><body><h1>Ancienne aide en cache</h1></body></html>', { headers: { "content-type": "text/html" } }));
    for (const version of ['300.0','300.1','300.2','300.3']) {
      await cache.put(`/js/app/analytics.js?v=${version}`, new Response('window.TitanAnalytics = {EVENTS: new Set(["first_session"]), track: async () => false};', { headers: { "content-type": "text/javascript" } }));
    }
    // Keep valid script bodies and mark the stale generation. Cache-first must not serve them
    // to the new page even when a background fetch will replace them for a later visit.
    for (const [path, marker, body] of staleScripts) {
      const versions = marker === "shell" ? ["300.0", "300.2", "300.3"] : marker === "auth" ? ["300.0", "300.1", "300.2", "300.3", "300.4"] : marker === "community" ? ["300.0", "300.1", "300.2"] : marker === "profil" ? ["300.0", "300.1", "300.2", "300.3", "300.4", "300.5", "300.6", "300.7"] : marker === "onboarding" ? ["300.0", "300.1", "300.2"] : marker === "main" ? ["300.0", "300.1"] : marker === "atelier" ? ["300.0", "300.4", "300.5", "300.6"] : marker === "dynamic" || marker === "password" ? ["300.0", "300.1"] : ["300.0"];
      for (const version of versions) await cache.put(path + "?v=" + version, new Response(body + `\nwindow.titanPreviousResource ??= {}; window.titanPreviousResource.${marker} = true;`, { headers: { "content-type": "text/javascript" } }));
    }
  }, staleScripts);
  await page.goto(BASE + "/records", { waitUntil: "load" });
  await page.waitForSelector(".sn-selects");
  assert.equal(await page.locator(".sn-selects").evaluate(el => getComputedStyle(el).display), "grid");
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_searched")), true);
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_filtered")), true);
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.state)), false, "first navigation loads the new appearance resolver");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.shell)), false, "first navigation loads the new shared rendering guard");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.main)), false, "first navigation loads the new checkout guard");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.adventure)), false, "first navigation loads the guarded adventure engine");
  assert.equal(await page.evaluate(() => typeof window.titanSyncAppearance), "function");
  await page.goto(BASE + "/boutique", { waitUntil: "load" });
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.atelier)), false, "first Atelier visit loads permanent-acquisition controls");
  for (const [path, marker] of [["/coaching", "coaching"], ["/profile", "profil"], ["/login", "auth"], ["/update-password", "password"], ["/onboarding?again=1", "onboarding"], ["/training?sport=running", "seance"]]) {
    await page.goto(BASE + path, { waitUntil: "load" });
    assert.equal(await page.evaluate(marker => Boolean(window.titanPreviousResource?.[marker]), marker), false, "first visit loads the updated consent failure notice");
  }
  await page.goto(BASE + "/social", { waitUntil: "load" });
  await page.getByRole("heading", { name: "Avancer avec les autres, sans bruit." }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.community)), false, "first community visit loads the hierarchy and session guards");
  assert.equal(await page.locator(".cm-preview li").count(), 4, "discovery explains all four existing social spaces");
  assert.equal(await page.locator(".cm-preview").evaluate(el => getComputedStyle(el).display), "grid");
  assert.equal(await page.locator("#communaute").getAttribute("aria-busy"), "false");
  await page.goto(BASE + "/service", { waitUntil: "load" });
  assert.equal(await page.getByRole("heading", { name: "Assistance", exact: true }).count(), 1, "first help visit replaces the previous cached HTML");
  assert.equal(await page.getByRole("navigation", { name: "Choisir une catégorie" }).locator("a").count(), 6);
  assert.equal(await page.getByText("Ancienne aide en cache", { exact: true }).count(), 0);
  await page.goto(BASE + "/dynamic-page?slug=fixture-unavailable", { waitUntil: "load" });
  await page.getByRole("heading", { name: "Page introuvable" }).waitFor();
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("dynamic_page_opened")), true, "first public visit loads the shared collector");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.content)), false, "first public visit loads the guarded legacy entry point");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.dynamic)), false, "first public visit loads the updated metadata producer");
  await context.close();
});
