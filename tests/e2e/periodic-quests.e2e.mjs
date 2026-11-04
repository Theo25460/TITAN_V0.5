// V11-13 / V11-15: the weekly and monthly quests on the Aventure screen (the server contract is mocked at the RPC boundary).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(BASE + "/")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "local athlete server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}


const OWNER = "00000000-0000-4000-8000-000000000555";
const QUESTS = {
  version: 1,
  week: { scope: "week", period_start: "2026-11-09", period_end: "2026-11-15", kind: "constancy", target: { days: 3 }, progress: { days: 1 }, complete: false, claimed: false, focus: ["running"] },
  month: { scope: "month", period_start: "2026-11-01", period_end: "2026-11-30", kind: "multisport", target: { sports: 2 }, progress: { sports: 1 }, complete: false, claimed: false },
  souvenirs: { weeks: 1, months: 0 },
};
async function questPage({ guest = false, mode = "open" } = {}) {
  const f = await newPage(390), { page } = f;
  await page.goto(BASE + "/adventure", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ owner, quests, guest, mode }) => {
    window.questCalls = []; window.questMode = mode; window.questData = JSON.parse(JSON.stringify(quests));
    if (mode === "ready") window.questData.week = { ...window.questData.week, progress: { days: 3 }, complete: true };
    if (!guest) window.state.user.id = owner;
    window.titanClient.rpc = (name, args) => {
      window.questCalls.push([name, args || null]);
      if (window.questMode === "missing") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
      if (window.questMode === "error") return Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } });
      if (name === "titan_periodic_quest_claim_v1") {
        window.questData[args.p_scope] = { ...window.questData[args.p_scope], claimed: true };
        window.questData.souvenirs = { weeks: 2, months: 0 };
        return Promise.resolve({ data: window.questData, error: null });
      }
      if (name === "titan_periodic_quests_v1") return window.questMode === "slow" ? new Promise((r) => { window.questRelease = () => r({ data: window.questData, error: null }); }) : Promise.resolve({ data: window.questData, error: null });
      return Promise.resolve({ data: null, error: { code: "PGRST202" } });
    };
    const snapshot = { ...window.TitanAdventure.snapshot, owner: window.state.user.id, selected_world: "aube", campaigns: [{ id: "aube", route: "rhythm", chapter: 2, target: 2, evidence: { days: 1, effort: 10 } }] };
    window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    window.TitanPeriodicQuests.refresh(true);
    dispatchEvent(new CustomEvent("titan:adventure-updated"));
  }, { owner: OWNER, quests: QUESTS, guest, mode });
  return f;
}

test("the week and month quests appear with their progress, wording and the keepsake promise", async () => {
  const { page, context, errors } = await questPage();
  try {
    const panel = page.locator("[data-periodic-quests]");
    await panel.waitFor();
    const text = await panel.innerText();
    assert.match(text, /Garder ton rythme/); assert.match(text, /3 jours actifs/);
    assert.match(text, /Varier à ta façon/); assert.match(text, /Pas besoin d’en découvrir un nouveau/);
    assert.match(text, /facultative/i); assert.match(text, /ni XP, ni crédits/);
    assert.match(text, /1\/3 jours/); assert.match(text, /1\/2 sports/);
    assert.equal(await panel.locator("[data-quest-claim]").count(), 0, "nothing to claim yet");
    assert.match(await panel.locator("[data-pq-souvenirs]").innerText(), /1 souvenir de semaine/);
    assert.equal(await panel.locator('[role="progressbar"]').first().getAttribute("aria-valuenow"), "1");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a finished quest is claimed once, even on a double click, and becomes a recovered keepsake", async () => {
  const { page, context, errors } = await questPage({ mode: "ready" });
  try {
    const button = page.locator('[data-quest-claim="week"]');
    await button.waitFor();
    await button.dblclick();
    await page.locator('[data-periodic-quest="week"][data-state="claimed"]').waitFor();
    const claims = await page.evaluate(() => window.questCalls.filter(([n]) => n === "titan_periodic_quest_claim_v1"));
    assert.equal(claims.length, 1, "one claim request");
    assert.deepEqual(claims[0][1], { p_scope: "week" });
    assert.match(await page.locator('[data-periodic-quest="week"]').innerText(), /Souvenir récupéré/);
    assert.equal(await page.locator("[data-quest-claim]").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a guest, a server without the function and a failing server never break the Aventure screen", async () => {
  for (const [label, opts] of [["guest", { guest: true }], ["missing", { mode: "missing" }], ["error", { mode: "error" }]]) {
    const { page, context, errors } = await questPage(opts);
    try {
      await page.waitForTimeout(300);
      assert.equal(await page.locator("[data-periodic-quests]").count(), 0, label);
      assert.ok((await page.locator("#aventure").innerText()).length > 50, "the Aventure screen is still there");
      if (label === "guest") assert.equal(await page.evaluate(() => window.questCalls.length), 0, "a guest never calls the server");
      assert.deepEqual(errors, [], label);
    } finally { await context.close(); }
  }
});

test("an answer for the previous account is never shown to the next one", async () => {
  const { page, context, errors } = await questPage({ mode: "slow" });
  try {
    await page.evaluate(() => { window.state.user.id = "00000000-0000-4000-8000-000000000666"; window.titanAccountTransition = { active: false, epoch: 99 }; });
    await page.evaluate(() => window.questRelease());
    await page.waitForTimeout(300);
    assert.equal(await page.locator("[data-periodic-quests]").count(), 0, "the late answer of account A is dropped");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
