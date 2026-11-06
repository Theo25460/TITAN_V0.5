/* The QG steps card and the steps screen: a real number with its ring and source, an honest "no number" (never 0), TITAN's own counter
   offered first, Santé Connect second, nothing when there is nothing to say. The hook is replaced by a fixed answer. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { summarize, type DayRow } from "../src/lib/steps";

const mockNavigate = jest.fn();
const mockSteps: { value: Record<string, unknown> } = { value: {} };
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("../src/data/steps", () => ({ useSteps: () => mockSteps.value }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { StepsCard } = require("../src/components/StepsCard");
const { StepsScreen } = require("../src/screens/steps/StepsScreen");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
/* eslint-enable @typescript-eslint/no-require-imports */

const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const own = (over: Record<string, unknown> = {}) => ({ supported: true, enabled: false, permission: "unknown", live: false, startedAt: null, partialFirstDay: false, estimatedToday: 0, enable: jest.fn(async () => "granted"), disable: jest.fn(), clear: jest.fn(), ...over });
const base = (rows: DayRow[], goal: number | null, over: Record<string, unknown> = {}) => ({
  view: summarize(rows, today, goal), source: rows.some((r) => r.day === today) ? "health_connect" : null, goal, setGoal: jest.fn(), refresh: jest.fn(), syncing: false, error: null, connected: true, loading: false, hasAny: rows.length > 0, failed: false, own: own(), ...over,
});
const metrics = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const screenOf = () => render(<SafeAreaProvider initialMetrics={metrics}><ToastProvider><StepsScreen /></ToastProvider></SafeAreaProvider>);

beforeEach(() => mockNavigate.mockClear());

describe("QG steps card", () => {
  test("shows today's number with its goal and opens the detail on tap", () => {
    mockSteps.value = base([{ day: today, steps: 6500, updatedAt: "2026-11-02T09:00:00Z" }], 10000);
    render(<StepsCard />);
    expect(screen.getByText("6 500")).toBeTruthy();
    expect(screen.getByText(/sur 10 000 · ≈ 4,9 km/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("steps-card"));
    expect(mockNavigate).toHaveBeenCalledWith("Steps");
  });

  test("TITAN's own counter says it is live, and the sentence says where the number comes from", () => {
    mockSteps.value = base([{ day: today, steps: 1234, sources: ["titan"] }], 8000, { source: "titan", own: own({ enabled: true, permission: "granted", live: true }) });
    render(<StepsCard />);
    expect(screen.getByTestId("steps-live")).toBeTruthy();
    expect(screen.getByTestId("steps-freshness").props.children.join("")).toMatch(/Compteur de ton téléphone/);
    expect(screen.getAllByText(/En direct/)).toHaveLength(1); // said once: the badge
  });

  test("a delayed source is never called live", () => {
    mockSteps.value = base([{ day: today, steps: 900, updatedAt: "2020-01-01T10:00:00Z" }], null);
    render(<StepsCard />);
    expect(screen.queryByTestId("steps-live")).toBeNull();
    expect(screen.getByTestId("steps-freshness").props.children.join("")).toMatch(/Santé Connect · Données anciennes/);
  });

  test("no number today is said plainly and is never shown as zero", () => {
    mockSteps.value = base([{ day: "2020-01-01", steps: 4000 }], null);
    render(<StepsCard />);
    expect(screen.getByText("Pas de chiffre pour aujourd’hui pour le moment.")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  test("first, the invitation is TITAN's own counter, with the permission explained only if it was refused", () => {
    const enable = jest.fn(async () => "granted");
    mockSteps.value = base([], null, { hasAny: false, own: own({ enable }) });
    render(<StepsCard />);
    expect(screen.getByText(/Sans compte tiers/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("steps-start-open"));
    expect(enable).toHaveBeenCalled();
    expect(screen.queryByText(/activité physique/)).toBeNull();
  });

  test("a refused permission is explained and says what to do", () => {
    mockSteps.value = base([], null, { hasAny: false, own: own({ permission: "blocked" }) });
    render(<StepsCard />);
    expect(screen.getByText(/réglages d’Android/)).toBeTruthy();
  });

  test("on a phone without the sensor, Santé Connect is offered, with the no-reward promise", () => {
    mockSteps.value = base([], null, { hasAny: false, connected: false, own: own({ supported: false }) });
    render(<StepsCard />);
    expect(screen.getByText(/pas de capteur de pas/)).toBeTruthy();
    expect(screen.getByText(/ne créent ni séance ni récompense/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("steps-connect-open"));
    expect(mockNavigate).toHaveBeenCalledWith("HealthConnect");
  });

  test("a server without the function and no sensor shows nothing at all", () => {
    mockSteps.value = base([], null, { failed: true, hasAny: false, own: own({ supported: false }) });
    const { toJSON } = render(<StepsCard />);
    expect(toJSON()).toBeNull();
  });

  test("while the sensor, storage and permission answer, a placeholder holds the room instead of popping in (V12-05)", () => {
    mockSteps.value = base([], null, { loading: true, hasAny: false });
    const { rerender } = render(<StepsCard />);
    expect(screen.getByTestId("steps-loading")).toBeTruthy();
    mockSteps.value = base([], null, { loading: false, hasAny: false });
    rerender(<StepsCard />);
    expect(screen.queryByTestId("steps-loading")).toBeNull();
    expect(screen.getByTestId("steps-start")).toBeTruthy();
  });
});

describe("Steps screen", () => {
  test("ring, goal, week, sources: the counter is switched on from here, with the permission result told", async () => {
    const enable = jest.fn(async () => "blocked");
    mockSteps.value = base([{ day: today, steps: 3000, sources: ["titan"] }], 8000, { source: "titan", own: own({ enabled: false, enable }) });
    screenOf();
    expect(screen.getByText("3 000")).toBeTruthy();
    expect(screen.getByText(/Encore 5 000 pas/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("steps-own-toggle"));
    expect(enable).toHaveBeenCalled();
    expect(await screen.findByText("Autorisation refusée")).toBeTruthy();
  });

  test("the goal can be chosen, and a reached goal is said", () => {
    const s = base([{ day: today, steps: 9000 }], 8000);
    mockSteps.value = s;
    screenOf();
    expect(screen.getByText(/Objectif atteint/)).toBeTruthy();
    fireEvent.press(screen.getByText("12 000"));
    expect(s.setGoal).toHaveBeenCalledWith(12000);
  });

  test("the first day says it started counting mid-day and never guesses the steps before", () => {
    mockSteps.value = base([{ day: today, steps: 300, sources: ["titan"] }], 8000, { source: "titan", own: own({ enabled: true, partialFirstDay: true, startedAt: new Date(2026, 10, 4, 14, 12).getTime() }) });
    screenOf();
    expect(screen.getByText(/les pas d’avant ne sont pas devinés/)).toBeTruthy();
  });

  test("steps shared after a long absence are flagged as an estimate", () => {
    mockSteps.value = base([{ day: today, steps: 3000, sources: ["titan"] }], 8000, { source: "titan", own: own({ enabled: true, estimatedToday: 450 }) });
    screenOf();
    expect(screen.getByText(/Dont environ 450 pas répartis/)).toBeTruthy();
  });

  test("Santé Connect refresh is a button and an error keeps the received data on screen", () => {
    const s = base([{ day: today, steps: 1200 }], null, { error: "Actualisation impossible pour le moment. Les pas déjà reçus restent affichés." });
    mockSteps.value = s;
    screenOf();
    fireEvent.press(screen.getByTestId("steps-refresh"));
    expect(s.refresh).toHaveBeenCalledWith(false);
    expect(screen.getByText("1 200")).toBeTruthy();
    expect(screen.getByText(/Les pas déjà reçus restent affichés/)).toBeTruthy();
  });

  test("a phone without the sensor has the switch disabled and says why", () => {
    mockSteps.value = base([], null, { hasAny: false, own: own({ supported: false }) });
    screenOf();
    expect(screen.getByText(/n’a pas de capteur de pas/)).toBeTruthy();
    expect(screen.getByTestId("steps-own-toggle").props.accessibilityState.disabled).toBe(true);
  });
});

test("the weekly chart distinguishes Tuesday and Wednesday for readers", () => {
 const s = base([], null);
 mockSteps.value = { ...s, view: { ...s.view, week: [{ day: "2026-11-03", steps: 3000 }, { day: "2026-11-04", steps: 4000 }] } };
 screenOf();
 expect(screen.getByLabelText(/mardi 3 novembre.*3 000.*mercredi 4 novembre.*4 000/)).toBeTruthy();
});
