// Social lot D on the website: « Depuis ta dernière visite ». Behind screens.digest. Shown only when something happened, names as text,
// each line leads where it happened, the visit is remembered per account on this device, nothing shows when the flag is closed.
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
const FULL = {
  since: "2026-11-13T12:00:00Z", requestsIn: 1, cheersReceived: 2,
  friendMoments: { count: 2, latest: [{ id: "m1", kind: "record", title: `Premier 10 km ${evil}`, at: "2026-11-19T10:00:00Z", author: `Léa ${evil}` }] },
  friendsActive: ["Léa"], cordees: [{ id: "k1", route: "aube", status: "active", myStatus: "joined", percent: 64, camps: 2, total: 19, target: 30, mine: 6, earned: false, summitedSince: false }],
  duo: null, challengesEnded: [], memories: [], suggestion: null,
};
const EMPTY = { since: "2026-11-13T12:00:00Z", requestsIn: 0, cheersReceived: 0, friendMoments: { count: 0, latest: [] }, friendsActive: [], cordees: [], duo: null, challengesEnded: [], memories: [], suggestion: { kind: "cordee", pace: "douce", activeDays28: 2, friends: 1 } };

async function social({ digest = FULL, flag = true, seen = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  if (seen) await context.addInitScript(({ owner, seen }) => { try { localStorage.setItem(`titan_social_seen_v1:${owner}`, seen); } catch {} }, { owner: OWNER, seen });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.state?.user && window.titanClient && window.TitanRetour && window.TitanSocialDigest);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ owner, digest, flag }) => {
    window.calls = [];
    window.titanClient.auth.getSession = async () => ({ data: { session: { access_token: "t", user: { id: owner } } }, error: null });
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      const out = name === "titan_social_digest_v1" ? { data: digest, error: null } : { data: null, error: { code: "PGRST202", message: "Could not find" } };
      const result = Promise.resolve(out); result.setHeader = () => result; return result;
    };
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    const flags = { enabled: (key, fallback) => key === "screens.digest" ? flag : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { owner: OWNER, digest, flag });
  return { page, context, errors };
}

test("what happened since the last visit, as text, each line leading where it happened; the visit is then remembered", async () => {
  const { page, context, errors } = await social({ seen: "2026-11-13T12:00:00.000Z" });
  try {
    const list = page.locator("[data-retour]");
    await list.waitFor();
    const text = await list.innerText();
    assert.match(text, /Les crêtes de l’Aube : 2 camps atteints sur 4, 64 % de l’objectif commun — ta part : 6 longueurs/);
    assert.match(text, /Léa <img src=x onerror="window\.pwned=1"> a partagé 2 Moments, dont « Premier 10 km <img/);
    assert.match(text, /2 encouragements reçus/);
    assert.match(text, /1 demande d’ami à regarder quand tu veux/);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator("[data-retour-line=cordee-k1] a").getAttribute("href"), "#cordee");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_social_digest_v1")[1]), { p_since: "2026-11-13T12:00:00.000Z" });
    const stored = await page.evaluate((owner) => localStorage.getItem(`titan_social_seen_v1:${owner}`), OWNER);
    assert.ok(Date.parse(stored) > Date.parse("2026-11-13T12:00:00Z"), "the visit is remembered");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("nothing happened: no card (a suggestion alone is not news); closed flag: no call", async () => {
  const quiet = await social({ digest: EMPTY });
  try {
    await quiet.page.waitForFunction(() => window.calls.some(c => c[0] === "titan_social_digest_v1"));
    await quiet.page.waitForTimeout(300);
    assert.equal(await quiet.page.locator("#retour").isHidden(), true);
    assert.deepEqual(await quiet.page.evaluate(() => window.calls.find(c => c[0] === "titan_social_digest_v1")[1]), { p_since: null }, "first visit on this device: the server's 7 days");
    assert.deepEqual(quiet.errors, []);
  } finally { await quiet.context.close(); }
  const closed = await social({ flag: false });
  try {
    await closed.page.waitForTimeout(600);
    assert.equal(await closed.page.locator("#retour").isHidden(), true);
    assert.equal(await closed.page.evaluate(() => window.calls.some(c => c[0] === "titan_social_digest_v1")), false);
  } finally { await closed.context.close(); }
});
