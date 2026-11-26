// V1.7.4 — Objectifs et blocs d’entraînement, in the real pages (Séance › Prévoir, Progrès › Semaine, the QG): a six-week block on two
// sports created from a model with two milestones chosen, a paused week then a shift of one week through its preview, a milestone
// changed, the bilan that shows the source and the effect of the changes, a block created then removed over past sessions, and the
// state merged from the phone. Sessions and typical week: the shared test set of Web and Android (tests/fixtures/training-block-v174.json).
// Discovery account, local only, nothing is sent. Screenshots go to $TRAINING_BLOCK_SHOTS when set.
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
const { replay } = require("../../tools/training-block/replay.cjs");
const ROOT = new URL("../..", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/training-block-v174.json", import.meta.url), "utf8"));
const EXPECTED = JSON.parse(readFileSync(new URL("../fixtures/training-block-v174.expected.json", import.meta.url), "utf8"));
const SHOTS = process.env.TRAINING_BLOCK_SHOTS || "";
const byName = (prefix) => FIXTURE.cases.find((c) => c.name.startsWith(prefix));
const state = (prefix, ops) => replay(W, B, FIXTURE, { ...byName(prefix), ...(ops ? { ops } : {}) });
const NOON = (day) => `${day}T11:00:00.000Z`;

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

async function open(path, { now, history = [], schedule = FIXTURE.type, pauses = [] }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 1800 }, timezoneId: "Europe/Paris", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id && window.TitanWeekPlan && window.TitanData?.blocks);
  await page.evaluate(({ h, s, p }) => { window.state.history = h; window.state.user.schedule = s; window.state.user.cadencePauses = p; window.dispatchEvent(new Event("titan:history-updated")); }, { h: history, s: JSON.parse(JSON.stringify(schedule)), p: pauses });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { context, page, errors };
}
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const until = async (loc, re) => { for (let i = 0; i < 60; i++) { if (re.test(await flat(loc).catch(() => ""))) return flat(loc); await new Promise((r) => setTimeout(r, 50)); } return flat(loc); };
const sheet = (page) => page.locator("dialog[open]");
const settle = (page) => page.waitForFunction(() => !document.querySelector("dialog[open]"));
const stored = (page) => page.evaluate(() => JSON.stringify({ schedule: window.state.user.schedule, pauses: window.state.user.cadencePauses, history: window.state.history }));
const shot = async (loc, path) => { if (!SHOTS) return; for (let i = 0; i < 8; i++) { try { await loc.screenshot({ path: `${SHOTS}/${path}`, timeout: 2000 }); return; } catch (e) { if (i === 7) throw e; await new Promise((r) => setTimeout(r, 250)); } } };
const noToasts = (page) => page.evaluate(() => document.querySelectorAll(".asc-toast").forEach((t) => t.remove()));
const card = (page, id = "gravel-90") => page.locator(`[data-block="${id}"]`).first();
/** The week as the page's own modules read it (V1.7.2 projection), to compare before and after a change. */
const weekIn = (page, week) => page.evaluate((w) => JSON.stringify(window.TitanWeekPlan.snapshot(window.TitanData.weekPlan(w))), week);
const viewIn = (page, id = "gravel-90") => page.evaluate((x) => JSON.stringify(window.TitanTrainingBlock.snapshot(window.TitanData.blocks().find((b) => b.id === x))), id);
const expectedBlock = (prefix, id = "gravel-90") => { const c = EXPECTED.cases[byName(prefix).name]; const { words, conflict, ...rest } = c.blocks.find((b) => b.id === id); return rest; };

test("create: six weeks on two sports from the model « sortie longue », two milestones chosen, the preview before anything is written", async () => {
  const { context, page, errors } = await open("/prevoir", { now: "2026-11-01T17:00:00.000Z" });
  try {
    const before = await stored(page);
    await page.locator('[data-block-act="create"]').click();
    const d = sheet(page);
    await d.locator('[data-tpl="endurance"]').click();
    await d.locator('[name="title"]').fill("Gravel 90 km");
    await d.locator('[name="intent"]').fill("Préparer une sortie gravel de 90 km en gardant une séance de bloc par semaine.");
    await d.locator('[name="sport"]').selectOption("gravel");
    await d.locator('[name="start"]').fill("2026-11-02");
    await d.locator('[name="start"]').dispatchEvent("change");
    await d.locator('[name="peak"]').fill("300");
    await d.locator('[name="goalTitle"]').fill("Sortie gravel de 90 km");
    await d.locator('[name="goalDate"]').fill("2026-12-12");
    await d.locator('[name="goalDate"]').dispatchEvent("change");
    await d.locator('[name="goalTarget"]').fill("90");
    await d.locator('[name="goalSport"]').selectOption("gravel");
    // The suggested milestones follow the goal: 54 km and 72 km, the two first ticked; the bouldering and the declared action are not.
    const picks = await until(d.locator(".wr-field").last(), /Sortie de 54 km.*Sortie de 72 km/);
    assert.match(picks, /Sortie de 54 km · Semaine 3/);
    assert.match(picks, /Sortie de 72 km · Semaine 5/);
    assert.deepEqual(await d.locator("[data-pick-ms]").evaluateAll((l) => l.map((x) => x.checked)), [true, true, false, false]);
    const pv = await until(d.locator("[data-block-preview]"), /Semaine 6/);
    assert.match(pv, /Semaine du lundi 2 novembre : semaine type → Semaine 1/);
    assert.match(pv, /Semaine du lundi 23 novembre : semaine type → Semaine 4 · allégée/);
    assert.match(pv, /Jalon « Sortie de 54 km » : semaine du lundi 16 novembre/);
    assert.match(pv, /garde son échéance du samedi 12 décembre/);
    await shot(d, "web-create-preview.png");
    // « Annuler » writes nothing.
    await d.locator("[data-block-cancel]").click();
    await settle(page);
    assert.equal(await stored(page), before);
    // Again, and confirm (the form starts over).
    await page.locator('[data-block-act="create"]').click();
    await d.locator('[name="title"]').fill("Gravel 90 km");
    await d.locator('[name="sport"]').selectOption("gravel");
    await d.locator('[name="start"]').fill("2026-11-02"); await d.locator('[name="start"]').dispatchEvent("change");
    await d.locator('[name="peak"]').fill("300");
    await d.locator('[name="goalTitle"]').fill("Sortie gravel de 90 km");
    await d.locator('[name="goalDate"]').fill("2026-12-12"); await d.locator('[name="goalDate"]').dispatchEvent("change");
    await d.locator('[name="goalTarget"]').fill("90");
    await d.locator('[name="goalSport"]').selectOption("gravel");
    await until(d.locator("[data-block-preview]"), /Sortie de 72 km/);
    await d.locator("[data-block-confirm]").click();
    await settle(page);
    const s = JSON.parse(await stored(page)).schedule;
    const id = Object.keys(s.blocks)[0];
    const lay = Object.values(s.blocks[id].layouts)[0];
    assert.equal(lay.start, "2026-11-02");
    assert.deepEqual(lay.weeks.map((w) => w.days[5].minutes), [180, 205, 230, 175, 275, 300]);
    assert.ok(lay.weeks.every((w) => w.days[1].sport === "bouldering"));
    assert.deepEqual(Object.values(s.blocks[id].milestones).map((m) => [m.title, m.target]), [["Sortie de 54 km", 54], ["Sortie de 72 km", 72]]);
    // Same block as the module builds from the shared test set (the athlete's choices give the same weeks and milestones).
    assert.deepEqual(lay.weeks.map((w) => w.days), FIXTURE.cases[0].ops[0].input.weeks.map((w) => w.days));
    const text = await until(card(page, id), /Semaine 6/);
    assert.match(text, /Commence le lundi 2 novembre/);
    assert.match(text, /Objectif : Sortie gravel de 90 km/);
    await noToasts(page);
    await shot(card(page, id), "web-created.png");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a paused week, then a shift of one week through its preview: « Annuler » writes nothing; confirmed, closed weeks and this week stay as they were", async () => {
  const res = state("3 bis");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-24"), history: res.journal, schedule: res.schedule, pauses: res.pauses });
  try {
    const closed = {};
    for (const w of ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]) closed[w] = await weekIn(page, w);
    const before = await stored(page);
    await card(page).locator('[data-block-act="shift"]').click();
    const d = sheet(page);
    // Only the weeks that have not begun can be chosen: the first one is the week of 30 November (week 5).
    assert.deepEqual(await d.locator("[data-index]").evaluateAll((l) => l.map((x) => x.dataset.index)), ["4", "5"]);
    await d.locator('[data-index="4"]').click();
    await d.locator('[data-shift="1"]').click();
    const pv = await until(d.locator("[data-block-preview]"), /Report/);
    assert.match(pv, /Semaine du lundi 30 novembre : Semaine 5 → Report · reprend la semaine 4/);
    assert.match(pv, /Semaine du lundi 7 décembre : Semaine 6 → Semaine 5/);
    assert.match(pv, /Jalon « Sortie de 72 km » : semaine du lundi 30 novembre → semaine du lundi 7 décembre/);
    assert.match(pv, /3 semaines closes gardent leur programme et leurs séances ; la semaine en cours garde son programme de départ/);
    assert.match(pv, /La dernière semaine du bloc commence après cette échéance/);
    assert.match(pv, /La pause reste sur sa semaine : semaine du lundi 23 novembre/);
    assert.match(pv, /1 décision déjà prise sur une semaine à venir reste valable/);
    await shot(d, "web-shift-preview.png");
    await d.locator("[data-block-cancel]").click();
    await settle(page);
    assert.equal(await stored(page), before);
    await card(page).locator('[data-block-act="shift"]').click();
    await d.locator('[data-index="4"]').click();
    await until(d.locator("[data-block-preview]"), /Report/);
    await d.locator("[data-block-confirm]").click();
    await settle(page);
    // The block the page wrote is the block of the shared test set (case 3), week by week, milestone by milestone.
    const { log, signature, ...got } = JSON.parse(await viewIn(page));
    const { log: l2, signature: s2, ...want } = expectedBlock("3 —");
    assert.deepEqual(got, want);
    for (const [w, v] of Object.entries(closed)) assert.equal(await weekIn(page, w), v, `the week of ${w} is unchanged`);
    assert.equal(JSON.parse(await stored(page)).history.length, res.journal.length);
    assert.deepEqual(JSON.parse(await stored(page)).history, res.journal);
    const text = await until(card(page), /Report · reprend la semaine 4/);
    assert.match(text, /Semaine 4 · allégée · 4ᵉ semaine sur 7/);
    await noToasts(page);
    await shot(card(page), "web-shifted.png");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a milestone changed after its preview; a reached milestone offers no change", async () => {
  const res = state("3 —");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-26"), history: res.journal, schedule: res.schedule, pauses: res.pauses });
  try {
    assert.equal(await card(page).locator('[data-block-milestone="j1"] [data-block-act="milestone"]').count(), 0);
    assert.match(await flat(card(page).locator('[data-block-milestone="j1"]')), /Atteint le samedi 21 novembre/);
    await card(page).locator('[data-block-milestone="j2"] [data-block-act="milestone"]').click();
    const d = sheet(page);
    await d.locator('[name="msTitle"]').fill("Sortie de 75 km");
    await d.locator('[name="msTarget"]').fill("75");
    const pv = await until(d.locator("[data-block-preview]"), /75 km/);
    assert.match(pv, /Jalon « Sortie de 75 km » : Une séance Gravel d’au moins 72 km → Une séance Gravel d’au moins 75 km/);
    await d.locator("[data-block-confirm]").click();
    await settle(page);
    const s = JSON.parse(await stored(page)).schedule;
    assert.equal(s.blocks["gravel-90"].milestones.j2.target, 75);
    assert.match(await until(card(page).locator('[data-block-milestone="j2"]'), /75 km/), /semaine du lundi 7 décembre/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the bilan of the week (Progrès › Semaine): the week of the block, the source and the effect of the shift, the milestone reached", async () => {
  const res = state("5 —");
  const { context, page, errors } = await open("/stats", { now: "2026-12-13T17:00:00.000Z", history: res.journal, schedule: res.schedule, pauses: res.pauses });
  try {
    const ctx = page.locator('[data-block-context="gravel-90"]');
    const text = await until(ctx, /Bloc décalé/);
    assert.match(text, /Cette semaine est « Semaine 5 » du bloc « Gravel 90 km » \(6ᵉ sur 7\)/);
    assert.match(text, /Bloc décalé le mardi 24 novembre/);
    assert.match(text, /Cette semaine passe de « Semaine 6 » à « Semaine 5 » ; le jalon « Sortie de 72 km » passe de la semaine du lundi 30 novembre à celle du lundi 7 décembre/);
    assert.match(text, /Jalon modifié le jeudi 26 novembre/);
    assert.match(text, /Sortie de 75 km.*Atteint le samedi 12 décembre/);
    assert.match(text, /Atteint le samedi 12 décembre/);
    assert.equal(await ctx.locator('[data-block-session="grav-6b"]').count(), 1);
    // The plan of the week says where its programme comes from.
    assert.match(await flat(page.locator('[data-week-plan="2026-12-07"]')), /Programme de départ : « Semaine 5 » du bloc « Gravel 90 km »/);
    await shot(ctx, "web-bilan-block.png");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a block created over past sessions applies only to the weeks to come; removed after its preview, the journal and the weeks are as before", async () => {
  const res = state("8 bis");
  const routine = byName("7 —").ops[0].input;
  const { context, page, errors } = await open("/prevoir", { now: "2026-11-22T19:00:00.000Z", history: res.journal, schedule: res.schedule });
  try {
    const weeks = {};
    for (const w of ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]) weeks[w] = await weekIn(page, w);
    const journal = JSON.stringify(JSON.parse(await stored(page)).history);
    await page.locator('[data-block-act="create"]').click();
    const d = sheet(page);
    await d.locator('[data-tpl="routine"]').click();
    await d.locator('[name="title"]').fill(routine.title);
    await d.locator('[name="start"]').fill("2026-11-02"); await d.locator('[name="start"]').dispatchEvent("change");
    await d.locator('[name="weeks"]').fill("4"); await d.locator('[name="weeks"]').dispatchEvent("change");
    await d.locator('[name="goalTitle"]').fill(routine.goal.title);
    await d.locator('[name="goalDate"]').fill(routine.goal.date); await d.locator('[name="goalDate"]').dispatchEvent("change");
    await d.locator('[name="goalMetric"]').selectOption("sessions");
    await d.locator('[name="goalTarget"]').fill("8");
    await d.locator('[name="goalSport"]').selectOption("bouldering");
    const pv = await until(d.locator("[data-block-preview]"), /S’applique/);
    assert.match(pv, /Semaine du lundi 23 novembre : semaine type → Semaine 4/);
    assert.doesNotMatch(pv, /Semaine du lundi 2 novembre :/);
    assert.match(pv, /2 semaines closes gardent leur programme et leurs séances ; la semaine en cours garde son programme de départ/);
    assert.match(pv, /S’applique à partir du lundi 23 novembre/);
    await d.locator("[data-block-confirm]").click();
    await settle(page);
    const id = Object.keys(JSON.parse(await stored(page)).schedule.blocks)[0];
    for (const w of ["2026-11-02", "2026-11-09", "2026-11-16"]) assert.equal(await weekIn(page, w), weeks[w], `created — ${w}`);
    const created = await until(card(page, id), /Avant l’activation/);
    assert.match(created, /Le bloc a été créé ensuite : cette semaine a gardé son programme d’origine/);
    assert.match(created, /En cours : aucune séance ne l’a encore rempli/);
    await noToasts(page);
    await shot(card(page, id), "web-old-sessions.png");
    await card(page, id).locator('[data-block-act="remove"]').click();
    const rv = await until(d.locator("[data-block-preview]"), /semaine type/);
    assert.match(rv, /Semaine du lundi 23 novembre : Semaine 4 → semaine type/);
    assert.match(rv, /Tes séances restent au journal et rien n’est marqué comme atteint/);
    await d.locator("[data-block-confirm]").click();
    await settle(page);
    for (const [w, v] of Object.entries(weeks)) assert.equal(await weekIn(page, w), v, `removed — ${w}`);
    assert.equal(JSON.stringify(JSON.parse(await stored(page)).history), journal);
    const past = page.locator("[data-blocks-past]");
    await past.locator(":scope > summary").click();
    assert.match(await until(past, /Retiré le/), /Retiré le dimanche 22 novembre/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("two devices: the state merged from the phone shows the same block and the same week on the website", async () => {
  const res = state("6 —");
  const { context, page, errors } = await open("/prevoir", { now: NOON("2026-11-24"), history: res.journal, schedule: res.other.schedule, pauses: res.pauses });
  try {
    const { log, signature, ...got } = JSON.parse(await viewIn(page));
    const { log: l2, signature: s2, ...want } = expectedBlock("6 —");
    assert.deepEqual(got, want);
    const v = JSON.parse(await weekIn(page, "2026-11-23"));
    assert.deepEqual(v, EXPECTED.cases[byName("6 —").name].weeks.find((w) => w.week === "2026-11-23"));
    assert.equal(await card(page).locator("[data-block-act]").count() > 0, true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the QG and Prévoir read the block's day: on Saturday 5 December, the long ride of the report week, 2 h 55", async () => {
  const res = state("5 —");
  const { context, page, errors } = await open("/prevoir", { now: "2026-12-05T07:00:00.000Z", history: res.journal.filter((l) => l.date < "2026-12-05"), schedule: res.schedule, pauses: res.pauses });
  try {
    const today = await page.evaluate(() => window.TitanData.planToday());
    assert.equal(today.sport, "gravel");
    assert.equal(today.minutes, 175);
    assert.equal(today.block.id, "gravel-90");
    assert.match(await flat(page.locator(".pv-today")), /Gravel.*2 h 55/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("duplication: one week copied onto another and the whole block duplicated for January, each after its preview", async () => {
  const res = state("1 —");
  const { context, page, errors } = await open("/prevoir", { now: "2026-11-01T18:00:00.000Z", history: [], schedule: res.schedule });
  try {
    await card(page).locator('[data-block-act="copy"]').click();
    const d = sheet(page);
    await d.locator('[data-from="1"]').click();
    await d.locator('[data-to="3"]').click();
    const pv = await until(d.locator("[data-block-preview]"), /copie/);
    assert.match(pv, /Semaine du lundi 23 novembre : Semaine 4 · allégée → Semaine 4 \(copie de la semaine 2\)/);
    assert.match(pv, /Samedi : Gravel 2 h 55 → Gravel 3 h 25/);
    await d.locator("[data-block-confirm]").click();
    await settle(page);
    await card(page).locator('[data-block-act="duplicate"]').click();
    await d.locator('[name="dupStart"]').fill("2027-01-04"); await d.locator('[name="dupStart"]').dispatchEvent("change");
    const dv = await until(d.locator("[data-block-preview]"), /2027|janvier/);
    assert.match(dv, /Semaine du lundi 4 janvier : semaine type → Semaine 1/);
    assert.match(dv, /garde son échéance du samedi 13 février/);
    await d.locator("[data-block-confirm]").click();
    await settle(page);
    const list = await page.evaluate(() => window.TitanData.blocks().map((b) => [b.title, b.start, b.goal?.date]));
    assert.deepEqual(list, [["Gravel 90 km (copie)", "2027-01-04", "2027-02-13"], ["Gravel 90 km", "2026-11-02", "2026-12-12"]]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
