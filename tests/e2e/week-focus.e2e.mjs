// Real weekly recap with synthetic local history; no production accounts or external requests.
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
  assert.ok(ready, "local week server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

const previous = page => page.getByRole("button", { name: "Semaine précédente", exact: true });
const next = page => page.getByRole("button", { name: "Semaine suivante", exact: true });
async function refresh(page, event = "titan:history-updated") {
  const old = await page.locator("#wk-title").elementHandle();
  await page.evaluate(event => window.dispatchEvent(new Event(event)), event);
  await page.waitForFunction(el => !el.isConnected, old);
  await old.dispose();
}
async function weekPage(width = 360) {
  const fixture = await newPage(width, "UTC"), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00Z"));
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("#wk-title").waitFor();
  await page.evaluate(() => {
    window.state.history = [
      { id: "week-old", sport: "running", date: "2026-09-28T12:00:00Z", val: 5, unit: "km", details: { duration: 30 } },
      { id: "week-current", sport: "running", date: "2026-10-15T12:00:00Z", val: 10, unit: "km", details: { duration: 60 } },
    ];
    window.weekHistory = JSON.stringify(window.state.history);
  });
  await refresh(page);
  return { ...fixture, errors };
}
const focusedId = page => page.evaluate(() => document.activeElement.id);
const focusedLabel = page => page.evaluate(() => document.activeElement.getAttribute("aria-label"));
async function intact(page) { assert.equal(await page.evaluate(() => JSON.stringify(window.state.history) === window.weekHistory), true); }

test("week focus: keyboard navigation puts focus on the updated recap heading at both widths", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await weekPage(width);
    try {
      await previous(page).focus(); await page.keyboard.press("Enter");
      assert.equal(await focusedId(page), "wk-title");
      assert.equal(await page.locator("#wk-title").getAttribute("tabindex"), "-1");
      assert.equal(await page.locator(".wk-nav .asc-eyebrow").textContent(), "La semaine dernière");
      assert.match(await page.locator(".wk-nav .asc-small").textContent(), /5 octobre.*11 octobre/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await intact(page); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("week focus: Shift Tab reaches usable navigation and both bounds remain reachable", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await weekPage(width);
    try {
      await previous(page).focus(); await page.keyboard.press("Enter");
      await previous(page).focus(); await page.keyboard.press("Enter");
      assert.equal(await previous(page).isDisabled(), true);
      assert.equal(await focusedId(page), "wk-title");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await focusedLabel(page), "Semaine suivante");
      await page.keyboard.press("Enter");
      assert.equal(await focusedId(page), "wk-title");
      await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Enter");
      assert.equal(await next(page).isDisabled(), true);
      assert.equal(await focusedId(page), "wk-title");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await focusedLabel(page), "Semaine précédente");
      await intact(page); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("week focus: history and adventure refreshes retain focus on the recap heading", async () => {
  const { page, context, errors } = await weekPage();
  try {
    await previous(page).click();
    for (const event of ["titan:history-updated", "titan:adventure-updated"]) {
      await refresh(page, event);
      assert.equal(await focusedId(page), "wk-title");
      assert.equal(await page.locator(".wk-nav .asc-eyebrow").textContent(), "La semaine dernière");
    }
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("week focus: refreshes retain either enabled week command", async () => {
  const { page, context, errors } = await weekPage();
  try {
    await previous(page).click();
    for (const [command, label] of [[previous, "Semaine précédente"], [next, "Semaine suivante"]]) {
      await command(page).focus();
      await refresh(page);
      assert.equal(await focusedLabel(page), label);
      assert.equal(await page.evaluate(() => document.activeElement.disabled), false);
    }
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("week focus: a refresh does not move focus from the page skip link", async () => {
  const { page, context, errors } = await weekPage();
  try {
    const link = page.locator(".asc-skip");
    await link.focus();
    assert.equal(await link.evaluate(el => document.getElementById("semaine").contains(el)), false);
    for (const event of ["titan:history-updated", "titan:adventure-updated"]) {
      await refresh(page, event);
      assert.equal(await link.evaluate(el => document.activeElement === el), true);
    }
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("week focus: a command disabled by a history refresh falls back to the recap heading", async () => {
  const { page, context, errors } = await weekPage();
  try {
    await previous(page).click();
    await previous(page).focus();
    await page.evaluate(() => { window.state.history = window.state.history.filter(row => row.id !== "week-old"); });
    await refresh(page);
    assert.equal(await previous(page).isDisabled(), true);
    assert.equal(await focusedId(page), "wk-title");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
