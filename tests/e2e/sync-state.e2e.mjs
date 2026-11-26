// V1.6.1 — État de synchronisation, website. Real journal, real session form and real IndexedDB queue against a local fake of
// titan_submit_training_session that keeps its contract: one receipt per client_event_id (same request → same receipt), out-of-range
// values refused with 22023. Scenarios: network lost before sending, app restart, network lost after the server commit, validation
// refusal corrected through the entry form, account switch, and the same single session read by a second device.
// External requests are blocked; no production account is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const OWNER = "00000000-0000-4000-8000-0000000161aa";
const OTHER = "00000000-0000-4000-8000-0000000161bb";
const cloud = { mode: "up", rows: [], receipts: new Map(), calls: [] };

async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Paris" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  await context.route("**/rest/v1/rpc/titan_submit_training_session", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const id = body.p_details?.client_event_id;
    cloud.calls.push(`${cloud.mode}:${id}`);
    if (cloud.mode === "offline") return route.abort("internetdisconnected");
    const request = JSON.stringify(body);
    let receipt = cloud.receipts.get(id);
    if (receipt && receipt.request !== request) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "23505", message: "EVENT_CONTENT_CONFLICT" }) });
    if (!receipt) {
      if (body.p_unit === "km" && Number(body.p_val) > 1000) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "22023", message: "TRAINING_VALUE_OUT_OF_RANGE" }) });
      const row = { id: `00000000-0000-4000-8000-${String(cloud.rows.length + 1).padStart(12, "0")}`, user_id: OWNER, client_event_id: id, sport: body.p_sport, category: body.p_category, val: body.p_val, unit: body.p_unit, date: body.p_date, details: body.p_details, xp: 140, created_at: new Date().toISOString() };
      cloud.rows.push(row);
      receipt = { request, response: [{ log_id: row.id, xp: 140, credits: 12, xp_after: 140, credits_after: 12, level_after: 1 }] };
      cloud.receipts.set(id, receipt);
    }
    // The server committed; the answer never reaches the browser.
    if (cloud.mode === "drop-after-commit") return route.abort("internetdisconnected");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(receipt.response) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}

async function signIn(page, path, owner = OWNER) {
  await page.goto(BASE + path);
  // After a reload the page may already carry the account id saved by the previous run: wait for the page, not for a guest owner.
  await page.waitForFunction(() => ["ready", "error"].includes(window.TitanAdventure?.status) && window.TitanQueue && window.state?.user);
  await page.evaluate(async (owner) => {
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-token" } }, error: null });
    await window.TitanQueue.refresh();
  }, owner);
}
const openSheet = async (page, id) => {
  await page.locator(`[data-open="${id}"]`).click();
  await page.locator("dialog[open] .jr-sync").waitFor();
  return page.locator("dialog[open] .jr-sync");
};
const closeSheet = (page) => page.evaluate(() => document.querySelector("dialog[open]")?.close());

test("one gravel session through offline, restart, lost receipt, refusal and correction: one confirmed entry on both devices", async () => {
  const a = await device();
  const { page } = a;
  await signIn(page, "/journal");

  // 1. Network lost before sending: kept on the device, then « En attente d’envoi » with the last attempt.
  cloud.mode = "offline";
  const eventId = await page.evaluate(async () => (await window.logActivity("gravel", { val1: 42, distance: 42, durM: 30, durH: 2, duration: 150, note: "Gravel sans réseau", performedAt: "2026-11-22T07:30:00.000Z" }, { quiet: true })).client_event_id);
  await page.evaluate(() => window.flushPendingTrainingLogs());
  const queued = await page.evaluate(() => window.TitanQueue.list().map(({ status, attempts, lastAttemptAt, reason }) => ({ status, attempts, last: !!lastAttemptAt, reason })));
  assert.equal(queued.length, 1);
  assert.equal(queued[0].status, "pending");
  assert.ok(queued[0].attempts >= 1 && queued[0].last, JSON.stringify(queued));
  await page.locator(`[data-open="${eventId}"] [data-sync-badge="pending"]`).waitFor();
  assert.equal((await page.locator(`[data-open="${eventId}"] [data-sync-badge]`).textContent()).trim(), "En attente");
  let sync = await openSheet(page, eventId);
  assert.equal(await sync.getAttribute("data-sync-state"), "pending");
  assert.match(await sync.textContent(), /En attente d’envoi.*Dernière tentative.*Motif.*Connexion indisponible.*Référence/s);
  assert.equal(await sync.locator('[data-sync-action="send"]').count(), 1);
  assert.equal(await page.locator("dialog[open] [data-edit]").count(), 0, "the server edit needs a confirmed row");
  await closeSheet(page);

  // 2. Restart: the frozen request is still in IndexedDB, same event id, same attempts.
  await page.reload();
  await signIn(page, "/journal");
  const kept = await page.evaluate(() => window.TitanQueue.list().map((i) => ({ id: i.payload.details.client_event_id, attempts: i.attempts, state: window.TitanSyncState.stateOf({ item: i }) })));
  assert.deepEqual(kept.map((k) => [k.id, k.state]), [[eventId, "pending"]]);
  // As state.js does after the cloud load: the provisional entry comes back from the queue.
  await page.evaluate(() => {
    const i = window.TitanQueue.list()[0];
    window.state.history = [{ ...i.payload, id: i.payload.details.client_event_id, client_event_id: i.payload.details.client_event_id, cat: i.payload.category, xp: 0, syncStatus: i.status }];
    window.dispatchEvent(new Event("titan:history-updated"));
  });

  // 3. Network lost after the server commit: the server has the session, the browser does not claim it.
  cloud.mode = "drop-after-commit";
  await page.evaluate(() => window.flushPendingTrainingLogs());
  assert.equal(cloud.rows.length, 1);
  assert.equal(await page.evaluate(() => window.TitanQueue.list().length), 1);
  assert.equal(await page.evaluate(() => window.state.history[0].syncStatus), "pending");

  // 4. Back online: the same request gets the same receipt; one entry, confirmed.
  cloud.mode = "up";
  const sent = await page.evaluate(() => window.flushPendingTrainingLogs());
  assert.equal(sent.sent, 1);
  assert.equal(cloud.rows.length, 1);
  assert.ok(cloud.calls.filter((c) => c.endsWith(eventId)).length >= 3);
  sync = await openSheet(page, eventId); // the journal addresses a session by its client_event_id
  assert.equal(await sync.getAttribute("data-sync-state"), "confirmed");
  assert.match(await sync.textContent(), new RegExp(`Confirmée dans ton compte.*Reçu du serveur.*\\+140 XP.*Référence.*${eventId.slice(0, 8)}`, "s"));
  await closeSheet(page);

  // 5. Validation refusal: « Refusée : à corriger », the reason, and the correction through the entry form.
  const badId = await page.evaluate(async () => (await window.logActivity("gravel", { val1: 4200, distance: 4200, duration: 150, note: "Virgule oubliée", performedAt: "2026-11-21T16:45:00.000Z" }, { quiet: true })).client_event_id);
  await page.waitForFunction(() => window.TitanQueue.list().some((i) => i.status === "error"));
  await page.locator(`[data-open="${badId}"] [data-sync-badge="refused"]`).waitFor();
  sync = await openSheet(page, badId);
  assert.match(await sync.textContent(), /Refusée : à corriger.*Motif du refus.*la valeur saisie est hors des limites acceptées/s);
  assert.deepEqual(await sync.locator("[data-sync-action]").evaluateAll((b) => b.map((x) => x.textContent.trim())), ["Corriger et renvoyer", "Retirer de cet appareil"]);
  await page.evaluate(() => { const set = sessionStorage.setItem.bind(sessionStorage); sessionStorage.setItem = (k, v) => { set(k, v); localStorage.setItem("e2e_duplicate", v); }; });
  await Promise.all([page.waitForURL(/\/training\?sport=gravel/), sync.locator('[data-sync-action="correct"]').click()]);
  const handoff = JSON.parse(await page.evaluate(() => localStorage.getItem("e2e_duplicate")));
  assert.equal(handoff.ownerId, OWNER);
  assert.equal(handoff.replaces, `${OWNER}:${badId}`);
  // The test browser is not really signed in: hand the same request to the form once the account is in place, as after sign-in.
  await page.waitForFunction(() => ["ready", "error"].includes(window.TitanAdventure?.status));
  await page.evaluate(async ({ owner, handoff }) => {
    window.dispatchEvent(new Event("titan:account-changing"));
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-token" } }, error: null });
    await window.TitanQueue.refresh();
    sessionStorage.setItem("titan_duplicate_session", JSON.stringify(handoff));
    window.dispatchEvent(new Event("titan:account-changed"));
  }, { owner: OWNER, handoff });
  await page.locator("[data-correction]").waitFor();
  assert.match(await page.locator("[data-correction]").textContent(), /Correction d’une séance refusée.*remplace la séance refusée/s);
  assert.equal(await page.locator('[data-k="distance"]').inputValue(), "4200");
  assert.equal(await page.locator('[data-k="note"]').inputValue(), "Virgule oubliée");
  await page.locator('[data-k="distance"]').fill("42");
  await page.locator('[data-act="save"]').click();
  await page.waitForFunction(() => window.TitanQueue.list().length === 0, null, { timeout: 15000 });
  assert.equal(cloud.rows.length, 2);
  assert.ok(cloud.rows.every((r) => Number(r.val) <= 1000), "the refused values never reach the account");
  assert.ok(!cloud.rows.some((r) => r.client_event_id === badId));
  assert.equal(cloud.rows[1].details.note, "Virgule oubliée");
  assert.equal(cloud.rows[1].date.slice(0, 16), "2026-11-21T16:45", "the correction keeps the day and time of the refused session");

  // 6. Account switch: another account sees none of these states.
  await page.evaluate(async (other) => { window.state.user.id = other; await window.TitanQueue.refresh(); }, OTHER);
  assert.equal(await page.evaluate(() => window.TitanQueue.list().length), 0);
  assert.deepEqual(a.errors, []);
  await a.context.close();

  // 7. Second device of the same account: it only knows the server rows (same mapping as js/state.js after the cloud load).
  const b = await device();
  await signIn(b.page, "/journal");
  await b.page.evaluate((rows) => {
    window.state.history = rows.map((l) => ({ ...l, cat: l.category, syncStatus: "confirmed" }));
    window.dispatchEvent(new Event("titan:history-updated"));
  }, cloud.rows);
  await b.page.locator(`[data-open="${eventId}"], [data-open="${cloud.rows[0].id}"]`).first().waitFor();
  assert.equal(await b.page.locator(".jr-row").count(), 2);
  assert.equal(await b.page.locator("[data-sync-badge]").count(), 0);
  const there = await openSheet(b.page, cloud.rows[0].client_event_id);
  assert.match(await there.textContent(), new RegExp(`Confirmée dans ton compte.*Référence.*${eventId.slice(0, 8)}`, "s"));
  assert.deepEqual(b.errors, []);
  await b.context.close();
});
