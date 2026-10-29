// Google Analytics 4 opt-in: nothing reaches Google before an explicit "Accepter"; "Refuser" and the "Statistiques" button keep the choice
// reversible; excluded pages never load the tag. Every request to Google is intercepted here: nothing leaves the machine.
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

async function visit(path, { choice = null, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: "block" });
  // The suite-wide preload pre-answers the banner; this file wants the real first visit (or a chosen answer).
  await context.addInitScript(choice => {
    if (sessionStorage.getItem("ga4_test_seeded")) return; // once per tab: a reload must keep what the page itself stored
    sessionStorage.setItem("ga4_test_seeded", "1");
    if (choice === null) localStorage.removeItem("titan_ga4_consent_v1"); else localStorage.setItem("titan_ga4_consent_v1", choice);
  }, choice);
  const google = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => { google.push(route.request().url()); return route.abort("internetdisconnected"); });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + path);
  await page.waitForTimeout(600);
  return { page, context, google, errors };
}
const asksGoogle = list => list.filter(u => /google/i.test(new URL(u).hostname));

test("first visit: the banner asks, and nothing is requested from Google until the answer is yes", async () => {
  const { page, context, google, errors } = await visit("/");
  try {
    const banner = page.locator(".titan-ga4-banner");
    await banner.waitFor();
    assert.equal(await banner.getAttribute("role"), "region");
    assert.match(await banner.innerText(), /Aucun suivi Google sans ton accord/);
    assert.deepEqual(asksGoogle(google), [], "no request before the answer");
    assert.equal(await page.evaluate(() => typeof window.gtag), "undefined");
    await banner.getByRole("button", { name: "Refuser" }).click();
    await page.waitForFunction(() => !document.querySelector(".titan-ga4-banner"));
    assert.equal(await page.evaluate(() => localStorage.getItem("titan_ga4_consent_v1")), "denied");
    await page.waitForTimeout(300);
    assert.deepEqual(asksGoogle(google), [], "a refusal never reaches Google");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("accepting loads the tag with consent mode and without the query string; the choice can be taken back from the Statistiques button", async () => {
  const { page, context, google } = await visit("/?utm=secret#frag");
  try {
    await page.locator(".titan-ga4-banner").getByRole("button", { name: "Accepter" }).click();
    await page.waitForFunction(() => localStorage.getItem("titan_ga4_consent_v1") === "granted");
    await page.waitForTimeout(500);
    const asked = asksGoogle(google);
    assert.ok(asked.some(u => u.includes("googletagmanager.com/gtag/js")), "the loader is requested after the yes");
    const events = await page.evaluate(() => JSON.stringify(window.dataLayer.map(a => Array.from(a))));
    assert.match(events, /"consent","default",\{[^}]*"analytics_storage":"denied"/);
    assert.match(events, /"consent","update",\{"analytics_storage":"granted"\}/);
    assert.ok(!events.includes("utm=secret") && !events.includes("frag"), "no query string or fragment is transmitted");
    assert.match(events, /"page_location":"http:\/\/127\.0\.0\.1:\d+\/"/);
    await page.getByRole("button", { name: "Gérer les statistiques Google Analytics" }).click();
    await page.locator(".titan-ga4-banner").getByRole("button", { name: "Refuser" }).click();
    await page.waitForFunction(() => localStorage.getItem("titan_ga4_consent_v1") === "denied");
  } finally { await context.close(); }
});

test("a returning refusal stays quiet, and the pages excluded from the tag never load it even after a yes", async () => {
  const quiet = await visit("/", { choice: "denied" });
  try {
    assert.equal(await quiet.page.locator(".titan-ga4-banner").count(), 0);
    assert.deepEqual(asksGoogle(quiet.google), []);
  } finally { await quiet.context.close(); }
  for (const path of ["/u/abcd123456", "/update-password", "/supprimer-mon-compte"]) {
    const { page, context, google } = await visit(path, { choice: "granted" });
    try { assert.deepEqual(asksGoogle(google), [], `${path} stays out of the tag`); assert.equal(await page.evaluate(() => typeof window.gtag), "undefined"); }
    finally { await context.close(); }
  }
});

test("the banner and its button stay inside a phone screen and the banner does not hide the page for ever", async () => {
  const { page, context } = await visit("/", { width: 360 });
  try {
    const box = await page.locator(".titan-ga4-banner").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360, "inside the width");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator(".titan-ga4-banner").getByRole("button", { name: "Refuser" }).click();
    const button = await page.locator(".titan-ga4-settings").boundingBox();
    assert.ok(button.height >= 24, "the reopening button is a usable target");
  } finally { await context.close(); }
});
