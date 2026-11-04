// Real Objectives UI in discovery mode; fixed local clocks, no production accounts.
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
  assert.ok(ready, "local goals server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

async function openGoals(time, width = 360, timezone = "Europe/Paris", template) {
  const fixture = await newPage(width, timezone), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(time));
  await page.goto(BASE + "/objectifs");
  await page.locator(template === undefined ? "[data-new]" : `[data-template="${template}"]`).click();
  await page.locator(".ob-form").waitFor();
  return { ...fixture, errors };
}
async function dates(page, start, end) {
  assert.equal(await page.locator('[name="start_date"]').inputValue(), start);
  assert.equal(await page.locator('[name="end_date"]').inputValue(), end);
}

test("goals: autumn presets keep inclusive calendar days at mobile and desktop widths", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await openGoals("2026-10-23T22:30:00Z", width);
    try {
      for (const [period, end] of [["7", "2026-10-30"], ["28", "2026-11-20"], ["90", "2027-01-21"]]) {
        await page.locator(`[data-period="${period}"]`).click();
        await dates(page, "2026-10-24", end);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("goals: spring presets do not add a calendar day near midnight", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await openGoals("2026-03-28T22:30:00Z", width);
    try {
      for (const [period, end] of [["7", "2026-04-03"], ["28", "2026-04-24"], ["90", "2026-06-25"]]) {
        await page.locator(`[data-period="${period}"]`).click();
        await dates(page, "2026-03-28", end);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("goals: default and all four templates retain their 28 or 30 calendar days", async () => {
  for (const [time, start, end28, end30] of [
    ["2026-10-23T22:30:00Z", "2026-10-24", "2026-11-20", "2026-11-22"],
    ["2026-03-28T22:30:00Z", "2026-03-28", "2026-04-24", "2026-04-26"],
  ]) {
    for (const template of [undefined, 0, 1, 2, 3]) {
      const { page, context, errors } = await openGoals(time, 360, "Europe/Paris", template);
      try {
        await dates(page, start, template === 1 || template === 2 ? end30 : end28);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  }
});

test("goals: current month retains real month boundaries including leap February", async () => {
  for (const [time, start, end] of [
    ["2026-10-23T22:30:00Z", "2026-10-01", "2026-10-31"],
    ["2028-02-15T12:00:00Z", "2028-02-01", "2028-02-29"],
  ]) {
    const { page, context, errors } = await openGoals(time);
    try {
      await page.locator('[data-period="month"]').click();
      await dates(page, start, end);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("goals: local dates follow the browser timezone in UTC and New York", async () => {
  for (const [zone, time, start, end] of [
    ["UTC", "2026-10-24T00:30:00Z", "2026-10-24", "2026-10-30"],
    ["America/New_York", "2026-10-31T04:30:00Z", "2026-10-31", "2026-11-06"],
    ["America/New_York", "2026-03-08T04:30:00Z", "2026-03-07", "2026-03-13"],
  ]) {
    const { page, context, errors } = await openGoals(time, 360, zone);
    try {
      await page.locator('[data-period="7"]').click();
      await dates(page, start, end);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("goals: selected dates survive creation, reload and editing without replacing manual dates", async () => {
  const { page, context, errors } = await openGoals("2026-10-23T22:30:00Z");
  try {
    await page.locator('[data-period="7"]').click();
    await page.locator('[name="title"]').fill("Objectif calendrier");
    await page.locator('.ob-form [type="submit"]').click();
    await page.locator(".ob-form").waitFor({ state: "detached" });
    await page.reload();
    await page.locator('[data-edit]').click();
    await dates(page, "2026-10-24", "2026-10-30");
    await page.locator('[name="start_date"]').fill("2026-11-02");
    await page.locator('[name="end_date"]').fill("2026-12-01");
    await page.locator('.ob-form [type="submit"]').click();
    await page.locator(".ob-form").waitFor({ state: "detached" });
    await page.locator('[data-edit]').click();
    await dates(page, "2026-11-02", "2026-12-01");
    await page.locator('[data-cancel]').click();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
