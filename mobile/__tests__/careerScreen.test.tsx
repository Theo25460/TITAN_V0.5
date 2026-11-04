/* « Ma carrière sportive » on Android: the real shared rules (CareerRules) on a synthetic journal, the real screen. Nothing is invented. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

const NOW = new Date();
let id = 0;
const log = (sport: string, daysAgo: number, unit: string, val: number, details: object = {}) => ({ id: `s${++id}`, sport, unit, val, date: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(), details });
let mockLogs: ReturnType<typeof log>[] = [];
let mockSteps: { day: string; steps: number }[] | null = null;
let mockLevel: number | null = 12;
jest.mock("../src/data/career", () => ({
  useCareer: (range: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require("../src/core");
    return {
    career: core.CareerRules.build(mockLogs, { range, stepDays: mockSteps, rank: mockLevel ? core.EffortRules.rank(mockLevel) : null, xp: 3400 }),
    loading: false, stepsLoading: false, error: null,
    };
  },
}));

import { CareerScreen } from "../src/screens/progress/CareerScreen";
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = () => render(<SafeAreaProvider initialMetrics={metrics}><CareerScreen /></SafeAreaProvider>);
beforeEach(() => { mockNavigate.mockReset(); mockLogs = []; mockSteps = null; mockLevel = 12; id = 0; });

test("an empty journal invites to the first session, with no figure at all", () => {
  show();
  expect(screen.getByText("Ta carrière commence ici")).toBeTruthy();
  expect(screen.queryByTestId("career-sessions")).toBeNull();
});

test("a runner, a cyclist and a lifter: totals, distances by lane, steps apart, no calories anywhere", () => {
  mockLogs = [
    log("running", 3, "km", 10.4, { duration: 55, elevation: 90 }),
    log("cycling", 5, "km", 105, { duration: 270, elevation: 900 }),
    log("muscu_gym", 7, "kg", 80, { duration: 60, exercises: [{ name: "Squat", kind: "weighted", setRows: [{ weight: 80, reps: 5 }, { weight: 80, reps: 5 }] }] }),
    log("football", 9, "min", 90, { duration: 90 }),
  ];
  mockSteps = [{ day: new Date(NOW.getTime() - 86400000).toISOString().slice(0, 10), steps: 9000 }];
  show();
  expect(screen.getByTestId("career-hero")).toBeTruthy();
  expect(screen.getByTestId("career-sessions")).toHaveProp("accessibilityLabel", "4 séances");
  expect(screen.getByText("À pied")).toBeTruthy();
  expect(screen.getByText("À vélo")).toBeTruthy();
  expect(screen.getByText("Renforcement")).toBeTruthy();
  expect(screen.getByText("Tes pratiques")).toBeTruthy();
  expect(screen.getByText("9 000 pas")).toBeTruthy();
  expect(screen.getByText(/jamais ajoutée aux distances de séance/)).toBeTruthy();
  expect(screen.getByText(/Premier 10 km/)).toBeTruthy();
  expect(screen.getByText(/Première sortie de 100 km/)).toBeTruthy();
  expect(screen.queryByText(/kcal/i)).toBeNull();
  expect(screen.getByText(/Aucun chiffre n’est inventé/)).toBeTruthy();
});

test("the filters narrow the page and an empty period says so without guilt", () => {
  mockLogs = [log("running", 200, "km", 8, { duration: 45 })];
  show();
  expect(screen.getByTestId("career-sessions")).toHaveProp("accessibilityLabel", "1 séance");
  fireEvent.press(screen.getByText("7 jours"));
  expect(screen.getByText("Rien sur cette période")).toBeTruthy();
  expect(screen.getByText(/ne t’enlève rien/)).toBeTruthy();
  fireEvent.press(screen.getByText("Année"));
  expect(screen.getByTestId("career-sessions")).toBeTruthy();
});

test("a sport without distance never gets one, and a session opens its detail", () => {
  mockLogs = [log("yoga", 2, "min", 40, { duration: 40 })];
  show();
  expect(screen.queryByTestId("career-distances")).toBeNull();
  expect(screen.getByText(/Pas de pas comptés/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText(/Yoga/));
  expect(mockNavigate).toHaveBeenCalledWith("SessionDetail", { id: "s1" });
});
