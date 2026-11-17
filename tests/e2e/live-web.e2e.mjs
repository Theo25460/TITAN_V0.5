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
    for (const won of [1, 1, 1]) await page.click(`[data-act="point"][data-v="${won}"]`);
    // Read right after the third point in a row: a game that ends may draw the Voie's random event (one in ten), which then
    // replaces this line. The earlier order read it after the game and failed about one run in ten.
    assert.match(await page.locator(".live-cue").innerText(), /Élan du duel/i);
    await page.click('[data-act="point"][data-v="0"]');
    await page.click('[data-act="game"][data-v="1"]');
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

test("live: the expedition follows the effort, a plain tick never replaces the buttons, wide screens show both panes", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/seance-live?sport=badminton");
    await page.waitForFunction(() => window.state?.user && window.titanFlags && document.querySelector("#live h1"));
    await flagOn(page);
    await page.click('[data-act="start"]');

    // The session starts at the base camp: nothing lit, the traveller on the camp, the first waypoint announced as next.
    assert.equal(await page.locator(".live-scene .live-node.on").count(), 0);
    assert.equal(await page.locator(".live-scene .live-node.next").count(), 1);
    assert.equal(await page.locator(".live-scene .live-camp").count(), 1);
    assert.equal(await page.locator(".live-scene .live-summit.reached").count(), 0);

    // Two seconds of clock must not rebuild the view: the very same button node is still in the page (a tap landing during a
    // rebuild was lost, and the view was rebuilt every second).
    const finish = await page.locator('[data-act="finish"]').elementHandle();
    const point = await page.locator('[data-act="point"][data-v="1"]').elementHandle();
    const before = await page.locator(".live-clock").innerText();
    await page.waitForFunction((t) => document.querySelector(".live-clock").textContent !== t, before, { timeout: 5000 });
    await page.waitForTimeout(1300);
    assert.equal(await finish.evaluate((n) => n.isConnected), true, "the Terminer button survived the ticks");
    assert.equal(await point.evaluate((n) => n.isConnected), true, "the point button survived the ticks");

    // Each game lights a waypoint; the plan of three games ends on the summit.
    for (let game = 1; game <= 3; game++) {
      await page.click('[data-act="point"][data-v="1"]');
      await page.click('[data-act="game"][data-v="1"]');
      assert.equal(await page.locator(".live-scene .live-node.on").count(), game);
    }
    assert.equal(await page.locator(".live-scene .live-summit.reached").count(), 1);
    assert.match(await page.locator(".live-scene").getAttribute("aria-label"), /3 manches sur 3.*sommet atteint/);

    // Phone: one pane at a time. Wide screen: both, and the switch is gone.
    assert.equal(await page.locator(".live-pane-aventure").isVisible(), false);
    await page.click('[data-act="view"][data-v="aventure"]');
    assert.equal(await page.locator(".live-pane-aventure").isVisible(), true);
    assert.equal(await page.locator(".live-pane-sport").isVisible(), false);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no horizontal scroll at ${width}`);
    }
    await page.setViewportSize({ width: 1280, height: 860 });
    assert.equal(await page.locator(".live-pane-aventure").isVisible(), true);
    assert.equal(await page.locator(".live-pane-sport").isVisible(), true);
    assert.equal(await page.locator(".live-viewseg").isVisible(), false);
    const [sport, scene] = await Promise.all([page.locator(".live-pane-sport").boundingBox(), page.locator(".live-pane-aventure").boundingBox()]);
    assert.ok(scene.x >= sport.x + sport.width - 1, "the expedition sits beside the sport pane");

    // The end of the session opens on its expedition and three figures.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.click('[data-act="finish"]');
    assert.equal(await page.locator(".live-scene .live-node.next").count(), 0);
    assert.equal(await page.locator(".live-recap > div").count(), 3);
    assert.match(await page.locator(".live-recap").innerText(), /3 \/ 3/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("live: the session page offers the live session only when the server opens it, and leads to it", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/training");
    await page.waitForFunction(() => window.state?.user && window.titanFlags && document.querySelector("[data-pick-title]"));
    assert.equal(await page.locator("[data-live-entry]").count(), 0, "nothing is offered while the flag is off");
    // Opening the flag adds the entry in place, without redrawing the page (a search being typed would be lost).
    await page.fill("#q, .seance-search input", "bad").catch(() => {});
    const title = await page.locator("[data-pick-title]").elementHandle();
    await flagOn(page);
    await page.locator("[data-live-entry]").waitFor();
    assert.equal(await title.evaluate((n) => n.isConnected), true);
    assert.match(await page.locator("[data-live-entry]").innerText(), /Vivre la séance en direct/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // Closing it removes the entry again.
    await page.evaluate(() => { window.titanFlags.enabled = (k, d) => d; window.dispatchEvent(new Event("titan:flags-updated")); });
    assert.equal(await page.locator("[data-live-entry]").count(), 0);
    await flagOn(page);
    await page.click("[data-live-entry]");
    await page.waitForURL(/\/seance-live/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// The three intents are three different sessions: stages to tick, one threshold from the last comparable set, or
// discoveries without a single figure. The reference only comes from the journal of the account.
const SHOTS = process.env.TITAN_LIVE_SHOTS || "";
const seedJournal = (page) => page.evaluate(() => {
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const log = (n, weight, reps) => ({ id: `l${n}`, sport: "muscu_gym", date: day(n), unit: "min", val: 55, details: { duration: 55, exercises: [{ name: "Squat", setRows: [{ weight, reps }, { weight: weight - 5, reps: reps + 2 }] }] } });
  window.state.history = [log(9, 55, 8), log(6, 57.5, 8), log(3, 60, 8)];
});

test("live: Atteindre ticks stages, Se dépasser shows one threshold from the last comparable set, Explorer shows no figure", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/seance-live?sport=muscu_gym");
    await page.waitForFunction(() => window.state?.user && document.querySelector("#live h1"));
    await flagOn(page);
    await seedJournal(page);

    // Atteindre: the plan is cut into stages before the start, and each validated set ticks them.
    await page.click('[data-act="intent"][data-v="atteindre"]');
    assert.match(await page.locator(".live-intent").innerText(), /Tes étapes : 3 frappes · 6 frappes · 9 frappes · 12 frappes/);
    assert.match(await page.locator(".live-stake").innerText(), /1 Acier/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/prep-atteindre-390.png`, fullPage: true });
    await page.click('[data-act="start"]');
    await page.fill('[data-k="exercise"]', "Squat");
    assert.match(await page.locator("#live-ref").innerText(), /La dernière fois : 60 kg × 8\./);
    assert.doesNotMatch(await page.locator("#live-ref").innerText(), /Seuil du jour/, "no threshold outside Se dépasser");
    for (let i = 0; i < 3; i++) await page.click('[data-act="set"]');
    await page.click('[data-act="view"][data-v="aventure"]');
    assert.equal(await page.locator(".live-stages li.on").count(), 1);
    assert.match(await page.locator(".live-interlude").innerText(), /\S/, "the rest carries a calm line");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-atteindre-390.png`, fullPage: true });
    page.on("dialog", (d) => d.accept());
    await page.click('[data-act="finish"]');
    assert.match(await page.locator(".live-story").innerText(), /1 étape sur 4 franchie/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/report-atteindre-390.png`, fullPage: true });
    await page.click('[data-act="abandon"]');

    // Se dépasser: one threshold, measured against the last counted session, reserve kept.
    await page.goto(BASE + "/seance-live?sport=muscu_gym");
    await page.waitForFunction(() => window.state?.user && document.querySelector("#live h1"));
    await flagOn(page);
    await seedJournal(page);
    await page.click('[data-act="intent"][data-v="depasser"]');
    assert.match(await page.locator(".live-intent").innerText(), /Un seul seuil aujourd’hui/);
    await page.click('[data-act="start"]');
    await page.fill('[data-k="exercise"]', "squat");
    assert.match(await page.locator("#live-ref").innerText(), /Seuil du jour : 60 kg × 9, ou 62,5 kg/);
    await page.fill('[data-k="load"]', "60");
    await page.fill('[data-k="reps"]', "9");
    await page.click('[data-act="set"]');
    await page.click('[data-act="view"][data-v="aventure"]');
    assert.equal(await page.locator('.live-intent[data-status="done"]').count(), 1);
    assert.match(await page.locator(".live-intent").innerText(), /Seuil franchi sur squat/i);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-depasser-390.png`, fullPage: true });
    await page.click('[data-act="finish"]');
    await page.click('[data-act="abandon"]');

    // Explorer: neither goal nor plan to set, no figure on the adventure view, a notebook of discoveries.
    await page.goto(BASE + "/seance-live?sport=muscu_gym");
    await page.waitForFunction(() => window.state?.user && document.querySelector("#live h1"));
    await flagOn(page);
    await seedJournal(page);
    await page.click('[data-act="intent"][data-v="explorer"]');
    assert.equal(await page.locator('[data-act="goal"]').count(), 0);
    assert.equal(await page.locator('[data-act="plan"]').count(), 0);
    await page.click('[data-act="start"]');
    await page.fill('[data-k="exercise"]', "Fentes bulgares");
    assert.equal((await page.locator("#live-ref").innerText()).trim(), "", "no comparison when exploring");
    await page.click('[data-act="set"]');
    await page.click('[data-act="view"][data-v="aventure"]');
    const adventure = await page.locator(".live-pane-aventure").innerText();
    assert.doesNotMatch(adventure, /\d/, "no figure on the adventure view");
    assert.match(adventure, /Carnet de découvertes[\s\S]*Un mouvement nouveau dans ton répertoire/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-explorer-390.png`, fullPage: true });
    await page.click('[data-act="finish"]');
    assert.equal(await page.locator(".live-recap").count(), 0);
    assert.doesNotMatch(await page.locator(".live-story").innerText(), /\d/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("live: yoga prepares in silence, is never compared, and gravel never gets a relaunch mission", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/seance-live?sport=yoga");
    await page.waitForFunction(() => window.state?.user && document.querySelector("#live h1"));
    await flagOn(page);
    assert.equal(await page.locator('[data-act="immersion"][data-v="silence"]').getAttribute("aria-pressed"), "true");
    await page.click('[data-act="intent"][data-v="depasser"]');
    assert.match(await page.locator(".live-intent").innerText(), /jamais par un chiffre imposé/);
    assert.doesNotMatch(await page.locator("#live").innerText(), /gêne (avant|après|de départ|déclarée)|douleur déclarée/i, "no health data is asked");
    await page.click('[data-act="start"]');
    assert.equal(await page.locator(".live-cue, .live-interlude").count(), 0, "a silent practice shows no line");
    await page.click('[data-act="finish"]');
    assert.ok((await page.locator(".live-story p").count()) >= 3, "the story is told at the end");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/report-yoga-390.png`, fullPage: true });
    page.once("dialog", (d) => d.accept());
    await page.click('[data-act="abandon"]');
    await page.goto(BASE + "/seance-live?sport=gravel");
    await page.waitForFunction(() => window.state?.user && document.querySelector("#live h1"));
    await flagOn(page);
    for (const intent of ["atteindre", "depasser", "explorer"]) {
      await page.click(`[data-act="intent"][data-v="${intent}"]`);
      assert.doesNotMatch(await page.locator("#live").innerText(), /relances/i, `${intent}: no relaunch on the road`);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
