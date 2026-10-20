// Real session form, logActivity and discovery queue; fixed local clocks, no production accounts.
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
  assert.ok(ready, "local session server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

async function sessionPage(now, width = 360, timezone = "Europe/Paris") {
  const fixture = await newPage(width, timezone), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(BASE + "/training?sport=running");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator('[data-act="save"]').waitFor();
  await page.evaluate(() => {
    window.dateSubmissions = [];
    const log = window.logActivity;
    window.logActivity = (...args) => { window.dateSubmissions.push(structuredClone(args)); return log(...args); };
  });
  await page.locator('[data-k="distance"]').fill("5");
  await page.locator('[data-k="durM"]').fill("30");
  return { ...fixture, errors };
}
async function saveAt(page, expected) {
  await page.locator('[data-act="save"]').click();
  await page.locator("dialog.asc-sheet[open]").waitFor();
  const saved = await page.evaluate(() => ({
    calls: window.dateSubmissions.length,
    performedAt: window.dateSubmissions[0]?.[1].performedAt,
    date: window.state.history[0]?.date,
    sport: window.state.history[0]?.sport,
  }));
  assert.deepEqual(saved, { calls: 1, performedAt: expected, date: expected, sport: "running" });
}
async function yesterday(page, time) {
  await page.locator('[data-when="yesterday"]').click();
  await page.locator('[data-k="time"]').fill(time);
}

test("session date: Hier uses the preceding local date after the autumn clock change", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await sessionPage("2026-10-25T22:30:00Z", width);
    try {
      await yesterday(page, "12:15");
      await saveAt(page, "2026-10-24T10:15:00.000Z");
      await page.reload();
      await page.waitForFunction(() => window.state?.history?.length === 1);
      assert.equal(await page.evaluate(() => window.state.history[0].date), "2026-10-24T10:15:00.000Z");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("session date: Hier does not skip Sunday after the spring clock change", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await sessionPage("2026-03-29T22:30:00Z", width);
    try {
      await yesterday(page, "12:15");
      await saveAt(page, "2026-03-29T10:15:00.000Z");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("session date: Hier preserves midnight, zero hours and zero minutes", async () => {
  for (const width of [360, 1280]) {
    for (const [time, expected] of [
      ["00:00", "2026-10-15T22:00:00.000Z"],
      ["00:15", "2026-10-15T22:15:00.000Z"],
      ["12:00", "2026-10-16T10:00:00.000Z"],
    ]) {
      const { page, context, errors } = await sessionPage("2026-10-17T12:00:00Z", width);
      try {
        await yesterday(page, time);
        await saveAt(page, expected);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  }
});

test("session date: Hier follows local dates in New York and UTC", async () => {
  for (const [zone, now, expected] of [
    ["America/New_York", "2026-11-02T04:30:00Z", "2026-10-31T16:15:00.000Z"],
    ["America/New_York", "2026-03-09T04:30:00Z", "2026-03-08T16:15:00.000Z"],
    ["UTC", "2026-10-25T23:30:00Z", "2026-10-24T12:15:00.000Z"],
  ]) {
    const { page, context, errors } = await sessionPage(now, 360, zone);
    try {
      await yesterday(page, "12:15");
      await saveAt(page, expected);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("session date: Maintenant and explicit dates keep their existing local semantics", async () => {
  for (const when of ["now", "other"]) {
    const { page, context, errors } = await sessionPage("2026-10-17T12:00:00Z");
    try {
      if (when === "other") {
        await page.locator('[data-when="other"]').click();
        await page.locator('[data-k="date"]').fill("2026-10-15");
        await page.locator('[data-k="time"]').fill("00:00");
      }
      await saveAt(page, when === "now" ? "2026-10-17T12:00:00.000Z" : "2026-10-14T22:00:00.000Z");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("session date: a cleared Hier time keeps the existing 18h fallback", async () => {
  const { page, context, errors } = await sessionPage("2026-10-17T12:00:00Z");
  try {
    await yesterday(page, "");
    await saveAt(page, "2026-10-16T16:00:00.000Z");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("session save: a double tap and a slow durable write store the session once (AND14)", async () => {
  const { page, context, errors } = await sessionPage("2026-10-17T12:00:00Z");
  try {
    await page.evaluate(() => {
      const log = window.logActivity;
      window.logActivity = async (...args) => { await new Promise(resolve => setTimeout(resolve, 400)); return log(...args); };
    });
    await page.evaluate(() => { const save = document.querySelector('[data-act="save"]'); save.click(); save.click(); save.click(); });
    await page.locator("dialog.asc-sheet[open]").waitFor();
    await page.waitForTimeout(1000); // a second write, if any, would land within the slow-write delay
    const stored = await page.evaluate(() => ({ calls: window.dateSubmissions.length, history: window.state.history.length, ids: new Set(window.state.history.map(l => l.client_event_id)).size }));
    assert.deepEqual(stored, { calls: 1, history: 1, ids: 1 });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
