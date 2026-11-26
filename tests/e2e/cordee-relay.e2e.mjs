// V1.8.1 — Relais de cordée on the website. The relay step of the pilot route (« Le relais de la Sentinelle ») shows the shared state,
// what this member can do and how the others contribute; the buttons are only those the server offers (relay.can); a repeated tap
// sends one call; a refused session keeps the state and says why; the invitation link opens on desktop and on Android's browser.
// The server (titan_cordee_relay_v1) is replaced by a recorder; its rules are proven by sql/tests/300_cordee_relay.sql.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium, devices } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000c01";
const SHOTS = process.env.TITAN_RELAY_SHOTS || "";
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

test("I open the passage with my confirmed climbing session; then I am never offered to receive my own relay", async () => {
  const { page, context, errors } = await social({ cordees: [relayOf({ step: "sentinelle", status: "waiting", active: true, can: "transmit", hint: "transmit", opener: null, receiver: null })] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    assert.match(await step.innerText(), /Le relais de la Sentinelle[\s\S]*Passage fermé : personne ne l’a encore ouvert\.[\s\S]*Ta séance confirmée peut ouvrir le passage/);
    await shot(page, "relay-waiting");
    await page.evaluate(() => { window.relayAnswer = () => ({ step: "sentinelle", status: "opened", active: true, can: null, hint: "own", changed: true, opener: { name: "Moi", me: true, family: "technique" }, receiver: null }); });
    await step.getByRole("button", { name: "Transmettre le relais" }).click();
    await page.waitForFunction(() => document.querySelector("[data-cordee-relay-step]")?.dataset.cordeeRelayStep === "opened");
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_cordee_relay_v1").map(c => c[1])), [{ p_id: "k1", p_action: "transmit" }]);
    const text = await page.locator("[data-cordee=k1] .cm-cordee-relay").innerText();
    assert.match(text, /Tu as ouvert le passage \(Prisme\)\./);
    assert.match(text, /À un autre membre de jouer/);
    assert.equal(await page.locator("[data-cordee-relay]").count(), 0, "the normal flow offers the opener no way to receive the relay");
    await page.locator(".asc-toast").filter({ hasText: "Passage ouvert" }).first().waitFor();
    await shot(page, "relay-opened-own");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a friend opened the passage: I receive the relay once with my run of another day; a double tap sends one call", async () => {
  const { page, context, errors } = await social({ cordees: [relayOf({ step: "sentinelle", status: "opened", active: true, can: "confirm", hint: "confirm", opener: LEA, receiver: null })] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    const before = await step.innerText();
    assert.match(before, /Passage ouvert par Léa <img src=x onerror="window\.pwned=1"> \(Prisme\)\. Le relais attend un autre membre\./);
    assert.match(before, /Ta séance confirmée d’un autre jour te permet de recevoir le relais/);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    await shot(page, "relay-opened-friend");
    await page.evaluate(() => { window.relayAnswer = () => new Promise(r => setTimeout(() => r({ step: "sentinelle", status: "confirmed", active: true, can: null, hint: "done", changed: true, opener: { name: "Léa", me: false, family: "technique" }, receiver: { name: "Moi", me: true, family: "endurance" } }), 300)); });
    // relayAnswer may return a promise: the recorder resolves it before answering.
    await page.evaluate(() => {
      const rpc = window.titanClient.rpc;
      window.titanClient.rpc = (name, args = {}) => {
        if (name !== "titan_cordee_relay_v1") return rpc(name, args);
        window.calls.push([name, args]);
        const result = Promise.resolve(window.relayAnswer(args)).then((answer) => { window.cordees = window.cordees.map(c => c.id === args.p_id ? { ...c, relay: answer } : c); return { data: answer, error: null }; });
        result.setHeader = () => result; return result;
      };
    });
    await step.getByRole("button", { name: "Confirmer le relais" }).dblclick();
    await page.waitForFunction(() => document.querySelector("[data-cordee-relay-step]")?.dataset.cordeeRelayStep === "confirmed");
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_cordee_relay_v1").length), 1, "one call for a double tap");
    assert.match(await page.locator("[data-cordee=k1] .cm-cordee-relay").innerText(), /Relais passé : Léa \(Prisme\) → toi \(Souffle\)/);
    assert.equal(await page.locator("[data-cordee-relay]").count(), 0, "nothing more to confirm");
    await shot(page, "relay-confirmed-me");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a repeated validation answers « Déjà fait » and unlocks nothing; a refused session keeps the passage open and says why", async () => {
  const { page, context, errors } = await social({ cordees: [relayOf({ step: "sentinelle", status: "opened", active: true, can: "confirm", hint: "confirm", opener: LEA, receiver: null })] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    // The server refuses: the run was held for verification after the list was read.
    await page.evaluate(() => { window.relayAnswer = () => ({ error: { code: "22023", message: "RELAY_NO_SESSION" } }); });
    await step.getByRole("button", { name: "Confirmer le relais" }).click();
    const notice = page.locator("[data-cordee-notice]");
    await notice.waitFor();
    assert.match(await notice.innerText(), /séance confirmée par TITAN dans la cordée[\s\S]*Une séance en attente de vérification ne compte pas encore/);
    assert.equal(await page.locator("[data-cordee-relay-step]").getAttribute("data-cordee-relay-step"), "opened", "nothing was unlocked");
    await shot(page, "relay-refused-session");
    // Same day as the opening.
    await page.evaluate(() => { window.relayAnswer = () => ({ error: { code: "22023", message: "RELAY_OTHER_DAY" } }); });
    await page.locator("[data-cordee=k1] [data-cordee-relay]").click();
    await page.waitForFunction(() => /un autre jour que celui de la séance/.test(document.querySelector("[data-cordee-notice]")?.textContent || ""));
    // The server answers an already received relay with changed: false.
    await page.evaluate(() => { window.relayAnswer = () => ({ step: "sentinelle", status: "confirmed", active: true, can: null, hint: "done", changed: false, opener: { name: "Léa", me: false, family: "technique" }, receiver: { name: "Moi", me: true, family: "endurance" } }); });
    await page.locator("[data-cordee=k1] [data-cordee-relay]").click();
    await page.locator(".asc-toast").filter({ hasText: "Déjà fait" }).first().waitFor();
    assert.match(await page.locator("[data-cordee=k1] .cm-cordee-relay").innerText(), /Relais passé/);
    const k1 = await page.evaluate(() => window.cordees[0]);
    assert.equal(k1.total, 8, "the relay adds no longueur");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a third member sees what is open and how to contribute; names are only those the server sends", async () => {
  const third = { ...relayOf({ step: "sentinelle", status: "confirmed", active: true, can: null, hint: "done", opener: LEA, receiver: { name: "Membre de la cordée", me: false, family: null } }), mine: false };
  const { page, context, errors } = await social({ cordees: [third] });
  try {
    const step = page.locator("[data-cordee=k1] .cm-cordee-relay");
    await step.waitFor();
    const text = await step.innerText();
    assert.match(text, /Relais passé : Léa <img src=x onerror="window\.pwned=1"> \(Prisme\) → Membre de la cordée\./);
    assert.match(text, /À ton tour de faire avancer la cordée : chaque journée à 12 minutes d’effort confirmé apporte une longueur/);
    assert.doesNotMatch(text, /km|min\b.*\d{1,2}:\d{2}|novembre|décembre/, "no session detail");
    assert.equal(await step.locator("li[data-done=true]").count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no sideways scroll at 390 px");
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document.querySelector("#cordee"), { runOnly: ["wcag2a", "wcag2aa"] }).then(r => r.violations.map(v => v.id)));
    assert.deepEqual(axe, []);
    await shot(page, "relay-third-member");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("an invited member and a cordée without relay: no button; a closed flag shows no step", async () => {
  const invited = { ...relayOf({ step: "sentinelle", status: "opened", active: true, can: null, hint: "join", opener: LEA, receiver: null }), myStatus: "invited", mine: false, me: null };
  const forge = { ...BASE_CORDEE, id: "k5", route: "forge", title: "Les cols d’Obsidienne", relay: null };
  const { page, context, errors } = await social({ cordees: [invited, forge] });
  try {
    await page.locator("[data-cordee=k1] .cm-cordee-relay").waitFor();
    assert.match(await page.locator("[data-cordee=k1] .cm-cordee-relay").innerText(), /S’encorder d’abord pour prendre part au relais/);
    assert.equal(await page.locator("[data-cordee-relay]").count(), 0);
    assert.equal(await page.locator("[data-cordee=k5] .cm-cordee-relay").count(), 0, "other routes have no relay step");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

/* The invitation link of a pilot cordée: the same /defi?t=… page on a desktop browser and on Android's Chrome (Pixel 7 profile:
   Android user agent, touch, 412 px); nothing joined before a tap; a signed-out visitor is sent to sign in and back to the link. */
for (const [label, profile] of [["Web (desktop)", { viewport: { width: 1280, height: 900 } }], ["Android (Chrome, Pixel 7)", devices["Pixel 7"]]]) {
  test(`the cordée invitation link opens on ${label}`, async () => {
    const context = await browser.newContext({ ...profile, timezoneId: "Europe/Paris", serviceWorkers: "block" });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
    const page = await context.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      const client = {
        auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
        from: () => { throw new Error("no table"); },
        rpc: (name) => {
          window.__calls = (window.__calls || []).concat(name);
          const out = name === "titan_challenge_link_preview_v1" ? { data: { valid: true, title: "Les crêtes de l’Aube", metric: "pitches", sport: null, target: 10, endsAt: "2026-12-08T10:00:00Z", kind: "cordee", route: "aube", pace: "reguliere", participants: 2 }, error: null } : { data: null, error: { code: "PGRST202" } };
          const r = Promise.resolve(out); r.setHeader = () => r; return r;
        },
      };
      Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
      Object.defineProperty(window, "titanClient", { configurable: true, get: () => client, set() {} });
    });
    try {
      const token = "a".repeat(64);
      await page.goto(BASE + "/defi?t=" + token);
      const card = page.locator("[data-defi-cordee]");
      await card.waitFor();
      if (profile.userAgent) assert.match(await page.evaluate(() => navigator.userAgent), /Android/);
      assert.match(await card.innerText(), /Grande Cordée · invitation[\s\S]*Les crêtes de l’Aube/);
      const signup = await page.locator("[data-defi-signup]").getAttribute("href");
      assert.equal(signup, "/login?mode=signup&next=" + encodeURIComponent("/defi?t=" + token), "back to the same link after sign-up");
      assert.deepEqual(await page.evaluate(() => window.__calls.filter(n => n.startsWith("titan_challenge"))), ["titan_challenge_link_preview_v1"], "nothing joined on open");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no sideways scroll");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/link-${profile.userAgent ? "android" : "web"}.png`, fullPage: false });
      // A spent link reads the same plain message.
      await page.goto(BASE + "/defi?t=zz");
      await page.locator("[data-defi-invalid]").waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
