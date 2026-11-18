// TITAN ONE « Signature », lot Aventure / TITAN LIVE / moments: the compositions that the redesign added, held by what a person does
// with them. Aventure reads in one screen (destinations, the world as a scene, the mission, then one view at a time); TITAN LIVE tells its
// three intents apart and stays dark while a session runs; a new level, a record and a closed world are short scenes of confirmed facts.
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

const fresh = (width = 390, extra = {}) => browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", ...extra }).then(async (c) => {
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  await c.addInitScript(() => localStorage.setItem("titan_first_run_guide_v2", "done"));
  return c;
});
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const flagOn = (page) => page.evaluate(() => { window.titanFlags.enabled = (k, d) => (k === "screens.live" ? true : d); window.dispatchEvent(new Event("titan:flags-updated")); });

test("aventure: destinations, the world as a scene above the mission, one view at a time, the notebook as objects", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/adventure");
    await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
    await page.locator("[data-start]").waitFor();

    // Four destinations, each with its trail of nine marks; the scene is seen first, the mission stays first for the keyboard.
    assert.equal(await page.locator('.av-worlds [role="tab"]').count(), 4);
    assert.equal(await page.locator(".av-world-pips i").count(), 36);
    const [scene, start] = await Promise.all([page.locator(".av-map").boundingBox(), page.locator(".av-grid > .av-panel").boundingBox()]);
    assert.ok(scene.y < start.y, "the scene is drawn above the first block");
    assert.equal(Math.round(scene.width), 390, "the scene runs edge to edge on a phone");
    assert.equal(await page.locator(".av-node").count(), 9);
    assert.match(await page.locator(".av-node.is-boss img").getAttribute("src"), /guardian-aube-s\.webp$/, "the guardian holds the ninth beacon");
    for (const box of await page.locator(".av-node").evaluateAll((nodes) => nodes.map((n) => { const r = n.getBoundingClientRect(); return [r.width, r.height]; }))) assert.ok(box[0] >= 44 && box[1] >= 44, "a beacon is a 44 px target");

    // One view at a time: the chapter by default, the others one press away, the address following.
    const pressed = () => page.locator('.av-views [aria-pressed="true"]').getAttribute("data-av-view-btn");
    const shown = () => page.locator("[data-av-view]:not([hidden])").evaluateAll((v) => v.map((x) => x.dataset.avView));
    assert.equal(await page.locator(".av-views [data-av-view-btn]").count(), 4);
    assert.equal(await pressed(), "chapitre");
    assert.deepEqual(await shown(), ["chapitre"]);
    assert.equal(await page.locator(".av-guardian img").isVisible(), true, "the guardian of the region is a presence of the chapter view");
    await page.locator('[data-av-view-btn="carnet"]').focus();
    await page.keyboard.press("Enter");
    assert.equal(await pressed(), "carnet");
    assert.deepEqual(await shown(), ["carnet"]);
    assert.equal(new URL(page.url()).hash, "#carnet");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.avViewBtn), "carnet", "the focus stays on the switch");

    // The notebook: nine objects, each with its state in words; the seal of exploration is still ahead.
    assert.equal(await page.locator(".av-carnet-row").count(), 9);
    assert.equal(await page.locator(".av-carnet-row .sig-object").count(), 9);
    assert.equal(await page.locator(".av-carnet-row .sig-state").count(), 9);
    assert.match(await page.locator(".av-carnet-row").first().innerText(), /À découvrir/);
    assert.match(await page.locator(".av-carnet-head img").getAttribute("src"), /sceau-exploration/);
    assert.equal(await page.locator(".av-carnet-head .sig-object.is-locked").count(), 1, "nothing is shown as sealed before the nine beacons");
    assert.match(await page.locator(".av-carnet-head").innerText(), /Sceau aux neuf balises/);

    // Changing destination keeps the view; starting the campaign gives the mission its proof, one mark a day.
    await page.locator('.av-worlds [data-world="marees"]').click();
    assert.equal(await pressed(), "carnet");
    assert.match(await page.locator(".av-carnet-head").innerText(), /Marées/);
    await page.locator('.av-worlds [data-world="aube"]').click();
    await page.locator('[data-av-view-btn="chapitre"]').click();
    assert.equal(new URL(page.url()).hash, "");
    await page.locator("[data-start]").click();
    await page.locator(".av-mission").waitFor();
    const target = await page.evaluate(() => window.TitanAdventure.snapshot.campaigns.find((c) => c.id === "aube").target);
    assert.equal(await page.locator(".av-mission .av-proof i").count(), target);
    assert.equal(await page.locator(".av-mission .av-proof i.on").count(), 0);
    const [map, mission] = await Promise.all([page.locator(".av-map").boundingBox(), page.locator(".av-mission").boundingBox()]);
    assert.ok(map.y < mission.y && mission.y < map.y + map.height, "the mission sits on the foot of the scene");
    assert.ok((await page.locator(".av-mission .asc-btn-primary").boundingBox()).y < 844 - 68, "the action of the mission is on the first screen");

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await noOverflow(page), true, `no horizontal scroll at ${width}`);
    }
    // Wide screen: two panes, the scene on the left, the mission beside it.
    await page.setViewportSize({ width: 1440, height: 900 });
    const [wideMap, wideMission] = await Promise.all([page.locator(".av-map").boundingBox(), page.locator(".av-mission").boundingBox()]);
    assert.ok(wideMission.x >= wideMap.x + wideMap.width - 1, "the mission stands beside the scene");
    assert.ok(wideMap.width > wideMission.width, "the scene takes the width");
    assert.equal(await noOverflow(page), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("aventure: a world walked to its end seals its notebook, and its last beacon is a scene of confirmed facts", async () => {
  const context = await fresh(390, { reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/adventure#carnet");
    await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
    // The address named a view: the page opens on it.
    assert.equal(await page.locator('.av-views [aria-pressed="true"]').getAttribute("data-av-view-btn"), "carnet");
    await page.evaluate(async () => {
      const id = window.state.user.id;
      const rewards = Array.from({ length: 9 }, (_, i) => ({ world: "aube", chapter: i + 1, earned_at: "2026-10-02T12:00:00Z", source_ids: [] }));
      localStorage.setItem("titan_adventure_v1:" + id, JSON.stringify({ owner: id, revision: 1, selected_world: "aube", rewards, campaigns: [{ id: "aube", chapter: 10, route: "rhythm", started_at: "2026-10-01T00:00:00Z" }] }));
      await window.TitanAdventure.refresh({ force: true });
    });
    await page.locator(".av-done").waitFor({ state: "attached" });
    assert.match(await page.locator(".av-done").innerText(), /Carnet scellé · 9\/9/);
    assert.equal(await page.locator(".av-carnet-head .sig-object.is-locked").count(), 0);
    assert.match(await page.locator(".av-carnet-head").innerText(), /Carnet scellé/);
    assert.equal(await page.locator(".av-carnet-row.is-earned").count(), 9);
    assert.equal(await page.locator(".av-node.is-earned").count(), 9);
    assert.equal(await page.locator(".av-trail path.is-done").count(), 8, "the whole trail is inked");
    // « Ouvrir le carnet » of the closed world leads to the notebook.
    await page.locator('[data-av-view-btn="chapitre"]').click();
    await page.locator(".av-done [data-av-goto]").click();
    assert.equal(await page.locator('.av-views [aria-pressed="true"]').getAttribute("data-av-view-btn"), "carnet");

    // The ninth beacon: the guardian's portrait, the nine beacons lit, the seal of the closed notebook.
    await page.evaluate(() => window.TitanAdventureMoment.celebrate("aube", 9));
    const sheet = page.locator("dialog.av-celebrate-sheet");
    await sheet.waitFor();
    assert.match(await sheet.locator(".av-celebrate-art img").getAttribute("src"), /guardian-aube\.webp$/);
    assert.equal(await sheet.locator(".av-celebrate-trail li.is-lit").count(), 9);
    assert.match(await sheet.locator(".av-celebrate-prize img").getAttribute("src"), /sceau-exploration/);
    assert.match(await sheet.innerText(), /Monde accompli/);
    // Reduced motion: the final frame at once.
    assert.equal(await sheet.locator(".av-celebrate-prize .sig-object").evaluate((el) => getComputedStyle(el).opacity), "1");
    await sheet.locator("[data-close-celebrate]").click();
    // A beacon of the trail: its own object, its number, nothing about a closed world.
    await page.evaluate(() => window.TitanAdventureMoment.celebrate("aube", 4));
    assert.equal(await page.locator("dialog.av-celebrate-sheet .av-celebrate-prize svg.crest-beacon").count(), 1);
    assert.match(await page.locator("dialog.av-celebrate-sheet").innerText(), /Balise 4 sur 9/);
    assert.doesNotMatch(await page.locator("dialog.av-celebrate-sheet").innerText(), /Monde accompli/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("live: three intents told apart before starting, a dark session with large targets, the Camp without a dead button", async () => {
  const context = await fresh();
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/seance-live?sport=muscu_gym");
    await page.waitForFunction(() => window.state?.user && window.titanFlags && document.querySelector("#live h1"));
    await flagOn(page);

    // The preparation opens on the scene; the three intents are three drawn cards, and each says what it changes before, during, after.
    assert.equal(await page.locator("#live").getAttribute("data-state"), "prep");
    assert.equal(await page.locator(".live-stage .live-scene").count(), 1);
    assert.equal(await page.locator(".live-intent-card").count(), 3);
    assert.equal(await page.locator(".live-intent-card svg").count(), 3);
    const told = {};
    for (const intent of ["atteindre", "depasser", "explorer"]) {
      await page.locator(`.live-intent-card[data-v="${intent}"]`).focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator(`.live-intent-card[data-v="${intent}"]`).getAttribute("aria-pressed"), "true");
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.v), intent, "the focus stays on the chosen intent after the redraw");
      assert.equal(await page.locator(".live-intent").getAttribute("data-intent"), intent);
      assert.deepEqual(await page.locator(".live-changes .live-when").allInnerTexts(), ["Avant", "Pendant", "Après"]);
      told[intent] = await page.locator(".live-changes").innerText();
    }
    assert.equal(new Set(Object.values(told)).size, 3, "three intents, three different sessions");
    assert.match(told.explorer, /Aucun chiffre/);
    assert.match(told.depasser, /Un seul seuil/);
    assert.equal(await page.locator(".live-start [data-act='start']").isVisible(), true, "the action to start is in reach");
    assert.ok((await page.locator(".live-start").boundingBox()).y < 844, "…on the first screen of a long page");
    assert.equal(await noOverflow(page), true);
    await page.setViewportSize({ width: 320, height: 760 });
    assert.equal(await noOverflow(page), true, "three cards hold at 320 px");
    await page.setViewportSize({ width: 390, height: 844 });

    // While the session runs: one large clock, targets under the thumb, and no bright field (the action is a dark key with lit words).
    await page.click('[data-act="intent"][data-v="atteindre"]');
    await page.click('[data-act="start"]');
    assert.equal(await page.locator("#live").getAttribute("data-state"), "run");
    assert.equal(await page.locator("#live h1").count(), 1, "the running session keeps a title for assistive technology");
    const lime = await page.evaluate(() => { const p = document.createElement("i"); p.style.color = "var(--space)"; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
    for (const selector of ['[data-act="set"]', '[data-act="finish"]']) {
      const style = await page.locator(selector).evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, h: el.getBoundingClientRect().height }));
      assert.notEqual(style.bg, lime, `${selector} is not a bright field while moving`);
      // Lit words: the lime of the space or its hover tone (the pointer may rest on the key), never the dark ink of a bright field.
      const [r, g] = style.color.match(/\d+/g).map(Number);
      assert.ok(r > 190 && g > 220, `${selector} keeps lit words (${style.color})`);
      assert.ok(style.h >= 52, `${selector} is a large target`);
    }
    assert.ok(await page.locator(".live-clock").evaluate((el) => parseFloat(getComputedStyle(el).fontSize)) >= 88, "the clock reads at arm's length");
    for (const h of await page.locator(".live-feel-row button").evaluateAll((b) => b.map((x) => x.getBoundingClientRect().height))) assert.ok(h >= 44);
    await page.click('[data-act="feel"][data-v="5"]');
    assert.equal(await page.locator('[data-act="feel"][data-v="5"]').getAttribute("aria-pressed"), "true");

    // The end is the same scene, stopped where the effort brought it, and the story leads with what the intent became.
    await page.click('[data-act="set"]');
    await page.click('[data-act="finish"]');
    assert.equal(await page.locator("#live").getAttribute("data-state"), "report");
    assert.equal(await page.locator(".live-stage .live-scene").count(), 1);
    assert.equal(await page.locator(".live-story .live-story-lead").count(), 1);

    // The Camp de base: a level that can be paid is a button, one that cannot is a sentence — never a button that does nothing.
    await page.evaluate(() => {
      window.state.user.id = "00000000-0000-4000-8000-000000000321";
      const world = { wallet: { eclats: 30, essences: { souffle: 0, acier: 96, prisme: 0, ardeur: 0, seve: 0 } }, buildings: { halle: 1 }, voies: { forge: { sessions: 4, days: 4 } }, days: 4, distinctVoies: 1, collection: ["forge:1", "forge:5"] };
      window.titanClient = { rpc: async (name) => ({ data: name === "titan_live_world_v1" ? world : { status: "none" }, error: null }) };
    });
    await page.click('[data-act="tab"][data-v="camp"]');
    await page.locator(".live-building").first().waitFor();
    assert.equal(await page.locator("#live").getAttribute("data-state"), "camp");
    assert.equal(await page.locator(".live-campv .live-stage .live-scene").count(), 1, "the Camp opens on the same ascent");
    assert.equal(await page.locator(".live-building").count(), 6);
    assert.equal(await page.locator(".live-building button[disabled]").count(), 0);
    assert.equal(await page.locator('.live-building [data-act="build"]').count() + await page.locator(".live-building .live-cost").count(), 6);
    assert.ok(await page.locator(".live-building .live-cost").count() >= 4, "what cannot be rebuilt yet says so");
    assert.match(await page.locator(".live-finds-row").innerText(), /rare/, "a rare find says it in a word");
    assert.equal(await noOverflow(page), true);
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await noOverflow(page), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("moments: a new level and a record are scenes of what the server confirmed, still with reduced motion, absent before it", async () => {
  const context = await fresh(390, { reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/training");
    await page.waitForFunction(() => window.state?.user && window.TitanMoment && document.querySelector("[data-pick-title]"));
    // One moment at a time: the previous sheet is closed and gone before the next one opens.
    const open = async (extra) => { await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())); await page.waitForFunction(() => !document.querySelector("dialog.moment-sheet")); return page.evaluate((x) => {
      window.state.user.id = "00000000-0000-4000-8000-000000000321";
      const at = (days) => new Date(Date.now() - days * 86400000).toISOString();
      const older = { id: "old-1", client_event_id: "old-1", sport: "running", val: 6, unit: "km", date: at(20), xp: 30, syncStatus: "confirmed", details: { duration: 36 } };
      const log = { id: "new-1", client_event_id: "new-1", sport: "running", val: x.km, unit: "km", date: at(0), xp: 64, syncStatus: x.confirmed ? "confirmed" : "pending",
        details: { duration: 60, ...(x.confirmed ? { serverReward: { xp: 64, requested_xp: 64, credits: 6, leveled_up: x.levelUp ? 1 : 0, level_after: 15, xp_after: 40 } } : {}) } };
      window.state.history = [log, older];
      window.TitanMoment.open(log);
    }, extra); };
    const sheet = page.locator("dialog.moment-sheet");

    // Not confirmed yet: no scene, no gain.
    await open({ km: 5, confirmed: false, levelUp: true });
    await sheet.waitFor();
    assert.equal(await sheet.locator(".moment-scene").count(), 0);
    assert.equal(await sheet.locator(".moment-ring").count(), 0);

    // Confirmed with a new level: the ascent (fetched when the moment opens), its trail, the level, the crest standing.
    await open({ km: 5, confirmed: true, levelUp: true });
    await sheet.locator(".moment-scene").waitFor();
    await sheet.locator(".moment-ascent .ma-trail").waitFor({ state: "attached" });
    assert.equal(await sheet.locator(".moment-ascent .ma-ridge").count(), 3);
    assert.match(await sheet.locator(".moment-scene-copy").innerText(), /15/);
    assert.equal(await sheet.locator(".moment-scene .moment-crest").evaluate((el) => getComputedStyle(el).opacity), "1", "reduced motion shows the final frame");
    assert.equal(await sheet.locator(".moment-hero").getAttribute("data-play"), "0");
    assert.match(await sheet.locator(".moment-reward").innerText(), /Niveau 15/, "the words say the level; the scene is decorative");
    assert.equal(await sheet.locator(".moment-hero").getAttribute("aria-hidden"), "true");

    // A record: the amber field carries the bar of the new mark, notched where the previous one stood.
    await open({ km: 12, confirmed: true, levelUp: false });
    await sheet.locator(".moment[data-record]").waitFor();
    assert.equal(await sheet.locator(".moment-mark").count(), 1);
    assert.equal(await sheet.locator(".moment-mark").evaluate((el) => el.style.getPropertyValue("--was")), "50.0%");
    assert.match(await sheet.locator(".moment-lead").innerText(), /avant/);
    assert.equal(await sheet.locator(".moment-scene").count(), 0);
    assert.equal(await noOverflow(page), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
