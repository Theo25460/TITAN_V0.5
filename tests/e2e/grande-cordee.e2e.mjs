// Social lot C on the website: La Grande Cordée. Behind the server flag screens.cordee. A player reads the common goal, their part,
// the group and what was unlocked; forms a cordée with friends; joins on an explicit tap; at the summit wears the route title and
// shares the moment. The invitation landing (/defi) says it is a cordée without naming anyone. Driven with a recorder.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000c01";
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
const ACTIVE = {
  id: "k1", title: "Les crêtes de l’Aube", route: "aube", pace: "reguliere", startsAt: "2026-11-10T10:00:00Z", endsAt: "2026-11-24T10:00:00Z", days: 14,
  status: "active", summitedAt: null, mine: true, myStatus: "joined", share: 10, cap: 15, target: 30, longueurs: 25, variety: 4, total: 29, percent: 96, camps: 3,
  families: ["endurance", "mobilite", "force"], joined: 3, title_key: "cordee:aube", earned: false,
  me: { pitches: 15, counted: 15, days: 9, families: ["endurance"], strand: true },
  members: [
    { id: OWNER, name: "Moi", status: "joined", me: true, pitches: 15, strand: true, families: ["endurance"] },
    { id: "u-lea", name: `Léa ${evil}`, status: "joined", me: false, pitches: 4, strand: false, families: ["mobilite"] },
    { id: null, name: "Membre de la cordée", status: "joined", me: false, pitches: 6, strand: false, families: ["force"] },
  ],
};

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
      const result = Promise.resolve(out); result.setHeader = () => result; return result;
    };
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    const flags = { enabled: (key, fallback) => key === "screens.cordee" ? flag : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { owner: OWNER, cordees, flag });
  return { page, context, errors };
}

test("a running cordée says the common goal, my part, the group, what is unlocked and who is in it; names are text", async () => {
  const { page, context, errors } = await social();
  try {
    const card = page.locator("[data-cordee=k1]");
    await card.waitFor();
    const text = await card.innerText();
    assert.match(text, /Objectif commun : 30 longueurs ensemble, soit 10 par membre encordé/);
    assert.match(text, /Ton brin est tressé : 15 longueurs apportées/);
    assert.match(text, /La cordée : 29 \/ 30 \(dont 4 grâce à la variété des sports\)/);
    assert.match(text, /Voies ouvertes : Souffle, Sève, Acier/);
    assert.match(text, /Débloqué : Le gué des premiers pas · La terrasse des bergers · Le col des Sentinelles/);
    assert.match(text, /Prochain camp : La crête de l’Aube à 30 longueurs/);
    assert.match(text, /Léa <img src=x onerror="window\.pwned=1">/);
    assert.match(text, /Membre de la cordée/);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await card.locator(".cm-cordee-camps li[data-reached=true]").count(), 3);
    await card.locator("[data-cordee-link=k1]").click();
    await page.waitForFunction(async () => { try { return (await navigator.clipboard.readText()).includes("/defi?t=" + "e".repeat(64)); } catch { return false; } });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no sideways scroll at 390 px");
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document.querySelector("#cordee"), { runOnly: ["wcag2a", "wcag2aa"] }).then(r => r.violations.map(v => v.id)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("forming a cordée: a route, a pace, a duration, friends ticked; the preview states each member's share", async () => {
  const { page, context, errors } = await social({ cordees: [] });
  try {
    await page.locator("[data-cordee-empty]").waitFor();
    await page.locator("[data-cordee-new]").click();
    const sheet = page.locator("dialog[open]");
    await sheet.waitFor();
    await sheet.locator("input[name=route][value=forge]").check();
    await sheet.locator("input[name=pace][value=douce]").check();
    await sheet.locator("select[name=days]").selectOption("21");
    assert.match(await sheet.locator("[data-cordee-preview]").innerText(), /ajoute 9 longueurs à l’objectif commun ; la part de chacun compte jusqu’à 14/);
    await sheet.locator("input[name=invite][value=u-lea]").check();
    await sheet.getByRole("button", { name: "Former la cordée" }).click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_cordee_create_v1"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_cordee_create_v1")[1]), { p_route: "forge", p_pace: "douce", p_days: 21, p_invitees: ["u-lea"] });
    await page.locator("[data-cordee=k9]").waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("an invitation joins only on « S’encorder »; at the summit the title can be worn and the moment shared", async () => {
  const invited = { ...ACTIVE, id: "k2", mine: false, myStatus: "invited", me: null, members: ACTIVE.members.slice(1) };
  const summit = { ...ACTIVE, id: "k3", status: "summited", summitedAt: "2026-11-19T10:00:00Z", total: 30, percent: 100, camps: 4, earned: true };
  const { page, context, errors } = await social({ cordees: [invited, summit] });
  try {
    const inv = page.locator("[data-cordee=k2]");
    await inv.waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_challenge_respond").length), 0, "nothing joined on load");
    assert.match(await inv.innerText(), /Rejoins la cordée pour y apporter tes longueurs/);
    await inv.getByRole("button", { name: "S’encorder" }).click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_challenge_respond"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_challenge_respond")[1]), { p_id: "k2", p_action: "join" });
    const top = page.locator("[data-cordee=k3]");
    await top.waitFor();
    assert.match(await top.innerText(), /Sommet atteint : La crête de l’Aube\. Titre « Brin de l’Aube »/);
    await top.locator("[data-cordee-wear=aube]").click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_set_displayed_title"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_set_displayed_title")[1]), { p_key: "cordee:aube" });
    await page.waitForFunction(() => !document.querySelector("[data-cordee-share=k3]")?.disabled);
    await page.locator("[data-cordee-share=k3]").click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_moment_share"));
    const share = await page.evaluate(() => window.calls.find(c => c[0] === "titan_moment_share")[1]);
    assert.equal(share.p_kind, "challenge");
    assert.equal(share.p_title, "Sommet : Les crêtes de l’Aube");
    assert.equal(share.p_visibility, "friends");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("nothing shows while the flag is closed", async () => {
  const { page, context, errors } = await social({ flag: false });
  try {
    await page.waitForTimeout(600);
    assert.equal(await page.locator("#cordee").isHidden(), true);
    assert.equal(await page.evaluate(() => window.calls.some(c => c[0] === "titan_cordees_v1")), false, "no call either");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the invitation landing says it is a cordée, names nobody and joins only on a tap", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    const client = {
      auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
      from: () => { throw new Error("no table"); },
      rpc: (name) => {
        window.__calls = (window.__calls || []).concat(name);
        const out = name === "titan_challenge_link_preview_v1" ? { data: { valid: true, title: "Les crêtes de l’Aube", metric: "pitches", sport: null, target: 10, endsAt: "2026-11-24T10:00:00Z", kind: "cordee", route: "aube", pace: "reguliere", participants: 3 }, error: null } : { data: null, error: { code: "PGRST202" } };
        const r = Promise.resolve(out); r.setHeader = () => r; return r;
      },
    };
    Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
    Object.defineProperty(window, "titanClient", { configurable: true, get: () => client, set() {} });
  });
  try {
    await page.goto(BASE + "/defi?t=" + "f".repeat(64));
    const card = page.locator("[data-defi-cordee]");
    await card.waitFor();
    const text = await card.innerText();
    assert.match(text, /Grande Cordée/);
    assert.match(text, /10 longueurs par membre \(allure régulière\)/);
    assert.match(text, /La première lumière ne franchit les crêtes/);
    assert.match(text, /3 membres déjà/);
    assert.deepEqual(await page.evaluate(() => window.__calls.filter(n => n.startsWith("titan_challenge"))), ["titan_challenge_link_preview_v1"]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
