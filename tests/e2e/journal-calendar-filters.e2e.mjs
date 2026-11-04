// Real Journal with synthetic in-memory history; external requests blocked, no production accounts.
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
  assert.ok(ready, "local journal server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

async function journalPage(width = 360) {
  const fixture = await newPage(width, "UTC"), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00Z"));
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("#jr-q").waitFor();
  await page.evaluate(() => {
    const row = (id, date, sport, note, duration) => ({ id, user_id: window.state.user.id, date: date + "T12:00:00.000Z", created_at: date + "T13:00:00.000Z", sport, val: sport === "running" ? 5 : duration, unit: sport === "running" ? "km" : "min", details: { note, duration } });
    window.state.history = [
      row("fixture-run", "2026-10-16", "running", "Fractionné côte", 30),
      row("fixture-force", "2026-10-16", "muscu_gym", "Fractionné force", 60),
      row("fixture-easy", "2026-10-15", "running", "Endurance", 45),
      row("fixture-old", "2026-09-05", "running", "Fractionné ancien", 25),
      row("fixture-yoga", "2026-10-14", "yoga", "Mobilité", 90),
    ];
    window.state.archivedHistory = [{ ...row("fixture-archive", "2026-10-16", "running", "Archive fractionné", 20), archived_at: "2026-10-17T10:00:00Z" }];
    window.journalSnapshot = JSON.stringify([window.state.history, window.state.archivedHistory]);
    window.dispatchEvent(new Event("titan:history-updated"));
  });
  await page.locator('.jr-summary dd').first().filter({ hasText: "5" }).waitFor();
  return { ...fixture, errors };
}
const head = page => page.locator(".jr-cal-head p").textContent();
async function calendar(page) { await page.locator('[data-view="calendar"]').click(); await page.locator(".jr-cal").waitFor(); }
async function search(page, query) {
  const previous = await page.locator("#jr-results > :first-child").elementHandle();
  await page.locator("#jr-q").fill(query);
  await page.waitForFunction(el => !el.isConnected, previous);
  await previous.dispose();
}
async function intact(page) {
  assert.equal(await page.evaluate(() => JSON.stringify([window.state.history, window.state.archivedHistory]) === window.journalSnapshot), true);
}

test("journal calendar: search changes counts, intensity and day results at both widths", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await journalPage(width);
    try {
      await calendar(page);
      await search(page, "fractionne");
      assert.match(await head(page), /1 jour actif.*2 séances.*1\s*h\s*30/);
      assert.equal(await page.locator('[data-day="2026-10-15"]').getAttribute("data-level"), "0");
      assert.equal(await page.locator('[data-day="2026-10-16"] .jr-cal-dots i').count(), 2);
      await page.locator('[data-day="2026-10-16"]').click();
      assert.equal(await page.locator('.jr-day-list [data-open]').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await intact(page); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("journal calendar: retained period is visible and filters older months", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await journalPage(width);
    try {
      await page.locator("#jr-period").selectOption("30");
      await calendar(page);
      assert.equal(await page.locator("#jr-period").count(), 1);
      assert.equal(await page.locator("#jr-period").inputValue(), "30");
      await page.getByRole("button", { name: "Mois précédent", exact: true }).click();
      assert.match(await head(page), /0 jour actif.*0 séance/);
      assert.equal(await page.locator('[data-day="2026-09-05"]').getAttribute("data-level"), "0");
      await page.locator("#jr-period").selectOption("all");
      assert.match(await head(page), /1 jour actif.*1 séance/);
      assert.equal(await page.locator('[data-day="2026-09-05"] .jr-cal-dots i').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await intact(page); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("journal calendar: selecting a day does not narrow the monthly overview", async () => {
  const { page, context, errors } = await journalPage();
  try {
    await calendar(page);
    await page.locator('[data-day="2026-10-16"]').click();
    assert.equal(await page.locator('.jr-day-list [data-open]').count(), 2);
    assert.match(await head(page), /3 jours actifs.*4 séances/);
    await page.locator('[data-day="2026-10-15"]').click();
    assert.equal(await page.locator('.jr-day-list [data-open]').count(), 1);
    assert.equal(await page.locator('[data-day="2026-10-14"] .jr-cal-dots i').count(), 1);
    await search(page, "Endurance");
    assert.match(await head(page), /1 jour actif.*1 séance/);
    assert.equal(await page.locator('.jr-day-list [data-open]').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.id), "jr-q");
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("journal calendar: family, search and period combine and survive view switches", async () => {
  const { page, context, errors } = await journalPage();
  try {
    await calendar(page);
    await search(page, "fractionne");
    await page.locator('.jr-fams [data-family="endurance"]').click();
    assert.match(await head(page), /1 jour actif.*1 séance/);
    await page.locator('[data-view="list"]').click();
    assert.equal(await page.locator('.jr-rows [data-open]').count(), 2);
    await page.locator("#jr-period").selectOption("30");
    assert.equal(await page.locator('.jr-rows [data-open]').count(), 1);
    await calendar(page);
    assert.match(await head(page), /1 jour actif.*1 séance/);
    assert.equal(await page.locator('#jr-q').inputValue(), "fractionne");
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("journal calendar: archives use only matching archived sessions", async () => {
  const { page, context, errors } = await journalPage();
  try {
    await calendar(page);
    await page.locator('[data-archived]').click();
    await search(page, "introuvable");
    assert.match(await head(page), /0 jour actif.*0 séance/);
    await search(page, "archive fractionne");
    assert.match(await head(page), /1 jour actif.*1 séance/);
    await page.locator('[data-day="2026-10-16"]').click();
    assert.equal(await page.locator('.jr-day-list [data-open="fixture-archive"]').count(), 1);
    assert.equal(await page.locator('.jr-day-list [data-open]').count(), 1);
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("journal calendar: clearing an empty search restores counts and day contents", async () => {
  const { page, context, errors } = await journalPage();
  try {
    await calendar(page);
    await search(page, "introuvable");
    assert.match(await head(page), /0 jour actif.*0 séance/);
    assert.equal(await page.locator('.jr-cal-dots i').count(), 0);
    await page.locator('[data-day="2026-10-16"]').click();
    assert.match(await page.locator('.jr-day-list').textContent(), /Aucune séance ce jour/);
    await search(page, "");
    assert.match(await head(page), /3 jours actifs.*4 séances/);
    assert.equal(await page.locator('.jr-day-list [data-open]').count(), 2);
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("journal calendar: CSV receives the same selection as the selected day", async () => {
  const { page, context, errors } = await journalPage();
  try {
    await calendar(page);
    await search(page, "fractionne cote");
    await page.locator('[data-day="2026-10-16"]').click();
    await page.evaluate(() => { window.titanExportSessionsCSV = rows => { window.exportedJournalIds = rows.map(row => row.id); }; });
    await page.locator('[data-export]').click();
    assert.deepEqual(await page.evaluate(() => window.exportedJournalIds), ["fixture-run"]);
    assert.match(await head(page), /1 jour actif.*1 séance/);
    await intact(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
