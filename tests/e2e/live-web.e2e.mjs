// TITAN LIVE on the web: hidden behind screens.live, then a racket session lives on the scoreboard, survives a reload,
// keeps the caret while the clock ticks, and hands a bounded journal to the usual session form.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((resolve) => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise((r) => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const fresh = () => browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" }).then(async (c) => { await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected")); return c; });
const flagOn = (page) => page.evaluate(() => { window.titanFlags.enabled = (k, d) => (k === "screens.live" ? true : d); window.dispatchEvent(new Event("titan:flags-updated")); });

test("live: off by default, then a badminton session from preparation to the session form", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/seance-live?sport=badminton");
    await page.waitForFunction(() => window.state?.user && document.querySelector("#live h1"));
    assert.match(await page.locator("#live").innerText(), /Bientôt disponible/);
    await flagOn(page);
    assert.match(await page.locator("#live").innerText(), /La Joute/i);
    assert.equal(await page.locator('[data-act="immersion"]').count(), 4);
    await page.click('[data-act="intent"][data-v="depasser"]');
    await page.click('[data-act="start"]');
    for (const won of [1, 1, 1, 0]) await page.click(`[data-act="point"][data-v="${won}"]`);
    await page.click('[data-act="game"][data-v="1"]');
    assert.match(await page.locator(".live-cue").innerText(), /Élan du duel/i);
    await page.click('[data-act="view"][data-v="aventure"]');
    assert.equal(await page.locator(".live-node.on").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    await page.reload();
    await page.waitForFunction(() => window.state?.user && window.titanFlags);
    await flagOn(page);
    await page.click('[data-act="view"][data-v="sport"]');
    assert.match(await page.locator('[data-act="point"][data-v="1"]').innerText(), /· 3/);

    await page.click('[data-act="finish"]');
    await page.click('[data-act="rpe"][data-v="7"]');
    await page.click('[data-act="keep"]');
    await page.waitForURL(/\/training\?sport=badminton/);
    await page.waitForFunction(() => document.querySelector("#seance")?.textContent.includes("Brouillon repris"));
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem(window.TitanData.sessionDraftKey(window.state.user.id))));
    assert.equal(draft.live.voie, "joute");
    assert.equal(draft.live.fields.pointsWon, 3);
    assert.equal(draft.extras.sets_won, 1);
    assert.ok(JSON.stringify(draft.live).length < 2048);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("live: typing a set is never interrupted by the clock, and risky sports offer no audio", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    await page.goto(BASE + "/seance-live?sport=muscu_gym");
    await page.waitForFunction(() => window.state?.user && window.titanFlags && document.querySelector("#live h1"));
    await flagOn(page);
    await page.click('[data-act="start"]');
    await page.click('[data-k="exercise"]');
    await page.keyboard.type("Dév");
    await page.waitForTimeout(2200);
    await page.keyboard.type("eloppé");
    assert.equal(await page.inputValue('[data-k="exercise"]'), "Développé");
    await page.click('[data-act="set"]');
    assert.match(await page.locator("#live").innerText(), /La braise refroidit/i);
    await page.click('[data-act="finish"]');
    // An ended session stays until it is kept or abandoned (with confirmation): it never blocks silently.
    page.once("dialog", (d) => d.accept());
    await page.click('[data-act="abandon"]');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("titan_live_v1:"))), false);

    await page.goto(BASE + "/seance-live?sport=kitesurf");
    await page.waitForFunction(() => window.state?.user && window.titanFlags && document.querySelector("#live h1"));
    await flagOn(page);
    const disabled = await page.locator('[data-act="immersion"][disabled]').allInnerTexts();
    assert.deepEqual(disabled.sort(), ["Audio", "Aventure narrative", "Notifications"].sort());
    assert.match(await page.locator("#live").innerText(), /TITAN ne te sollicitera pas/);
  } finally { await context.close(); }
});
