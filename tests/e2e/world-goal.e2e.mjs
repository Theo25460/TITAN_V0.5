// QG: the world goal (COM-B5). Optional, collective, three levels, aggregates only, nothing granted. Behind the server flag screens.worldgoal.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000721";
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

const GOAL = { id: "g1", title: "Cap sur novembre", detail: "Tous les sports comptent.", startsOn: "2026-10-26", endsOn: "2026-11-22", levels: [5000, 15000, 40000], minutes: 2000, members: 30, joined: false, mine: 0, level: 0, state: "open" };
async function qg({ goal = GOAL, flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-29T12:00:00Z"));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && window.TitanWorldGoal);
  await page.evaluate(({ goal, flag, missing, signedIn, owner }) => {
    window.calls = []; window.goal = goal;
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_world_goal_v1") out = { data: window.goal, error: null };
          if (name === "titan_world_goal_join_v1") {
            if (window.refuse) out = { data: null, error: { code: "42501", message: "NOT_ELIGIBLE" } };
            else { window.goal = { ...window.goal, joined: args.p_join, members: window.goal.members + (args.p_join ? 1 : -1), mine: args.p_join ? 25 : 0 }; out = { data: {}, error: null }; }
          }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.worldgoal" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { goal, flag, missing, signedIn, owner: OWNER });
  return { page, context, errors };
}

test("world goal: shown as totals and three levels, joined on purpose, the player sees only its own share; no reward is promised", async () => {
  const { page, context, errors } = await qg();
  try {
    const card = page.locator("[data-wg]");
    await card.waitFor();
    const text = (await card.innerText()).replace(/\s+/g, " ");
    assert.match(text, /2\s?000 min d’effort à tous · 30 participants/);
    assert.match(text, /Premier palier : 5\s?000 min/);
    assert.match(text, /Troisième palier : 40\s?000 min/);
    assert.doesNotMatch(text, /ta part/);
    assert.match(text, /Aucun XP ni crédit à gagner/);
    assert.equal(await card.locator("[role=progressbar]").getAttribute("aria-valuenow"), "5");
    await card.getByRole("button", { name: "Rejoindre l’objectif" }).click();
    await page.waitForFunction(() => /ta part : 25 min/.test(document.querySelector("[data-wg]")?.innerText || ""));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_world_goal_join_v1")[1]), { p_goal: "g1", p_join: true });
    await page.getByRole("button", { name: "Quitter l’objectif" }).click();
    await page.waitForFunction(() => !/ta part/.test(document.querySelector("[data-wg]")?.innerText || ""));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("world goal: a reached level is said plainly and can be shared without a name; a refusal is explained", async () => {
  const done = await qg({ goal: { ...GOAL, minutes: 16000, level: 2, joined: true, mine: 60 } });
  try {
    await done.page.locator("[data-wg]").waitFor();
    assert.match(await done.page.locator("[data-wg]").innerText(), /Deuxième palier atteint ensemble/);
    assert.equal(await done.page.locator("[data-wg-levels] [data-reached=true]").count(), 2);
    await done.page.locator("[data-wg-card]").click();
    await done.page.locator("dialog[open] .cd-sheet").waitFor();
    await done.page.waitForFunction(() => document.querySelector(".cd-preview img")?.getAttribute("src")?.startsWith("data:image/png"));
    if (await done.page.locator("dialog[open] [data-name]").count()) assert.equal(await done.page.locator("dialog[open] [data-name]").isChecked(), false);
    await done.page.keyboard.press("Escape");
  } finally { await done.context.close(); }
  const refused = await qg();
  try {
    await refused.page.evaluate(() => { window.refuse = true; });
    await refused.page.getByRole("button", { name: "Rejoindre l’objectif" }).click();
    await refused.page.locator("[data-wg-notice]").waitFor();
    assert.match(await refused.page.locator("[data-wg-notice]").innerText(), /un jour après la création du compte/);
  } finally { await refused.context.close(); }
});

test("world goal: nothing when the flag is off, for a guest, without a goal, or on a server without the function", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { goal: null }, { missing: true }]) {
    const { page, context, errors } = await qg(options);
    try {
      await page.waitForTimeout(400);
      assert.equal(await page.locator("[data-wg]").count(), 0, JSON.stringify(options));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
