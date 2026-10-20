// Real local QR script requests and canvas; public-link receipt is synthetic.
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
  assert.ok(ready, "local preview server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

async function fixture(mode = "abort", width = 360, enabled = true) {
  const result = await newPage(width, "UTC"), { page } = result;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const network = { mode, count: 0, held: [] };
  await page.route(/\/js\/vendor\/qrcode-generator-1\.4\.4\.js(?:\?|$)/, async route => {
    network.count++;
    if (network.mode === "hold") network.held.push(route);
    else if (network.mode === "abort") await route.abort("internetdisconnected");
    else if (network.mode === "empty") await route.fulfill({ status: 200, contentType: "text/javascript", body: "/* no encoder */" });
    else await route.continue();
  });
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(async enabled => {
    await document.fonts.ready;
    window.qrOptions = { kind: "week", title: "Bilan de test", stats: [["Séances", "2"]], days: [0,30,0,60,0,0,0], filename: "qr-recovery" };
    window.qrLink = "https://titan-app.fr/u/fixture-qr";
    window.state.user.id = "00000000-0000-4000-8000-000000000777";
    window.titanClient = { rpc: async () => ({ data: { enabled, slug: "fixture-qr" } }) };
    window.TitanCard.resetLink();
    window.qrFiles = [];
    const makeUrl = URL.createObjectURL;
    URL.createObjectURL = file => { window.qrFiles.push(file); return makeUrl(file); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (!this.download) return click.call(this); };
  }, enabled);
  return { ...result, errors, network };
}
async function open(page) {
  await page.evaluate(() => { window.qrOpen = window.TitanCard.open(window.qrOptions); });
  await page.getByRole("dialog", { name: "Image à partager", exact: true }).waitFor();
}
async function idle(page) {
  await page.waitForFunction(() => document.querySelector("[data-card-actions]")?.getAttribute("aria-busy") === "false", null, { timeout: 3000 });
}
async function failed(page) {
  await idle(page);
  assert.equal(await page.locator("[data-card-error]").isVisible(), true, "QR failure must not silently produce an exportable image");
  assert.equal(await page.locator("[data-card-retry]").isVisible(), true);
  assert.equal(await page.locator("[data-save]").isDisabled(), true);
  assert.equal(await page.locator("[data-share]").isDisabled(), true);
  assert.equal(await page.locator(".cd-preview img").getAttribute("src"), null);
}
async function exported(page, qr) {
  await page.locator("[data-save]").click();
  await page.waitForFunction(() => window.qrFiles.length === 1);
  assert.equal(await page.evaluate(async qr => {
    const expected = (await window.TitanCard.draw(window.qrOptions, { qr: qr ? window.qrLink : null })).toDataURL("image/png");
    const actual = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(window.qrFiles[0]); });
    return actual === expected && document.querySelector(".cd-preview img").src === expected && window.qrFiles[0].name === "qr-recovery.png";
  }, qr), true, "Preview and exported PNG match the selected QR choice");
}
async function requests(network, count) {
  for (let i = 0; i < 60 && network.count < count; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(network.count, count);
}

test("QR recovery: a failed script blocks export and a retry fetches the real encoder", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors, network } = await fixture("abort", width);
    try {
      await open(page); await failed(page);
      assert.match(await page.locator("[data-card-error]").innerText(), /QR/);
      assert.equal(await page.locator("[data-qr]").isChecked(), true);
      assert.equal(network.count, 1);
      network.mode = "success";
      await page.locator("[data-card-retry]").click(); await idle(page);
      assert.equal(network.count, 2);
      assert.equal(await page.locator("[data-card-error]").isHidden(), true);
      assert.equal(await page.locator("[data-save]").isDisabled(), false);
      await exported(page, true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("QR recovery: unchecking after a network error allows an image without a QR", async () => {
  const { page, context, errors, network } = await fixture();
  try {
    await open(page); await failed(page);
    await page.locator("[data-qr]").uncheck(); await idle(page);
    assert.equal(network.count, 1);
    assert.equal(await page.locator("[data-card-error]").isHidden(), true);
    await exported(page, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("QR recovery: a successful HTTP response without the encoder can retry", async () => {
  const { page, context, errors, network } = await fixture("empty");
  try {
    await open(page); await failed(page);
    network.mode = "success";
    await page.locator("[data-card-retry]").click(); await idle(page);
    assert.equal(network.count, 2);
    await exported(page, true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("QR recovery: a stalled request times out and a later attempt can succeed", async () => {
  const { page, context, errors, network } = await fixture("hold");
  try {
    await page.clock.install(); await open(page); await requests(network, 1);
    assert.equal(await page.locator("[data-save]").isDisabled(), true);
    await page.clock.runFor(8100); await failed(page);
    network.mode = "success";
    await page.locator("[data-card-retry]").click(); await idle(page);
    assert.equal(network.count, 2);
    await exported(page, true);
    assert.deepEqual(errors, []);
  } finally { for (const route of network.held) await route.abort().catch(() => {}); await context.close(); }
});

test("QR recovery: concurrent loader calls share one request and can all retry after failure", async () => {
  const { page, context, errors, network } = await fixture("hold");
  try {
    await page.evaluate(() => { window.loaderResults = Promise.all([window.TitanCard.loadQr(), window.TitanCard.loadQr()]); });
    await requests(network, 1);
    await network.held.pop().abort("internetdisconnected");
    assert.deepEqual(await page.evaluate(() => window.loaderResults), [null, null]);
    network.mode = "success";
    assert.equal(await page.evaluate(async () => (await window.TitanCard.loadQr()) === window.qrcode && typeof window.qrcode === "function"), true);
    assert.equal(network.count, 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("QR recovery: a late failed QR request cannot replace a newer unchecked image", async () => {
  const { page, context, errors, network } = await fixture("hold");
  try {
    await open(page); await requests(network, 1);
    await page.locator("[data-qr]").uncheck(); await idle(page);
    await network.held.pop().abort("internetdisconnected");
    await page.evaluate(() => window.qrOpen);
    assert.equal(await page.locator("[data-card-error]").isHidden(), true);
    assert.equal(await page.locator("[data-save]").isDisabled(), false);
    await exported(page, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("QR recovery: closing while the QR waits ignores its eventual failure", async () => {
  const { page, context, errors, network } = await fixture("hold");
  try {
    await open(page); await requests(network, 1);
    const dialog = page.getByRole("dialog", { name: "Image à partager", exact: true }), node = await dialog.elementHandle();
    await page.evaluate(() => { window.retainedError = document.querySelector("[data-card-error]"); });
    await dialog.locator("[data-close]").click(); await page.waitForFunction(el => !el.isConnected, node); await node.dispose();
    await network.held.pop().abort("internetdisconnected"); await page.evaluate(() => window.qrOpen);
    assert.equal(await page.evaluate(() => window.retainedError.hidden), true);
    assert.equal(await page.evaluate(() => window.qrFiles.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("QR recovery: an image without a public link does not fetch the encoder", async () => {
  const { page, context, errors, network } = await fixture("abort", 360, false);
  try {
    await open(page); await idle(page);
    assert.equal(await page.locator("[data-qr]").count(), 0);
    assert.equal(network.count, 0);
    await exported(page, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
