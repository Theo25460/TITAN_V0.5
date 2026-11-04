// Real canvas and QR encoder with controlled font completion; synthetic public-link receipt only.
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

async function previewPage(width = 360, enabled = true) {
  const fixture = await newPage(width, "UTC"), { page } = fixture;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate(async enabled => {
    window.previewOptions = { kind: "week", title: "Bilan de test", detail: "Rendu local", stats: [["Séances", "2"]], days: [0,30,0,60,0,0,0], name: "Compte de test", filename: "preview-test" };
    window.previewLink = "https://titan-app.fr/u/fixture-profile";
    await window.TitanCard.loadQr();
    await document.fonts.ready;
    window.expectedWithoutQr = (await window.TitanCard.draw(window.previewOptions, { qr: null })).toDataURL("image/png");
    window.expectedWithQr = (await window.TitanCard.draw(window.previewOptions, { qr: window.previewLink })).toDataURL("image/png");
    window.state.user.id = "00000000-0000-4000-8000-000000000777";
    window.titanClient = { rpc: async name => name === "titan_public_card_settings" ? { data: { enabled, slug: "fixture-profile" } } : { error: { message: "Fixture only" } } };
    window.TitanCard.resetLink();
    void window.TitanCard.open(window.previewOptions);
  }, enabled);
  await page.waitForFunction(() => document.querySelector(".cd-preview img")?.src.startsWith("data:image/png"));
  await page.evaluate(() => {
    window.paintJobs = []; window.paintFontCalls = 0; window.paintMode = "normal"; window.failPreview = false; window.previewFiles = [];
    const load = document.fonts.load.bind(document.fonts);
    document.fonts.load = (...args) => {
      if (window.paintMode !== "hold") return load(...args);
      const index = Math.floor(window.paintFontCalls++ / 3);
      return new Promise(resolve => { (window.paintJobs[index] ||= []).push(resolve); });
    };
    window.releasePaint = index => window.paintJobs[index].forEach(resolve => resolve([]));
    const toData = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) { if (window.failPreview) throw Error("Synthetic preview failure"); return toData.apply(this, args); };
    const makeUrl = URL.createObjectURL;
    URL.createObjectURL = file => { window.previewFiles.push(file); return makeUrl(file); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (!this.download) return click.call(this); };
  });
  return { ...fixture, errors };
}
async function hold(page) { await page.evaluate(() => { window.paintMode = "hold"; }); }
async function jobs(page, count) { await page.waitForFunction(count => window.paintJobs.length === count, count); }
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function release(page, index) { await page.evaluate(index => window.releasePaint(index), index); await settle(page); }
async function current(page, qr) {
  assert.equal(await page.locator(".cd-preview img").getAttribute("src") === await page.evaluate(qr => qr ? window.expectedWithQr : window.expectedWithoutQr, qr), true, "Preview must match the last QR choice");
}
async function exported(page, index, qr) {
  await page.waitForFunction(index => window.previewFiles.length > index, index);
  const actual = await page.evaluate(index => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(window.previewFiles[index]); }), index);
  assert.equal(actual === await page.evaluate(qr => qr ? window.expectedWithQr : window.expectedWithoutQr, qr), true, "Exported PNG must match the chosen QR version");
}

test("card preview: a stale QR render cannot replace the latest unchecked choice", async () => {
  for (const width of [360, 1280]) {
    const { page, context, errors } = await previewPage(width);
    try {
      await hold(page);
      const qr = page.locator("[data-qr]");
      await qr.uncheck(); await qr.check(); await qr.uncheck(); await jobs(page, 3);
      await release(page, 2); await current(page, false);
      await release(page, 0); await release(page, 1);
      await current(page, false);
      assert.equal(await qr.isChecked(), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("card preview: export is unavailable until the latest redraw is complete", async () => {
  const { page, context, errors } = await previewPage();
  try {
    await hold(page); await page.locator("[data-qr]").uncheck(); await jobs(page, 1);
    assert.equal(await page.locator("[data-save]").isDisabled(), true);
    assert.equal(await page.locator("[data-share]").isDisabled(), true);
    assert.equal(await page.locator("[data-qr]").isDisabled(), false);
    assert.equal(await page.locator("[data-card-actions]").getAttribute("aria-busy"), "true");
    await page.evaluate(() => { document.querySelector("[data-save]").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    assert.equal(await page.evaluate(() => window.previewFiles.length), 0);
    await release(page, 0); await current(page, false);
    await page.locator("[data-save]").click(); await exported(page, 0, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: latest completion can enable export while an obsolete render is still pending", async () => {
  const { page, context, errors } = await previewPage();
  try {
    await hold(page); const qr = page.locator("[data-qr]");
    await qr.uncheck(); await qr.check(); await jobs(page, 2);
    await release(page, 1); await current(page, true);
    assert.equal(await page.locator("[data-save]").isDisabled(), false);
    await page.locator("[data-save]").click(); await exported(page, 0, true);
    await release(page, 0); await current(page, true);
    await page.locator("[data-save]").click(); await exported(page, 1, true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: an older completion cannot unlock export while the latest render waits", async () => {
  const { page, context, errors } = await previewPage();
  try {
    await hold(page); const qr = page.locator("[data-qr]");
    await qr.uncheck(); await qr.check(); await jobs(page, 2);
    await release(page, 0);
    assert.equal(await page.locator("[data-save]").isDisabled(), true);
    assert.equal(await page.locator("[data-card-actions]").getAttribute("aria-busy"), "true");
    await release(page, 1); await current(page, true);
    assert.equal(await page.locator("[data-save]").isDisabled(), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: redraw failure blocks the old image and exposes an explicit retry", async () => {
  const { page, context, errors } = await previewPage();
  try {
    await page.evaluate(() => { window.failPreview = true; });
    await page.locator("[data-qr]").uncheck(); await settle(page);
    assert.equal(await page.locator("[data-card-error]").isVisible(), true);
    assert.equal(await page.locator("[data-save]").isDisabled(), true);
    assert.equal(await page.locator("[data-card-retry]").count(), 1);
    await page.evaluate(() => { window.failPreview = false; });
    await page.locator("[data-card-retry]").click(); await settle(page); await current(page, false);
    assert.equal(await page.locator("[data-card-error]").isHidden(), true);
    assert.equal(await page.locator("[data-card-retry]").isHidden(), true);
    await page.locator("[data-save]").click(); await exported(page, 0, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: an obsolete serialization failure cannot corrupt the successful latest preview", async () => {
  const { page, context, errors } = await previewPage();
  try {
    await hold(page); const qr = page.locator("[data-qr]");
    await qr.uncheck(); await qr.check(); await jobs(page, 2);
    await release(page, 1); await current(page, true);
    await page.evaluate(() => { window.failPreview = true; });
    await release(page, 0);
    await current(page, true);
    assert.equal(await page.locator("[data-card-error]").isHidden(), true);
    assert.equal(await page.locator("[data-save]").isDisabled(), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: closing during a redraw ignores its result and a retained checkbox", async () => {
  const { page, context, errors } = await previewPage();
  try {
    await hold(page); await page.locator("[data-qr]").uncheck(); await jobs(page, 1);
    await page.evaluate(() => { window.retainedPreview = document.querySelector(".cd-preview img"); window.retainedQr = document.querySelector("[data-qr]"); window.atClosePreview = window.retainedPreview.getAttribute("src"); });
    const dialog = page.getByRole("dialog", { name: "Image à partager", exact: true }), node = await dialog.elementHandle();
    await dialog.locator("[data-close]").click(); await page.waitForFunction(el => !el.isConnected, node); await node.dispose();
    await release(page, 0);
    assert.equal(await page.evaluate(() => window.retainedPreview.getAttribute("src") === window.atClosePreview), true);
    await page.evaluate(() => window.retainedQr.dispatchEvent(new Event("change", { bubbles: true }))); await settle(page);
    assert.equal(await page.evaluate(() => window.paintJobs.length), 1);
    assert.equal(await page.evaluate(() => window.previewFiles.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: disabled public link retains a ready image without a QR control", async () => {
  const { page, context, errors } = await previewPage(360, false);
  try {
    assert.equal(await page.locator("[data-qr]").count(), 0);
    await current(page, false);
    await page.locator("[data-save]").click(); await exported(page, 0, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: a completed QR change invalidates the file from a previous export", async () => {
  const { page, context, errors } = await previewPage();
  try {
    await page.locator("[data-save]").click(); await exported(page, 0, true);
    await page.locator("[data-qr]").uncheck(); await settle(page); await current(page, false);
    await page.locator("[data-save]").click(); await exported(page, 1, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: an initial guest rendering failure can retry without reopening", async () => {
  const { page, context } = await newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(BASE + "/stats");
    await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
    await page.evaluate(async () => {
      window.initialPreviewEncoder = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = () => { throw Error("Synthetic initial failure"); };
      await window.TitanCard.open({ kind: "week", title: "Essai initial", stats: [], days: [] });
    });
    assert.equal(await page.locator("[data-card-error]").isVisible(), true);
    assert.equal(await page.locator("[data-save]").isDisabled(), true);
    assert.equal(await page.locator("[data-card-retry]").count(), 1);
    await page.evaluate(() => { HTMLCanvasElement.prototype.toDataURL = window.initialPreviewEncoder; });
    await page.locator("[data-card-retry]").click();
    await page.waitForFunction(() => document.querySelector(".cd-preview img")?.src.startsWith("data:image/png"));
    assert.equal(await page.locator("[data-save]").isDisabled(), false);
    assert.equal(await page.locator("[data-card-error]").isHidden(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("card preview: export works when the newest initial choice finishes before the first render", async () => {
  const { page, context } = await newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(BASE + "/stats");
    await page.waitForFunction(() => window.TitanAdventure?.status === "ready");
    await page.evaluate(async () => {
      const options = { kind: "week", title: "Premier rendu", stats: [], days: [], filename: "initial-order" };
      await window.TitanCard.loadQr(); await document.fonts.ready;
      window.expectedWithoutQr = (await window.TitanCard.draw(options, { qr: null })).toDataURL("image/png");
      window.paintJobs = []; window.paintFontCalls = 0; window.previewFiles = [];
      document.fonts.load = () => {
        const index = Math.floor(window.paintFontCalls++ / 3);
        return new Promise(resolve => { (window.paintJobs[index] ||= []).push(resolve); });
      };
      window.releasePaint = index => window.paintJobs[index].forEach(resolve => resolve([]));
      const makeUrl = URL.createObjectURL;
      URL.createObjectURL = file => { window.previewFiles.push(file); return makeUrl(file); };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() { if (!this.download) return click.call(this); };
      window.state.user.id = "00000000-0000-4000-8000-000000000777";
      window.titanClient = { rpc: async name => name === "titan_public_card_settings" ? { data: { enabled: true, slug: "fixture-profile" } } : { error: { message: "Fixture only" } } };
      window.TitanCard.resetLink(); void window.TitanCard.open(options);
    });
    await page.locator("[data-qr]").waitFor(); await jobs(page, 1);
    await page.locator("[data-qr]").uncheck(); await jobs(page, 2);
    await release(page, 1); await current(page, false);
    assert.equal(await page.locator("[data-save]").isDisabled(), false);
    await page.locator("[data-save]").click();
    await page.waitForFunction(() => window.previewFiles.length === 1, null, { timeout: 2000 });
    await exported(page, 0, false);
    await release(page, 0); await current(page, false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
