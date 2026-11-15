// V1.3.1 web UX and stability checks: a signed-in new account is not covered by a modal, the session page follows the Back button,
// one double click sends one session, and the result says what was done, what changed (confirmed only) and what comes next.
// Synthetic account and mocked Supabase: no real account, no real write.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const HOST = "oubmftfufwwzwpgvrcag.supabase.co";
const OWNER = "00000000-0000-4000-8000-000000001311";
let server, browser, BASE;

before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready, "local server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function guest(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  return { context, page, errors };
}

/** A signed-in account with an empty journal; `calls` records every request sent to the (mocked) server. */
async function account(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: "block" });
  context.setDefaultTimeout(15000);
  const now = Math.floor(Date.now() / 1000), user = { id: OWNER, email: "v131@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {} };
  const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = [part({ alg: "HS256", typ: "JWT" }), part({ sub: OWNER, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 }), "synthetic"].join(".");
  await context.addInitScript(session => { if (!localStorage.getItem("titan_supabase_auth_v1")) localStorage.setItem("titan_supabase_auth_v1", JSON.stringify(session)); },
    { access_token: token, refresh_token: "synthetic", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user });
  const calls = [], logs = [];
  const profile = () => ({ id: OWNER, username: "Camille", friend_code: "TN-V131", xp: logs.length ? 307 : 7, credits: 5, level: 1, state_version: 1, game_state: { user: { id: OWNER, name: "Camille", onboardedAt: "2026-10-01", onboardingComplete: true }, history: [] } });
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== HOST) return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "*/0" }, body: JSON.stringify(body) });
    if (req.method() !== "OPTIONS") calls.push({ method: req.method(), path: url.pathname });
    if (url.pathname === "/auth/v1/user") return reply(user);
    if (url.pathname === "/rest/v1/profiles") return reply(profile());
    if (url.pathname === "/rest/v1/training_logs") return reply(logs);
    if (url.pathname === "/rest/v1/rpc/titan_submit_training_session") {
      const body = req.postDataJSON();
      await new Promise(r => setTimeout(r, 400)); // long enough for a second click to arrive while the first is in flight
      if (!logs.length) logs.push({ id: "00000000-0000-4000-8000-000000001312", user_id: OWNER, client_event_id: body.p_details.client_event_id, sport: body.p_sport, category: body.p_category, val: body.p_val, unit: body.p_unit, details: body.p_details, date: body.p_date, xp: 300, revision: 1 });
      return reply([{ log_id: logs[0].id, xp: 300, credits: 30, requested_xp: 300, xp_after: 307, credits_after: 35, level_after: 1, leveled_up: 0, reward_held: false }]);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) return reply({ code: "PGRST202", message: "Optional test RPC missing" }, 404);
    if (url.pathname.startsWith("/rest/v1/")) return reply([]);
    return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  return { context, page, errors, calls };
}
const count = (calls, name) => calls.filter(c => c.path.endsWith(name)).length;

test("a signed-in new account lands on a readable QG: no modal over it, one primary action, no profile write", async () => {
  for (const width of [360, 1280]) {
    const { context, page, errors, calls } = await account(width);
    try {
      await page.goto(BASE + "/aujourdhui");
      await page.waitForFunction(() => window.titanCloudHistoryLoadedAt);
      await page.locator(".qg-hero .asc-btn-primary").waitFor();
      await page.waitForTimeout(900); // the retired welcome modal used to open about half a second after the sync
      assert.equal(await page.locator("#titan-first-run-guide").count(), 0, "the legacy « Bienvenue dans TITAN OS » modal is gone");
      assert.equal(await page.locator('[role="dialog"], dialog[open]').count(), 0, "nothing covers the QG");
      assert.equal(await page.locator("#qg .asc-btn-primary").count(), 1);
      assert.equal(await page.locator(".qg-hero .asc-btn-primary").getAttribute("href"), "/training");
      await page.getByRole("heading", { name: "Comment ça marche" }).waitFor();
      assert.equal(count(calls, "titan_save_profile_state"), 0, "reading the QG never writes the profile");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); }
  }
});

test("session page: Back returns from the form to the list of sports and keeps the draft; after saving, one Back leaves the page", async () => {
  const { context, page, errors } = await guest();
  try {
    await page.goto(BASE + "/aujourdhui");
    await page.locator(".qg-hero .asc-btn-primary").click();
    await page.waitForURL("**/training");
    await page.locator('#seance [data-sport="yoga"]').first().press("Enter");
    await page.waitForURL("**/training?sport=yoga");
    assert.equal(await page.evaluate(() => document.activeElement?.matches("[data-form-title]")), true, "the keyboard continues from the title of the form");
    await page.locator('[data-k="durM"]').fill("25");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem(`titan_seance_draft_v3:${window.state.user.id}`) || "null")?.durM === "25");

    await page.goBack();
    await page.locator("#sport-q").waitFor();
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, "/training", "Back shows the list of sports, on the same page");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(`titan_seance_draft_v3:${window.state.user.id}`) || "null")?.durM), "25", "the draft stays on the device");

    await page.goForward();
    await page.locator('[data-k="durM"]').waitFor();
    assert.equal(await page.locator('[data-k="durM"]').inputValue(), "25", "Forward reopens the form with its measurements");

    await page.locator('[data-act="save"]').click();
    const recap = page.locator("dialog.moment-sheet[open]");
    await recap.waitFor();
    await page.waitForFunction(() => location.pathname + location.search === "/training");
    await recap.locator('[data-moment="done"]').click();
    await page.goBack();
    await page.waitForURL("**/aujourdhui");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("session page: the in-page « Changer de sport » button and Back agree, without a dead history step", async () => {
  const { context, page, errors } = await guest();
  try {
    await page.goto(BASE + "/aujourdhui");
    await page.goto(BASE + "/training");
    await page.locator('#seance [data-sport="yoga"]').first().click();
    await page.locator('[data-k="durM"]').waitFor();
    await page.locator('[data-act="back"]').click();
    await page.locator("#sport-q").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem(`titan_seance_draft_v3:${window.state.user.id}`)), null, "changing sport on purpose drops the draft, as before");
    await page.goBack();
    await page.waitForURL("**/aujourdhui");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a double click on Enregistrer sends one session, and the result reads: done, changed (confirmed), next", async () => {
  const { context, page, errors, calls } = await account();
  try {
    await page.goto(BASE + "/training?sport=yoga");
    await page.waitForFunction(() => window.titanCloudHistoryLoadedAt);
    await page.locator('[data-k="durM"]').fill("30");
    await page.locator('[data-act="save"]').dblclick({ delay: 40 });
    const recap = page.locator("dialog.moment-sheet[open]");
    await recap.waitFor();
    await recap.locator('.moment-gain.has-ring').waitFor(); // the server receipt arrived
    assert.equal(count(calls, "titan_submit_training_session"), 1, "one request for one session");
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]")), true, "the focus is inside the result");
    assert.equal(await page.evaluate(() => window.state.history.length), 1);

    assert.deepEqual(await recap.locator("h3").allInnerTexts().then(list => list.map(t => t.trim().toLowerCase())), ["tu as fait", "ce que ça change", "et ensuite ?"]);
    assert.equal(await recap.locator(".moment-xp").innerText(), "+300 XP", "the confirmed figure stays available to assistive technology");
    const box = await recap.locator(".moment-xp").boundingBox();
    assert.ok(box.width <= 2 && box.height <= 2, "and is drawn once, in the ring");
    assert.match(await recap.locator(".moment-reward").innerText(), /Confirmée par le serveur/);
    assert.ok((await recap.locator(".moment-next").innerText()).trim().length > 20, "one next step is written out");
    assert.equal(await recap.locator(".asc-btn-primary").count(), 1, "one primary action");
    await recap.locator('[data-moment="done"]').press("Enter");
    await page.waitForFunction(() => !document.querySelector("dialog[open]") && document.activeElement?.matches("[data-pick-title]"));
    assert.deepEqual(errors, []);
  } finally { await context.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); }
});

test("a session the server has not confirmed shows no XP figure at all", async () => {
  const { context, page, errors } = await guest();
  try {
    await page.goto(BASE + "/training");
    await page.waitForFunction(() => window.TitanMoment && window.state?.user);
    await page.evaluate(() => {
      const log = { id: "w1", client_event_id: "w1", sport: "yoga", date: new Date().toISOString(), val: 30, unit: "min", xp: 300, syncStatus: "pending", details: { duration: 30 } };
      window.state.user.id = "00000000-0000-4000-8000-000000001313"; window.state.history = [log];
      window.TitanMoment.open(log);
    });
    const recap = page.locator("dialog.moment-sheet[open]");
    await recap.waitFor();
    assert.equal(await recap.locator(".moment-ring").count(), 0, "no gain animation before confirmation");
    assert.doesNotMatch(await recap.innerText(), /\+\s?\d+\s?XP/);
    assert.match(await recap.locator(".moment-xp").innerText(), /Confirmation en attente/);
    assert.match(await recap.locator(".moment-next").innerText(), /Rien à faire/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
