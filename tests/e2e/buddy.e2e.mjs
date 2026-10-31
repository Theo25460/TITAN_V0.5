// QG: the progress buddy (COM-C2). Voluntary, 14 days, the partner only seen through a count of active days, either side may stop.
// Behind the server flag screens.buddy.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000631";
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

const FRIENDS = [{ id: "f1", name: "Alex" }, { id: "f2", name: "Sam <b>" }];
async function qg({ state = { status: "none", friends: FRIENDS }, flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-29T12:00:00Z"));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user && window.TitanBuddy);
  await page.evaluate(({ state, flag, missing, signedIn, owner }) => {
    window.calls = []; window.buddy = state;
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_buddy_v1") out = { data: window.buddy, error: null };
          if (name === "titan_buddy_invite_v1") { window.buddy = { status: "pending", id: "b1", role: "inviter", partner: { id: args.p_friend, name: "Alex" } }; out = { data: {}, error: null }; }
          if (name === "titan_buddy_respond_v1") { window.buddy = args.p_accept ? { status: "active", id: "b1", role: "invitee", partner: { id: "f1", name: "Alex" }, daysLeft: 14, target: 12, myDays: 0, partnerDays: 1, together: 1, nudgedToday: false, nudgesReceived: 0 } : { status: "none", friends: [] }; out = { data: {}, error: null }; }
          if (name === "titan_buddy_nudge_v1") { window.buddy = { ...window.buddy, nudgedToday: true }; out = { data: {}, error: null }; }
          if (name === "titan_buddy_end_v1") { window.buddy = { status: "none", friends: [] }; out = { data: true, error: null }; }
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.buddy" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { state, flag, missing, signedIn, owner: OWNER });
  return { page, context, errors };
}

test("buddy: choose a friend, the invitation waits for the answer and can be cancelled; names are text", async () => {
  const { page, context, errors } = await qg();
  try {
    const card = page.locator("[data-bd]");
    await card.waitFor();
    assert.match(await card.innerText(), /Facultatif, et chacun peut arrêter quand il veut/);
    await card.getByRole("button", { name: "Choisir un ami" }).click();
    const dialog = page.locator("dialog[open]");
    assert.match(await dialog.innerText(), /Sam <b>/, "names are text, not markup");
    await dialog.getByRole("button", { name: "Envoyer l’invitation" }).click();
    await page.locator("[data-bd][data-status=pending]").waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_buddy_invite_v1")[1]), { p_friend: "f1" });
    assert.match(await page.locator("[data-bd]").innerText(), /Invitation envoyée à Alex/);
    await page.getByRole("button", { name: "Annuler l’invitation" }).click();
    await page.locator("[data-bd][data-status=none]").waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("buddy: an invitation can be declined or accepted; when active only active days are shown, with one encouragement a day and a way out", async () => {
  const { page, context, errors } = await qg({ state: { status: "pending", id: "b1", role: "invitee", partner: { id: "f1", name: "Alex" } } });
  try {
    const card = page.locator("[data-bd]");
    await card.waitFor();
    assert.match(await card.innerText(), /Rien d’obligatoire : tu peux refuser/);
    await card.getByRole("button", { name: "Accepter" }).click();
    await page.locator("[data-bd][data-status=active]").waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_buddy_respond_v1")[1]), { p_id: "b1", p_accept: true });
    const text = await card.innerText();
    assert.match(text, /À deux : 1 \/ 12 jours actifs · toi 0, Alex 1/);
    assert.match(text, /14 jours restants/);
    assert.doesNotMatch(text, /minutes|km|séance|running|natation/i, "no sport data of the partner");
    await card.getByRole("button", { name: "Encourager Alex" }).click();
    await page.waitForFunction(() => document.querySelector("[data-bd-nudge]")?.disabled === true);
    assert.match(await card.innerText(), /Encouragement envoyé/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    await card.getByRole("button", { name: "Arrêter le binôme" }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Arrêter" }).click();
    await page.locator("[data-bd][data-status=none]").waitFor();
    assert.ok(await page.evaluate(() => window.calls.some(c => c[0] === "titan_buddy_end_v1")));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("buddy: nothing when the flag is off, for a guest, or on a server without the functions; no friend yet is said kindly", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { missing: true }]) {
    const { page, context } = await qg(options);
    try {
      await page.waitForTimeout(600);
      assert.equal(await page.locator("[data-bd]").count(), 0);
    } finally { await context.close(); }
  }
  const alone = await qg({ state: { status: "none", friends: [] } });
  try {
    await alone.page.locator("[data-bd]").waitFor();
    assert.match(await alone.page.locator("[data-bd]").innerText(), /Quand tu auras ajouté un ami/);
    assert.equal(await alone.page.locator("[data-bd-choose]").count(), 0);
  } finally { await alone.context.close(); }
});
