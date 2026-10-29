// QG: the daily rendezvous (COM-B7). Optional, private by default, shared only by choice, encouragements counted without names,
// no streak. Behind the server flag screens.intents.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000611";
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

async function qg({ flag = true, missing = false, signedIn = true, friends = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-29T12:00:00Z"));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && window.TitanIntents);
  await page.evaluate(({ flag, missing, signedIn, friends, owner }) => {
    window.calls = [];
    window.mine = null;
    window.friendRows = friends ? [{ userId: "f1", name: "Alex", intent: "Nager 1 km", done: true, cheered: false }, { userId: "f2", name: "Sam <b>", intent: "Repos actif", done: false, cheered: false }] : [];
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_intents_v1") out = { data: { mine: window.mine, friends: window.friendRows }, error: null };
          if (name === "titan_intent_set_v1") { window.mine = { intent: args.p_text, visibility: args.p_visibility, done: false, cheers: window.mine?.cheers || 0 }; out = { data: {}, error: null }; }
          if (name === "titan_intent_done_v1") { window.mine = { ...window.mine, done: args.p_done }; out = { data: {}, error: null }; }
          if (name === "titan_intent_clear_v1") { window.mine = null; out = { data: true, error: null }; }
          if (name === "titan_intent_cheer_v1") { window.friendRows = window.friendRows.map(f => f.userId === args.p_owner ? { ...f, cheered: args.p_on } : f); out = { data: {}, error: null }; }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.intents" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { flag, missing, signedIn, friends, owner: OWNER });
  return { page, context, errors };
}

test("rendez-vous: set a private intention, tick it, edit it, share it, clear it; nothing counts days or punishes", async () => {
  const { page, context, errors } = await qg({ friends: false });
  try {
    const empty = page.locator("[data-rv-empty]");
    await empty.waitFor();
    assert.match(await empty.innerText(), /un jour de repos est aussi un bon objectif/);
    assert.doesNotMatch(await page.locator("[data-rv]").innerText(), /série|manqué|streak/i);
    await empty.getByRole("button", { name: "Poser mon objectif" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    assert.match(await dialog.locator("[data-rv-error]").innerText(), /au moins trois caractères/);
    await dialog.locator("input[name=intent]").fill("Courir 30 minutes");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await page.locator("[data-rv-mine]").waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_intent_set_v1")[1]), { p_day: "2026-10-29", p_text: "Courir 30 minutes", p_visibility: "private" });
    assert.match(await page.locator("[data-rv-mine]").innerText(), /Privé : toi seul le vois/);
    await page.getByRole("button", { name: "C’est fait", exact: true }).click();
    await page.locator("[data-rv-mine][data-done=true]").waitFor();
    await page.locator("[data-rv-edit]").click();
    await page.locator("dialog[open] input[name=friends]").check();
    await page.locator("dialog[open]").getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForFunction(() => /Visible de tes amis/.test(document.querySelector("[data-rv-mine]")?.innerText || ""));
    await page.locator("[data-rv-clear]").click();
    await page.locator("[data-rv-empty]").waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("rendez-vous: friends' intentions are listed as text, can be encouraged, and the owner sees a count without names", async () => {
  const { page, context, errors } = await qg();
  try {
    const list = page.locator("[data-rv-friends]");
    await list.waitFor();
    assert.match(await list.innerText(), /Alex · Nager 1 km/);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.match(await list.locator("[data-rv-friend=f2]").innerText(), /Sam <b>/, "names are shown as text, not markup");
    await list.locator("[data-rv-cheer=f1]").click();
    await page.waitForFunction(() => document.querySelector("[data-rv-cheer=f1]")?.getAttribute("aria-pressed") === "true");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_intent_cheer_v1")[1]), { p_owner: "f1", p_day: "2026-10-29", p_on: true });
    await page.evaluate(() => { window.mine = { intent: "Vélo", visibility: "friends", done: false, cheers: 2 }; return window.TitanIntents.refresh(); });
    await page.waitForFunction(() => /2 amis t’encouragent/.test(document.querySelector("[data-rv-mine]")?.innerText || ""));
    assert.doesNotMatch(await page.locator("[data-rv-mine]").innerText(), /Alex|Sam/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("rendez-vous: nothing when the flag is off, for a guest, or on a server without the functions", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { missing: true }]) {
    const { page, context } = await qg(options);
    try {
      await page.waitForTimeout(600);
      assert.equal(await page.locator("[data-rv]").count(), 0);
    } finally { await context.close(); }
  }
});
