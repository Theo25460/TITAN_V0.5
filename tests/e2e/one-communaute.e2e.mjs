// TITAN ONE « Signature » — the Communauté has one spine: who is with me (the circle on the coral field), what we are doing together
// now (one scene featured, the others one tap away), what happened, then the circle to manage. Friend requests are answered first and
// the page keeps its place while the server answers; a block can be taken back; a guest who opens a cordée link reads what it is, what
// the others will see and one action. Driven with a recorder: nothing leaves the browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000d01";
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
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const CORDEE = {
  id: "k1", title: "La passe des Marées", route: "marees", pace: "reguliere", startsAt: "2026-11-10T10:00:00Z", endsAt: "2999-01-01T10:00:00Z", days: 14,
  status: "active", summitedAt: null, mine: true, myStatus: "joined", share: 10, cap: 15, target: 20, longueurs: 10, variety: 0, total: 10, percent: 50, camps: 2,
  families: ["endurance"], joined: 2, title_key: "cordee:marees", earned: false,
  me: { pitches: 6, counted: 6, days: 5, families: ["endurance"], strand: false },
  members: [{ id: OWNER, name: "Moi", status: "joined", me: true, pitches: 6, strand: false, families: ["endurance"] }, { id: "u-lea", name: "Léa", status: "joined", me: false, pitches: 4, strand: false, families: ["endurance"] }],
};
const overview = () => ({
  me: { id: OWNER, friend_code: "TN-QA23", findable: true },
  friends: [{ id: "u-lea", name: `Léa ${evil}`, avatar: "scout", level: 12, week_days: 3, last_active: today() }, { id: "u-sam", name: "Sam Petit", avatar: "ranger", level: null, week_days: null, last_active: null }],
  requests_in: [{ id: "u-zoe", name: "Zoé", avatar: "keeper" }], requests_out: [],
  moments: [{ id: "m1", kind: "record", title: "Record sur 10 km", created_at: new Date().toISOString(), author: { name: "Léa", avatar: "scout" }, mine: false, cheers: 2, cheered: false }],
  challenges: [], guild: null,
  expedition: { id: "x1", title: "La traversée des premiers givres", story: "Chaque minute compte.", guardian: "Le Gardien du Col", status: "active", starts_at: "2026-11-01T00:00:00Z", ends_at: "2999-01-01T00:00:00Z", collective_minutes: 100, collective_goal: 1000, participants: 12, daily_cap: 90, personal_days: 8, personal_minutes: 480, reward_title: "Passe-givre", me: { joined: true, minutes: 60, days: 2 } },
});

async function social({ width = 390, cordee = true, duo = true, privacy = { showStats: true, socialPresence: false } } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.state?.user && window.titanClient && window.TitanCordeeView && window.TitanBuddy);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ owner, data, cordee, cordees, duo, privacy }) => {
    window.calls = []; window.hold = null; window.social = data;
    window.titanClient.auth.getSession = async () => ({ data: { session: { access_token: "t", user: { id: owner } } }, error: null });
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
      if (name === "titan_social_overview") out = { data: JSON.parse(JSON.stringify(window.social)), error: null };
      if (name === "titan_cordees_v1") out = { data: { cordees, titles: [] }, error: null };
      if (name === "titan_buddy_v1") out = { data: { status: "active", id: "b1", role: "inviter", partner: { id: "u-lea", name: "Léa" }, daysLeft: 9, target: 12, myDays: 4, partnerDays: 3, together: 7, nudgedToday: false, nudgesReceived: 0 }, error: null };
      if (name === "titan_social_respond") { window.social.requests_in = []; if (args.p_accept) window.social.friends.push({ id: args.p_user, name: "Zoé", avatar: "keeper" }); out = { data: { status: "ok" }, error: null }; }
      if (name === "titan_block_user") { window.social.friends = window.social.friends.filter(f => f.id !== args.p_blocked_id); out = { data: true, error: null }; }
      if (name === "titan_unblock_user") out = { data: true, error: null };
      const settle = window.hold === name ? new Promise(resolve => { window.release = () => resolve(out); }) : Promise.resolve(out);
      settle.setHeader = () => settle; return settle;
    };
    let pinned = window.state.user; pinned.id = owner; pinned.privacy = privacy;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner, privacy }); } });
    const flags = { enabled: (key, fallback) => key === "screens.cordee" ? cordee : key === "screens.buddy" ? duo : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { owner: OWNER, data: overview(), cordee, cordees: cordee ? [CORDEE] : [], duo, privacy });
  await page.waitForFunction(() => document.querySelector("#communaute")?.dataset.state === "ready" && document.querySelector("#communaute").getAttribute("aria-busy") === "false");
  return { page, context, errors };
}

test("the spine: the circle on the field, who knocks, one scene featured and the others one tap away, then what happened and the circle", async () => {
  for (const width of [320, 390, 1280]) {
    const { page, context, errors } = await social({ width });
    try {
      // 1. who is with me: faces with first names on the header field, the friend active today said in words, and the way to invite
      const rope = page.locator("#cm-circle .cm-rope");
      assert.deepEqual(await rope.locator(".cm-face-name").allInnerTexts(), ["Léa", "Sam", "Inviter"]);
      assert.match(await page.locator("#cm-circle .cm-circle-line").innerText(), /2 amis · 1 actif aujourd’hui/);
      assert.match(await rope.locator("[data-face=u-lea]").getAttribute("aria-label"), /actif aujourd’hui/);
      assert.equal(await page.evaluate(() => window.pwned), undefined, "a friend's name is text");
      // 2. the order of the page, in the document: who knocks, the scene, Moments, the circle to manage
      const order = await page.evaluate(() => [".cm-door", ".cm-live", "#moments", "#amis"].map(s => { const el = document.querySelector(s); return el ? [...document.querySelectorAll(".cm-door, .cm-live, #moments, #amis")].indexOf(el) : -1; }));
      assert.deepEqual(order, [0, 1, 2, 3]);
      // 3. one scene is featured — the liveliest: the running cordée — and each other collective thing is one tap away
      const nav = page.getByRole("navigation", { name: "Dans la communauté" });
      assert.deepEqual(await nav.locator("a").evaluateAll(links => links.map(a => a.getAttribute("href"))), ["#cordee", "#expedition", "#duo", "#defis", "#guilde"]);
      assert.equal(await nav.locator('a[aria-current="true"]').getAttribute("href"), "#cordee");
      assert.match(await nav.locator('a[href="#cordee"]').innerText(), /2 camps sur 4/);
      assert.match(await nav.locator('a[href="#duo"]').innerText(), /7 \/ 12 jours/);
      assert.equal(await page.locator("[data-live-panel]:not([hidden])").count(), 1);
      // the route of the cordée: the painting of its world, two camps reached out of four, the rope filled to half
      const card = page.locator("[data-cordee=k1]");
      assert.equal(await card.getAttribute("data-route"), "marees");
      assert.match(await card.locator(".cm-cordee-view img").getAttribute("src"), /archipelago/);
      assert.equal(await card.locator(".cm-cordee-camps li[data-reached=true]").count(), 2);
      assert.equal(await card.locator(".cm-cordee-camps li[data-next=true]").count(), 1);
      assert.equal(await card.locator(".cm-cordee-camps").evaluate(el => el.style.getPropertyValue("--pn")), "0.500");
      assert.match(await card.innerText(), /Personne n’atteint le sommet seul/);
      // one tap: the Duo takes the scene, the address remembers it, nothing else is laid out
      await nav.locator('a[href="#duo"]').click();
      await page.waitForFunction(() => location.hash === "#duo" && document.activeElement.id === "duo");
      assert.equal(await page.locator("#cordee").isVisible(), false);
      assert.match(await page.locator("#duo").innerText(), /Expédition avec Léa[\s\S]*À deux : 7 \/ 12 jours actifs/);
      assert.equal(await nav.locator('a[aria-current="true"]').getAttribute("href"), "#duo");
      // 4. privacy is said where the circle is managed, from the profile's choices
      const privacy = await page.locator("#amis .cm-privacy").innerText();
      assert.match(privacy, /Ce que tes amis voient de toi : ton pseudo, ton avatar, les Moments que tu partages, ton niveau et tes jours actifs de la semaine\./);
      assert.match(privacy, /Restent privés : tes jours d’activité\./);
      assert.match(privacy, /Jamais ta santé, ton poids, tes traces GPS ni tes notes/);
      // wide screens: the circle stands beside the scene; phones: one column
      const beside = await page.evaluate(() => document.querySelector("#amis").getBoundingClientRect().left > document.querySelector(".cm-live").getBoundingClientRect().right);
      assert.equal(beside, width >= 1100);
      // targets and overflow
      for (const s of [".cm-live-tab", ".cm-face", "[data-accept]", "[data-decline]", ".cm-cheer", "[data-friend-menu]"]) {
        const small = await page.locator(s).evaluateAll(els => els.filter(el => el.offsetParent && (el.getBoundingClientRect().height < 44 || el.getBoundingClientRect().width < 44)).length);
        assert.equal(small, 0, `${s} is at least 44 px at ${width}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `no sideways scroll at ${width} px`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("a request is answered with one thumb and the page keeps its place; a face opens the friend; a block can be taken back", async () => {
  const { page, context, errors } = await social({ cordee: false, duo: false });
  try {
    // nothing collective but the expedition: it is the scene
    assert.equal(await page.locator("[data-live-panel]:not([hidden]) #expedition").count(), 1);
    assert.match(await page.locator(".cm-door").innerText(), /Une demande d’ami[\s\S]*Zoé/);
    // accepting: the button says it is waiting, the page is not replaced by a skeleton while the server answers
    await page.evaluate(() => { window.hold = "titan_social_overview"; });
    await page.getByRole("button", { name: "Accepter Zoé", exact: true }).click();
    await page.waitForFunction(() => window.calls.filter(c => c[0] === "titan_social_overview").length === 2);
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_social_respond")[1]), { p_user: "u-zoe", p_accept: true });
    assert.equal(await page.locator("#communaute").getAttribute("aria-busy"), "true");
    assert.equal(await page.locator("#amis").count(), 1, "what was on screen stays while the answer is awaited");
    assert.equal(await page.locator("#communaute .asc-skeleton").count(), 0);
    await page.getByText("Nouvel ami").waitFor();
    await page.evaluate(() => { window.hold = null; window.release(); });
    await page.waitForFunction(() => document.querySelector("#communaute").getAttribute("aria-busy") === "false" && !document.querySelector(".cm-door"));
    assert.deepEqual(await page.locator("#cm-circle .cm-face-name").allInnerTexts(), ["Léa", "Sam", "Zoé", "Inviter"]);
    // a face of the circle opens what one can do with that friend
    await page.locator("#cm-circle [data-face=u-sam]").click();
    const sheet = page.getByRole("dialog", { name: "Sam Petit" });
    await sheet.waitFor();
    assert.deepEqual(await sheet.locator(".asc-row-title").allInnerTexts(), ["Lancer un défi", "Retirer de mes amis", "Bloquer"]);
    await sheet.getByRole("button", { name: /Bloquer/ }).click();
    await page.getByRole("button", { name: "Bloquer", exact: true }).click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_block_user"));
    // the confirmation can be taken back, because the server has the reverse call
    const undo = page.locator(".asc-toast .cm-undo");
    await undo.waitFor();
    assert.equal(await undo.innerText(), "Débloquer");
    await page.waitForFunction(() => document.querySelector("#communaute").getAttribute("aria-busy") === "false");
    await undo.click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_unblock_user"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_unblock_user")[1]), { p_blocked_id: "u-sam" });
    await page.getByText("Compte débloqué").waitFor();
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a guest who opens a cordée link sees the route, what it asks, what the others will see, and one way in", async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    const client = {
      auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
      from: () => { throw new Error("no table"); },
      rpc: (name) => {
        window.__calls = (window.__calls || []).concat(name);
        const out = name === "titan_challenge_link_preview_v1" ? { data: { valid: true, title: "La voûte des Aurores", metric: "pitches", sport: null, target: 15, endsAt: "2026-11-29T10:00:00Z", kind: "cordee", route: "aurores", pace: "soutenue", participants: 5 }, error: null } : { data: null, error: { code: "PGRST202" } };
        const r = Promise.resolve(out); r.setHeader = () => r; return r;
      },
    };
    Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
    Object.defineProperty(window, "titanClient", { configurable: true, get: () => client, set() {} });
  });
  try {
    const token = "f".repeat(64);
    await page.goto(BASE + "/defi?t=" + token);
    const card = page.locator("[data-defi-cordee]");
    await card.waitFor();
    assert.equal(await page.locator("h1").innerText(), "Une cordée t’attend");
    assert.match(await card.locator(".cm-cordee-view img").getAttribute("src"), /aurora/);
    assert.deepEqual(await card.locator(".df-camps li:not(.cm-cordee-start) strong").allInnerTexts(), ["Le camp des lanternes", "Le lac gelé", "L’observatoire", "La voûte des Aurores"]);
    assert.equal(await card.locator(".df-camps li[data-reached=true]").count(), 0, "nothing is shown as reached");
    assert.match(await card.locator(".cm-privacy").innerText(), /Ce que les autres verront : En rejoignant, ton pseudo et tes longueurs sont visibles des membres qui sont tes amis/);
    assert.match(await card.innerText(), /Ouvrir cette page ne t’engage à rien/);
    assert.equal(await card.locator("[data-defi-join]").count(), 0);
    assert.equal(await card.locator("[data-defi-signup]").getAttribute("href"), `/login?mode=signup&next=${encodeURIComponent("/defi?t=" + token)}`);
    assert.equal(await card.locator("[data-defi-signup]").evaluate(el => el.getBoundingClientRect().height >= 44), true);
    assert.equal(await card.locator("img").evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)), true);
    assert.deepEqual(await page.evaluate(() => window.__calls.filter(n => n.startsWith("titan_challenge"))), ["titan_challenge_link_preview_v1"], "opening joins nothing");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document.querySelector("#defi"), { runOnly: ["wcag2a", "wcag2aa"] }).then(r => r.violations.map(v => v.id)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
