// V1.7.2 — Planifié et réalisé, in the real pages (Séance › Prévoir and Progrès › Semaine): the occurrences of the typical week tied to
// the sessions really done, the athlete's explicit decisions, and the bilan (start, changes, result). Sessions and typical week: the
// shared test set of Web and Android (tests/fixtures/week-plan-v172.json). Discovery account, local only, nothing is sent.
// Screenshots go to $WEEK_PLAN_SHOTS when set.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/week-plan-v172.json", import.meta.url), "utf8"));
const SHOTS = process.env.WEEK_PLAN_SHOTS || "";
const logs = (...ids) => FIXTURE.logs.filter((l) => ids.includes(l.id));
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

// Saturday 21 November 2026, 11:00 in Paris, unless a test reads from another zone.
async function open(path, history, { zone = "Europe/Paris", now = "2026-11-21T10:00:00.000Z", schedule = FIXTURE.type } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 1400 }, timezoneId: zone, serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanAdventure?.status === "ready" && window.TitanAdventure.snapshot?.owner === window.state.user.id && window.TitanWeekPlan && window.TitanWeekPlanView);
  await page.evaluate(({ h, s }) => { window.state.history = h; window.state.user.schedule = s; window.dispatchEvent(new Event("titan:history-updated")); }, { h: history, s: JSON.parse(JSON.stringify(schedule)) });
  await page.locator("[data-week-plan]").first().waitFor();
  return { context, page, errors };
}
const section = (page) => page.locator("[data-week-plan]").first();
const row = (page, id) => section(page).locator(`[data-occurrence="${id}"]`);
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
const adjust = async (page, id) => { await row(page, id).locator("[data-occurrence-act]").click(); await page.locator("dialog[open]").waitFor(); return page.locator("dialog[open]"); };
const settle = (page) => page.waitForFunction(() => !document.querySelector("dialog[open]"));
// Pages re-render on the next frame after a decision: wait for the words instead of reading them at once.
const until = async (loc, re) => { for (let i = 0; i < 50; i++) { if (re.test(await flat(loc).catch(() => ""))) return flat(loc); await new Promise((r) => setTimeout(r, 50)); } return flat(loc); };

test("the scenario of the brief: a run planned Tuesday, a ride on Thursday; the athlete ties it, it counts once and keeps its measures", async () => {
  const { context, page, errors } = await open("/prevoir", logs("ride-thu"));
  try {
    assert.match(await flat(row(page, "2026-11-16/1")), /Course à pied · mar\. 17 · 45 min Non faite/);
    assert.match(await flat(row(page, "2026-11-16/3")), /Une autre séance ce jour-là : remplacement ou séance en plus \?/);
    const before = await page.evaluate(() => JSON.stringify(window.state.history));
    const d = await adjust(page, "2026-11-16/1");
    await d.locator("summary", { hasText: "Relier une autre séance" }).click();
    await d.locator('[data-link="ride-thu"]').click();
    await settle(page);
    const text = await until(row(page, "2026-11-16/1"), /reliée par toi/);
    assert.match(text, /Remplacée par Vélo jeudi \(reliée par toi\)/);
    assert.match(text, /Vélo · jeu\. 19 · 1 h 12 · 31,4 km · D\+ 210 m/);
    assert.match(await flat(section(page).locator("[data-week-bilan]")), /Changements : 1 remplacée\./);
    assert.equal(await page.evaluate(() => JSON.stringify(window.state.history)), before, "the journal entry is not changed");
    const stored = await page.evaluate(() => window.state.user.schedule.weeks["2026-11-16"].occ["2026-11-16/1"]);
    assert.deepEqual({ kind: stored.kind, session: stored.session }, { kind: "link", session: "ride-thu" });
    // The ride, now tied, is no longer a question on Thursday nor a session outside the plan.
    assert.equal(await row(page, "2026-11-16/3").getAttribute("data-status"), "missed");
    assert.equal(await section(page).locator("[data-week-extra]").count(), 0);
    if (SHOTS) { await page.evaluate(() => document.querySelectorAll(".asc-toast").forEach((t) => t.remove())); await section(page).screenshot({ path: `${SHOTS}/web-replaced.png` }); }
    // The session line opens the journal sheet of the ride.
    assert.equal(await row(page, "2026-11-16/1").locator("[data-occurrence-session] a").getAttribute("href"), "/journal?session=ride-thu");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a move recorded before the session: tied automatically on Thursday, one gap only, nothing outside the plan", async () => {
  const { context, page, errors } = await open("/prevoir", logs("run-thu", "gym-thu"));
  try {
    assert.equal(await section(page).locator("[data-week-gaps]").innerText(), "1 écart");
    assert.deepEqual(await section(page).locator("[data-extra]").evaluateAll((els) => els.map((e) => e.dataset.extra)), ["run-thu"]);
    const d = await adjust(page, "2026-11-16/1");
    await d.locator("summary", { hasText: "Déplacer" }).click();
    await d.locator('[data-move="2026-11-19"]').click();
    await settle(page);
    assert.match(await until(row(page, "2026-11-16/1"), /Déplacée jeudi/), /Déplacée jeudi, faite \(reliée automatiquement\)/);
    assert.equal(await row(page, "2026-11-16/1").getAttribute("data-gap"), "moved");
    assert.equal(await section(page).locator("[data-week-gaps]").innerText(), "1 écart");
    assert.equal(await section(page).locator("[data-week-extra]").count(), 0);
    // The day strip of this week follows the move: Tuesday is free, Thursday carries the run.
    assert.equal(await page.locator('.pv-day[data-day="tuesday"]').getAttribute("data-state"), "rest");
    assert.match(await page.locator('.pv-day[data-day="thursday"]').getAttribute("aria-label"), /^Jeudi : Course à pied\./);
    if (SHOTS) { await page.evaluate(() => document.querySelectorAll(".asc-toast").forEach((t) => t.remove())); await section(page).screenshot({ path: `${SHOTS}/web-moved.png` }); }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("two eligible sessions: TITAN asks, the athlete chooses, the other run stays outside the plan", async () => {
  const { context, page, errors } = await open("/prevoir", logs("run-tue-am", "run-tue-pm"));
  try {
    assert.equal(await row(page, "2026-11-16/1").getAttribute("data-status"), "ask");
    assert.match(await flat(row(page, "2026-11-16/1")), /2 séances possibles : laquelle correspond \?/);
    const d = await adjust(page, "2026-11-16/1");
    assert.equal(await d.locator("[data-link]").count(), 2);
    if (SHOTS) await d.screenshot({ path: `${SHOTS}/web-two-eligible.png` });
    await d.locator('[data-link="run-tue-pm"]').click();
    await settle(page);
    assert.match(await until(row(page, "2026-11-16/1"), /reliée par toi/), /Faite \(reliée par toi\).*10,3 km/);
    assert.deepEqual(await section(page).locator("[data-extra]").evaluateAll((els) => els.map((e) => e.dataset.extra)), ["run-tue-am"]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("change of week: an edit of the typical week on Wednesday applies next Monday, this week keeps its start", async () => {
  const { context, page, errors } = await open("/prevoir", logs("gym-thu"), { now: "2026-11-18T09:00:00.000Z" });
  try {
    await page.locator('.asc-row[data-day="tuesday"]').click();
    const d = page.locator("dialog[open]");
    await d.locator("#pv-q").fill("natation");
    await d.locator('[data-results] [data-pick="swimming"]').click();
    await d.locator('[name="minutes"]').fill("40");
    await d.locator('button[type="submit"]').click();
    await settle(page);
    await page.locator(".asc-toast", { hasText: "S’applique à partir du lundi 23 novembre" }).waitFor();
    assert.match(await flat(row(page, "2026-11-16/1")), /Course à pied · mar\. 17/);
    assert.match(await flat(section(page)), /Ta semaine type modifiée s’applique à partir du lundi 23 novembre/);
    const s = await page.evaluate(() => window.state.user.schedule);
    assert.equal(s.tuesday.sport, "swimming");
    assert.equal(s.weeks["2026-11-16"].ref.days[1].sport, "running");
    // Next Monday, the week starts from the edited typical week; the week of 16 November keeps its run.
    await page.clock.setFixedTime(new Date("2026-11-23T09:00:00.000Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("titan:history-updated")));
    await page.locator('[data-week-plan="2026-11-23"]').waitFor();
    assert.match(await flat(row(page, "2026-11-23/1")), /Natation · mar\. 24 · 40 min/);
    assert.equal(await page.evaluate(() => window.TitanData.weekPlan(new Date("2026-11-17T12:00:00")).occurrences[0].planned.sport), "running");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("time zone: read from New York, a run at 23:40 in Paris on Tuesday stays on Tuesday", async () => {
  const { context, page, errors } = await open("/prevoir", logs("run-tue-late"), { zone: "America/New_York", now: "2026-11-21T15:00:00.000Z" });
  try {
    assert.match(await flat(row(page, "2026-11-16/1")), /Faite \(reliée automatiquement\)/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("remote modification: a decision made on the phone arrives with the profile and joins the one made here", async () => {
  const { context, page, errors } = await open("/prevoir", logs("run-thu"));
  try {
    const d = await adjust(page, "2026-11-16/1");
    await d.locator("summary", { hasText: "Déplacer" }).click();
    await d.locator('[data-move="2026-11-19"]').click();
    await settle(page);
    // The phone skipped Saturday from the same start; the confirmed profile brings it here (merged occurrence by occurrence).
    await page.evaluate((type) => {
      const W = window.TitanWeekPlan;
      const remote = W.decide(JSON.parse(JSON.stringify(type)), "2026-11-16/5", { kind: "skip" }, { today: "2026-11-21", at: "2026-11-21T10:30:00.000Z" });
      window.state.user.schedule = W.merge(window.state.user.schedule, remote);
      window.dispatchEvent(new Event("titan:history-updated"));
    }, FIXTURE.type);
    await page.waitForFunction(() => document.querySelector('[data-occurrence="2026-11-16/5"]')?.dataset.status === "skipped");
    await until(section(page).locator("[data-week-bilan]"), /écartée/);
    assert.equal(await row(page, "2026-11-16/1").getAttribute("data-gap"), "moved");
    assert.match(await flat(section(page).locator("[data-week-bilan]")), /Changements : 1 déplacée, 1 écartée\./);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("Progrès › Semaine: the bilan of this week and of a past week, with its own reference and a pause kept", async () => {
  const { context, page, errors } = await open("/stats", logs("gym-thu", "run-prev", "swim-prev"));
  try {
    assert.match(await flat(section(page).locator("[data-week-bilan]")), /Au départ : 3 séances prévues\..*Résultat : 1\/3 faite, 1 non faite, 1 à venir\. Écarts : 1\./);
    // The week before: its reference is reconstituted (before tracking), the run done is tied, the swim is outside the plan.
    await page.locator("#wk-previous").click();
    await page.locator('[data-week-plan="2026-11-09"]').waitFor();
    const past = page.locator('[data-week-plan="2026-11-09"]');
    assert.match(await flat(past), /Prévu et réalisé cette semaine-là/);
    assert.match(await flat(past), /programme reconstitué/);
    assert.deepEqual(await past.locator("[data-extra]").evaluateAll((els) => els.map((e) => e.dataset.extra)), ["swim-prev"]);
    if (SHOTS) await past.screenshot({ path: `${SHOTS}/web-past-week.png` });
    // A paused week counts no gap for what was not done.
    await page.evaluate(() => { window.state.user.cadencePauses = ["2026-11-09"]; window.dispatchEvent(new Event("titan:history-updated")); });
    await page.waitForFunction(() => /0 écart/.test(document.querySelector('[data-week-plan="2026-11-09"] [data-week-gaps]')?.textContent || ""));
    assert.match(await flat(past), /semaine en pause, sans écart/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
