// QG: the quiet "Pas aujourd'hui" card (HC-P0-06). Steps come from the account's daily-activity layer, never from a sensor on the web;
// a day without a number is "no data"; the optional goal is local; nothing is shown to a guest or on a server without the function.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000561";
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

const NOON = new Date("2026-10-29T12:00:00Z");
async function qg({ rows, missing = false, signedIn = true, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(NOON);
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && window.TitanStepsCard);
  await page.evaluate(({ rows, missing, signedIn, owner }) => {
    window.stepsCalls = [];
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        const result = Promise.resolve(name === "titan_daily_activity_v1"
          ? (window.stepsCalls.push(args), missing ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : { data: window.stepsRows, error: null })
          : { data: null, error: { code: "PGRST202", message: "Could not find" } });
        result.setHeader = () => result;
        return result;
      };
      window.stepsRows = rows;
      window.state.user.id = owner;
    }
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { rows, missing, signedIn, owner: OWNER });
  return { page, context, errors };
}
const row = (day, steps, updatedAt = "2026-10-29T09:30:00Z") => ({ day, steps, sources: ["health_connect"], updatedAt });

test("steps card: today, the last seven days, the source and the last refresh; a missing day is no data, not zero", async () => {
  const { page, context, errors } = await qg({ rows: [row("2026-10-29", 5400), row("2026-10-28", 8000), row("2026-10-26", 2000)] });
  try {
    const card = page.locator("[data-steps]");
    await card.waitFor();
    assert.equal((await card.locator("[data-steps-today]").innerText()).replace(/\s/g, ""), "5400");
    assert.match(await card.locator("[role=img]").getAttribute("aria-label"), /sans donnée/);
    const note = await card.locator("[data-steps-note]").innerText();
    assert.match(note, /Santé Connect/);
    assert.match(note, /Dernière mise à jour aujourd’hui à/);
    assert.match(note, /ni comme une séance, ni pour l’XP/);
    assert.equal(await page.evaluate(() => window.stepsCalls[0].p_to), "2026-10-29");
    assert.equal(await page.evaluate(() => window.stepsCalls[0].p_from), "2026-09-30", "thirty civil days ending today");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("steps card: a new reading replaces the day, it is never added to the old one", async () => {
  const { page, context } = await qg({ rows: [row("2026-10-29", 5000)] });
  try {
    await page.locator("[data-steps-today]").waitFor();
    await page.evaluate(() => { window.stepsRows = [{ day: "2026-10-29", steps: 5400, sources: ["health_connect"], updatedAt: "2026-10-29T10:00:00Z" }]; return window.TitanStepsCard.refresh(true); });
    await page.waitForFunction(() => document.querySelector("[data-steps-today]")?.textContent.replace(/\s/g, "") === "5400");
  } finally { await context.close(); }
});

test("steps card: with only older days it says there is no number today", async () => {
  const { page, context } = await qg({ rows: [row("2026-10-27", 3000)] });
  try {
    await page.locator("[data-steps-none]").waitFor();
    assert.match(await page.locator("[data-steps]").innerText(), /Pas encore de donnée aujourd’hui/);
  } finally { await context.close(); }
});

test("steps card: the optional goal is local, validated, and can be removed", async () => {
  const { page, context } = await qg({ rows: [row("2026-10-29", 4000)] });
  try {
    await page.getByRole("button", { name: "Fixer un objectif" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("input[name=goal]").fill("500");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    assert.match(await dialog.locator("[data-goal-error]").innerText(), /entre 1 000 et 100 000/);
    await dialog.locator("input[name=goal]").fill("8000");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await page.locator("[data-steps] [role=progressbar]").waitFor();
    assert.match(await page.locator("[data-steps]").innerText(), /Objectif 8\s?000 pas · 50 %/);
    assert.equal(await page.evaluate(owner => localStorage.getItem(`titan_steps_goal_${owner}`), OWNER), "8000");
    await page.getByRole("button", { name: "Objectif", exact: true }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Retirer l’objectif" }).click();
    await page.waitForFunction(() => !document.querySelector("[data-steps] [role=progressbar]"));
    assert.equal(await page.evaluate(owner => localStorage.getItem(`titan_steps_goal_${owner}`), OWNER), null);
  } finally { await context.close(); }
});

test("steps card: nothing for a guest, for an account without any number, or on a server without the function", async () => {
  for (const options of [{ signedIn: false, rows: [] }, { rows: [] }, { rows: [row("2026-10-29", 100)], missing: true }]) {
    const { page, context } = await qg(options);
    try {
      await page.waitForTimeout(600);
      assert.equal(await page.locator("[data-steps]").count(), 0);
    } finally { await context.close(); }
  }
});
