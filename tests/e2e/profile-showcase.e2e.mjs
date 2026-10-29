// SHOP06: wear an earned title from Profil; the server (mocked here with the same RPC contract) decides what is earned.
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
async function newPage(width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  return { context, page, errors };
}
const OWNER = "00000000-0000-4000-8000-000000000322";

async function profilePage({ sources = [] } = {}) {
  const f = await newPage(), { page } = f;
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  await page.evaluate(({ owner, sources }) => {
    window.sourceCalls = [];
    window.sourceRows = sources;
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => { if (String(input).includes("/.netlify/functions/garmin")) window.recordOrder?.(`garmin:${init?.method}:${init?.headers?.Authorization}`); return realFetch(input, init); };
    window.showcaseCalls = [];
    window.showcaseKeys = [];
    const client = window.titanClient;
    client.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-showcase-token" } }, error: null });
    client.rpc = (name, args = {}) => {
      const run = () => {
        if (name === "titan_public_card_settings") return { data: { enabled: false, slug: "abcdefghij", show: { titles: true } }, error: null };
        if (name === "titan_expedition_titles") return { data: [{ id: "automne-2026", title: "Passe-brume", expedition: "La traversée des brumes", ended_at: "2026-11-16" }], error: null };
        if (name === "titan_displayed_title") return { data: { key: null, label: null }, error: null };
        if (name === "delete_own_account") { window.recordOrder?.("delete_own_account"); return { data: { userId: owner }, error: null }; }
        if (name === "titan_sources_v1") return { data: window.sourceRows, error: null };
        if (name === "titan_set_source_consent_v1") { window.sourceCalls.push([name, args]); window.sourceRows = window.sourceRows.map(x => ({ ...x, granted: false })); return { data: {}, error: null }; }
        if (name === "titan_archive_imported_v1") { window.sourceCalls.push([name, args]); window.sourceRows = window.sourceRows.map(x => ({ ...x, imported: 0 })); return { data: 4, error: null }; }
        if (name === "titan_showcase_v1") return { data: window.showcaseKeys.map(key => ({ key, label: key === "exp:automne-2026" ? "Passe-brume" : null })), error: null };
        if (name === "titan_set_showcase_v1") {
          window.showcaseCalls.push(args.p_keys);
          if (args.p_keys.includes("chapter:aube:2")) return { data: null, error: { code: "42501", message: "NOT_EARNED" } };
          window.showcaseKeys = args.p_keys;
          return { data: window.showcaseKeys.map(key => ({ key, label: key === "exp:automne-2026" ? "Passe-brume" : null })), error: null };
        }
        return { data: null, error: { code: "PGRST202", message: "Could not find" } };
      };
      const result = Promise.resolve(run());
      result.setHeader = () => result;
      return result;
    };
    window.state.user.id = owner;
    const rewards = [["aube", 1], ["aube", 2], ["forge", 1]].map(([world, chapter]) => ({ world, chapter, earned_at: "2026-10-01T10:00:00Z" }));
    const snapshot = { ...window.TitanAdventure.snapshot, owner, rewards };
    window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { owner: OWNER, sources });
  return f;
}

test("showcase: up to three earned distinctions are chosen, the fourth waits, and a removal frees a place", async () => {
  const { page, context, errors } = await profilePage();
  try {
    const block = page.locator("[data-showcase-block]");
    await block.waitFor();
    assert.match(await block.innerText(), /0 sur 3/);
    const toggles = block.locator("[data-showcase-toggle]");
    assert.equal(await toggles.count(), 4, "three insignias and one expedition title");
    for (const key of ["chapter:aube:1", "exp:automne-2026", "chapter:forge:1"]) {
      await block.locator(`[data-showcase-toggle="${key}"]`).click();
      await page.waitForFunction(k => window.showcaseKeys.includes(k), key);
    }
    assert.deepEqual(await page.evaluate(() => window.showcaseKeys), ["chapter:aube:1", "exp:automne-2026", "chapter:forge:1"], "chosen order kept");
    assert.match(await block.innerText(), /3 sur 3/);
    assert.equal(await block.locator('[data-showcase-toggle="chapter:aube:2"]').isDisabled(), true, "a fourth cannot be added");
    assert.equal(await block.locator('[data-showcase-toggle="exp:automne-2026"]').getAttribute("aria-pressed"), "true");
    await block.locator('[data-showcase-toggle="exp:automne-2026"]').click();
    await page.waitForFunction(() => window.showcaseKeys.length === 2);
    assert.equal(await block.locator('[data-showcase-toggle="chapter:aube:2"]').isDisabled(), false, "a place is free again");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("showcase: a refusal from the server changes nothing and says so", async () => {
  const { page, context, errors } = await profilePage();
  try {
    const block = page.locator("[data-showcase-block]");
    await block.waitFor();
    await block.locator('[data-showcase-toggle="chapter:aube:2"]').click();
    await page.waitForFunction(() => window.showcaseCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.showcaseKeys), []);
    assert.equal(await block.locator('[data-showcase-toggle="chapter:aube:2"]').getAttribute("aria-pressed"), "false");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function athletePage(showcase) {
  const f = await newPage(), { page } = f;
  await page.route("**/js/app/athlete.js?*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(BASE + "/u/abcd123456", { waitUntil: "load" });
  await page.evaluate(showcase => {
    window.titanClient = { rpc: name => {
      if (name === "titan_public_card") return Promise.resolve({ data: { name: "Athlète test", avatar: "scout", sports: [], titles: [] } });
      if (name === "titan_public_card_title") return Promise.resolve({ data: { key: null, label: null } });
      if (name === "titan_public_card_showcase") return showcase === "throw" ? (() => { throw Error("Network failed"); })() : Promise.resolve(showcase === "missing" ? { error: { code: "PGRST202" } } : { data: showcase });
      throw Error("unexpected athlete RPC");
    } };
  }, showcase);
  await page.addScriptTag({ path: ROOT + "/js/app/athlete.js" });
  await page.waitForFunction(() => document.querySelector("#athlete").getAttribute("aria-busy") === "false");
  return f;
}

test("showcase: the public card shows the chosen distinctions under the name", async () => {
  const { page, context, errors } = await athletePage([{ key: "exp:automne-2026", label: "Passe-brume" }, { key: "chapter:aube:1", label: null }]);
  try {
    const list = page.locator("[data-pf-showcase]");
    await list.waitFor();
    assert.equal(await list.locator("li").count(), 2);
    assert.match(await list.innerText(), /Passe-brume/);
    assert.equal(await page.locator("#athlete h1 + [data-pf-showcase]").count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("showcase: nothing, an older server or a failed read leaves a complete card", async () => {
  for (const showcase of [[], "missing", "throw", [{ key: "Champion", label: null }]]) {
    const { page, context, errors } = await athletePage(showcase);
    try {
      assert.match(await page.locator("#athlete h1").innerText(), /Athlète test/);
      await page.waitForTimeout(150);
      assert.equal(await page.locator("[data-pf-showcase]").count(), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("sources: nothing for an account without a connected source", async () => {
  const { page, context, errors } = await profilePage();
  try {
    await page.locator("[data-showcase-block]").waitFor();
    assert.equal(await page.locator("[data-sources-block]").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("sources: an allowed source can be stopped, and what it brought can be archived", async () => {
  const row = { source: "health_connect", granted: true, granted_at: "2026-10-20T10:00:00Z", revoked_at: null, imported: 4, linked: 1 };
  const { page, context, errors } = await profilePage({ sources: [row] });
  try {
    const block = page.locator("[data-sources-block]");
    await block.waitFor();
    const text = await block.innerText();
    assert.match(text, /Health Connect · autorisée/);
    assert.match(text, /4 séances reçues/);
    assert.match(text, /1 rattachée à une séance déjà saisie/);
    await block.locator("[data-source-revoke]").click();
    await page.waitForFunction(() => window.sourceCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.sourceCalls[0]), ["titan_set_source_consent_v1", { p_source: "health_connect", p_granted: false }]);
    await block.locator("text=Health Connect · retirée").waitFor();
    assert.equal(await block.locator("[data-source-revoke]").count(), 0, "already stopped");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("garmin return: each result is said once in words and the address is cleaned", async () => {
  for (const [status, text] of [["ok", /Garmin relié/], ["refused", /Liaison annulée/], ["permission", /Accès aux activités manquant/], ["conflict", /déjà relié/], ["consent", /Autorise d’abord/], ["error", /Liaison impossible/], ["unknown-value", /Liaison impossible/]]) {
    const f = await newPage(), { page, context, errors } = f;
    try {
      await page.goto(BASE + `/profile?garmin=${status}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
      await page.locator(".asc-toast, [role=status]").filter({ hasText: text }).first().waitFor({ timeout: 8000 });
      assert.equal(new URL(page.url()).search, "", "the address is cleaned");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("account deletion: a Garmin link is withdrawn first, best effort, and a failure never blocks the deletion", async () => {
  for (const garminStatus of [200, 503]) {
    const row = { source: "garmin", granted: true, granted_at: "2026-10-20T10:00:00Z", revoked_at: null, imported: 1, linked: 0 };
    const { page, context, errors } = await profilePage({ sources: [row] });
    const order = [];
    await page.exposeFunction("recordOrder", name => order.push(name));
    try {
      await page.route("**/.netlify/functions/garmin*", route => route.fulfill({ status: garminStatus, contentType: "application/json", body: "{}" }));
      await page.locator("[data-sources-block]").waitFor();
      await page.locator("[data-delete]").click();
      await page.locator('dialog[open] [name="confirm"]').fill("SUPPRIMER");
      await page.locator('dialog[open] [type="submit"]').click();
      await page.waitForURL(BASE + "/");
      assert.deepEqual(order, ["garmin:POST:Bearer synthetic-showcase-token", "delete_own_account"], `Garmin was asked once, with the player's own session, before the account was deleted (Garmin answered ${garminStatus})`);
    } finally { await context.close(); }
  }
  // Without a Garmin link nothing is asked of Garmin.
  const { page, context } = await profilePage({ sources: [] });
  const order = [];
  await page.exposeFunction("recordOrder", name => order.push(name));
  try {
    await page.locator("[data-delete]").click();
    await page.locator('dialog[open] [name="confirm"]').fill("SUPPRIMER");
    await page.locator('dialog[open] [type="submit"]').click();
    await page.waitForURL(BASE + "/");
    assert.deepEqual(order, ["delete_own_account"], "nothing is asked of Garmin");
  } finally { await context.close(); }
});

async function withFlag(flag, sources = []) {
  const f = await profilePage({ sources });
  const { page } = f;
  await page.evaluate(flag => {
    window.titanFlags = { enabled: (key, fallback) => key === "screens.garmin" ? flag : fallback };
    window.garminCalls = [];
    const rpc = window.titanClient.rpc;
    window.titanClient.rpc = (name, args = {}) => { if (name === "titan_set_source_consent_v1") window.garminCalls.push(`rpc:${name}:${args.p_source}:${args.p_granted}`); return rpc(name, args); };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, flag);
  return f;
}

test("garmin connect: hidden while the server flag is off, nothing is sent", async () => {
  const { page, context, errors } = await withFlag(false);
  try {
    await page.locator("[data-showcase-block]").waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator("[data-garmin-block]").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("garmin connect: with the flag on, consent first, then the server's consent address opens; an unavailable server says so and changes nothing", async () => {
  const { page, context, errors } = await withFlag(true);
  const calls = [];
  try {
    await page.route("https://garmin.example.test/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<title>garmin</title>" }));
    await page.route("**/.netlify/functions/garmin*", route => { calls.push(route.request().url() + "|" + route.request().headers().authorization); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "https://garmin.example.test/authorize?state=x" }) }); });
    const button = page.locator("[data-garmin-connect]");
    await button.waitFor();
    assert.match(await page.locator("[data-garmin-block]").innerText(), /tu peux tout retirer ici/);
    await button.click();
    await page.waitForURL(/garmin\.example\.test\/authorize/);
    assert.deepEqual(calls, [`${BASE}/.netlify/functions/garmin?action=start|Bearer synthetic-showcase-token`]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  for (const answer of [{ status: 503, body: "" }, { status: 200, body: JSON.stringify({ url: "javascript:alert(1)" }) }, { status: 200, body: "not json" }]) {
    const f = await withFlag(true), p = f.page;
    try {
      await p.route("**/.netlify/functions/garmin*", route => route.fulfill({ status: answer.status, contentType: "application/json", body: answer.body }));
      await p.locator("[data-garmin-connect]").click();
      await p.locator(".asc-toast, [role=status]").filter({ hasText: /Garmin n’est pas disponible/ }).first().waitFor({ timeout: 8000 });
      assert.match(p.url(), /\/profile/, "the player stays on the profile");
      assert.equal(await p.locator("[data-garmin-connect]").isDisabled(), false, "and can try again");
    } finally { await f.context.close(); }
  }
});

test("garmin connect: once linked, the button gives way to the source line, and leaving goes through the server first", async () => {
  const row = { source: "garmin", granted: true, granted_at: "2026-10-20T10:00:00Z", revoked_at: null, imported: 2, linked: 0 };
  const { page, context, errors } = await withFlag(true, [row]);
  const calls = [];
  try {
    await page.route("**/.netlify/functions/garmin*", route => { calls.push(route.request().url().split("?")[1] + "|" + route.request().headers().authorization); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ linked: false, provider: "withdrawn" }) }); });
    const block = page.locator("[data-sources-block]");
    await block.waitFor();
    assert.equal(await page.locator("[data-garmin-connect]").count(), 0);
    assert.match(await block.innerText(), /Garmin · autorisée/);
    await block.locator("[data-source-revoke=garmin]").click();
    await page.waitForFunction(() => window.sourceCalls.length === 1);
    assert.deepEqual(calls, ["action=disconnect|Bearer synthetic-showcase-token"]);
    assert.deepEqual(await page.evaluate(() => window.sourceCalls[0]), ["titan_set_source_consent_v1", { p_source: "garmin", p_granted: false }]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
