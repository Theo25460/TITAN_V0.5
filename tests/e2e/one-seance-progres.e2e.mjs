// TITAN ONE — « Séances et progression sportive ». What the Signature redesign of this space promises, held on a signed-in,
// established account with the production flags: one of 260 sports is found from the keyboard, the form of a sport says its
// states (draft found, offline, last session), the journal shows sessions on its first screen and the first-visits note comes
// after the data, records stand on their plate with the mark they replaced, the career shows the seven ranks as a ladder.
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

async function open(path, { width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, locale: "fr-FR", timezoneId: "Europe/Paris", serviceWorkers: "block", reducedMotion: "reduce" });
  const host = new URL(BASE).host;
  await context.route(url => url.host !== host, route => /\/rpc\/titan_feature_flags_v1$/.test(new URL(route.request().url()).pathname)
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ flags: FLAGS.flags, version: FLAGS.version }) })
    : route.abort("internetdisconnected"));
  const script = connectedScript(buildConnectedData());
  await context.route(url => url.host === host && /\/js\/config\.js$/.test(url.pathname), async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()) + script }); });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForFunction(() => window.state?.user && window.titanFlags?.enabled("screens.activityhub") && (window.state.history || []).length > 20, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { page, context, errors };
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("Séance: a sport among 260 is found from the keyboard, families are tabs, and nothing scrolls sideways", async () => {
  for (const width of [320, 390, 1440]) {
    const { page, context, errors } = await open("/training", { width });
    try {
      await page.locator(".sp-mine .sp-tile").first().waitFor();
      assert.ok(await page.locator(".sp-mine .sp-tile").count() >= 3, "the sports already practised come first, as keys");
      // Searching: the results take the place of the lists, the match is marked, the arrows choose, Enter opens.
      await page.fill("#sport-q", "foot");
      await page.locator("#sport-results [role=option]").first().waitFor();
      assert.equal(await page.locator(".seance-pick").isHidden(), true);
      assert.ok(await page.locator("#sport-results mark").count() >= 1);
      assert.match(await page.locator(".sp-count").innerText(), /sport/);
      assert.ok(await sideways(page) <= 1);
      await page.press("#sport-q", "ArrowDown");
      await page.press("#sport-q", "ArrowDown");
      const active = await page.getAttribute("#sport-q", "aria-activedescendant");
      assert.equal(active, "opt-1");
      const chosen = await page.locator("#opt-1").getAttribute("data-sport");
      // Another name of a sport finds it and the row says which.
      await page.fill("#sport-q", "footing");
      assert.match(await page.locator('#sport-results [data-sport="running"]').innerText(), /footing/);
      // Nothing found: the empty state and its one action.
      await page.fill("#sport-q", "zzzz");
      await page.locator(".sp-none").waitFor();
      await page.click('[data-act="clear-search"]');
      assert.equal(await page.inputValue("#sport-q"), "");
      assert.equal(await page.locator(".seance-pick").isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), "sport-q");
      // Escape empties the field too.
      await page.fill("#sport-q", "yo");
      await page.press("#sport-q", "Escape");
      assert.equal(await page.inputValue("#sport-q"), "");
      // Families: one panel at a time, the arrows move between tabs, the whole family unfolds from A to Z.
      await page.locator('[data-family-tab="jeu"]').click();
      assert.equal(await page.locator(".sp-panel").getAttribute("id"), "family-jeu");
      assert.equal(await page.locator('[data-family-tab="jeu"]').getAttribute("aria-selected"), "true");
      await page.locator('[data-family-tab="jeu"]').press("ArrowRight");
      assert.equal(await page.evaluate(() => document.activeElement.dataset.familyTab), "mobilite");
      assert.equal(await page.locator(".sp-panel").getAttribute("id"), "family-mobilite");
      await page.locator('[data-family-tab="force"]').click();
      const total = Number(await page.locator('[data-family-tab="force"] small').innerText());
      await page.locator('[data-family-more="force"]').click();
      assert.equal(await page.locator(".sp-panel .sp-sport").count(), total, "every sport of the family is listed");
      assert.ok(await page.locator(".sp-panel .sp-letter").count() > 3);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.familyMore), "force");
      assert.ok(await sideways(page) <= 1);
      // The arrows then Enter open the form of the chosen sport; Back returns to the question.
      await page.fill("#sport-q", "foot");
      await page.press("#sport-q", "ArrowDown");
      await page.press("#sport-q", "ArrowDown");
      await page.press("#sport-q", "Enter");
      await page.locator("[data-form-title]").waitFor();
      assert.equal(new URL(page.url()).searchParams.get("sport"), chosen);
      assert.equal(await page.evaluate(() => document.activeElement.matches("[data-form-title]")), true);
      assert.match(await page.locator(".seance-contract").innerText(), /·/);
      await page.goBack();
      await page.locator("[data-pick-title]").waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("Séance: the form says its states — last session, offline, a draft found on the device", async () => {
  const { page, context, errors } = await open("/training?sport=running");
  try {
    await page.locator("[data-form-title]").waitFor();
    // The last session of this sport is a reference and a shortcut.
    await page.locator("[data-last]").waitFor();
    assert.match(await page.locator("[data-last]").innerText(), /km/);
    await page.click('[data-act="repeat-last"]');
    assert.ok(Number(await page.inputValue('[data-k="distance"]')) > 0);
    assert.equal(await page.locator("[data-last]").count(), 0);
    // A favourite is one press, said to assistive technology.
    const before = await page.getAttribute('[data-act="favorite"]', "aria-pressed");
    await page.click('[data-act="favorite"]');
    assert.notEqual(await page.getAttribute('[data-act="favorite"]', "aria-pressed"), before);
    await page.click('[data-act="favorite"]');
    assert.equal(await page.getAttribute('[data-act="favorite"]', "aria-pressed"), before);
    // Offline is a state of the save, not an error.
    assert.equal(await page.locator("[data-net]").isHidden(), true);
    await context.setOffline(true);
    await page.locator("[data-net]").waitFor();
    assert.match(await page.locator("[data-net]").innerText(), /gardée sur cet appareil/);
    await context.setOffline(false);
    await page.waitForFunction(() => document.querySelector("[data-net]").hidden);
    // A draft found on the device is announced with the way out.
    await page.fill('[data-k="distance"]', "8.4");
    await page.reload();
    await page.locator("[data-resume]").waitFor();
    assert.equal(await page.inputValue('[data-k="distance"]'), "8.4");
    assert.equal(await page.getByText(/Brouillon repris/).count(), 1);
    await page.click('[data-act="discard-draft"]');
    assert.equal(await page.locator("[data-resume]").count(), 0);
    assert.equal(await page.inputValue('[data-k="distance"]'), "");
    assert.ok(await sideways(page) <= 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("Journal: sessions are on the first screen of a phone and the first-visits note comes after them", async () => {
  for (const width of [320, 390]) {
    const { page, context, errors } = await open("/journal", { width });
    try {
      await page.locator(".jr-row").first().waitFor();
      const rows = await page.locator(".jr-row").evaluateAll(list => list.filter(r => r.getBoundingClientRect().bottom <= innerHeight - 72).length);
      assert.ok(rows >= 3, `at least three sessions above the tab bar at ${width} px (${rows})`);
      assert.ok(await page.locator(".jr-row .jr-lead").first().innerText(), "a row leads with one figure");
      const hint = await page.locator("[data-hint=journal]").boundingBox();
      const results = await page.locator("#jr-results").boundingBox();
      assert.ok(hint && hint.y > results.y + results.height - 1, "the note is read after the data");
      // The two views are two keys with their names kept for assistive technology.
      await page.getByRole("button", { name: "Calendrier" }).click();
      await page.locator(".jr-cal").waitFor();
      await page.getByRole("button", { name: "Liste" }).click();
      await page.locator(".jr-row").first().waitFor();
      assert.ok(await sideways(page) <= 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("Records: the relic stands on its plate with the marks beaten this month and what they replaced", async () => {
  for (const width of [320, 1440]) {
    const { page, context, errors } = await open("/records", { width });
    try {
      await page.locator(".rc-vault").waitFor();
      assert.equal(await page.locator(".rc-vault .rc-relic img").evaluate(img => img.complete && img.naturalWidth > 0), true, "the relic is drawn");
      const items = page.locator(".rc-vault .rc-recent-item");
      assert.ok(await items.count() >= 1);
      assert.match(await items.first().innerText(), /avant |premier repère/);
      assert.ok(await page.locator(".rc-card[data-fresh]").count() >= 1, "a record of the month is marked on its card");
      // A record opens with its source session.
      await items.first().click();
      await page.locator("dialog[open] .rc-big").waitFor();
      assert.equal(await page.locator('dialog[open] a[href^="/journal?session="]').count(), 1);
      assert.ok(await sideways(page) <= 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("Carrière: the seven ranks are a ladder — reached, current, to come — and the period does not redraw it", async () => {
  for (const width of [320, 390, 1440]) {
    const { page, context, errors } = await open("/carriere", { width });
    try {
      await page.locator(".cr-ladder .cr-step").first().waitFor();
      const states = await page.locator(".cr-ladder .cr-step").evaluateAll(list => list.map(li => li.dataset.state));
      assert.equal(states.length, 7);
      const at = states.indexOf("current");
      assert.ok(at >= 0 && states.lastIndexOf("current") === at, "one rank is worn");
      assert.ok(states.slice(0, at).every(s => s === "reached") && states.slice(at + 1).every(s => s === "ahead"));
      assert.equal(await page.locator('.cr-step[aria-current="step"]').count(), 1);
      assert.equal(await page.locator('.cr-step[data-state="ahead"] .sig-object.is-locked').count(), states.length - at - 1, "a rank to come is shown locked");
      assert.match(await page.locator('.cr-step[data-state="ahead"]').first().getAttribute("aria-label"), /à venir, au niveau \d+/);
      assert.equal(await page.locator(".cr-ladder .sig-object :is(img, svg)").count(), 7, "each rank has its crest");
      assert.match(await page.locator(".cr-xp").innerText(), /XP vers le niveau/);
      const hero = await page.locator("[data-career-hero]").elementHandle();
      await page.click('[data-range="30d"]');
      assert.equal(await page.getAttribute('[data-range="30d"]', "aria-pressed"), "true");
      assert.equal(await hero.evaluate(node => node.isConnected), true, "the ascent is not redrawn by a change of period");
      assert.ok(await sideways(page) <= 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("Objectifs and Prévoir: where a goal stands is said in words, the week holds on a phone without scrolling sideways", async () => {
  const goals = await open("/objectifs", { width: 320 });
  try {
    await goals.page.locator(".ob-card").first().waitFor();
    assert.ok(await goals.page.locator(".ob-card .ob-state").count() >= 1);
    assert.match(await goals.page.locator(".ob-card .ob-state").first().innerText(), /\S/);
    assert.match(await goals.page.locator(".ob-card .ob-scale").first().innerText(), /% fait/);
    assert.ok(await sideways(goals.page) <= 1);
    assert.deepEqual(goals.errors, []);
  } finally { await goals.context.close(); }
  const plan = await open("/prevoir", { width: 320 });
  try {
    await plan.page.locator(".pv-week .pv-day").first().waitFor();
    assert.equal(await plan.page.locator(".pv-week .pv-day").count(), 7);
    const week = await plan.page.locator(".pv-week").evaluate(el => ({ scroll: el.scrollWidth - el.clientWidth, right: el.lastElementChild.getBoundingClientRect().right, view: innerWidth }));
    assert.ok(week.scroll <= 1 && week.right <= week.view, "the seven days are on screen");
    assert.equal(await plan.page.locator('.pv-week .pv-day[data-today="true"]').count(), 1);
    await plan.page.locator(".pv-week .pv-day").first().click();
    await plan.page.locator("dialog[open]").waitFor();
    assert.ok(await sideways(plan.page) <= 1);
    assert.deepEqual(plan.errors, []);
  } finally { await plan.context.close(); }
});
