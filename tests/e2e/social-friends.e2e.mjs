// Social lot A on the website: a personal invitation link (/social?invitation=…) shows who invites and writes nothing before « Accepter »;
// a dead link only says it is no longer valid; a private profile creates and copies a link without being asked to become findable;
// a sent request can be cancelled; one's own blocks can be lifted. Driven with a recorder instead of a real project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000a01";
const TOKEN = "c".repeat(64);
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

async function page_({ query = "", preview = { valid: true, own: false, friends: false, inviter: { name: `Léa ${evil}`, avatar: "scout" } }, blocks = [] } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social" + query);
  await page.waitForFunction(() => window.state?.user && window.titanClient);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ owner, preview, blocks, base }) => {
    window.calls = []; window.blocks = blocks; window.accepted = false;
    window.titanClient.auth.getSession = async () => ({ data: { session: { access_token: "t", user: { id: owner } } }, error: null });
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      let out = { data: null, error: { code: "PGRST202", message: "Could not find" } };
      if (name === "titan_friend_link_preview_v1") out = { data: preview, error: null };
      if (name === "titan_friend_link_accept_v1") { window.accepted = true; out = { data: { status: "friends", id: "u-lea", name: "Léa", spent: true }, error: null }; }
      if (name === "titan_friend_link_create_v1") out = { data: { id: "l1", token: "d".repeat(64), expiresAt: "2026-11-27T10:00:00Z" }, error: null };
      if (name === "titan_social_remove") out = { data: { status: "removed" }, error: null };
      if (name === "titan_blocks_v1") out = { data: window.blocks, error: null };
      if (name === "titan_unblock_user") { window.blocks = window.blocks.filter(b => b.id !== args.p_blocked_id); out = { data: true, error: null }; }
      const result = Promise.resolve(out); result.setHeader = () => result; return result;
    };
    const flags = { enabled: (key, fallback) => key === "screens.friendlinks" ? true : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
  }, { owner: OWNER, preview, blocks });
  // The overview answers last, then the page reloads as the signed-in account.
  await page.evaluate(({ owner }) => {
    const base = (o, extra = {}) => ({ me: { id: o, friend_code: "TN-QA23", findable: false }, friends: [], requests_in: [],
      requests_out: [{ id: "u-zoe", name: "Zoé", at: "2026-11-10T10:00:00Z", expires_at: "2026-12-10T10:00:00Z" }],
      moments: [], challenges: [], expedition: null, guild: null, ...extra });
    const rpc = window.titanClient.rpc;
    window.titanClient.rpc = (name, args = {}) => {
      if (name !== "titan_social_overview") return rpc(name, args);
      window.calls.push([name, args]);
      const result = Promise.resolve({ data: base(owner, window.accepted ? { friends: [{ id: "u-lea", name: "Léa", avatar: "scout" }] } : {}), error: null });
      result.setHeader = () => result; return result;
    };
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { owner: OWNER });
  await page.waitForFunction(() => document.querySelector("#communaute")?.getAttribute("aria-busy") === "false" && document.querySelector("#amis"));
  return { page, context, errors };
}

test("an opened invitation names the inviter as text and joins nothing before « Accepter »", async () => {
  const { page, context, errors } = await page_({ query: `?invitation=${TOKEN}` });
  try {
    const card = page.locator(".cm-invitation");
    await card.waitFor();
    assert.match(await card.innerText(), /Léa <img src=x onerror="window.pwned=1"> t’invite à devenir ami/);
    assert.equal(await page.evaluate(() => window.pwned), undefined, "no markup executed");
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_friend_link_accept_v1").length), 0, "opening joins nothing");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_friend_link_preview_v1")[1]), { p_token: "c".repeat(64) });
    await card.locator("[data-accept-invitation]").click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_friend_link_accept_v1"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_friend_link_accept_v1")[1]), { p_token: "c".repeat(64) });
    await page.waitForFunction(() => !document.querySelector(".cm-invitation") && /Léa/.test(document.querySelector("#amis")?.innerText || ""));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no sideways scroll at 390 px");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a dead invitation only says it is no longer valid, with nothing to accept", async () => {
  const { page, context, errors } = await page_({ query: `?invitation=${TOKEN}`, preview: { valid: false } });
  try {
    await page.locator(".cm-invitation").waitFor();
    assert.match(await page.locator(".cm-invitation").innerText(), /n’est plus valable/);
    assert.equal(await page.locator("[data-accept-invitation]").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a private profile creates a personal link; a sent request can be cancelled; blocks can be lifted", async () => {
  const { page, context, errors } = await page_({ blocks: [{ id: "u-x", name: `Xavier ${evil}`, at: "2026-11-15T10:00:00Z" }] });
  try {
    assert.match(await page.locator("#amis").innerText(), /Le lien personnel, lui, marche toujours/);
    await page.locator("[data-friend-link]").click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_friend_link_create_v1"));
    await page.waitForFunction(async () => { try { return (await navigator.clipboard.readText()).includes("/social?invitation=" + "d".repeat(64)); } catch { return false; } });
    assert.equal(await page.evaluate(() => window.calls.some(c => c[0] === "titan_save_profile_state")), false, "nothing becomes findable");

    assert.match(await page.locator(".cm-requests-out").innerText(), /Zoé[\s\S]*expire/);
    await page.locator("[data-cancel-request=u-zoe]").click();
    await page.waitForFunction(() => window.calls.some(c => c[0] === "titan_social_remove"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_social_remove")[1]), { p_user: "u-zoe" });

    await page.waitForFunction(() => document.querySelector("#communaute")?.getAttribute("aria-busy") === "false" && document.querySelector("[data-blocks]"));
    await page.locator("[data-blocks]").click();
    const sheet = page.locator("dialog[open]");
    await sheet.waitFor();
    assert.match(await sheet.innerText(), /Xavier <img/);
    await sheet.locator("[data-unblock=u-x]").click();
    await sheet.getByText("Tu n’as bloqué personne.").waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_unblock_user")[1]), { p_blocked_id: "u-x" });
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
