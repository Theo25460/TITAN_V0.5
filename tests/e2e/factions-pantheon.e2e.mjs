// Communauté: the three factions (COM-D2) and the Pantheon of the Titans (COM-D4). Optional, protective defaults, no ranking; behind the server
// flags screens.factions and screens.pantheon; driven with a recorder instead of a real project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000941";
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

const evil = '<img src=x onerror="window.pwned=1">';
const FACTIONS = {
  mine: null, joinedAt: null, canChangeAt: null,
  factions: [
    { key: "aube", name: "Les Veilleurs de l’Aube", motto: "Tenir la lumière.", emblem: "sunrise", members: null, minutes: null },
    { key: "forge", name: "Les Forgerons", motto: "Bâtir l’effort.", emblem: "anvil", members: 12, minutes: 3400 },
    { key: "sentier", name: "Les Arpenteurs du Sentier", motto: "Aller plus loin.", emblem: "path", members: null, minutes: null },
  ],
};
const PANTHEON = { mine: false, hiddenByTeam: false, profilePublic: true, entries: [
  { name: `Alba ${evil}`, kind: "pioneer", label: "Pionnier de TITAN", at: "2026-10-20T10:00:00Z", me: false, userId: null },
  { name: "Basile", kind: "season", label: "A mené Saison d’automne jusqu’au bout", at: "2026-10-26T00:00:00Z", me: false, userId: null },
] };
async function page_({ flags = { factions: true, pantheon: true }, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.TitanFactions && window.TitanPantheon && window.state?.user);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ flags, missing, signedIn, owner, factions, pantheon }) => {
    window.calls = []; window.f = structuredClone(factions); window.p = structuredClone(pantheon);
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_faction_v1") out = { data: window.f, error: null };
          if (name === "titan_faction_choose_v1") {
            if (window.locked) out = { data: null, error: { code: "22023", message: "FACTION_CHANGE_LOCKED" } };
            else { const changing = window.f.mine !== null || window.changed; window.f.mine = args.p_key; window.changed = window.changed || changing; window.f.canChangeAt = changing ? "2999-01-01T00:00:00Z" : null; out = { data: true, error: null }; }
          }
          if (name === "titan_pantheon_v1") out = { data: window.p, error: null };
          if (name === "titan_pantheon_set_v1") { window.p.mine = args.p_on; out = { data: args.p_on, error: null }; }
          if (name === "titan_club_my_v1" || name === "titan_club_discover_v1") out = { data: [], error: null };
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      let pinned = window.state.user; pinned.id = owner;
      Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    }
    const f = { enabled: (key, fallback) => key === "screens.factions" ? flags.factions : key === "screens.pantheon" ? flags.pantheon : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => f, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { flags, missing, signedIn, owner: OWNER, factions: FACTIONS, pantheon: PANTHEON });
  return { page, context, errors };
}

test("factions: three camps, counts only from five members, joined on purpose, a change is locked and said so", async () => {
  const { page, context, errors } = await page_();
  try {
    const forge = page.locator("[data-faction=forge]");
    await forge.waitFor();
    const extras = page.locator("#communaute-extras");
    await extras.waitFor();
    assert.deepEqual(await extras.locator("a").allInnerTexts(), ["Factions", "Panthéon"], "the row lists only the panels that are shown");
    assert.equal(await extras.locator("a[href='#factions']").count(), 1);
    assert.equal(await page.locator("[data-faction]").count(), 3);
    assert.match(await forge.innerText(), /12 membres · 3\s?400 min d’effort cette semaine/);
    assert.match(await page.locator("[data-faction=aube]").innerText(), /à partir de cinq membres/);
    assert.doesNotMatch(await page.locator("#factions").innerText(), /ta contribution est visible/);
    await forge.getByRole("button", { name: "Rejoindre" }).click();
    await page.waitForFunction(() => document.querySelector("[data-faction=forge]")?.dataset.mine === "true");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_faction_choose_v1")[1]), { p_key: "forge" });
    assert.equal(await page.locator("[data-faction-lock]").count(), 0, "the first choice can still be corrected: no lock yet");
    await page.locator("[data-faction=aube]").getByRole("button", { name: "Passer à cette faction" }).click();
    await page.waitForFunction(() => document.querySelector("[data-faction=aube]")?.dataset.mine === "true");
    assert.match(await page.locator("[data-faction-lock]").innerText(), /changer de faction à partir du/);
    assert.equal(await page.locator("[data-faction=forge] button").isDisabled(), true, "another camp cannot be taken while the lock holds");
    assert.equal(await page.locator("[data-faction=aube] button").isDisabled(), true, "nor can the faction be left");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document.querySelector("#factions"), { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("factions: a refusal by the server is explained", async () => {
  const { page, context } = await page_();
  try {
    await page.locator("[data-faction=aube]").waitFor();
    await page.evaluate(() => { window.locked = true; });
    await page.locator("[data-faction=aube]").getByRole("button", { name: "Rejoindre" }).click();
    await page.locator("[data-faction-notice]").waitFor();
    assert.match(await page.locator("[data-faction-notice]").innerText(), /changé de faction récemment/);
  } finally { await context.close(); }
});

test("pantheon: names are text, most recent first, no ranking; appearing is a choice that can be withdrawn at once", async () => {
  const { page, context, errors } = await page_();
  try {
    const list = page.locator("[data-pantheon-list]");
    await list.waitFor();
    assert.equal(await page.evaluate(() => window.pwned), undefined, "no markup is executed");
    assert.equal(await list.locator("img").count(), 0);
    assert.match((await list.innerText()).replace(/\s+/g, " "), /Basile[\s\S]*Alba/, "the most recent comes first");
    assert.doesNotMatch(await list.innerText(), /classement|rang \d|score|#\d/i, "the gallery shows no rank");
    await page.getByRole("button", { name: "Apparaître au Panthéon" }).click();
    await page.getByRole("button", { name: "Retirer mon nom" }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_pantheon_set_v1")[1]), { p_on: true });
    await page.getByRole("button", { name: "Retirer mon nom" }).click();
    await page.getByRole("button", { name: "Apparaître au Panthéon" }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_pantheon_set_v1")[1][1]), { p_on: false });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document.querySelector("#pantheon"), { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("factions and pantheon: nothing when the flag is off, for a guest, or on a server without the functions", async () => {
  for (const options of [{ flags: { factions: false, pantheon: false } }, { signedIn: false }, { missing: true }]) {
    const { page, context, errors } = await page_(options);
    try {
      await page.waitForTimeout(400);
      assert.equal(await page.locator("#factions").isVisible(), false, JSON.stringify(options));
      assert.equal(await page.locator("#communaute-extras").isVisible(), false, "no panel, no row: " + JSON.stringify(options));
      assert.equal(await page.locator("#pantheon").isVisible(), false, JSON.stringify(options));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
