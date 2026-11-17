/* Lot D: progression answers on Android (shared module js/core/progression.js). */
import { render, screen } from "@testing-library/react-native";
import { DisciplinesCard, PeriodsCard } from "../src/components/ProgressionCards";
import { Progression } from "../src/core";
import type { TrainingLog } from "../src/core/types";

const run = (id: string, date: string, km: number, min: number, extra: Partial<TrainingLog> = {}) => ({ id, client_event_id: id, sport: "running", unit: "km", val: km, date, details: { duration: min }, ...extra }) as unknown as TrainingLog;
const NOW = new Date("2026-10-30T12:00:00Z");
const LOGS = [run("r1", "2026-09-08T08:00:00Z", 10, 60), run("r2", "2026-09-15T08:00:00Z", 10, 59), run("r3", "2026-10-20T08:00:00Z", 10, 55), run("r4", "2026-10-27T08:00:00Z", 10.3, 54), run("held", "2026-10-26T08:00:00Z", 10, 40, { is_suspicious: true } as Partial<TrainingLog>)];

test("the detail screen's comparison: last comparable run, pace, held session ignored", () => {
  const c = Progression.compare(LOGS[3], LOGS)!;
  expect(c.previous.id).toBe("r3");
  expect(Progression.formatValue(c.items[0])).toBe("5:15 /km");
  expect(c.items[0].direction).toBe("better");
});

test("disciplines card: running progresses on its median pace, with the threshold stated", () => {
  render(<DisciplinesCard logs={LOGS} now={NOW} />);
  expect(screen.getByText(/Course à pied progresse sur 12 semaines/)).toBeTruthy();
  expect(screen.getByText(/5:57 \/km → 5:22 \/km · en progrès/)).toBeTruthy();
});

test("periods card: a journal younger than the previous period is not compared", () => {
  render(<PeriodsCard logs={LOGS} now={NOW} />);
  expect(screen.getByText(/pas de comparaison/)).toBeTruthy();
  expect(screen.getByText(/Durées déclarées/)).toBeTruthy();
});
