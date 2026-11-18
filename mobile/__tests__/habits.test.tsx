/* Lot 8 « habitudes »: year in squares, usual hour, plan, comeback, held streak, projection, energy, quick session, intention. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Cadence } from "../src/core";
import type { TrainingLog } from "../src/core/types";
import { comebackDates, energyAdvice, heldStreak, plannedFor, usualHour, yearGrid, yearProjection } from "../src/lib/habits";
import { nextSundayEvening } from "../src/lib/reminders";

const mockNavigate = jest.fn();
const mockStore = new Map<string, unknown>();
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/storage", () => ({
  ownerKey: (s: string, o: string) => `titan.${s}.v1:${o}`,
  readJSON: async (k: string, f: unknown) => (mockStore.has(k) ? mockStore.get(k) : f),
  writeJSON: async (k: string, v: unknown) => void mockStore.set(k, v),
}));
/* eslint-disable @typescript-eslint/no-require-imports */
const { EnergyCheckIn, HabitStrip, SundayRitualCard } = require("../src/components/HabitCards");
/* eslint-enable @typescript-eslint/no-require-imports */

const now = new Date(2026, 10, 18, 12);
const log = (d: Date, minutes = 45, sport = "running"): TrainingLog => ({ id: d.toISOString(), sport, date: d.toISOString(), val: minutes, unit: "min", details: { duration: minutes } }) as TrainingLog;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

beforeEach(() => { mockStore.clear(); mockNavigate.mockClear(); });

test("H1: 53 weeks of days, active days counted, future days marked", () => {
  const g = yearGrid([log(new Date(2026, 10, 16, 18)), log(new Date(2026, 4, 2, 18))], now);
  expect(g.weeks).toHaveLength(53);
  expect(g.weeks.every((w) => w.length === 7)).toBe(true);
  expect(g.activeDays).toBe(2);
  expect(g.weeks[52].some((d) => d.future)).toBe(true);
});

test("H3: the usual hour needs a clear habit", () => {
  const evening = Array.from({ length: 8 }, (_, i) => log(new Date(2026, 10, 1 + i, 18, 10)));
  expect(usualHour(evening)).toBe(18);
  expect(usualHour(evening.slice(0, 3))).toBeNull();
});

test("H2: the weekly plan names the sport of the day", () => {
  expect(plannedFor({ wednesday: { sport: "running", minutes: 45 } }, now, () => "Course à pied")).toBe("Course à pied · 45 min");
  expect(plannedFor({}, now, String)).toBeNull();
});

test("H6: gentle comeback 5 and 10 days after the last session, only in the future", () => {
  expect(comebackDates([log(new Date(2026, 10, 15, 9))], now).map((d) => d.getDate())).toEqual([20, 25]);
  expect(comebackDates([log(new Date(2026, 10, 1, 9))], now)).toEqual([]);
});

test("H9: held weeks in a row, pauses skipped", () => {
  const w = (state: string) => ({ start: "", activeDays: 3, state, fill: 1 });
  expect(heldStreak({ weeks: [w("missed"), w("held"), w("pause"), w("held"), w("held"), w("current")] } as unknown as Cadence)).toBe(3);
});

test("H10: hours this year and the projection to 31 December", () => {
  const p = yearProjection([log(new Date(2026, 0, 10), 600), log(new Date(2026, 5, 1), 600)], now)!;
  expect(p.hours).toBe(20);
  expect(p.projected).toBeGreaterThan(20);
});

test("H7: the Sunday ritual is planned for the next Sunday evening and shown only on Sunday", () => {
  expect(nextSundayEvening(now).getDay()).toBe(0);
  expect(nextSundayEvening(now).getHours()).toBe(18);
  const sunday = new Date(2026, 10, 22, 10);
  wrap(<SundayRitualCard now={sunday} />);
  fireEvent.press(screen.getByTestId("qg-sunday"));
  expect(mockNavigate).toHaveBeenCalledWith("Plan");
});

test("H8: the energy check-in becomes today's advice and is remembered for the day", async () => {
  expect(energyAdvice(1)).toMatch(/repos/);
  wrap(<EnergyCheckIn now={now} />);
  fireEvent.press(await screen.findByText("Fatigué"));
  expect(screen.getByTestId("energy-advice").props.children).toMatch(/courte et facile/);
  expect(mockStore.get("titan.energy.v1:owner-a")).toEqual({ day: "2026-11-18", level: 2 });
});

test("H4 + H5: one's own slot is saved, and « Juste 10 minutes » opens a prefilled form", async () => {
  wrap(<HabitStrip logs={[log(new Date(2026, 10, 16, 18))]} cadence={{ weeks: [] } as unknown as Cadence} favorite={null} />);
  fireEvent.press(screen.getByTestId("habit-quick"));
  expect(mockNavigate).toHaveBeenCalledWith("SessionForm", { sport: "running", quickMinutes: 10 });
  fireEvent.press(screen.getByTestId("habit-intention-edit"));
  fireEvent.changeText(screen.getByTestId("habit-intention"), "Après le travail, je cours");
  fireEvent.press(screen.getByTestId("habit-intention-save"));
  await waitFor(() => expect(mockStore.get("titan.intention.v1:owner-a")).toBe("Après le travail, je cours"));
  expect(await screen.findByText("Après le travail, je cours")).toBeTruthy();
});

test("the QG cadence counts held weeks in the last 8, and a quiet week never resets it to zero", () => {
  const { heldRecent } = require("../src/lib/habits");
  const w = (state: string) => ({ state });
  const weeks = [w("held"), w("held"), w("held"), w("missed"), w("held"), w("pause"), w("held"), w("current")];
  expect(heldRecent({ weeks } as unknown as Cadence, 8)).toBe(5);
  // A quiet last week: the former streak fell to 0, the cadence still shows the 5 weeks held in the window.
  const quiet = { weeks: [...weeks.slice(0, -1), w("missed"), w("current")] } as unknown as Cadence;
  expect(heldStreak(quiet)).toBe(0);
  expect(heldRecent(quiet, 8)).toBe(5);
});
