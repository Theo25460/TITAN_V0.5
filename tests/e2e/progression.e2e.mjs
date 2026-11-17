// Lot D (sport excellence): progression answers on the stats page and in the journal sheet. Local history only, nothing is sent.
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

const HISTORY = [
  { id: "r1", client_event_id: "r1", sport: "running", date: "2026-09-08T08:00:00Z", val: 10, unit: "km", details: { duration: 60 } },
  { id: "r2", client_event_id: "r2", sport: "running", date: "2026-09-15T08:00:00Z", val: 10, unit: "km", details: { duration: 59 } },
  { id: "r3", client_event_id: "r3", sport: "running", date: "2026-10-20T08:00:00Z", val: 10, unit: "km", details: { duration: 55 } },
  { id: "r4", client_event_id: "r4", sport: "running", date: "2026-10-27T08:00:00Z", val: 10.3, unit: "km", details: { duration: 54 } },
  { id: "s1", client_event_id: "s1", sport: "swimming", date: "2026-10-22T08:00:00Z", val: 1500, unit: "m", details: { duration: 35 } },
  { id: "y1", client_event_id: "y1", sport: "yoga", date: "2026-10-25T08:00:00Z", val: 45, unit: "min", details: { duration: 45 } },
  { id: "h1", client_event_id: "h1", sport: "running", date: "2026-10-26T08:00:00Z", val: 10, unit: "km", details: { duration: 40 }, is_suspicious: true },
];

async function open(path) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate((h) => { window.state.history = h; window.dispatchEvent(new Event("titan:history-updated")); }, HISTORY);
  return { context, page, errors };
}

test("stats: every discipline on its own figure, and four weeks against the four before, held sessions left out", async () => {
  const { context, page, errors } = await open("/stats");
  try {
    await page.waitForFunction(() => /Quelles disciplines progressent/.test(document.body.innerText));
    const text = (await page.locator(".wk-questions").innerText()).replace(/\s+/g, " ");
    assert.match(text, /Course à pied progresse sur 12 semaines/);
    assert.match(text, /5:57 \/km → 5:22 \/km · en progrès/);
    assert.match(text, /Ces 4 semaines par rapport aux 4 précédentes/);
    assert.doesNotMatch(text, /4:00 \/km/, "the held 40-minute 10 km is not a reference");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("journal: a session sheet compares with the last comparable session, measured values only", async () => {
  const { context, page, errors } = await open("/journal");
  try {
    await page.locator('[data-open="r4"]').first().click();
    const block = page.locator("[data-comparison]");
    await block.waitFor();
    const text = (await block.innerText()).replace(/\s+/g, " ");
    assert.match(text, /Par rapport à ta séance du 20 octobre/);
    assert.match(text, /Allure 5:15 \/km avant 5:30 \/km · stable|Allure 5:15 \/km avant 5:30 \/km · en progrès/);
    assert.match(text, /Distance comparable/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
