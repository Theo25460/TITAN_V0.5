// ADR-004 phase 4: the Google Play purchase path of the Atelier, behind a flag, with simulated Digital Goods, Payment Request
// and server. Nothing here talks to Google or to a real account.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-0000000000aa";
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function atelier({ flag = true, apis = true, serverReply = { status: 200, body: { active: true, status: "active" } }, abort = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  if (flag) await context.route("**/js/config.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/(TITAN_PLAY_BILLING = \{\s*enabled:\s*)false/, "$1true") });
  });
  const posts = [];
  await context.route("**/functions/play-billing", async (route) => {
    posts.push({ auth: route.request().headers().authorization, body: JSON.parse(route.request().postData() || "{}") });
    await route.fulfill({ status: serverReply.status, contentType: "application/json", body: JSON.stringify(serverReply.body) });
  });
  await context.addInitScript(({ apis, abort }) => {
    window.playCalls = { details: 0, shown: 0, completed: [] };
    if (!apis) return;
    window.getDigitalGoodsService = async (provider) => {
      window.playCalls.provider = provider;
      return { getDetails: async (ids) => { window.playCalls.details++; return [{ itemId: ids[0], title: "TITAN+", price: { currency: "EUR", value: "4.99" } }]; } };
    };
    window.PaymentRequest = class {
      constructor(methods, details) { window.playCalls.methods = methods; window.playCalls.total = details.total; }
      async show() {
        window.playCalls.shown++;
        if (abort) throw Object.assign(new Error("closed"), { name: "AbortError" });
        await new Promise((r) => setTimeout(r, 300));
        return { details: { purchaseToken: "synthetic-purchase-token-0123456789" }, complete: async (r) => { window.playCalls.completed.push(r); } };
      }
    };
  }, { apis, abort });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/boutique?source=twa");
  await page.locator("#plus").waitFor();
  await page.evaluate((owner) => {
    window.state.user.id = owner;
    window.titanClient.auth.getSession = async () => ({ data: { session: { user: { id: owner }, access_token: "synthetic-session-token-used-only-in-tests" } }, error: null });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, OWNER);
  await page.waitForTimeout(400);
  return { page, context, posts, errors };
}

test("flag off: the Android app shows no Google Play purchase and the existing note about the website", async () => {
  const { page, context } = await atelier({ flag: false });
  assert.equal(await page.locator("[data-play-checkout]").count(), 0);
  assert.equal(await page.locator("[data-checkout]").count(), 0);
  assert.equal(await page.locator("#plus .asc-note").count(), 1);
  await context.close();
});

test("flag on but no Digital Goods API: nothing is offered that could not work", async () => {
  const { page, context } = await atelier({ apis: false });
  assert.equal(await page.locator("[data-play-checkout]").count(), 0);
  await context.close();
});

test("flag on: a repeated tap makes one purchase, the server gets the token with the session, and the sheet is completed as success", async () => {
  const { page, context, posts, errors } = await atelier();
  await page.locator("[data-play-checkout]").waitFor();
  await page.evaluate(() => { const b = document.querySelector("[data-play-checkout]"); b.click(); b.click(); b.click(); });
  await page.waitForFunction(() => window.playCalls.completed.length === 1);
  const calls = await page.evaluate(() => window.playCalls);
  assert.equal(calls.provider, "https://play.google.com/billing");
  assert.equal(calls.shown, 1, "one Google Play sheet");
  assert.deepEqual(calls.methods[0], { supportedMethods: "https://play.google.com/billing", data: { sku: "titan_plus" } });
  assert.deepEqual(calls.completed, ["success"]);
  assert.equal(posts.length, 1, "one confirmation request");
  assert.deepEqual(posts[0].body, { purchase_token: "synthetic-purchase-token-0123456789", product_id: "titan_plus" });
  assert.equal(posts[0].auth, "Bearer synthetic-session-token-used-only-in-tests");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a server refusal completes the sheet as failed and tells the player in French", async () => {
  const { page, context, posts } = await atelier({ serverReply: { status: 409, body: { error: "purchase_already_used" } } });
  await page.locator("[data-play-checkout]").click();
  await page.waitForFunction(() => window.playCalls.completed.length === 1);
  assert.deepEqual(await page.evaluate(() => window.playCalls.completed), ["fail"]);
  assert.equal(posts.length, 1);
  await page.locator("text=déjà rattaché à un autre compte").waitFor();
  assert.equal(await page.locator("[data-play-checkout]").isEnabled(), true, "the player can try again");
  await context.close();
});

test("closing the Google Play sheet is silent: no request, no error message", async () => {
  const { page, context, posts } = await atelier({ abort: true });
  await page.locator("[data-play-checkout]").click();
  await page.waitForFunction(() => window.playCalls.shown === 1);
  await page.waitForTimeout(300);
  assert.equal(posts.length, 0);
  assert.equal(await page.locator("text=Achat non terminé").count(), 0);
  assert.equal(await page.locator("[data-play-checkout]").isEnabled(), true);
  await context.close();
});
