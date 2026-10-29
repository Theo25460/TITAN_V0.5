// QG: the fair ranking among friends (COM-C4). Optional, regularity and progress rather than volume, formula shown, friends who also opted in,
// nothing granted. Behind the server flag screens.ranking.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000651";
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

const ENTRIES = [
  { rank: 1, name: "Denis", score: 60, activeDays: 28, progressPct: 0, me: false },
  { rank: 1, name: "Alba <b>", score: 60, activeDays: 12, progressPct: 0, me: true },
  { rank: 1, name: "Basile", score: 60, activeDays: 4, progressPct: 100, me: false },
];
async function qg({ state = { optedIn: false, formula: 1 }, flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-29T12:00:00Z"));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && window.TitanRanking);
  await page.evaluate(({ state, flag, missing, signedIn, owner, entries }) => {
    window.calls = []; window.rank = state; window.entries = entries;
    if (signedIn) {
      window.state.history = [{ id: "x1", sport: "running", date: "2026-10-28T08:00:00Z", val: 5, unit: "km", xp: 10, details: {} }, { id: "x2", sport: "swimming", date: "2026-10-27T08:00:00Z", val: 1, unit: "km", xp: 10, details: {} }];
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_ranking_v1") out = { data: window.rank.optedIn ? { ...window.rank, entries: args.p_sport ? window.entries.slice(0, 1) : window.entries } : window.rank, error: null };
          if (name === "titan_ranking_set_v1") { window.rank = args.p_on ? { optedIn: true, formula: 1, entries: window.entries } : { optedIn: false, formula: 1 }; out = { data: args.p_on, error: null }; }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.ranking" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { state, flag, missing, signedIn, owner: OWNER, entries: ENTRIES });
  return { page, context, errors };
}

test("ranking: nothing is shown until the player chooses to take part, the formula is explained, and leaving is one click", async () => {
  const { page, context, errors } = await qg();
  try {
    const card = page.locator("[data-rk]");
    await card.waitFor();
    assert.match(await card.innerText(), /tant que tu n’y participes pas, tu n’apparais pas et tu ne vois personne/);
    assert.equal(await page.locator("[data-rk-list]").count(), 0);
    await page.locator("[data-rk-formula] summary").click();
    const formula = await page.locator("[data-rk-formula]").innerText();
    assert.match(formula, /régularité \(60 %\) et le progrès \(40 %\), pas le volume/);
    assert.match(formula, /en faire plus ne rapporte rien/);
    assert.match(formula, /jamais en négatif/);
    await card.getByRole("button", { name: "Participer" }).click();
    await page.locator("[data-rk-list]").waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_ranking_set_v1")[1]), { p_on: true });
    assert.equal(await page.locator("[data-rk-entry]").count(), 3);
    assert.match(await page.locator("[data-rk-entry][data-me]").innerText(), /Alba <b> \(toi\)/, "names are text, not markup");
    assert.match(await page.locator("[data-rk-list]").innerText(), /1\. Denis[\s\S]*1\. Alba[\s\S]*1\. Basile/, "equal scores share a rank");
    await card.getByRole("button", { name: "Ne plus participer" }).click();
    await page.waitForFunction(() => !document.querySelector("[data-rk-list]"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("ranking: a sport can be chosen from the player's own sports, and an empty list says so kindly", async () => {
  const { page, context } = await qg({ state: { optedIn: true, formula: 1, entries: ENTRIES } });
  try {
    await page.locator("[data-rk-sport]").waitFor();
    assert.deepEqual(await page.locator("[data-rk-sport] option").allInnerTexts(), ["Tous les sports", "Course à pied", "Natation"]);
    await page.locator("[data-rk-sport]").selectOption("running");
    await page.waitForFunction(() => document.querySelectorAll("[data-rk-entry]").length === 1);
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_ranking_v1").pop()[1]), { p_sport: "running" });
  } finally { await context.close(); }
  const empty = await qg({ state: { optedIn: true, formula: 1, entries: [] } });
  try {
    await empty.page.evaluate(() => { window.entries = []; return window.TitanRanking.refresh(true); });
    await empty.page.locator("[data-rk-empty]").waitFor();
    assert.match(await empty.page.locator("[data-rk-empty]").innerText(), /Une séance suffit pour apparaître/);
  } finally { await empty.context.close(); }
});

test("ranking: nothing when the flag is off, for a guest, or on a server without the functions", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { missing: true }]) {
    const { page, context } = await qg(options);
    try {
      await page.waitForTimeout(600);
      assert.equal(await page.locator("[data-rk]").count(), 0);
    } finally { await context.close(); }
  }
});
