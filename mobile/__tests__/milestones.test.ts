/* AUD-41: anniversaries and round numbers, from the journal, shown for a week. */
import type { Cadence } from "../src/core";
import type { TrainingLog } from "../src/core/types";
import { recentMilestone } from "../src/lib/milestones";

const now = new Date(2026, 10, 15, 12);
const log = (i: number, date: Date, minutes = 60): TrainingLog => ({ id: `l${i}`, sport: "running", date: date.toISOString(), val: minutes, unit: "min", details: { duration: minutes } }) as TrainingLog;

test("the first anniversary on TITAN is celebrated during the week", () => {
  const logs = [log(1, new Date(2025, 10, 12, 18)), log(2, new Date(2026, 5, 1))];
  expect(recentMilestone(logs, { now })).toMatchObject({ id: "anniversary-1", card: { title: "Un an sur TITAN" } });
  expect(recentMilestone(logs, { now: new Date(2026, 10, 25) })).toBeNull();
});

test("the 10th session and the 10th hour are milestones when they happen this week", () => {
  const logs = Array.from({ length: 10 }, (_, i) => log(i, new Date(2026, 10, 15 - (9 - i) * 2, 8)));
  const m = recentMilestone(logs, { now })!;
  expect(["sessions-10", "hours-10"]).toContain(m.id);
});

test("held weeks on a round number count only when this week is held", () => {
  const cadence = { lifetimeHeld: 52, currentDays: 3, target: 3 } as Cadence;
  const logs = [log(1, new Date(2024, 0, 3))];
  expect(recentMilestone(logs, { now, cadence })).toMatchObject({ id: "weeks-52" });
  expect(recentMilestone(logs, { now, cadence: { ...cadence, currentDays: 1 } })).toBeNull();
});
