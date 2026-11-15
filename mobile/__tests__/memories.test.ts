/* AUD-38 / AUD-39: memories and « toi contre toi » only exist with history, and are computed from the journal alone. */
import type { TrainingLog } from "../src/core/types";
import { memoryOfTheDay, selfVsLastYear } from "../src/lib/memories";

const now = new Date(2026, 10, 15, 9);
const log = (id: string, date: Date, minutes: number, sport = "running"): TrainingLog =>
  ({ id, sport, date: date.toISOString(), val: minutes, unit: "min", details: { duration: minutes } }) as TrainingLog;

test("a session exactly one year ago wins over one a month ago; nothing without history", () => {
  const logs = [log("m", new Date(2026, 9, 15, 18), 40), log("y", new Date(2025, 10, 15, 18), 50), log("other", new Date(2025, 10, 14, 18), 90)];
  expect(memoryOfTheDay(logs, now)).toMatchObject({ yearsAgo: 1, label: "Il y a un an, jour pour jour" });
  expect(memoryOfTheDay(logs, now)!.log.id).toBe("y");
  expect(memoryOfTheDay([logs[0]], now)).toMatchObject({ monthsAgo: 1, label: "Il y a un mois, jour pour jour" });
  expect(memoryOfTheDay([], now)).toBeNull();
});

test("the oldest anniversary is preferred and the longest session of that day is shown", () => {
  const logs = [log("a", new Date(2024, 10, 15, 7), 20), log("b", new Date(2024, 10, 15, 18), 60), log("y", new Date(2025, 10, 15, 18), 50)];
  expect(memoryOfTheDay(logs, now)).toMatchObject({ yearsAgo: 2, label: "Il y a 2 ans, jour pour jour" });
  expect(memoryOfTheDay(logs, now)!.log.id).toBe("b");
});

test("toi contre toi compares the last 30 days with the same days a year earlier", () => {
  const logs = [log("n1", new Date(2026, 10, 10), 60), log("n2", new Date(2026, 10, 12), 60), log("o1", new Date(2025, 10, 11), 60)];
  const c = selfVsLastYear(logs, now)!;
  expect(c.sessions).toEqual([2, 1]);
  expect(Math.round(c.ratio * 100)).toBe(100);
  expect(selfVsLastYear([logs[0]], now)).toBeNull();
});
