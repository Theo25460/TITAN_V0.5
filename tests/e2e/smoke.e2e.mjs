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
        window.communityHeaders.push({ name, header });
        const owner = header === "Bearer token-alice" ? "alice" : "bob";
        return new Response(JSON.stringify(name === "titan_social_overview" ? window.communityOverview(owner) : {}), { status: 200, headers: { "Content-Type": "application/json" } });
      } },
    });
    let prepared = false, switched = false, armed = false;
    const send = client.rpc.bind(client);
    client.rpc = (...args) => { prepared = true; return send(...args); };
    client.auth.getSession = async () => {
      if (armed && prepared && !switched) { switched = true; window.communitySwitch("bob"); }
      const id = window.state.user.id;
      return { data: { session: { user: { id }, access_token: "token-" + id } } };
    };
    window.titanClient = client;
    window.communityArm = () => { prepared = false; armed = true; };
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(() => window.communityHeaders.length === 1 && document.querySelector("#communaute [data-delete-moment]"));
  await page.locator("[data-delete-moment]").click();
  await page.evaluate(() => window.communityArm());
  await page.locator("dialog [data-ok]").click();
  await page.waitForFunction(() => window.communityHeaders.some(r => r.name === "titan_moment_delete"));
  assert.equal(await page.evaluate(() => window.communityHeaders.find(r => r.name === "titan_moment_delete").header), "Bearer token-alice");
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  assert.equal(await page.locator("#communaute").textContent().then(t => t.includes("privé alice")), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: missing, mismatched or failed auth prevents RPCs and a valid session can retry", async () => {
  const { page, context, errors } = await communityPage();
  for (const kind of ["missing", "mismatched", "error"]) {
    const count = await page.evaluate(kind => {
      const count = window.communityCalls.length;
      window.titanClient.auth.getSession = async () => kind === "error" ? { error: { message: "Auth unavailable" } }
        : { data: { session: kind === "missing" ? null : { user: { id: "bob" }, access_token: "fixture-token" } } };
      window.dispatchEvent(new Event("online"));
      return count;
    }, kind);
    await page.getByRole("heading", { name: "Communauté indisponible" }).waitFor();
    assert.equal(await page.evaluate(() => window.communityCalls.length), count);
    assert.equal(await page.locator(".cm-code-value").count(), 0);
    await page.evaluate(() => {
      window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: "alice" }, access_token: "fixture-token" } } });
    });
    await page.locator("[data-retry]").click();
    await page.getByText("Moment privé alice", { exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: challenge success cannot notify or reload after a transition between continuations", async () => {
  const { page, context, errors } = await communityPage();
  await page.locator("[data-new-challenge]").click();
  await page.locator('dialog [name="invite"]').check();
  await page.evaluate(() => { window.communityMicrotaskAfter = "titan_challenge_create"; });
  await page.locator('dialog button[type="submit"]').click();
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  assert.equal(await page.locator(".asc-toasts").textContent(), "");
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_social_overview" && c.owner === "bob").length), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: friend request feedback checks its session again when its continuation resumes", async () => {
  const { page, context, errors } = await communityPage();
  await page.evaluate(() => { window.communityMicrotaskAfter = "titan_social_request"; });
  await page.locator("[data-add-friend] [name=code]").fill("TN-AB12");
  await page.locator("[data-add-friend] button").click();
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  assert.equal(await page.locator(".asc-toasts").textContent(), "");
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: a confirmation continuation cannot add another new-account reload", async () => {
  const { page, context, errors } = await communityPage();
  await page.locator("[data-delete-moment]").click();
  await page.evaluate(() => { window.communityMicrotaskAfter = "titan_moment_delete"; });
  await page.locator("dialog [data-ok]").click();
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.communityCalls.filter(c => c.name === "titan_social_overview" && c.owner === "bob").length), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("community: challenge analytics cannot be attributed to the account adopted between continuations", async () => {
  const { page, context, errors } = await communityPage();
  await page.evaluate(() => {
    const base = window.communityOverview;
    window.communityOverview = owner => ({ ...base(owner), challenges: [{ id: "challenge", title: "Semaine d’effort", metric: "sessions", target: 4,
      ends_at: new Date(Date.now() + 86400000).toISOString(), status: "active", my_status: "invited", members: [] }] });
    window.communityEvents = [];
    window.TitanAnalytics = { track: name => window.communityEvents.push({ name, owner: window.state.user.id }) };
    window.dispatchEvent(new Event("online"));
  });
  await page.locator('[data-challenge][data-act="join"]').waitFor();
  await page.evaluate(() => { window.communityMicrotaskAfter = "titan_challenge_respond"; });
  await page.locator('[data-challenge][data-act="join"]').click();
  await page.getByText("Moment privé bob", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.communityEvents), []);
  assert.equal(await page.locator(".asc-toasts").textContent(), "");
  assert.deepEqual(errors, []);
  await context.close();
});

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

async function viewsPage(width=360, type='report', seeded=false) {
  const fixture=await (type==='comparison'?comparisonPage(width):reportPage(width));
  const {page}=fixture;
  assert.equal(await page.locator('#vues').count(),1,'secondary saved views surface exists');
  await page.evaluate(seeded=>{
    const owner=window.state.user.id;
    const stamp='2026-10-09T20:00:00+00:00';
    window.viewRows=seeded?[{id:'00000000-0000-4000-8000-000000000333',name:'Mon année',kind:'report',options:{period:'year',offset:1},revision:1,created_at:stamp,updated_at:stamp}]:[];
    window.viewsAccess='plus';window.viewsCalls=[];
    window.makeViewList=p=>({version:1,owner:window.state.user.id,available:window.viewsAccess==='plus',...(window.viewsAccess==='plus'?{}:{reason:'premium_required'}),limit:10,count:window.viewRows.length,
      views:window.viewRows.filter(v=>!p?.p_id||p.p_id===v.id).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||(a.id<b.id?-1:1))});
    const analysis=window.titanClient.rpc;
    window.viewGateway=async(name,p)=>{
      if(name==='titan_analysis_views')return {data:window.makeViewList(p)};
      if(name==='titan_mutate_analysis_view'){
        if(window.viewsAccess==='free'&&p.p_action==='save')return {error:{message:'PREMIUM_REQUIRED'}};
        const old=window.viewRows.find(v=>v.id===p.p_id);
        if(p.p_action==='delete'){window.viewRows=window.viewRows.filter(v=>v.id!==p.p_id);return {data:{version:1,owner:window.state.user.id,action:'delete',deleted_id:p.p_id}};}
        if(old&&p.p_expected_revision===0&&old.revision===1)return {data:{version:1,owner:window.state.user.id,action:'save',view:{...old}}};
        if(old&&old.revision!==p.p_expected_revision)return {error:{message:'VIEW_VERSION_CONFLICT'}};
        if(!old&&window.viewRows.length===10)return {error:{message:'VIEW_LIMIT'}};
        const view={id:p.p_id,name:p.p_name,kind:p.p_kind,options:structuredClone(p.p_options),revision:(old?.revision||0)+1,created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
        window.viewRows=window.viewRows.filter(v=>v.id!==p.p_id).concat(view);
        return {data:{version:1,owner:window.state.user.id,action:'save',view}};
      }
      return analysis(name,p);
    };
    window.titanClient.rpc=(name,p)=>{window.viewsCalls.push({name,p});return window.viewGateway(name,p);};
  },seeded);
  return fixture;
}

async function recordAnalysisAnalytics(page,granted=true){
  await page.evaluate(granted=>{
    window.TitanAnalytics.setConsent(granted);window.analyticsWrites=[];
    window.titanClient.auth={getSession:async()=>({data:{session:{user:{id:window.state.user.id},access_token:"fixture-token"}}})};
    const nativeFetch=window.fetch;
    window.fetch=(input,init)=>{
      if(new URL(input).pathname!=="/rest/v1/analytics_events")return nativeFetch(input,init);
      window.analyticsWrites.push(JSON.parse(init.body));return Promise.resolve(new Response(null,{status:201}));
    };
    history.replaceState(null,'','/stats?utm_source=private%20text');
  },granted);
}
test('analysis analytics: standalone signup uses its receipt owner and separate account keys',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await newPage(width);await page.goto(BASE+'/login?mode=signup',{waitUntil:'load'});
    await page.evaluate(()=>{
      if(window.state||window.titanAccountTransition)throw Error('login must be tested without application state');
      const client=window.initTitanSupabaseClient();window.signupOwner='00000000-0000-4000-8000-000000000123';window.signupSession='00000000-0000-4000-8000-000000000456';
      window.analyticsWrites=[];const nativeFetch=window.fetch;
      window.fetch=(input,init)=>{if(new URL(input).pathname!=='/rest/v1/analytics_events')return nativeFetch(input,init);window.analyticsWrites.push(JSON.parse(init.body));return Promise.resolve(new Response(null,{status:201}));};
      client.auth.signUp=async()=>({data:{user:{id:window.signupOwner},session:null},error:null});
      client.auth.getSession=async()=>({data:{session:{user:{id:window.signupSession},access_token:'fixture-token'}}});
      const track=window.TitanAnalytics.track;window.TitanAnalytics.track=(...args)=>(window.lastAnalyticsResult=track(...args));
    });
    const submit=async()=>{
      await page.locator('[name=name]').fill('Agent');await page.locator('[name=email]').fill('agent@example.test');await page.locator('[name=password]').fill('fixture-password');
      await page.locator('[name=terms]').check();await page.locator('[name=analytics]').check();await page.locator('.auth-submit').click();
      await page.waitForSelector('.auth-sent');return page.evaluate(()=>window.lastAnalyticsResult);
    };
    assert.equal(await submit(),false,'a foreign session cannot receive the signup event');
    const repeat=async(owner)=>{
      await page.locator('.auth-sent [data-mode=signin]').click();await page.locator('[data-mode=signup]').click();
      await page.evaluate(owner=>{window.signupOwner=owner;window.signupSession=owner;},owner);return submit();
    };
    const a='00000000-0000-4000-8000-000000000123',b='00000000-0000-4000-8000-000000000456';
    assert.equal(await repeat(a),true);assert.equal(await repeat(b),true);assert.equal(await repeat(b),false);
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.user_id)),[a,b]);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: report use counts intentional previews and CSV, not background refresh',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await reportPage(width);await recordAnalysisAnalytics(page);
    await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-export');
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_report_viewed']);
    await page.evaluate(()=>{window.reportFactor=2;window.dispatchEvent(new Event('focus'));});
    await page.waitForFunction(()=>document.querySelector('[data-report-metric="minutes"]')?.textContent==='1 h 40');
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),1);
    await page.click('#report-submit');await page.waitForSelector('#report-export');
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);
    const download=page.waitForEvent('download');await page.click('#report-export');await download;
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_report_viewed','analysis_report_viewed','analysis_report_exported']);
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>({source:r.source,metadata:r.metadata}))),Array.from({length:3},()=>({source:null,metadata:{consent:'granted',v:300}})));
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: comparison usage ignores refreshes, expired access and invalid snapshots',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await comparisonPage(width);await recordAnalysisAnalytics(page);
    await page.locator('#compare-panel > summary').click();await page.waitForSelector('#compare-save-view');
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_comparison_viewed']);
    await page.evaluate(()=>{window.compareFactor=2;window.dispatchEvent(new Event('titan:history-updated'));});
    await page.waitForSelector('#compare-save-view');assert.equal(await page.evaluate(()=>window.analyticsWrites.length),1);
    await page.selectOption('#compare-weeks','12');await page.click('#compare-submit');await page.waitForSelector('#compare-save-view');
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);
    await page.evaluate(()=>{window.compareAccess='free';});await page.click('#compare-submit');
    await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.includes('TITAN+ ajoute'));
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);
    await page.evaluate(()=>{window.titanClient.rpc=async()=>({data:{version:1,owner:'wrong-owner',available:true}});});
    await page.click('#compare-submit');await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.includes('pas répondu correctement'));
    assert.equal(await page.evaluate(()=>window.analyticsWrites.length),2);assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: saved view actions use confirmed receipts and closed kinds, including Free deletion',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width);await recordAnalysisAnalytics(page);
    await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');
    await page.fill('#views-name','Nom privé');await page.click('#views-submit');await page.waitForSelector('[data-view]');
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),['analysis_report_viewed','analysis_view_created']);
    await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Autre nom privé');await page.click('#views-submit');
    await page.waitForFunction(()=>document.querySelector('#views-list').textContent.includes('Autre nom privé'));
    await page.locator('[data-view-action="apply"]').click();
    await page.waitForFunction(()=>window.analyticsWrites.filter(r=>r.event_name==='analysis_report_viewed').length===2);
    await page.evaluate(()=>{window.viewsAccess='free';});await page.click('#views-retry');await page.waitForSelector('[data-view-action="edit"]:disabled');
    await page.locator('[data-view-action="delete"]').click();await page.click('#views-confirm-delete');
    await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('Vue supprimée'));
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.filter(r=>r.event_name.startsWith('analysis_view_')).map(r=>({name:r.event_name,source:r.source,metadata:r.metadata}))),
      ['created','renamed','opened','deleted'].map(action=>({name:'analysis_view_'+action,source:null,metadata:{kind:'report',consent:'granted',v:300}})));
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('analysis analytics: refused tracking and a failed report leave the product usable without events',async()=>{
  const {page,context,errors}=await reportPage();await recordAnalysisAnalytics(page,false);
  await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-export');
  const download=page.waitForEvent('download');await page.click('#report-export');await download;
  assert.deepEqual(await page.evaluate(()=>window.analyticsWrites),[]);
  await page.evaluate(()=>{window.TitanAnalytics.setConsent(true);window.reportAccess='error';});await page.click('#report-submit');
  await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('pas répondu correctement'));
  assert.deepEqual(await page.evaluate(()=>window.analyticsWrites),[]);assert.deepEqual(errors,[]);await context.close();
});
test('analysis analytics: an acknowledged mutation counts even if list refresh fails; an invalid receipt does not',async()=>{
  for(const acknowledged of [false,true]){
    const {page,context,errors}=await viewsPage(360,'report',true);await recordAnalysisAnalytics(page);
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Renommage privé');
    await page.evaluate(acknowledged=>{
      const previous=window.viewGateway;let failed=false;
      window.viewGateway=async(name,p)=>{
        if(name==='titan_mutate_analysis_view'){
          if(!acknowledged)return {data:{version:1,owner:'wrong-owner',action:'save'}};
          const result=await previous(name,p);failed=true;return result;
        }
        if(failed&&name==='titan_analysis_views')return {error:{message:'Network lost'}};
        return previous(name,p);
      };
    },acknowledged);
    await page.click('#views-submit');
    await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('mais la liste')||document.querySelector('#views-status').textContent.includes('vérifie la liste'));
    assert.deepEqual(await page.evaluate(()=>window.analyticsWrites.map(r=>r.event_name)),acknowledged?['analysis_view_renamed']:[]);
    assert.deepEqual(errors,[]);await context.close();
  }
});

test('views UX: pending save retains the draft until its uncertain response arrives',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width,'report',true);
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
    await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Nom à conserver');
    await page.evaluate(()=>{
      const previous=window.viewGateway;
      window.viewGateway=(name,p)=>name==='titan_mutate_analysis_view'
        ?new Promise(resolve=>{window.finishPendingViewFailure=()=>resolve({error:{message:'Network lost'}});})
        :previous(name,p);
    });
    await page.click('#views-submit');await page.waitForFunction(()=>typeof window.finishPendingViewFailure==='function');
    assert.equal(await page.locator('#views-cancel').isDisabled(),true,'pending save cannot discard its draft');
    await page.evaluate(()=>document.querySelector('#views-cancel').click());
    assert.equal(await page.locator('#views-draft-form').isVisible(),true);
    assert.equal(await page.locator('#views-name').inputValue(),'Nom à conserver');
    await page.evaluate(()=>window.finishPendingViewFailure());
    await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('vérifie la liste'));
    assert.equal(await page.locator('#views-cancel').isDisabled(),false);
    assert.equal(await page.locator('#views-draft-form').isVisible(),true);
    assert.equal(await page.locator('#views-name').inputValue(),'Nom à conserver');
    await page.click('#views-cancel');assert.equal(await page.locator('#views-draft-form').isVisible(),false);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('views UX: rename removes the previous delete confirmation',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width,'report',true);
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
    await page.locator('[data-view-action="delete"]').click();assert.equal(await page.locator('#views-confirm-delete').count(),1);
    await page.locator('[data-view-action="edit"]').click();
    assert.equal(await page.locator('#views-confirm-delete').count(),0,'rename clears the visible confirmation');
    assert.equal(await page.locator('#views-draft-form').isVisible(),true);
    assert.equal(await page.locator('#views-name').inputValue(),'Mon année');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'views-name');
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('views UX: keyboard cancellation returns focus to the same view delete button',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width,'report',true);
    await page.evaluate(()=>window.viewRows.push({...window.viewRows[0],id:'00000000-0000-4000-8000-000000000444',name:'Deuxième vue'}));
    await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
    const card=page.locator('[data-view="00000000-0000-4000-8000-000000000444"]');
    await card.locator('[data-view-action="delete"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'views-confirm-delete');
    await page.keyboard.press('Tab');await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(()=>({action:document.activeElement?.dataset.viewAction,id:document.activeElement?.closest('[data-view]')?.dataset.view})),
      {action:'delete',id:'00000000-0000-4000-8000-000000000444'});
    assert.equal(await page.locator('#views-confirm-delete').count(),0);
    await page.keyboard.press('Enter');assert.equal(await card.locator('#views-confirm-delete').count(),1);
    assert.deepEqual(errors,[]);await context.close();
  }
});

test('views: save current report, restore fresh, rename and delete at 360/1280 px',async()=>{
  for(const width of [360,1280]){
    const {page,context,errors}=await viewsPage(width);
    assert.equal(await page.locator('#views-panel').getAttribute('open'),null);
    await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');
    await page.selectOption('#report-period','year:1');await page.click('#report-submit');await page.waitForSelector('#report-save-view');
    await page.click('#report-save-view');await page.waitForSelector('#views-draft-form:not([hidden])');
    await page.fill('#views-name','Mon année');await page.click('#views-submit');await page.waitForSelector('[data-view]');
    assert.match(await page.locator('#views-list').innerText(),/Mon année.*Année précédente/s);
    await page.evaluate(()=>{window.reportFactor=2;});await page.locator('[data-view-action="apply"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-report-metric="minutes"]')?.textContent==='1 h 40');
    assert.equal(await page.locator('#report-period').inputValue(),'year:1');
    const last=await page.evaluate(()=>window.reportCalls.at(-1));assert.equal(last.p_offset,1);assert.ok(last.p_timezone);
    await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','<b>Privé</b>');await page.click('#views-submit');
    await page.waitForFunction(()=>document.querySelector('#views-list').textContent.includes('<b>Privé</b>'));assert.equal(await page.locator('#views-list b').count(),0);
    if(process.env.TITAN_QA_SCREENSHOTS)await page.locator('#vues').screenshot({path:`/tmp/titan-views-${width}.png`,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('[data-view-action="delete"]').click();await page.click('#views-confirm-delete');
    await page.waitForFunction(()=>document.querySelectorAll('[data-view]').length===0);assert.match(await page.locator('#views-status').innerText(),/supprimée/);
    assert.deepEqual(errors,[]);await context.close();
  }
});
test('views: comparison sport and 12 weeks restored with a fresh calculation',async()=>{
  const {page,context,errors}=await viewsPage(360,'comparison');
  await page.locator('#compare-panel > summary').click();await page.waitForSelector('#compare-save-view');
  await page.selectOption('#compare-weeks','12');await page.fill('#compare-sport-q','course');await page.locator('[data-sport="running"]').click();await page.click('#compare-submit');
  await page.waitForSelector('#compare-save-view');await page.click('#compare-save-view');await page.fill('#views-name','Course 12 semaines');await page.click('#views-submit');await page.waitForSelector('[data-view]');
  await page.selectOption('#compare-weeks','4');await page.click('#compare-all');await page.locator('[data-view-action="apply"]').click();
  await page.waitForSelector('#compare-save-view');assert.equal(await page.locator('#compare-weeks').inputValue(),'12');
  assert.match(await page.locator('#compare-sport-current').innerText(),/Course/);const p=await page.evaluate(()=>window.compareCalls.at(-1));assert.equal(p.p_sport,'running');assert.equal(p.p_weeks,12);
  assert.deepEqual(errors,[]);await context.close();
});
test('views: expired retained parameters are deletable; fresh apply cannot unlock paid reports',async()=>{
  const {page,context}=await viewsPage(360,'report',true);
  await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');
  await page.evaluate(()=>{window.viewsAccess='free';window.reportAccess='free';});
  await page.locator('[data-view-action="apply"]').click();await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('conservées'));
  assert.equal(await page.locator('[data-view-action="apply"]').isDisabled(),true);assert.equal(await page.locator('[data-view-action="edit"]').isDisabled(),true);
  assert.equal(await page.locator('.report-results').count(),0);assert.match(await page.locator('#views-list').innerText(),/Mon année/);
  await page.locator('[data-view-action="delete"]').click();await page.click('#views-confirm-delete');await page.waitForFunction(()=>!document.querySelector('[data-view]'));
  await context.close();
});
test('views: stable create UUID survives uncertain response; success then refresh error remains honest',async()=>{
  const {page,context}=await viewsPage();
  await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');await page.fill('#views-name','Retry');
  await page.evaluate(()=>{const gateway=window.viewGateway;let first=true;window.viewGateway=async(name,p)=>{const result=await gateway(name,p);if(name==='titan_mutate_analysis_view'&&first){first=false;return {error:{message:'Network lost'}};}return result;};});
  await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('vérifie'));
  await page.click('#views-submit');await page.waitForSelector('[data-view]');
  const ids=await page.evaluate(()=>window.viewsCalls.filter(c=>c.name==='titan_mutate_analysis_view').map(c=>c.p.p_id));assert.equal(new Set(ids).size,1);assert.equal(await page.evaluate(()=>window.viewRows.length),1);
  await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Saved');
  await page.evaluate(()=>{const gateway=window.viewGateway;let saved=false;window.viewGateway=async(name,p)=>{if(name==='titan_analysis_views'&&saved)return {error:{message:'Offline'}};const result=await gateway(name,p);if(name==='titan_mutate_analysis_view')saved=true;return result;};});
  await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('enregistrée')&&/actualiser/i.test(document.querySelector('#views-status').textContent));
  assert.equal(await page.evaluate(()=>window.viewRows[0].name),'Saved');await context.close();
});
test('views: malformed list rejected, missing server and timeout recover without retaining stale rows',async()=>{
  const {page,context}=await viewsPage(360,'report',true);await page.clock.install();
  await page.evaluate(()=>{window.viewGateway=async()=>({data:{...window.makeViewList({}),owner:'foreign'}});});
  await page.locator('#views-panel > summary').click();await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('correctement'));assert.equal(await page.locator('[data-view]').count(),0);
  await page.evaluate(()=>{window.viewGateway=()=>new Promise(resolve=>{window.oldViewReply=()=>resolve({data:window.makeViewList({})});});});
  await page.click('#views-retry');await page.waitForFunction(()=>!!window.oldViewReply);await page.clock.fastForward(15100);
  assert.match(await page.locator('#views-status').innerText(),/15 secondes/);await page.evaluate(()=>window.oldViewReply());assert.equal(await page.locator('[data-view]').count(),0);
  await page.evaluate(()=>{window.viewGateway=async()=>({error:{code:'PGRST202'}});});await page.click('#views-retry');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('mise à jour du serveur'));await context.close();
});
test('views: delayed mutations cannot cross an actual A to B to A auth transition',async()=>{
  const {page,context}=await viewsPage();await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');await page.fill('#views-name','Private A');
  await page.evaluate(async()=>{window.__titanAuthListenerBound=false;window.titanClient.auth={onAuthStateChange(cb){window.viewsAuth=cb;}};await window.setupTitanAuthListener();const gateway=window.viewGateway;
    window.viewGateway=(name,p)=>name==='titan_mutate_analysis_view'?new Promise(async resolve=>{const response=await gateway(name,p);window.oldViewMutation=()=>resolve(response);}):gateway(name,p);});
  await page.click('#views-submit');await page.waitForFunction(()=>!!window.oldViewMutation);
  await page.evaluate(()=>{window.viewsAuth('SIGNED_IN',{user:{id:'00000000-0000-4000-8000-000000000456'}});window.viewsAuth('SIGNED_IN',{user:{id:'00000000-0000-4000-8000-000000000123'}});window.oldViewMutation();});
  assert.equal(await page.locator('[data-view]').count(),0);assert.equal(await page.locator('#views-draft-form').isVisible(),false);assert.doesNotMatch(await page.locator('#views-status').innerText(),/enregistrée/);
  await page.evaluate(()=>window.viewsAuth('SIGNED_OUT',null));assert.equal(await page.locator('[data-view]').count(),0);await context.close();
});

test('views: closing/offline cancels late mutations; stale rename requires a fresh revision',async()=>{
  const {page,context}=await viewsPage(360,'report',true);
  await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Stale');
  await page.evaluate(()=>{window.viewRows[0].revision=2;window.viewRows[0].name='Other device';});
  await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('autre appareil'));
  assert.equal(await page.evaluate(()=>window.viewRows[0].name),'Other device');
  await page.click('#views-cancel');await page.waitForFunction(()=>document.querySelector('#views-list').textContent.includes('Other device'));
  await page.locator('[data-view-action="edit"]').click();await page.fill('#views-name','Late');
  await page.evaluate(()=>{const gateway=window.viewGateway;window.viewGateway=(name,p)=>name==='titan_mutate_analysis_view'?new Promise(async resolve=>{const response=await gateway(name,p);window.lateClosedView=()=>resolve(response);}):gateway(name,p);});
  await page.click('#views-submit');await page.waitForFunction(()=>!!window.lateClosedView);await page.locator('#views-panel > summary').click();await page.evaluate(()=>window.lateClosedView());
  await page.waitForFunction(()=>!document.querySelector('[data-view]'));
  assert.equal(await page.locator('[data-view]').count(),0);assert.equal(await page.locator('#views-draft-form').isVisible(),false);
  await page.locator('#views-panel > summary').click();await page.waitForSelector('[data-view]');await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  assert.equal(await page.locator('[data-view]').count(),0);assert.match(await page.locator('#views-status').innerText(),/Hors ligne/);await context.close();
});
test('views: expiration during save disables paid draft controls and retains the name',async()=>{
  const {page,context}=await viewsPage();await page.locator('#report-panel > summary').click();await page.waitForSelector('#report-save-view');await page.click('#report-save-view');await page.fill('#views-name','Retained draft');
  await page.evaluate(()=>{window.viewsAccess='free';});await page.click('#views-submit');await page.waitForFunction(()=>document.querySelector('#views-status').textContent.includes('conservées'));
  assert.equal(await page.locator('#views-name').isDisabled(),true);assert.equal(await page.locator('#views-submit').isDisabled(),true);assert.equal(await page.locator('#views-name').inputValue(),'Retained draft');await context.close();
});

test("reports: four choices, provisional labels, estimates and sources at 360/1280 px", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await reportPage(width);
    assert.equal(await page.locator("#report-panel").getAttribute("open"), null);
    await page.locator("#report-panel > summary").click();
    await page.waitForSelector(".report-results");
    for (const [choice, size] of [["month:0", 15], ["month:1", 29], ["year:0", 3], ["year:1", 12]]) {
      await page.selectOption("#report-period", choice);
      await page.click("#report-submit");
      await page.waitForSelector(".report-results");
      assert.match(await page.locator(".report-results").innerText(), choice.endsWith(":0") ? /provisoire/i : /période complète/i);
      assert.match(await page.locator(".report-results").innerText(), /estimée/);
      assert.equal(await page.locator('[data-report-metric="active_days"]').innerText(), "1");
      await page.locator("#report-calendar summary").click();
      assert.equal(await page.locator("#report-calendar tbody tr").count(), size);
    }
    assert.equal(await page.locator('.report-sources a[href="/journal?session=00000000-0000-4000-8000-000000000999"]').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.locator("#bilans").screenshot({ path: `/tmp/titan-reports-${width}.png`, animations: "disabled" });
    await context.close();
  }
});
test("reports: CSV uses a fresh server snapshot and retains all 200 sports beyond pagination", async () => {
  const { page, context, errors } = await reportPage(360, "plus", true);
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  assert.equal(await page.locator("#report-sport-rows tr").count(), 20);
  await page.click("#report-next"); assert.match(await page.locator("#report-page").innerText(), /2.*10/);
  await page.fill("#report-sport-search", "sport_199"); assert.equal(await page.locator("#report-sport-rows tr").count(), 1);
  const calls = await page.evaluate(() => window.reportCalls.length);
  await page.evaluate(() => { window.reportFactor = 2; });
  const downloadPromise = page.waitForEvent("download"); await page.click("#report-export");
  const download = await downloadPromise, csv = readFileSync(await download.path(), "utf8");
  assert.match(download.suggestedFilename(), /bilan.*\.csv$/);
  assert.equal(csv.split("\r\n").filter(s => s.startsWith('"Sport"')).length, 200);
  assert.match(csv, /"200";"1";"400";"0"/);
  assert.doesNotMatch(csv, /00000000-0000/);
  assert.ok(await page.evaluate(() => window.reportCalls.length) > calls);
  assert.deepEqual(errors, []); await context.close();
});
test("reports: guest, Free, old server and network errors never expose a paid aggregate", async () => {
  for (const access of ["guest", "free", "missing", "error"]) {
    const { page, context, errors } = await reportPage(360, access);
    await page.locator("#report-panel > summary").click();
    await page.waitForFunction(() => !document.querySelector("#report-status").textContent.includes("Calcul") && !!document.querySelector("#report-status").textContent);
    assert.equal(await page.locator(".report-results").count(), 0);
    assert.equal(await page.locator("#report-export").count(), 0);
    assert.equal(await page.locator(".wk-hero").count(), 1);
    assert.match(await page.locator("#report-status").innerText(), access === "missing" ? /mise à jour du serveur/ : access === "error" ? /Réessaie/ : /compte|TITAN\+/);
    if (access === "guest") assert.equal(await page.evaluate(() => window.reportCalls.length), 0);
    else assert.ok(await page.evaluate(() => window.reportCalls.length) > 0);
    assert.deepEqual(errors, []); await context.close();
  }
});
test("reports: expiry between preview and export blocks download and removes the old report", async () => {
  const { page, context } = await reportPage(); let downloads = 0; page.on("download", () => downloads++);
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.evaluate(() => { window.reportAccess = "free"; });
  await page.click("#report-export"); await page.waitForSelector("#report-status a");
  assert.equal(await page.locator(".report-results").count(), 0); assert.equal(downloads, 0);
  await context.close();
});
test("reports: never-answering request expires at fifteen seconds and can be retried", async () => {
  const { page, context } = await reportPage(); await page.clock.install();
  await page.evaluate(() => { window.titanClient.rpc = () => { window.hungReport = true; return new Promise(() => {}); }; });
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => window.hungReport);
  await page.clock.runFor(15001);
  assert.match(await page.locator("#report-status").innerText(), /15 secondes/);
  assert.equal(await page.locator("#report-submit").isDisabled(), false);
  await page.evaluate(() => { window.titanClient.rpc = async (name, p) => ({ data: window.makeReport(p) }); });
  await page.click("#report-submit"); await page.waitForSelector(".report-results");
  await context.close();
});
test("reports: malformed totals and obsolete filter response never become a preview", async () => {
  const { page, context } = await reportPage();
  await page.evaluate(() => { window.pendingReports = []; window.titanClient.rpc = (name, p) => new Promise(resolve => { const data = window.makeReport(p); window.pendingReports.push({ p, finish: () => resolve({ data }) }); }); });
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => window.pendingReports.length > 0);
  await page.selectOption("#report-period", "year:1"); await page.click("#report-submit");
  await page.waitForFunction(() => window.pendingReports.some(r => r.p.p_period === "year"));
  await page.evaluate(() => window.pendingReports.filter(r => r.p.p_period === "month").forEach(r => r.finish()));
  assert.equal(await page.locator("#report-output").getAttribute("aria-busy"), "true");
  await page.evaluate(() => window.pendingReports.filter(r => r.p.p_period === "year").forEach(r => r.finish()));
  await page.waitForSelector(".report-results"); assert.match(await page.locator("#report-title").innerText(), /2023/);
  await page.evaluate(() => { window.titanClient.rpc = async (name, p) => { const data = window.makeReport(p); data.active_days = 99; return { data }; }; });
  await page.click("#report-submit"); await page.waitForFunction(() => document.querySelector("#report-status").textContent.includes("correctement"));
  assert.equal(await page.locator(".report-results").count(), 0); await context.close();
});
test("reports: actual SIGNED_OUT and A→B→A invalidate both preview and pending export", async () => {
  const { page, context } = await reportPage(); let downloads = 0; page.on("download", () => downloads++);
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.evaluate(async () => {
    window.__titanAuthListenerBound = false; window.titanClient.auth = { onAuthStateChange(cb) { window.reportAuth = cb; } };
    await window.setupTitanAuthListener();
    window.titanClient.rpc = (name, p) => new Promise(resolve => { const data = window.makeReport(p); window.oldReportExport = () => resolve({ data }); });
  });
  await page.click("#report-export"); await page.waitForFunction(() => !!window.oldReportExport);
  await page.evaluate(() => {
    window.reportAuth("SIGNED_IN", { user: { id: "00000000-0000-4000-8000-000000000456" } });
    window.reportAuth("SIGNED_IN", { user: { id: "00000000-0000-4000-8000-000000000123" } });
    window.oldReportExport(); window.dispatchEvent(new Event("focus"));
  });
  assert.equal(await page.locator(".report-results").count(), 0); assert.equal(downloads, 0);
  await page.evaluate(() => window.reportAuth("SIGNED_OUT", null));
  assert.equal(await page.locator(".report-sources a").count(), 0); await context.close();
});
test("reports: close, offline and history change clear stale reports immediately", async () => {
  const { page, context } = await reportPage();
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => !document.querySelector(".report-results"));
  await page.locator("#report-panel > summary").click(); await page.waitForSelector(".report-results");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  assert.equal(await page.locator(".report-results").count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.waitForSelector(".report-results");
  await page.evaluate(() => { window.reportAccess = "free"; window.dispatchEvent(new Event("titan:history-updated")); });
  await page.waitForSelector("#report-status a"); assert.equal(await page.locator(".report-results").count(), 0);
  await context.close();
});
test("reports: empty period is explicit and abort signal cancels obsolete options", async () => {
  const { page, context } = await reportPage();
  await page.evaluate(() => {
    window.reportSignals = []; window.titanClient.rpc = (name, p) => ({
      abortSignal(signal) { window.reportSignals.push(signal); return new Promise(() => {}); }
    });
  });
  await page.locator("#report-panel > summary").click(); await page.waitForFunction(() => window.reportSignals.length > 0);
  await page.selectOption("#report-period", "year:1");
  assert.equal(await page.evaluate(() => window.reportSignals.every(s => s.aborted)), true);
  await page.evaluate(() => { window.titanClient.rpc = async (name, p) => {
    const data = window.makeReport(p); Object.assign(data, { sessions: 0, active_days: 0, minutes: 0, estimated_sessions: 0, sports: [], sources: [] });
    data.series = data.series.map(s => ({ ...s, sessions: 0, active_days: 0, minutes: 0, estimated_sessions: 0 })); return { data };
  }; });
  await page.click("#report-submit"); await page.waitForSelector(".report-results");
  assert.match(await page.locator(".report-results").innerText(), /Aucune séance synchronisée/);
  assert.equal(await page.locator('[data-report-metric="minutes"]').innerText(), "0 min");
  await context.close();
});

// The real analysis UI/shell, with only the remote RPC replaced by its full contract.
async function comparisonPage(width = 360, access = "plus") {
  const fixture = await newPage(width);
  const { page } = fixture;
  await page.route("**/js/app/analyses.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  assert.equal(await page.locator("#analyses").count(), 1, "Progrès has the secondary comparison panel");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate((access) => {
    const owner = "00000000-0000-4000-8000-000000000123";
    if (access !== "guest") window.state.user.id = owner;
    window.state.user.is_elite = true; // Cannot unlock anything on its own.
    window.compareAccess = access;
    window.compareCalls = [];
    window.makeComparison = (p) => {
      if (window.compareAccess === "free") return { version: 1, owner: window.state.user.id, available: false, reason: "premium_required" };
      const end = new Date("2026-10-05T12:00:00Z");
      const shift = (d, days) => { const v = new Date(d); v.setUTCDate(v.getUTCDate() + days); return v.toISOString().slice(0, 10); };
      const period = (part) => {
        const to = shift(end, -part * p.p_weeks * 7), from = shift(end, -(part + 1) * p.p_weeks * 7);
        const start = new Date(from + "T12:00:00Z");
        return { from, to, sessions: part ? 4 : 8, active_days: part ? 2 : 4, minutes: part ? 0 : 240, estimated_sessions: part ? 0 : 1,
          series: Array.from({ length: p.p_weeks }, (_, i) => ({ from: shift(start, i * 7), to: shift(start, (i + 1) * 7), sessions: i === p.p_weeks - 1 ? (part ? 4 : 8) : 0, active_days: i === p.p_weeks - 1 ? (part ? 2 : 4) : 0, minutes: i === p.p_weeks - 1 && !part ? 240 : 0 })),
          sources: [{ id: "00000000-0000-4000-8000-000000000999", sport: p.p_sport || "running", date: shift(new Date(to + "T12:00:00Z"), -3) + "T12:00:00Z", minutes: part ? 0 : 30, estimated: !part }] };
      };
      return { version: 1, owner: window.state.user.id, available: true, as_of: "2026-10-08T12:00:00Z", timezone: p.p_timezone, weeks: p.p_weeks, sport: p.p_sport, recent: period(0), previous: period(1) };
    };
    window.titanClient = { rpc: async (name, params) => {
      if (name !== "titan_compare_periods") throw Error("unexpected analysis RPC");
      window.compareCalls.push(params);
      if (window.compareAccess === "missing") return { error: { code: "PGRST202", message: "Could not find function" } };
      if (window.compareAccess === "error") return { error: { message: "Network request failed" } };
      return { data: window.makeComparison(params) };
    } };
  }, access);
  await page.addScriptTag({ path: ROOT + "/js/app/analyses.js" });
  await page.waitForSelector("#compare-panel summary");
  return fixture;
}

test("comparisons: guest and Free keep the free recap, client elite flag never unlocks", async () => {
  for (const access of ["guest", "free"]) {
    const { page, context, errors } = await comparisonPage(360, access);
    assert.equal(await page.locator("#compare-panel").getAttribute("open"), null);
    await page.locator("#compare-panel summary").click();
    await page.waitForSelector("#compare-status a");
    assert.equal(await page.locator(".compare-results").count(), 0);
    assert.equal(await page.locator(".wk-hero").count(), 1, "free weekly recap is retained");
    const calls = await page.evaluate(() => window.compareCalls.length);
    if (access === "guest") assert.equal(calls, 0);
    else assert.ok(calls >= 1, "Free entitlement is actually checked by the server, including revalidation events");
    assert.match(await page.locator("#compare-status").innerText(), /compte|TITAN\+/);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("comparisons: equal periods, estimates, source links and zero reference at 360/1280 px", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await comparisonPage(width);
    await page.locator("#compare-panel summary").click();
    await page.waitForSelector(".compare-results");
    assert.match(await page.locator(".compare-results").innerText(), /4 h/);
    assert.match(await page.locator(".compare-results").innerText(), /estimée/);
    assert.match(await page.locator('[data-comparison-metric="minutes"]').innerText(), /pas de référence/i);
    assert.match(await page.locator('[data-comparison-metric="minutes"]').innerText(), /0 min/, "zero is known practice volume, not missing data");
    assert.doesNotMatch(await page.locator(".compare-results").innerText(), /Infinity|NaN/);
    assert.equal(await page.locator('a[href="/journal?session=00000000-0000-4000-8000-000000000999"]').count(), 2);
    await page.locator("#compare-weekly summary").click();
    assert.equal(await page.locator("#compare-weekly tbody tr").count(), 4);
    for (const weeks of [12, 26]) {
      await page.selectOption("#compare-weeks", String(weeks));
      await page.click("#compare-submit");
      await page.waitForSelector(".compare-results");
      await page.locator("#compare-weekly summary").click();
      assert.equal(await page.locator("#compare-weekly tbody tr").count(), weeks);
    }
    await page.fill("#compare-sport-q", "course");
    assert.ok(await page.locator("#compare-sport-results button").count() <= 12);
    await page.locator('#compare-sport-results [data-sport="running"]').click();
    await page.click("#compare-submit");
    await page.waitForSelector(".compare-results");
    assert.equal(await page.evaluate(() => window.compareCalls.at(-1).p_sport), "running");
    assert.match(await page.locator(".compare-results").innerText(), /Course à pied/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.locator("#analyses").screenshot({ path: `/tmp/titan-comparisons-${width}.png`, animations: "disabled" });
    await context.close();
  }
});

test("comparisons: missing server, network failure and Retry show honest states", async () => {
  for (const access of ["missing", "error"]) {
    const { page, context, errors } = await comparisonPage(360, access);
    await page.locator("#compare-panel summary").click();
    await page.waitForSelector("#compare-status p");
    assert.match(await page.locator("#compare-status").innerText(), access === "missing" ? /mise à jour du serveur/ : /Réessaie/);
    assert.equal(await page.locator(".compare-results").count(), 0);
    await page.evaluate(() => { window.compareAccess = "plus"; });
    await page.click("#compare-submit");
    await page.waitForSelector(".compare-results");
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    assert.equal(await page.locator(".compare-results").count(), 0);
    assert.match(await page.locator("#compare-status").innerText(), /Hors ligne/);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("comparisons: revalidation removes results after expiry and ignores prior-owner response", async () => {
  const { page, context, errors } = await comparisonPage();
  await page.locator("#compare-panel summary").click();
  await page.waitForSelector(".compare-results");
  await page.evaluate(() => { window.compareAccess = "free"; window.dispatchEvent(new Event("focus")); });
  await page.waitForSelector("#compare-status a");
  assert.equal(await page.locator(".compare-results").count(), 0);
  await page.evaluate(() => {
    window.compareAccess = "plus";
    window.titanClient.rpc = (name, p) => new Promise((resolve) => { const data = window.makeComparison(p); window.resolveOldComparison = () => resolve({ data }); });
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(() => !!window.resolveOldComparison);
  await page.evaluate(() => { window.state.user.id = "guest_other"; window.dispatchEvent(new Event("titan:history-updated")); window.resolveOldComparison(); });
  await page.waitForSelector("#compare-status a");
  assert.equal(await page.locator(".compare-results").count(), 0);
  assert.equal(await page.locator('a[href*="session="]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("comparisons: an older filter response cannot overwrite a newer request", async () => {
  const { page, context } = await comparisonPage();
  await page.evaluate(() => {
    window.deferredComparisons = [];
    window.titanClient.rpc = (name, p) => p.p_weeks === 12 ? Promise.resolve({ data: window.makeComparison(p) }) : new Promise((resolve) => { window.deferredComparisons.push(() => resolve({ data: window.makeComparison(p) })); });
  });
  await page.locator("#compare-panel summary").click();
  await page.waitForFunction(() => window.deferredComparisons.length >= 1);
  await page.selectOption("#compare-weeks", "12");
  await page.click("#compare-submit");
  await page.waitForSelector(".compare-results");
  await page.evaluate(() => window.deferredComparisons.forEach(resolve => resolve()));
  assert.match(await page.locator("#compare-period-title").innerText(), /12 semaines/);
  await context.close();
});

test("comparisons: a discarded response cannot end the newer loading state", async () => {
  const { page, context } = await comparisonPage();
  await page.evaluate(() => {
    window.pendingComparisons = { 4: [], 12: [] };
    window.titanClient.rpc = (name, p) => new Promise(resolve => window.pendingComparisons[p.p_weeks].push(() => resolve({ data: window.makeComparison(p) })));
  });
  await page.locator("#compare-panel summary").click();
  await page.waitForFunction(() => window.pendingComparisons[4].length > 0);
  await page.selectOption("#compare-weeks", "12");
  // A real focus refresh can already start the selected request in a slow CI browser.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => window.pendingComparisons[12].length > 0);
  await page.evaluate(() => window.pendingComparisons[4].forEach(resolve => resolve()));
  assert.equal(await page.locator("#compare-submit").isDisabled(), true, "new comparison is still loading");
  assert.equal(await page.locator("#compare-output").getAttribute("aria-busy"), "true");
  await page.evaluate(() => window.pendingComparisons[12].forEach(resolve => resolve()));
  await page.waitForSelector(".compare-results");
  await context.close();
});

test("comparisons: malformed or wrong-owner data never becomes a result", async () => {
  for (const invalid of ["owner", "series"]) {
    const { page, context, errors } = await comparisonPage();
    await page.evaluate(invalid => {
      const make = window.makeComparison;
      window.makeComparison = p => { const j = make(p); if (invalid === "owner") j.owner = "another_account"; else j.recent.series = []; return j; };
    }, invalid);
    await page.locator("#compare-panel summary").click();
    await page.waitForFunction(() => document.getElementById("compare-status").textContent.includes("correctement"));
    assert.equal(await page.locator(".compare-results").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

async function journalSourcePage() {
  const fixture = await newPage(360);
  const { page } = fixture;
  await page.route("**/js/app/journal.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/journal?session=00000000-0000-4000-8000-000000000999", { waitUntil: "load" });
  await page.evaluate(() => {
    const owner = "00000000-0000-4000-8000-000000000123";
    window.state.user.id = owner;
    window.state.history = [];
    window.sourceFilters = [];
    const query = { select() { return this; }, eq(k, v) { window.sourceFilters.push([k, v]); return this; }, maybeSingle: async () => ({ data: { id: "00000000-0000-4000-8000-000000000999", user_id: owner, sport: "running", unit: "km", val: 5, date: "2026-01-01T12:00:00Z", details: { val2: 30, note: "Note privée du compte A" }, xp: 0, revision: 1 } }) };
    window.titanClient = { from(t) { if (t !== "training_logs") throw Error("unexpected source read"); return query; } };
  });
  await page.addScriptTag({ path: ROOT + "/js/app/journal.js" });
  await page.waitForSelector("dialog.asc-sheet[open]");
  return fixture;
}

test("journal: a source outside the local history opens via an owner-filtered read", async () => {
  const { page, context, errors } = await journalSourcePage();
  assert.match(await page.locator("dialog.asc-sheet[open]").innerText(), /Course à pied|5 km/);
  assert.deepEqual(await page.evaluate(() => window.sourceFilters), [["id", "00000000-0000-4000-8000-000000000999"], ["user_id", "00000000-0000-4000-8000-000000000123"]]);
  await page.evaluate(() => { window.state.user.id = "guest_new"; window.dispatchEvent(new Event("titan:history-updated")); });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("comparisons: real profile sync clears the prior account before history pagination ends", async () => {
  const { page, context } = await comparisonPage();
  await page.locator("#compare-panel summary").click();
  await page.waitForSelector(".compare-results");
  await page.evaluate(() => {
    const owner = "00000000-0000-4000-8000-000000000456";
    const profile = { id: owner, friend_code: "B123", is_elite: false, game_state: structuredClone(window.state) };
    profile.game_state.user.id = owner;
    window.titanClient.auth = { getSession: async () => ({ data: { session: { user: { id: owner } } } }) };
    window.titanClient.from = () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile }) });
    window.compareAccess = "free";
    window.titanMaybeSubmitCacheReconciliation = undefined;
    window.titanSyncAppearance = async () => {};
    window.TitanTraining.paginate = () => new Promise(resolve => { window.finishHistory = () => resolve({ logs: [], total: 0 }); });
    window.TitanQueue.migrate = async () => {};
    window.TitanQueue.refresh = async () => [];
    window.TitanQueue.saveHistory = async () => {};
    window.syncWithSupabase();
  });
  await page.waitForFunction(() => !!window.finishHistory);
  assert.equal(await page.evaluate(() => window.state.user.id), "00000000-0000-4000-8000-000000000456");
  assert.equal(await page.locator(".compare-results").count(), 0);
  assert.equal(await page.locator('.compare-sources a').count(), 0);
  await context.close();
});

test("comparisons: real SIGNED_OUT callback immediately removes results and blocks refresh", async () => {
  const { page, context } = await comparisonPage();
  await page.locator("#compare-panel summary").click();
  await page.waitForSelector(".compare-results");
  await page.evaluate(async () => {
    window.__titanAuthListenerBound = false;
    window.titanClient.auth = { onAuthStateChange(cb) { window.authCallback = cb; } };
    await window.setupTitanAuthListener();
    window.authCallback("SIGNED_OUT", null);
    window.dispatchEvent(new Event("focus"));
  });
  assert.equal(await page.locator(".compare-results").count(), 0);
  assert.equal(await page.locator('.compare-sources a').count(), 0);
  await context.close();
});

test("journal: correction closes on account change and a retained form cannot save its private note", async () => {
  const { page, context } = await journalSourcePage();
  await page.locator("dialog[open] [data-edit]").click();
  assert.equal(await page.locator('dialog[open] [name=note]').inputValue(), "Note privée du compte A");
  await page.evaluate(() => {
    window.retainedCorrection = document.querySelector("dialog[open] form");
    window.sourceSaves = 0;
    window.TitanSessions.update = async () => { window.sourceSaves++; };
    window.state.user.id = "guest_new";
    window.dispatchEvent(new Event("titan:history-updated"));
  });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.evaluate(() => window.retainedCorrection.dispatchEvent(new Event("submit", { cancelable: true })));
  assert.equal(await page.evaluate(() => window.sourceSaves), 0);
  await context.close();
});

test("journal: detail and derived archive confirmation close before a new account is adopted", async () => {
  for (const archive of [false, true]) {
    const { page, context } = await journalSourcePage();
    if (archive) await page.locator("dialog[open] [data-toggle-archive]").click();
    await page.evaluate(async () => {
      window.__titanAuthListenerBound = false;
      window.titanClient.auth = { onAuthStateChange(cb) { window.authCallback = cb; } };
      window.syncWithSupabase = () => new Promise(() => {});
      await window.setupTitanAuthListener();
      window.authCallback("SIGNED_IN", { user: { id: "00000000-0000-4000-8000-000000000456" } });
    });
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await context.close();
  }
});

async function pendingConfirmationPage(width = 360, danger = false) {
  const fixture = await newPage(width);
  await fixture.page.goto(BASE + "/profile", { waitUntil: "load" });
  await fixture.page.evaluate(danger => {
    window.confirmationCalls = 0;
    window.confirmationResult = "waiting";
    window.confirmation = window.titanShell.confirm({
      title: "Confirmer l’action ?", confirmLabel: "Enregistrer", danger,
      action: () => {
        window.confirmationCalls++;
        return new Promise((resolve, reject) => {
          window.finishConfirmation = resolve;
          window.failConfirmation = () => reject(new Error("Connexion interrompue"));
        });
      },
    }).then(result => { window.confirmationResult = result; });
  }, danger);
  return fixture;
}

test("confirmations: user dismissal cannot cancel a running action", async () => {
  for (const method of ["cancel", "close", "escape", "backdrop"]) {
    const { page, context, errors } = await pendingConfirmationPage();
    const dialog = page.getByRole("dialog", { name: "Confirmer l’action ?" });
    await dialog.locator("[data-ok]").click();
    await page.waitForFunction(() => !!window.finishConfirmation);
    if (method === "escape") await page.keyboard.press("Escape");
    else await dialog.evaluate((d, method) => {
      const target = method === "backdrop" ? d : d.querySelector(`[data-${method}]`);
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, method);
    assert.equal(await dialog.count(), 1, method + " must keep the pending dialog open");
    assert.equal(await dialog.getAttribute("aria-busy"), "true");
    assert.equal(await dialog.locator("[data-cancel]").isDisabled(), true);
    assert.equal(await dialog.locator("[data-close]").isDisabled(), true);
    assert.match(await dialog.getByRole("status").innerText(), /en cours/i);
    assert.equal(await page.evaluate(() => window.confirmationResult), "waiting");
    await page.evaluate(() => window.finishConfirmation());
    await page.waitForFunction(() => window.confirmationResult === true);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("confirmations: repeated activations invoke the action once", async () => {
  const { page, context, errors } = await pendingConfirmationPage(1280);
  await page.locator("dialog[open] [data-ok]").click();
  await page.evaluate(() => {
    const ok = document.querySelector("dialog[open] [data-ok]");
    ok.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    ok.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => window.confirmationCalls), 1);
  await page.evaluate(() => window.finishConfirmation());
  await page.waitForFunction(() => window.confirmationResult === true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("confirmations: failed actions unlock dismissal and explicit retry", async () => {
  const { page, context, errors } = await pendingConfirmationPage();
  const dialog = page.getByRole("dialog", { name: "Confirmer l’action ?" });
  await dialog.locator("[data-ok]").click();
  await page.evaluate(() => window.failConfirmation());
  await page.waitForFunction(() => document.querySelector("dialog[open] [data-error]")?.textContent.includes("Connexion interrompue"));
  assert.equal(await dialog.getAttribute("aria-busy"), "false");
  for (const selector of ["[data-ok]", "[data-cancel]", "[data-close]"]) assert.equal(await dialog.locator(selector).isDisabled(), false);
  assert.equal(await dialog.getByRole("status").innerText(), "");
  assert.equal(await dialog.locator("[data-ok]").evaluate(b => b === document.activeElement), true);
  await dialog.locator("[data-ok]").click();
  assert.equal(await page.evaluate(() => window.confirmationCalls), 2);
  assert.equal(await dialog.locator("[data-error]").innerText(), "");
  await page.evaluate(() => window.finishConfirmation());
  await page.waitForFunction(() => window.confirmationResult === true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("confirmations: destructive actions start on Cancel for keyboard users", async () => {
  const { page, context, errors } = await pendingConfirmationPage(360, true);
  assert.equal(await page.locator("dialog[open] [data-cancel]").evaluate(b => b === document.activeElement), true);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.confirmationResult === false);
  assert.equal(await page.evaluate(() => window.confirmationCalls), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("confirmations: account safety can still close a running dialog", async () => {
  const { page, context, errors } = await pendingConfirmationPage();
  await page.locator("dialog[open] [data-ok]").click();
  await page.evaluate(() => {
    window.closedConfirmation = document.querySelector("dialog[open]");
    window.closedConfirmation.close();
  });
  await page.waitForFunction(() => window.confirmationResult === false);
  await page.evaluate(() => {
    window.closedConfirmation.querySelector("[data-ok]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => window.confirmationCalls), 1);
  await page.evaluate(() => window.finishConfirmation());
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.evaluate(() => window.confirmationResult), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("confirmations: a failed action can be cancelled without another attempt", async () => {
  const { page, context, errors } = await pendingConfirmationPage();
  await page.locator("dialog[open] [data-ok]").click();
  await page.evaluate(() => window.failConfirmation());
  await page.waitForFunction(() => !document.querySelector("dialog[open] [data-ok]").disabled);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.confirmationResult === false);
  assert.equal(await page.evaluate(() => window.confirmationCalls), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("journal: changing account closes a pending archive confirmation", async () => {
  const { page, context, errors } = await journalSourcePage();
  await page.evaluate(() => {
    window.TitanSessions.archive = () => new Promise(resolve => { window.finishArchive = resolve; });
  });
  await page.locator("dialog[open] [data-toggle-archive]").click();
  await page.locator("dialog[open] [data-ok]").click();
  await page.waitForFunction(() => !!window.finishArchive);
  await page.evaluate(() => {
    window.state.user.id = "guest_new";
    window.dispatchEvent(new Event("titan:history-updated"));
  });
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.evaluate(() => window.finishArchive());
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("landing: one h1, the start call to action, no horizontal scroll", async () => {
  const { page, errors } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator('a.asc-btn-primary[href="/onboarding"]').first().isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
});

test("Titan+ prices: concrete capacities and worlds are readable on mobile and desktop", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await newPage(width);
    await page.goto(BASE + "/tarifs#concret", { waitUntil: "load" });
    assert.equal(await page.locator("#concret").count(), 1);
    for (const [kind, free] of [["routines", 5], ["coach", 3]]) {
      const meter = page.locator(`[data-benefit="${kind}"] .pub-benefit-meter`);
      assert.equal(await meter.locator("span").count(), 20);
      assert.equal(await meter.locator(".is-free").count(), free);
      assert.match(await meter.getAttribute("aria-label"), new RegExp(`${free}.*20`));
    }
    assert.equal(await page.locator('#concret a[href="/aventures-sportives#forge"]').count(), 1);
    assert.equal(await page.locator('#concret a[href="/aventures-sportives#aurores"]').count(), 1);
    assert.equal(await page.locator("#stats-free").isVisible(), true);
    assert.match(await page.locator("#stats-free").innerText(), /gratuites/);
    await page.getByText("TITAN+ ajoute-t-il des analyses sportives ?", { exact: true }).click();
    assert.match(await page.locator("details[open]").innerText(), /4, 12 ou 26 semaines/);
    const expiry = page.locator("details").filter({ has: page.getByText("Que se passe-t-il à la fin de TITAN+ ?", { exact: true }) });
    await expiry.locator("summary").click();
    assert.match(await expiry.innerText(), /pièces acquises avec tes crédits restent à toi/);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-offer-${width}.png`, fullPage: true, animations: "disabled" });
    await context.close();
  }
});

test("Atelier: both subscription states can consult the concrete benefits without a checkout", async () => {
  for (const plus of [false, true]) {
    const { page, context, errors } = await atelierPage(360, plus);
    const calls = await page.evaluate(() => window.atelierCalls.length);
    let checkoutCalls = 0;
    await page.exposeFunction("recordCheckoutCall", () => { checkoutCalls++; });
    await page.evaluate(() => { window.openEliteCheckout = window.recordCheckoutCall; });
    const link = page.locator('#plus a[href="/tarifs#concret"]');
    assert.equal(await link.count(), 1);
    await link.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/tarifs#concret");
    assert.equal(await page.locator("#concret").isVisible(), true);
    assert.equal(checkoutCalls, 0, "consulting benefits never calls the checkout entry point");
    // Check before returning: the active Atelier can clear a pending marker on reload.
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_checkout_started_v1")), null);
    assert.ok(calls > 0, "subscription state was loaded before navigating");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// Exercise the real logActivity and IndexedDB writer; only hold or refuse its storage boundary.
async function sessionSavePage({ width = 360 } = {}) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/seance.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/training?sport=running", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(() => {
    window.sessionCalls = [];
    window.sessionEvents = [];
    window.sessionAnalytics = [];
    const write = window.TitanQueue.saveGuestSession;
    window.TitanQueue.saveGuestSession = (ownerId, log) => new Promise((resolve, reject) => {
      const call = { ownerId, log: structuredClone(log), fail: reject };
      call.release = () => write(ownerId, log).then(resolve, reject);
      window.sessionCalls.push(call);
    });
    window.addEventListener("titan:session-stored", e => window.sessionEvents.push(e.detail));
    const track = window.TitanAnalytics.track;
    window.TitanAnalytics.track = (name, props) => {
      if (!["first_session", "second_session"].includes(name)) return track(name, props);
      window.sessionAnalytics.push({ name, props });
      return Promise.resolve(true);
    };
  });
  await page.addScriptTag({ path: ROOT + "/js/app/seance.js" });
  await page.locator('[data-act="save"]').waitFor();
  await page.locator('[data-k="distance"]').fill("10");
  await page.locator('[data-k="durM"]').fill("52");
  await page.locator('[data-k="note"]').fill("Repère de séance conservé");
  await page.locator('[data-rpe="6"]').click();
  return fixture;
}

async function releaseSession(page, index = 0) {
  await page.evaluate(index => window.sessionCalls[index].release(), index);
  await page.locator("dialog.asc-sheet[open]").waitFor();
}

async function holdSessionGpx(page) {
  await page.evaluate(() => {
    const input = document.querySelector("[data-gpx]");
    Object.defineProperty(input, "files", { configurable: true, value: [{ size: 100, text: () => new Promise((resolve, reject) => {
      window.releaseSessionGpx = () => resolve('<gpx><trk><trkseg><trkpt lat="47.00" lon="7.00"/><trkpt lat="47.01" lon="7.00"/></trkseg></trk></gpx>');
      window.failSessionGpx = () => reject(Error("Lecture du fichier interrompue"));
    }) }] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("session save: repeated activations create one durable record and one completion", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await page.evaluate(() => {
    const button = document.querySelector('[data-act="save"]');
    for (let i = 0; i < 3; i++) button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.evaluate(() => window.sessionCalls.length), 1);
  assert.equal(await page.locator("dialog.asc-sheet[open]").count(), 0, "no celebration before durable storage");
  await releaseSession(page);
  assert.equal(await page.evaluate(() => window.state.history.length), 1);
  assert.equal(await page.evaluate(async () => (await window.TitanQueue.readHistory(window.state.user.id)).length), 1);
  assert.equal(await page.evaluate(() => window.sessionEvents.length), 1);
  assert.deepEqual(await page.evaluate(() => window.sessionAnalytics.map(e => e.name)), ["first_session"]);
  assert.match(await page.locator("dialog.asc-sheet[open]").innerText(), /10 km/);
  await page.locator('[data-moment="done"]').click();
  await page.locator('#sport-q').fill("course");
  await page.locator('#sport-results [data-sport="running"]').click();
  await page.locator('[data-k="distance"]').fill("2");
  await page.locator('[data-act="save"]').click();
  await releaseSession(page, 1);
  assert.deepEqual(await page.evaluate(() => window.sessionAnalytics.map(e => e.name)), ["first_session", "second_session"]);
  assert.equal(await page.evaluate(async () => (await window.TitanQueue.readHistory(window.state.user.id)).length), 2);
  assert.deepEqual(errors, []);
});

test("session save: the chrono cannot rebuild an enabled save button while storage is pending", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await page.locator('[data-act="save"]').click();
  assert.equal(await page.locator('[data-act="chrono"]').isDisabled(), true);
  assert.equal(await page.locator('[data-act="back"]').isDisabled(), true);
  await page.evaluate(() => {
    for (const act of ["chrono", "back", "save"]) document.querySelector(`[data-act="${act}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  });
  assert.equal(await page.locator('[data-act="save"]').isDisabled(), true);
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "10");
  assert.equal(await page.evaluate(() => window.sessionCalls.length), 1);
  await releaseSession(page);
  assert.deepEqual(errors, []);
});

test("session save: pending fields and synthetic edits cannot change the submitted draft", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await page.locator('[data-act="save"]').click();
  for (const control of await page.locator('#seance input, #seance textarea, #seance select, #seance button').all()) assert.equal(await control.isDisabled(), true);
  await page.evaluate(() => {
    const input = document.querySelector('[data-k="distance"]');
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('[data-rpe="10"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    window.sessionCalls[0].fail(Error("Stockage temporairement indisponible"));
  });
  await page.locator('#seance-status').filter({ hasText: "Stockage temporairement" }).waitFor();
  await page.locator('[data-act="save"]').click();
  assert.equal(await page.evaluate(() => window.sessionCalls[1].log.val), 10);
  assert.equal(await page.evaluate(() => window.sessionCalls[1].log.details.bio.rpe), 6);
  assert.deepEqual(errors, []);
});

test("session save: pending status is visible outside busy controls on mobile and desktop", async t => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await sessionSavePage({ width });
    t.after(() => context.close());
    await page.locator('[data-act="save"]').click();
    assert.equal(await page.locator('.seance-form').getAttribute("aria-busy"), "true");
    const status = page.locator('#seance-status');
    assert.equal(await status.textContent(), "Enregistrement…");
    assert.equal(await status.evaluate(el => !!el.closest('[aria-busy="true"]')), false);
    const box = await status.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  }
});

test("session save: storage rejection retains the draft and timer and restores a focused retry", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await page.evaluate(() => {
    localStorage.setItem(`titan_seance_timer_v3:${window.state.user.id}`, JSON.stringify({ elapsed: 65000, started: null }));
    document.querySelector('[data-k="durS"]').disabled = true;
    document.querySelector('.seance-form').setAttribute("aria-busy", "false");
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(`titan_seance_draft_v3:${window.state.user.id}`) || "null")?.note === "Repère de séance conservé");
  await page.locator('[data-act="save"]').click();
  await page.evaluate(() => window.sessionCalls[0].fail(Error("Stockage temporairement indisponible")));
  await page.locator('#seance-status').filter({ hasText: "Stockage temporairement" }).waitFor();
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "10");
  assert.equal(await page.locator('[data-k="note"]').inputValue(), "Repère de séance conservé");
  assert.equal(await page.locator('[data-k="durS"]').isDisabled(), true, "preserve preexisting disabled state");
  assert.equal(await page.locator('.seance-form').getAttribute("aria-busy"), "false");
  assert.equal(await page.locator('[data-act="save"]').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(`titan_seance_timer_v3:${window.state.user.id}`)).elapsed), 65000);
  assert.equal(await page.evaluate(() => window.state.history.length), 0);
  assert.equal(await page.locator('dialog.asc-sheet[open]').count(), 0);
  await page.locator('[data-act="save"]').click();
  assert.equal(await page.locator('#seance-status').textContent(), "Enregistrement…");
  await releaseSession(page, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem(`titan_seance_draft_v3:${window.state.user.id}`)), null);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(`titan_seance_timer_v3:${window.state.user.id}`))), { elapsed: 0, started: null });
  assert.deepEqual(errors, []);
});

test("session save: a real IndexedDB transaction abort reports failure and retries once", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(`titan_seance_draft_v3:${window.state.user.id}`) || "null")?.note === "Repère de séance conservé");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      const tx = original.call(this, stores, mode, ...rest);
      if (mode === "readwrite" && Array.isArray(stores) && stores.includes("history")) {
        IDBDatabase.prototype.transaction = original;
        queueMicrotask(() => tx.abort());
      }
      return tx;
    };
  });
  await page.locator('[data-act="save"]').click();
  await page.evaluate(() => window.sessionCalls[0].release());
  await page.waitForFunction(() => !document.querySelector('[data-act="save"]').disabled);
  assert.equal(await page.locator('#seance-status').textContent(), "Séance non enregistrée.");
  assert.equal(await page.locator('#seance-status').getAttribute("data-kind"), "err");
  assert.equal(await page.locator('[data-act="save"]').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "10");
  assert.equal(await page.locator('[data-k="note"]').inputValue(), "Repère de séance conservé");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(`titan_seance_draft_v3:${window.state.user.id}`)).note), "Repère de séance conservé");
  assert.equal(await page.evaluate(() => window.state.history.length), 0);
  assert.equal(await page.evaluate(async () => (await window.TitanQueue.readHistory(window.state.user.id)).length), 0);
  assert.equal(await page.locator('dialog.asc-sheet[open]').count(), 0);
  assert.deepEqual(errors, []);
  await page.locator('[data-act="save"]').click();
  await releaseSession(page, 1);
  assert.equal(await page.evaluate(async () => (await window.TitanQueue.readHistory(window.state.user.id)).length), 1);
  assert.equal(await page.evaluate(() => window.sessionEvents.length), 1);
  assert.deepEqual(errors, []);
});

test("session save: the GPX upload label exposes and restores its disabled state", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await page.locator('.seance-gpx label').evaluate(el => el.setAttribute('aria-disabled', 'false'));
  await page.locator('[data-act="save"]').click();
  assert.equal(await page.locator('.seance-gpx label').getAttribute('aria-disabled'), 'true');
  await page.evaluate(() => window.sessionCalls[0].fail(Error('Stockage temporairement indisponible')));
  await page.locator('#seance-status').filter({ hasText: 'Stockage temporairement' }).waitFor();
  assert.equal(await page.locator('.seance-gpx label').getAttribute('aria-disabled'), 'false');
  assert.deepEqual(errors, []);
});

test("session save: a synchronous recording exception keeps the form usable", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await page.evaluate(() => { window.logActivity = () => { throw Error("Préparation locale indisponible"); }; });
  await page.locator('[data-act="save"]').click();
  await page.locator('#seance-status').filter({ hasText: "Préparation locale" }).waitFor();
  assert.equal(await page.locator('[data-act="save"]').isEnabled(), true);
  assert.equal(await page.locator('[data-act="save"]').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "10");
  assert.deepEqual(errors, []);
});

test("session save: a GPX read started before recording cannot replace the pending or retry draft", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await holdSessionGpx(page);
  await page.locator('[data-act="save"]').click();
  await page.evaluate(() => window.releaseSessionGpx());
  // The file read continuation has run before this page round trip.
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "10");
  assert.equal(await page.locator('[data-act="save"]').isDisabled(), true);
  await page.evaluate(() => window.sessionCalls[0].fail(Error("Stockage temporairement indisponible")));
  await page.locator('#seance-status').filter({ hasText: "Stockage temporairement" }).waitFor();
  await page.locator('[data-act="save"]').click();
  assert.equal(await page.evaluate(() => window.sessionCalls[1].log.val), 10);
  assert.deepEqual(errors, []);
});

test("session save: a refused GPX file read reports an error and retains editable measures", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await holdSessionGpx(page);
  await page.evaluate(() => window.failSessionGpx());
  await page.getByText("Lecture du fichier interrompue", { exact: true }).waitFor({ timeout: 2000 });
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "10");
  assert.equal(await page.locator('[data-act="save"]').isEnabled(), true);
  assert.deepEqual(errors, []);
});

test("session save: a newer GPX selection wins and its real measures can be recorded", async t => {
  const { page, context, errors } = await sessionSavePage();
  t.after(() => context.close());
  await holdSessionGpx(page);
  await page.evaluate(() => { window.oldSessionGpx = window.releaseSessionGpx; });
  await holdSessionGpx(page);
  await page.evaluate(() => window.releaseSessionGpx());
  await page.getByText(/Trace importée :/).waitFor();
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "1.11");
  await page.locator('[data-k="distance"]').fill("5");
  await page.evaluate(() => window.oldSessionGpx());
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "5");
  await page.locator('[data-act="save"]').click();
  assert.equal(await page.evaluate(() => window.sessionCalls[0].log.val), 5);
  assert.equal(await page.evaluate(() => window.sessionCalls[0].log.details.hasGpx), true);
  await releaseSession(page);
  assert.equal(await page.evaluate(async () => (await window.TitanQueue.readHistory(window.state.user.id)).length), 1);
  assert.deepEqual(errors, []);
});

test("guest: record a run, then find it in the journal and the week", async () => {
  const { page, errors } = await newPage();
  await page.goto(BASE + "/training", { waitUntil: "load" });
  await page.fill("#sport-q", "course");
  await page.click('#sport-results [data-sport="running"]');
  await page.fill('[data-k="distance"]', "10");
  await page.fill('[data-k="durM"]', "52");
  await page.click('[data-rpe="6"]');
  await page.click('[data-act="save"]');
  await page.waitForSelector("dialog.asc-sheet[open]", { timeout: 5000 });
  const moment = await page.locator("dialog.asc-sheet[open]").innerText();
  assert.match(moment, /10 km/);
  await page.goto(BASE + "/journal", { waitUntil: "load" });
  await page.waitForTimeout(500);
  assert.match(await page.locator("#journal").innerText(), /Course à pied/);
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  await page.waitForTimeout(500);
  assert.match(await page.locator(".wk-hero").innerText(), /52 min|1 jour actif/);
  assert.deepEqual(errors, []);
});

test("validation: a run without distance or duration is refused on the field", async () => {
  const { page } = await newPage();
  await page.goto(BASE + "/training?sport=running", { waitUntil: "load" });
  await page.waitForSelector('[data-act="save"]');
  await page.click('[data-act="save"]');
  await page.waitForTimeout(300);
  assert.ok((await page.locator('[aria-invalid="true"]').count()) >= 1);
});

const assistanceTopics = [
  ["bug", "Bug ou problème technique", "/journal"],
  ["compte", "Compte et connexion", "/login"],
  ["titanplus", "TITAN+ et remboursement", "/tarifs"],
  ["donnees", "Données et confidentialité", "/profile"],
  ["communaute", "Communauté et signalement", "/social"],
  ["autre", "Autre question", "/debuter-titan"],
];

const SUPPORT_USER = '00000000-0000-4000-8000-000000000047';
const SUPPORT_OTHER = '00000000-0000-4000-8000-000000000048';
const SUPPORT_REFERENCE = '00000000-0000-4000-8000-000000000049';
const SUPPORT_MESSAGE = 'Une demande volontaire avec <script> sans capture automatique.';
async function supportReportPage(t, { enabled = true, missing = false, invalid = false, width = 360, hold = false } = {}) {
  const f = await communityPage({ width }); t.after(() => f.context.close());
  f.calls = []; f.releases = []; f.hold = hold;
  f.response = { status: 200, body: { accepted: true, reference: SUPPORT_REFERENCE, notification: 'sent' } };
  await f.page.route('**/functions/assistance', async r => {
    f.calls.push({ body: r.request().postDataJSON(), headers: r.request().headers() });
    const result = f.hold ? await new Promise(resolve => f.releases.push(resolve)) : f.response;
    try { if (result.abort) await r.abort('failed'); else await r.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) }); } catch {}
  });
  await f.page.evaluate(({ enabled, id }) => {
    document.body.dataset.supportEnabled = String(enabled);
    const account = { id, email: 'report@example.test', email_confirmed_at: '2026-10-13T06:00:00Z', is_anonymous: false };
    window.supportSession = { user: account, access_token: 'fake-token-only-support-report-tests' };
    window.supportVerified = account; window.supportAuthCalls = []; window.supportAuthHold = []; window.reportUnsubscribed = 0; window.reportCaptures = 0;
    window.titanClient.auth.getSession = () => {
      const call = { name: 'getSession' }; window.supportAuthCalls.push(call);
      return Promise.resolve({ data: { session: window.supportSession } });
    };
    window.titanClient.auth.getUser = () => {
      const call = { name: 'getUser' }; window.supportAuthCalls.push(call);
      const result = { data: { user: window.supportVerified } };
      return window.supportAuthHold.includes('getUser') ? new Promise(resolve => { call.release = response => resolve(response || result); }) : Promise.resolve(result);
    };
    window.titanClient.auth.onAuthStateChange = callback => { window.supportAuthEvent = callback; return { data: { subscription: { unsubscribe() { window.reportUnsubscribed++; } } } }; };
    window.initTitanSupabaseClient = () => window.titanClient;
    if (window.TitanSupportDiagnostics) {
      const original = window.TitanSupportDiagnostics.capture;
      window.TitanSupportDiagnostics = { ...window.TitanSupportDiagnostics, capture(...args) { window.reportCaptures++; return original(...args); } };
    }
    window.communityHold = ['titan_social_overview']; window.communitySwitch(id);
  }, { enabled, id: SUPPORT_USER });
  await f.page.waitForFunction(() => window.communityCalls.some(c => c.owner === window.state.user.id && c.name === 'titan_social_overview'));
  const index = await f.page.evaluate(() => window.communityCalls.findLastIndex(c => c.name === 'titan_social_overview'));
  await releaseCommunity(f.page, index, invalid ? { data: { me: { id: SUPPORT_OTHER } } } : { error: { code: missing ? 'PGRST202' : 'PRIVATE_RAW_CODE', message: 'PRIVATE_RAW_ERROR token GPS' } });
  await f.page.waitForFunction(() => document.querySelector('#communaute').getAttribute('aria-busy') === 'false');
  return f;
}
async function openReport(f) {
  await f.page.locator('[data-support-report]').click({ timeout: 2500 });
  await f.page.locator('#support-message').waitFor({ timeout: 2500 });
}
test('support report: disabled deployment and expected missing RPC offer canonical help without a report', async t => {
  for (const options of [{ enabled: false }, { missing: true }]) {
    const f = await supportReportPage(t, options);
    assert.equal(await f.page.locator('#communaute a[href="/service#help-communaute"]').count(), 1);
    assert.equal(await f.page.locator('[data-support-report]').count(), 0); assert.equal(f.calls.length, 0);
    assert.equal(await f.page.locator('#help-form').count(), 0);
  }
});
test('support report: real error opens one verified voluntary form without diagnostics or POST', async t => {
  const f = await supportReportPage(t); const calls = await f.page.evaluate(() => window.communityCalls.length);
  await openReport(f);
  await f.page.evaluate(() => document.querySelector('[data-support-report]').click());
  assert.equal(await f.page.locator('dialog.help-report').count(), 1);
  assert.equal(await f.page.locator('#support-category').inputValue(), 'bug');
  assert.equal(await f.page.locator('#support-reply').isChecked(), false); assert.equal(await f.page.locator('#support-diagnostics').isChecked(), false);
  assert.equal(await f.page.evaluate(() => window.reportCaptures), 0); assert.equal(f.calls.length, 0);
  assert.equal(await f.page.evaluate(() => window.communityCalls.length), calls); assert.deepEqual(f.errors, []);
});
test('support report: consent captures only coarse diagnostics, preview is literal and uncheck removes them', async t => {
  const f = await supportReportPage(t, { invalid: true }); await openReport(f);
  await f.page.locator('#support-diagnostics').check();
  const d = await f.page.locator('[data-support-diagnostics-preview]').innerText();
  assert.match(d, /COMMUNITY_RESPONSE_INVALID/); assert.match(d, /Écran : Communauté/); assert.match(d, /Version : 300.0/); assert.match(d, /Module : 300.4/);
  assert.doesNotMatch(d, /PRIVATE|Mozilla|token|GPS|report@example|00000000/);
  assert.equal(await f.page.locator('#support-reply').isChecked(), false);
  await supportPreview(f.page); assert.match(await f.page.locator('[data-preview-message]').innerText(), /COMMUNITY_RESPONSE_INVALID/);
  assert.equal(await f.page.locator('#support-preview script').count(), 0);
  await f.page.getByRole('button', { name: 'Modifier', exact: true }).click(); await f.page.locator('#support-diagnostics').uncheck();
  await supportPreview(f.page); assert.equal(await f.page.locator('[data-preview-message]').innerText(), SUPPORT_MESSAGE);
  assert.equal(f.calls.length, 0); assert.equal(await f.page.evaluate(() => window.reportCaptures), 1);
});
test('support report: total Unicode limit includes optional diagnostics and never truncates', async t => {
  const f = await supportReportPage(t); await openReport(f); await f.page.locator('#support-diagnostics').check();
  await f.page.locator('#support-message').fill('a'.repeat(4000)); await f.page.getByRole('button', { name: 'Voir l’aperçu', exact: true }).click();
  assert.equal(await f.page.locator('#support-preview').count(), 0); assert.equal(await f.page.locator('#support-message').inputValue(), 'a'.repeat(4000));
  assert.match(await f.page.locator('.help-notice').innerText(), /4 000/); assert.equal(f.calls.length, 0);
});
test('support report: four-field contract, pending guard and stable frozen retry after uncertainty', async t => {
  const f = await supportReportPage(t, { hold: true }); await openReport(f); await f.page.locator('#support-diagnostics').check(); await supportPreview(f.page, { reply: true });
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await supportWaitCall(f);
  assert.equal(await f.page.locator('[data-report-close]').isDisabled(), true);
  await f.page.keyboard.press('Escape'); assert.equal(await f.page.locator('dialog.help-report[open]').count(), 1);
  await f.page.evaluate(() => { const d = document.querySelector('dialog.help-report'); d.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(await f.page.locator('dialog.help-report[open]').count(), 1);
  f.releases.shift()({ abort: true }); await f.page.getByRole('button', { name: 'Réessayer cette demande', exact: true }).waitFor();
  await f.page.keyboard.press('Escape'); assert.equal(await f.page.locator('dialog.help-report[open]').count(), 1);
  await f.page.evaluate(() => { window.GAME_SETTINGS.version = '999.9'; window.supportAuthEvent('TOKEN_REFRESHED', window.supportSession); });
  f.hold = false; await f.page.getByRole('button', { name: 'Réessayer cette demande', exact: true }).click(); await f.page.locator('#support-reference').waitFor();
  assert.deepEqual(f.calls[1].body, f.calls[0].body); assert.deepEqual(Object.keys(f.calls[0].body).sort(), ['category','message','reply_allowed','request_id']);
  assert.equal(f.calls[0].body.category, 'bug'); assert.equal(f.calls[0].body.reply_allowed, true); assert.match(f.calls[0].body.message, /Version : 300.0/);
  assert.doesNotMatch(f.calls[0].body.message, /PRIVATE|Mozilla|GPS|999.9/);
  await f.page.locator('[data-report-close]').click(); await f.page.waitForFunction(() => !document.querySelector('dialog.help-report'));
  assert.equal(await f.page.locator('[data-support-report]').evaluate(el => el === document.activeElement), true); assert.equal(await f.page.evaluate(() => window.reportUnsubscribed), 1);
});
test('support report: close before Auth completion disposes and reopening has one fresh subscription', async t => {
  const f = await supportReportPage(t); await f.page.evaluate(() => window.supportAuthHold = ['getUser']);
  await f.page.locator('[data-support-report]').click(); await f.page.waitForFunction(() => window.supportAuthCalls.some(c => c.name === 'getUser' && c.release));
  await f.page.locator('[data-report-close]').click(); await f.page.waitForFunction(() => !document.querySelector('dialog.help-report'));
  await f.page.evaluate(() => { window.supportAuthHold = []; for (const c of window.supportAuthCalls) c.release?.(); }); await openReport(f);
  assert.equal(await f.page.locator('#support-message').inputValue(), ''); assert.equal(await f.page.evaluate(() => window.reportUnsubscribed), 1);
  await supportPreview(f.page); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.locator('#support-reference').waitFor(); assert.equal(f.calls.length, 1);
});
test('support report: account transition during HTTP closes, purges and ignores a late receipt', async t => {
  const f = await supportReportPage(t, { hold: true }); await openReport(f); await f.page.locator('#support-diagnostics').check(); await supportPreview(f.page);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await supportWaitCall(f);
  await f.page.evaluate(id => window.communitySwitch(id, false), SUPPORT_OTHER);
  await f.page.waitForFunction(() => !document.querySelector('dialog.help-report'));
  f.releases.shift()(f.response); assert.equal(await f.page.locator('#support-reference').count(), 0); assert.equal(await f.page.evaluate(() => window.reportUnsubscribed), 1);
});
test('support report: silent SDK owner mismatch cannot mount a form or post', async t => {
  const f = await supportReportPage(t); await f.page.evaluate(id => { window.supportSession.user.id = id; window.supportVerified.id = id; }, SUPPORT_OTHER);
  await f.page.locator('[data-support-report]').click(); await f.page.waitForFunction(() => !document.querySelector('dialog.help-report'));
  assert.equal(f.calls.length, 0); assert.equal(await f.page.locator('#support-message').count(), 0);
});
test('support report: offline preserves an uncertain report and reconnect never submits it', async t => {
  const f = await supportReportPage(t); await openReport(f); await supportPreview(f.page); f.response = { abort: true };
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.getByRole('button', { name: 'Réessayer cette demande', exact: true }).waitFor();
  await f.context.setOffline(true); await f.page.waitForFunction(() => !navigator.onLine);
  assert.equal(await f.page.locator('dialog.help-report[open]').count(), 1); assert.equal(await f.page.locator('[data-report-close]').isDisabled(), true);
  await f.page.getByRole('button', { name: 'Réessayer cette demande', exact: true }).click(); assert.equal(f.calls.length, 1);
  await f.context.setOffline(false); await f.page.waitForFunction(() => navigator.onLine); await f.page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(f.calls.length, 1); assert.equal(await f.page.locator('dialog.help-report[open]').count(), 1);
});
test('support report: transition during pending Auth disposes and a late verified user cannot POST', async t => {
  const f = await supportReportPage(t); await openReport(f); await f.page.locator('#support-diagnostics').check(); await supportPreview(f.page);
  await f.page.evaluate(() => window.supportAuthHold = ['getUser']); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await f.page.waitForFunction(() => window.supportAuthCalls.some(c => c.release));
  await f.page.evaluate(id => { window.communitySwitch(id, false); for (const c of window.supportAuthCalls) c.release?.(); }, SUPPORT_OTHER);
  await f.page.waitForFunction(() => !document.querySelector('dialog.help-report')); assert.equal(f.calls.length, 0); assert.equal(await f.page.evaluate(() => window.reportUnsubscribed), 1);
});
test('support report: silent application identity change before confirmation purges instead of posting', async t => {
  const f = await supportReportPage(t); await openReport(f); await supportPreview(f.page);
  await f.page.evaluate(id => { window.state.user.id = id; document.querySelector('[data-support-send]').click(); }, SUPPORT_OTHER);
  await f.page.waitForFunction(() => !document.querySelector('dialog.help-report')); assert.equal(f.calls.length, 0);
});
test('support report: an anonymous verified response retains only the account fallback', async t => {
  const f = await supportReportPage(t); await f.page.evaluate(() => window.supportVerified.is_anonymous = true);
  await f.page.locator('[data-support-report]').click(); await f.page.waitForFunction(() => document.querySelector('#help-form')?.dataset.supportState === 'unavailable');
  assert.equal(await f.page.locator('#support-form').count(), 0); assert.equal(await f.page.locator('dialog.help-report a[href^="mailto:"]').count(), 1); assert.equal(f.calls.length, 0); assert.equal(await f.page.evaluate(() => window.reportCaptures), 0);
});
test('support report: keyboard preview and dismissal work without overflow on mobile and desktop', async t => {
  for (const width of [360,1280]) {
    const f = await supportReportPage(t, { width }); await f.page.locator('[data-support-report]').focus(); await f.page.keyboard.press('Enter'); await f.page.locator('#support-message').waitFor();
    await f.page.locator('#support-message').fill(SUPPORT_MESSAGE); await f.page.locator('#support-diagnostics').check();
    await f.page.getByRole('button', { name: 'Voir l’aperçu', exact: true }).focus(); await f.page.keyboard.press('Enter');
    assert.equal(await f.page.locator('#support-preview h3').evaluate(el => el === document.activeElement), true);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await f.page.screenshot({ path: `/tmp/titan-support-report-${width}.png`, fullPage: true });
    await f.page.keyboard.press('Escape'); await f.page.waitForFunction(() => !document.querySelector('dialog.help-report')); assert.equal(f.calls.length, 0); assert.deepEqual(f.errors, []);
  }
});
async function supportPage(t, { width = 360, enabled = true, user = {}, session = true, verified = null, hold = false, analyticsConsent = null, metricHold = false } = {}) {
  const fixture = await newPage(width), { page, context } = fixture;
  fixture.calls = []; fixture.releases = [];
  fixture.response = { status: 200, body: { accepted: true, reference: SUPPORT_REFERENCE, notification: 'sent' } };
  fixture.hold = hold;
  t.after(() => context.close());
  await page.route('**/service*', r => r.fulfill({ contentType: 'text/html', body: readFileSync(ROOT + '/dist/service.html', 'utf8').replace('data-support-enabled="false"', `data-support-enabled="${enabled}"`) }));
  await page.route('**/functions/assistance', async r => {
    fixture.calls.push({ body: r.request().postDataJSON(), headers: r.request().headers() });
    const result = fixture.hold ? await new Promise(resolve => fixture.releases.push(resolve)) : fixture.response;
    try { if (result.abort) await r.abort('failed'); else await r.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) }); } catch { /* Closed/aborted request has no late UI continuation. */ }
  });
  await page.addInitScript(({ id, user, session, verified, analyticsConsent, metricHold }) => {
    const account = { id, email: 'support-fixture@example.test', email_confirmed_at: '2026-10-12T05:00:00Z', is_anonymous: false, ...user };
    window.supportSession = session ? { user: account, access_token: 'fake-token-only-support-browser-tests' } : null;
    window.supportVerified = verified || account;
    window.supportAuthCalls = []; window.supportAuthHold = [];
    const subscriptions = new Set();
    window.supportMetrics = []; window.supportMetricReleases = []; window.supportMetricHold = metricHold;
    if (analyticsConsent) localStorage.setItem('titan_privacy_v1', JSON.stringify({ analytics: analyticsConsent }));
    window.TITAN_SUPABASE_URL = 'https://fixture.invalid'; window.TITAN_SUPABASE_ANON_KEY = 'fake-anon-key';
    window.supabase = { createClient(_url, _key, options) { return { from() { return { async insert(row) {
      // Reproduce the SDK's asynchronous token preparation and final guarded native boundary.
      if (window.supportMetricHold) await new Promise(resolve => window.supportMetricReleases.push(resolve));
      await options.accessToken();
      return options.global.fetch('/fixture-support-metric', { method: 'POST', body: JSON.stringify(row) });
    } }; } }; } };
    const nativeFetch = window.fetch;
    window.fetch = (url, options) => {
      if (url === '/fixture-support-metric') { window.supportMetrics.push(JSON.parse(options.body)); return Promise.resolve({ error: null }); }
      return nativeFetch(url, options);
    };
    window.supportAuthEvent = (event, session) => [...subscriptions].forEach(callback => callback(event, session));
    window.supportClient = { auth: {
      getSession() { const call = { name: 'getSession' }; window.supportAuthCalls.push(call); const result = { data: { session: window.supportSession }, error: null }; return window.supportAuthHold.includes('getSession') ? new Promise(resolve => { call.release = response => resolve(response || result); }) : Promise.resolve(result); },
      getUser(token) { const call = { name: 'getUser', token }; window.supportAuthCalls.push(call); const result = { data: { user: window.supportVerified }, error: null }; return window.supportAuthHold.includes('getUser') ? new Promise(resolve => { call.release = response => resolve(response || result); }) : Promise.resolve(result); },
      onAuthStateChange(callback) { subscriptions.add(callback); return { data: { subscription: { unsubscribe() { subscriptions.delete(callback); } } } }; }
    } };
    window.initTitanSupabaseClient = () => { window.titanClient = window.supportClient; return window.supportClient; };
  }, { id: SUPPORT_USER, user, session, verified, analyticsConsent, metricHold });
  await page.goto(BASE + '/service?private=PRIVATE_SUPPORT_URL', { waitUntil: 'load' });
  assert.equal(await page.locator('#help-form').count(), 1, 'the prepared support interface exists');
  if (enabled) await page.waitForFunction(() => ['editing', 'unavailable'].includes(document.querySelector('#help-form').dataset.supportState), { timeout: 2500 });
  return fixture;
}
test('support metrics: granted form openings, explicit category choice and confirmed result are minimal anonymous counters', async t => {
  const f = await supportPage(t, { analyticsConsent: 'granted' });
  await f.page.waitForFunction(() => window.supportMetrics.length === 1);
  await f.page.locator('#support-category').selectOption('titanplus'); await supportPreview(f.page);
  assert.equal(await f.page.evaluate(() => window.supportMetrics.length), 2);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.locator('#support-reference').waitFor();
  await f.page.waitForFunction(() => window.supportMetrics.length === 3);
  const rows = await f.page.evaluate(() => window.supportMetrics);
  assert.deepEqual(rows.map(r => r.event_name), ['support_opened','support_category_selected','support_submission_result']);
  assert.deepEqual(rows[2].metadata, { category:'titanplus',result:'received',consent:'granted',v:300 });
  for (const row of rows) { assert.equal(row.user_id,null); assert.equal(row.source,null); assert.equal(row.referrer,null); assert.equal(row.page,'/service'); }
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|<script>|support-fixture|00000000|diagnostic|request_id|reference/);
  assert.equal(f.calls.length,1); assert.deepEqual(f.errors,[]);
});
test('support metrics: unanswered and denied preferences never track or block the ticket', async t => {
  for (const analyticsConsent of [null,'denied']) { const f = await supportPage(t,{analyticsConsent}); await supportPreview(f.page);
    await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.locator('#support-reference').waitFor();
    assert.equal(await f.page.evaluate(() => window.supportMetrics.length),0); assert.equal(f.calls.length,1);
  }
});
test('support metrics: unresolved collection does not delay reference, navigation or submit controls', async t => {
  const f = await supportPage(t,{analyticsConsent:'granted',metricHold:true}); await supportPreview(f.page);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.locator('#support-reference').waitFor();
  assert.equal(await f.page.getByRole('button',{name:'Nouvelle demande',exact:true}).isEnabled(),true); assert.equal(await f.page.evaluate(() => window.supportMetrics.length),0);
  await f.page.getByRole('link',{name:'TITAN, accueil',exact:true}).click(); await f.page.waitForURL(BASE+'/'); assert.equal(f.calls.length,1);
});
test('support metrics: consent withdrawal during native preparation cancels counters without changing the ticket', async t => {
  const f = await supportPage(t,{analyticsConsent:'granted',metricHold:true}); await supportPreview(f.page);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.locator('#support-reference').waitFor();
  await f.page.evaluate(async () => { window.TitanAnalytics.setConsent(false); window.TitanAnalytics.setConsent(true); window.supportMetricHold=false; window.supportMetricReleases.forEach(r=>r()); await new Promise(requestAnimationFrame); });
  assert.equal(await f.page.evaluate(() => window.supportMetrics.length),0); assert.equal(f.calls.length,1);
});
test('support metrics: double confirm sends one outcome; uncertain explicit retry has separate attempt counters', async t => {
  const f = await supportPage(t,{analyticsConsent:'granted',hold:true}); await supportPreview(f.page);
  await f.page.evaluate(() => { const b=document.querySelector('[data-support-send]'); for(let i=0;i<3;i++)b.click(); }); await supportWaitCall(f);
  f.releases.shift()({abort:true}); await f.page.getByRole('button',{name:'Réessayer cette demande',exact:true}).waitFor();
  f.hold=false; await f.page.getByRole('button',{name:'Réessayer cette demande',exact:true}).click(); await f.page.locator('#support-reference').waitFor();
  await f.page.waitForFunction(() => window.supportMetrics.filter(r=>r.event_name==='support_submission_result').length===2);
  const results=await f.page.evaluate(() => window.supportMetrics.filter(r=>r.event_name==='support_submission_result').map(r=>r.metadata.result));
  assert.deepEqual(results,['uncertain','received']); assert.equal(f.calls.length,2); assert.deepEqual(f.calls[0].body,f.calls[1].body);
});
test('support metrics: disabled form keeps the public fallback without SDK or automatic collection', async t => {
  const f = await supportPage(t,{enabled:false,analyticsConsent:'granted'});
  assert.equal(await f.page.evaluate(() => window.supportMetrics.length),0); assert.equal(await f.page.evaluate(() => window.supportAuthCalls.length),0); assert.equal(f.calls.length,0);
});
test('support metrics: missing or throwing collector leaves receipt functional', async t => {
  for (const missing of [true,false]) {
    const f=await supportPage(t,{analyticsConsent:'granted'});
    await f.page.evaluate(missing=> { window.TitanAnalytics = missing ? null : {track(){throw Error('PRIVATE metric failure');}}; },missing);
    await supportPreview(f.page); await f.page.getByRole('button',{name:'Confirmer l’envoi',exact:true}).click(); await f.page.locator('#support-reference').waitFor();
    assert.equal(f.calls.length,1); assert.deepEqual(f.errors,[]);
  }
});
test('support metrics: account round trip cancels pending counters and never revives the old reference', async t => {
  const f=await supportPage(t,{analyticsConsent:'granted',metricHold:true}); await supportPreview(f.page);
  await f.page.getByRole('button',{name:'Confirmer l’envoi',exact:true}).click(); await f.page.locator('#support-reference').waitFor();
  await supportSwitch(f.page,SUPPORT_OTHER); await supportSwitch(f.page,SUPPORT_USER);
  await f.page.evaluate(async ()=>{window.supportMetricHold=false;window.supportMetricReleases.forEach(r=>r());await new Promise(requestAnimationFrame);});
  assert.equal(await f.page.evaluate(()=>window.supportMetrics.length),0); assert.equal(await f.page.locator('#support-reference').count(),0); assert.equal(f.calls.length,1);
});
test('support metrics: Community diagnostics stay exclusively in the voluntary ticket, never the metric', async t => {
  const f=await supportReportPage(t), rows=[];
  await f.page.route('**/rest/v1/analytics_events',r=>{rows.push(r.request().postDataJSON());return r.fulfill({status:201,contentType:'application/json',body:'[]'});});
  await f.page.evaluate(()=>window.TitanAnalytics.setConsent(true)); await openReport(f);
  await f.page.locator('#support-diagnostics').check(); await supportPreview(f.page,{reply:true});
  await f.page.getByRole('button',{name:'Confirmer l’envoi',exact:true}).click(); await f.page.locator('#support-reference').waitFor();
  for(let i=0;i<100&&rows.length<2;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.event_name),['support_opened','support_submission_result']);
  for(const row of rows){assert.equal(row.user_id,null);assert.equal(row.source,null);assert.equal(row.referrer,null);assert.equal(row.page,'/social');}
  assert.doesNotMatch(JSON.stringify(rows),/diagnostic|COMMUNITY|PRIVATE|00000000|report@example|Mozilla|reference|request_id|message/);
  assert.match(f.calls[0].body.message,/Diagnostics autorisés/);assert.equal(f.calls.length,1);assert.deepEqual(f.errors,[]);
});
async function supportPreview(page, { reply = false, message = SUPPORT_MESSAGE } = {}) {
  await page.locator('#support-message').fill(message);
  if (reply) await page.locator('#support-reply').check();
  await page.getByRole('button', { name: 'Voir l’aperçu', exact: true }).click();
  await page.getByRole('heading', { name: 'Aperçu de ta demande', exact: true }).waitFor();
}
async function supportWaitCall(fixture, n = 1) {
  for (let i = 0; i < 100; i++) { if (fixture.calls.length >= n) return; await new Promise(r => setTimeout(r, 20)); }
  throw Error('No support HTTP call');
}
async function supportSwitch(page, id = SUPPORT_OTHER, event = 'SIGNED_IN') {
  await page.evaluate(({ id, event }) => {
    const account = { id, email: 'next-support@example.test', email_confirmed_at: '2026-10-12T05:00:00Z', is_anonymous: false };
    window.supportAuthHold = [];
    window.supportSession = id ? { user: account, access_token: 'fake-token-for-next-support-account' } : null;
    window.supportVerified = account;
    window.supportAuthEvent(event, window.supportSession);
  }, { id, event });
}

test('support form: disabled activation keeps public mailto and makes no Auth or API call', async t => {
  const f = await supportPage(t, { enabled: false });
  assert.equal(await f.page.locator('form').count(), 0);
  assert.equal(await f.page.locator('a[href^="mailto:"]').count(), 7);
  assert.equal(await f.page.evaluate(() => window.supportAuthCalls.length), 0);
  assert.equal(f.calls.length, 0);
  assert.equal(await f.page.locator('script[src*="supabase"], script[src*="config.js"]').count(), 0);
  assert.deepEqual(f.errors, []);
});
test('support form: six categories retain solutions and open the matching editable form', async t => {
  const f = await supportPage(t);
  for (const [id, label, action] of assistanceTopics) {
    const topic = f.page.locator(`section[aria-labelledby="help-${id}"]`), button = topic.locator('[data-support-category]');
    assert.equal(await topic.locator(`a[href="${action}"]`).first().count(), 1);
    await button.click();
    assert.equal(await f.page.locator('#support-category').inputValue(), id);
    assert.equal(await f.page.locator('#support-category option:checked').textContent(), label);
    assert.equal(await f.page.locator('#support-message').evaluate(el => el === document.activeElement), true);
  }
  await f.page.locator('#support-message').fill(SUPPORT_MESSAGE); await f.page.locator('#support-reply').check();
  await f.page.locator('[data-support-category="bug"]').click();
  assert.equal(await f.page.locator('#support-message').inputValue(), SUPPORT_MESSAGE); assert.equal(await f.page.locator('#support-reply').isChecked(), true);
  assert.equal(f.calls.length, 0); assert.deepEqual(f.errors, []);
});
test('support form: preview and optional reply are voluntary, readable and never transmit', async t => {
  for (const width of [360, 1280]) {
    const f = await supportPage(t, { width });
    assert.equal(await f.page.locator('#support-reply').isChecked(), false);
    await supportPreview(f.page, { reply: true });
    assert.ok((await f.page.locator('#support-preview').innerText()).includes(SUPPORT_MESSAGE));
    assert.ok((await f.page.locator('#support-preview').innerText()).includes('support-fixture@example.test'));
    assert.equal(await f.page.locator('#support-preview script').count(), 0);
    assert.equal(f.calls.length, 0);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await f.page.getByRole('button', { name: 'Modifier', exact: true }).click();
    assert.equal(await f.page.locator('#support-message').inputValue(), SUPPORT_MESSAGE);
    assert.equal(await f.page.locator('#support-reply').isChecked(), true);
    assert.deepEqual(f.errors, []);
  }
});
test('support form: confirmed receipt shows a reference, sends only the four fields and permits a new request', async t => {
  const f = await supportPage(t); await supportPreview(f.page);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor();
  assert.equal(await f.page.locator('#support-reference').textContent(), SUPPORT_REFERENCE);
  assert.match(await f.page.locator('#support-result').innerText(), /alerte.*acceptée/i);
  assert.equal(f.calls.length, 1);
  const call = f.calls[0]; assert.deepEqual(Object.keys(call.body).sort(), ['category', 'message', 'reply_allowed', 'request_id']);
  assert.equal(call.body.message, SUPPORT_MESSAGE); assert.equal(call.body.reply_allowed, false);
  assert.match(call.body.request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(call.headers.authorization, 'Bearer fake-token-only-support-browser-tests');
  assert.equal(call.headers.referer, undefined);
  assert.doesNotMatch(JSON.stringify(call.body), /PRIVATE_SUPPORT_URL|support-fixture@example|fake-token/);
  await f.page.getByRole('button', { name: 'Nouvelle demande', exact: true }).click();
  assert.equal(await f.page.locator('#support-message').inputValue(), ''); assert.deepEqual(f.errors, []);
});
test('support form: pending notification retries the same received request and reference', async t => {
  const f = await supportPage(t); f.response = { status: 202, body: { accepted: true, reference: SUPPORT_REFERENCE, notification: 'pending' } };
  await supportPreview(f.page, { reply: true }); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor();
  assert.match(await f.page.locator('#support-result').innerText(), /attente/);
  f.response = { status: 200, body: { accepted: true, reference: SUPPORT_REFERENCE, notification: 'sent' } };
  await f.page.getByRole('button', { name: 'Vérifier à nouveau cette demande', exact: true }).click();
  await supportWaitCall(f, 2); await f.page.waitForFunction(() => document.querySelector('#help-form').dataset.supportState === 'received');
  assert.deepEqual(f.calls[1].body, f.calls[0].body); assert.equal(await f.page.locator('#support-reference').textContent(), SUPPORT_REFERENCE); assert.deepEqual(f.errors, []);
});
test('support form: repeated confirmations stay locked during Auth, HTTP and same-owner token refresh', async t => {
  const f = await supportPage(t, { hold: true }); await supportPreview(f.page);
  await f.page.evaluate(() => { window.supportAuthCalls = []; window.supportAuthHold = ['getSession']; const b = document.querySelector('[data-support-send]'); for (let i = 0; i < 3; i++) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await f.page.waitForFunction(() => window.supportAuthCalls.length === 1);
  assert.equal(f.calls.length, 0); assert.equal(await f.page.locator('#support-form').getAttribute('aria-busy'), 'true');
  assert.equal(await f.page.locator('#support-message').isDisabled(), true);
  await f.page.getByRole('status').filter({ hasText: 'Envoi en cours' }).waitFor();
  await f.page.evaluate(() => { window.supportAuthHold = []; window.supportAuthCalls[0].release(); window.supportAuthEvent('TOKEN_REFRESHED', window.supportSession); });
  await supportWaitCall(f); await f.page.evaluate(() => document.querySelector('[data-support-send]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(f.calls.length, 1); assert.equal(await f.page.locator('#support-form').getAttribute('aria-busy'), 'true');
  f.releases[0](f.response); await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor(); assert.deepEqual(f.errors, []);
});
test('support form: uncertain HTTP receipt freezes its content and explicit retry uses the same UUID', async t => {
  const f = await supportPage(t); f.response = { abort: true }; await supportPreview(f.page);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await f.page.getByRole('alert').filter({ hasText: 'Impossible de confirmer' }).waitFor();
  assert.equal(await f.page.locator('#support-message').isDisabled(), true);
  assert.equal(await f.page.getByRole('button', { name: 'Modifier', exact: true }).isVisible(), false);
  assert.equal(await f.page.getByRole('button', { name: 'Nouvelle demande', exact: true }).count(), 0);
  f.response = { status: 200, body: { accepted: true, reference: SUPPORT_REFERENCE, notification: 'sent' } };
  await f.page.getByRole('button', { name: 'Réessayer cette demande', exact: true }).click();
  await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor();
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1].body, f.calls[0].body); assert.deepEqual(f.errors, []);
});
test('support form: failure after a pending receipt never removes the confirmed reference', async t => {
  const f = await supportPage(t); f.response = { status: 202, body: { accepted: true, reference: SUPPORT_REFERENCE, notification: 'pending' } };
  await supportPreview(f.page); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor();
  f.response = { status: 503, body: { error: 'unavailable', uncertain: true } };
  await f.page.getByRole('button', { name: 'Vérifier à nouveau cette demande', exact: true }).click();
  await f.page.getByRole('alert').filter({ hasText: 'déjà été reçue' }).waitFor();
  assert.equal(await f.page.locator('#support-reference').textContent(), SUPPORT_REFERENCE); assert.equal(f.calls.length, 2); assert.deepEqual(f.errors, []);
  f.response = { status: 200, body: { accepted: true, reference: SUPPORT_OTHER, notification: 'sent' } };
  await f.page.getByRole('button', { name: 'Vérifier à nouveau cette demande', exact: true }).click();
  await supportWaitCall(f, 3); await f.page.waitForFunction(() => document.querySelector('#help-form').dataset.supportState === 'received');
  assert.equal(await f.page.locator('#support-reference').textContent(), SUPPORT_REFERENCE); assert.deepEqual(f.calls[2].body, f.calls[0].body);
});
test('support form: bounded rejection errors disclose no upstream details or invented reference', async t => {
  for (const status of [400, 401, 403, 429]) {
    const f = await supportPage(t); f.response = { status, body: { error: 'PRIVATE_UPSTREAM', details: 'PRIVATE_UPSTREAM' } };
    await supportPreview(f.page); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
    await f.page.getByRole('alert').waitFor();
    assert.equal(await f.page.locator('#support-reference').count(), 0); assert.doesNotMatch(await f.page.locator('#help-form').innerText(), /PRIVATE_UPSTREAM/); assert.deepEqual(f.errors, []);
  }
});
test('support form: malformed receipts including coerced UUIDs never announce receipt or reflect data', async t => {
  for (const body of [{ accepted: true, reference: [SUPPORT_REFERENCE], notification: 'sent' }, { accepted: true, reference: SUPPORT_REFERENCE, notification: 'unknown' }, { accepted: false, reference: SUPPORT_REFERENCE, notification: 'sent', content: '<img onerror=alert(1)>' }]) {
    const f = await supportPage(t); f.response = { status: 200, body }; await supportPreview(f.page);
    await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.getByRole('alert').filter({ hasText: 'Impossible de confirmer' }).waitFor();
    assert.equal(await f.page.locator('#support-reference').count(), 0); assert.equal(await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).count(), 0); assert.deepEqual(f.errors, []);
  }
});
test('support form: unauthenticated, anonymous, unconfirmed, malformed or mismatched identities get only fallback', async t => {
  for (const options of [{ session: false }, { user: { is_anonymous: true } }, { user: { email_confirmed_at: null } }, { user: { id: [SUPPORT_USER] } }, { verified: { id: SUPPORT_OTHER, email: 'other@example.test', email_confirmed_at: 'yes', is_anonymous: false } }]) {
    const f = await supportPage(t, options); assert.equal(await f.page.locator('form').count(), 0); assert.equal(f.calls.length, 0);
    assert.equal(await f.page.locator('a[href="mailto:titanteam.app@gmail.com"]').count(), 1); assert.deepEqual(f.errors, []);
  }
});
test('support form: account change while Auth is pending clears the draft and prevents the old POST', async t => {
  const f = await supportPage(t); await supportPreview(f.page, { reply: true });
  await f.page.evaluate(() => { window.supportAuthCalls = []; window.supportAuthHold = ['getSession']; });
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.waitForFunction(() => window.supportAuthCalls.length === 1);
  await supportSwitch(f.page); await f.page.locator('#support-message').waitFor();
  await f.page.evaluate(() => window.supportAuthCalls[0].release());
  assert.equal(await f.page.locator('#support-message').inputValue(), ''); assert.equal(await f.page.locator('#support-reply').isChecked(), false);
  assert.equal(f.calls.length, 0); assert.doesNotMatch(await f.page.locator('#help-form').innerText(), /support-fixture@example|Une demande volontaire/); assert.deepEqual(f.errors, []);
});
test('support form: account change during HTTP ignores the previous receipt and unlocks only the new blank form', async t => {
  const f = await supportPage(t, { hold: true }); await supportPreview(f.page); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await supportWaitCall(f);
  await supportSwitch(f.page); await f.page.locator('#support-message').waitFor(); f.releases[0](f.response);
  await f.page.evaluate(() => new Promise(requestAnimationFrame)); assert.equal(await f.page.locator('#support-reference').count(), 0); assert.equal(await f.page.locator('#support-message').inputValue(), '');
  assert.equal(await f.page.locator('#support-message').isDisabled(), false); assert.equal(f.calls.length, 1); assert.deepEqual(f.errors, []);
});
test('support form: offline prevents a POST, retains the draft and going online never sends automatically', async t => {
  const f = await supportPage(t); await supportPreview(f.page); await f.context.setOffline(true);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.getByRole('alert').filter({ hasText: 'Hors ligne' }).waitFor();
  assert.equal(f.calls.length, 0); await f.context.setOffline(false); await f.page.evaluate(() => new Promise(requestAnimationFrame)); assert.equal(f.calls.length, 0);
  await f.page.getByRole('button', { name: 'Modifier', exact: true }).click(); assert.equal(await f.page.locator('#support-message').inputValue(), SUPPORT_MESSAGE); assert.deepEqual(f.errors, []);
});
test('support form: Unicode limits and controls are validated; preview renders markup as text', async t => {
  const f = await supportPage(t);
  for (const message of ['court', ' '.repeat(20), 'a'.repeat(4001), 'private\u0085value']) {
    await f.page.locator('#support-message').fill(message); await f.page.getByRole('button', { name: 'Voir l’aperçu', exact: true }).click(); await f.page.getByRole('alert').waitFor();
    assert.equal(await f.page.locator('#support-preview').count(), 0);
  }
  await supportPreview(f.page, { message: '🏃'.repeat(4000) }); assert.equal(f.calls.length, 0);
  await f.page.getByRole('button', { name: 'Modifier', exact: true }).click(); await supportPreview(f.page, { message: '<img src=x onerror="window.privateLeak=true"> demande volontaire' });
  assert.equal(await f.page.locator('#support-preview img').count(), 0); assert.equal(await f.page.evaluate(() => window.privateLeak), undefined); assert.deepEqual(f.errors, []);
});
test('support form: uncertain receipt warns on leaving and BFCache does not restore private content', async t => {
  const f = await supportPage(t); f.response = { abort: true }; await supportPreview(f.page); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await f.page.getByRole('alert').filter({ hasText: 'Impossible de confirmer' }).waitFor();
  assert.equal(await f.page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), true);
  await f.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  assert.doesNotMatch(await f.page.locator('#help-form').innerText(), /Une demande volontaire|support-fixture@example/);
  await f.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await f.page.locator('#support-message').waitFor();
  assert.equal(await f.page.locator('#support-message').inputValue(), ''); assert.equal(f.calls.length, 1); assert.deepEqual(f.errors, []);
});
test('support form: controls work by keyboard with focus returned from preview and stable layout', async t => {
  const f = await supportPage(t); await f.page.locator('#support-message').fill(SUPPORT_MESSAGE);
  await f.page.getByRole('button', { name: 'Voir l’aperçu', exact: true }).focus(); await f.page.keyboard.press('Enter');
  await f.page.getByRole('heading', { name: 'Aperçu de ta demande', exact: true }).waitFor();
  assert.equal(await f.page.locator('#support-preview h3').evaluate(el => el === document.activeElement), true);
  await f.page.getByRole('button', { name: 'Modifier', exact: true }).focus(); await f.page.keyboard.press('Enter');
  assert.equal(await f.page.locator('#support-message').evaluate(el => el === document.activeElement), true); assert.deepEqual(f.errors, []);
});
test('support form: HTTP deadline is uncertain and keeps the key for a later explicit retry', async t => {
  const f = await supportPage(t, { hold: true }); await supportPreview(f.page);
  await f.page.evaluate(() => { const timer = window.setTimeout; window.setTimeout = (fn, ms, ...args) => timer(fn, ms === 45000 ? 50 : ms, ...args); });
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await supportWaitCall(f);
  await f.page.getByRole('alert').filter({ hasText: 'Impossible de confirmer' }).waitFor();
  assert.equal(await f.page.locator('#support-message').isDisabled(), true); assert.equal(f.calls.length, 1); f.releases[0](f.response); assert.deepEqual(f.errors, []);
});
test('support form: a silent session switch is detected before POST and before receipt rendering', async t => {
  const f = await supportPage(t, { hold: true }); await supportPreview(f.page); await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await supportWaitCall(f);
  await f.page.evaluate(id => { window.supportSession.user = { ...window.supportSession.user, id }; window.supportVerified = window.supportSession.user; }, SUPPORT_OTHER);
  f.releases[0](f.response); await f.page.locator('#support-message').waitFor();
  assert.equal(await f.page.locator('#support-reference').count(), 0); assert.equal(await f.page.locator('#support-message').inputValue(), ''); assert.deepEqual(f.errors, []);
});
test('support form: the real local Supabase SDK reads shared session storage and verifies Auth over HTTP', async t => {
  const f = await newPage(), { page, context } = f; t.after(() => context.close());
  const now = Math.floor(Date.now() / 1000), account = { id: SUPPORT_USER, email: 'sdk-support@example.test', email_confirmed_at: '2026-10-12T05:00:00Z', is_anonymous: false, app_metadata: {}, user_metadata: {}, aud: 'authenticated' };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: SUPPORT_USER, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600 })).toString('base64url'), 'synthetic-signature'].join('.');
  const authCalls = [], apiCalls = [];
  await page.route('**/service*', r => r.fulfill({ contentType: 'text/html', body: readFileSync(ROOT + '/dist/service.html', 'utf8').replace('data-support-enabled="false"', 'data-support-enabled="true"') }));
  await page.route('https://oubmftfufwwzwpgvrcag.supabase.co/auth/v1/user', r => { authCalls.push(r.request().headers().authorization); return r.fulfill({ contentType: 'application/json', body: JSON.stringify(account) }); });
  await page.route('**/functions/assistance', r => { apiCalls.push({ body: r.request().postDataJSON(), token: r.request().headers().authorization }); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ accepted: true, reference: SUPPORT_REFERENCE, notification: 'sent' }) }); });
  await page.addInitScript(({ account, token, expires }) => localStorage.setItem('titan_supabase_auth_v1', JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expires, user: account })), { account, token, expires: now + 3600 });
  await page.goto(BASE + '/service', { waitUntil: 'load' }); assert.equal(await page.locator('#help-form').count(), 1);
  await page.locator('#support-message').waitFor({ timeout: 5000 }); await supportPreview(page); await page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor();
  assert.ok(authCalls.length >= 2); assert.ok(authCalls.every(value => value === `Bearer ${token}`)); assert.equal(apiCalls.length, 1); assert.equal(apiCalls[0].token, `Bearer ${token}`);
  assert.equal(await page.locator('script[src*="supabase-2.111.0"]').count(), 1); assert.equal(await page.locator('script[src*="config.js"]').count(), 1); assert.deepEqual(f.errors, []);
});
test('support form: an old HTTP timeout cannot abort a new account request during late Auth completion', async t => {
  const f = await supportPage(t, { hold: true }); await supportPreview(f.page);
  await f.page.evaluate(() => { window.supportTimers = []; const timer = window.setTimeout; window.setTimeout = (fn, ms, ...args) => { if (ms === 45000) { window.supportTimers.push(fn); return timer(() => {}, 90000); } return timer(fn, ms, ...args); }; });
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await supportWaitCall(f);
  await f.page.evaluate(() => { window.supportAuthHold = ['getSession']; }); f.releases[0](f.response);
  await f.page.waitForFunction(() => typeof window.supportAuthCalls.at(-1)?.release === 'function');
  await f.page.evaluate(() => { window.supportOldAuthRelease = window.supportAuthCalls.at(-1).release; });
  await supportSwitch(f.page); await f.page.locator('#support-message').waitFor(); await supportPreview(f.page);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await supportWaitCall(f, 2);
  await f.page.evaluate(() => { window.supportTimers[0](); }); await f.page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await f.page.locator('#help-form').getAttribute('data-support-state'), 'sending');
  await f.page.evaluate(() => window.supportOldAuthRelease()); assert.equal(await f.page.locator('#support-form').getAttribute('aria-busy'), 'true');
  f.releases[1](f.response); await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor(); assert.deepEqual(f.errors, []);
});
test('support form: Auth deadline before HTTP keeps a modifiable draft and never posts', async t => {
  const f = await supportPage(t); await supportPreview(f.page);
  await f.page.evaluate(() => { window.supportAuthHold = ['getUser']; const timer = window.setTimeout; window.setTimeout = (fn, ms, ...args) => timer(fn, ms === 8000 ? 30 : ms, ...args); });
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click(); await f.page.getByRole('alert').filter({ hasText: 'Impossible de vérifier' }).waitFor();
  assert.equal(f.calls.length, 0); await f.page.getByRole('button', { name: 'Modifier', exact: true }).click(); assert.equal(await f.page.locator('#support-message').inputValue(), SUPPORT_MESSAGE);
  assert.deepEqual(f.errors, []);
});
for (const status of [400, 401, 403, 429]) test(`support form: historical uncertainty keeps its UUID after retry rejection ${status}`, async t => {
  const f = await supportPage(t); f.response = { abort: true }; await supportPreview(f.page);
  await f.page.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await f.page.getByRole('alert').filter({ hasText: 'Impossible de confirmer' }).waitFor();
  f.response = { status, body: { error: 'rejected' } };
  await f.page.getByRole('button', { name: 'Réessayer cette demande', exact: true }).click(); await supportWaitCall(f, 2);
  await f.page.waitForFunction(() => document.querySelector('#help-form').dataset.supportState !== 'sending');
  assert.equal(await f.page.locator('#help-form').getAttribute('data-support-state'), 'uncertain');
  assert.equal(await f.page.getByRole('button', { name: 'Modifier', exact: true }).isVisible(), false);
  assert.equal(await f.page.locator('#support-message').isDisabled(), true);
  f.response = { status: 200, body: { accepted: true, reference: SUPPORT_REFERENCE, notification: 'sent' } };
  await f.page.getByRole('button', { name: 'Réessayer cette demande', exact: true }).click();
  await f.page.getByRole('heading', { name: 'Demande reçue', exact: true }).waitFor();
  assert.equal(f.calls.length, 3); assert.deepEqual(f.calls[1].body, f.calls[0].body); assert.deepEqual(f.calls[2].body, f.calls[0].body); assert.deepEqual(f.errors, []);
});

// Assistance navigation labels: keep the shared route and contextual hints.
test("assistance labels: sidebar and Plus expose Assistance and keep navigation context", async t => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await newPage(width); t.after(() => context.close());
    await page.goto(BASE + "/aujourdhui", { waitUntil: "load" });
    const rail = page.locator('.asc-rail');
    const assistance = rail.getByRole('link', { name: 'Assistance', exact: true, includeHidden: true });
    assert.equal(await assistance.count(), 1);
    assert.equal(await assistance.getAttribute('href'), '/service');
    assert.equal(await rail.locator('a[aria-current="page"]').getAttribute('href'), '/aujourdhui');
    assert.deepEqual(await rail.locator('.asc-rail-sub a').evaluateAll(links => links.map(link => [link.textContent.trim(), link.getAttribute('href')])), [
      ['Communauté', '/social'], ['Coaching', '/coaching'], ['Atelier', '/boutique'], ['Assistance', '/service'],
    ]);
    if (width === 1280) {
      assert.equal(await assistance.isVisible(), true);
      await assistance.focus(); await page.keyboard.press('Enter');
    } else {
      const more = page.getByRole('button', { name: 'Plus : Communauté, Coaching, Atelier, Assistance', exact: true });
      await more.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Plus', exact: true });
      const menu = dialog.getByRole('navigation', { name: 'Plus', exact: true });
      assert.deepEqual(await menu.locator('.asc-row-sub').allTextContents(), [
        'Expéditions, amis, défis, guilde', 'Partager tes séances avec un coach, sous ton contrôle', 'Personnalisation et TITAN+', 'Questions, contact, signaler un problème',
      ]);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      assert.equal(await more.evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Enter');
      const link = page.getByRole('dialog', { name: 'Plus', exact: true }).getByRole('link', { name: 'Assistance Questions, contact, signaler un problème', exact: true });
      assert.equal(await link.getAttribute('href'), '/service');
      await link.focus(); await page.keyboard.press('Enter');
    }
    await page.waitForURL(BASE + '/service');
    assert.equal(new URL(page.url()).pathname, '/service');
    assert.equal(await page.getByRole('heading', { name: 'Assistance', exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // The public service page has no app shell. Exercise the preserved secondary
    // territory identity through the existing shell refresh API on an app page.
    await page.goto(BASE + '/aujourdhui', { waitUntil: 'load' });
    await page.evaluate(() => { document.body.dataset.territory = 'aide'; window.titanShell.refresh(); });
    await page.waitForFunction(() => document.querySelector('.asc-rail a[href="/service"]')?.getAttribute('aria-current') === 'page');
    assert.equal(await page.locator('[data-shell-more]').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.asc-tabbar [aria-current="page"]').count(), 0);
    if (width === 360) {
      await page.locator('[data-shell-more]').click();
      const link = page.getByRole('dialog', { name: 'Plus', exact: true }).locator('a[href="/service"]');
      assert.equal(await link.getAttribute('aria-current'), 'page');
      assert.equal(await link.locator('.asc-row-title').textContent(), 'Assistance');
    }
    assert.deepEqual(errors, []);
  }
});

test("assistance labels: public footers and authentication links share the destination name", async t => {
  const paths = readdirSync(ROOT).filter(name => name.endsWith('.html') && name !== 'dynamic-page.html' && /<a\b[^>]*href="\/service"/.test(readFileSync(ROOT + '/' + name, 'utf8')));
  const { page, context, errors } = await newPage(360); t.after(() => context.close());
  for (const filename of paths) {
    await page.goto(BASE + '/' + filename.replace(/\.html$/, ''), { waitUntil: 'load' });
    const links = page.locator('a[href="/service"]');
    assert.ok(await links.count() > 0, filename);
    for (const link of await links.all()) assert.equal((await link.textContent()).trim(), 'Assistance', filename);
  }
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: width === 360 ? 844 : 900 });
    for (const path of ['/login', '/update-password', '/']) {
      await page.goto(BASE + path, { waitUntil: 'load' });
      const navigation = page.locator(path === '/' ? '.pub-footer' : '.auth-legal');
      const link = navigation.getByRole('link', { name: 'Assistance', exact: true });
      assert.equal(await link.getAttribute('href'), '/service');
      await link.focus(); await page.keyboard.press('Enter');
      await page.waitForURL(BASE + '/service');
      assert.equal(new URL(page.url()).pathname, '/service');
      assert.equal(await page.getByRole('heading', { name: 'Assistance', exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
  }
  assert.deepEqual(errors, []);
});

test("assistance labels: every shell consumer bypasses the previous cached label on first visit", async t => {
  const context = await browser.newContext({ viewport: { width: 360, height: 844 }, serviceWorkers: 'allow' });
  t.after(() => context.close());
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort('internetdisconnected'));
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/aujourdhui', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('titan_sw_dev', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const shell = await (await fetch(BASE + '/js/app/shell.js')).text();
  await page.evaluate(async shell => {
    const cache = await caches.open('titan-os-v300-ascension');
    const stale = shell.replaceAll('Assistance', 'Aide') + '\nwindow.titanPreviousAssistanceShell = true;';
    for (const version of ['300.0', '300.2', '300.3']) await cache.put('/js/app/shell.js?v=' + version, new Response(stale, { headers: { 'content-type': 'text/javascript' } }));
  }, shell);
  const consumers = readdirSync(ROOT).filter(name => name.endsWith('.html') && /src="\/js\/app\/shell\.js\?/.test(readFileSync(ROOT + '/' + name, 'utf8')));
  assert.equal(consumers.length, 14, 'all current shell consumers are exercised');
  for (const filename of consumers) {
    const path = '/' + filename.replace(/\.html$/, '') + (filename === 'onboarding.html' ? '?again=1' : '');
    await page.goto(BASE + path, { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => Boolean(window.titanPreviousAssistanceShell)), false, filename + ': first visit loads the current Assistance shell');
    if (await page.locator('.asc-rail').count()) assert.equal(await page.locator('.asc-rail').getByRole('link', { name: 'Assistance', exact: true, includeHidden: true }).count(), 1, filename);
  }
  assert.deepEqual(errors, []);
});

test("assistance: Profile gives a direct visible entry on mobile and desktop", async t => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await newPage(width); t.after(() => context.close());
    await page.goto(BASE + "/profile", { waitUntil: "load" });
    const link = page.locator('.asc-page-head').getByRole("link", { name: "Assistance", exact: true });
    assert.equal(await link.count(), 1);
    assert.equal(await link.isVisible(), true);
    const box = await link.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height);
    await link.click();
    assert.equal(new URL(page.url()).pathname, "/service");
    assert.equal(await page.getByRole("heading", { name: "Assistance", exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  }
});

test("assistance: category anchors offer an existing action before the email fallback", async t => {
  const { page, context, errors } = await newPage(360); t.after(() => context.close());
  for (const [id, label, action] of assistanceTopics) {
    await page.goto(BASE + "/service", { waitUntil: "load" });
    const index = page.getByRole("navigation", { name: "Choisir une catégorie" });
    assert.equal(await index.locator('a').count(), 6);
    await index.locator(`a[href="#help-${id}"]`).click();
    const heading = page.locator(`#help-${id}`);
    assert.equal(await heading.textContent(), label);
    const box = await heading.boundingBox(), header = await page.locator('.pub-header').boundingBox();
    assert.ok(box.y >= header.y + header.height - 1, "anchor heading stays below the sticky header");
    const topic = page.locator(`section[aria-labelledby="help-${id}"]`);
    const solution = topic.locator(`a[href="${action}"]`).first();
    assert.equal(await solution.count(), 1);
    const email = topic.locator('a[href^="mailto:"]');
    assert.equal(await email.count(), 1);
    assert.equal(await solution.evaluate((el, id) => Boolean(el.compareDocumentPosition(document.querySelector(`section[aria-labelledby="help-${id}"] a[href^="mailto:"]`)) & Node.DOCUMENT_POSITION_FOLLOWING), id), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
});

test("assistance: all nine existing FAQ answers remain accessible and match structured data", async t => {
  const { page, context, errors } = await newPage(); t.after(() => context.close());
  await page.goto(BASE + "/service", { waitUntil: "load" });
  const faq = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)["@graph"].find(x => x["@type"] === "FAQPage").mainEntity);
  assert.equal(faq.length, 9);
  for (const { name, acceptedAnswer } of faq) {
    const summary = page.locator('.pub-faq summary').filter({ hasText: name });
    assert.equal(await summary.count(), 1);
    await summary.click();
    const detail = summary.locator('..');
    assert.equal(await detail.getAttribute('open'), "");
    assert.equal(await detail.locator('p').first().textContent(), acceptedAnswer.text);
  }
  assert.deepEqual(errors, []);
});

test("assistance: email preparation includes only the category and never private app or URL data", async t => {
  const { page, context, errors } = await newPage(); t.after(() => context.close());
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  await page.evaluate(() => {
    localStorage.setItem('assistance-private-fixture', 'PRIVATE_ASSISTANCE_MARKER');
    sessionStorage.setItem('assistance-token-fixture', 'PRIVATE_ASSISTANCE_MARKER');
    window.state.user.name = 'PRIVATE_ASSISTANCE_MARKER';
  });
  await page.goto(BASE + "/service?token=PRIVATE_ASSISTANCE_MARKER&email=PRIVATE_ASSISTANCE_MARKER", { waitUntil: "load" });
  const links = await page.locator('.help-topic a[href^="mailto:"]').evaluateAll(els => els.map(el => el.getAttribute('href')));
  assert.equal(links.length, 6);
  for (const href of links) {
    const url = new URL(href);
    assert.equal(url.pathname, 'titanteam.app@gmail.com');
    assert.deepEqual([...url.searchParams.keys()], ['subject']);
    assert.match(url.searchParams.get('subject'), /^TITAN — Assistance — /);
    assert.equal(href.includes('PRIVATE_ASSISTANCE_MARKER'), false);
  }
  assert.equal(await page.locator('main').innerText().then(text => text.includes('PRIVATE_ASSISTANCE_MARKER')), false);
  assert.equal(await page.locator('form').count(), 0, "email fallback does not pretend to submit a ticket");
  assert.deepEqual(errors, []);
});

test("assistance: a refund request is explicit and email delivery is never claimed", async t => {
  const { page, context, errors } = await newPage(); t.after(() => context.close());
  await page.goto(BASE + "/service", { waitUntil: "load" });
  const topic = page.locator('section[aria-labelledby="help-titanplus"]');
  assert.equal(await topic.count(), 1);
  assert.match(await topic.innerText(), /pas automatiquement accordé/);
  assert.match(await page.locator('section[aria-labelledby="help-contact"]').innerText(), /application de messagerie/);
  assert.match(await page.locator('section[aria-labelledby="help-contact"]').innerText(), /Rien n’est envoyé/);
  assert.equal(await page.getByText('titanteam.app@gmail.com', { exact: true }).count(), 1, "address can be copied when no mail app opens");
  assert.deepEqual(errors, []);
});

test("assistance: the contact anchor keeps its label below the sticky header", async t => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await newPage(width); t.after(() => context.close());
    await page.goto(BASE + '/service', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('link', { name: 'Nous contacter', exact: true }).click();
    const header = await page.locator('.pub-header').boundingBox();
    const label = await page.locator('section[aria-labelledby="help-contact"] .pub-eyebrow').boundingBox();
    assert.ok(label.y >= header.y + header.height, 'the contact label remains visible after anchor navigation');
    assert.deepEqual(errors, []);
  }
});

test("assistance: categories and FAQ work with native keyboard controls and JavaScript disabled", async t => {
  const context = await browser.newContext({ viewport: { width: 360, height: 844 }, javaScriptEnabled: false });
  t.after(() => context.close());
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + "/service", { waitUntil: "load" });
  const index = page.getByRole('navigation', { name: 'Choisir une catégorie' });
  assert.equal(await index.locator('a').count(), 6);
  await index.locator('a[href="#help-compte"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#help-compte').evaluate(el => el === document.activeElement), true);
  const summary = page.locator('section[aria-labelledby="help-compte"] summary').first();
  await summary.focus(); await page.keyboard.press('Space');
  assert.equal(await summary.locator('..').getAttribute('open'), "");
  await page.keyboard.press('Space');
  assert.equal(await summary.locator('..').getAttribute('open'), null);
});

test("assistance: installed PWA can reach help offline before its first visit", async t => {
  const origin = `http://127.0.0.1:${await freePort()}`;
  const own = spawn(process.execPath, ['tools/serve-public.mjs', new URL(origin).port], { cwd: ROOT, stdio: 'ignore' });
  t.after(() => own.kill());
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(origin + '/')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const context = await browser.newContext({ viewport: { width: 360, height: 844 }, serviceWorkers: 'allow' });
  t.after(() => context.close());
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort('internetdisconnected'));
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/aujourdhui', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('titan_sw_dev', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  assert.equal(await page.evaluate(async () => Boolean(await caches.match('/service'))), true, 'help is precached before any visit');
  // Offline emulation alone can leave the service worker's requests connected.
  // Stop only this test's server to exercise the real worker fallback and caches.
  const stopped = new Promise(resolve => own.once('exit', resolve));
  own.kill(); await stopped;
  await context.setOffline(true);
  await page.goto(origin + '/uncached-assistance-fixture', { waitUntil: 'load' });
  assert.equal(await page.getByRole('heading', { name: 'Pas de réseau pour l’instant.' }).count(), 1);
  await page.getByRole('link', { name: 'Assistance', exact: true }).click();
  assert.equal(new URL(page.url()).pathname, '/service');
  assert.equal(await page.getByRole('navigation', { name: 'Choisir une catégorie' }).locator('a').count(), 6);
  assert.equal(await page.locator('.help-topics').evaluate(el => getComputedStyle(el).display), 'grid');
  assert.equal(await page.locator('.pub-card').first().evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('a[href="#help-bug"]').click();
  await page.locator('section[aria-labelledby="help-bug"] summary').first().click();
  assert.deepEqual(errors, []);
});

test("private pages are noindex, public guides are indexable", async () => {
  for (const [path, indexable] of [["/aujourdhui", false], ["/journal", false], ["/profile", false], ["/boutique", false], ["/u/abcdefghij", false], ["/tarifs", true], ["/niveaux-et-xp", true]]) {
    const html = await (await fetch(BASE + path)).text();
    const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1] || "";
    assert.equal(/noindex/.test(robots), !indexable, `${path}: ${robots}`);
  }
});

// Real Atelier page/shell with a synthetic RPC contract. No signed-in production account.
async function atelierPage(width, plus = false, legacy = false, existing = null) {
  const fixture = existing || await newPage(width);
  if (existing) await fixture.page.evaluate(() => {
    // Our synthetic signed-in state can have been persisted by the real shell. Finish a
    // genuine guest boot again before reinstalling the external authenticated RPC fixture.
    const saved = JSON.parse(localStorage.getItem(window.STATE_KEY) || "null");
    if (saved?.user?.id === "00000000-0000-4000-8000-000000000123") {
      saved.user.id = "guest_checkout_fixture";
      localStorage.setItem(window.STATE_KEY, JSON.stringify(saved));
    }
  });
  await fixture.page.unroute("**/js/app/atelier.js?*");
  await fixture.page.route("**/js/app/atelier.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await fixture.page.goto(BASE + "/boutique", { waitUntil: "load" });
  await fixture.page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await fixture.page.evaluate(({ plus, legacy }) => {
    window.state.user.id = "00000000-0000-4000-8000-000000000123";
    const items = [
      { id: "cos_frame_standard", cosmetic: "frame-standard", slot: "frame", name: "Standard", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_frame_aegis", cosmetic: "frame-aegis", slot: "frame", name: "Cadre Aegis", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1400, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_frame_frost", cosmetic: "frame-frost", slot: "frame", name: "Cadre Givre", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1400, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_map_default", cosmetic: "map-default", slot: "map", name: "Vallée", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_map_aurora", cosmetic: "map-aurora", slot: "map", name: "Aurores", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1000, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_card_default", cosmetic: "card-default", slot: "card", name: "Classique", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_card_obsidian", cosmetic: "card-obsidian", slot: "card", name: "Obsidienne", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 800, owned: plus, permanent: false, plus_access: !legacy },
    ];
    if (legacy) {
      items.push({ id: "cos_frame_neon", cosmetic: "frame-neon", slot: "frame", name: "Néon", unlock: "credits", price: 450, owned: true });
      for (const i of items) { delete i.permanent; delete i.plus_access; }
    }
    window.atelierFixture = { credits: 2000, level: 1, week_credits: 0, week_credit_cap: 960, plus: { active: plus }, appearance: {}, items };
    window.atelierCalls = [];
    window.titanClient = { rpc: async (name, params) => {
      window.atelierCalls.push({ name, params });
      const d = window.atelierFixture;
      if (name === "titan_atelier") return { data: structuredClone(d) };
      const item = d.items.find((i) => i.id === (params.p_item_id || params.p_item));
      if (name === "titan_purchase_shop_item") {
        d.credits -= item.price;
        item.owned = item.permanent = true;
        return { data: [{ credits_after: d.credits }] };
      }
      if (name === "titan_set_appearance") {
        d.appearance[params.p_slot] = item.cosmetic;
        return { data: structuredClone(d.appearance) };
      }
      throw new Error("Unexpected fixture RPC: " + name);
    } };
  }, { plus, legacy });
  await fixture.page.addScriptTag({ path: ROOT + "/js/app/atelier.js" });
  await fixture.page.waitForSelector("[data-buy], [data-wear], [data-goto-plus]");
  return fixture;
}

async function coachingTabsPage(width, { unavailable = false, linked = false } = {}) {
  const fixture = await newPage(width), { page } = fixture;
  await page.route("**/js/app/coaching.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/coaching", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(linked => {
    const id = "00000000-0000-4000-8000-000000000123";
    window.state.user.id = id;
    window.titanClient = { auth: { getSession: async () => ({ data: { session: { user: { id }, access_token: "synthetic-coaching-tab-token" } } }) } };
    window.coachingTabCalls = [];
    const share = { since_date: "2026-10-01", accepted_at: "2026-10-01T12:00:00Z", revision: 1, sport: null, share_details: false, share_notes: false };
    window.coachingTabFixture = { capacity: 3, invites: [], links: linked ? [
      { ...share, id: "00000000-0000-4000-8000-000000000301", athlete_id: id, coach_id: "synthetic-other", coach_name: "Coach synthétique" },
      { ...share, id: "00000000-0000-4000-8000-000000000302", coach_id: id, athlete_id: "synthetic-other", athlete_name: "Sportif synthétique" },
    ] : [] };
  }, linked);
  fixture.hold = new Set(); fixture.pending = [];
  fixture.waitPending = async count => {
    for (let i = 0; i < 200; i++) { if (fixture.pending.length >= count) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.fail(`expected ${count} held coaching responses`);
  };
  await page.route("**/rest/v1/rpc/titan_coach_portal", async route => {
    const action = route.request().postDataJSON().p_action;
    await page.evaluate(action => window.coachingTabCalls.push(action), action);
    const body = unavailable ? { message: "UNAVAILABLE" } : action === "snapshot"
      ? await page.evaluate(() => window.coachingTabFixture) : { rows: [], total: 0, revision: 1 };
    if (fixture.hold.has(action)) await new Promise(resolve => fixture.pending.push({ action, resolve }));
    await route.fulfill({ status: unavailable ? 503 : 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.addScriptTag({ path: ROOT + "/js/app/coaching.js" });
  await page.getByRole("tablist", { name: "Mon espace" }).waitFor();
  if (linked) await page.getByText("Aucune proposition pour le moment.", { exact: true }).waitFor();
  return fixture;
}

async function tabFocus(page, index) {
  await page.waitForFunction(index => document.querySelectorAll('[role="tab"]')[index] === document.activeElement, index, { timeout: 2000 });
}

async function outsideTabControl(page, root) {
  await page.evaluate(root => { const button = document.createElement("button"); button.id = "tab-outside-fixture"; button.textContent = "Contrôle extérieur synthétique"; document.getElementById(root).before(button); }, root);
  return page.locator("#tab-outside-fixture");
}

for (const component of ["coaching", "atelier"]) {
  const setup = width => component === "coaching" ? coachingTabsPage(width) : atelierPage(width);
  test(`tab keyboard: ${component} arrows navigate manually and Enter/Space activate at 360 and 1280 px`, async () => {
    for (const width of [360, 1280]) {
      const { page, context, errors } = await setup(width), tabs = page.getByRole("tab"), count = await tabs.count();
      const calls = () => page.evaluate(component => component === "coaching" ? window.coachingTabCalls : window.atelierCalls, component);
      const before = await calls();
      await tabs.first().focus(); await page.keyboard.press("ArrowRight"); await tabFocus(page, 1);
      assert.equal(await tabs.first().getAttribute("aria-selected"), "true", "arrows do not activate");
      await page.keyboard.press("End"); await tabFocus(page, count - 1);
      await page.keyboard.press("ArrowRight"); await tabFocus(page, 0);
      await page.keyboard.press("ArrowLeft"); await tabFocus(page, count - 1);
      await page.keyboard.press("Home"); await tabFocus(page, 0);
      await page.keyboard.press("ArrowDown"); await tabFocus(page, 0);
      await page.keyboard.press("Control+ArrowRight"); await tabFocus(page, 0);
      assert.deepEqual(await calls(), before, "focus navigation starts no remote action");
      await page.keyboard.press("End"); await page.keyboard.press("Enter"); await tabFocus(page, count - 1);
      assert.equal(await tabs.last().getAttribute("aria-selected"), "true");
      await page.keyboard.press("Home"); await page.keyboard.press("Space"); await tabFocus(page, 0);
      assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
      assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(), 1);
      assert.deepEqual(await calls(), before, "empty mode switches and cosmetic filters do not mutate remotely");
      assert.deepEqual(errors, []); await context.close();
    }
  });
  test(`tab semantics: ${component} has named panels and one tab entry with selected reentry`, async () => {
    for (const width of [360, 1280]) {
      const { page, context, errors } = await setup(width), tabs = page.getByRole("tab"), count = await tabs.count();
      const inspect = () => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map(tab => {
        const panel = document.getElementById(tab.getAttribute("aria-controls"));
        return { id: tab.id, selected: tab.getAttribute("aria-selected") === "true", tabIndex: tab.tabIndex, panel: panel && { role: panel.getAttribute("role"), label: panel.getAttribute("aria-labelledby"), hidden: panel.hidden, tabIndex: panel.tabIndex } };
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

test("checkout attribution: older RPC and compatibility-profile reads cannot overwrite a newer Free status", async () => {
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
    await page.evaluate(() => { dispatchEvent(new Event("online")); });
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
  await page.goto(BASE + "/profile", { waitUntil: "load" }); await page.locator("[data-analytics]").waitFor();
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
  const prefs = await context.newPage(); await prefs.goto(BASE + "/profile", { waitUntil: "load" }); await prefs.locator("[data-analytics]").uncheck();
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
  await page.locator('[data-cadence="3"]').waitFor();
  return fixture;
}

// Read fixtures keep the SDK RPC transport and inspect both account-bound requests.
async function profileReadsPage(t, { sessionOwner = "a", rollover = false } = {}) {
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
  await page.evaluate(({ sessionOwner, rollover }) => {
    window.profileReadSettled = 0; window.profileReadSessionCalls = 0;
    window.readOwnerId = letter => letter === "a" ? "00000000-0000-4000-8000-000000000111" : "00000000-0000-4000-8000-000000000222";
    window.profileReadSessionOwner = sessionOwner;
    const client = window.titanClient, rpc = client.rpc.bind(client);
    client.auth.getSession = async () => {
      const call = ++window.profileReadSessionCalls;
      const letter = rollover && call > 1 ? "b" : window.profileReadSessionOwner;
      return { data: { session: { user: { id: window.readOwnerId(letter) }, access_token: `read-${letter}-token` } }, error: null };
    };
    client.rpc = (name, ...args) => {
      if (!["titan_public_card_settings", "titan_expedition_titles"].includes(name)) return Promise.resolve({ data: null, error: { code: "PGRST202" } });
      const builder = rpc(name, ...args), then = builder.then.bind(builder);
      builder.then = (resolve, reject) => then(value => { window.profileReadSettled++; return resolve(value); }, reject);
      return builder;
    };
    window.qrcode = () => ({ addData() {}, make() {}, createSvgTag: () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });
    window.state.user.id = window.readOwnerId("a");
    const snapshot = { ...window.TitanAdventure.snapshot, owner: window.state.user.id };
    window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { sessionOwner, rollover });
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
      if (name !== "export_own_data") return Promise.resolve({ error: { code: "PGRST202" }, data: null });
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
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.cadence), "3");
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
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-analytics")), true);
    await page.locator("#mastery-query").focus();
    await page.evaluate(async () => { dispatchEvent(new CustomEvent("titan:history-updated")); await new Promise(requestAnimationFrame); });
    assert.equal(await page.evaluate(() => document.activeElement.id), "mastery-query");
    await page.reload({ waitUntil: "load" });
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
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.cadence), "3");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.avatar), "ranger");
    await page.reload({ waitUntil: "load" });
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
      const versions = marker === "shell" ? ["300.0", "300.2", "300.3"] : marker === "auth" ? ["300.0", "300.1", "300.2", "300.3", "300.4"] : marker === "community" ? ["300.0", "300.1", "300.2"] : marker === "profil" ? ["300.0", "300.1", "300.2", "300.3", "300.4"] : marker === "onboarding" ? ["300.0", "300.1", "300.2"] : marker === "main" ? ["300.0", "300.1"] : marker === "atelier" ? ["300.0", "300.4", "300.5", "300.6"] : marker === "dynamic" || marker === "password" ? ["300.0", "300.1"] : ["300.0"];
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
