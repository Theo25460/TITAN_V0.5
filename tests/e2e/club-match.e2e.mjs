// V1.8.5 — Rencontres entre clubs in the Communauté › Clubs. Behind the server flags screens.clubs and screens.club_match; driven with a
// recorder instead of a real project. A member of the invited club reads both clubs' totals only (the other club's name, participants and
// rate), the common score as of midnight, joins explicitly (a double click sends one request) and leaves after a confirmation; the
// organiser proposes (the form is checked on the device), reads the code, withdraws after a confirmation, previews a received code and
// accepts it; the recap shows totals by club and one's own part, never a person, and asks two questions for the pilot's measure.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000985";
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
  { id: "c1", name: "Les Rouleurs", description: null, discoverable: false, role: "admin", members: 12, code: "ABCD2345", roster: [], announcements: [] },
  { id: "c2", name: "Multisport du parc", description: null, discoverable: false, role: "member", members: 6, code: null, roster: null, announcements: [] },
];
// The recorder plays the server: the shapes of titan_club_match_v1 (20261128090000), with the scenario's figures (9 against 3).
function running(over = {}) {
  return { id: "m1", format: "cooperation", pace: "reguliere", perWeek: 3, weeks: 1, phase: "running", side: "guest",
    startsAt: "2026-11-18T23:00:00Z", endsAt: "2026-11-25T23:00:00Z", joinUntil: "2026-11-20T23:00:00Z", asOf: "2026-11-23T23:00:00Z",
    threshold: 3, goal: 60, tieMargin: 5,
    us: { name: "Multisport du parc", participants: 2, scored: false, rate: null, total: null, target: null },
    them: { name: `Les Rouleurs ${evil}`, participants: 9, scored: true, rate: 62 },
    common: null, reached: null, lead: null, me: null, can: ["join"], suspended: false, ...over };
}

async function tap(page, locator) { await locator.scrollIntoViewIfNeeded(); await page.waitForTimeout(450); await locator.click({ timeout: 5000 }); }
async function panel({ matchFlag = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Europe/Paris", serviceWorkers: "block", deviceScaleFactor: SHOTS ? 2 : 1 });
  await context.addInitScript(() => { try { localStorage.setItem("titan_cm_open_v1", JSON.stringify(["clubs"])); } catch {} });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/social");
  await page.waitForFunction(() => window.TitanClubs && window.TitanClubMatch && window.state?.user);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ matchFlag, owner, clubs, m2 }) => {
    window.calls = [];
    window.model = { c1: { club: "c1", role: "organizer", current: null, last: null, canPropose: true, formats: ["cooperation"] },
                     c2: { club: "c2", role: "member", current: m2, last: null, canPropose: false, formats: ["cooperation"] } };
    window.delay = 0;
    window.onAct = () => ({ data: null, error: null });
    window.onPreview = () => ({ data: null, error: null });
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      let out = { data: null, error: null };
      if (name === "titan_club_my_v1") out = { data: clubs, error: null };
      else if (name === "titan_club_discover_v1") out = { data: [], error: null };
      else if (name === "titan_club_week_v1") out = { data: { club: args.p_club, goal: null, minutes: 300, members: 6, active: 3, canSet: false }, error: null };
      else if (name === "titan_club_match_v1") out = { data: window.model[args.p_club], error: null };
      else if (name === "titan_club_match_preview_v1") out = window.onPreview(args);
      else if (name === "titan_club_match_act_v1") out = window.onAct(args);
      const result = new Promise(r => setTimeout(() => r(out), window.delay)); result.setHeader = () => result; return result;
    };
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    const flags = { enabled: (key, fallback) => key === "screens.clubs" ? true : key === "screens.club_match" ? matchFlag : key === "screens.club_season" ? false : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { matchFlag, owner: OWNER, clubs: CLUBS, m2: running() });
  await page.evaluate(({ base }) => { window.running = (o) => ({ ...base, ...o, us: { ...base.us, ...(o.us || {}) }, them: { ...base.them, ...(o.them || {}) } }); }, { base: running() });
  return { page, context, errors };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }
const text = (page, sel) => page.locator(sel).innerText();
async function axe(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
  return page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
}
const ARGS = { p_club: "c2", p_format: null, p_pace: null, p_weeks: null, p_starts_on: null, p_match: null, p_clear: null, p_again: null };

test("club match: the other club's totals only, explicit joining, the common score as of midnight, leave after a confirmation", async () => {
  const { page, context, errors } = await panel();
  try {
    const box = page.locator("[data-club-match=c2]");
    await box.waitFor();
    assert.match(await box.innerText(), /organisées par les administrateurs des deux clubs\. Chacun choisit de participer/);
    assert.match(await text(page, "[data-club-match=c2] [data-match-me]"), /^Tu ne participes pas\. Participer est un choix/);
    const sides = await box.locator("[data-match-sides] li").allInnerTexts();
    assert.deepEqual(sides, ["Multisport du parc (ton club) : 2 participants · taux affiché à partir de 3 participants",
      `Les Rouleurs ${evil} : 9 participants · 62 % de l’objectif d’équipe`]);
    assert.equal(await text(page, "[data-club-match=c2] [data-match-score]"), "Score commun affiché quand chaque club compte 3 participants.");
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator("#clubs img").count(), 0, "the other club's name is escaped");
    await shot(page, "match-join");
    await page.evaluate(() => {
      window.delay = 250;
      window.onAct = (a) => {
        if (a.p_action === "join") window.model.c2.current = window.running({ us: { participants: 3, scored: true, rate: 66, total: 6, target: 9 }, common: 64, reached: true, me: { status: "active", club: "c2", days: 2, share: 3 }, can: ["leave"] });
        if (a.p_action === "leave") window.model.c2.current = window.running({ us: { participants: 2, scored: false, rate: null, total: null, target: null }, me: { status: "left", club: "c2", days: 2, share: 2 }, can: [] });
        return { data: window.model.c2, error: null };
      };
    });
    const join = box.locator("[data-match-act=join]");
    await join.scrollIntoViewIfNeeded(); await page.waitForTimeout(450);
    await join.dblclick();
    await page.waitForFunction(() => /^Tu participes/.test(document.querySelector("[data-club-match=c2] [data-match-me]")?.innerText || ""));
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_match_act_v1").length), 1, "a double click joins once");
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_match_act_v1")[1]), { ...ARGS, p_action: "join" });
    await page.waitForTimeout(700);
    assert.equal(await text(page, "[data-club-match=c2] [data-match-score]"), "Score commun : 64 % sur 60 % visés — seuil atteint ensemble (arrêté à minuit : personne ne voit quand un membre s’entraîne).");
    assert.match(await text(page, "[data-club-match=c2] [data-match-sides] li:first-child"), /66 % de l’objectif d’équipe \(6 jours actifs sur 9 visés\)/);
    assert.match(await text(page, "[data-club-match=c2] [data-match-me]"), /2 jours actifs comptés sur ta part de 3\. Au-delà de ta part, rien de plus ne compte/);
    await box.locator("[data-match-rules] summary").click();
    assert.match(await text(page, "[data-club-match=c2] [data-match-rules]"), /jusqu’à sa propre part, jamais au-delà\. Il faut 3 participants/);
    await shot(page, "match-running");
    await tap(page, box.locator("[data-match-act=leave]"));
    assert.match(await page.locator("[role=dialog], dialog").last().innerText(), /ta part est réduite au temps passé/);
    await page.getByRole("button", { name: "Quitter", exact: true }).last().click();
    await page.waitForFunction(() => /Tu as quitté la rencontre/.test(document.querySelector("[data-club-match=c2] [data-match-me]")?.innerText || ""));
    assert.equal(await box.locator("[data-match-act]").count(), 0, "nothing more to do");
    assert.ok(!/classement/i.test(await text(page, "[data-club-match=c2] [data-match-sides]")), "no ranking of people");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll at 390 px");
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club match: the organiser proposes (checked on the device), withdraws, previews a received code and accepts it", async () => {
  const { page, context, errors } = await panel();
  try {
    const box = page.locator("[data-club-match=c1]");
    await box.waitFor();
    assert.match(await box.innerText(), /Tu organises les rencontres de ce club \(administrateur\)/);
    await tap(page, box.locator("[data-match-form=c1][data-kind=propose]"));
    const form = page.locator("[data-match-propose-form=c1]");
    await form.waitFor();
    assert.deepEqual(await form.locator("select[data-club-draft^=match-format] option").evaluateAll(o => o.map(x => x.value)), ["cooperation"], "the comparative format is not offered");
    // A start today is refused on the device, before any request.
    const today = await page.evaluate(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }));
    await form.locator("input[data-club-draft^=match-start]").fill(today);
    await tap(page, form.locator("button[type=submit]"));
    await page.waitForFunction(() => /départ entre demain et 28 jours/.test(document.querySelector("[data-club-notice]")?.innerText || ""));
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_match_act_v1").length), 0);
    await page.evaluate(() => {
      window.onAct = (a) => {
        const m = window.model.c1;
        if (a.p_action === "propose") { m.current = { id: "m9", format: a.p_format, pace: a.p_pace, perWeek: 4, weeks: a.p_weeks, phase: "proposed", side: "host", code: "QRST6789",
          startsAt: "2026-12-06T23:00:00Z", endsAt: "2026-12-20T23:00:00Z", joinUntil: "2026-12-08T23:00:00Z", us: { name: "Les Rouleurs" }, them: null, threshold: 3, goal: 60, tieMargin: 5, can: ["stop"] }; m.canPropose = false; }
        if (a.p_action === "stop") { m.current = null; m.canPropose = true; m.last = { id: "m9", phase: "cancelled", stoppedBy: "us", them: null, can: [] }; }
        if (a.p_action === "accept") { m.current = window.running({ side: "guest", phase: "upcoming", startsAt: "2026-11-30T23:00:00Z", endsAt: "2026-12-07T23:00:00Z", joinUntil: "2026-12-02T23:00:00Z", us: { name: "Les Rouleurs", participants: 0, scored: false }, them: { name: "Trail du plateau", participants: 0, scored: false, rate: null }, can: ["join", "stop"] }); m.canPropose = false; m.last = null; }
        return { data: m, error: null };
      };
      window.onPreview = (a) => a.p_code === "WXYZ2345"
        ? { data: { id: "m7", self: false, host: "Trail du plateau", format: "cooperation", pace: "reguliere", perWeek: 3, weeks: 1, startsAt: "2026-11-30T23:00:00Z", endsAt: "2026-12-07T23:00:00Z", joinUntil: "2026-12-02T23:00:00Z", threshold: 3, goal: 60, tieMargin: 5 }, error: null }
        : { data: null, error: null };
    });
    const start = await page.evaluate(() => new Date(Date.now() + 12 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }));
    await form.locator("input[data-club-draft^=match-start]").fill(start);
    await form.locator("select[data-club-draft^=match-weeks]").selectOption("2");
    await form.locator("select[data-club-draft^=match-pace]").selectOption("soutenue");
    await shot(page, "match-propose");
    await tap(page, form.locator("button[type=submit]"));
    await page.waitForFunction(() => /QRST6789/.test(document.querySelector("[data-club-match=c1] [data-match-proposal]")?.innerText || ""));
    const propose = await page.evaluate(() => window.calls.find(c => c[0] === "titan_club_match_act_v1" && c[1].p_action === "propose")[1]);
    assert.deepEqual(propose, { p_club: "c1", p_action: "propose", p_format: "cooperation", p_pace: "soutenue", p_weeks: 2, p_starts_on: start, p_match: null, p_clear: null, p_again: null });
    assert.match(await text(page, "[data-club-match=c1] [data-match-header]"), /^Proposée · départ le 7 décembre, en attente de l’autre club$/);
    await shot(page, "match-code");
    // Withdraw: a confirmation that says the code will stop working.
    await tap(page, box.locator("[data-match-act=stop]"));
    assert.match(await page.locator("[role=dialog], dialog").last().innerText(), /le code ne fonctionnera plus/);
    await page.getByRole("button", { name: "Arrêter", exact: true }).last().click();
    await page.waitForFunction(() => document.querySelector("[data-club-match=c1] [data-match-form]"));
    // A received code: an unknown one is refused, the right one shows the parameters and the other club's name only.
    await tap(page, box.locator("[data-match-form=c1][data-kind=answer]"));
    const answer = page.locator("[data-match-answer-form=c1]");
    await answer.locator("input[data-club-draft^=match-code]").fill("zzzz-zzzz");
    await tap(page, answer.locator("[data-match-preview]"));
    await page.waitForFunction(() => /n’est pas valable/.test(document.querySelector("[data-club-notice]")?.innerText || ""));
    await answer.locator("input[data-club-draft^=match-code]").fill("wxyz-2345");
    await tap(page, answer.locator("[data-match-preview]"));
    await page.waitForFunction(() => document.querySelector("[data-match-preview-box]"));
    const pv = await text(page, "[data-match-preview-box]");
    assert.match(pv, /« Trail du plateau » propose une rencontre/);
    assert.match(pv, /Jamais un nom, une séance ou une présence/);
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_match_preview_v1").map(c => c[1].p_code)), ["ZZZZZZZZ", "WXYZ2345"]);
    await shot(page, "match-preview");
    await tap(page, page.locator("[data-match-accept=c1]"));
    await page.waitForFunction(() => /Départ le 1 décembre · avec « Trail du plateau »/.test(document.querySelector("[data-club-match=c1] [data-match-header]")?.innerText || ""));
    assert.equal(await page.evaluate(() => window.calls.find(c => c[1]?.p_action === "accept")[1].p_match), "m7", "accepted by the proposal's identifier, never by the code");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club match: the recap shows totals by club and one's own part, then asks two questions; a meeting without result says why", async () => {
  const { page, context, errors } = await panel();
  try {
    await page.evaluate(() => {
      window.model.c2 = { club: "c2", role: "member", current: null, canPropose: false, formats: ["cooperation"], last: { id: "m1", phase: "closed", format: "cooperation", pace: "reguliere", weeks: 1,
        startsAt: "2026-11-18T23:00:00Z", endsAt: "2026-11-25T23:00:00Z", side: "guest", threshold: 3, goal: 60, tieMargin: 5, stoppedBy: null,
        us: { name: "Multisport du parc", participants: 3, scored: true, rate: 66, total: 6, target: 9 }, them: { name: "Les Rouleurs", participants: 7, scored: true, rate: 62 },
        common: 64, reached: true, lead: null, me: { days: 3, share: 3, left: false, answered: false }, can: ["feedback"] } };
      window.onAct = (a) => { window.model.c2.last = { ...window.model.c2.last, me: { ...window.model.c2.last.me, answered: true }, can: [] }; return { data: window.model.c2, error: null }; };
    });
    await page.evaluate(() => window.TitanClubs.refresh());
    const box = page.locator("[data-club-match=c2]");
    await page.waitForFunction(() => /Rencontre terminée avec « Les Rouleurs »/.test(document.querySelector("[data-club-match=c2]")?.innerText || ""));
    const recap = await text(page, "[data-club-match=c2] [data-match-report] ul");
    assert.match(recap, /Score commun : 64 % — seuil de 60 % atteint ensemble\./);
    assert.match(recap, /Ta part : 3 jours actifs comptés sur 3\. Elle n’est montrée qu’à toi\./);
    assert.match(recap, /Aucun classement de personnes/);
    // The two questions of the pilot: both are needed.
    await tap(page, box.locator("[data-match-feedback-form] button[type=submit]"));
    await page.waitForFunction(() => /Réponds aux deux questions/.test(document.querySelector("[data-club-notice]")?.innerText || ""));
    await box.locator("input[name^=match-clear][value=no]").check();
    await box.locator("input[name^=match-again][value=yes]").check();
    await shot(page, "match-recap");
    await tap(page, box.locator("[data-match-feedback-form] button[type=submit]"));
    await page.waitForFunction(() => !document.querySelector("[data-match-feedback-form]"));
    assert.deepEqual(await page.evaluate(() => window.calls.find(c => c[1]?.p_action === "feedback")[1]), { ...ARGS, p_action: "feedback", p_clear: false, p_again: true });
    await page.evaluate(() => { window.model.c2.last = { ...window.model.c2.last, phase: "short", them: { name: "Les Rouleurs", participants: 2, scored: false, rate: null }, common: null, reached: null, can: [] }; });
    await page.evaluate(() => window.TitanClubs.refresh());
    await page.waitForFunction(() => /sans résultat/.test(document.querySelector("[data-club-match=c2]")?.innerText || ""));
    assert.match(await text(page, "[data-club-match=c2] [data-match-report]"), /moins de 3 participants à la fin : pas de résultat, pour que personne ne puisse en déduire la part d’un autre/);
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club match: flag closed, the block is not shown and the server is not asked", async () => {
  const { page, context, errors } = await panel({ matchFlag: false });
  try {
    await page.locator("[data-club=c2]").waitFor();
    assert.equal(await page.locator("[data-club-match]").count(), 0);
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0].startsWith("titan_club_match")).length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
