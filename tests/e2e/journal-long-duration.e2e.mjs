// V1.6.6 — Journal longue durée, website. The real built site, the real Supabase SDK and the real journal, signed in on a synthetic
// account of 2 300 sessions (tools/journal-profile/dataset.mjs) served by the in-memory PostgREST of the benchmark. Scenario: the journal
// reads its rows page by page by key and lists 100 rows then « Afficher plus »; the old ride is found and its elevation corrected (only
// the elevation leaves); a reload refreshes by manifest and reads only what changed, an old session corrected on another device included;
// offline, the journal says it holds the whole history; a reading cut after its first page shows a partial copy and partial totals.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { generate, OWNER } from "../../tools/journal-profile/dataset.mjs";
import { query } from "../../tools/journal-profile/fake-postgrest.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const N = 2300;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { await browser?.close(); server?.kill(); });

async function device(cloud) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Paris" });
  context.setDefaultTimeout(30000);
  const now = Math.floor(Date.now() / 1000), user = { id: OWNER, email: "longue-duree@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {} };
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: OWNER, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })).toString("base64url"), "synthetic-signature"].join(".");
  await context.addInitScript((session) => {
    if (!localStorage.getItem("titan_supabase_auth_v1")) localStorage.setItem("titan_supabase_auth_v1", JSON.stringify(session));
    localStorage.setItem("titan_first_run_guide_v2", "seen-by-test");
  }, { access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user });
  const profile = { id: OWNER, username: "Athlète longue durée", friend_code: "TN-LONGUE", xp: 90000, credits: 50, level: 30, state_version: 1, game_state: { user: { id: OWNER, onboardedAt: "2021-11-01", onboardingComplete: true }, history: [] } };
  await context.route("**/*", async (route) => {
    try {
      const req = route.request(), url = new URL(req.url());
      if (!url.hostname.endsWith("supabase.co")) return url.hostname === "127.0.0.1" ? route.continue() : route.abort("internetdisconnected");
      if (cloud.offline || (cloud.cut && cloud.cut(url))) return route.abort("internetdisconnected");
      const reply = (body, extra = {}) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", ...extra }, body: JSON.stringify(body) });
      if (url.pathname === "/auth/v1/user") return reply(user);
      if (url.pathname === "/rest/v1/profiles") return reply(profile);
      if (url.pathname === "/rest/v1/training_logs") {
        cloud.reads.push(decodeURIComponent(url.search));
        const r = query(cloud.logs, url, req.headers());
        cloud.rowsRead += r.body.length;
        return reply(r.body, { "content-range": r.contentRange });
      }
      if (url.pathname === "/rest/v1/rpc/titan_update_training_session") {
        const { p_id, p_revision, p_patch } = req.postDataJSON();
        cloud.patches.push(p_patch);
        const l = cloud.logs.find((x) => x.id === p_id);
        if (!l || l.revision !== p_revision) return route.fulfill({ status: 409, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "PT409", message: "SESSION_VERSION_CONFLICT" }) });
        if ("elevation" in p_patch) l.details = { ...l.details, elevation: p_patch.elevation };
        if ("duration" in p_patch) l.details = { ...l.details, duration: p_patch.duration, val2: p_patch.duration };
        l.revision += 1;
        return reply(l);
      }
      if (url.pathname === "/rest/v1/rpc/titan_get_progression_snapshot") return reply([{ server_user_id: OWNER, xp: profile.xp, credits: profile.credits, level: profile.level, checked_at: new Date().toISOString() }]);
      if (url.pathname === "/rest/v1/rpc/titan_session_matches_v1" || url.pathname === "/rest/v1/rpc/titan_session_changes_v1") return reply([]);
      if (url.pathname.startsWith("/rest/v1/rpc/")) return route.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "PGRST202", message: "Optional synthetic RPC unavailable" }) });
      return reply([]);
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
const loaded = (page) => page.waitForFunction(() => window.titanCloudHistoryLoadedAt && window.titanHistoryCoverage?.complete === true, null, { polling: 50 });

test("a long journal: paged list, old elevation corrected, refresh by manifest, offline coverage, partial copy never complete", { timeout: 180000 }, async () => {
  const { logs, oldId } = generate({ n: N });
  const cloud = { logs, reads: [], rowsRead: 0, patches: [], offline: false, cut: null };
  const active = logs.filter((l) => !l.archived_at).length;
  const { context, page, errors } = await device(cloud);
  try {
    // 1. Cold: the rows come page by page by key (no offset), the list shows 100 rows then « Afficher plus ».
    await page.goto(BASE + "/journal");
    await loaded(page);
    assert.equal(await page.evaluate(() => window.state.history.length), active);
    assert.ok(cloud.reads.every((q) => !/offset=/.test(q)), "no offset page");
    assert.equal(cloud.reads.filter((q) => /select=\*/.test(q)).length, Math.ceil(N / 500));
    await page.locator("#journal [data-more]").waitFor();
    assert.equal(await page.locator("#journal .jr-row[data-open]").count(), 100);
    assert.match(await page.locator("#journal .jr-more").textContent(), new RegExp(`100 sur ${active.toLocaleString("fr-FR").replace(/\s/g, "\\s")}`));
    await page.locator("#journal [data-more]").click();
    assert.equal(await page.locator("#journal .jr-row[data-open]").count(), 200);
    assert.equal(await page.locator("#journal [data-coverage]").count(), 0, "online and complete: nothing to say");
    // A family filter starts again from the first page and keeps only that family.
    await page.locator('#journal .seance-chip[data-family="force"]').click();
    assert.ok(await page.locator("#journal .jr-row[data-open]").count() <= 100);
    assert.deepEqual([...new Set(await page.locator("#journal .jr-row[data-open]").evaluateAll((rows) => rows.map((r) => r.dataset.family)))], ["force"]);
    await page.locator('#journal .seance-chip[data-family="all"]').click();

    // 2. The old ride is found by its note and its elevation corrected: only the elevation leaves, the sheet names the change.
    await page.locator("#jr-q").fill("galibier");
    await page.locator(`#journal [data-open="${oldId}"]`).click();
    await page.locator("dialog[open] [data-edit]").click();
    const elevation = page.locator('dialog[open] form.jr-edit [name="elevation"]');
    assert.equal(await elevation.inputValue(), "1450");
    await elevation.fill("1650");
    await page.locator('dialog[open] form.jr-edit [type="submit"]').click();
    await page.waitForFunction((id) => window.state.history.find((l) => l.id === id)?.details?.elevation === 1650, oldId);
    assert.deepEqual(cloud.patches, [{ elevation: 1650 }]);
    assert.match(await page.locator(".asc-toast, [role=status]").allTextContents().then((t) => t.join(" ")), /Dénivelé : 1450 → 1650 m/);

    // 3. Another device corrects a session of four years ago; a reload reads the manifest and only the two changed rows.
    const old = cloud.logs.find((l) => l.sport === "hiking" && Date.parse(l.date) < Date.parse("2022-06-01"));
    old.details = { ...old.details, duration: 333 };
    old.revision += 1;
    cloud.reads = []; cloud.rowsRead = 0;
    await page.reload();
    await loaded(page);
    assert.ok(cloud.reads.some((q) => q.includes("select=id,revision,archived_at,status,is_suspicious")), "the manifest is read");
    assert.equal(cloud.reads.filter((q) => q.startsWith("?select=*")).length, 1, "one read of changed rows");
    assert.equal(await page.evaluate((id) => window.state.history.find((l) => l.id === id)?.details?.duration, old.id), 333);
    assert.equal(await page.evaluate((id) => window.state.history.find((l) => l.id === id)?.details?.elevation, oldId), 1650);
    const stats = await page.evaluate(() => window.titanHistoryRefreshStats);
    assert.equal(stats.mode, "manifest");
    assert.equal(stats.read, 1, "only the session corrected elsewhere (the elevation was already on this device)");

    // 4. Offline: the device copy is shown, with what it covers.
    cloud.offline = true;
    await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false }); });
    await page.reload();
    await page.locator("#journal [data-coverage='complete']").waitFor();
    assert.match(await page.locator("#journal [data-coverage]").textContent(), new RegExp(`Hors ligne : tout ton journal est sur cet appareil \\(${N.toLocaleString("fr-FR").replace(/\s/g, "\\s")} séances, vérifié le`));
    assert.equal(await page.evaluate(() => window.state.history.length), active);
  } finally { await context.close(); }

  // 5. A new device whose reading is cut after the first page: a partial copy, said so, and partial totals.
  const cut = { logs: cloud.logs, reads: [], rowsRead: 0, patches: [], offline: false, cut: (url) => /or=/.test(url.search) };
  const second = await device(cut);
  try {
    await second.page.goto(BASE + "/journal");
    await second.page.locator("#journal [data-coverage='partial']").waitFor();
    const text = await second.page.locator("#journal [data-coverage]").textContent();
    assert.match(text, new RegExp(`cet appareil a tes séances du .+ à aujourd’hui \\(500 sur ${N.toLocaleString("fr-FR").replace(/\s/g, "\\s")}\\)`));
    assert.match(text, /Les totaux qui commencent avant le .+ sont partiels\./);
    assert.match(await second.page.locator("#journal [data-coverage-partial]").textContent(), /Totaux partiels : cet appareil n’a pas encore les séances d’avant le/);
    assert.equal(await second.page.locator("#journal .jr-summary[data-partial='true']").count(), 1);
    assert.equal(await second.page.evaluate(() => window.titanHistoryCoverage.complete), false);
  } finally { await second.context.close(); }
  assert.deepEqual(errors, []);
  assert.deepEqual(second.errors, []);
});
