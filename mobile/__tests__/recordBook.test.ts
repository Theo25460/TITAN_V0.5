/* AUD-42: the dated chain of each record's improvements, from the journal. */
import type { TrainingLog } from "../src/core/types";
import { recordHistory } from "../src/lib/recordBook";

const run = (id: string, date: Date, km: number, min: number): TrainingLog =>
  ({ id, client_event_id: id, sport: "running", cat: "training", date: date.toISOString(), val: km, unit: "km", xp: 100, details: { duration: min } }) as TrainingLog;

test("each improvement of a record is a dated step; a weaker session adds nothing", () => {
  const logs = [run("a", new Date(2026, 0, 10), 5, 30), run("b", new Date(2026, 2, 3), 8, 45), run("c", new Date(2026, 3, 1), 6, 33), run("d", new Date(2026, 5, 20), 12, 70)];
  const book = recordHistory(logs, new Date(2026, 10, 15).getTime());
  const longest = [...book.entries()].find(([, steps]) => steps.some((s) => s.logId === "d"));
  expect(longest).toBeTruthy();
  expect(longest![1].map((s) => s.logId)).toEqual(["a", "b", "d"]);
});

test("an empty journal gives an empty book", () => {
  expect(recordHistory([]).size).toBe(0);
});
