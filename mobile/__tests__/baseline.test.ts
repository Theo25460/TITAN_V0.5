/* AUD-46: a personal weekly reference learned from history; nothing without enough of it. */
import type { TrainingLog } from "../src/core/types";
import { baselineLine, weeklyBaseline } from "../src/lib/baseline";

const now = new Date(2026, 10, 18, 12); // Wednesday
const log = (d: Date, minutes: number): TrainingLog => ({ id: d.toISOString(), sport: "running", date: d.toISOString(), val: minutes, unit: "min", details: { duration: minutes } }) as TrainingLog;

test("the median of the last complete weeks, and this week against it", () => {
  const logs: TrainingLog[] = [];
  for (let k = 1; k <= 8; k++) {
    const monday = new Date(2026, 10, 16 - 7 * k, 18);
    logs.push(log(monday, 60), log(new Date(monday.getTime() + 2 * 86400000), 60));
  }
  logs.push(log(new Date(2026, 10, 16, 18), 90));
  const b = weeklyBaseline(logs, now)!;
  expect(b.activeDays).toBe(2);
  expect(b.current.minutes).toBe(90);
  expect(b.minutes).toBeGreaterThan(0);
  expect(baselineLine({ ...b, minutes: 120, current: { minutes: 90, activeDays: 1 } }, (m) => `${m} min`)).toBe("90 min sur ta semaine type de 120 min · 1/2 jours.");
  expect(baselineLine({ ...b, minutes: 60, current: { minutes: 90, activeDays: 1 } }, (m) => `${m} min`)).toMatch(/au-dessus/);
});

test("no reference with fewer than four lived weeks", () => {
  expect(weeklyBaseline([log(new Date(2026, 10, 9, 18), 60)], now)).toBeNull();
});
