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


async function qg(history, favorites = []) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-11-12T12:00:00Z"));
  await page.goto(BASE + "/aujourdhui");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.state?.user);
  await page.evaluate(({ history, favorites }) => {
    window.state.user.favoriteSports = favorites;
    window.state.history = history;
    window.dispatchEvent(new Event("titan:history-updated"));
  }, { history, favorites });
  return { page, context };
}
const log = (id, sport, day) => ({ id, sport, date: `2026-11-${day}T08:00:00Z`, val: 30, unit: "min", details: { duration: 30 } });

test("shortcuts: recent sports first, then favourites, at most four, each one opens a session of that sport", async () => {
  const { page, context } = await qg([log("a", "swimming", "01"), log("b", "boxing", "05"), log("c", "football", "09")], ["swimming", "tennis", "boxing", "basketball"]);
  try {
    const chips = page.locator("section[aria-labelledby=qg-sports] a");
    await chips.first().waitFor();
    assert.equal(await chips.count(), 4);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(700);
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`)));
    assert.deepEqual(axe, []);
    const hrefs = await chips.evaluateAll(a => a.map(x => x.getAttribute("href")));
    assert.deepEqual(hrefs, ["/training?sport=football", "/training?sport=boxing", "/training?sport=swimming", "/training?sport=tennis"]);
    await chips.first().click();
    await page.waitForURL(/\/training\?sport=football/);
  } finally { await context.close(); }
});

test("shortcuts: nothing is shown until there is a sport to show", async () => {
  const { page, context } = await qg([], []);
  try {
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#qg-sports").count(), 0);
  } finally { await context.close(); }
});
