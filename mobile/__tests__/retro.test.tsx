/* AUD-26: « TITAN Rétro » — the year in story cards, computed on the phone; a card without data is left out. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Progress } from "../src/core";
import type { TrainingLog } from "../src/core/types";
import { buildRetro, compareWithPrevious, periodBounds, retroMonth, retroYear } from "../src/lib/retro";

const mockShare = jest.fn(async (_ref: unknown, _t?: string) => undefined);
jest.mock("../src/lib/shareImage", () => ({ shareCardImage: (r: unknown, t?: string) => mockShare(r, t) }));
const year = new Date().getFullYear();
const at = (month: number, day: number) => new Date(year, month, day, 18).toISOString();
const log = (id: string, sport: string, date: string, minutes: number, extra: Partial<TrainingLog> = {}): TrainingLog =>
  ({ id, client_event_id: id, sport, cat: "training", date, val: minutes, unit: "min", xp: 300, details: { duration: minutes }, ...extra }) as TrainingLog;
const mockLogs: TrainingLog[] = [
  log("a", "running", at(0, 10), 50, { val: 10, unit: "km", details: { duration: 50 } }),
  log("b", "muscu_gym", at(0, 12), 60),
  log("c", "running", at(0, 14), 40, { val: 8, unit: "km", details: { duration: 40 } }),
  log("d", "bouldering", at(1, 3), 90),
];
jest.mock("../src/data/hooks", () => ({
  useLogs: () => ({ active: mockLogs }),
  usePrefs: () => ({ weeklyGoalSessions: 3, cadencePauses: [] }),
  useProfile: () => ({ data: { level: 7 } }),
}));
jest.mock("../src/components/Toast", () => ({ useToast: () => jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RetroScreen } = require("../src/screens/progress/RetroScreen");

test("offered in December for this year and in January for the year before, not otherwise", () => {
  expect(retroYear(new Date(2026, 11, 3))).toBe(2026);
  expect(retroYear(new Date(2027, 0, 20))).toBe(2026);
  expect(retroYear(new Date(2026, 5, 1))).toBeNull();
});

test("the cards tell the real year: total effort, DNA, biggest week, regularity", () => {
  const cards = buildRetro(Progress.activeLogs(mockLogs), { year, cadence: null, rank: { name: "Sentinelle", level: 7 } });
  expect(cards[0]).toMatchObject({ eyebrow: `TITAN Rétro · ${year}`, value: "4 h" });
  expect(cards[0].caption).toContain("4 séances");
  expect(cards.map((c) => c.eyebrow)).toEqual(expect.arrayContaining(["Mon ADN sportif", "Ma plus grosse semaine", "Ma régularité"]));
});

test("an empty year gives no card at all", () => {
  expect(buildRetro([], { year })).toEqual([]);
});

test("each card can be shared as a picture", async () => {
  render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><RetroScreen route={{ params: { year } }} /></SafeAreaProvider>);
  expect(screen.getByText(`Mon année ${year}`)).toBeTruthy();
  fireEvent.press(screen.getByTestId("retro-share-0"));
  await waitFor(() => expect(mockShare).toHaveBeenCalledWith(expect.anything(), `TITAN Rétro ${year}`));
});

test("the monthly Rétro is offered the first week of a month, for the month before (AUD-37)", () => {
  expect(retroMonth(new Date(2026, 11, 3))).toEqual({ year: 2026, month: 10 });
  expect(retroMonth(new Date(2027, 0, 5))).toEqual({ year: 2026, month: 11 });
  expect(retroMonth(new Date(2026, 11, 12))).toBeNull();
  expect(periodBounds({ year: 2026, month: 10 }).label).toBe("novembre 2026");
});

test("a month tells its own sessions and compares itself with the month before (AUD-37)", () => {
  const jan = buildRetro(Progress.activeLogs(mockLogs), { year, month: 0 });
  expect(jan[0]).toMatchObject({ eyebrow: `TITAN Rétro · janvier ${year}` });
  expect(jan[0].caption).toContain("3 séances");
  const feb = compareWithPrevious(Progress.activeLogs(mockLogs), { year, month: 1 });
  expect(feb).toMatch(/% d’effort qu’en janvier/);
  expect(compareWithPrevious(Progress.activeLogs(mockLogs), { year, month: 0 })).toBeNull();
});
