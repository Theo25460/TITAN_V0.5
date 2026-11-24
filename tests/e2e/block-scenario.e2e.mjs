// V1.7.6 — Scénarios multisports, in the real pages (Séance › Prévoir, Progrès › Semaine): two variants of four weeks inside the block
// « Cyclo 100 km » compared side by side (time per sport, free days, overlaps, milestones), drafts created and edited through the
// sheets without touching the active programme, availability of a week and a variant made to fit it, the chosen variant applied from
// an explicit Monday through its preview, undone, the decision read again at the bilan, and the state merged from the phone. Sessions,
// typical week and block: the shared test set of Web and Android (tests/fixtures/block-scenario-v176.json). Discovery account, local
// only, nothing is sent. Screenshots go to $BLOCK_SCENARIO_SHOTS when set.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const require = createRequire(import.meta.url);
for (const m of ["format.js", "../training-store.js", "sports-catalog.js", "sports.js"]) require(`../../js/core/${m}`);
globalThis.TitanSports.ensure();
const W = require("../../js/core/week-plan.js");
const B = require("../../js/core/training-block.js");
const S = require("../../js/core/block-scenario.js");
const { replay } = require("../../tools/block-scenario/replay.cjs");
const ROOT = new URL("../..", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/block-scenario-v176.json", import.meta.url), "utf8"));
const EXPECTED = JSON.parse(readFileSync(new URL("../fixtures/block-scenario-v176.expected.json", import.meta.url), "utf8"));
const SHOTS = process.env.BLOCK_SCENARIO_SHOTS || "";
const byName = (prefix) => FIXTURE.cases.find((c) => c.name.startsWith(prefix));
const state = (prefix) => replay(W, B, S, FIXTURE, byName(prefix));
const expected = (prefix) => EXPECTED.cases[byName(prefix).name];
const NOON = (day) => `${day}T11:00:00.000Z`;
const ID = "velo-badminton";

let server, browser, BASE;
before(async () => {
  const port = await new Promise((resolve) => { const probe = createServer(); probe.listen(0, () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(BASE + "/")).ok; } catch {} if (!ready) await new Promise((r) => setTimeout(r, 100)); }
  assert.ok(ready);
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
});
after(async () => { await browser?.close(); server?.kill(); });

async function open(path, { now, history = [], schedule = FIXTURE.type, pauses = [] }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 1800 }, timezoneId: "Europe/Paris", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id && window.TitanWeekPlan && window.TitanData?.scenarios);
  await page.evaluate(({ h, s, p }) => { window.state.history = h; window.state.user.schedule = s; window.state.user.cadencePauses = p; window.dispatchEvent(new Event("titan:history-updated")); }, { h: history, s: JSON.parse(JSON.stringify(schedule)), p: pauses });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { context, page, errors };
}
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const until = async (loc, re) => { for (let i = 0; i < 60; i++) { if (re.test(await flat(loc).catch(() => ""))) return flat(loc); await new Promise((r) => setTimeout(r, 50)); } return flat(loc); };
const sheet = (page) => page.locator("dialog[open]");
const settle = (page) => page.waitForFunction(() => !document.querySelector("dialog[open]"));
const stored = (page) => page.evaluate(() => JSON.stringify({ schedule: window.state.user.schedule, pauses: window.state.user.cadencePauses, history: window.state.history }));
const active = (page) => page.evaluate(() => { const s = window.state.user.schedule; return JSON.stringify({ blocks: s.blocks || null, weeks: s.weeks || null, revisions: s.revisions || null, tuesday: s.tuesday, thursday: s.thursday, saturday: s.saturday }); });
const shot = async (loc, path) => { if (!SHOTS) return; for (let i = 0; i < 8; i++) { try { await loc.screenshot({ path: `${SHOTS}/${path}`, timeout: 2000 }); return; } catch (e) { if (i === 7) throw e; await new Promise((r) => setTimeout(r, 250)); } } };
const noToasts = (page) => page.evaluate(() => document.querySelectorAll(".asc-toast").forEach((t) => t.remove()));
const card = (page, id = ID) => page.locator(`[data-scenario="${id}"]`).first();
/** The calendar as the page's own modules read it: each day's sport and minutes, week by week (the same projection as the replay). */
const calendarIn = (page, today) => page.evaluate(({ weeks, today }) => {
  const W = window.TitanWeekPlan; const out = {};
  for (const m of weeks) out[m] = W.reference(window.state.user.schedule, m, { current: W.weekOf(today) }).days.map((d) => (d ? `${d.sport}:${d.minutes ?? "?"}` : null));
  return out;
}, { weeks: FIXTURE.weeks, today });
const cell = (page, sport, col) => flat(card(page).locator(`tr[${sport.startsWith("row:") ? `data-row="${sport.slice(4)}"` : `data-sport="${sport}"`}] td${col === "active" ? ":nth-of-type(1)" : `[data-col="${col}"]`}`));

test("compare: two variants side by side on time per sport, free days, overlaps and milestones, with the hypotheses and the past", async () => {
  const res = state("1 —");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-24"), history: res.journal, schedule: res.schedule });
  try {
    const c = card(page);
    await c.waitFor();
    const head = await flat(c.locator("thead"));
    assert.match(head, /Actif A · Deux sorties longues B · Une longue et une courte Écart B − A/);
    assert.equal(await cell(page, "cycling", "active"), "12 h");
    assert.equal(await cell(page, "cycling", "a"), "24 h");
    assert.equal(await cell(page, "cycling", "b"), "12 h 30");
    assert.equal(await cell(page, "cycling", "delta"), "−11 h 30");
    assert.equal(await cell(page, "badminton", "a"), "—");
    assert.equal(await cell(page, "badminton", "delta"), "+2 h");
    assert.equal(await cell(page, "row:total", "delta"), "−11 h");
    assert.equal(await cell(page, "row:free", "b"), "18 jours libres");
    assert.equal(await cell(page, "row:conflicts", "active"), "5");
    assert.equal(await cell(page, "row:conflicts", "a"), "4");
    assert.equal(await cell(page, "row:conflicts", "b"), "1");
    assert.equal(await cell(page, "row:moved", "a"), "1");
    const conflictsB = await flat(c.locator('[data-conflicts="b"]'));
    assert.match(conflictsB, /Jeudi 10 décembre : Badminton prévu alors que ta décision déjà prise y place Escalade bloc/);
    assert.match(await flat(c.locator('[data-conflicts="a"]')), /Mercredi 16 décembre : Vélo prévu un jour où tu n’es pas disponible/);
    assert.match(await flat(c.locator('[data-milestone="m100"]')), /Sortie de 100 km · actif : semaine du lundi 14 décembre · A : semaine du lundi 7 décembre \(déplacé\) · B : semaine du lundi 14 décembre/);
    assert.match(await flat(c.locator('[data-week="2026-12-14"]')), /Disponible : lundi, mardi, vendredi, samedi, dimanche/);
    assert.match(await flat(c.locator('[data-week="2026-12-21"]')), /En pause .*B : Rien de prévu/);
    await c.locator("[data-scenario-observed] summary").click();
    assert.match(await flat(c.locator("[data-scenario-observed]")), /Vélo : 3 séances, 9 h 30 enregistrées/);
    await c.locator("[data-scenario-hypotheses] summary").click();
    assert.match(await flat(c.locator("[data-scenario-hypotheses]")), /Aucune estimation de forme, de fatigue ou de performance/);
    // The page shows the same comparison as the shared test set.
    const snap = await page.evaluate((id) => JSON.stringify(window.TitanBlockScenario.snapshot(window.TitanData.scenarioCompare(id))), ID);
    const { words, ...rest } = expected("1 —").compare[0];
    assert.deepEqual(JSON.parse(snap), rest);
    // Nothing overflows the phone width.
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), "the page scrolls sideways");
    await page.evaluate(() => document.activeElement?.blur());
    await shot(c, "web-compare.png");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("drafts: created and edited through the sheets, « Annuler » writes nothing, and the active programme never changes", async () => {
  const res = state("0 —");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-24"), history: res.journal, schedule: res.schedule });
  try {
    const before = await stored(page);
    const programme = await active(page);
    const calendar = await calendarIn(page, "2026-11-24");
    await page.locator('[data-sc-act="create"]').click();
    const d = sheet(page);
    await d.locator('[name="title"]').fill("Vélo ou badminton");
    await d.locator('[name="a"]').fill("Deux sorties longues");
    await d.locator('[name="b"]').fill("Une longue et une courte");
    assert.match(await until(d.locator("[data-sc-preview]"), /Cyclo 100 km/), /Les deux variantes partent de ton programme actif \(bloc « Cyclo 100 km »\) : tu les modifies ensuite, ton programme ne change pas\. Du lundi 30 novembre au dimanche 27 décembre/);
    await d.locator("[data-sc-cancel]").click();
    await settle(page);
    assert.equal(await stored(page), before);
    await page.locator('[data-sc-act="create"]').click();
    await d.locator('[name="title"]').fill("Vélo ou badminton");
    await d.locator('[name="a"]').fill("Deux sorties longues");
    await d.locator('[name="b"]').fill("Une longue et une courte");
    await d.locator('[data-start="2026-11-30"]').click();
    await d.locator("[data-sc-confirm]").click();
    await settle(page);
    await noToasts(page);
    const id = await page.evaluate(() => Object.keys(window.state.user.schedule.scenarios)[0]);
    // Variant A: Wednesday 2 h 30 and Saturday 3 h 30 of cycling, Thursday free, in every week.
    await card(page, id).locator('[data-sc-act="edit"][data-variant="a"]').click();
    await d.locator("#bs-d2").selectOption("cycling");
    await d.locator("#bs-m2").fill("150"); await d.locator("#bs-m2").dispatchEvent("change");
    await d.locator("#bs-d3").selectOption("");
    await d.locator("#bs-m5").fill("210"); await d.locator("#bs-m5").dispatchEvent("change");
    await d.locator('[data-place="m100"]').selectOption("1");
    const pv = await until(d.locator("[data-sc-preview]"), /Vélo : 24 h/);
    assert.match(pv, /Vélo : 24 h \(actif 12 h\)/);
    assert.match(pv, /Brouillon : ton programme actif ne change pas/);
    await shot(d, "web-edit-variant.png");
    await d.locator("[data-sc-confirm]").click();
    await settle(page);
    await noToasts(page);
    // Variant B: a short ride on Wednesday, the long one on Saturday.
    await card(page, id).locator('[data-sc-act="edit"][data-variant="b"]').click();
    await d.locator("#bs-d2").selectOption("cycling");
    await d.locator("#bs-m2").fill("60"); await d.locator("#bs-m2").dispatchEvent("change");
    await d.locator("#bs-m5").fill("210"); await d.locator("#bs-m5").dispatchEvent("change");
    await d.locator("[data-sc-confirm]").click();
    await settle(page);
    await noToasts(page);
    // The week of 21 December is a pause; B is made to fit it.
    await card(page, id).locator('[data-sc-act="avail"][data-week="3"]').click();
    await d.locator("[data-pause]").click();
    await d.locator("[data-sc-confirm]").click();
    await settle(page);
    await noToasts(page);
    await card(page, id).locator('[data-sc-act="fit"][data-variant="b"][data-week="3"]').click();
    await noToasts(page);
    const sc = await page.evaluate((x) => window.state.user.schedule.scenarios[x], id);
    const days = (v) => v.weeks.map((w) => w.days.map((x) => (x ? `${x.sport}:${x.minutes}` : null)));
    const want = state("1 —").schedule.scenarios[ID];
    assert.deepEqual(days(sc.variants.a), days(want.variants.a));
    assert.deepEqual(days(sc.variants.b).slice(0, 2), days(want.variants.b).slice(0, 2));
    assert.deepEqual(days(sc.variants.b)[3], [null, null, null, null, null, null, null]);
    assert.equal(sc.variants.a.place.m100, 1);
    // All of this is draft: the block, the decisions, the typical week and every calendar are exactly as before.
    assert.equal(await active(page), programme);
    assert.deepEqual(await calendarIn(page, "2026-11-24"), calendar);
    assert.match(await flat(card(page, id).locator('[data-row="conflicts"]')), /Chevauchements 4 3 1/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("apply « Une longue et une courte » from Monday 30 November: preview, « Annuler » writes nothing, the calendar after", async () => {
  const res = state("1 —");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-24"), history: res.journal, schedule: res.schedule });
  try {
    const before = await stored(page);
    const calBefore = await calendarIn(page, "2026-11-24");
    assert.deepEqual(calBefore, expected("0 —").calendar);
    await card(page).locator('[data-sc-act="apply"][data-variant="b"]').click();
    const d = sheet(page);
    // The current week cannot be chosen; the first open Monday is.
    assert.equal(await d.locator('[data-from="2026-11-30"]').getAttribute("aria-pressed"), "true");
    const pv = await until(d.locator("[data-sc-preview]"), /S’applique/);
    assert.match(pv, /Semaine du lundi 30 novembre : Semaine 5 → Semaine 5 · scénario B/);
    assert.match(pv, /Mercredi : libre → Vélo 1 h/);
    assert.match(pv, /Semaine du lundi 21 décembre : Semaine 8 → Semaine 8 · scénario B .*Samedi : Vélo 3 h → libre/);
    assert.match(pv, /9 occurrences touchées : 2 ajoutées, 4 retirées, 3 modifiées/);
    assert.match(pv, /jeudi 10 décembre|mardi 8 décembre \(elle place une séance un jour déjà occupé\)/);
    assert.match(pv, /Tes séances restent au journal \(9 séances comptées/);
    assert.match(pv, /S’applique à partir du lundi 30 novembre/);
    await shot(d, "web-apply-preview.png");
    await d.locator("[data-sc-cancel]").click();
    await settle(page);
    assert.equal(await stored(page), before);
    await card(page).locator('[data-sc-act="apply"][data-variant="b"]').click();
    await until(d.locator("[data-sc-preview]"), /S’applique/);
    await d.locator("[data-sc-confirm]").click();
    await settle(page);
    await noToasts(page);
    // After: the four weeks of the period follow B, every other week is unchanged, the journal is the same.
    assert.deepEqual(await calendarIn(page, "2026-11-24"), expected("3 —").calendar);
    const after = JSON.parse(await stored(page));
    assert.deepEqual(after.history, JSON.parse(before).history);
    assert.match(await flat(card(page).locator("[data-scenario-status]")), /« Une longue et une courte » appliqué le mardi 24 novembre à partir du lundi 30 novembre/);
    // The planning reads it: Prévu et réalisé of the week of 30 November.
    const wk = await page.evaluate(() => window.TitanWeekPlan.snapshot(window.TitanData.weekPlan("2026-11-30")));
    assert.deepEqual(wk.reference.days, [null, "bouldering", "cycling", "badminton", null, "cycling", null]);
    await shot(card(page), "web-applied.png");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("undo on Thursday 26 November: the plan before comes back, week by week, and the sessions stay", async () => {
  const res = state("3 —");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-26"), history: res.journal, schedule: res.schedule });
  try {
    const before = JSON.parse(await stored(page));
    await card(page).locator('[data-sc-act="undo"]').click();
    const d = sheet(page);
    const pv = await until(d.locator("[data-sc-preview]"), /revient/);
    assert.match(pv, /Semaine du lundi 30 novembre : Semaine 5 · scénario B → Semaine 5/);
    assert.match(pv, /Le programme d’avant revient à partir du lundi 30 novembre/);
    await shot(d, "web-undo-preview.png");
    await d.locator("[data-sc-confirm]").click();
    await settle(page);
    await noToasts(page);
    assert.deepEqual(await calendarIn(page, "2026-11-26"), expected("4 bis").calendar);
    assert.deepEqual(JSON.parse(await stored(page)).history, before.history);
    const weeks = await page.evaluate(() => ["2026-11-30", "2026-12-07"].map((w) => { const s = window.TitanWeekPlan.snapshot(window.TitanData.weekPlan(w)); return { days: s.reference.days, occurrences: s.occurrences, summary: s.summary }; }));
    assert.deepEqual(weeks, expected("4 bis").weeks.map((s) => ({ days: s.reference.days, occurrences: s.occurrences, summary: s.summary })));
    assert.match(await flat(card(page).locator("[data-scenario-status]")), /annulé le jeudi 26 novembre : le programme d’avant est revenu à partir du lundi 30 novembre/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the next bilan: Progrès › Semaine of the week of 30 November reads the decision and what was done", async () => {
  const res = state("6 —");
  const { context, page, errors } = await open("/stats", { now: "2026-12-06T17:00:00.000Z", history: res.journal, schedule: res.schedule });
  try {
    const ctx = page.locator('[data-scenario-context="velo-badminton"]');
    await ctx.waitFor();
    const text = await flat(ctx);
    assert.match(text, /Scénario « Une longue et une courte » \(Vélo ou badminton\) appliqué le mardi 24 novembre à partir du lundi 30 novembre/);
    assert.match(text, /Prévu : Badminton 1 h · Escalade bloc 1 h 30 · Vélo 4 h 30/);
    assert.match(text, /Fait : Badminton 55 min · Escalade bloc 1 h 30 · Vélo 4 h 40/);
    assert.match(text, /4\/4 faites, 0 écart/);
    const block = await flat(page.locator('[data-block-context="cyclo-100"]'));
    assert.match(block, /Scénario appliqué le mardi 24 novembre/);
    assert.match(block, /cette semaine passe de « Semaine 5 » à « Semaine 5 · scénario B »/);
    await shot(ctx, "web-bilan-scenario.png");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the state merged from the phone: an undo made on the phone is read on the website", async () => {
  const res = state("11 —");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-25"), history: res.journal, schedule: res.other.schedule });
  try {
    assert.match(await flat(card(page).locator("[data-scenario-status]")), /annulé le mercredi 25 novembre/);
    assert.deepEqual(await calendarIn(page, "2026-11-25"), expected("11 —").calendar);
    assert.deepEqual(await calendarIn(page, "2026-11-25"), expected("0 —").calendar);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
