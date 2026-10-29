// QG: the season of 28 days, its closing screen and the archive (COM-B3, COM-D3). Voluntary, no ranking, results frozen by the server.
// Behind the server flag screens.seasons.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000641";
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

const CURRENT = { id: "s1", name: "Saison de la reprise", rules: "Quatre semaines, à ton rythme.", rulesVersion: 2, startsOn: "2026-10-26", endsOn: "2026-11-22", state: "running", participants: 40, joined: false, myMinutes: 0, myDays: 0 };
const OLD = { id: "s0", name: "Saison d’automne", startsOn: "2026-09-28", endsOn: "2026-10-25", rulesVersion: 1, participants: 55, minutes: 9000, closedAt: "2026-10-26T01:00:00Z", mine: { minutes: 420, days: 11 } };
async function qg({ state = { current: CURRENT, archive: [OLD] }, flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-29T12:00:00Z"));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && window.TitanSeason);
  await page.evaluate(({ state, flag, missing, signedIn, owner }) => {
    window.calls = []; window.season = state;
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_season_v1") out = { data: window.season, error: null };
          if (name === "titan_season_join_v1") {
            if (window.refuse) out = { data: null, error: { code: "42501", message: "NOT_ELIGIBLE" } };
            else { window.season = { ...window.season, current: { ...window.season.current, joined: args.p_join, participants: window.season.current.participants + (args.p_join ? 1 : -1), myMinutes: args.p_join ? 30 : 0, myDays: args.p_join ? 1 : 0 } }; out = { data: {}, error: null }; }
          }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.seasons" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { state, flag, missing, signedIn, owner: OWNER });
  return { page, context, errors };
}

test("seasons: the running season is joined on purpose, shows only totals and one's own result, promises no ranking or reward", async () => {
  const { page, context, errors } = await qg();
  try {
    const card = page.locator("[data-ss-current]");
    await card.waitFor();
    assert.match(await card.innerText(), /Quatre semaines, à ton rythme/);
    assert.match(await card.innerText(), /40 participants/);
    assert.match(await card.innerText(), /sans obligation ni pénalité : se reposer fait partie du jeu/);
    assert.match(await card.innerText(), /Aucun classement, aucun XP ni crédit/);
    assert.equal(await page.locator("[data-ss-mine]").count(), 0, "no result before joining");
    await card.getByRole("button", { name: "Rejoindre la saison" }).click();
    await page.locator("[data-ss-mine]").waitFor();
    assert.match(await page.locator("[data-ss-mine]").innerText(), /30 min d’effort · 1 jour actif/);
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_season_join_v1")[1]), { p_season: "s1", p_join: true });
    await card.getByRole("button", { name: "Quitter la saison" }).click();
    await page.waitForFunction(() => !document.querySelector("[data-ss-mine]"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("seasons: the closing screen reads the frozen result, a non-participant is told kindly, the archive lists past seasons with their rules version", async () => {
  const closing = await qg({ state: { current: null, archive: [OLD] } });
  try {
    await closing.page.locator("[data-ss-closing]").waitFor();
    const text = await closing.page.locator("[data-ss-closing]").innerText();
    assert.match(text, /Saison d’automne est terminée/);
    assert.match(text, /55 participants/);
    assert.match(text.replace(/\s/g, " "), /Ta saison : 420 min d’effort · 11 jours actifs/);
    await closing.page.locator("[data-ss-archive] summary").click();
    assert.match(await closing.page.locator("[data-ss-archive]").innerText(), /règles v1/);
    await closing.page.locator("[data-ss-card]").click();
    await closing.page.locator("dialog[open] .cd-sheet").waitFor();
    await closing.page.waitForFunction(() => document.querySelector(".cd-preview img")?.getAttribute("src")?.startsWith("data:image/png"));
    if (await closing.page.locator("dialog[open] [data-name]").count()) assert.equal(await closing.page.locator("dialog[open] [data-name]").isChecked(), false);
    if (await closing.page.locator("dialog[open] [data-qr]").count()) assert.equal(await closing.page.locator("dialog[open] [data-qr]").isChecked(), false);
    await closing.page.keyboard.press("Escape");
  } finally { await closing.context.close(); }
  const away = await qg({ state: { current: null, archive: [{ ...OLD, mine: null }] } });
  try {
    await away.page.locator("[data-ss-closing]").waitFor();
    assert.match(await away.page.locator("[data-ss-closing]").innerText(), /Tu n’y as pas pris part : rien à signaler/);
  } finally { await away.context.close(); }
  const refused = await qg();
  try {
    await refused.page.locator("[data-ss-current]").waitFor();
    await refused.page.evaluate(() => { window.refuse = true; });
    await refused.page.getByRole("button", { name: "Rejoindre la saison" }).click();
    await refused.page.locator("[data-ss-notice]").waitFor();
    assert.match(await refused.page.locator("[data-ss-notice]").innerText(), /un jour après la création du compte/);
  } finally { await refused.context.close(); }
});

test("seasons: nothing when the flag is off, for a guest, without any season, or on a server without the function", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { state: { current: null, archive: [] } }, { missing: true }]) {
    const { page, context } = await qg(options);
    try {
      await page.waitForTimeout(600);
      assert.equal(await page.locator("[data-ss]").count(), 0);
    } finally { await context.close(); }
  }
});
