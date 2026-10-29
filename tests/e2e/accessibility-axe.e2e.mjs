// LEG52 / accessibility regression guard: axe-core (WCAG 2.0/2.1 A and AA rules) on every player and public page in a guest
// session, at phone width, in French. Automated rules find only part of the real problems (colour contrast on states that need
// interaction, reading order and screen-reader wording are not covered); this test keeps the pages that pass today from regressing.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

// The administration console is a desktop tool; the others are not user pages or are redirects/error pages.
const SKIP = /^(admin|sys_core_override_99|googleb8fedd43e28cf7d4|dynamic-page|network-error|404|update-password)\.html$/;
const PAGES = readdirSync(`${ROOT}dist`).filter((f) => f.endsWith(".html") && !SKIP.test(f)).map((f) => (f === "index.html" ? "/" : `/${f.slice(0, -5)}`));

test("no WCAG 2.0/2.1 A or AA violation found by axe-core on any player or public page", async () => {
  assert.ok(PAGES.length >= 41, `the whole site is audited (${PAGES.length} pages)`);
  const problems = [];
  for (const path of PAGES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", locale: "fr-FR" });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
    const page = await context.newPage();
    try {
      await page.goto(BASE + path, { waitUntil: "load" });
      await page.waitForTimeout(500);
      await page.evaluate(axeSource);
      const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(" ")}`));
      for (const v of violations) problems.push(`${path}: ${v}`);
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(problems, []);
});

test("the audit really detects a violation (the check is not vacuous)", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.setContent('<html lang="fr"><head><title>t</title></head><body><main><img src="x.png"><button></button></main></body></html>');
  await page.evaluate(axeSource);
  const ids = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map((v) => v.id));
  assert.ok(ids.includes("image-alt") && ids.includes("button-name"), ids.join(","));
  await context.close();
});
