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

// Real Atelier page/shell with a synthetic RPC contract. No signed-in production account.
async function atelierPage(width, plus = false, legacy = false) {
  const fixture = await newPage(width);
  await fixture.page.route("**/js/app/atelier.js?*", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await fixture.page.goto(BASE + "/boutique", { waitUntil: "load" });
  await fixture.page.evaluate(({ plus, legacy }) => {
    window.state.user.id = "00000000-0000-4000-8000-000000000123";
    const items = [
      { id: "cos_frame_standard", cosmetic: "frame-standard", slot: "frame", name: "Standard", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_frame_aegis", cosmetic: "frame-aegis", slot: "frame", name: "Cadre Aegis", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1400, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_map_default", cosmetic: "map-default", slot: "map", name: "Vallée", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_map_aurora", cosmetic: "map-aurora", slot: "map", name: "Aurores", unlock: "credits", price: 1000, owned: plus, permanent: false, plus_access: true },
      { id: "cos_card_default", cosmetic: "card-default", slot: "card", name: "Classique", unlock: "default", price: 0, owned: true, permanent: true },
    ];
    window.atelierFixture = { credits: 2000, level: 1, week_credits: 0, week_credit_cap: 960, plus: { active: plus }, appearance: {}, items };
    window.atelierCalls = [];
    window.titanClient = { rpc: async (name, params) => {
      window.atelierCalls.push({ name, params });
      const d = window.atelierFixture;
      if (name === "titan_atelier") return { data: structuredClone(d) };
      const item = d.items.find((i) => i.id === (params.p_item_id || params.p_item));
      if (name === "titan_purchase_shop_item") {
        d.credits -= item.price;
        item.owned = item.permanent = true;
        return { data: [{ credits_after: d.credits }] };
      }
      if (name === "titan_set_appearance") {
        d.appearance[params.p_slot] = item.cosmetic;
        return { data: structuredClone(d.appearance) };
      }
      throw new Error("Unexpected fixture RPC: " + name);
    } };
  }, { plus, legacy });
  await fixture.page.addScriptTag({ path: ROOT + "/js/app/atelier.js" });
  await fixture.page.waitForSelector("[data-buy], [data-wear], [data-goto-plus]");
  return fixture;
}

test("atelier: Free can buy a formerly exclusive frame permanently at 360 and 1280 px", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await atelierPage(width);
    assert.match(await page.locator('[data-buy="cos_frame_aegis"]').innerText(), /Débloquer/);
    assert.match(await page.locator("#collection").innerText(), /1[\s\u202f\u00a0]?400/);
    if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: `/tmp/titan-fair-free-${width}.png`, fullPage: true });
    await page.click('[data-buy="cos_frame_aegis"]');
    assert.match(await page.locator("dialog[open]").innerText(), /gardée dans ta collection|permanent/i);
    await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
    await page.waitForSelector("dialog[open]", { state: "hidden" });
    assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
    assert.match(await page.locator("#collection").innerText(), /Acquis définitivement/);
    assert.equal(await page.evaluate(() => window.state.user.credits), 600);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `Atelier overflow at ${width}`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("atelier: a subscriber can purchase a borrowed piece and keep it when Titan+ ends", async () => {
  const { page, context, errors } = await atelierPage(360, true);
  assert.match(await page.locator("#collection").innerText(), /Accès temporaire TITAN\+/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').evaluate((b) =>
    b.getBoundingClientRect().right <= b.closest(".at-body").getBoundingClientRect().right + 1), true, "purchase control stays inside its card body");
  if (process.env.TITAN_QA_SCREENSHOTS) await page.screenshot({ path: "/tmp/titan-fair-plus-360.png", fullPage: true });
  await page.click('[data-buy="cos_frame_aegis"]');
  await page.getByRole("button", { name: "Débloquer et porter", exact: true }).click();
  await page.waitForSelector("dialog[open]", { state: "hidden" });
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.plus.active = false;
    for (const i of d.items) if (!i.permanent) i.owned = false;
    dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => window.state.user.is_elite === false);
  assert.match(await page.locator("#collection").innerText(), /Acquis définitivement/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
  assert.equal(await page.evaluate(() => window.state.user.appearance.frame), "frame-aegis");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: an older server shows a catalog update notice without inventing a free price", async () => {
  const { page, context, errors } = await atelierPage(360, false, true);
  assert.match(await page.locator("#atelier").innerText(), /Mise à jour du catalogue en attente/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
  assert.equal(await page.locator("[data-goto-plus]").count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
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
