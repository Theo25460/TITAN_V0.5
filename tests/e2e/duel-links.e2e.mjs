// COM-C1 / COM-E2: the invitation link of a friends' challenge. The landing shows the rules and never a name, asks to sign in when needed,
// joins only on an explicit tap, and treats every bad link the same way. The creator's panel shows a link once and can withdraw it.
// Behind the server flag screens.duels (panel only). Recorders replace the project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000661";
const TOKEN = "a".repeat(64);
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

// A recorder installed before any page script; config.js cannot replace it.
function installClient({ preview, accept }) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from: () => { throw new Error("direct table access is not expected"); },
    rpc: (name, args = {}) => {
      calls.push([name, args]);
      window.recordCall?.(JSON.stringify([name, args]));
      let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
      if (name === "titan_challenge_link_preview_v1") out = { data: preview, error: null };
      if (name === "titan_challenge_link_accept_v1") out = accept === "ok" ? { data: { challenge: "c1" }, error: null } : { data: null, error: { code: "22023", message: accept } };
      const result = Promise.resolve(out); result.setHeader = () => result; return result;
    },
  };
  window.__calls = calls;
  Object.defineProperty(window, "waitForTitanSupabase", { configurable: true, get: () => async () => client, set() {} });
  Object.defineProperty(window, "titanClient", { configurable: true, get: () => client, set() {} });
}
const PREVIEW = { valid: true, title: "Duel du week-end <b>", metric: "effort_minutes", sport: null, target: 120, endsAt: "2026-11-05T20:00:00Z", participants: 2 };
async function landing({ token = TOKEN, preview = PREVIEW, accept = "ok" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const seen = [];
  await page.exposeFunction("recordCall", line => { seen.push(JSON.parse(line)); });
  await page.addInitScript(installClient, { preview, accept });
  await page.goto(BASE + "/defi" + (token === null ? "" : `?t=${token}`));
  return { page, context, errors, seen };
}

test("defi landing: the rules and no name; signing in or up keeps the way back; loading the page joins nothing", async () => {
  const { page, context, errors, seen } = await landing();
  try {
    const card = page.locator("[data-defi-card]");
    await card.waitFor();
    const text = await card.innerText();
    assert.match(text, /Duel du week-end <b>/, "text, not markup");
    assert.match(text, /Atteindre 120 minutes d’effort/);
    assert.match(text, /ton nom d’utilisateur et ta progression sur ce défi sont visibles des participants/);
    assert.match(text, /ni XP ni crédit/);
    assert.deepEqual(seen.map(c => c[0]).filter(n => n.startsWith("titan_challenge")), ["titan_challenge_link_preview_v1"], "only the preview was asked");
    assert.equal(await page.locator("[data-defi-join]").count(), 0, "no join button before signing in");
    assert.equal(await page.locator("[data-defi-login]").getAttribute("href"), `/login?next=${encodeURIComponent("/defi?t=" + TOKEN)}`);
    assert.equal(await page.locator("[data-defi-signup]").getAttribute("href"), `/login?mode=signup&next=${encodeURIComponent("/defi?t=" + TOKEN)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("defi landing: a signed-in player joins on an explicit tap only, and every kind of bad link gets the same plain message", async () => {
  const { page, context, seen } = await landing();
  try {
    await page.locator("[data-defi-card]").waitFor();
    await page.evaluate(owner => { window.state.user.id = owner; window.dispatchEvent(new CustomEvent("titan:account-changed")); }, OWNER);
    await page.locator("[data-defi-join]").waitFor();
    assert.equal(seen.some(c => c[0] === "titan_challenge_link_accept_v1"), false, "not joined yet");
    await page.locator("[data-defi-join]").click();
    await page.waitForURL(/\/social#defis/);
    assert.deepEqual(seen.find(c => c[0] === "titan_challenge_link_accept_v1")[1], { p_token: "a".repeat(64) });
  } finally { await context.close(); }
  for (const options of [{ token: "pasunjeton" }, { token: null }, { preview: { valid: false } }, { preview: null }]) {
    const bad = await landing(options);
    try {
      await bad.page.locator("[data-defi-invalid]").waitFor();
      assert.match(await bad.page.locator("[data-defi-invalid]").innerText(), /Ce lien n’est plus valable : il a déjà servi, il a expiré ou il a été retiré/);
    } finally { await bad.context.close(); }
  }
  const spent = await landing({ accept: "LINK_INVALID" });
  try {
    await spent.page.locator("[data-defi-card]").waitFor();
    await spent.page.evaluate(owner => { window.state.user.id = owner; window.dispatchEvent(new CustomEvent("titan:account-changed")); }, OWNER);
    await spent.page.locator("[data-defi-join]").click();
    await spent.page.locator("[data-defi-invalid]").waitFor();
  } finally { await spent.context.close(); }
});

const CHALLENGES = { mine: [{ id: "c1", title: "Duel du week-end", endsAt: "2026-11-05T20:00:00Z", links: [{ id: "l1", expiresAt: "2026-11-03T20:00:00Z", used: false }] }], ended: [{ id: "c0", title: "Défi d’octobre", endedAt: "2026-10-25T20:00:00Z" }] };
async function panel({ flag = true, missing = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.TitanDuels && window.state?.user);
  await page.evaluate(({ flag, missing, signedIn, owner, data }) => {
    window.calls = []; window.data = structuredClone(data);
    if (signedIn) {
      window.titanClient.rpc = (name, args = {}) => {
        window.calls.push([name, args]);
        let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
        if (!missing) {
          if (name === "titan_challenge_links_v1") out = { data: window.data, error: null };
          if (name === "titan_challenge_link_create_v1") { window.data.mine[0].links.push({ id: "l2", expiresAt: "2026-11-03T20:00:00Z", used: false }); out = { data: { id: "l2", token: "b".repeat(64) }, error: null }; }
          if (name === "titan_challenge_link_revoke_v1") { window.data.mine[0].links = window.data.mine[0].links.filter(l => l.id !== args.p_invite); out = { data: true, error: null }; }
          if (name === "titan_challenge_result_v1") out = { data: { title: "Défi d’octobre", metric: "effort_minutes", target: 60, results: [{ name: "Alba", progress: 75, reached: true, me: true }, { name: "Basile", progress: 20, reached: false, me: false }] }, error: null };
        }
        const result = Promise.resolve(out); result.setHeader = () => result; return result;
      };
      window.state.user.id = owner;
    }
    window.titanFlags = { enabled: (key, fallback) => key === "screens.duels" ? flag : fallback, refresh: async () => {} };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { flag, missing, signedIn, owner: OWNER, data: CHALLENGES });
  return { page, context, errors };
}

test("duels panel: a link is shown once with its address, can be withdrawn, and the frozen result of a finished challenge is readable", async () => {
  const { page, context, errors } = await panel();
  try {
    const card = page.locator("[data-duel=c1]");
    await card.waitFor();
    assert.match(await card.innerText(), /Lien en attente · expire le/);
    await card.getByRole("button", { name: "Créer un lien d’invitation" }).click();
    const url = await page.locator("[data-duel-url]").inputValue();
    assert.equal(url, `${BASE}/defi?t=${"b".repeat(64)}`);
    assert.match(await page.locator("[data-duel-fresh]").innerText(), /Il ne s’affichera plus/);
    await page.evaluate(() => window.TitanDuels.refresh());
    await page.locator("[data-duel-link=l2]").waitFor();
    await page.locator("[data-duel-revoke=l1]").click();
    await page.waitForFunction(() => !document.querySelector("[data-duel-link=l1]"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_challenge_link_revoke_v1")[1]), { p_invite: "l1" });
    await page.getByRole("button", { name: "Voir le résultat" }).click();
    const res = page.locator("[data-duel-results]");
    await res.waitFor();
    assert.match(await res.innerText(), /Alba \(toi\)[\s\S]*75 \/ 60 ✓[\s\S]*Basile[\s\S]*20 \/ 60/);
    assert.match(await page.locator("[data-duel-ended=c0]").innerText(), /Résultat figé à la fin du défi/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("duels panel: nothing when the flag is off, for a guest, or on a server without the functions", async () => {
  for (const options of [{ flag: false }, { signedIn: false }, { missing: true }]) {
    const { page, context } = await panel(options);
    try {
      await page.waitForTimeout(600);
      assert.equal(await page.locator("#duels").isVisible(), false);
    } finally { await context.close(); }
  }
});
