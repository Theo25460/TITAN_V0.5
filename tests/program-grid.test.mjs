// « Le programme »: the shared figure of a person's week (sports × days) and of their last weeks (sports × weeks).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const P = require("../js/core/program-grid.js");
const now = new Date(2026, 10, 18, 15, 0); // Wednesday 18 November 2026
const at = (y, m, d, h = 10) => new Date(y, m, d, h).toISOString();
const opts = { now, minutesOf: (l) => l.min, familyOf: (s) => (s === "muscu_gym" ? "force" : "endurance"), labelOf: (s) => ({ running: "Course à pied", muscu_gym: "Musculation" })[s] || s };

test("a week runs Monday to Sunday and places each session on its own day and its own sport line", () => {
  const g = P.week([{ sport: "running", date: at(2026, 10, 16), min: 61 }, { sport: "muscu_gym", date: at(2026, 10, 17), min: 50 }, { sport: "running", date: at(2026, 10, 18, 8), min: 25 }], opts);
  assert.equal(g.from, "2026-11-16");
  assert.equal(g.to, "2026-11-22");
  assert.deepEqual(g.days.map((d) => d.letter).join(""), "LMMJVSD");
  assert.equal(g.days[2].today, true);
  assert.equal(g.days[3].future, true);
  assert.deepEqual(g.rows.map((r) => r.sport), ["running", "muscu_gym"], "the sport with the most time comes first");
  assert.deepEqual(g.rows[0].cells.map((c) => (c ? c.minutes : 0)), [61, 0, 25, 0, 0, 0, 0]);
  assert.equal(g.rows[0].family, "endurance");
  assert.equal(g.rows[1].label, "Musculation");
  assert.deepEqual(g.totals, { minutes: 136, sessions: 3, activeDays: 3, cells: [61, 50, 25, 0, 0, 0, 0] });
});

test("sessions of another week are ignored, two sessions on one day share a cell", () => {
  const g = P.week([{ sport: "running", date: at(2026, 10, 15), min: 40 }, { sport: "running", date: at(2026, 10, 16, 7), min: 20 }, { sport: "running", date: at(2026, 10, 16, 19), min: 30 }, { sport: "running", date: at(2026, 10, 23), min: 40 }], opts);
  assert.equal(g.totals.sessions, 2);
  assert.deepEqual(g.rows[0].cells[0], { minutes: 50, sessions: 2, level: 3 });
  assert.equal(g.totals.activeDays, 1);
});

test("the ink of a cell follows the minutes; a session without a duration still marks its day", () => {
  assert.deepEqual([0, 5, 20, 44, 45, 74, 75, 300].map(P.level), [0, 1, 2, 2, 3, 3, 4, 4]);
  const g = P.week([{ sport: "running", date: at(2026, 10, 16), min: 0 }], opts);
  assert.equal(g.rows[0].cells[0].level, 1);
  assert.equal(g.totals.activeDays, 1);
});

test("beyond the row limit the smallest sports fold into one line and nothing is lost", () => {
  const sports = ["a", "b", "c", "d", "e", "f"];
  const g = P.week(sports.map((s, i) => ({ sport: s, date: at(2026, 10, 16 + (i % 3)), min: 60 - i * 5 })), { ...opts, maxRows: 4 });
  assert.equal(g.rows.length, 3);
  assert.equal(g.more.sports, 3);
  assert.equal(g.rows.reduce((n, r) => n + r.minutes, 0) + g.more.minutes, g.totals.minutes);
  assert.equal(g.rows.reduce((n, r) => n + r.sessions, 0) + g.more.sessions, 6);
});

test("the usual week shows the days still to come, never a past day and never a day already done", () => {
  const plan = ["running", null, "running", null, "muscu_gym", null, null];
  const g = P.week([{ sport: "running", date: at(2026, 10, 18, 8), min: 30 }], { ...opts, plan });
  assert.deepEqual(g.planned.map((p) => [p.day, p.sport]), [[4, "muscu_gym"]], "Monday is past, Wednesday is done");
  assert.equal(g.planned[0].row, -1, "a planned sport without a session yet has no line of its own");
});

test("several weeks: one column per week, the current one last, days counted once per sport", () => {
  const logs = [{ sport: "running", date: at(2026, 10, 18), min: 60 }, { sport: "running", date: at(2026, 10, 18, 18), min: 30 }, { sport: "running", date: at(2026, 10, 9), min: 45 }, { sport: "muscu_gym", date: at(2026, 9, 1), min: 50 }, { sport: "running", date: at(2026, 8, 1), min: 50 }];
  const g = P.span(logs, { ...opts, weeks: 8 });
  assert.equal(g.columns.length, 8);
  assert.equal(g.columns[7].current, true);
  assert.equal(g.columns[7].key, "2026-11-16");
  const run = g.rows.find((r) => r.sport === "running");
  assert.deepEqual(run.cells[7], { minutes: 90, sessions: 2, days: 1, level: 2 });
  assert.equal(run.cells[6].minutes, 45);
  assert.equal(g.totals.sessions, 4, "the session of 1 September is outside the eight weeks");
});

test("the figure has a sentence for screen readers, and an empty week says so", () => {
  assert.equal(P.describe(P.week([], opts)), "Aucune séance sur cette période.");
  assert.match(P.describe(P.week([{ sport: "running", date: at(2026, 10, 16), min: 61 }], opts)), /Course à pied : 1 séance, 61 minutes\./);
});

test("the same input gives the same figure (no clock, no randomness inside)", () => {
  const logs = [{ sport: "running", date: at(2026, 10, 16), min: 61 }];
  assert.deepEqual(P.week(logs, opts), P.week(logs, opts));
});
