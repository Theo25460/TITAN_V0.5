// The Content-Security-Policy of netlify.toml, replayed on every page in Chromium: nothing the pages load may be blocked.
// The local server does not send production headers, so the exact policy is attached to each document response here.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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

// One page per family: marketing, signed-out application screens, account, store, content and administration.
const PAGES = ["/", "/aujourdhui", "/training", "/stats", "/boutique", "/atelier", "/profile", "/communaute", "/tarifs", "/admin", "/dynamic-page", "/legal_privacy", "/404", "/debuter-titan", "/fonctionnalites"];

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
    await page.waitForTimeout(700);
    const seen = await page.evaluate(() => window.__csp);
    for (const v of [...seen, ...consoleCsp]) violations.push(`${path}: ${v}`);
    await page.close();
  }
  await context.close();
  assert.deepEqual(violations, [], "a page loads something the policy refuses");
  const removed = ["cdn.jsdelivr.net", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"].filter((h) => contacted.has(h));
  assert.deepEqual(removed, [], "no page tries to reach a host the policy does not need");
});

test("the policy no longer names hosts nothing uses", () => {
  for (const host of ["cdn.jsdelivr.net", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"]) {
    assert.ok(!POLICY.includes(host), `${host} must not be allowed`);
  }
});
