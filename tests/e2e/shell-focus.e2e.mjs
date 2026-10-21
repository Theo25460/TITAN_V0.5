// Real application shell, local discovery session; no external requests or production accounts.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
  assert.ok(ready, "local shell server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const EVENTS = ["titan:history-updated", "titan:adventure-updated", "titan:pending-changed", "online", "offline"];
async function shellPage(width = 360, path = "/stats") {
  const fixture = await newPage(width), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("[data-shell-more]").waitFor({ state: "attached" });
  return { ...fixture, errors };
}
async function refresh(page, event = "titan:history-updated") {
  const old = await page.locator(".asc-topbar [data-shell-more]").elementHandle();
  await page.evaluate(event => { window.fixtureShellEvent = event; window.dispatchEvent(new Event(event)); }, event);
  await page.waitForFunction(el => !el.isConnected, old);
  await old.dispose();
}
async function active(locator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await locator.evaluate(el => ({ connected: el.isConnected, same: document.activeElement === el, actual: document.activeElement.outerHTML.slice(0, 240) }));
    // A queued render may replace the resolved locator before this callback runs.
    if (!result.connected) continue;
    assert.equal(result.same, true, result.actual);
    return;
  }
  assert.fail("Focus target kept being replaced during the assertion");
}

test("shell focus: subnavigation survives every refresh event at mobile and desktop widths", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await shellPage(width);
    try {
      const link = page.locator('[data-subnav] a[href="/records"]');
      for (const event of EVENTS) {
        await link.focus(); await refresh(page, event); await active(link);
        assert.equal(await link.getAttribute("href"), "/records");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("shell focus: desktop rail retains the exact duplicate Profile link and secondary links", async () => {
  const { page, context, errors } = await shellPage(1280);
  try {
    for (const selector of ['.asc-rail-foot', '.asc-rail-nav a[href="/profile"]', '.asc-rail-sub a[href="/service"]', '.asc-rail .asc-brand']) {
      const link = page.locator(selector);
      await link.focus(); await refresh(page); await active(link);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("shell focus: mobile tabs retain the selected logical destination", async () => {
  const { page, context, errors } = await shellPage();
  try {
    for (const href of ["/stats", "/training", "/profile"]) {
      const link = page.locator(`.asc-tabbar a[href="${href}"]`);
      await link.focus(); await refresh(page); await active(link);
    }
    assert.equal(await page.locator('.asc-tabbar a[href="/stats"]').getAttribute("aria-current"), "page");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("shell focus: the mobile More command remains keyboard-operable after refresh", async () => {
  const { page, context, errors } = await shellPage();
  try {
    const button = page.locator("[data-shell-more]");
    await button.focus(); await refresh(page); await active(button);
    await page.keyboard.press("Enter");
    const menu = page.getByRole("dialog", { name: "Plus", exact: true });
    await menu.waitFor();
    assert.equal(await menu.locator('a[href="/service"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("shell focus: mobile Profile and home-brand links retain focus", async () => {
  const { page, context, errors } = await shellPage(360, "/aujourdhui");
  try {
    for (const selector of [".asc-topbar .asc-me", ".asc-topbar .asc-brand"]) {
      const link = page.locator(selector);
      await link.focus(); await refresh(page); await active(link);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("shell focus: refreshing leaves a Journal search field and its selection usable", async () => {
  const { page, context, errors } = await shellPage(360, "/journal");
  try {
    const field = page.locator("#jr-q");
    await field.fill("course");
    for (const event of ["online", "offline", "titan:pending-changed"]) {
      await refresh(page, event); await active(field);
      assert.equal(await field.inputValue(), "course");
    }
    await field.press("End"); await field.press("a");
    assert.equal(await field.inputValue(), "coursea");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("shell focus: a live dialog keeps its input focused while navigation refreshes", async () => {
  const { page, context, errors } = await shellPage();
  try {
    await page.evaluate(() => {
      const input = document.createElement("input"); input.id = "fixture-dialog-input";
      window.titanShell.sheet({ title: "Focus test", body: input }); input.focus();
    });
    const field = page.locator("#fixture-dialog-input");
    for (const event of EVENTS) { await refresh(page, event); await active(field); }
    await field.fill("Texte conservé");
    assert.equal(await field.inputValue(), "Texte conservé");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("shell focus: removing a destination does not focus a different link", async () => {
  const { page, context, errors } = await shellPage();
  try {
    await page.locator('[data-subnav] a[href="/records"]').focus();
    await page.evaluate(() => { document.body.dataset.territory = "seance"; });
    await refresh(page);
    assert.equal(await page.locator('[data-subnav] a[href="/records"]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("shell focus: updated consumers bypass the previous script resource", async () => {
  const consumers = readdirSync(ROOT).filter(name => name.endsWith(".html") && name !== "profile.html" && readFileSync(ROOT + "/" + name, "utf8").includes('/js/app/shell.js?v='));
  assert.ok(consumers.length > 0);
  for (const name of consumers) assert.ok(readFileSync(ROOT + "/" + name, "utf8").includes('/js/app/shell.js?v=300.9'), name);
  const { page, context } = await newPage();
  try {
    let staleRequests = 0;
    await page.route("**/js/app/shell.js?v=300.8", route => { staleRequests++; return route.fulfill({ contentType: "text/javascript", body: "window.previousShellFocus = true;" }); });
    await page.goto(BASE + "/stats");
    await page.locator("[data-shell-more]").waitFor();
    assert.equal(staleRequests, 0);
    assert.equal(await page.evaluate(() => Boolean(window.previousShellFocus)), false);
    assert.equal(await page.locator('script[src="/js/app/shell.js?v=300.9"]').count(), 1);
  } finally { await context.close(); }
});
