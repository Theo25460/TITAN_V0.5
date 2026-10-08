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
      { id: "cos_frame_frost", cosmetic: "frame-frost", slot: "frame", name: "Cadre Givre", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1400, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_map_default", cosmetic: "map-default", slot: "map", name: "Vallée", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_map_aurora", cosmetic: "map-aurora", slot: "map", name: "Aurores", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 1000, owned: plus, permanent: false, plus_access: !legacy },
      { id: "cos_card_default", cosmetic: "card-default", slot: "card", name: "Classique", unlock: "default", price: 0, owned: true, permanent: true },
      { id: "cos_card_obsidian", cosmetic: "card-obsidian", slot: "card", name: "Obsidienne", unlock: legacy ? "plus" : "credits", price: legacy ? 0 : 800, owned: plus, permanent: false, plus_access: !legacy },
    ];
    if (legacy) {
      items.push({ id: "cos_frame_neon", cosmetic: "frame-neon", slot: "frame", name: "Néon", unlock: "credits", price: 450, owned: true });
      for (const i of items) { delete i.permanent; delete i.plus_access; }
    }
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
    assert.equal(await page.evaluate(() => window.titanShell.look().frame), "frame-aegis", "earned frame reaches the shared shell");
    await page.locator('.asc-avatar[data-frame="frame-aegis"]').first().waitFor({ state: "attached" });
    assert.ok(await page.locator('.asc-avatar[data-frame="frame-aegis"]').count(), "navigation displays the earned frame");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `Atelier overflow at ${width}`);
    assert.deepEqual(errors, []);
    const resolved = await page.evaluate(() => window.atelierFixture);
    await page.goto(BASE + "/profile", { waitUntil: "load" });
    await page.evaluate(async (resolved) => {
      const u = window.state.user;
      u.id = "00000000-0000-4000-8000-000000000123";
      u.is_elite = false;
      // Reconnection restores a raw stored preference containing an old, expired borrowed ambiance.
      u.appearance = { frame: "frame-aegis", map: "map-aurora" };
      delete u.appearanceAccess;
      window.titanClient = { rpc: async (name) => name === "titan_atelier" ? { data: resolved } : { error: { code: "PGRST202" } } };
      await window.titanSyncAppearance();
      window.titanShell.refresh();
      dispatchEvent(new CustomEvent("titan:history-updated"));
    }, resolved);
    await page.waitForSelector('.pf-avatar[data-frame="frame-aegis"]');
    const sportFixture = await seedSports(page);
    await page.getByRole("searchbox", { name: "Rechercher un sport" }).fill(sportFixture.target.label);
    await page.selectOption("#mastery-scope", "favorites");
    await page.waitForSelector("#maitrise .pf-mastery-row");
    assert.equal(await page.locator("#maitrise .pf-mastery-row").count(), 1);
    assert.equal(await page.locator('.pf-avatar[data-frame="frame-aegis"]').count(), 1, "200-sport mastery rerenders keep the acquired frame");
    assert.equal(await page.evaluate(() => window.titanShell.look().map), undefined, "raw expired preference is never reauthorized on navigation");
    assert.equal(await page.evaluate(async (resolved) => {
      let finish;
      window.titanClient.rpc = () => new Promise((resolve) => { finish = resolve; });
      const pending = window.titanSyncAppearance();
      window.state.user.id = "00000000-0000-4000-8000-000000000456";
      window.state.user.appearance = {};
      finish({ data: resolved });
      await pending;
      return window.titanShell.look().frame;
    }, resolved), undefined, "late response from the previous user is ignored");
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
  assert.equal(await page.evaluate(() => window.titanShell.look().frame), "frame-aegis", "permanent access survives expiry on all shell consumers");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: an older server shows a catalog update notice without inventing a free price", async () => {
  const { page, context, errors } = await atelierPage(360, false, true);
  assert.match(await page.locator("#atelier").innerText(), /Mise à jour du catalogue en attente/);
  assert.equal(await page.locator('[data-buy="cos_frame_aegis"]').count(), 0);
  assert.equal(await page.locator("[data-goto-plus]").count(), 2);
  const neon = page.locator('article').filter({ has: page.locator('[data-wear="cos_frame_neon"]') });
  assert.match(await neon.innerText(), /Acquis définitivement/, "legacy purchase without new fields stays permanent");
  assert.deepEqual(errors, []);
  await context.close();
});

test("shell: a borrowed cached style expires by date while an earned style stays visible", async () => {
  const { page, context, errors } = await atelierPage(360, true);
  await page.evaluate(() => {
    const d = window.atelierFixture;
    d.appearance = { frame: "frame-aegis", map: "map-aurora" };
    d.items.find((i) => i.id === "cos_map_aurora").permanent = true;
    d.plus.ends_at = new Date(Date.now() - 1000).toISOString();
    window.titanApplyAtelierAppearance(d, window.state.user.id);
  });
  assert.equal(await page.evaluate(() => window.titanShell.look().frame), undefined, "stale true flag cannot keep a borrowed style");
  assert.equal(await page.evaluate(() => window.titanShell.look().map), "map-aurora", "date does not remove a permanent acquisition");
  assert.deepEqual(errors, []);
  await context.close();
});

test("atelier: a delayed response cannot copy the previous user's balance or appearance", async () => {
  const { page, context, errors } = await atelierPage(360);
  assert.equal(await page.evaluate(async () => {
    let finish;
    const previous = structuredClone(window.atelierFixture);
    previous.appearance = { frame: "frame-aegis" };
    window.titanClient.rpc = () => new Promise((resolve) => { finish = resolve; });
    dispatchEvent(new Event("online"));
    window.state.user.id = "00000000-0000-4000-8000-000000000456";
    window.state.user.appearance = {};
    window.state.user.credits = 777;
    finish({ data: previous });
    await new Promise((r) => setTimeout(r, 30));
    return window.state.user.credits === 777 && !window.state.user.appearance.frame;
  }), true, "obsolete response belongs to the previous user");
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

test("installed PWA: navigation and cosmetic resources bypass the previous cache on the first visit", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + "/aujourdhui", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("titan_sw_dev", "1"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const staleScripts = await Promise.all([["/js/state.js", "state"], ["/js/app/shell.js", "shell"], ["/js/app/atelier.js", "atelier"]]
    .map(async ([path, marker]) => [path, marker, await (await fetch(BASE + path)).text()]));
  await page.evaluate(async (staleScripts) => {
    const cache = await caches.open("titan-os-v300-ascension");
    await cache.put("/css/ascension-app.css?v=300.0", new Response(".rc-sport { display: block; }", { headers: { "content-type": "text/css" } }));
    await cache.put("/js/app/analytics.js?v=300.0", new Response('window.TitanAnalytics = {EVENTS: new Set(["first_session"]), track: async () => false};', { headers: { "content-type": "text/javascript" } }));
    // Keep valid script bodies and mark the stale generation. Cache-first must not serve them
    // to the new page even when a background fetch will replace them for a later visit.
    for (const [path, marker, body] of staleScripts) {
      await cache.put(path + "?v=300.0", new Response(body + `\nwindow.titanPreviousResource ??= {}; window.titanPreviousResource.${marker} = true;`, { headers: { "content-type": "text/javascript" } }));
    }
  }, staleScripts);
  await page.goto(BASE + "/records", { waitUntil: "load" });
  await page.waitForSelector(".sn-selects");
  assert.equal(await page.locator(".sn-selects").evaluate(el => getComputedStyle(el).display), "grid");
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_searched")), true);
  assert.equal(await page.evaluate(() => window.TitanAnalytics.EVENTS.has("sport_navigation_filtered")), true);
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.state)), false, "first navigation loads the new appearance resolver");
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.shell)), false, "first navigation loads the new shared rendering guard");
  assert.equal(await page.evaluate(() => typeof window.titanSyncAppearance), "function");
  await page.goto(BASE + "/boutique", { waitUntil: "load" });
  assert.equal(await page.evaluate(() => Boolean(window.titanPreviousResource?.atelier)), false, "first Atelier visit loads permanent-acquisition controls");
  await context.close();
});
