// Real weekly image renderer and export handlers; synthetic browser boundaries, no external requests.
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
  assert.ok(ready, "local image server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });
async function newPage(width = 360, timezoneId = "Europe/Paris") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  return { context, page };
}

async function cardPage(width = 360, mode = "normal") {
  const fixture = await newPage(width, "UTC"), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00Z"));
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(() => {
    window.state.history = [{ id: "image-run", sport: "running", date: "2026-10-15T12:00:00Z", val: 10, unit: "km", details: { duration: 60 } }];
    window.dispatchEvent(new Event("titan:history-updated"));
  });
  await page.locator("[data-week-card]").click();
  const dialog = page.getByRole("dialog", { name: "Image à partager", exact: true });
  await page.waitForFunction(() => document.querySelector(".cd-preview img")?.src.startsWith("data:image/png"));
  await page.evaluate(mode => {
    window.imageFiles = []; window.imageEncodingCount = 0; window.imageEncodings = []; window.imageShareCalls = 0;
    window.imageMode = mode;
    window.originalImageBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type) {
      window.imageEncodingCount++;
      if (window.imageMode === "hold") { window.imageEncodings.push(() => window.originalImageBlob.call(this, callback, type)); return; }
      if (window.imageMode === "null") { queueMicrotask(() => callback(null)); return; }
      if (window.imageMode === "throw") throw Error("Synthetic encoder failure");
      return window.originalImageBlob.call(this, callback, type);
    };
    const makeUrl = URL.createObjectURL;
    URL.createObjectURL = file => {
      if (window.imageMode === "url-error") throw Error("Synthetic download failure");
      window.imageFiles.push(file); return makeUrl(file);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (!this.download) return click.call(this); };
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => window.imageMode.startsWith("share-") });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
      window.imageShareCalls++;
      if (window.imageMode === "share-error") throw new DOMException("Synthetic sharing failure", "NotAllowedError");
      if (window.imageMode === "share-abort") throw new DOMException("Synthetic cancellation", "AbortError");
      if (window.imageMode === "share-hold") return new Promise(resolve => { window.releaseImageShare = resolve; });
    } });
  }, mode);
  return { ...fixture, dialog, errors };
}
async function imageError(page) {
  await page.waitForFunction(() => document.querySelector("[data-card-error]")?.textContent.trim(), null, { timeout: 2000 });
  assert.match(await page.locator("[data-card-error]").textContent(), /image|réessaie|enregistrer/i);
  assert.equal(await page.evaluate(() => window.imageFiles.length), 0);
}
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector("[data-save]").disabled);
  assert.equal(await page.locator("[data-share]").isDisabled(), false);
}
async function saved(page) { await page.waitForFunction(() => window.imageFiles.length === 1); await ready(page); }

test("image export: repeated Save and Share wait for one encoding at both widths", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await cardPage(width, "hold");
    try {
      await page.locator("[data-save]").click();
      await page.evaluate(() => { for (const selector of ["[data-save]", "[data-share]", "[data-save]"]) document.querySelector(selector).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      assert.equal(await page.evaluate(() => window.imageEncodingCount), 1);
      assert.equal(await page.locator("[data-save]").isDisabled(), true);
      assert.equal(await page.locator("[data-share]").isDisabled(), true);
      assert.equal(await page.locator("[data-card-actions]").getAttribute("aria-busy"), "true");
      assert.equal(await page.locator("[data-card-error]").evaluate(el => Boolean(el.closest('[aria-busy="true"]'))), false);
      await page.evaluate(() => window.imageEncodings[0]());
      await saved(page);
      assert.equal(await page.locator("[data-card-actions]").getAttribute("aria-busy"), "false");
      assert.equal(await page.evaluate(() => document.activeElement.matches("[data-save]")), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("image export: a null PNG is refused visibly and a fresh retry succeeds", async () => {
  const { page, context, errors } = await cardPage(360, "null");
  try {
    await page.locator("[data-save]").click(); await imageError(page); await ready(page);
    assert.equal(await page.evaluate(() => document.activeElement.matches("[data-save]")), true);
    await page.evaluate(() => { window.imageMode = "normal"; });
    await page.locator("[data-save]").click(); await saved(page);
    assert.equal(await page.locator("[data-card-error]").isHidden(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: a synchronous encoder exception is handled and retryable", async () => {
  const { page, context, errors } = await cardPage(360, "throw");
  try {
    await page.locator("[data-save]").click(); await imageError(page); await ready(page);
    await page.evaluate(() => { window.imageMode = "normal"; });
    await page.locator("[data-save]").click(); await saved(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: unsupported native sharing falls back to the real rendered PNG bytes", async () => {
  const { page, context, errors } = await cardPage();
  try {
    await page.locator("[data-share]").click(); await saved(page);
    const file = await page.evaluate(async () => {
      const f = window.imageFiles[0], bytes = await f.arrayBuffer(), view = new DataView(bytes);
      return { type: f.type, name: f.name, header: [...new Uint8Array(bytes).slice(0, 8)], width: view.getUint32(16), height: view.getUint32(20) };
    });
    assert.deepEqual(file, { type: "image/png", name: "titan-semaine.png", header: [137,80,78,71,13,10,26,10], width: 1080, height: 1350 });
    assert.equal(await page.evaluate(() => window.imageShareCalls), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: a native sharing error is visible and Save remains available", async () => {
  const { page, context, errors } = await cardPage(360, "share-error");
  try {
    await page.locator("[data-share]").click(); await imageError(page); await ready(page);
    assert.equal(await page.evaluate(() => document.activeElement.matches("[data-share]")), true);
    await page.locator("[data-save]").click(); await saved(page);
    assert.equal(await page.evaluate(() => window.imageShareCalls), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: cancelling native sharing is quiet and restores the active button", async () => {
  const { page, context, errors } = await cardPage(360, "share-abort");
  try {
    await page.locator("[data-share]").click();
    await page.waitForFunction(() => window.imageShareCalls === 1); await ready(page);
    assert.equal(await page.locator("[data-card-error]").count(), 1);
    assert.equal(await page.locator("[data-card-error]").isHidden(), true);
    assert.equal(await page.evaluate(() => window.imageFiles.length), 0);
    assert.equal(await page.evaluate(() => document.activeElement.matches("[data-share]")), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: a pending native share blocks both actions until its result", async () => {
  const { page, context, errors } = await cardPage(360, "share-hold");
  try {
    await page.locator("[data-share]").click();
    await page.waitForFunction(() => window.imageShareCalls === 1);
    await page.evaluate(() => { for (const selector of ["[data-share]", "[data-save]"]) document.querySelector(selector).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    assert.equal(await page.evaluate(() => window.imageShareCalls), 1);
    assert.equal(await page.evaluate(() => window.imageFiles.length), 0);
    assert.equal(await page.locator("[data-save]").isDisabled(), true);
    await page.evaluate(() => window.releaseImageShare()); await ready(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: closing during encoding prevents a later download and retained-button replay", async () => {
  const { page, context, dialog, errors } = await cardPage(360, "hold");
  try {
    await page.locator("[data-save]").click();
    await page.evaluate(() => { window.retainedImageSave = document.querySelector("[data-save]"); });
    const node = await dialog.elementHandle();
    await dialog.locator("[data-close]").click();
    await page.waitForFunction(el => !el.isConnected, node); await node.dispose();
    await page.evaluate(() => window.imageEncodings[0]());
    await page.waitForFunction(() => !window.retainedImageSave.disabled);
    await page.evaluate(() => window.retainedImageSave.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(await page.evaluate(() => window.imageFiles.length), 0);
    assert.equal(await page.evaluate(() => window.imageEncodingCount), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: download preparation failure does not show success and can retry", async () => {
  const { page, context, errors } = await cardPage(360, "url-error");
  try {
    await page.locator("[data-save]").click(); await imageError(page); await ready(page);
    assert.equal(await page.locator('.asc-toast').filter({ hasText: "Image enregistrée" }).count(), 0);
    await page.evaluate(() => { window.imageMode = "normal"; });
    await page.locator("[data-save]").click(); await saved(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("image export: updated Stats and Records bypass the previous card script", async () => {
  for (const path of ["/stats", "/records"]) {
    const { page, context } = await newPage();
    try {
      let previousRequests = 0;
      await page.route("**/js/app/card.js?v=300.0", route => { previousRequests++; return route.fulfill({ contentType: "text/javascript", body: "window.previousImageExporter = true;" }); });
      await page.goto(BASE + path);
      await page.waitForFunction(() => Boolean(window.TitanCard));
      assert.equal(previousRequests, 0);
      assert.equal(await page.evaluate(() => Boolean(window.previousImageExporter)), false);
      assert.equal(await page.locator('script[src="/js/app/card.js?v=300.1"]').count(), 1);
    } finally { await context.close(); }
  }
});
