// Stats: the weekly recap by discipline and against the same days of the week before (COM-B8). Local history only, nothing is sent.
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

test("weekly detail: disciplines keep their own units, the comparison is honest, and it follows the week chosen", async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
    await page.goto(BASE + "/stats");
    await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
    await page.locator("#wk-title").waitFor();
    await page.evaluate(() => {
      window.state.history = [
        { id: "a", sport: "running", date: "2026-10-06T08:00:00Z", val: 8, unit: "km", details: { duration: 50 } },
        { id: "b", sport: "running", date: "2026-10-12T08:00:00Z", val: 10, unit: "km", details: { duration: 60 } },
        { id: "c", sport: "yoga", date: "2026-10-14T08:00:00Z", val: 45, unit: "min", details: { duration: 45 } },
      ];
      window.dispatchEvent(new Event("titan:history-updated"));
    });
    const detail = page.locator("[data-week-detail]");
    await detail.waitFor();
    assert.match(await page.locator("[data-week-comparison]").innerText(), /Course.*1 h.*50 min.*au même moment/);
    // The optional weekly quest (server) is told in the recap of the week in progress only.
    await page.evaluate(() => {
      const week = { scope: "week", kind: "constancy", target: { days: 3 }, progress: { days: 2 }, complete: false, claimed: false };
      window.titanClient.rpc = (name) => { const r = Promise.resolve(name === "titan_periodic_quests_v1" ? { data: { week, month: { ...week, scope: "month", kind: "regularity", target: { days: 12 }, progress: { days: 4 } }, souvenirs: {} }, error: null } : { data: null, error: { code: "PGRST202", message: "Could not find" } }); r.setHeader = () => r; return r; };
      window.state.user.id = "00000000-0000-4000-8000-000000000951";
      return window.TitanPeriodicQuests.refresh(true);
    });
    await page.waitForFunction(() => /Quête de la semaine, facultative/.test(document.querySelector("[data-week-detail]")?.innerText || ""));
    assert.match((await page.locator("[data-week-quest]").innerText()).replace(/\s+/g, " "), /Garder ton rythme : 2\/3 jours/);
    const text = (await detail.innerText()).replace(/\s+/g, " ");
    assert.match(text, /Par discipline/);
    assert.match(text, /2 séances|1 séance/);
    assert.match(text, /10 km/);
    assert.doesNotMatch(text, /55 km/, "time is the common measure; kilometres are only shown for distance sports");
    assert.match(text, /Semaine en cours/);
    assert.match(text, /de plus|de moins|même rythme/);
    await page.getByRole("button", { name: "Semaine précédente", exact: true }).click();
    await page.waitForFunction(() => /8 km/.test(document.querySelector("[data-week-detail]")?.innerText || ""));
    assert.equal(await page.locator("[data-week-quest]").count(), 0, "an older week says nothing about the quest");
    assert.doesNotMatch((await page.locator("[data-week-detail]").innerText()), /Semaine en cours/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
    const axe = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
    assert.deepEqual(axe, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the planner can pause and resume this week's cadence without changing the journal", async () => {
  const context = await browser.newContext({ timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  try {
    await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
    await page.goto(BASE + "/prevoir");
    await page.locator(".pv-week").waitFor();
    const history = await page.evaluate(() => JSON.stringify(window.state.history));
    await page.getByRole("button", { name: "Mettre la cadence en pause" }).click({ timeout: 3000 });
    await page.getByRole("heading", { name: "Cadence en pause" }).waitFor({ state: "visible" });
    assert.deepEqual(await page.evaluate(() => window.TitanData.cadenceSettings().pauses), ["2026-10-12"]);
    await page.getByRole("button", { name: "Reprendre la cadence" }).click();
    await page.getByRole("button", { name: "Mettre la cadence en pause" }).waitFor({ state: "visible" });
    assert.deepEqual(await page.evaluate(() => window.TitanData.cadenceSettings().pauses), []);
    assert.equal(await page.evaluate(() => JSON.stringify(window.state.history)), history);
  } finally { await context.close(); }
});
