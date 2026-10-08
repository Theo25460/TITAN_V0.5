import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function load() {
  const window = { SPORTS_CONFIG: {
    running: { label: "Course à pied", unit: "km", balanceProfile: "running" },
    muscu_gym: { label: "Musculation", unit: "kg", balanceProfile: "strength" },
    bouldering: { label: "Escalade bloc", unit: "min", balanceProfile: "climbing" },
    yoga: { label: "Yoga", unit: "min", balanceProfile: "mobility" },
  } };
  const context = { window, console, Date, Intl, Math, Number, String, Set, Map, JSON, Array, Object, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { clear() {} } };
  vm.createContext(context);
  for (const file of ["training-store", "sport-insights", "core/format", "core/effort", "core/progress"])
    vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"), context);
  return window;
}
const W = load();
const P = W.TitanProgress;
const NOW = new Date("2026-10-07T18:00:00"); // Wednesday
let n = 0;
const log = (date, fields = {}) => ({ id: `l${++n}`, sport: "running", unit: "km", val: 5, date, details: { duration: 30 }, xp: 300, ...fields });

test("cadence holds a week by active days, ignores rest and pause weeks", () => {
  const logs = [
    // previous week (Sept 28 – Oct 4): three active days -> held
    log("2026-09-28T07:00:00"), log("2026-09-30T07:00:00"), log("2026-10-02T07:00:00"), log("2026-10-02T18:00:00"),
    // two weeks ago: one day -> partial
    log("2026-09-22T07:00:00"),
    // current week: two days so far
    log("2026-10-05T07:00:00"), log("2026-10-06T07:00:00"),
  ];
  const c = P.cadence(logs, { target: 3, now: NOW, pauses: ["2026-09-14"] });
  const byStart = Object.fromEntries(c.weeks.map((w) => [w.start, w]));
  assert.equal(byStart["2026-09-28"].state, "held");
  assert.equal(byStart["2026-09-21"].state, "partial");
  assert.equal(byStart["2026-09-14"].state, "pause");
  assert.equal(byStart["2026-10-05"].state, "current");
  assert.equal(c.held, 1);
  assert.equal(c.window, 7, "the paused week leaves the window");
  assert.equal(c.remaining, 1);
  assert.equal(c.reachable, true);
  assert.equal(c.weeks.length, 8);
});

test("cadence keeps every local week across spring clock changes", () => {
  for (const anchor of ["2026-03-30T12:00:00", "2026-03-09T12:00:00"]) {
    const now = new Date(anchor);
    const previous = new Date(now);
    previous.setDate(previous.getDate() - 7);
    const paused = new Date(now);
    paused.setDate(paused.getDate() - 14);
    const key = (d) => W.TitanFormat.dateKey(d);
    const c = P.cadence([log(previous.toISOString())], { now, target: 1, pauses: [key(paused)], window: 3 });
    assert.deepEqual(Array.from(c.weeks, (w) => w.start), [key(paused), key(previous), key(now)]);
    assert.equal(c.weeks[0].state, "pause");
    assert.equal(c.weeks[1].state, "held");
  }
});

test("cadence calendar regressions pass in UTC, Paris and American time zones", () => {
  for (const TZ of ["UTC", "Europe/Paris", "America/New_York", "America/Sao_Paulo"]) {
    execFileSync(process.execPath, ["--test", "--test-name-pattern=^cadence holds|^cadence keeps", new URL(import.meta.url).pathname], { env: { ...process.env, TZ }, stdio: "pipe" });
  }
});

test("mastery needs both practice hours and practised weeks", () => {
  assert.equal(P.masteryLevel(13, 9).name, "Régularité");
  assert.equal(P.masteryLevel(40, 9).name, "Régularité", "hours alone are not enough");
  assert.equal(P.masteryLevel(0, 0).name, "Découverte");
  const logs = Array.from({ length: 12 }, (_, i) => log(new Date(Date.parse("2026-07-06T07:00:00") + i * 7 * 86400000).toISOString(), { details: { duration: 60 } }));
  const m = P.mastery(logs, NOW).find((x) => x.sport === "running");
  assert.equal(m.hours, 12);
  assert.equal(m.weeks, 12);
  assert.equal(m.level, 4);
  assert.equal(m.next.name, "Solidité");
});

test("next action: first session, pending corrections, goals, return after a pause", () => {
  assert.equal(P.nextAction({ logs: [], now: NOW }).id, "first");
  const logs = [log("2026-09-20T07:00:00", { val: 8 }), log("2026-09-22T07:00:00", { val: 8 }), log("2026-09-24T07:00:00", { val: 9 })];
  const goal = { id: "g1", title: "30 km", metric: "distance", target: 30, start_date: "2026-09-01", end_date: "2026-10-31" };
  const pending = [{ status: "error", payload: {} }];
  assert.equal(P.nextAction({ logs, goals: [goal], pending, now: NOW }).id, "sync-error");
  const g = P.nextAction({ logs, goals: [goal], now: NOW });
  assert.equal(g.id, "goal-g1");
  assert.match(g.title, /Encore 5 km pour « 30 km »/);
  assert.ok(g.why.includes("séances contributrices"));
  const back = P.nextAction({ logs, now: NOW });
  assert.equal(back.id, "return");
  assert.ok(back.why.includes("13 jours"));
});

test("insights explain records with the previous mark and never invent one for a first session", () => {
  const logs = [log("2026-09-10T07:00:00", { val: 10, details: { duration: 55 } }), log("2026-10-06T07:00:00", { val: 12.4, details: { duration: 70 } })];
  const records = P.insights({ logs, now: NOW }).filter((i) => i.id.startsWith("record-"));
  const ids = records.map((r) => r.id).sort();
  assert.equal(ids.join(","), "record-distance:running,record-duration:running", "longest distance and longest duration both improved");
  const dist = records.find((r) => r.id === "record-distance:running");
  assert.equal(dist.title, "Course à pied : plus longue distance");
  assert.match(dist.value, /12,4\skm/);
  assert.match(dist.why, /Précédent repère : 10\skm/);
  const first = P.insights({ logs: [log("2026-10-06T07:00:00")], now: NOW }).filter((i) => i.id.startsWith("record-"));
  assert.equal(first.length, 0);
});

test("weekly recap compares with the four previous weeks and finds the week's records", () => {
  const logs = [
    log("2026-09-08T07:00:00", { details: { duration: 30 } }),
    log("2026-09-15T07:00:00", { details: { duration: 30 } }),
    log("2026-09-22T07:00:00", { details: { duration: 30 } }),
    log("2026-09-29T07:00:00", { val: 8, details: { duration: 45 } }),
    log("2026-10-01T07:00:00", { sport: "yoga", unit: "min", val: 40, details: {} }),
  ];
  const r = P.recap(logs, { now: NOW });
  assert.equal(r.week.sessions, 2);
  assert.equal(r.week.minutes, 85);
  assert.equal(r.baseline.minutes, 30);
  assert.equal(r.deltaMinutes, 55);
  assert.equal(r.topSport.sport, "running");
  assert.ok(r.records.some((x) => x.kind === "distance"), "longest distance improved this week");
  assert.equal(r.bestOfRecentWeeks, true);
});

test("DNA describes real practice by family, without invented scores", () => {
  const logs = [
    log("2026-09-01T07:00:00", { details: { duration: 60 } }),
    log("2026-09-03T07:00:00", { details: { duration: 60 } }),
    log("2026-09-05T19:00:00", { sport: "muscu_gym", unit: "kg", val: 3000, details: { duration: 60 } }),
    log("2026-09-07T19:00:00", { sport: "bouldering", unit: "min", val: 60, details: {} }),
    log("2026-09-09T07:00:00", { details: { duration: 60 } }),
  ];
  const d = P.dna(logs, NOW);
  assert.equal(d.sessions, 5);
  assert.equal(d.families[0].id, "endurance");
  assert.equal(Math.round(d.families[0].share * 100), 60);
  assert.equal(d.timeOfDay, "matin");
  assert.equal(d.enough, true);
  assert.equal(d.topSports[0].sport, "running");
});

test("offline catalog: core sports exist without the network and search ranks the obvious answer first", () => {
  const window = { SPORTS_CONFIG: {} };
  const context = { window, console, Intl };
  vm.createContext(context);
  for (const file of ["core/sports-catalog", "core/sports"])
    vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"), context);
  const S = window.TitanSports;
  assert.ok(S.ensure() > 200);
  for (const id of ["running", "walking", "hiking", "trail", "muscu_gym", "yoga", "swimming", "bouldering"])
    assert.ok(window.SPORTS_CONFIG[id], `${id} available offline`);
  assert.equal(S.search("course")[0].id, "running");
  assert.equal(S.search("course a pied")[0].id, "running");
  assert.equal(S.search("Course à pied")[0].id, "running");
  assert.equal(S.search("velo")[0].id, "cycling");
  assert.equal(S.search("muscu")[0].id, "muscu_gym");
  assert.equal(S.search("bloc")[0].id, "bouldering");
  assert.equal(S.label("running"), "Course à pied");
  assert.equal(S.formOf("running"), "distance");
  assert.equal(S.formOf("swimming"), "swim");
  assert.equal(S.formOf("muscu_gym"), "strength");
  assert.equal(S.formOf("tractions"), "bodyweight");
  assert.equal(S.formOf("bouldering"), "climbing");
  assert.equal(S.formOf("football"), "practice");
  assert.equal(S.paceMode("running"), "pace");
  assert.equal(S.paceMode("cycling"), "speed");
  window.SPORTS_CONFIG.running = { label: "Course (Route)", unit: "km", balanceProfile: "running", extraFields: [{ id: "avg_hr" }] };
  S.ensure();
  assert.equal(window.SPORTS_CONFIG.running.extraFields.length, 1, "online entries are never overridden");
  assert.equal(S.label("running"), "Course à pied");
});

test("a planned session for today becomes a recommendation until something is recorded", () => {
  const plan = { sport: "running", minutes: 45, note: "" };
  const ins = P.insights({ logs: [log("2026-10-01T07:00:00")], now: NOW, plan });
  const p = ins.find((i) => i.id === "plan-today");
  assert.ok(p, "plan insight present");
  assert.equal(p.cta.href, "/training?sport=running");
  assert.match(p.why, /semaine type/);
  const done = P.insights({ logs: [log("2026-10-07T07:00:00", { sport: "yoga", unit: "min", val: 30 })], now: NOW, plan });
  assert.equal(done.find((i) => i.id === "plan-today"), undefined);
});
