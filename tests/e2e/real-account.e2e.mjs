// What a real visitor and a real signed-in account receive. Every other journey cuts the network, so it runs with all the server
// flags off and as a guest; production answers 21 flags on (tools/visual/flags-production.json) and a signed-in account gets the
// server blocks. The Programme redesign was only ever looked at in the first state, and the second one was broken: the Séance page
// opened on the GPX import with its header covered, the QG ran 6 700 px and scrolled sideways, so did the Communauté, and the coach
// tools had no style. These journeys hold the main pages in the state people actually see, at a small phone, a phone and a desktop.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { buildConnectedData, connectedScript } from "../../tools/visual/fixture-connected.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const FLAGS = JSON.parse(readFileSync(ROOT + "tools/visual/flags-production.json", "utf8"));
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

async function open(path, { width = 390, connected = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, locale: "fr-FR", timezoneId: "Europe/Paris", serviceWorkers: "block", reducedMotion: "reduce" });
  const host = new URL(BASE).host;
  await context.route(url => url.host !== host, route => /\/rpc\/titan_feature_flags_v1$/.test(new URL(route.request().url()).pathname)
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ flags: FLAGS.flags, version: FLAGS.version }) })
    : route.abort("internetdisconnected"));
  if (connected) {
    const script = connectedScript(buildConnectedData());
    await context.route(url => url.host === host && /\/js\/config\.js$/.test(url.pathname), async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()) + script }); });
  }
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForFunction(() => window.state?.user && window.titanFlags?.enabled("screens.activityhub"), null, { timeout: 10000 });
  await page.waitForTimeout(1800);
  return { page, context, errors };
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// The element under the middle of the bottom of the screen must be the tab bar, not something laid over it.
const tabBarOnTop = page => page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight - 24)?.closest(".asc-tabbar"));

const PAGES = ["/aujourdhui", "/training", "/journal", "/stats", "/records", "/carriere", "/adventure", "/social", "/coaching", "/profile", "/boutique", "/objectifs", "/prevoir"];
for (const width of [320, 390, 1440]) {
  test(`a signed-in account under the production flags, ${width} px: no page scrolls sideways, none throws, the navigation stays reachable`, async () => {
    for (const path of PAGES) {
      const { page, context, errors } = await open(path, { width });
      try {
        assert.ok(await sideways(page) <= 1, `${path} at ${width} px scrolls sideways by ${await sideways(page)} px`);
        if (width < 960) assert.equal(await tabBarOnTop(page), true, `${path} at ${width} px: something covers the tab bar`);
        assert.deepEqual(errors, [], `${path} at ${width} px`);
        assert.deepEqual(await page.evaluate(() => [...(window.__unmockedRpc || [])]), [], `${path}: a server call the fixture does not answer`);
      } finally { await context.close(); }
    }
  });
}

test("QG of a signed-in account: the practice first, the seven optional blocks folded into one list that remembers what is open", async () => {
  const { page, context, errors } = await open("/aujourdhui");
  try {
    const rows = page.locator("#qg .qg-more details.asc-fold");
    assert.ok(await rows.count() >= 6, `only ${await rows.count()} optional rows`);
    assert.equal(await page.locator("#qg .qg-more details.asc-fold[open]").count(), 0, "all folded on a first visit");
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight) < 4500, "the QG stays a short page on a phone");
    // Each row says where it stands in one line.
    assert.match(await page.locator("#qg-more-bd > summary").innerText(), /TITAN Duo\s+Avec \S+ · \d+\/\d+ jours actifs/);
    assert.match(await page.locator("#qg-more-rk > summary").innerText(), /Classement entre amis\s+\d+e[r]? sur \d+/);
    // The hero, the week and the last sessions come before the list.
    const order = await page.evaluate(() => ["#qg-hero-title", "#qg-week", "#qg-last", "#qg-more-title"].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top + scrollY)));
    assert.deepEqual([...order].sort((a, b) => a - b), order, "hero, week, last sessions, then the optional list");
    await page.locator("#qg-more-ss > summary").click();
    await page.locator("[data-ss-current]").waitFor();
    assert.ok(await sideways(page) <= 1, "an opened row stays inside the screen");
    // The toggle event is delivered after the row opens: wait for the device to have remembered it rather than read at once.
    await page.waitForFunction(() => localStorage.getItem("titan_qg_open_v1") === '["ss"]', null, { timeout: 5000 });
    await page.reload({ waitUntil: "load" });
    await page.locator("#qg-more-ss[open] [data-ss-current]").waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("Communauté of a signed-in account: the optional panels are folded rows under « Plus loin », and a link opens its row", async () => {
  const { page, context, errors } = await open("/social");
  try {
    const more = page.locator("#communaute-extras");
    await more.waitFor();
    assert.deepEqual(await more.locator("details.asc-fold:visible > summary .asc-row-title").allInnerTexts(), ["Votes et idées", "Défis par lien", "Clubs", "Factions", "Panthéon"]);
    assert.equal(await more.locator("details.asc-fold[open]").count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight) < 7000, "the page no longer lays every panel out in full");
    await page.evaluate(() => { location.hash = "#clubs"; });
    await page.locator("details.asc-fold[data-extra=clubs][open] #clubs").waitFor();
    assert.ok(await sideways(page) <= 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("Séance with the production flags: the sport question first, the header field intact, import one tap away", async () => {
  for (const width of [320, 390, 1440]) {
    const { page, context, errors } = await open("/training", { width, connected: false });
    try {
      await page.locator("#sport-q").waitFor();
      assert.equal(await page.locator("[data-activity-hub]").count(), 0, "the page does not open on the import");
      assert.equal(await page.evaluate(() => document.getElementById("seance").firstElementChild.matches("header.asc-page-head.seance-field")), true, "the page header comes first");
      const head = await page.locator("#seance > header").boundingBox();
      const modes = await page.locator(".seance-modes").boundingBox();
      assert.ok(modes.y >= head.y && modes.y + modes.height <= head.y + head.height + 1, "the switch sits inside the field");
      assert.ok(await sideways(page) <= 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("Coaching of a signed-in account: messages are a thread, mine on the other side, and nothing reserved for screen readers is printed", async () => {
  const { page, context, errors } = await open("/coaching");
  try {
    await page.locator(".co-thread .co-msg").first().waitFor();
    const theirs = await page.locator(".co-msg:not(.is-mine)").first().boundingBox(), mine = await page.locator(".co-msg.is-mine").first().boundingBox();
    assert.ok(mine.x > theirs.x + 20, "my messages sit on the right");
    assert.notEqual(await page.locator(".co-msg").first().evaluate(e => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)", "a message is a bubble");
    const label = await page.locator("[data-ct-send] .asc-sr").boundingBox();
    assert.ok(!label || (label.width <= 1 && label.height <= 1), "the screen-reader label is not printed");
    assert.equal(await page.locator(".co-checkins").evaluate(e => getComputedStyle(e).listStyleType), "none");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
