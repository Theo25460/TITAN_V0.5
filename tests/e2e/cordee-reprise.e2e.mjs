// V1.8.2 — Reprise et relais facultatifs on the website. A member who holds the relay and needs a pause hands it over (to one member
// the server allows, or to the whole cordée) without giving any reason; the member offered accepts once (a double tap sends one call)
// and still has to receive the relay with their own session; a third member sees only that a handover is pending; a lost race says so;
// leaving tells the truth (longueurs kept), and a group left with one member reads what the collective rule asks. The server
// (titan_cordee_relay_turn_v1) is replaced by a recorder; its rules are proven by sql/tests/300_cordee_reprise.sql and the two-connection
// contract tools/db/test-cordee-reprise-concurrency.sh.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium, devices } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000c01";
const SHOTS = process.env.TITAN_REPRISE_SHOTS || "";
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
const BASE_CORDEE = {
  id: "k1", title: "Les crêtes de l’Aube", route: "aube", pace: "reguliere", startsAt: new Date(Date.now() - 4 * 86400000).toISOString(), endsAt: new Date(Date.now() + 10 * 86400000).toISOString(), days: 14,
  status: "active", summitedAt: null, mine: true, myStatus: "joined", share: 10, cap: 15, target: 30, longueurs: 6, variety: 2, total: 8, percent: 26, camps: 1,
  families: ["technique", "endurance"], joined: 3, title_key: "cordee:aube", earned: false,
  me: { pitches: 2, counted: 2, days: 1, families: ["technique"], strand: false },
  members: [
    { id: OWNER, name: "Moi", status: "joined", me: true, pitches: 2, strand: false, families: ["technique"] },
    { id: "u-lea", name: `Léa ${evil}`, status: "joined", me: false, pitches: 4, strand: false, families: ["endurance"] },
    { id: null, name: "Membre de la cordée", status: "joined", me: false },
  ],
};
const relayOf = (relay) => ({ ...BASE_CORDEE, relay });
const ME = { name: "Moi", me: true, family: "technique" };
const LEA = { name: `Léa ${evil}`, me: false, family: "technique" };
const SAM = { name: "Sam", me: false, family: "endurance" };

async function social({ cordees = [ACTIVE], flag = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.state?.user && window.titanClient && window.TitanCordee && window.TitanCordeeView);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ owner, cordees, flag }) => {
    window.calls = []; window.cordees = cordees;
    window.titanClient.auth.getSession = async () => ({ data: { session: { access_token: "t", user: { id: owner } } }, error: null });
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
      if (name === "titan_social_overview") out = { data: { me: { id: owner, friend_code: "TN-QA23", findable: true }, friends: [{ id: "u-lea", name: "Léa", avatar: "scout" }, { id: "u-sam", name: "Sam", avatar: "scout" }], requests_in: [], requests_out: [], moments: [], challenges: [], expedition: null, guild: null }, error: null };
      if (name === "titan_cordees_v1") out = { data: { cordees: window.cordees, titles: [] }, error: null };
      if (name === "titan_cordee_create_v1") { window.cordees = [{ ...window.cordees[0] || {}, ...{ id: "k9", route: args.p_route, title: "Les cols d’Obsidienne", status: "active", myStatus: "joined", mine: true, target: 9, share: 9, total: 0, percent: 0, camps: 0, longueurs: 0, variety: 0, families: [], joined: 1, members: [{ id: owner, name: "Moi", status: "joined", me: true, pitches: 0, strand: false, families: [] }], me: { pitches: 0, counted: 0, days: 0, families: [], strand: false } } }]; out = { data: { id: "k9", invited: args.p_invitees.length }, error: null }; }
      if (name === "titan_challenge_respond") { window.cordees = window.cordees.map(c => c.id === args.p_id ? { ...c, myStatus: args.p_action === "join" ? "joined" : "declined" } : c); out = { data: { status: "joined" }, error: null }; }
      if (name === "titan_challenge_link_create_v1") out = { data: { id: "i1", token: "e".repeat(64), expiresAt: "2026-11-24T10:00:00Z" }, error: null };
      if (name === "titan_set_displayed_title") out = { data: { key: args.p_key, label: "Brin de l’Aube" }, error: null };
      if (name === "titan_moment_share") out = { data: { id: "m1" }, error: null };
      if (name === "titan_cordee_relay_turn_v1") {
        const answer = window.turnAnswer ? window.turnAnswer(args) : null;
        out = answer && answer.error ? { data: null, error: answer.error } : { data: answer, error: null };
        if (answer && !answer.error) window.cordees = window.cordees.map(c => c.id === args.p_id ? { ...c, relay: answer } : c);
        if (answer && answer.error && window.afterError) window.cordees = window.afterError(window.cordees);
      }
      if (name === "titan_cordee_relay_v1") {
        const answer = window.relayAnswer ? window.relayAnswer(args) : null;
        out = answer && answer.error ? { data: null, error: answer.error } : { data: answer, error: null };
        if (answer && !answer.error) window.cordees = window.cordees.map(c => c.id === args.p_id ? { ...c, relay: answer } : c);
      }
      const result = Promise.resolve(out); result.setHeader = () => result; return result;
    };
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    const flags = { enabled: (key, fallback) => key === "screens.cordee" || key === "screens.cordee_relay" ? flag : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { owner: OWNER, cordees, flag });
  return { page, context, errors };
}

async function shot(page, name) { if (SHOTS) await page.locator("[data-cordee=k1]").screenshot({ path: `${SHOTS}/${name}.png` }); }
const R = (relay) => ({ step: "sentinelle", status: "opened", active: true, can: null, opener: LEA, receiver: null, holder: null, holdUntil: null, handover: null, turn: [], choices: null, ...relay });
const HOLDING = R({ hint: "holder_session", holder: { name: "Moi", me: true, family: null }, turn: ["handover"], choices: [{ id: "u-sam", name: "Sam" }] });

test("I hold the relay and need a pause: I pass the hand to Sam without giving any reason, and can withdraw it", async () => {
  const { page, context, errors } = await social({ cordees: [relayOf(HOLDING)] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    assert.match(await step.innerText(), /Tu as pris le relais \(72 h au plus\)\.[\s\S]*Si tu dois faire une pause, passe la main/);
    await shot(page, "reprise-holder");
    await step.getByRole("button", { name: "Passer la main" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    assert.match(await sheet.innerText(), /Toute la cordée[\s\S]*Sam/);
    assert.equal(await sheet.locator("textarea, input[type=text]").count(), 0, "no reason is ever asked");
    assert.match(await sheet.innerText(), /personne ne voit pourquoi tu passes la main/);
    if (SHOTS) await sheet.screenshot({ path: `${SHOTS}/reprise-handover-sheet.png` });
    await page.evaluate(() => { window.turnAnswer = (a) => ({ step: "sentinelle", status: "opened", active: true, can: null, hint: "paused", changed: true, opener: { name: "Léa", me: false, family: "technique" }, receiver: null, holder: { name: "Moi", me: true, family: null }, handover: { pending: true, mine: true, forMe: false, open: a.p_to === null, to: a.p_to ? { name: "Sam", me: false, family: null } : null }, turn: ["withdraw"], choices: null }); });
    await sheet.getByLabel("Sam").check();
    await sheet.getByRole("button", { name: "Passer la main" }).click();
    await page.waitForFunction(() => /en attente de sa réponse/.test(document.querySelector("[data-cordee-relay-handover]")?.textContent || ""));
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_cordee_relay_turn_v1").map(c => c[1])), [{ p_id: "k1", p_action: "handover", p_to: "u-sam" }]);
    const text = await page.locator("[data-cordee=k1] .cm-cordee-relay").innerText();
    assert.match(text, /Tu as passé la main à Sam : en attente de sa réponse\./);
    assert.match(text, /Sans réponse, il redevient libre pour toute la cordée/);
    await shot(page, "reprise-paused");
    await page.evaluate(() => { window.turnAnswer = () => ({ step: "sentinelle", status: "opened", active: true, can: null, hint: "holder_session", changed: true, opener: { name: "Léa", me: false, family: "technique" }, receiver: null, holder: { name: "Moi", me: true, family: null }, handover: null, turn: ["handover"], choices: [{ id: "u-sam", name: "Sam" }] }); });
    await page.locator("[data-cordee=k1]").getByRole("button", { name: "Retirer ma passation" }).click();
    await page.locator(".asc-toast").filter({ hasText: "Passation retirée" }).first().waitFor();
    assert.equal(await page.locator("[data-cordee-relay-handover]").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the relay is offered to me: I take it back once (double tap = one call), then I still receive it with my own session", async () => {
  const offered = R({ hint: "offered", holder: { name: "Léa", me: false, family: null }, handover: { pending: true, mine: false, forMe: true, open: false, to: null }, turn: ["accept"] });
  const { page, context, errors } = await social({ cordees: [relayOf(offered)] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    const before = await step.innerText();
    assert.match(before, /Le relais t’est proposé : tu peux le reprendre\./);
    assert.match(before, /rien n’est validé d’avance/);
    assert.equal(await step.getByRole("button", { name: "Confirmer le relais" }).count(), 0, "accepting is not receiving");
    await shot(page, "reprise-offered");
    await page.evaluate(() => {
      const rpc = window.titanClient.rpc;
      window.titanClient.rpc = (name, args = {}) => {
        if (name !== "titan_cordee_relay_turn_v1") return rpc(name, args);
        window.calls.push([name, args]);
        const answer = { step: "sentinelle", status: "opened", active: true, can: "confirm", hint: "holder", changed: true, opener: { name: "Léa", me: false, family: "technique" }, receiver: null, holder: { name: "Moi", me: true, family: null }, handover: null, turn: ["handover"], choices: [] };
        const result = new Promise(r => setTimeout(() => { window.cordees = window.cordees.map(c => c.id === args.p_id ? { ...c, relay: answer } : c); r({ data: answer, error: null }); }, 300));
        result.setHeader = () => result; return result;
      };
    });
    await step.getByRole("button", { name: "Reprendre le relais" }).dblclick();
    await page.locator("[data-cordee=k1]").getByRole("button", { name: "Confirmer le relais" }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_cordee_relay_turn_v1").length), 1, "one call for a double tap");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_cordee_relay_turn_v1")[1]), { p_id: "k1", p_action: "accept" });
    assert.match(await page.locator("[data-cordee=k1] .cm-cordee-relay").innerText(), /Tu tiens le relais : ta séance confirmée d’un autre jour te permet de le recevoir/);
    assert.equal(await page.evaluate(() => window.cordees[0].total), 8, "taking the relay back adds no longueur");
    await shot(page, "reprise-accepted");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("two members accept at the same time: the one who lost reads it plainly and sees the new holder", async () => {
  const open = R({ hint: "offered", holder: { name: "Léa", me: false, family: null }, handover: { pending: true, mine: false, forMe: true, open: true, to: null }, turn: ["accept"] });
  const { page, context, errors } = await social({ cordees: [relayOf(open)] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    assert.match(await step.innerText(), /Le relais est proposé à toute la cordée : tu peux le reprendre\./);
    await page.evaluate(() => {
      window.turnAnswer = () => ({ error: { code: "22023", message: "RELAY_HANDOVER_TAKEN" } });
      window.afterError = (list) => list.map(c => ({ ...c, relay: { ...c.relay, hint: "held", holder: { name: "Sam", me: false, family: null }, handover: null, turn: [] } }));
    });
    await step.getByRole("button", { name: "Reprendre le relais" }).click();
    await page.locator("[data-cordee-notice]").filter({ hasText: "Un autre membre vient de reprendre le relais." }).waitFor();
    const text = await page.locator("[data-cordee=k1] .cm-cordee-relay").innerText();
    assert.match(text, /Relais pris en charge par Sam\./);
    assert.equal(await page.locator("[data-cordee=k1] [data-cordee-turn]").count(), 0, "nothing left to accept");
    await shot(page, "reprise-race-lost");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a third member sees only that a handover is pending: no recipient, no reason, no button", async () => {
  const third = { ...relayOf(R({ hint: "held", holder: { name: "Membre de la cordée", me: false, family: null }, handover: { pending: true, mine: false, forMe: false, open: null, to: null } })), mine: false };
  const { page, context, errors } = await social({ cordees: [third] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    const text = await step.innerText();
    assert.match(text, /Relais pris en charge par Membre de la cordée\.[\s\S]*Passation en cours\./);
    assert.doesNotMatch(text, /pause|raison|motif|Sam|malad|bless/i, "no reason and no recipient");
    assert.equal(await step.locator("button").count(), 0);
    await shot(page, "reprise-third-member");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a free relay: taking it is optional; leaving says the longueurs stay; a group left with one member reads the collective rule", async () => {
  const free = relayOf(R({ hint: "confirm", can: "confirm", turn: ["take"] }));
  const alone = { ...BASE_CORDEE, id: "k2", joined: 1, needs: 2, kept: 2, contributors: 2, target: 12, total: 6, percent: 50, camps: 2,
    members: [BASE_CORDEE.members[0]], relay: R({ hint: "alone", opener: { name: "Moi", me: true, family: "technique" } }) };
  const { page, context, errors } = await social({ cordees: [free, alone] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    assert.match(await step.innerText(), /Facultatif : prendre le relais le réserve 72 h au plus ; sinon tout membre peut le recevoir\./);
    assert.equal(await step.getByRole("button", { name: "Confirmer le relais" }).count(), 1);
    assert.equal(await step.getByRole("button", { name: "Prendre le relais" }).count(), 1);
    const k2 = page.locator("[data-cordee=k2]");
    assert.match(await k2.locator("[data-cordee-kept]").innerText(), /2 longueurs restent acquises grâce à des membres partis/);
    assert.match(await k2.locator("[data-cordee-alone]").innerText(), /il faut les longueurs d’au moins deux membres/);
    assert.match(await k2.locator(".cm-cordee-relay").innerText(), /Il faut un autre membre encordé pour recevoir le relais/);
    assert.equal(await k2.locator(".cm-cordee-relay button").count(), 0);
    if (SHOTS) await k2.screenshot({ path: `${SHOTS}/reprise-alone.png` });
    await page.locator("[data-cordee=k1] [data-cordee-leave]").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Les longueurs que tu as déjà apportées restent acquises[\s\S]*Personne ne voit pourquoi tu pars/);
    assert.doesNotMatch(await dialog.innerText(), /ne compteront plus/);
    await dialog.getByRole("button", { name: "Annuler" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no sideways scroll at 390 px");
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document.querySelector("#cordee"), { runOnly: ["wcag2a", "wcag2aa"] }).then(r => r.violations.map(v => v.id)));
    assert.deepEqual(axe, []);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
