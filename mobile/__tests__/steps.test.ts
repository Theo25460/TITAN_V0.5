import { AUTO_SYNC_MS, summarize, shouldAutoSync, validGoal, type DayRow } from "../src/lib/steps";

const rows = (days: Record<string, number>): DayRow[] => Object.entries(days).map(([day, steps]) => ({ day, steps, updatedAt: `${day}T20:00:00Z` }));

test("today's number, goal ratio capped at 1, a missing day is no data and never a zero", () => {
  const v = summarize(rows({ "2026-11-02": 6500 }), "2026-11-02", 10000);
  expect(v.today).toBe(6500);
  expect(v.ratio).toBe(0.65);
  expect(summarize(rows({ "2026-11-02": 15000 }), "2026-11-02", 10000).ratio).toBe(1);
  const none = summarize(rows({ "2026-11-01": 4000 }), "2026-11-02", 10000);
  expect(none.today).toBeNull();
  expect(none.ratio).toBeNull();
  expect(none.week.at(-1)).toEqual({ day: "2026-11-02", steps: null });
  expect(summarize(rows({ "2026-11-02": 100 }), "2026-11-02", null).ratio).toBeNull();
});

test("week of seven days ending today, averages only over days that have a number, trend against the week before with a 10 % margin", () => {
  const v = summarize(rows({ "2026-10-27": 8000, "2026-10-28": 10000, "2026-11-02": 12000, "2026-10-20": 5000, "2026-10-21": 5000 }), "2026-11-02", null);
  expect(v.week.map((w) => w.day)).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  expect(v.weekAverage).toBe(10000);
  expect(v.previousWeekAverage).toBe(5000);
  expect(v.trend).toBe("up");
  expect(summarize(rows({ "2026-11-02": 5300, "2026-10-26": 5000 }), "2026-11-02", null).trend).toBe("flat");
  expect(summarize(rows({ "2026-11-02": 3000, "2026-10-26": 5000 }), "2026-11-02", null).trend).toBe("down");
  expect(summarize(rows({ "2026-11-02": 3000 }), "2026-11-02", null).trend).toBeNull();
});

test("month: 30 days, total and average over the days with a number, last update from the server", () => {
  const v = summarize(rows({ "2026-10-04": 1000, "2026-10-20": 3000, "2026-11-02": 5000, "2026-10-03": 99999 }), "2026-11-02", null);
  expect(v.month).toEqual({ days: 3, total: 9000, average: 3000 });
  expect(v.lastUpdate).toBe("2026-11-02T20:00:00Z");
});

test("damaged rows are ignored; goals outside 1 000–50 000 are refused", () => {
  const v = summarize([{ day: "x", steps: 5 }, { day: "2026-11-02", steps: -4 }, { day: "2026-11-01", steps: 999999 }, { day: "2026-11-02", steps: NaN }], "2026-11-02", null);
  expect(v.today).toBeNull();
  expect(v.month.days).toBe(0);
  expect([validGoal(500), validGoal(60000), validGoal("abc"), validGoal(8000), validGoal(7999.6)]).toEqual([null, null, null, 8000, 8000]);
});

test("automatic refresh at most every 30 minutes and only when allowed", () => {
  expect(shouldAutoSync(null, 1000, true)).toBe(true);
  expect(shouldAutoSync(1000, 1000 + AUTO_SYNC_MS - 1, true)).toBe(false);
  expect(shouldAutoSync(1000, 1000 + AUTO_SYNC_MS, true)).toBe(true);
  expect(shouldAutoSync(null, 1000, false)).toBe(false);
});
