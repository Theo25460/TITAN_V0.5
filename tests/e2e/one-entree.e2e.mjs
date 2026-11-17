// « Signature », lot 1 — the entry of the app. The navigation is drawn by shell-nav.js before the content and without shell.js;
// the sub-navigation is in the page; TITAN's own reduced motion applies from the first frame; the QG wears its rank on a plate;
// onboarding and sign-in open on the valley and hold at 320 px.
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

async function open(path, { width = 390, height = 844, storage = {}, block = null, js = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", javaScriptEnabled: js });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  if (block) await context.route(block, route => route.abort());
  await context.addInitScript(entries => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, storage);
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  return { page, context };
}
const REMEMBERED = JSON.stringify({ id: "u-1", guest: false, name: "Camille R.", level: 14, avatar: "ranger", frame: null, rank: "gardien" });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("the navigation is drawn without shell.js, from what the device remembers, in the current space", async () => {
  const { page, context } = await open("/stats", { storage: { titan_shell_nav_v1: REMEMBERED }, block: /\/js\/app\/shell\.js/ });
  try {
    const tabs = page.locator(".asc-tabbar a");
    await tabs.first().waitFor();
    assert.equal(await tabs.count(), 5);
    assert.equal(await page.locator('.asc-tabbar a[aria-current="page"]').getAttribute("href"), "/stats");
    assert.match(await page.locator(".asc-topbar .asc-me").innerText(), /NIV 14/);
    assert.equal(await page.locator(".asc-rail-foot strong").textContent(), "Camille R.");
    assert.equal(await page.locator(".asc-rail-foot .asc-nav-crest").getAttribute("src"), "/assets/ranks/gardien-256.webp");
  } finally { await context.close(); }
});

test("a first visit draws the visitor's navigation; the tab bar ends the document once the page is read", async () => {
  const { page, context } = await open("/aujourdhui", { width: 1440, height: 900 });
  try {
    await page.waitForFunction(() => window.titanShell && document.readyState === "complete");
    assert.equal(await page.locator(".asc-rail-foot strong").textContent(), "Découverte");
    assert.equal(await page.locator(".asc-rail-foot .asc-nav-crest").count(), 0);
    await page.waitForFunction(() => document.querySelector(".asc-tabbar")?.dataset.placed === "1");
    assert.equal(await page.evaluate(() => { const order = [...document.body.children].filter(el => el.matches("main, .asc-tabbar")).map(el => el.tagName); return order.join(">"); }), "MAIN>NAV");
    assert.equal(await page.locator(".asc-rail, .asc-topbar, .asc-tabbar").count(), 3);
  } finally { await context.close(); }
});

test("the pages of Progrès and Séance are links in the page itself, the current one marked, scripts or not", async () => {
  for (const [path, count] of [["/journal", 5], ["/records", 5], ["/prevoir", 2]]) {
    const { page, context } = await open(path, { js: false });
    try {
      const links = page.locator("nav[data-subnav] a");
      assert.equal(await links.count(), count, path);
      assert.equal(await page.locator('nav[data-subnav] a[aria-current="page"]').getAttribute("href"), path);
    } finally { await context.close(); }
  }
});

test("TITAN's own « Animations réduites » is on the document before the shell is read", async () => {
  const { page, context } = await open("/journal", { storage: { titan_motion_v1: "reduced" }, block: /\/js\/app\/shell\.js/ });
  try {
    await page.locator(".asc-tabbar a").first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-motion")), "reduced");
  } finally { await context.close(); }
});

test("QG: the rank is a plate with its crest; nothing leaves a 320 px screen", async () => {
  const { page, context } = await open("/aujourdhui", { width: 320, height: 700 });
  try {
    await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && document.querySelector(".qg-ascent"));
    const crest = page.locator(".qg-ascent .qg-crest .crest");
    await crest.waitFor();
    assert.ok((await crest.boundingBox()).width >= 48);
    assert.match(await page.locator("#qg-ascent").textContent(), /Niveau 1/);
    assert.ok(await overflow(page) <= 0);
  } finally { await context.close(); }
});

test("onboarding and sign-in open on the valley, usable at 320 px and on a wide screen", async () => {
  for (const [width, height] of [[320, 640], [1440, 900]]) {
    const ob = await open("/onboarding", { width, height });
    try {
      await ob.page.locator(".ob-steps[role=progressbar]").waitFor();
      assert.ok(await ob.page.evaluate(async () => { const img = document.querySelector(".ob-art > img"); await img.decode().catch(() => {}); return img.naturalWidth > 0; }));
      assert.ok(await overflow(ob.page) <= 0, `onboarding ${width}`);
      assert.equal(await ob.page.locator(".ob-art-copy").isVisible(), width >= 960);
      // The first step is still fully operable on the painting: a sport can be chosen and the flow goes on.
      await ob.page.locator(".ob-body button, .ob-body [role=option], .ob-body .seance-chip").first().click();
      await ob.page.locator(".ob-nav [data-next]").click();
      await ob.page.waitForFunction(() => document.querySelector(".ob-steps")?.getAttribute("aria-valuenow") === "2");
    } finally { await ob.context.close(); }
    const auth = await open("/login", { width, height });
    try {
      await auth.page.locator("#auth input[type=email]").waitFor();
      assert.ok(await overflow(auth.page) <= 0, `login ${width}`);
      assert.ok(await auth.page.locator("#auth-title").isVisible());
    } finally { await auth.context.close(); }
  }
});
