// V1.7.1 — Comparaisons justes, in the journal sheet: the rule applied, the sample, the sources (each opens its own sheet), the
// sessions set aside and why, and a precise limit when the data is missing. History: the shared test set of Web and Android
// (tests/fixtures/comparables-v171.json). Local history only, nothing is sent. Screenshots go to $COMPARABLES_SHOTS when set.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/comparables-v171.json", import.meta.url), "utf8"));
const EXPECTED = JSON.parse(readFileSync(new URL("../fixtures/comparables-v171.expected.json", import.meta.url), "utf8"));
const SHOTS = process.env.COMPARABLES_SHOTS || "";
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

async function open() {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "UTC", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(FIXTURE.now));
  await page.goto(BASE + "/journal");
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id);
  await page.evaluate((h) => { window.state.history = h; window.dispatchEvent(new Event("titan:history-updated")); }, FIXTURE.history);
  return { context, page, errors };
}
const sheet = (page) => page.locator("dialog[open] [data-comparison]");
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

test("a conclusive run: the rule, the three road runs kept, the trail and the hilly run set aside, a source opens its sheet", async () => {
  const { context, page, errors } = await open();
  try {
    await page.locator('[data-open="run-today"]').first().click();
    const block = sheet(page);
    await block.waitFor();
    assert.equal(await block.getAttribute("data-status"), "ok");
    await block.locator("[data-comparables] summary").click();
    const text = await flat(block);
    assert.match(text, /Par rapport à ta séance du 1 novembre/);
    assert.match(text, /Allure 5:12 \/km avant 5:27 \/km · en progrès/);
    assert.match(text, /Médiane de tes 3 séances retenues : 5:31 \/km/);
    assert.match(text, /Règle appliquée · Distance voisine et même parcours \(Route\) \(règles 2026\.11-v1\)/);
    assert.match(text, /Parcours \(Surface\) : Route/);
    assert.match(text, /Échantillon · 3 séances retenues sur 10 examinées/);
    assert.match(text, /autre parcours \(Chemin\)/);
    assert.match(text, /dénivelé trop différent \(38 m\/km contre 4\)/);
    assert.match(text, /Non prises en compte : 1 en attente d’envoi, 1 en vérification/);
    assert.equal(await block.locator("[data-rule]").getAttribute("data-rule"), "distance.taille-parcours@2026.11-v1");
    // The sources listed are exactly the shared expected ones, in the same order (the Android test checks the same file).
    const ids = await block.locator("[data-retained] [data-open-source]").evaluateAll((els) => els.map((e) => e.getAttribute("data-open-source")));
    assert.deepEqual(ids, EXPECTED.cases["run-today"].selection.retained.map((r) => r.id));
    if (SHOTS) { await page.setViewportSize({ width: 390, height: 2400 }); await block.screenshot({ path: `${SHOTS}/web-run-today.png` }); }
    await block.locator('[data-retained] [data-open-source="run-road-3"]').click();
    await page.waitForFunction(() => /10,1 km|10\.1 km/.test(document.querySelector("dialog[open]")?.innerText || "") && /1 novembre/.test(document.querySelector("dialog[open]")?.innerText || ""));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("strength and climbing: homonymous exercise variants and a second scale are set aside with their reason", async () => {
  const { context, page, errors } = await open();
  try {
    await page.locator('[data-open="lift-today"]').first().click();
    let block = sheet(page);
    await block.waitFor();
    await block.locator("[data-comparables] summary").click();
    let text = await flat(block);
    assert.match(text, /Même exercice, même variante et même matériel : Squat \(Barre\)/);
    assert.match(text, /même nom, autre variante \(Squat · Front\)/);
    assert.match(text, /variante non renseignée \(squat · sans variante\)/);
    assert.match(text, /séries non mesurées/);
    assert.match(text, /2 séances retenues sur 6 examinées/);
    await page.keyboard.press("Escape");
    await page.locator('[data-open="boulder-today"]').first().click();
    block = sheet(page);
    await block.waitFor();
    await block.locator("[data-comparables] summary").click();
    text = await flat(block);
    assert.match(text, /Meilleure cotation réussie 6B\+ avant 6B · en progrès/);
    assert.match(text, /autre échelle de cotation \(V-scale bloc\)/);
    assert.match(text, /aucune réussite cotée \(tentée 7A\)/);
    assert.match(text, /TITAN ne convertit pas les cotations/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the limit of the data is said precisely: an unknown scale, a run without duration, a run without route", async () => {
  const { context, page, errors } = await open();
  try {
    await page.locator('[data-open="boulder-yds"]').first().click();
    let block = sheet(page);
    await block.waitFor();
    assert.equal(await block.getAttribute("data-status"), "insufficient");
    let text = await flat(block);
    assert.match(text, /Comparaison · données insuffisantes/);
    assert.match(text, /TITAN ne sait pas ordonner les cotations de l’échelle « YDS »/);
    assert.doesNotMatch(text, /Par rapport à ta séance/);
    if (SHOTS) await block.screenshot({ path: `${SHOTS}/web-boulder-yds.png` });
    await page.keyboard.press("Escape");
    await page.locator('[data-open="run-noduration"]').first().click();
    block = sheet(page);
    await block.waitFor();
    text = await flat(block);
    assert.match(text, /Sans durée saisie, TITAN ne compare rien : la durée de 60 min est une estimation pour l’XP, jamais comparée/);
    await page.keyboard.press("Escape");
    await page.locator('[data-open="run-plain"]').first().click();
    block = sheet(page);
    await block.waitFor();
    assert.equal(await block.getAttribute("data-status"), "limited");
    text = await flat(block);
    assert.match(text, /Comparaison élargie/);
    assert.match(text, /Le parcours de cette séance n’est pas renseigné \(Surface\)/);
    if (SHOTS) await block.screenshot({ path: `${SHOTS}/web-run-plain.png` });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
