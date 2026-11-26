// V1.6.5 — Centre des sources connectées on the website, against a local fake that answers titan_source_center_v1,
// titan_sources_v1, titan_set_source_consent_v1 and titan_archive_imported_v1 with the contract of migration 20261130100500
// (sql/tests/300_source_center.sql proves the server side). Synthetic account, no network.
// - The states of the scenario are told apart: authorisation expired (reported by the phone), consent withdrawn by Garmin, no new
//   session, a history batch paused; « Connecté » only for a working access; fields really received; exclusions; the resume is sent to
//   the Android app for Santé Connect and said impossible for Garmin.
// - Withdrawal: what stops and what stays is said before confirming; after it, the row says « Retirée » and the archive action stays.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); });
  });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(BASE + "/")).ok) { ready = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "local server started");
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { await browser?.close(); server?.kill(); });
const OWNER = "00000000-0000-4000-8000-000000000165";

async function centerPage(center) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/profile", { waitUntil: "load" });
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanSources);
  await page.evaluate(({ owner, center }) => {
    const h = 3600000, now = Date.now(), at = (hours) => new Date(now - hours * h).toISOString();
    // Times are relative to the page clock: the fixture says « hours ago ».
    const fix = (v) => (typeof v === "number" ? at(v) : v);
    const deep = (o) => Array.isArray(o) ? o.map(deep) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, /_at$|_from$|_to$/.test(k) ? fix(v) : deep(v)])) : o;
    window.center = deep(center);
    window.calls = [];
    const client = window.titanClient;
    client.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-center-token" } }, error: null });
    client.rpc = (name, args = {}) => {
      const run = () => {
        if (name === "titan_source_center_v1") return { data: window.center, error: null };
        if (name === "titan_sources_v1") return { data: window.center.sources.map((s) => ({ source: s.source, granted: s.consent.granted, granted_at: s.consent.granted_at, imported: s.counts.imported, linked: s.counts.linked })), error: null };
        if (name === "titan_garmin_status_v1") return { data: { linked: false }, error: null };
        if (name === "titan_set_source_consent_v1") {
          window.calls.push([name, args]);
          const s = window.center.sources.find((x) => x.source === args.p_source);
          s.consent = { ...s.consent, granted: !!args.p_granted, revoked_at: args.p_granted ? null : new Date().toISOString(), revoked_by: args.p_granted ? null : "user" };
          return { data: { source: args.p_source, granted: !!args.p_granted }, error: null };
        }
        if (name === "titan_archive_imported_v1") {
          window.calls.push([name, args]);
          const s = window.center.sources.find((x) => x.source === args.p_source);
          const n = s.counts.imported; s.counts = { ...s.counts, imported: 0, archived: s.counts.archived + n };
          return { data: n, error: null };
        }
        if (name === "titan_public_card_settings") return { data: { enabled: false, slug: "abcdefghij", show: {} }, error: null };
        return { data: null, error: { code: "PGRST202", message: "Could not find" } };
      };
      const result = Promise.resolve(run());
      result.setHeader = () => result;
      return result;
    };
    window.state.user.id = owner;
    const snapshot = { ...window.TitanAdventure.snapshot, owner, rewards: [] };
    window.TitanAdventure = { snapshot, status: "ready", refresh: async () => snapshot };
    dispatchEvent(new CustomEvent("titan:history-updated"));
  }, { owner: OWNER, center });
  await page.locator('[data-profile-group="account"] > summary').click();
  await page.locator("[data-source-center]").waitFor();
  return { page, context, errors };
}

const HC = (over = {}) => ({
  source: "health_connect",
  consent: { granted: true, granted_at: 900, revoked_at: null, revoked_by: null },
  counts: { imported: 12, linked: 3, archived: 0, review: 0 },
  sports: [{ sport: "running", n: 9 }, { sport: "cycling", n: 6 }],
  fields: { total: 15, distance: 0, duration: 15 },
  link: null,
  runs: [],
  ...over,
});

test("the four situations are four labels; « Connecté » is never said without a working access; resume and fields are honest", async () => {
  const { page, context, errors } = await centerPage({
    now: 0,
    sources: [
      HC({ runs: [
        { id: "r2", kind: "read", started_at: 2, finished_at: 2, window_from: null, window_to: null, outcome: "denied", error_code: "ANDROID_PERMISSION", counts: {}, excluded: {} },
        { id: "r1", kind: "read", started_at: 400, finished_at: 400, window_from: 568, window_to: 400, outcome: "ok", counts: { read: 4, imported: 2, linked: 1, excluded: 1 }, excluded: { unmapped_type: 1 } },
      ] }),
      { source: "garmin", consent: { granted: false, granted_at: 900, revoked_at: 30, revoked_by: "provider" }, counts: { imported: 5, linked: 0, archived: 0, review: 0 },
        sports: [{ sport: "running", n: 5 }], fields: { total: 5, distance: 5, duration: 5 }, link: { linked: false, linked_at: 900, last_event_at: 40, ended_at: 30 },
        runs: [{ id: "p1", kind: "push", started_at: 48, finished_at: 40, window_from: null, window_to: null, outcome: "ok", counts: { read: 3, imported: 1, excluded: 2 }, excluded: { unmapped_type: 1, too_short: 1 } }] },
    ],
    batch: { id: "b1", file_name: "activities.csv", status: "open", next_row: 301, total_rows: 5000, counts: { added: 300 }, updated_at: 20 },
  });
  try {
    const hc = page.locator('[data-source="health_connect"]');
    assert.equal(await hc.getAttribute("data-source-state"), "expired");
    const block = page.locator("[data-source-center]");
    const text = await block.innerText();
    assert.match(text, /Centre des sources/);
    assert.match(text, /Autorisation expirée/);
    assert.match(text, /Android n’accorde plus la lecture à TITAN/);
    assert.match(text, /Retirée chez Garmin/);
    assert.match(text, /Garmin a signalé/);
    assert.match(text, /Import en pause/);
    assert.match(text, /ligne 301 sur 5000/);
    assert.doesNotMatch(text, /\bConnecté\b/, "no access works here: « Connecté » is never said");
    assert.match(text, /Non transmis\s+Distance \(Santé Connect ne transmet pas encore de distance à TITAN\)/);
    assert.match(text, /Elle se fait dans l’application Android/);
    assert.match(text, /Garmin ne renvoie pas une période passée/);
    assert.match(text, /Exclues à la dernière lecture\s+1 type d’exercice ambigu ou non reconnu/);
    assert.match(text, /1 type d’exercice ambigu ou non reconnu, 1 moins d’une minute/);
    assert.match(text, /Sports reçus\s+Course à pied \(9\), Vélo \(6\)|Sports reçus\s+.+\(9\), .+\(6\)/);
    assert.equal(await page.locator('[data-source-revoke="garmin"]').count(), 0, "a withdrawn source offers no « Retirer »");
    assert.equal(await page.locator('[data-source-archive="garmin"]').count(), 1, "what Garmin brought can still be archived");
    assert.equal(await page.locator("[data-source-import]").getAttribute("href"), "/journal");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll at 390 px");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a working source says « Connecté », shows its conflict, and the withdrawal says what stays before confirming", async () => {
  const { page, context, errors } = await centerPage({
    now: 0,
    sources: [HC({ counts: { imported: 12, linked: 3, archived: 0, review: 1 }, runs: [
      { id: "r3", kind: "read", started_at: 3, finished_at: 3, window_from: 171, window_to: 3, outcome: "ok", counts: { read: 3, imported: 2, duplicate: 1 }, excluded: {} },
    ] })],
    batch: null,
  });
  try {
    const hc = page.locator('[data-source="health_connect"]');
    assert.equal(await hc.getAttribute("data-source-state"), "ok");
    assert.match(await hc.innerText(), /Connecté/);
    assert.match(await hc.innerText(), /2 séances reçues/);
    const review = page.locator('[data-source-review="health_connect"]');
    assert.match(await review.innerText(), /Vérifier dans le journal \(1\)/);
    await page.locator('[data-source-revoke="health_connect"]').click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    const said = await dialog.innerText();
    assert.match(said, /Retirer Santé Connect/);
    assert.match(said, /TITAN ne lit plus rien dans Santé Connect/);
    assert.match(said, /12 séances déjà importées restent dans ton journal, avec tes corrections/);
    assert.match(said, /« Archiver »/);
    assert.deepEqual(await page.evaluate(() => window.calls), [], "nothing happens before the confirmation");
    await dialog.locator("[data-ok]").click();
    await page.waitForFunction(() => window.calls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.calls[0]), ["titan_set_source_consent_v1", { p_source: "health_connect", p_granted: false }]);
    await page.locator('[data-source="health_connect"][data-source-state="withdrawn"]').waitFor();
    const row = await page.locator('[data-source="health_connect"]').innerText();
    assert.match(row, /Retirée/);
    assert.match(row, /12 séances déjà importées restent/);
    assert.equal(await page.locator('[data-source-revoke="health_connect"]').count(), 0);
    await page.locator('[data-source-archive="health_connect"]').click();
    await page.waitForFunction(() => window.calls.length === 2);
    assert.deepEqual(await page.evaluate(() => window.calls[1]), ["titan_archive_imported_v1", { p_source: "health_connect" }]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("cancelling the withdrawal changes nothing", async () => {
  const { page, context, errors } = await centerPage({ now: 0, sources: [HC({ runs: [{ id: "r3", kind: "read", started_at: 3, finished_at: 3, window_from: 171, window_to: 3, outcome: "empty", counts: { read: 1, duplicate: 1 }, excluded: {} }] })], batch: null });
  try {
    assert.equal(await page.locator('[data-source="health_connect"]').getAttribute("data-source-state"), "empty");
    assert.match(await page.locator('[data-source="health_connect"]').innerText(), /Aucune nouvelle séance/);
    await page.locator('[data-source-revoke="health_connect"]').click();
    await page.locator("dialog[open] [data-cancel]").click();
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.calls), []);
    assert.equal(await page.locator('[data-source-revoke="health_connect"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
