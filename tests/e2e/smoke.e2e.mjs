// TITAN 300 — end-to-end smoke tests on the built site (dist/), in Chromium, network to third parties cut.
// Run: pnpm run test:e2e   (builds dist, serves it on a free port, drives a real browser)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server;
let browser;
let BASE;

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function newPage(width = 390) {
  const context = await browser.newContext({ viewport: { width, height: width > 900 ? 900 : 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, context, errors };
}

test("landing: one h1, the start call to action, no horizontal scroll", async () => {
  const { page, errors } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator('a.asc-btn-primary[href="/onboarding"]').first().isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
});

test("guest: record a run, then find it in the journal and the week", async () => {
  const { page, errors } = await newPage();
  await page.goto(BASE + "/training", { waitUntil: "load" });
  await page.fill("#sport-q", "course");
  await page.click('#sport-results [data-sport="running"]');
  await page.fill('[data-k="distance"]', "10");
  await page.fill('[data-k="durM"]', "52");
  await page.click('[data-rpe="6"]');
  await page.click('[data-act="save"]');
  await page.waitForSelector("dialog.asc-sheet[open]", { timeout: 5000 });
  const moment = await page.locator("dialog.asc-sheet[open]").innerText();
  assert.match(moment, /10 km/);
  await page.goto(BASE + "/journal", { waitUntil: "load" });
  await page.waitForTimeout(500);
  assert.match(await page.locator("#journal").innerText(), /Course à pied/);
  await page.goto(BASE + "/stats", { waitUntil: "load" });
  await page.waitForTimeout(500);
  assert.match(await page.locator(".wk-hero").innerText(), /52 min|1 jour actif/);
  assert.deepEqual(errors, []);
});

test("validation: a run without distance or duration is refused on the field", async () => {
  const { page } = await newPage();
  await page.goto(BASE + "/training?sport=running", { waitUntil: "load" });
  await page.waitForSelector('[data-act="save"]');
  await page.click('[data-act="save"]');
  await page.waitForTimeout(300);
  assert.ok((await page.locator('[aria-invalid="true"]').count()) >= 1);
});

test("private pages are noindex, public guides are indexable", async () => {
  for (const [path, indexable] of [["/aujourdhui", false], ["/journal", false], ["/profile", false], ["/boutique", false], ["/u/abcdefghij", false], ["/tarifs", true], ["/niveaux-et-xp", true]]) {
    const html = await (await fetch(BASE + path)).text();
    const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1] || "";
    assert.equal(/noindex/.test(robots), !indexable, `${path}: ${robots}`);
  }
});

test("app pages fit a 360 px screen without errors", async () => {
  const { page, errors } = await newPage(360);
  for (const path of ["/aujourdhui", "/training", "/journal", "/stats", "/records", "/objectifs", "/prevoir", "/adventure", "/profile", "/social", "/coaching", "/boutique", "/onboarding", "/login"]) {
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${path} overflows`);
  }
  assert.deepEqual(errors, []);
});

test("offline: the app shell opens from the service worker cache", async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const own = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 600));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
    const page = await context.newPage();
    await page.goto(origin + "/aujourdhui", { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("titan_sw_dev", "1"));
    await page.reload({ waitUntil: "load" });
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
    await page.waitForFunction(async () => (await (await caches.open("titan-os-v300-ascension")).keys()).length > 50, null, { timeout: 30000 });
    own.kill();
    await new Promise((r) => setTimeout(r, 300));
    await page.goto(origin + "/training", { waitUntil: "load" });
    assert.match(await page.title(), /Séance|séance/);
    await page.goto(origin + "/fonctionnalites", { waitUntil: "load" });
    assert.match(await page.title(), /Hors ligne/);
    await context.close();
  } finally {
    own.kill();
  }
});

// Local fixtures only: no session is written to the backend or persisted in the user's account.
async function seedSports(page, count = 200) {
  await page.waitForFunction(() => window.state?.user && window.TitanProgress && window.TitanSports);
  return page.evaluate((count) => {
    const sports = window.TitanSports.all().slice(0, count);
    window.state.user.favoriteSports = [sports.at(-1).id];
    window.state.history = sports.map((s, i) => ({
      id: `fixture-${i}`, sport: s.id, unit: "min", val: 30, xp: 0,
      date: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      details: { duration: 30 },
    }));
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
    return { count: sports.length, target: sports.at(-1), first: sports[0] };
  }, count);
}

test("records: 200 sports are paginated, searchable and retain their source session", async () => {
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/records", { waitUntil: "load" });
  const fixture = await seedSports(page);
  assert.equal(fixture.count, 200);
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".rc-sport").count(), 12, "only a bounded page of sports is rendered");
  await page.getByRole("button", { name: "Page suivante" }).click();
  assert.equal(await page.locator(".rc-sport").count(), 12);
  await page.getByRole("searchbox", { name: "Rechercher un sport" }).fill(fixture.target.label);
  await page.waitForTimeout(100);
  assert.ok(await page.locator(".rc-sport").count() <= 12);
  assert.match(await page.locator("#records").innerText(), new RegExp(fixture.target.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.locator(".rc-sport [data-record]").first().click();
  assert.equal(await page.locator('dialog[open] a[href^="/journal?session="]').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("mastery: the 200th sport is reachable, filters survive updates and typing retains focus", async () => {
  const { page, context, errors } = await newPage(360);
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  const fixture = await seedSports(page);
  await page.waitForTimeout(150);
  const search = page.getByRole("searchbox", { name: "Rechercher un sport" });
  assert.equal(await search.count(), 1, "mastery offers a search beyond the original eight rows");
  await search.pressSequentially(fixture.target.label, { delay: 15 });
  assert.equal(await search.inputValue(), fixture.target.label);
  assert.equal(await search.evaluate(el => el === document.activeElement), true);
  await page.selectOption("#mastery-scope", "favorites");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("titan:history-updated")));
  await page.waitForTimeout(100);
  assert.equal(await page.inputValue("#mastery-scope"), "favorites");
  assert.equal(await page.locator("#maitrise .pf-mastery-row").count(), 1);
  assert.ok((await page.locator("#maitrise").innerText()).includes(fixture.target.label));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("navigation: empty searches, no-data favorites, and small accounts remain usable", async () => {
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/records", { waitUntil: "load" });
  await seedSports(page, 2);
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".rc-sport").count(), 2);
  const search = page.getByRole("searchbox", { name: "Rechercher un sport" });
  await search.fill("<img src=x onerror=alert(1)>");
  assert.equal(await page.locator(".rc-sport").count(), 0);
  assert.equal(await page.locator("[data-nav-empty]").count(), 1);
  assert.equal(await page.locator("#records img").count(), 0);
  await search.fill("");
  await page.evaluate(() => {
    window.state.user.favoriteSports = ["yoga"];
    window.state.history = [];
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  });
  await page.waitForTimeout(100);
  await page.selectOption("#records-scope", "favorites");
  await page.getByRole("checkbox", { name: "Masquer les sports sans données" }).uncheck();
  assert.equal(await page.locator(".rc-sport").count(), 1);
  assert.ok((await page.locator(".rc-sport").innerText()).includes("Yoga"));
  assert.equal(await page.locator(".rc-sport [data-record]").count(), 0, "no fictitious record for an unpractised sport");
  assert.deepEqual(errors, []);
  await context.close();
});

test("installed PWA: new navigation does not use the previous CSS or analytics cache", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + "/aujourdhui", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("titan_sw_dev", "1"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.evaluate(async () => {
    const cache = await caches.open("titan-os-v300-ascension");
    await cache.put("/css/ascension-app.css?v=300.0", new Response(".rc-sport { display: block; }", { headers: { "content-type": "text/css" } }));
    await cache.put("/js/app/analytics.js?v=300.0", new Response('window.TitanAnalytics = {EVENTS: new Set(["first_session"]), track: async () => false};', { headers: { "content-type": "text/javascript" } }));
  });
  await page.goto(BASE + "/records", { waitUntil: "load" });
  await page.waitForSelector(".sn-selects");
  assert.equal(await page.locator(".sn-selects").evaluate(el => getComputedStyle(el).display), "grid");
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_searched")), true);
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_filtered")), true);
  await context.close();
});
