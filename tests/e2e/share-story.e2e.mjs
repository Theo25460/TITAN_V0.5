// « Partager » (before V2): the real story sheet of the website on the built pages, with a synthetic session; no account, no network.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "local preview server started");
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

// A confirmed GPS run that also carries what must never reach the picture: a trace, a place, a note, heart rate and perceived effort.
const LOG = {
  id: "00000000-0000-4000-8000-000000000a01", client_event_id: "00000000-0000-4000-8000-000000000a02", sport: "running", val: 10.2, unit: "km",
  date: "2026-11-20T07:40:00.000Z", syncStatus: "confirmed", xp: 300,
  details: { duration: 52.2, note: "Rue des Granges, genou raide", gpxStats: { ascent: 120 }, elevation: 120, route: [[47.2378, 6.0241]], bio: { rpe: 7, hr: 168 } },
};

async function journal(width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", acceptDownloads: true });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => window.TitanStory && window.TitanShareStory && window.TitanMoment && window.titanShell?.sheet);
  await page.evaluate(() => {
    window.storyEvents = [];
    window.TitanAnalytics = { ...(window.TitanAnalytics || {}), track: async (name, props) => { window.storyEvents.push([name, props]); return false; } };
  });
  return { context, page, errors };
}
const sheet = (page) => page.getByRole("dialog", { name: "Partager", exact: true });
const painted = (page) => page.waitForFunction(() => {
  const img = document.querySelector("dialog[open] .st-preview img");
  return img?.complete && img.naturalWidth === 1080 && img.naturalHeight === 1920;
});
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test("a session card shows its measures, never the trace, the place, the note or body signals; the name is off by default", async () => {
  const { context, page, errors } = await journal();
  const model = await page.evaluate((log) => {
    const input = window.TitanStory.sessionInput(log);
    return { input, model: window.TitanShareStory.session(input), named: window.TitanShareStory.session({ ...input, name: "Athlète Test" }, { name: true }).name };
  }, LOG);
  const text = JSON.stringify(model.model);
  for (const secret of ["Granges", "genou", "47.23", "6.02", "168", "7/10", "Ressenti"]) assert.ok(!text.includes(secret), `${secret} must not be on the card`);
  assert.equal(model.model.hero.label, "Distance");
  assert.equal(model.model.name, null);
  assert.equal(model.named, "Athlète Test");
  assert.deepEqual(errors, []);
  await context.close();
});

test("the moment after a session offers « Partager »: the preview is a 1080 × 1920 picture, then the download fallback", async () => {
  const { context, page, errors } = await journal();
  await page.evaluate(() => window.storyEvents.splice(0));
  await page.evaluate((log) => window.TitanMoment.open(log), LOG);
  await page.locator("dialog[open] [data-moment='story']").click();
  await sheet(page).waitFor();
  await painted(page);
  assert.equal(await page.locator("dialog[open] [data-option='name']").count(), 0, "a discovery account has no name to offer");
  assert.match(await sheet(page).textContent(), /Rien n’est publié tant que tu ne la partages pas/);
  // No Web Share with files: « Partager » downloads the picture instead of pretending to share.
  await page.evaluate(() => { Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }); });
  const [download] = await Promise.all([page.waitForEvent("download"), sheet(page).getByRole("button", { name: "Partager", exact: true }).click()]);
  assert.equal(download.suggestedFilename(), "titan-seance.png");
  assert.deepEqual(pngSize(readFileSync(await download.path())), [1080, 1920]);
  const events = await page.evaluate(() => window.storyEvents);
  assert.deepEqual(events.map(([n]) => n), ["share_preview_opened", "share_export_succeeded"]);
  for (const [, props] of events) assert.deepEqual(props, { kind: "session" }, "only the kind of card leaves the page");
  assert.deepEqual(errors, []);
  await context.close();
});

test("Web Share: a closed share sheet is not an error; a failed share offers a retry that works", async () => {
  const { context, page, errors } = await journal();
  await page.evaluate(() => {
    window.shareMode = "abort";
    window.shareFiles = [];
    Object.defineProperty(navigator, "canShare", { value: (d) => Array.isArray(d?.files), configurable: true });
    Object.defineProperty(navigator, "share", { value: async (d) => {
      window.shareFiles.push(d.files.map((f) => [f.name, f.type]));
      if (window.shareMode === "abort") throw new DOMException("closed", "AbortError");
      if (window.shareMode === "fail") throw new DOMException("denied", "NotAllowedError");
    }, configurable: true });
  });
  await page.evaluate(() => window.TitanStory.open({ kind: "achievement", input: { type: "record", title: "Charge maximale", value: "120 kg", sport: "Musculation", sportId: "muscu_gym", previous: "115 kg", date: "2026-11-12" } }));
  await painted(page);
  const share = sheet(page).getByRole("button", { name: "Partager", exact: true });
  await share.click();
  await page.waitForFunction(() => window.shareFiles.length === 1);
  assert.deepEqual(await page.evaluate(() => window.shareFiles[0]), [["titan-succes.png", "image/png"]]);
  assert.equal(await page.locator("dialog[open] [data-story-error]").isHidden(), true, "closing the sheet is a cancellation");
  await page.evaluate(() => { window.shareMode = "fail"; });
  await share.click();
  await page.locator("dialog[open] [data-story-error]").waitFor({ state: "visible" });
  await page.evaluate(() => { window.shareMode = "ok"; });
  await page.locator("dialog[open] [data-story-retry]").click();
  await page.waitForFunction(() => window.shareFiles.length === 3);
  await page.locator("dialog[open] [data-story-error]").waitFor({ state: "hidden" });
  const names = await page.evaluate(() => window.storyEvents.map(([n]) => n));
  assert.ok(names.includes("share_sheet_opened"));
  assert.ok(!names.includes("share_export_failed"), "a refused share sheet is not an export failure");
  assert.ok((await page.evaluate(() => window.storyEvents)).every(([, p]) => p.kind === "achievement" && Object.keys(p).length === 1));
  assert.deepEqual(errors, []);
  await context.close();
});

test("the preview stays inside a small phone and keeps the invitation separate from the picture", async () => {
  const { context, page, errors } = await journal(320);
  await page.evaluate(() => window.TitanStory.open({ kind: "session", input: { sport: "Randonnée en raquettes à neige sur sentier balisé de moyenne montagne", metrics: [["Durée", "4 h 20"]], name: "Athlète Test" } }));
  await painted(page);
  const name = page.locator("dialog[open] [data-option='name']");
  assert.equal(await name.isChecked(), false, "the name is not drawn until ticked");
  const first = await page.locator("dialog[open] .st-preview img").getAttribute("src");
  await name.check();
  await page.waitForFunction((src) => { const img = document.querySelector("dialog[open] .st-preview img"); return img?.src && img.src !== src && img.complete && img.naturalWidth === 1080; }, first);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(overflow, false, "no horizontal scroll at 320 px");
  assert.equal(await sheet(page).getByRole("link", { name: "Inviter un ami" }).getAttribute("href"), "/social#amis");
  // Three styles; the week is a choice of Champ and Feuille only, and every style repaints the same 1080 × 1920 picture.
  const styles = page.locator("dialog[open] [data-style]");
  assert.deepEqual(await styles.allTextContents(), ["Champ", "Feuille", "Carnet"]);
  for (const style of ["feuille", "carnet", "champ"]) {
    const before = await page.locator("dialog[open] .st-preview img").getAttribute("src");
    await page.locator(`dialog[open] [data-style='${style}']`).click();
    await page.waitForFunction((src) => { const img = document.querySelector("dialog[open] .st-preview img"); return img?.src && img.src !== src && img.complete && img.naturalWidth === 1080; }, before);
    assert.equal(await page.locator(`dialog[open] [data-style='${style}']`).getAttribute("aria-pressed"), "true");
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("the journal sheet of a session offers « Partager », which opens the same preview", async () => {
  const { context, page, errors } = await journal();
  await page.evaluate((log) => {
    window.state.history.push({ ...log, user_id: undefined });
    const probe = document.createElement("button");
    probe.type = "button";
    probe.dataset.open = log.id;
    probe.id = "story-probe";
    probe.textContent = "Ouvrir";
    document.getElementById("journal").append(probe);
  }, LOG);
  // The probe stands in for a journal row (the list itself is covered by the journal tests); the bottom bar may cover it, so it is
  // activated directly.
  await page.evaluate(() => document.getElementById("story-probe").click());
  const detail = page.locator("dialog[open] .jr-detail");
  await detail.waitFor();
  await detail.getByRole("button", { name: "Partager", exact: true }).click();
  await sheet(page).waitFor();
  await painted(page);
  assert.equal(await page.evaluate(() => window.storyEvents.filter(([n]) => n === "share_preview_opened").length), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a session's route arrives after the preview opens, is drawn by default, and the shape holds no coordinate", async () => {
  const { context, page, errors } = await journal();
  await page.evaluate(() => {
    window.routeAsked = [];
    window.TitanRoutes = { ...(window.TitanRoutes || {}), shapeForSession: async (log) => { window.routeAsked.push(log.client_event_id); return { segs: [[[0, 0], [900, 60], [950, 1300], [2200, 1250], [2300, 2100], [3100, 2350], [3300, 900]]] }; } };
  });
  await page.evaluate((log) => window.TitanMoment.open(log), LOG);
  await page.locator("dialog[open] [data-moment='story']").click();
  await sheet(page).waitFor();
  await page.locator("dialog[open] [data-option='route']").waitFor();
  assert.equal(await page.locator("dialog[open] [data-option='route']").isChecked(), true, "the route is shown by default");
  assert.deepEqual(await page.evaluate(() => window.routeAsked), [LOG.client_event_id]);
  await painted(page);
  const plan = await page.evaluate((log) => {
    const S = window.TitanShareStory;
    const input = { ...window.TitanStory.sessionInput(log), route: { segs: [[[0, 0], [900, 60], [950, 1300]]] } };
    return S.layout(S.session(input), "champ").ops.filter((o) => o.t === "route");
  }, LOG);
  assert.equal(plan.length, 1);
  assert.ok(plan[0].segs.flat().every(([x, y]) => x >= 0 && x <= 1080 && y >= 0 && y <= 1920), "the route is drawn in picture pixels");
  assert.deepEqual(errors, []);
  await context.close();
});
