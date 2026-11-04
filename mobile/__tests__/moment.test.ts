/* The moment after a session uses the website's rules: measured facts and the records this very session set. */
import "../src/core";
import { sessionMetrics, sessionRecords } from "../src/core/moment";
import type { TrainingLog } from "../src/core/types";

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const run = (id: string, daysAgo: number, km: number, minutes: number): TrainingLog => ({
  id,
  client_event_id: `e-${id}`,
  user_id: "u",
  sport: "running",
  category: "cardio",
  val: km,
  unit: "km",
  xp: 300,
  date: at(daysAgo),
  details: { duration: minutes },
  revision: 1,
  syncStatus: "confirmed",
});

test("a run shows distance, time and pace", () => {
  expect(sessionMetrics(run("a", 1, 10, 50))).toEqual([
    ["Distance", "10 km"],
    ["Durée", "50 min"],
    ["Allure", "5:00 /km"],
  ]);
});

test("a strength session shows exercises, sets and volume", () => {
  const log = { ...run("s", 1, 1000, 45), sport: "muscu_gym", unit: "kg", details: { duration: 45, exercises: [{ name: "Squat", setRows: [{}, {}, {}], volume: 1500 }] } } as TrainingLog;
  expect(sessionMetrics(log).map(([k]) => k)).toEqual(["Exercices", "Séries", "Volume", "Durée"]);
});

test("a longer run than ever before is a record, with the previous value", () => {
  const logs = [run("old", 20, 12, 65), run("new", 2, 15, 80)];
  const recs = sessionRecords(logs, logs[1]);
  const distance = recs.find((r) => r.kind === "distance");
  expect(distance?.value).toBe(15);
  expect(distance?.previous?.value).toBe(12);
  expect(distance?.first).toBe(false);
});

test("a shorter run sets no record", () => {
  const logs = [run("old", 20, 12, 65), run("new", 2, 8, 40)];
  expect(sessionRecords(logs, logs[1]).filter((r) => r.kind === "distance")).toEqual([]);
});
