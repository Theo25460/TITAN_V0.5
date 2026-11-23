// V1.7.3 — Bilan et ajustements, in the real pages (Progrès › Semaine and Séance › Prévoir): the bilan shows one observation with its
// source sessions and the actions; the preview lets the athlete choose the next week or the typical week; the confirmed choice is in
// the programme with its origin, can be undone, and the next bilan shows it apart from what was observed after. Sessions and typical
// week: the shared test set of Web and Android (tests/fixtures/week-review-v173.json). Discovery account, local only, nothing is sent.
// Screenshots go to $WEEK_REVIEW_SHOTS when set.
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
const ROOT = new URL("../..", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/week-review-v173.json", import.meta.url), "utf8"));
const SHOTS = process.env.WEEK_REVIEW_SHOTS || "";
const logs = (...ids) => FIXTURE.logs.filter((l) => ids.includes(l.id));
const WEEKS = ["run-w1", "bloc-w1", "lift-w1", "run-w2", "bloc-w2", "lift-w2", "run-w3", "bloc-w3", "lift-w3", "run-w4", "bloc-w4", "lift-w4"];
const WEEK5 = ["run-w5", "bloc-w5", "lift-w5"];
// The typical week followed since 26 October, with the two decisions of the pilot weeks (the move of 2 November, the tie of 16 November).
const START = FIXTURE.cases[0].ops.reduce((s, op) => W.decide(s, op.id, op.decision, { today: op.today, at: op.at }), JSON.parse(JSON.stringify(FIXTURE.type)));
const SUNDAY_1 = "2026-11-22T17:00:00.000Z", SUNDAY_2 = "2026-11-29T17:00:00.000Z";

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

async function open(path, history, { now = SUNDAY_1, schedule = START, pauses = [] } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 1600 }, timezoneId: "Europe/Paris", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id && window.TitanWeekReview && window.TitanWeekReviewView);
  await page.evaluate(({ h, s, p }) => { window.state.history = h; window.state.user.schedule = s; window.state.user.cadencePauses = p; window.dispatchEvent(new Event("titan:history-updated")); }, { h: history, s: JSON.parse(JSON.stringify(schedule)), p: pauses });
  // Pages re-render on the next frame: read them once that frame has been drawn.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { context, page, errors };
}
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const until = async (loc, re) => { for (let i = 0; i < 60; i++) { if (re.test(await flat(loc).catch(() => ""))) return flat(loc); await new Promise((r) => setTimeout(r, 50)); } return flat(loc); };
const review = (page, week) => page.locator(`[data-week-review="${week}"]`);
const sheet = (page) => page.locator("dialog[open]");
const settle = (page) => page.waitForFunction(() => !document.querySelector("dialog[open]"));
const stored = (page) => page.evaluate(() => JSON.stringify({ schedule: window.state.user.schedule, pauses: window.state.user.cadencePauses, history: window.state.history }));
// Progrès › Semaine redraws when its goals and quests arrive: retry a screenshot on the element drawn again.
const shot = async (loc, path) => { for (let i = 0; i < 8; i++) { try { await loc.screenshot({ path, timeout: 2000 }); return; } catch (e) { if (i === 7) throw e; await new Promise((r) => setTimeout(r, 250)); } } };
const noToasts = (page) => page.evaluate(() => document.querySelectorAll(".asc-toast").forEach((t) => t.remove()));

test("two consecutive weeks: the bilan proposes, the athlete tests Wednesday next week, the programme shows it, the next bilan reads it", async () => {
  // Week 1 — Sunday 22 November, bilan of the week of 16 November.
  const one = await open("/stats", logs(...WEEKS));
  let carried;
  try {
    const r = review(one.page, "2026-11-16");
    await r.waitFor();
    const text = await flat(r);
    assert.match(text, /Le créneau du mardi \(Course à pied\) a été déplacé 2 fois sur 4 semaines suivies/);
    assert.match(text, /Faite mercredi 2 fois\./);
    assert.match(text, /Escalade bloc du jeudi : 4\/4 comme prévu\./);
    assert.match(text, /Pour la semaine du lun\. 23 nov\./);
    // The source sessions, with their own measures, open their sheet in the journal.
    await r.locator("[data-review-sources] summary").click();
    assert.deepEqual(await r.locator("[data-review-source]").evaluateAll((els) => els.map((e) => e.dataset.reviewSource)), ["run-w2", "run-w4"]);
    assert.match(await flat(r.locator('[data-review-source="run-w4"]')), /Course à pied · mer\. 18 nov\. · 50 min · 9,2 km/);
    assert.equal(await r.locator('[data-review-source="run-w4"] a').getAttribute("href"), "/journal?session=run-w4");
    // The actions: the suggestion, keep, move, pause, not now.
    const acts = await flat(r.locator("[data-review-actions]"));
    for (const t of ["Tester le mercredi la semaine prochaine", "Reconduire le plan", "Déplacer à un autre jour", "Mettre la semaine du lun. 23 nov. en pause", "Pas maintenant"]) assert.ok(acts.includes(t), t);
    if (SHOTS) await shot(r, `${SHOTS}/web-bilan-week1.png`);
    // The preview: next week only, then the typical week, then back; nothing is written while choosing.
    const before = await stored(one.page);
    await r.locator('[data-review-act="move"][data-to="2"]').click();
    const d = sheet(one.page);
    await d.waitFor();
    assert.match(await flat(d.locator("[data-review-preview]")), /Mardi : Course à pied → libre Mercredi : libre → Course à pied Seulement la semaine du lundi 23 novembre\. Ta semaine type ne change pas\./);
    await d.locator('[data-scope="type"]').click();
    assert.match(await until(d.locator("[data-review-where]"), /semaine type change/), /Ta semaine type change à partir du lundi 23 novembre\./);
    if (SHOTS) await shot(d, `${SHOTS}/web-preview-type.png`);
    await d.locator('[data-scope="next"]').click();
    assert.match(await until(d.locator("[data-review-where]"), /Seulement/), /Seulement la semaine du lundi 23 novembre/);
    assert.match(await flat(d), /Origine : bilan de la semaine du lundi 16 novembre/);
    assert.equal(await stored(one.page), before, "choosing in the preview writes nothing");
    await d.locator("[data-review-confirm]").click();
    await settle(one.page);
    const s = await one.page.evaluate(() => window.state.user.schedule);
    assert.deepEqual(s.weeks["2026-11-23"].occ["2026-11-23/1"].kind, "move");
    assert.equal(s.weeks["2026-11-23"].occ["2026-11-23/1"].origin, "review:2026-11-16");
    assert.equal(s.reviews["2026-11-16"].action.scope, "next");
    assert.equal(s.tuesday.sport, "running", "the typical week is unchanged");
    assert.match(await until(r.locator("[data-review-choice]"), /Ton choix/), /Ton choix : Déplacer Course à pied du mardi au mercredi la semaine suivante\. Choisi le 22 novembre à ce bilan\./);
    assert.equal(await r.locator("[data-review-actions]").count(), 0);
    carried = s;
    assert.deepEqual(one.errors, []);
  } finally { await one.context.close(); }

  // Still Sunday 22: Séance › Prévoir shows next week's programme, the origin of the change and its undo.
  const prog = await open("/prevoir", logs(...WEEKS), { schedule: carried });
  try {
    const next = prog.page.locator('[data-adjustments="2026-11-23"]');
    await next.waitFor();
    const t = await flat(next);
    assert.match(t, /La semaine prochaine/);
    assert.match(t, /Déplacer Course à pied du mardi au mercredi la semaine suivante Semaine du lundi 23 novembre · choisi au bilan de la semaine du lundi 16 novembre Annuler/);
    assert.match(t, /Course à pied · mercredi 25 novembre \(choisi au bilan\)/);
    if (SHOTS) { await noToasts(prog.page); await shot(next, `${SHOTS}/web-programme-next.png`); }
    assert.deepEqual(prog.errors, []);
  } finally { await prog.context.close(); }

  // Week 2 — Sunday 29 November: the run done on Wednesday; the bilan of the week of 23 November.
  const two = await open("/stats", logs(...WEEKS, ...WEEK5), { now: SUNDAY_2, schedule: carried });
  try {
    const plan = two.page.locator('[data-week-plan="2026-11-23"]');
    await plan.waitFor();
    assert.match(await flat(plan.locator('[data-occurrence="2026-11-23/1"]')), /Déplacée mercredi, faite \(reliée automatiquement\).*Choisi au bilan de la semaine du lundi 16 novembre/);
    const r = review(two.page, "2026-11-23");
    await r.waitFor();
    const f = r.locator("[data-review-follow]");
    assert.equal(await f.getAttribute("data-review-follow"), "done");
    assert.equal(await flat(f.locator("[data-review-decided]")), "Décidé au bilan de la semaine du lundi 16 novembre : déplacer Course à pied du mardi au mercredi la semaine suivante.");
    assert.equal(await flat(f.locator("[data-review-observed]")), "Observé après : Course à pied faite le mercredi, comme décidé.");
    assert.match(await flat(f), /Course à pied · mer\. 25 nov\. · 49 min · 9 km/);
    // The tested move held: the suggestion is now to keep Wednesday in the typical week.
    assert.match(await flat(r.locator("[data-review-actions]")), /Garder le mercredi dans ma semaine type/);
    assert.match(await flat(r.locator("[data-review-observation]")), /Course à pied du mardi : 2\/4 comme prévu \(dont 1 au jour choisi au bilan\), 2 déplacées\./);
    if (SHOTS) { await noToasts(two.page); await shot(r, `${SHOTS}/web-bilan-week2.png`); }
    assert.deepEqual(two.errors, []);
  } finally { await two.context.close(); }
});

test("history too short: no change is suggested, the bilan offers to enrich the history or keep the plan", async () => {
  const schedule = JSON.parse(JSON.stringify(FIXTURE.cases.find((c) => c.name.startsWith("7 —")).type));
  const { context, page, errors } = await open("/stats", logs("run-w4", "bloc-w4"), { schedule });
  try {
    const r = review(page, "2026-11-16");
    await r.waitFor();
    assert.equal(await r.getAttribute("data-observation"), "short");
    assert.match(await flat(r), /Historique trop court pour un constat Seulement 1 semaine suivie sur les 4 dernières : il en faut au moins 2/);
    assert.equal(await r.locator("[data-review-enrich]").getAttribute("href"), "/training");
    assert.match(await flat(r.locator("[data-review-actions]")), /Enrichir mon historique Garder mon plan/);
    assert.doesNotMatch(await flat(r.locator("[data-review-actions]")), /Tester/);
    if (SHOTS) await shot(r, `${SHOTS}/web-short-history.png`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("refusal: the preview cancelled, then « Pas maintenant » — the schedule, the pauses and the journal stay byte for byte", async () => {
  const { context, page, errors } = await open("/stats", logs(...WEEKS));
  try {
    const r = review(page, "2026-11-16");
    await r.waitFor();
    const before = await stored(page);
    for (const act of ['[data-review-act="move"][data-to="2"]', '[data-review-act="pause"]', '[data-review-act="keep"]']) {
      await r.locator(act).click();
      await sheet(page).waitFor();
      await sheet(page).locator("[data-review-cancel]").click();
      await settle(page);
    }
    await r.locator("[data-review-dismiss]").click();
    await until(r, /^(?!.*Pas maintenant)/);
    assert.equal(await r.locator("[data-review-actions]").count(), 0);
    assert.equal(await stored(page), before);
    assert.equal(await page.evaluate(() => window.state.user.schedule.reviews), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("undo from the programme: the next week is back as planned, and the bilan says the choice was undone", async () => {
  const one = await open("/stats", logs(...WEEKS));
  let carried;
  try {
    const r = review(one.page, "2026-11-16");
    await r.waitFor();
    await r.locator('[data-review-act="move"][data-to="2"]').click();
    await sheet(one.page).locator('[data-scope="type"]').click();
    await until(sheet(one.page).locator("[data-review-where]"), /semaine type/);
    await sheet(one.page).locator("[data-review-confirm]").click();
    await settle(one.page);
    carried = await one.page.evaluate(() => window.state.user.schedule);
    assert.equal(carried.wednesday.sport, "running");
    assert.equal(carried.tuesday.sport, null);
  } finally { await one.context.close(); }
  const prog = await open("/prevoir", logs(...WEEKS), { schedule: carried });
  try {
    const next = prog.page.locator('[data-adjustments="2026-11-23"]');
    await next.waitFor();
    assert.match(await flat(next), /Semaine type modifiée à partir du lundi 23 novembre · choisi au bilan de la semaine du lundi 16 novembre/);
    await next.locator("[data-review-undo]").click();
    await prog.page.waitForFunction(() => !document.querySelector('[data-adjustments="2026-11-23"]'));
    const s = await prog.page.evaluate(() => window.state.user.schedule);
    assert.equal(s.tuesday.sport, "running");
    assert.equal(s.wednesday.sport, null);
    assert.ok(s.reviews["2026-11-16"].undone);
    const ref = W.reference(s, "2026-11-23", { current: "2026-11-16" }).days.map((d) => d?.sport ?? null);
    assert.deepEqual(ref, [null, "running", null, "bouldering", null, "muscu_gym", null]);
    carried = s;
    assert.deepEqual(prog.errors, []);
  } finally { await prog.context.close(); }
  const back = await open("/stats", logs(...WEEKS), { schedule: carried });
  try {
    const r = review(back.page, "2026-11-16");
    await r.waitFor();
    assert.match(await flat(r.locator('[data-review-choice="undone"]')), /Choix annulé le 22 novembre : déplacer Course à pied du mardi au mercredi dans ma semaine type\./);
    // Undone, the bilan offers its choices again.
    assert.equal(await r.locator("[data-review-actions]").count(), 1);
    assert.deepEqual(back.errors, []);
  } finally { await back.context.close(); }
});

test("pause of the next week: the cadence pause of that week only, shown in the programme, undone from there", async () => {
  const one = await open("/stats", logs(...WEEKS));
  let carried;
  try {
    const r = review(one.page, "2026-11-16");
    await r.waitFor();
    await r.locator('[data-review-act="pause"]').click();
    assert.match(await flat(sheet(one.page).locator("[data-review-preview]")), /La semaine du lundi 23 novembre est mise en pause/);
    await sheet(one.page).locator("[data-review-confirm]").click();
    await settle(one.page);
    carried = await one.page.evaluate(() => ({ s: window.state.user.schedule, p: window.state.user.cadencePauses }));
    assert.deepEqual(carried.p, ["2026-11-23"]);
  } finally { await one.context.close(); }
  const prog = await open("/prevoir", logs(...WEEKS), { schedule: carried.s, pauses: carried.p });
  try {
    const next = prog.page.locator('[data-adjustments="2026-11-23"]');
    await next.waitFor();
    assert.match(await flat(next), /Mettre la semaine en pause Semaine du lundi 23 novembre/);
    assert.match(await flat(next), /Programme de la semaine du lundi 23 novembre · en pause/);
    await next.locator("[data-review-undo]").click();
    await prog.page.waitForFunction(() => !document.querySelector('[data-adjustments="2026-11-23"]'));
    assert.deepEqual(await prog.page.evaluate(() => window.state.user.cadencePauses), []);
    assert.deepEqual(prog.errors, []);
  } finally { await prog.context.close(); }
});
