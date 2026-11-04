import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { summarize, goalOf, shift, sourceName } = createRequire(import.meta.url)("../js/core/steps.js");

const TODAY = "2026-10-29";
const day = (d, steps, extra = {}) => ({ day: d, steps, sources: ["health_connect"], updatedAt: "2026-10-29T08:00:00Z", ...extra });

test("days shift on the calendar, across months and years", () => {
  assert.equal(shift("2026-11-01", -1), "2026-10-31");
  assert.equal(shift("2026-01-01", -1), "2025-12-31");
  assert.equal(shift("2026-03-29", 1), "2026-03-30");
});

test("today's number, the last seven days and the averages count only the days that have a number", () => {
  const s = summarize([day("2026-10-29", 5400), day("2026-10-28", 8000), day("2026-10-26", 2000)], { today: TODAY });
  assert.equal(s.today.steps, 5400);
  assert.equal(s.week.length, 7);
  assert.equal(s.week[6].steps, 5400);
  assert.equal(s.week[5].steps, 8000);
  assert.equal(s.week[4].steps, null, "a day without data is not zero");
  assert.equal(s.average7, Math.round((5400 + 8000 + 2000) / 3));
  assert.equal(s.daysWithData30, 3);
  assert.equal(s.empty, false);
});

test("no data at all is said as such, never as zero steps", () => {
  const s = summarize([], { today: TODAY });
  assert.equal(s.empty, true);
  assert.equal(s.today, null);
  assert.equal(s.average7, null);
  assert.ok(s.week.every((d) => d.steps === null));
});

test("a real zero is kept as a real zero, and the optional goal caps at one hundred per cent", () => {
  assert.equal(summarize([day("2026-10-29", 0)], { today: TODAY }).today.steps, 0);
  assert.equal(summarize([day("2026-10-29", 12000)], { today: TODAY, goal: 8000 }).goalPercent, 100);
  assert.equal(summarize([day("2026-10-29", 4000)], { today: TODAY, goal: 8000 }).goalPercent, 50);
  assert.equal(summarize([day("2026-10-29", 4000)], { today: TODAY }).goalPercent, null, "no goal, no percentage");
});

test("a goal outside a sensible range is ignored", () => {
  assert.equal(goalOf(8000), 8000);
  for (const bad of [0, 500, 1e6, "x", null, undefined, NaN]) assert.equal(goalOf(bad), null);
});

test("garbage from a server is skipped without an error", () => {
  const s = summarize([null, {}, { day: "bad", steps: 3 }, { day: "2026-10-29", steps: -4 }, { day: "2026-10-29", steps: "abc" }, day("2026-10-29", 700)], { today: TODAY });
  assert.equal(s.today.steps, 700);
  assert.doesNotThrow(() => summarize("nope", { today: TODAY }));
});

test("the last refresh comes from the day itself, else from the latest known report", () => {
  assert.equal(summarize([day("2026-10-29", 1, { updatedAt: "2026-10-29T09:00:00Z" })], { today: TODAY }).lastUpdate, "2026-10-29T09:00:00Z");
  assert.equal(summarize([day("2026-10-27", 1, { updatedAt: "2026-10-27T20:00:00Z" })], { today: TODAY }).lastUpdate, "2026-10-27T20:00:00Z");
});

test("the source is named kindly, an unknown one is not invented", () => {
  assert.equal(sourceName("health_connect"), "Santé Connect");
  assert.equal(sourceName("whatever"), "une source connectée");
});
