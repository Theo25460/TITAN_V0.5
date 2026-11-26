// V1.7.5 — Analyse avancée par discipline, on the real Progrès › Semaine page: the three depth views (endurance on a comparable
// route, force per exercise and variant, escalade per grade scale) side by side with the period before, a real V1.7.4 training
// block and one session; missing values shown missing; history too short. History and block: the shared test set of Web and
// Android (tests/fixtures/discipline-analysis-v175.json); every reading must equal the shared expected output. Discovery account,
// local only, nothing is sent. Screenshots go to $DISCIPLINE_ANALYSIS_SHOTS when set.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/discipline-analysis-v175.json", import.meta.url), "utf8"));
const EXPECTED = JSON.parse(readFileSync(new URL("../fixtures/discipline-analysis-v175.expected.json", import.meta.url), "utf8"));
const SHOTS = process.env.DISCIPLINE_ANALYSIS_SHOTS || "";
const expected = (i) => EXPECTED.cases[i];
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

let server, browser, BASE;
before(async () => {
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { await browser?.close(); server?.kill(); });

async function open() {
  const context = await browser.newContext({ viewport: { width: 390, height: 2200 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(FIXTURE.now));
  await page.goto(BASE + "/stats");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id && window.TitanDisciplineAnalysisView && window.TitanData?.blocks);
  await page.evaluate(({ h, s }) => { window.state.history = h; window.state.user.schedule = s; window.dispatchEvent(new Event("titan:history-updated")); }, { h: FIXTURE.history, s: FIXTURE.schedule });
  await page.locator("[data-analysis]").waitFor();
  await page.selectOption("[data-analysis-weeks]", String(FIXTURE.weeks));
  return { context, page, errors };
}
const section = (page) => page.locator("[data-analysis]");
const reading = (page) => page.locator("[data-analysis-reading] li").evaluateAll((els) => els.map((e) => e.textContent));
const cell = (page, metric, n) => page.locator(`[data-analysis-table] tr[data-metric="${metric}"] td`).nth(n).textContent();
const shot = (page, name) => (SHOTS ? section(page).screenshot({ path: `${SHOTS}/${name}.png` }) : null);

test("endurance — long gravel outings: side by side with the period before, a real training block and one outing", async () => {
  const { context, page, errors } = await open();
  try {
    const s = section(page);
    assert.equal(await s.getAttribute("data-discipline"), "endurance");
    assert.equal(await page.locator("[data-analysis-sport]").inputValue(), "gravel");
    assert.equal(await page.locator("[data-analysis-group]").inputValue(), "endurance:g-c3");
    assert.equal(await s.getAttribute("data-signature"), expected(0).view.signature);
    assert.deepEqual(await reading(page), expected(0).reading);
    assert.match(await cell(page, "speed", 0), /^20,9 km\/h3\/4 séances · durée non saisie sur 1 séance$/);
    assert.match(await cell(page, "speed", 1), /^19,6 km\/h3\/3 séances$/);
    assert.equal(await cell(page, "speed", 2), "en progrès");
    assert.equal(await page.locator('tr[data-metric="hold"]').getAttribute("data-status"), "partial");
    // The outing without duration is a gap in the series, never filled in.
    assert.equal(await page.locator('[data-point="g-c4"]').getAttribute("class"), "wk-col is-gap");
    assert.match(await page.locator(".da-series .wk-values").textContent(), /7 nov\. : non mesurée/);
    // Every source session opens in the journal.
    assert.equal(await page.locator('tr[data-metric="speed"] [data-analysis-source="g-c1"]').getAttribute("href"), "/journal?session=g-c1");
    await shot(page, "web-endurance-period");

    await page.selectOption("[data-analysis-reference]", "block:blk-base");
    assert.deepEqual(await reading(page), expected(1).reading);
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-analysis-reference")), true, "the focus stays on the control");
    assert.equal(await cell(page, "hold", 2), "sans verdict");
    await shot(page, "web-endurance-block");

    await page.selectOption("[data-analysis-reference]", "session:g-r2");
    assert.deepEqual(await reading(page), expected(2).reading);
    await page.selectOption("[data-analysis-reference]", "session:g-road");
    assert.deepEqual(await reading(page), expected(3).reading);
    assert.equal(await page.locator("[data-analysis-reference-note]").textContent(), "La sortie du 10 nov. est sur un autre parcours (Route) : elle n’est pas comparable à ce groupe.");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("endurance — a history too short says its limit and shows only the values measured", async () => {
  const { context, page, errors } = await open();
  try {
    await page.selectOption("[data-analysis-sport]", "running");
    assert.equal(await section(page).getAttribute("data-status"), "insufficient");
    assert.deepEqual(await reading(page), expected(5).reading);
    assert.equal(await page.locator("[data-analysis-status-text]").textContent(), "Données insuffisantes pour une tendance");
    for (const m of ["hold", "regularity", "elevation", "avg_hr"]) {
      assert.equal(await page.locator(`tr[data-metric="${m}"]`).getAttribute("data-status"), "absent", m);
      assert.match(await cell(page, m, 0), /^—0\/1 séance · /, m);
    }
    await shot(page, "web-endurance-short");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("force — Squat (Barre) side by side, and a Squat (Front) session is not merged", async () => {
  const { context, page, errors } = await open();
  try {
    await page.click('[data-analysis-discipline="strength"]');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-analysis-discipline")), "strength");
    await page.selectOption("[data-analysis-weeks]", String(FIXTURE.weeks));
    assert.equal(await page.locator("[data-analysis-group]").inputValue(), "strength:muscu_gym|squat|barre|");
    assert.deepEqual(await reading(page), expected(6).reading);
    assert.match(await cell(page, "reference_set", 0), /^102,5 kg × 5/);
    assert.match(await cell(page, "reference_set", 1), /^95 kg × 5/);
    await shot(page, "web-strength-period");
    await page.selectOption("[data-analysis-reference]", "session:s-front");
    assert.deepEqual(await reading(page), expected(7).reading);
    assert.match(await page.locator("[data-analysis-reference-note]").textContent(), /deux variantes ne sont jamais fusionnées/);
    await shot(page, "web-strength-variant");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("escalade — attempts, successes and levels in Fontainebleau bloc; YDS shows only what is established", async () => {
  const { context, page, errors } = await open();
  try {
    await page.click('[data-analysis-discipline="climbing"]');
    await page.selectOption("[data-analysis-weeks]", String(FIXTURE.weeks));
    assert.deepEqual(await reading(page), expected(10).reading);
    const levels = await page.locator("[data-levels] tbody tr").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-level")));
    assert.deepEqual(levels, ["7A", "6C", "6B+", "6B", "6A+", "6A"]);
    assert.match(await cell(page, "success_rate", 0), /^61 % \(27\/44\)2\/3 séances · essais ou réussites non saisis sur 1 séance$/);
    await shot(page, "web-climbing-period");
    await page.selectOption("[data-analysis-reference]", "session:c-vscale");
    assert.deepEqual(await reading(page), expected(11).reading);
    await page.selectOption("[data-analysis-reference]", "period");
    await page.selectOption("[data-analysis-group]", "climbing:bouldering|YDS|bloc");
    assert.deepEqual(await reading(page), expected(12).reading);
    assert.equal(await page.locator("[data-levels]").count(), 0);
    assert.equal(await page.locator('tr[data-metric="best_done"]').count(), 0);
    await shot(page, "web-climbing-yds");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("accessibility: no WCAG 2.0/2.1 A or AA violation found by axe-core in the three filled views", async () => {
  const { context, page, errors } = await open();
  try {
    await page.evaluate(AXE);
    for (const d of ["endurance", "strength", "climbing"]) {
      await page.click(`[data-analysis-discipline="${d}"]`);
      const violations = await page.evaluate(async () => (await axe.run(document.querySelector("[data-analysis]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(" ")}`));
      assert.deepEqual(violations, [], d);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
