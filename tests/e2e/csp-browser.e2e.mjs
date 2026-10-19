// The Content-Security-Policy of netlify.toml, replayed on every page in Chromium: nothing the pages load may be blocked.
// The local server does not send production headers, so the exact policy is attached to each document response here.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const POLICY = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(`${ROOT}netlify.toml`, "utf8"))[1];
let server;
let browser;
let BASE;

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

// Every page the build ships (dist/*.html), not a hand-picked sample: an unknown path would fall back to index.html.
const PAGES = readdirSync(`${ROOT}dist`).filter((f) => f.endsWith(".html")).map((f) => (f === "index.html" ? "/" : `/${f.slice(0, -5)}`));

test("the production CSP blocks nothing on any page, and its allowed hosts are only those that are used", async () => {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 800 } });
  // External hosts are unreachable here anyway; anything contacted would fail loudly, not silently.
  const contacted = new Set();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") {
      contacted.add(url.hostname);
      return route.abort("internetdisconnected");
    }
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if (route.request().resourceType() === "document") headers["content-security-policy"] = POLICY;
    await route.fulfill({ response, headers });
  });
  const violations = [];
  for (const path of PAGES) {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const consoleCsp = [];
    page.on("console", (m) => { if (/content security policy/i.test(m.text())) consoleCsp.push(m.text().slice(0, 160)); });
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => window.__csp);
    for (const v of [...seen, ...consoleCsp]) violations.push(`${path}: ${v}`);
    await page.close();
  }
  // The Paddle checkout script is injected on click in production: the policy must let it through (the host is unreachable
  // here, so a network failure is expected; a CSP violation is not).
  const probe = await context.newPage();
  await probe.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await probe.goto(BASE + "/", { waitUntil: "load" });
  await probe.evaluate(() => new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = script.onerror = resolve;
    document.head.appendChild(script);
  }));
  assert.deepEqual(await probe.evaluate(() => window.__csp), [], "the Paddle checkout script must not be blocked by the policy");
  // Images: the project's own storage (avatars) and the site pass; an arbitrary third-party host does not.
  await probe.evaluate(() => new Promise((resolve) => {
    let left = 2;
    const done = () => { if (--left === 0) resolve(); };
    for (const src of ["https://oubmftfufwwzwpgvrcag.supabase.co/storage/v1/object/public/avatars/a.png", "https://tracker.example.test/pixel.gif"]) {
      const img = new Image();
      img.onload = img.onerror = done;
      img.src = src;
    }
  }));
  const imageViolations = await probe.evaluate(() => window.__csp);
  assert.deepEqual(imageViolations, ["img-src https://tracker.example.test/pixel.gif"], "only the third-party image is refused");
  await probe.close();
  await context.close();
  assert.ok(PAGES.length >= 40, `the whole site is replayed (${PAGES.length} pages)`);
  assert.deepEqual(violations, [], "a page loads something the policy refuses");
  const removed = ["cdn.jsdelivr.net", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"].filter((h) => contacted.has(h));
  assert.deepEqual(removed, [], "no page tries to reach a host the policy does not need");
});

test("the policy no longer allows any HTTPS image, and names no host nothing uses", () => {
  assert.doesNotMatch(POLICY, /img-src[^;]*\shttps:(?=[\s;]|$)/, "img-src must not allow every HTTPS origin");
  for (const host of ["cdn.jsdelivr.net", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"]) {
    assert.ok(!POLICY.includes(host), `${host} must not be allowed`);
  }
});

test("under the production policy the shell's delegated actions still work (menu, profile link, avatar fallback)", async () => {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 360, height: 900 } });
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") return route.abort("internetdisconnected");
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if (route.request().resourceType() === "document") headers["content-security-policy"] = POLICY;
    await route.fulfill({ response, headers });
  });
  const page = await context.newPage();
  const violations = [];
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => (window.__v = [...(window.__v || []), e.violatedDirective])));
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => typeof window.titanToggleMobileMenu === "function");
  // ui.js markup carries data-act: the delegated listener replaces the former inline onclick.
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<button id="t-close" data-act="close-menu">x</button><div id="t-go" data-act="goto" data-href="/profile">p</div>');
    window.__closed = 0;
    window.titanSetMobileMenu = () => {};
  });
  // A broken avatar falls back to the logo without any inline onerror.
  const src = await page.evaluate(() => new Promise((resolve) => {
    const img = document.createElement("img");
    img.dataset.imgFallback = "./image/logo.png";
    img.addEventListener("load", () => resolve(img.src), { once: true });
    img.src = "/missing-avatar.png";
    document.body.appendChild(img);
  }));
  assert.match(src, /\/image\/logo\.png$/);
  await page.locator("#t-go").click();
  await page.waitForURL(/profile/);
  assert.deepEqual([...violations, ...(await page.evaluate(() => window.__v || []))], []);
  await page.waitForLoadState("load");
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
});
