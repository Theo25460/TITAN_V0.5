// BOT06: while an administrator's verification request is open, every signed-in app page shows an alert that links to /recours.
// It informs and never blocks; guests, answered requests and older servers show nothing. Fake client, local server.
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

const USER = "00000000-0000-4000-8000-0000000000d1";

async function open({ path = "/stats", signedIn = true, guest = false, mode = "open" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
  if (signedIn || guest) {
    await page.evaluate(({ USER, mode, guest }) => {
      const calls = [];
      window.__verify = { calls, open: mode === "open" ? 1 : mode === "many" ? 2 : 0 };
      window.titanClient = {
        rpc: async (name) => {
          calls.push(name);
          if (name !== "titan_my_verification_requests_v1") return { data: null, error: { message: "unexpected " + name } };
          if (mode === "old") return { data: null, error: { message: "Could not find the function", code: "PGRST202" } };
          return { data: { version: 1, open: window.__verify.open, requests: [] }, error: null };
        },
      };
      window.state.user.id = guest ? "guest_local" : USER;
      window.dispatchEvent(new Event("titan:account-changed"));
    }, { USER, mode, guest });
  }
  return { page, context, errors };
}

test("an open request shows an alert with a link to the answer page, on an app page", async () => {
  const { page, context, errors } = await open();
  const alert = page.locator("[data-verify-alert]");
  await alert.waitFor();
  assert.equal(await alert.getAttribute("role"), "alert");
  assert.match(await alert.innerText(), /Une vérification t’est demandée par l’équipe TITAN/);
  assert.match(await alert.innerText(), /Aucune sanction automatique/);
  assert.equal(await alert.locator("a").getAttribute("href"), "/recours#verification");
  assert.equal(await page.locator("[data-verify-alert]").count(), 1, "one alert only, even after several refreshes");
  await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
  await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
  assert.equal(await page.locator("[data-verify-alert]").count(), 1);
  assert.equal(await page.evaluate(() => window.__verify.calls.filter((c) => c === "titan_my_verification_requests_v1").length), 1, "rechecked at most every five minutes");
  assert.deepEqual(errors, []);
  await context.close();
});

test("several open requests are announced in the plural; answering removes the alert", async () => {
  const { page, context } = await open({ mode: "many" });
  await page.locator("[data-verify-alert]").getByText(/Des vérifications te sont demandées/).waitFor();
  await page.evaluate(() => { window.__verify.open = 0; return window.titanRefreshVerificationAlert(); });
  await page.locator("[data-verify-alert]").waitFor({ state: "detached" });
  await context.close();
});

test("nothing is shown to a guest, with no request, or on a server without the function", async () => {
  for (const [label, options] of [["guest", { signedIn: false, guest: true }], ["none", { mode: "none" }], ["old server", { mode: "old" }]]) {
    const { page, context, errors } = await open(options);
    await page.waitForTimeout(400);
    assert.equal(await page.locator("[data-verify-alert]").count(), 0, label);
    if (options.guest) assert.deepEqual(await page.evaluate(() => window.__verify.calls.filter((c) => c === "titan_my_verification_requests_v1")), [], "a guest sends no verification request");
    assert.deepEqual(errors, [], label);
    await context.close();
  }
});

test("the alert follows the account: switching account removes it", async () => {
  const { page, context } = await open();
  await page.locator("[data-verify-alert]").waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("titan:account-changing")));
  await page.locator("[data-verify-alert]").waitFor({ state: "detached" });
  await context.close();
});
