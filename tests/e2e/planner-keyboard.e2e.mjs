// Real guest planner, local persistence and keyboard interactions; no external requests.
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
  assert.ok(ready, "local preview server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

async function planner(width = 360) {
  const fixture = await newPage(width), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(BASE + "/prevoir");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("#prevoir .pv-day").first().waitFor();
  const previous = await page.locator("#prevoir .pv-day").first().elementHandle();
  await page.evaluate(() => {
    window.state.user.schedule = {};
    window.plannerHistory = JSON.stringify(window.state.history);
    window.dispatchEvent(new Event("titan:history-updated"));
  });
  await page.waitForFunction(el => !el.isConnected, previous); await previous.dispose();
  return { ...fixture, errors };
}
const day = (page, surface = "grid") => page.locator(`#prevoir ${surface === "grid" ? ".pv-day" : ".asc-row"}[data-day="monday"]`);
const dialog = page => page.getByRole("dialog", { name: "Lundi", exact: true });
const search = page => dialog(page).getByRole("searchbox", { name: "Rechercher un sport", exact: true });
const minutes = page => dialog(page).locator('[name="minutes"]');
const save = page => dialog(page).getByRole("button", { name: "Enregistrer", exact: true });
const chosen = page => dialog(page).locator('[data-chips] [data-pick="running"]');
async function focused(locator) {
  assert.equal(await locator.evaluate(el => document.activeElement === el), true, "Keyboard focus stays on the logical control");
}
async function openDay(page, surface = "grid") {
  await day(page, surface).focus(); await page.keyboard.press("Enter"); await dialog(page).waitFor();
}
async function pick(page) { await chosen(page).focus(); await page.keyboard.press("Enter"); }
async function closed(page, action) {
  const node = await dialog(page).elementHandle();
  await action(); await page.waitForFunction(el => !el.isConnected, node); await node.dispose();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function intact(page) { assert.equal(await page.evaluate(() => JSON.stringify(window.state.history) === window.plannerHistory), true); }
async function invalid(page, control) {
  assert.equal(await control.getAttribute("aria-invalid"), "true");
  const id = await control.getAttribute("aria-describedby");
  assert.ok(id, "The error is linked to the field");
  assert.equal(await dialog(page).locator(`[id="${id}"]`).isVisible(), true);
  await focused(control);
}

test("planner keyboard: choosing a quick sport retains its replacement button at both widths", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await planner(width);
    try {
      await openDay(page); await pick(page); await focused(chosen(page));
      assert.equal(await chosen(page).getAttribute("aria-pressed"), "true");
      await page.keyboard.press("Tab"); await focused(dialog(page).locator('[data-chips] [data-pick]').nth(1));
      assert.deepEqual(errors, []); await intact(page);
    } finally { await context.close(); }
  }
});

test("planner keyboard: selecting a search result continues from its selected chip", async () => {
  const { page, context, errors } = await planner();
  try {
    await openDay(page); await search(page).fill("course");
    const result = dialog(page).locator('[data-results] [data-pick="running"]');
    await result.focus(); await page.keyboard.press("Enter");
    await focused(chosen(page)); assert.equal(await search(page).inputValue(), "");
    assert.equal(await dialog(page).locator('[data-results] button').count(), 0);
    assert.deepEqual(errors, []); await intact(page);
  } finally { await context.close(); }
});

test("planner keyboard: submitting without a sport links the error and focuses sport search", async () => {
  const { page, context, errors } = await planner();
  try {
    await openDay(page); await save(page).focus(); await page.keyboard.press("Enter");
    await invalid(page, search(page));
    assert.match(await dialog(page).getByRole("alert").innerText(), /Choisis un sport/);
    await pick(page);
    assert.equal(await search(page).getAttribute("aria-invalid"), null);
    assert.equal(await search(page).getAttribute("aria-describedby"), null);
    assert.equal(await dialog(page).getByRole("alert").count(), 0);
    await closed(page, () => save(page).click());
    assert.equal(await page.evaluate(() => window.TitanData.plan()[0].sport), "running");
    assert.deepEqual(errors, []); await intact(page);
  } finally { await context.close(); }
});

test("planner keyboard: duration range errors focus and describe the input, then clear on editing", async () => {
  for (const value of ["4", "601"]) {
    const { page, context, errors } = await planner();
    try {
      await openDay(page); await pick(page); await minutes(page).fill(value); await save(page).click();
      await invalid(page, minutes(page));
      assert.equal(await page.evaluate(() => window.TitanData.plan()[0].sport), null);
      await minutes(page).fill("45");
      assert.equal(await minutes(page).getAttribute("aria-invalid"), null);
      assert.equal(await minutes(page).getAttribute("aria-describedby"), null);
      assert.equal(await dialog(page).getByRole("alert").count(), 0);
      await closed(page, () => save(page).click());
      assert.equal(await page.evaluate(() => window.TitanData.plan()[0].minutes), 45);
      assert.deepEqual(errors, []); await intact(page);
    } finally { await context.close(); }
  }
});

test("planner keyboard: a partially entered number is not saved as an empty optional duration", async () => {
  const { page, context, errors } = await planner();
  try {
    await openDay(page); await pick(page); await minutes(page).focus(); await page.keyboard.type("e");
    assert.equal(await minutes(page).evaluate(el => el.validity.badInput), true);
    await save(page).click();
    assert.equal(await dialog(page).count(), 1, "Invalid number keeps the form open");
    await invalid(page, minutes(page));
    assert.equal(await page.evaluate(() => window.TitanData.plan()[0].sport), null);
    assert.deepEqual(errors, []); await intact(page);
  } finally { await context.close(); }
});

test("planner keyboard: saving returns to the originating grid or list day and persists after reload", async () => {
  for (const surface of ["grid", "list"]) for (const width of [360, 1280]) {
    const { page, context, errors } = await planner(width);
    try {
      await openDay(page, surface); await pick(page); await minutes(page).fill("45");
      await dialog(page).locator('[name="note"]').fill("Sortie douce");
      await closed(page, () => save(page).click()); await focused(day(page, surface));
      assert.deepEqual(await page.evaluate(() => { const d=window.TitanData.plan()[0];return { sport:d.sport,minutes:d.minutes,note:d.note }; }), { sport:"running",minutes:45,note:"Sortie douce" });
      await intact(page); await page.reload();
      await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
      await page.locator('#prevoir[aria-busy="false"]').waitFor();
      assert.equal(await page.evaluate(() => window.TitanData.plan()[0].minutes), 45);
      await openDay(page, surface);
      assert.equal(await minutes(page).inputValue(), "45");
      assert.equal(await chosen(page).getAttribute("aria-pressed"), "true");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("planner keyboard: clearing a planned day returns to the same list entry", async () => {
  const { page, context, errors } = await planner();
  try {
    await openDay(page, "list"); await pick(page); await closed(page, () => save(page).click());
    await openDay(page, "list");
    await closed(page, () => dialog(page).getByRole("button", { name: "Repos / libre", exact: true }).click());
    await focused(day(page, "list"));
    assert.equal(await page.evaluate(() => window.TitanData.plan()[0].sport), null);
    assert.deepEqual(errors, []); await intact(page);
  } finally { await context.close(); }
});

test("planner keyboard: Escape returns to a replacement opener after a background render", async () => {
  const { page, context, errors } = await planner();
  try {
    await openDay(page, "list");
    const old = await day(page, "list").elementHandle();
    await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
    await page.waitForFunction(el => !el.isConnected, old); await old.dispose();
    await closed(page, () => page.keyboard.press("Escape")); await focused(day(page, "list"));
    assert.deepEqual(errors, []); await intact(page);
  } finally { await context.close(); }
});

test("planner keyboard: refresh keeps the current day control and does not steal outside or dialog focus", async () => {
  const { page, context, errors } = await planner();
  try {
    async function refresh() {
      const old=await day(page).elementHandle();
      await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
      await page.waitForFunction(el => !el.isConnected,old);await old.dispose();
    }
    await day(page).focus(); await refresh(); await focused(day(page));
    const nav = page.locator('[data-subnav] a').first();
    await nav.focus(); await refresh(); await focused(nav);
    await openDay(page); await search(page).focus(); await refresh(); await focused(search(page));
    assert.deepEqual(errors, []); await intact(page);
  } finally { await context.close(); }
});
