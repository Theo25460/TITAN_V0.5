// QG: last month's report is offered once in the first week of a month, dismissible, and opens the previous month.
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

async function qg(day) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(`2026-11-${day}T12:00:00Z`));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user);
  await page.evaluate(() => {
    window.state.history = [
      { id: "o1", sport: "running", date: "2026-10-05T12:00:00Z", val: 10, unit: "km", details: { duration: 60 } },
      { id: "o2", sport: "yoga", date: "2026-10-12T12:00:00Z", val: 30, unit: "min", details: { duration: 30 } },
    ];
    window.dispatchEvent(new Event("titan:history-updated"));
  });
  return { page, context, errors };
}

test("month prompt: shown in the first week, dismissed for good on this device, absent later in the month", async () => {
  const { page, context, errors } = await qg("03");
  try {
    const note = page.locator(".qg-month");
    await note.waitFor();
    assert.match(await note.innerText(), /bilan de octobre est prêt.*2 jours actifs, 2 sports/);
    await page.locator('[data-action="dismiss-month"]').click();
    await page.waitForFunction(() => !document.querySelector(".qg-month"));
    await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".qg-month").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  const late = await qg("20");
  try {
    await late.page.waitForTimeout(500);
    assert.equal(await late.page.locator(".qg-month").count(), 0);
  } finally { await late.context.close(); }
});

test("month prompt: the link opens the previous month", async () => {
  const { page, context } = await qg("03");
  try {
    await page.locator(".qg-month a").waitFor();
    assert.equal(await page.locator(".qg-month a").getAttribute("href"), "/stats?mois=1");
    await page.goto(BASE + "/stats?mois=1");
    await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user);
    await page.evaluate(() => {
      window.state.history = [{ id: "o1", sport: "running", date: "2026-10-05T12:00:00Z", val: 10, unit: "km", details: { duration: 60 } }];
      window.dispatchEvent(new Event("titan:history-updated"));
    });
    await page.locator("#wk-month-title").waitFor();
    assert.match(await page.locator("#wk-month-title").textContent(), /octobre 2026/);
  } finally { await context.close(); }
});
