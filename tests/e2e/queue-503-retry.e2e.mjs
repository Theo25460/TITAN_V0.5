// QA08, AND13: a signed-in session saved while the server answers 503 stays queued on the device, then is sent once, with the same event id, when the server is back.
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

const OWNER = "00000000-0000-4000-8000-0000000000aa";
test("a 503 from the server keeps the session queued and the retry sends it once with the same event id", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  const calls = [];
  let healthy = false;
  await context.route("**/rest/v1/rpc/titan_submit_training_session", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    calls.push({ event: body.p_details?.client_event_id, healthy });
    if (!healthy) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "upstream unavailable" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ log_id: "00000000-0000-4000-8000-0000000000bb", xp: 20, xp_after: 20, credits_after: 5, level_after: 1 }]) });
  });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE + "/training?sport=running");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate((owner) => {
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-token" } }, error: null });
  }, OWNER);
  await page.evaluate(async () => {
    const log = await window.logActivity("running", { val1: 5, durM: 30, distance: 5, performedAt: new Date().toISOString() }, { quiet: true });
    window.savedEvent = log.client_event_id;
  });
  await page.waitForFunction(() => window.TitanQueue.list().length === 1);
  // Let the automatic send started by the save finish against the failing server before the server comes back.
  const failed = await page.evaluate(() => window.flushPendingTrainingLogs());
  assert.deepEqual({ sent: failed.sent, remaining: failed.remaining }, { sent: 0, remaining: 1 });
  const kept = await page.evaluate(() => ({ queued: window.TitanQueue.list().length, status: window.state.history.at(-1).syncStatus }));
  assert.deepEqual(kept, { queued: 1, status: "pending" });
  healthy = true;
  const result = await page.evaluate(() => window.flushPendingTrainingLogs());
  assert.equal(result.sent, 1);
  const done = await page.evaluate(() => ({ queued: window.TitanQueue.list().length, status: window.state.history.at(-1).syncStatus, count: window.state.history.length }));
  assert.deepEqual(done, { queued: 0, status: "confirmed", count: 1 });
  const event = await page.evaluate(() => window.savedEvent);
  assert.ok(calls.length >= 2 && calls.every((c) => c.event === event), JSON.stringify(calls));
  assert.equal(calls.filter((c) => c.healthy).length, 1, "the session is accepted exactly once");
  assert.deepEqual(errors, []);
  await context.close();
});
