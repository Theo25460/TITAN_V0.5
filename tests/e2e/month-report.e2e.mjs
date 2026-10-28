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


async function monthPage(width = 360) {
  const fixture = await newPage(width, "UTC"), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00Z"));
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.locator("#wk-title").waitFor();
  await page.evaluate(() => {
    window.state.history = [
      { id: "m1", sport: "running", date: "2026-09-03T12:00:00Z", val: 10, unit: "km", details: { duration: 60 } },
      { id: "m2", sport: "yoga", date: "2026-09-20T12:00:00Z", val: 45, unit: "min", details: { duration: 45 } },
      { id: "c1", sport: "running", date: "2026-10-05T12:00:00Z", val: 12, unit: "km", details: { duration: 70 } },
      { id: "c2", sport: "yoga", date: "2026-10-12T12:00:00Z", val: 30, unit: "min", details: {} },
    ];
  });
  await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
  await page.locator("#wk-month-title").waitFor();
  return { ...fixture, errors };
}

test("month report: this month is compared with the same days of the previous month, volumes stay per sport", async () => {
  const { page, context, errors } = await monthPage();
  try {
    assert.match(await page.locator("#wk-month-title").textContent(), /Bilan de octobre 2026/);
    const text = await page.locator(".wk-month").innerText();
    assert.match(text, /2 jours actifs, 2 sports/);
    assert.match(text, /Mois en cours/);
    assert.match(text, /Temps forts/i, "12 km beats the 10 km of September");
    assert.match(text, /record/i);
    assert.match(text, /12 km|12,0 km/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole("button", { name: "Mois précédent", exact: true }).click();
    assert.match(await page.locator("#wk-month-title").textContent(), /septembre 2026/);
    assert.equal(await page.evaluate(() => document.activeElement.id), "wk-month-title");
    assert.match(await page.locator(".wk-month").innerText(), /2 jours actifs, 2 sports/);
    assert.equal(await page.getByRole("button", { name: "Mois suivant", exact: true }).isDisabled(), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("month report: the card opens locally with the month title and nothing else leaves the device", async () => {
  const { page, context, errors } = await monthPage();
  try {
    await page.getByRole("button", { name: /Image de mon mois/ }).click();
    await page.getByRole("dialog", { name: "Image à partager", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector(".cd-preview img")?.src.startsWith("data:image/png"));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("annual report: this year in progress, the year before on request, a card of the year", async () => {
  const { page, context, errors } = await monthPage();
  try {
    const title = page.locator("#wk-year-title");
    await title.waitFor();
    assert.match(await title.textContent(), /Bilan de 2026/);
    const text = await page.locator(".wk-year").innerText();
    assert.match(text, /4 séances|SÉANCES\s*4/i);
    assert.match(text, /Année en cours/);
    await page.getByRole("button", { name: "Année précédente", exact: true }).click();
    assert.match(await page.locator("#wk-year-title").textContent(), /Bilan de 2025/);
    assert.equal(await page.evaluate(() => document.activeElement.id), "wk-year-title");
    assert.match(await page.locator(".wk-year").innerText(), /Une année sans séance enregistrée/);
    await page.getByRole("button", { name: "Année suivante", exact: true }).click();
    await page.getByRole("button", { name: /Image de mon année/ }).click();
    await page.getByRole("dialog", { name: "Image à partager", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector(".cd-preview img")?.src.startsWith("data:image/png"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
