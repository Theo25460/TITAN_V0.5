// V1.8.6 — Agenda et rendez-vous d’équipe in the Communauté › Clubs. Behind the server flags screens.clubs and screens.club_agenda;
// driven with a recorder instead of a real project. A member reads a meeting (counts, never a name; the precise place only once they
// come), answers « Je viens » with a double click that sends one answer and is put on the waiting list when it is full, reads a move to
// confirm and the history, asks for a reminder, changes their mind. The organiser proposes a weekly series at a Paris time, moves an
// occurrence, switches to the fallback, cancels after a confirmation, cancels and resumes the series, reads who answered what and the
// invitation link. After the meeting, a member says they were there and links one of their own sessions of the day (never written for
// them). An invitation link that expired says nothing of the meeting. Flag closed: nothing is shown or asked. Text is escaped.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const ROOT = new URL("../..", import.meta.url).pathname;
const OWNER = "00000000-0000-4000-8000-000000000986";
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
  { id: "c1", name: "Les Rouleurs du jeudi", description: null, discoverable: false, role: "admin", members: 9, code: "ABCD2345", roster: [], announcements: [] },
  { id: "c2", name: "Trail du dimanche", description: null, discoverable: false, role: "member", members: 12, code: null, roster: null, announcements: [] },
];
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
// The recorder plays the server: one occurrence as titan_club_agenda_slot gives it.
function slot(over = {}) {
  const start = Date.now() + 3 * DAY;
  return { id: "s2", event: "e2", n: 1, occurrences: 1, recurrence: "once", title: `Sortie du samedi ${evil}`, area: "Parc de la Tête d’Or", durationMin: 120,
    startsAt: iso(start), endsAt: iso(start + 2 * 3600000), plannedAt: iso(start), moved: false, phase: "upcoming", series: "active",
    fallback: "Si pluie : séance de renfo au gymnase", fallbackOn: false, capacity: 3, full: false, counts: { yes: 2, maybe: 1, waitlist: 0, no: 1 },
    hasPlace: true, place: null, code: null, me: null, can: ["yes", "maybe", "no"], report: null, suspended: false,
    history: [{ kind: "created", n: null, from: null, to: iso(start), at: iso(Date.now() - 3600000) }], roster: null, ...over };
}

async function tap(page, locator) { await locator.scrollIntoViewIfNeeded(); await page.waitForTimeout(450); await locator.click({ timeout: 5000 }); }
async function panel({ agendaFlag = true, path = "/social", invite = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Europe/Paris", serviceWorkers: "block", deviceScaleFactor: SHOTS ? 2 : 1 });
  await context.addInitScript(() => { try { localStorage.setItem("titan_cm_open_v1", JSON.stringify(["clubs"])); } catch {} });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort("internetdisconnected"));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.TitanClubs && window.TitanClubAgenda && window.state?.user);
  await page.evaluate(async () => { await window.syncWithSupabase?.(); window.syncWithSupabase = async () => {}; });
  await page.evaluate(({ agendaFlag, owner, clubs, s2, invite }) => {
    window.calls = [];
    window.model = { c1: { club: "c1", role: "organizer", canCreate: true, upcoming: [], past: [] }, c2: { club: "c2", role: "member", canCreate: false, upcoming: [s2], past: [] } };
    window.delay = 0;
    window.inviteAnswer = invite;
    window.onAct = () => ({ data: null, error: { message: "AGENDA_INVALID" } });
    window.titanClient.rpc = (name, args = {}) => {
      window.calls.push([name, args]);
      let out = { data: null, error: null };
      if (name === "titan_club_my_v1") out = { data: clubs, error: null };
      else if (name === "titan_club_discover_v1") out = { data: [], error: null };
      else if (name === "titan_club_week_v1") out = { data: { club: args.p_club, goal: null, minutes: 300, members: 6, active: 3, canSet: false }, error: null };
      else if (name === "titan_club_agenda_v1") out = { data: window.model[args.p_club], error: null };
      else if (name === "titan_club_agenda_invite_v1") out = { data: window.inviteAnswer, error: null };
      else if (name === "titan_club_agenda_act_v1") out = window.onAct(args);
      const result = new Promise(r => setTimeout(() => r(out), window.delay)); result.setHeader = () => result; return result;
    };
    let pinned = window.state.user; pinned.id = owner;
    Object.defineProperty(window.state, "user", { configurable: true, get: () => pinned, set: (next) => { pinned = Object.assign(next || {}, { id: owner }); } });
    const flags = { enabled: (key, fallback) => key === "screens.clubs" ? true : key === "screens.club_agenda" ? agendaFlag : fallback, refresh: async () => {} };
    Object.defineProperty(window, "titanFlags", { configurable: true, get: () => flags, set: () => {} });
    window.dispatchEvent(new CustomEvent("titan:account-changed"));
  }, { agendaFlag, owner: OWNER, clubs: CLUBS, s2: slot(), invite });
  await page.evaluate((base) => { window.slotOf = (over = {}) => ({ ...structuredClone(base), ...over }); }, slot());
  return { page, context, errors };
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }
const text = (page, sel) => page.locator(sel).first().innerText();
async function axe(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: ROOT + "node_modules/axe-core/axe.min.js" });
  return page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }).then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join("|")}`)));
}
const actCalls = (page) => page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_agenda_act_v1").map(c => c[1]));

test("club agenda: a member reads counts and never a name, answers once with a double click, waits for a place, confirms a move, changes their mind", async () => {
  const { page, context, errors } = await panel();
  try {
    const box = page.locator("[data-club-agenda=c2]");
    await box.waitFor();
    assert.match(await text(page, "[data-club-agenda=c2] [data-agenda-role]"), /jamais qui a répondu quoi/);
    assert.match(await text(page, "[data-club-agenda=c2] [data-agenda-counts]"), /^2 viennent · 1 peut-être · 1 ne vient pas · 2 places prises sur 3$/);
    assert.match(await text(page, "[data-club-agenda=c2] [data-agenda-place]"), /Le lieu précis est donné à ceux qui viennent/);
    assert.match(await box.innerText(), /En cas de changement : Si pluie : séance de renfo au gymnase/);
    assert.equal(await box.locator("[data-agenda-roster]").count(), 0, "a member never reads who answered");
    assert.equal(await box.locator("[data-agenda-code]").count(), 0, "nor the invitation link");
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator("#clubs img").count(), 0, "the title is escaped");
    await shot(page, "agenda-member");
    // « Je viens » on a meeting that just became full: one request, kept on the waiting list, the place now readable.
    await page.evaluate(() => {
      window.delay = 250;
      window.onAct = (a) => {
        const s = window.model.c2.upcoming[0];
        if (a.p_action === "answer" && a.p_answer === "yes") Object.assign(s, { full: true, counts: { yes: 3, maybe: 1, waitlist: 1, no: 1 }, place: "Parking nord, portail vert",
          me: { answer: "waitlist", position: 1, reminder: false, toConfirm: false, promoted: false }, can: ["maybe", "no", "remind"] });
        if (a.p_action === "remind") s.me = { ...s.me, reminder: a.p_on };
        if (a.p_action === "answer" && a.p_answer === "no") Object.assign(s, { place: null, counts: { yes: 3, maybe: 1, waitlist: 0, no: 2 }, me: { answer: "no", reminder: false }, can: ["yes", "maybe"] });
        return { data: window.model.c2, error: null };
      };
    });
    const yes = box.locator("[data-agenda-act=answer][data-answer=yes]");
    await yes.scrollIntoViewIfNeeded(); await page.waitForTimeout(450);
    await yes.dblclick();
    await page.waitForFunction(() => /En attente d’une place/.test(document.querySelector("[data-club-agenda=c2] [data-agenda-me]")?.innerText || ""));
    const calls = await actCalls(page);
    assert.equal(calls.length, 1, "a double click answers once");
    assert.deepEqual(calls[0], { p_club: "c2", p_action: "answer", p_slot: "s2", p_event: null, p_answer: "yes", p_on: null, p_starts_at: null, p_log: null, p_form: null });
    assert.match(await text(page, "[data-club-notice]"), /C’est complet : tu es 1re dans la file d’attente/);
    assert.match(await text(page, "[data-club-agenda=c2] [data-agenda-place]"), /^Lieu précis : Parking nord, portail vert$/);
    assert.match(await text(page, "[data-club-agenda=c2] [data-agenda-counts]"), /3 places prises sur 3 \(complet\)/);
    await tap(page, box.locator("[data-agenda-act=remind]"));
    await page.waitForFunction(() => /Rappel demandé/.test(document.querySelector("[data-club-agenda=c2] [data-agenda-me]")?.innerText || ""));
    assert.equal((await actCalls(page))[1].p_on, true);
    // The organiser moved it and switched to the fallback: the answer stays, to confirm; the history says from when to when.
    await page.evaluate(() => {
      const s = window.model.c2.upcoming[0], was = s.startsAt, to = new Date(Date.parse(was) + 86400000 + 3600000).toISOString();
      Object.assign(s, { startsAt: to, moved: true, fallbackOn: true, me: { answer: "yes", promoted: true, toConfirm: true, reminder: true }, counts: { yes: 3, maybe: 1, waitlist: 0, no: 1 },
        history: [...s.history, { kind: "moved", n: null, from: was, to, at: new Date().toISOString() }, { kind: "fallback_on", n: null, from: to, to, at: new Date().toISOString() }] });
    });
    await page.evaluate(() => window.TitanClubs.refresh());
    await page.waitForFunction(() => /confirme-la ou change d’avis/.test(document.querySelector("[data-club-agenda=c2] [data-agenda-me]")?.innerText || ""));
    assert.match(await box.innerText(), /Déplacé : prévu d’abord /);
    assert.match(await box.innerText(), /Plan de repli activé : Si pluie/);
    await tap(page, box.locator("[data-agenda-history] summary"));
    const hist = await text(page, "[data-club-agenda=c2] [data-agenda-history]");
    assert.match(hist, /Déplacé le \d+ \w+ : de \w+ \d+ \w+ à \d+\sh\s\d\d à \w+ \d+ \w+ à \d+\sh\s\d\d\./);
    assert.match(hist, /Passé au plan de repli le/);
    assert.ok(!/qa_|par /.test(hist), "the history never says who");
    await shot(page, "agenda-moved");
    // Change of mind: « Je ne viens pas »; the time, the fallback and the history stay readable, the precise place does not.
    await tap(page, box.locator("[data-agenda-act=answer][data-answer=no]"));
    await page.waitForFunction(() => /Ta réponse : Je ne viens pas/.test(document.querySelector("[data-club-agenda=c2] [data-agenda-me]")?.innerText || ""));
    assert.match(await box.innerText(), /Plan de repli activé/);
    assert.match(await text(page, "[data-club-agenda=c2] [data-agenda-place]"), /Le lieu précis est donné à ceux qui viennent/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll at 390 px");
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club agenda: the organiser proposes a weekly series at a Paris time, moves, switches to the fallback, cancels and resumes after confirmations", async () => {
  const { page, context, errors } = await panel();
  try {
    const box = page.locator("[data-club-agenda=c1]");
    await box.waitFor();
    assert.match(await box.innerText(), /Tu organises les rendez-vous de ce club \(administrateur\) : tu vois qui a répondu quoi/);
    await tap(page, box.locator("[data-agenda-form=c1]"));
    const form = page.locator("[data-agenda-create-form=c1]");
    await form.waitFor();
    await form.locator("input[data-club-draft^=agenda-title]").fill("ab");
    await tap(page, form.locator("button[type=submit]"));
    await page.waitForFunction(() => /Vérifie le titre/.test(document.querySelector("[data-club-notice]")?.innerText || ""));
    assert.equal((await actCalls(page)).length, 0, "refused on the device, no request");
    await page.evaluate(() => {
      window.onAct = (a) => {
        const m = window.model.c1, s = m.upcoming[0];
        if (a.p_action === "create") {
          const f = a.p_form;
          m.upcoming = [window.slotOf({ id: "s1", event: "e1", title: f.title, area: f.area, recurrence: f.recurrence, occurrences: f.occurrences, n: 1, capacity: f.capacity,
            startsAt: f.startsAt, plannedAt: f.startsAt, place: f.place, fallback: f.fallback, code: "QRST2345", counts: { yes: 0, maybe: 0, waitlist: 0, no: 0 },
            can: ["yes", "maybe", "no", "move", "fallback", "cancel"], roster: [] })];
        }
        if (a.p_action === "move") Object.assign(s, { startsAt: a.p_starts_at, moved: true, history: [...s.history, { kind: "moved", from: s.plannedAt, to: a.p_starts_at, at: new Date().toISOString() }] });
        if (a.p_action === "fallback") s.fallbackOn = a.p_on;
        if (a.p_action === "cancel") Object.assign(s, { phase: "cancelled", can: ["restore"], history: [...s.history, { kind: "cancelled", n: 1, at: new Date().toISOString() }] });
        if (a.p_action === "cancel_series") Object.assign(s, { phase: "cancelled", series: "cancelled", can: [], history: [...s.history, { kind: "series_cancelled", at: new Date().toISOString() }] });
        if (a.p_action === "resume_series") Object.assign(s, { phase: "upcoming", series: "active", can: ["yes", "maybe", "no", "move", "fallback", "cancel"], history: [...s.history, { kind: "series_resumed", at: new Date().toISOString() }] });
        if (a.p_action === "restore") Object.assign(s, { phase: "upcoming", can: ["yes", "maybe", "no", "move", "fallback", "cancel"] });
        return { data: m, error: null };
      };
    });
    // A date in March 2027 if the 60-day window reaches it is not needed: the time is read in Paris whatever the change of hour.
    const day = await page.evaluate(() => new Date(Date.now() + 10 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }));
    await form.locator("input[data-club-draft^=agenda-title]").fill("Footing du jeudi");
    await form.locator("input[data-club-draft^=agenda-date]").fill(day);
    await form.locator("input[data-club-draft^=agenda-time]").fill("18:30");
    await form.locator("select[data-club-draft^=agenda-dur]").selectOption("60");
    await form.locator("input[data-club-draft^=agenda-area]").fill("Quais du Rhône");
    await form.locator("input[data-club-draft^=agenda-place]").fill("Pont Lafayette, rive gauche");
    await form.locator("input[data-club-draft^=agenda-fallback]").fill("Si orage : renfo à la salle du club");
    await form.locator("input[data-club-draft^=agenda-cap]").fill("8");
    await form.locator("select[data-club-draft^=agenda-rec]").selectOption("weekly");
    await page.locator("[data-agenda-create-form=c1] select[data-club-draft^=agenda-occ]").waitFor();
    await page.locator("[data-agenda-create-form=c1] select[data-club-draft^=agenda-occ]").selectOption("6");
    await shot(page, "agenda-create");
    await tap(page, page.locator("[data-agenda-create-form=c1] button[type=submit]"));
    await page.waitForFunction(() => /Footing du jeudi/.test(document.querySelector("[data-club-agenda=c1]")?.innerText || ""));
    const create = (await actCalls(page)).find(a => a.p_action === "create").p_form;
    const paris = await page.evaluate((at) => new Date(at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }), create.startsAt);
    assert.equal(paris, `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} 18:30`, "the instant sent is 18:30 in Paris");
    assert.deepEqual({ ...create, startsAt: null }, { title: "Footing du jeudi", area: "Quais du Rhône", place: "Pont Lafayette, rive gauche", fallback: "Si orage : renfo à la salle du club",
      durationMin: 60, capacity: 8, recurrence: "weekly", occurrences: 6, startsAt: null });
    assert.match(await box.innerText(), /rendez-vous 1 sur 6, chaque semaine/);
    assert.match(await text(page, "[data-club-agenda=c1] [data-agenda-code]"), /\/social\.html\?rdv=QRST2345$/);
    assert.equal(await box.locator("[data-agenda-roster]").count(), 1, "the organiser reads the answers");
    // Move: a date and a Paris time, sent as one instant.
    await tap(page, box.locator("[data-agenda-act=move]"));
    const moveForm = page.locator("[data-agenda-move-form=s1]");
    await moveForm.waitFor();
    await moveForm.locator("input[type=time]").fill("19:00");
    await tap(page, moveForm.locator("[data-agenda-move]"));
    await page.waitForFunction(() => /Déplacé : prévu d’abord/.test(document.querySelector("[data-club-agenda=c1]")?.innerText || ""));
    const moved = (await actCalls(page)).find(a => a.p_action === "move");
    assert.equal(await page.evaluate((at) => new Date(at).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }), moved.p_starts_at), "19:00");
    assert.match(await text(page, "[data-club-notice]"), /les réponses restent, à confirmer par chacun/);
    await tap(page, box.locator("[data-agenda-act=fallback]"));
    await page.waitForFunction(() => /Plan de repli activé/.test(document.querySelector("[data-club-agenda=c1]")?.innerText || ""));
    assert.equal((await actCalls(page)).find(a => a.p_action === "fallback").p_on, true);
    // Cancel one occurrence: a confirmation first.
    await tap(page, box.locator("[data-agenda-act=cancel]"));
    assert.match(await page.locator("[role=dialog], dialog").last().innerText(), /Tu pourras le rétablir avant l’heure prévue/);
    await page.getByRole("button", { name: "Annuler le rendez-vous", exact: true }).last().click();
    await page.waitForFunction(() => /Annulé par les administrateurs du club/.test(document.querySelector("[data-club-agenda=c1]")?.innerText || ""));
    await tap(page, box.locator("[data-agenda-act=restore]"));
    await page.waitForFunction(() => document.querySelector("[data-club-agenda=c1] [data-agenda-slot=s1]")?.dataset.phase === "upcoming");
    // The whole series: cancelled in place, then resumed with the same occurrences.
    await tap(page, box.locator("[data-agenda-series=cancel_series]"));
    assert.match(await page.locator("[role=dialog], dialog").last().innerText(), /sans rien effacer/);
    await page.getByRole("button", { name: "Annuler la série", exact: true }).last().click();
    await page.waitForFunction(() => /la série a été annulée/.test(document.querySelector("[data-club-agenda=c1]")?.innerText || ""));
    await tap(page, box.locator("[data-agenda-series=resume_series]"));
    await page.waitForFunction(() => /Série reprise, avec les mêmes rendez-vous/.test(document.querySelector("[data-club-notice]")?.innerText || ""));
    const series = (await actCalls(page)).filter(a => a.p_action.endsWith("_series"));
    assert.deepEqual(series.map(a => [a.p_action, a.p_event]), [["cancel_series", "e1"], ["resume_series", "e1"]]);
    await shot(page, "agenda-organiser");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club agenda: after the meeting, a presence is declared and one's own session linked by choice, the report shows totals from 3", async () => {
  const { page, context, errors } = await panel();
  try {
    await page.evaluate(() => {
      const start = Date.now() - 5 * 3600000;
      window.model.c2.past = [window.slotOf({ id: "p1", title: "Sortie de dimanche", startsAt: new Date(start).toISOString(), endsAt: new Date(start + 7200000).toISOString(),
        plannedAt: new Date(start).toISOString(), phase: "ended", can: ["attend"], counts: { yes: 4, maybe: 0, waitlist: 0, no: 1 }, me: { answer: "yes" },
        report: { present: 2, linked: 2, threshold: 3, visible: false } })];
      window.onAct = (a) => {
        const s = window.model.c2.past[0];
        if (a.p_action === "attend" && a.p_on) Object.assign(s, { can: ["attend", "link"], me: { answer: "yes", attended: true, linked: null, candidates: [{ id: "log-1", sport: "cycling", minutes: 90, unit: "km", val: 42 }] }, report: { ...s.report, present: 3 } });
        if (a.p_action === "link") Object.assign(s, { can: ["attend", "unlink"], me: { answer: "yes", attended: true, linked: { id: "log-1", sport: "cycling", minutes: 90 } }, report: { present: 3, linked: 3, threshold: 3, visible: true, minutes: 280, km: 121, sports: 2 } });
        if (a.p_action === "unlink") Object.assign(s, { can: ["attend", "link"], me: { answer: "yes", attended: true, linked: null, candidates: [{ id: "log-1", sport: "cycling", minutes: 90, unit: "km", val: 42 }] }, report: { present: 3, linked: 2, threshold: 3, visible: false } });
        return { data: window.model.c2, error: null };
      };
    });
    await page.evaluate(() => window.TitanClubs.refresh());
    const card = page.locator("[data-agenda-slot=p1]");
    await card.waitFor();
    assert.match(await card.innerText(), /Tu peux dire si tu y étais\. Rien n’est écrit dans ton journal\./);
    assert.match(await card.innerText(), /Les totaux du groupe s’affichent à partir de 3 séances associées/);
    await tap(page, card.locator("[data-agenda-act=attend][data-on=true]"));
    await page.waitForFunction(() => document.querySelector("[data-agenda-slot=p1] select[data-club-draft^=agenda-log]"));
    assert.match(await card.locator("select[data-club-draft^=agenda-log] option").first().innerText(), /^Vélo · 90 min · 42 km$/);
    await tap(page, card.locator("[data-agenda-link=p1]"));
    await page.waitForFunction(() => /280 min d’effort ensemble · 121 km · 2 disciplines/.test(document.querySelector("[data-agenda-slot=p1]")?.innerText || ""));
    const link = (await actCalls(page)).find(a => a.p_action === "link");
    assert.equal(link.p_log, "log-1");
    assert.match(await card.innerText(), /Ta séance associée : Vélo · 90 min\./);
    assert.match(await card.innerText(), /Aucune séance n’est écrite à ta place/);
    assert.ok(!(await page.evaluate(() => window.calls.some(c => /training|log_create|session_create/.test(c[0])))), "no session is ever written");
    await shot(page, "agenda-report");
    await tap(page, card.locator("[data-agenda-act=unlink]"));
    await page.waitForFunction(() => /Les totaux du groupe s’affichent à partir de 3/.test(document.querySelector("[data-agenda-slot=p1]")?.innerText || ""));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(await axe(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("club agenda: an expired invitation link says nothing of the meeting; an open one brings the meeting into view", async () => {
  {
    const { page, context, errors } = await panel({ path: "/social?rdv=abcd-efgh#clubs", invite: { status: "expired" } });
    try {
      await page.waitForFunction(() => /Cette invitation a expiré/.test(document.querySelector("[data-club-notice]")?.innerText || ""));
      const asked = await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_agenda_invite_v1").map(c => c[1]));
      assert.deepEqual(asked, [{ p_code: "ABCDEFGH" }], "the code is asked once, cleaned");
      assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get("rdv")), null, "the code leaves the address");
      const notice = await text(page, "[data-club-notice]");
      assert.ok(!/Sortie|Parc|h\s\d\d/.test(notice), "no title, no place, no time");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  {
    const { page, context, errors } = await panel({ path: "/social?rdv=QRST2345", invite: { status: "open", club: "c2", slot: slot() } });
    try {
      await page.waitForFunction(() => document.querySelector("[data-agenda-focus]"));
      await page.waitForFunction(() => document.activeElement?.dataset?.agendaSlot === "s2", null, { timeout: 3000 });
      assert.equal(await page.evaluate(() => document.activeElement?.dataset?.agendaSlot), "s2", "the meeting the link opened takes the focus");
      assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c[0] === "titan_club_agenda_invite_v1").map(c => c[1])), [{ p_code: "QRST2345" }]);
      assert.equal(await page.locator("[data-club-notice]").count(), 0, "nothing to explain");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("club agenda: flag closed, the agenda is not shown and the server is not asked", async () => {
  const { page, context, errors } = await panel({ agendaFlag: false, path: "/social?rdv=ABCDEFGH" });
  try {
    await page.locator("[data-club=c2]").waitFor();
    assert.equal(await page.locator("[data-club-agenda]").count(), 0);
    assert.equal(await page.evaluate(() => window.calls.filter(c => c[0].startsWith("titan_club_agenda")).length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
