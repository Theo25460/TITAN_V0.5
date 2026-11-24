// V1.8.4 — Saisons privées de club in the Communauté › Clubs. Behind the server flags screens.clubs and screens.club_season; driven with a
// recorder instead of a real project. The organiser launches a season; a member joins explicitly, reads the group's progress and stages
// only from 3 participants, pauses (and reads the stage still in progress), resumes, leaves after a confirmation; the organiser postpones
// an upcoming season and stops a running one after a confirmation; the private report shows milestones, never a ranking. Text is escaped.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000984";
const SHOTS = process.env.TITAN_SHOTS || "";
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

const evil = '<img src=x onerror="window.pwned=1">';
const CLUBS = [
  { id: "c1", name: "Les Foulées du mardi", description: null, discoverable: false, role: "admin", members: 6, code: "ABCD2345", roster: [], announcements: [] },
  { id: "c2", name: "Trail du dimanche", description: null, discoverable: false, role: "member", members: 9, code: null, roster: null, announcements: [] },
];
const stage = (n, threshold, reachedAt = null) => ({ n, threshold, reachedAt });
// The recorder plays the server: it applies the rule of 20261127090000 to a tiny model (shares, caps and threshold).
function season(over = {}) {
  return { id: "s2", club: "c2", title: `Quatre semaines ensemble ${evil}`, pace: "reguliere", perWeek: 3, weeks: 4, startsAt: "2026-11-02T00:00:00+01:00",
    endsAt: "2026-11-30T00:00:00+01:00", stoppedAt: null, postponed: 0, phase: "running", week: 4, participants: 2, threshold: 3, visible: false,
    paused: null, contributors: null, total: null, target: null, next: null, stages: [{ n: 1 }, { n: 2 }, { n: 3 }], me: null, can: ["join"], suspended: false, ...over };
}
const visible = (over = {}) => season({ participants: 4, visible: true, paused: 0, contributors: 4, total: 32, target: 44, next: 3,
  stages: [stage(1, 15, "2026-11-12T10:00:00Z"), stage(2, 30, "2026-11-20T10:00:00Z"), stage(3, 44)], ...over });

async function tap(page, locator) { await locator.scrollIntoViewIfNeeded(); await page.waitForTimeout(450); await locator.click({ timeout: 5000 }); }
async function panel({ seasonFlag = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Europe/Paris", serviceWorkers: "block", deviceScaleFactor: SHOTS ? 2 : 1 });
  await context.addInitScript(() => { try { localStorage.setItem("titan_cm_open_v1", JSON.stringify(["clubs"])); } catch {} });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.TitanClubs && window.TitanClubSeason && window.state?.user);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ seasonFlag, owner, clubs, s2 }) => {
    window.calls = [];
    window.model = { c1: { club: "c1", role: "organizer", current: null, last: null, canCreate: true }, c2: { club: "c2", role: "member", current: s2, last: null, canCreate: false } };
    window.delay = 0;
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      let out = { data: null, error: null };
      if (name === "titan_club_my_v1") out = { data: clubs, error: null };
      else if (name === "titan_club_discover_v1") out = { data: [], error: null };
      else if (name === "titan_club_week_v1") out = { data: { club: args.p_club, goal: null, minutes: 300, members: 6, active: 3, canSet: false }, error: null };
      else if (name === "titan_club_season_v1") out = { data: window.model[args.p_club], error: null };
      else if (name === "titan_club_season_act_v1") out = window.onAct(args);
      const result = new Promise(r => setTimeout(() => r(out), window.delay)); result.setHeader = () => result; return result;
    };
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    const flags = { enabled: (key, fallback) => key === "screens.clubs" ? true : key === "screens.club_season" ? seasonFlag : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { seasonFlag, owner: OWNER, clubs: CLUBS, s2: season() });
  return { page, context, errors };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }
const text = (page, sel) => page.locator(sel).innerText();
async function axe(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(700); // the section fades in after each render: let it settle before reading contrasts
  await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
  return page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
}

test("club season: explicit joining, nothing of the group below 3, stages and the stage in progress during a pause, resume, leave", async () => {
  const { page, context, errors } = await panel();
  try {
    const box = page.locator("[data-club-season=c2]");
    await box.waitFor();
    assert.match(await box.innerText(), /organisées par les administrateurs du club\. Chacun choisit de participer/);
    assert.match(await box.innerText(), /Tu ne participes pas\. Rejoindre la saison est un choix/);
    assert.match(await text(page, "[data-club-season=c2] [data-season-group]"), /^2 participants\. La progression du groupe s’affiche à partir de 3 participants/);
    assert.equal(await box.locator("[data-season-progress]").count(), 0, "below the threshold: no total");
    assert.equal(await box.locator("[role=progressbar]").count(), 0, "no bar");
    assert.ok(!/jours actifs ensemble|atteinte/.test(await box.innerText()), "no stage reached is worded");
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator("#clubs img").count(), 0, "the title is escaped");
    await shot(page, "season-join");
    // Join: a double click sends one request.
    await page.evaluate(() => {
      window.delay = 250;
      window.onAct = (a) => {
        if (a.p_action === "join") window.model.c2.current = visible({ participants: 3, me: { status: "active", days: 0, cap: 2, share: 2, capped: false }, can: ["pause", "leave"] });
        if (a.p_action === "pause") window.model.c2.current = visible({ participants: 3, paused: 1, me: { status: "paused", days: 0, cap: 2, share: 1, capped: false }, can: ["resume", "leave"] });
        if (a.p_action === "resume") window.model.c2.current = visible({ participants: 3, me: { status: "active", days: 1, cap: 2, share: 2, capped: false }, can: ["pause", "leave"] });
        if (a.p_action === "leave") window.model.c2.current = visible({ participants: 3, me: { status: "left", days: 1, cap: 2, share: 1, capped: false }, can: [] });
        return { data: window.model.c2, error: null };
      };
    });
    await page.evaluate(({ v }) => { window.visible = (o) => ({ ...v, ...o }); }, { v: visible() });
    const join = box.locator("[data-season-act=join]");
    await join.scrollIntoViewIfNeeded(); await page.waitForTimeout(450);
    await join.dblclick();
    await page.waitForFunction(() => /Tu participes/.test(document.querySelector("[data-club-season=c2]")?.innerText || ""));
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_season_act_v1").length), 1, "a double click joins once");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_season_act_v1")[1]),
      { p_club: "c2", p_action: "join", p_title: null, p_pace: null, p_weeks: null, p_starts_on: null, p_days: null });
    assert.match(await text(page, "[data-club-season=c2] [data-season-progress]"), /^32 jours actifs ensemble sur 44 jours visés$/);
    await page.waitForTimeout(700);
    const stages = await box.locator("[data-season-stages] li").evaluateAll(l => l.map(x => x.dataset.status));
    assert.deepEqual(stages, ["reached", "reached", "current"]);
    assert.match(await text(page, "[data-club-season=c2] [data-stage='1']"), /Le départ tenu — atteinte le 12 novembre/);
    await shot(page, "season-running");
    // Pause: the others read which stage is still in progress; my acquired days stay.
    await tap(page, box.locator("[data-season-act=pause]"));
    await page.waitForFunction(() => /en pause/.test(document.querySelector("[data-club-season=c2] [data-season-me]")?.innerText || ""));
    await page.waitForTimeout(700);
    assert.match(await text(page, "[data-club-season=c2] [data-season-group]"), /3 participants dont 1 en pause/);
    assert.match(await text(page, "[data-club-season=c2] [data-season-ongoing]"), /^Objectif en cours : étape 3, « La saison bouclée »\. Les membres en pause gardent ce qu’ils ont apporté/);
    await shot(page, "season-pause");
    await tap(page, box.locator("[data-season-act=resume]"));
    await page.waitForFunction(() => /^Tu participes/.test(document.querySelector("[data-club-season=c2] [data-season-me]")?.innerText || ""));
    // Leave: a confirmation first, then the acquired days stay with the group.
    await tap(page, box.locator("[data-season-act=leave]"));
    await page.getByRole("button", { name: "Quitter", exact: true }).last().click();
    await page.waitForFunction(() => /Tu as quitté la saison/.test(document.querySelector("[data-club-season=c2] [data-season-me]")?.innerText || ""));
    assert.match(await text(page, "[data-club-season=c2] [data-season-me]"), /restent acquis pour le groupe/);
    assert.equal(await box.locator("[data-season-act]").count(), 0, "nothing more to do in this season");
    assert.ok(!/classement/i.test(await box.innerText()), "no ranking in a season");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll at 390 px");
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club season: the organiser creates, postpones and stops after a confirmation; the private report shows milestones, never a ranking", async () => {
  const { page, context, errors } = await panel();
  try {
    const box = page.locator("[data-club-season=c1]");
    await box.waitFor();
    assert.match(await box.innerText(), /Tu organises les saisons de ce club \(administrateur\)/);
    await tap(page, box.locator("[data-season-form=c1]"));
    const form = page.locator("[data-season-create-form=c1]");
    await form.waitFor();
    // A short title is refused on the device, before any request.
    await form.locator("input[data-club-draft^=season-title]").fill("ab");
    await tap(page, form.locator("button[type=submit]"));
    await page.waitForFunction(() => /Vérifie le titre/.test(document.querySelector("[data-club-notice]")?.innerText || ""));
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_season_act_v1").length), 0);
    await page.evaluate(() => {
      window.onAct = (a) => {
        const m = window.model.c1;
        if (a.p_action === "create") m.current = { id: "s1", club: "c1", title: a.p_title, pace: a.p_pace, perWeek: 4, weeks: a.p_weeks, startsAt: "2026-12-07T00:00:00+01:00", endsAt: "2027-01-04T00:00:00+01:00",
          postponed: 0, phase: "upcoming", week: null, participants: 0, threshold: 3, visible: false, stages: [{ n: 1 }, { n: 2 }, { n: 3 }], me: null, can: ["join", "postpone", "stop"] }, m.canCreate = false;
        if (a.p_action === "postpone") { m.current = { ...m.current, startsAt: "2026-12-14T00:00:00+01:00", postponed: m.current.postponed + 1 }; if (m.current.postponed >= 2) m.current.can = ["join", "stop"]; }
        if (a.p_action === "stop") { m.last = { id: "s1", title: m.current.title, phase: "cancelled", weeks: 4 }; m.current = null; m.canCreate = true; }
        return { data: m, error: null };
      };
    });
    await form.locator("input[data-club-draft^=season-title]").fill("Hiver ensemble");
    await form.locator("select[data-club-draft^=season-pace]").selectOption("soutenue");
    await form.locator("select[data-club-draft^=season-weeks]").selectOption("4");
    await shot(page, "season-create");
    await tap(page, form.locator("button[type=submit]"));
    await page.waitForFunction(() => /Départ le 7 décembre/.test(document.querySelector("[data-club-season=c1]")?.innerText || ""));
    const create = await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_season_act_v1" && c[1].p_action === "create")[1]);
    assert.equal(create.p_title, "Hiver ensemble"); assert.equal(create.p_pace, "soutenue"); assert.equal(create.p_weeks, 4);
    assert.match(create.p_starts_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(await box.innerText(), /Personne ne participe encore\. Chacun choisit de rejoindre la saison\./);
    await tap(page, box.locator("[data-season-act=postpone][data-days='7']"));
    await page.waitForFunction(() => /reporté une fois/.test(document.querySelector("[data-club-season=c1] [data-season-header]")?.innerText || ""));
    assert.equal(await page.evaluate(() => window.calls.find(c => c[1]?.p_action === "postpone")[1].p_days), 7);
    await shot(page, "season-upcoming");
    // Stop: a confirmation that names the cancellation, then the report.
    await tap(page, box.locator("[data-season-act=stop]"));
    assert.match(await page.locator("[role=dialog], dialog").last().innerText(), /annulée avant son départ/);
    await page.getByRole("button", { name: "Arrêter", exact: true }).last().click();
    await page.waitForFunction(() => /Bilan de « Hiver ensemble »/.test(document.querySelector("[data-club-season=c1]")?.innerText || ""));
    assert.match(await text(page, "[data-club-season=c1] [data-season-report]"), /Saison annulée avant son départ par les administrateurs du club\./);
    // A closed season's report (club c2): milestones and one's own part, never a ranking.
    await page.evaluate(() => {
      window.model.c2 = { club: "c2", role: "member", current: null, canCreate: false, last: { id: "s2", title: "Quatre semaines ensemble", phase: "closed", weeks: 4, endsAt: "2026-11-30T00:00:00+01:00",
        participants: 4, visible: true, reached: 2, total: 34, target: 47, stages: [{ n: 1, reachedAt: "2026-11-12T10:00:00Z" }, { n: 2, reachedAt: "2026-11-20T10:00:00Z" }, { n: 3, reachedAt: null }], me: { days: 18, left: false } } };
    });
    await page.evaluate(() => window.TitanClubs.refresh());
    await page.waitForFunction(() => /Bilan de « Quatre semaines ensemble »/.test(document.querySelector("[data-club-season=c2]")?.innerText || ""));
    const report = await text(page, "[data-club-season=c2] [data-season-report]");
    assert.match(report, /2 étapes atteintes sur 3 · 34 jours actifs ensemble sur 47 visés · 4 participants à la fin\./);
    assert.match(report, /Ta part : 18 jours actifs comptés\./);
    assert.match(report, /Aucun classement/);
    await page.locator("[data-club-season=c2]").scrollIntoViewIfNeeded();
    await shot(page, "season-report");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club season: flag closed, the season block is not shown and the server is not asked", async () => {
  const { page, context, errors } = await panel({ seasonFlag: false });
  try {
    await page.locator("[data-club=c2]").waitFor();
    assert.equal(await page.locator("[data-club-season]").count(), 0);
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0].startsWith("titan_club_season")).length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
