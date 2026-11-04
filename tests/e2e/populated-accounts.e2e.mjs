// QG: last month's report is offered once in the first week of a month, dismissible, and opens the previous month.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });


// QA06 / UX09: an established, strongly multisport account (about 400 sessions over a year, a dozen sports) on every main screen:
// no page error, readable (axe WCAG A and AA, animations off) and quick enough on a phone-sized machine.
async function populated(path, { count = Number(process.env.POP_COUNT || 400), width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "Europe/Paris", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-29T10:00:00Z"));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const started = Date.now();
  await page.evaluate(n => {
    const sports = Object.keys(window.SPORTS_CONFIG).slice(0, 12);
    const day = 86400000, now = new Date("2026-10-29T08:00:00Z").getTime();
    window.state.history = Array.from({ length: n }, (_, i) => {
      const sport = sports[i % sports.length], minutes = 25 + ((i * 7) % 80);
      return { id: `p${i}`, sport, date: new Date(now - Math.floor(i * 365 / n) * day - (i % 5) * 3600000).toISOString(), val: minutes, unit: "min", xp: 20 + (i % 40), details: { duration: minutes, rpe: 3 + (i % 6) } };
    });
    window.dispatchEvent(new Event("titan:history-updated"));
  }, count);
  await page.waitForTimeout(1200);
  return { page, context, errors, ms: Date.now() - started };
}
const axeViolations = page => page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`)));

for (const [path, ready] of [["/aujourdhui", "#qg-ascent"], ["/stats", "#wk-month-title"], ["/profile", "[data-title-block], #adn"], ["/journal", "main"], ["/records", "main"], ["/objectifs", "main"], ["/prevoir", "main"], ["/adventure", "main"]]) {
  test(`populated account on ${path}: no error, nothing unreadable, and drawn quickly`, async () => {
    const { page, context, errors, ms } = await populated(path);
    try {
      await page.locator(ready).first().waitFor({ timeout: 8000 });
      assert.ok(ms < 6000, `${path} took ${ms} ms to take 400 sessions in`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll");
      await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
      assert.deepEqual(await axeViolations(page), []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
