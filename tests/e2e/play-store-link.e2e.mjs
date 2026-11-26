// GP12 to GP15: the Google Play links of the shipped public pages and of the shared athlete card, in a real browser. Nothing reaches
// Google: every request outside the local server is cut, so following a link is checked by the address it leads to.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const LISTING = "https://play.google.com/store/apps/details?id=fr.titanapp.app";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function open(path = "/", { ua = DESKTOP, width = 390, height = 844, twa = false, standalone = false, html, prepare } = {}) {
  const context = await browser.newContext({ userAgent: ua, viewport: { width, height }, serviceWorkers: "block", hasTouch: ua === ANDROID, isMobile: ua === ANDROID });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  if (twa) await context.addInitScript(() => localStorage.setItem("titan_twa", "1"));
  if (standalone) await context.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes("standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q)); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (html) await page.route(BASE + path, (route) => route.fulfill({ contentType: "text/html", body: html(route) }));
  if (prepare) await prepare(page);
  await page.goto(BASE + path);
  await page.waitForLoadState("load");
  await page.waitForTimeout(150);
  return { page, context, errors };
}
const visiblePlay = (page) => page.locator("a[data-play-store]:visible");

test("Android phone: on the first screen, the Web action then Google Play, both exact; one reminder lower; no fixed bar", async () => {
  const { page, context, errors } = await open("/", { ua: ANDROID, width: 360, height: 640 });
  const hero = page.locator(".pub-hero .pub-cta a");
  assert.equal(await hero.count(), 2);
  assert.match(await hero.nth(0).innerText(), /Commencer sur le Web/);
  assert.equal(await hero.nth(0).getAttribute("href"), "/onboarding");
  const play = page.getByRole("link", { name: "Télécharger sur Google Play" }).first();
  assert.equal(await play.getAttribute("id"), "play-hero");
  assert.equal(await play.getAttribute("href"), LISTING, "the exact public listing, no added parameter");
  const box = await play.boundingBox();
  assert.ok(box.y + box.height <= 640, `the Play button is on the first screen of a 360×640 phone (bottom ${box.y + box.height})`);
  assert.ok(box.height >= 44 && box.width >= 44, "comfortable touch target");
  assert.deepEqual(await visiblePlay(page).evaluateAll((els) => els.map((a) => a.dataset.playStore)), ["hero", "final", "footer"]);
  assert.deepEqual(await visiblePlay(page).evaluateAll((els) => [...new Set(els.map((a) => a.href))]), [LISTING]);
  const fixed = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => getComputedStyle(el).position === "fixed" && el.closest("[data-play-store], [data-play-store-zone]")).length);
  assert.equal(fixed, 0, "nothing about Google Play is fixed over the page");
  assert.equal(await page.locator(".play-bar").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no horizontal scroll");
  assert.deepEqual(errors, []);
  await context.close();
});

test("keyboard: the Web action, then Google Play, each with a visible focus ring; Enter follows the exact listing", async () => {
  const { page, context, errors } = await open("/", { width: 1280, height: 900 });
  await page.locator(".pub-hero .pub-cta a").first().focus();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("href")), "/onboarding");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "play-hero");
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0; });
  assert.equal(ring, true, "visible focus");
  const [request] = await Promise.all([page.waitForRequest((r) => r.url().startsWith("https://play.google.com/")), page.keyboard.press("Enter")]);
  assert.equal(request.url(), LISTING);
  assert.deepEqual(errors, []);
  await context.close();
});

test("tablet and desktop: the guides and offers pages carry the reminder and the footer link, exact", async () => {
  for (const [path, width] of [["/journal-course-a-pied", 768], ["/titan-plus", 1440], ["/fonctionnalites", 1024]]) {
    const { page, context, errors } = await open(path, { width, height: 900 });
    assert.deepEqual(await visiblePlay(page).evaluateAll((els) => els.map((a) => [a.dataset.playStore, a.href])), [["final", LISTING], ["footer", LISTING]], path);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
    assert.deepEqual(errors, [], path);
    await context.close();
  }
});

test("inside the Android app or an installed PWA, nothing about Google Play is shown; the Web action stays", async () => {
  for (const options of [{ twa: true }, { standalone: true }]) {
    const { page, context, errors } = await open("/", { ua: ANDROID, width: 360, ...options });
    assert.equal(await visiblePlay(page).count(), 0, JSON.stringify(options));
    assert.equal(await page.locator(".pub-play-line:visible").count(), 0, "the reminder sentence goes with its link");
    assert.equal(await page.locator(".pub-hero .pub-cta a:visible").count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("a page whose listing is not the official one shows no Google Play link at all", async () => {
  const shipped = await (await fetch(BASE + "/journal-course-a-pied")).text();
  const { page, context } = await open("/journal-course-a-pied", { ua: ANDROID, html: () => shipped.replace(`content="${LISTING}"`, 'content="https://play.google.com/store/apps/details?id=com.autre.app"') });
  assert.equal(await page.locator("[data-play-store], [data-play-store-zone]").count(), 0);
  await context.close();
});

// Same harness as athlete-recovery.e2e.mjs: the real page, its card script held back, then run against a synthetic read-only RPC.
async function athlete({ twa = false } = {}) {
  const r = await open("/u/abcd123456", { ua: ANDROID, width: 360, twa, prepare: (page) => page.route("**/js/app/athlete.js?*", (route) => route.fulfill({ contentType: "text/javascript", body: "" })) });
  await r.page.evaluate(() => { window.titanClient = { rpc: () => Promise.resolve({ data: { name: "Athlète test", avatar: "scout", sports: [], titles: [] } }) }; });
  await r.page.addScriptTag({ path: ROOT + "/js/app/athlete.js" });
  await r.page.waitForFunction(() => document.querySelector("#athlete")?.getAttribute("aria-busy") === "false" && document.querySelector(".ap-cta"));
  return r;
}
test("shared athlete card: after « Découvrir TITAN », the exact Google Play link; none inside the Android app", async () => {
  let r = await athlete();
  const actions = r.page.locator(".ap-cta a");
  assert.deepEqual(await actions.evaluateAll((els) => els.map((a) => a.textContent.trim())), ["Découvrir TITAN", "Télécharger sur Google Play"]);
  assert.equal(await actions.nth(1).getAttribute("href"), LISTING);
  assert.equal(await actions.nth(1).getAttribute("id"), "play-athlete-card");
  const box = await actions.nth(1).boundingBox();
  assert.ok(box.height >= 44 && box.x + box.width <= 360, "full touch target inside a small phone");
  assert.deepEqual(r.errors, []);
  await r.context.close();
  r = await athlete({ twa: true });
  assert.equal(await r.page.locator(".ap-cta a[data-play-store]").count(), 0);
  assert.equal(await r.page.locator(".ap-cta a").count(), 1);
  await r.context.close();
});
