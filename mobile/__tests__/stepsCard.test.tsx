/* The QG steps card: a real number, a goal gauge, a week and 30 days, an honest "no number" (never 0), nothing when the server has no
   such function, and a way to connect Santé Connect when nothing was ever received. The hook is replaced by a fixed answer. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { summarize, type DayRow } from "../src/lib/steps";

const mockNavigate = jest.fn();
const mockSteps: { value: Record<string, unknown> } = { value: {} };
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("../src/data/steps", () => ({ useSteps: () => mockSteps.value }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { StepsCard } = require("../src/components/StepsCard");
/* eslint-enable @typescript-eslint/no-require-imports */

const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const base = (rows: DayRow[], goal: number | null, over: Record<string, unknown> = {}) => ({
  view: summarize(rows, today, goal), goal, setGoal: jest.fn(), refresh: jest.fn(), syncing: false, error: null, connected: true, loading: false, hasAny: rows.length > 0, failed: false, ...over,
});

beforeEach(() => mockNavigate.mockClear());

test("shows today's number, the goal and the honest 30-day line", () => {
  mockSteps.value = base([{ day: today, steps: 6500, updatedAt: "2026-11-02T09:00:00Z" }], 10000);
  render(<StepsCard />);
  expect(screen.getByText("6 500")).toBeTruthy();
  expect(screen.getByText("Objectif 10 000")).toBeTruthy();
  // Compact by default: the week, the 30 days and the goal editor wait behind one tap (V12-31).
  expect(screen.queryByText(/30 jours/)).toBeNull();
  expect(screen.getByTestId("steps-toggle").props.accessibilityLabel).toBe("Voir la semaine et l’objectif");
  fireEvent.press(screen.getByTestId("steps-toggle"));
  expect(screen.getByText(/30 jours : 6 500 par jour en moyenne \(1 jour avec chiffre\)/)).toBeTruthy();
  expect(screen.getByText("Modifier l’objectif")).toBeTruthy();
  expect(screen.getByTestId("steps-toggle").props.accessibilityLabel).toBe("Masquer le détail");
});

test("no number today is said plainly and is never shown as zero", () => {
  mockSteps.value = base([{ day: "2020-01-01", steps: 4000 }], null, { hasAny: true });
  render(<StepsCard />);
  expect(screen.getByText("Pas de chiffre pour aujourd’hui pour le moment.")).toBeTruthy();
  expect(screen.queryByText("0")).toBeNull();
});

test("without a goal the presets are offered and picking one saves it", () => {
  const s = base([{ day: today, steps: 3000 }], null);
  mockSteps.value = s;
  render(<StepsCard />);
  fireEvent.press(screen.getByText("8 000"));
  expect(s.setGoal).toHaveBeenCalledWith(8000);
});

test("nothing received yet and not connected: an invitation to connect Santé Connect, with the no-reward promise", () => {
  mockSteps.value = base([], null, { connected: false, hasAny: false });
  render(<StepsCard />);
  expect(screen.getByText(/ne créent ni séance ni récompense/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("steps-connect-open"));
  expect(mockNavigate).toHaveBeenCalledWith("HealthConnect");
});

test("a server without the function shows nothing at all", () => {
  mockSteps.value = base([], null, { failed: true, hasAny: false });
  const { toJSON } = render(<StepsCard />);
  expect(toJSON()).toBeNull();
});

test("old data is flagged as not real time", () => {
  mockSteps.value = base([{ day: today, steps: 900, updatedAt: "2020-01-01T10:00:00Z" }], null);
  render(<StepsCard />);
  expect(screen.getByTestId("steps-freshness").props.children).toMatch(/Données anciennes/);
});

test("manual refresh is a button; an error keeps the received data on screen", () => {
  const s = base([{ day: today, steps: 1200 }], null, { error: "Actualisation impossible pour le moment. Les pas déjà reçus restent affichés." });
  mockSteps.value = s;
  render(<StepsCard />);
  fireEvent.press(screen.getByTestId("steps-refresh"));
  expect(s.refresh).toHaveBeenCalledWith(false);
  expect(screen.getByText("1 200")).toBeTruthy();
  expect(screen.getByText(/Les pas déjà reçus restent affichés/)).toBeTruthy();
});

test("while the steps and the permission check are pending, a placeholder holds the room instead of popping in (V12-05)", () => {
  mockSteps.value = base([], null, { loading: true, hasAny: false, connected: null });
  const { rerender } = render(<StepsCard />);
  expect(screen.getByTestId("steps-loading")).toBeTruthy();
  expect(screen.queryByText("Pas de chiffre pour aujourd’hui pour le moment.")).toBeNull();
  // Loaded but the permission check has not answered yet: still the placeholder, never a premature "no number".
  mockSteps.value = base([], null, { loading: false, hasAny: false, connected: null });
  rerender(<StepsCard />);
  expect(screen.getByTestId("steps-loading")).toBeTruthy();
  // The answer arrives: the invitation replaces the placeholder.
  mockSteps.value = base([], null, { loading: false, hasAny: false, connected: false });
  rerender(<StepsCard />);
  expect(screen.queryByTestId("steps-loading")).toBeNull();
  expect(screen.getByTestId("steps-connect")).toBeTruthy();
});
