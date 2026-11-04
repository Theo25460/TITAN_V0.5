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
  for (const file of ["training-store", "sport-insights", "core/format", "core/effort", "core/progress", "core/questions"])
    vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"), context);
  return window;
}
const W = load();
const Q = W.TitanQuestions;
const NOW = new Date("2026-10-07T18:00:00"); // Wednesday
const DAY = 86400000;
let n = 0;
const run = (daysAgo, km, minutes, rpe) => ({ id: `r${++n}`, sport: "running", unit: "km", val: km, date: new Date(NOW.getTime() - daysAgo * DAY).toISOString(), details: { duration: minutes, ...(rpe ? { bio: { rpe } } : {}) } });

test("weekly series ends with the current week and counts minutes", () => {
  const s = Q.weeklySeries([run(0, 5, 30), run(1, 5, 30), run(8, 10, 60)], { weeks: 4, now: NOW });
  assert.equal(s.length, 4);
  assert.equal(s[3].current, true);
  assert.equal(s[3].minutes, 60);
  assert.equal(s[3].sessions, 2);
  assert.equal(s[2].minutes, 60);
});

test("question weeks include a late Sunday but never the following Monday", () => {
  for (const [now, sunday, next] of [["2026-10-26T12:00:00", "2026-10-25", "2026-10-26"], ["2026-11-02T12:00:00", "2026-11-01", "2026-11-02"]]) {
    const logs = [{ ...run(1, 5, 30), date: `${sunday}T23:30:00` }, { ...run(1, 5, 40), date: `${next}T00:00:00` }];
    const s = Q.weeklySeries(logs, { weeks: 2, now: new Date(now) });
    assert.deepEqual(Array.from(s, (w) => w.minutes), [30, 40]);
  }
});

test("question calendar boundaries pass in four time zones", () => {
  for (const TZ of ["UTC", "Europe/Paris", "America/New_York", "America/Sao_Paulo"]) {
    execFileSync(process.execPath, ["--test", "--test-name-pattern=^question weeks", new URL(import.meta.url).pathname], { env: { ...process.env, TZ }, stdio: "pipe" });
  }
});

test("volume trend needs eight complete weeks and compares 4 against 4", () => {
  const logs = [];
  for (let w = 1; w <= 8; w++) logs.push(run(w * 7, 5, w <= 4 ? 60 : 30));
  const t = Q.volumeTrend(Q.weeklySeries(logs, { weeks: 9, now: NOW }));
  assert.equal(t.direction, "up");
  assert.equal(t.recent, 60);
  assert.equal(t.before, 30);
  assert.equal(Q.volumeTrend(Q.weeklySeries(logs.slice(0, 3), { weeks: 9, now: NOW })), null);
});

test("pace trend uses monthly medians and ignores impossible paces", () => {
  const logs = [run(66, 10, 60), run(64, 10, 58), run(5, 10, 52), run(3, 10, 50), run(2, 10, 5 /* 0:30/km typo */)];
  const p = Q.paceTrend(logs, { now: NOW });
  assert.equal(p.enough, true);
  assert.ok(p.delta < 0, "faster pace means a negative delta");
  assert.equal(p.last.sessions, 2);
});

test("load stays silent without enough RPE, compares with the 4-week base otherwise", () => {
  assert.equal(Q.load([run(1, 5, 30), run(9, 5, 30)], { now: NOW }).enough, false);
  const logs = [run(0, 5, 60, 8), run(1, 5, 60, 8), run(8, 5, 30, 5), run(15, 5, 30, 5), run(22, 5, 30, 5), run(29, 5, 30, 5)];
  const l = Q.load(logs, { now: NOW });
  assert.equal(l.enough, true);
  assert.equal(l.week, 960);
  assert.equal(l.level, "high");
});

test("family share splits time by family", () => {
  const logs = [run(1, 5, 30), { id: "y", sport: "yoga", unit: "min", val: 30, date: new Date(NOW.getTime() - DAY).toISOString(), details: { duration: 30 } }];
  const f = Q.familyShare(logs, { now: NOW });
  assert.equal(f.total, 60);
  assert.equal(f.families.length, 2);
  assert.equal(f.families[0].share, 0.5);
});
