// QG: the common quest of the week (COM-B1). Optional, collective, aggregates only, nothing granted. Behind the server flag screens.commonquest.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000621";
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

const QUEST = { id: "q1", title: "Mille minutes ensemble", detail: "Tous les sports comptent.", weekStart: "2026-10-26", endsAt: "2026-11-01T23:00:00Z", target: 1000, minutes: 400, members: 12, joined: false, mine: 0, state: "open" };
async function qg({ quest = QUEST, flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-29T12:00:00Z"));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && window.TitanCommonQuest);
  await page.evaluate(({ quest, flag, missing, signedIn, owner }) => {
    window.calls = []; window.quest = quest;
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_common_quest_v1") out = { data: window.quest, error: null };
          if (name === "titan_common_quest_join_v1") {
            if (window.refuse) out = { data: null, error: { code: "42501", message: "NOT_ELIGIBLE" } };
            else { window.quest = { ...window.quest, joined: args.p_join, members: window.quest.members + (args.p_join ? 1 : -1), mine: args.p_join ? 25 : 0 }; out = { data: {}, error: null }; }
          }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.commonquest" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { quest, flag, missing, signedIn, owner: OWNER });
  return { page, context, errors };
}

test("common quest: shown as totals, joined on purpose, the player sees only its own share; no reward is promised", async () => {
  const { page, context, errors } = await qg();
  try {
    const card = page.locator("[data-cq]");
    await card.waitFor();
    assert.match(await card.innerText(), /400 \/ 1\s?000 min d’effort · 12 participants/);
    assert.doesNotMatch(await card.innerText(), /ta part/);
    assert.match(await card.innerText(), /Aucun XP ni crédit à gagner/);
    assert.equal(await card.locator("[role=progressbar]").getAttribute("aria-valuenow"), "40");
    await card.getByRole("button", { name: "Rejoindre la quête" }).click();
    await page.waitForFunction(() => /ta part : 25 min/.test(document.querySelector("[data-cq]")?.innerText || ""));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_common_quest_join_v1")[1]), { p_quest: "q1", p_join: true });
    await page.getByRole("button", { name: "Quitter la quête" }).click();
    await page.waitForFunction(() => !/ta part/.test(document.querySelector("[data-cq]")?.innerText || ""));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("common quest: a finished goal and an ended week are said plainly; a refusal is explained", async () => {
  const done = await qg({ quest: { ...QUEST, minutes: 1200, state: "done", joined: true, mine: 60 } });
  try {
    await done.page.locator("[data-cq][data-state=done]").waitFor();
    assert.match(await done.page.locator("[data-cq]").innerText(), /Objectif atteint ensemble/);
    assert.equal(await done.page.locator("[aria-valuenow='100']").count(), 1, "the bar stops at one hundred per cent");
  } finally { await done.context.close(); }
  const closed = await qg({ quest: { ...QUEST, state: "closed" } });
  try {
    await closed.page.locator("[data-cq][data-state=closed]").waitFor();
    assert.equal(await closed.page.locator("[data-cq-join]").count(), 0, "no join once the week ended");
  } finally { await closed.context.close(); }
  const refused = await qg();
  try {
    await refused.page.locator("[data-cq]").waitFor();
    await refused.page.evaluate(() => { window.refuse = true; });
    await refused.page.getByRole("button", { name: "Rejoindre la quête" }).click();
    await refused.page.locator("[data-cq-notice]").waitFor();
    assert.match(await refused.page.locator("[data-cq-notice]").innerText(), /un jour après la création du compte/);
  } finally { await refused.context.close(); }
});

test("common quest: nothing when the flag is off, for a guest, without a quest, or on a server without the function", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { quest: null }, { missing: true }]) {
    const { page, context } = await qg(options);
    try {
      await page.waitForTimeout(600);
      assert.equal(await page.locator("[data-cq]").count(), 0);
    } finally { await context.close(); }
  }
});

test("common quest: a finished goal can be shared as an image that shows no name until the athlete ticks it (COM-E1)", async () => {
  const { page, context, errors } = await qg({ quest: { ...QUEST, minutes: 1200, state: "done", joined: true, mine: 60 } });
  try {
    await page.evaluate(() => { window.state.user.name = "Camille"; });
    await page.waitForFunction(() => window.TitanCard && document.querySelector("[data-cq-card]"));
    await page.locator("[data-cq-card]").click();
    const sheet = page.locator("dialog[open] .cd-sheet");
    await sheet.waitFor();
    const nameBox = sheet.locator("[data-name]");
    await page.waitForFunction(() => document.querySelector(".cd-preview img")?.getAttribute("src")?.startsWith("data:image/png"));
    const first = await page.locator(".cd-preview img").getAttribute("src");
    if (await nameBox.count()) {
      assert.equal(await nameBox.isChecked(), false);
      await nameBox.check();
      await page.waitForFunction(old => document.querySelector(".cd-preview img")?.getAttribute("src") !== old && document.querySelector(".cd-preview img")?.getAttribute("src")?.startsWith("data:image/png"), first);
    }
    assert.equal(await sheet.locator("[data-qr]").count() ? await sheet.locator("[data-qr]").isChecked() : false, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
