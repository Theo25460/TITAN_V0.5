import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../src/components/Toast";
import { OnboardingScreen } from "../src/screens/auth/OnboardingScreen";

const mockSave = jest.fn();
const mockReset = jest.fn();
const mockPrefs = { favoriteSports: [] as string[], weeklyGoalSessions: 3 };
jest.mock("../src/data/hooks", () => ({
  usePrefs: () => mockPrefs,
  useSavePrefs: () => ({ mutateAsync: mockSave, isPending: false }),
}));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ reset: mockReset }),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
function start() {
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider><OnboardingScreen /></ToastProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockSave.mockReset().mockResolvedValue(undefined);
  mockReset.mockClear();
});

test("a short preview opens the real form for the sport shown", async () => {
  start();
  fireEvent.press(screen.getByTestId("sport-swimming"));
  fireEvent.press(screen.getByTestId("sport-running"));
  fireEvent.press(screen.getByTestId("onboarding-preview"));

  const preview = screen.getByTestId("onboarding-adventure-demo");
  expect(preview).toHaveTextContent(/Démo.*Aventure/i);
  expect(preview).toHaveTextContent(/Natation/);
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockReset).not.toHaveBeenCalled();

  await act(async () => fireEvent.press(screen.getByRole("button", { name: /saisir.*natation/i })));
  expect(mockSave).toHaveBeenCalledWith({ prefs: { favoriteSports: ["swimming", "running"], weeklyGoalSessions: 3, onboardedAt: expect.any(String) } });
  expect(mockReset).toHaveBeenCalledWith({ index: 1, routes: [{ name: "Tabs" }, { name: "SessionForm", params: { sport: "swimming" } }] });
});

test("QG remains available after choosing a sport and skips the session", async () => {
  start();
  fireEvent.press(screen.getByTestId("sport-running"));
  fireEvent.press(screen.getByTestId("onboarding-preview"));
  await act(async () => fireEvent.press(screen.getByTestId("onboarding-later")));

  expect(mockSave).toHaveBeenCalledWith({ prefs: { favoriteSports: ["running"], weeklyGoalSessions: 3, onboardedAt: expect.any(String) } });
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Tabs" }] });
});

test("without a chosen sport the session action opens the sport picker", async () => {
  start();
  fireEvent.press(screen.getByTestId("onboarding-next"));
  fireEvent.press(screen.getByTestId("onboarding-next"));
  expect(screen.queryByTestId("onboarding-adventure-demo")).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId("onboarding-finish")));

  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Tabs", params: { screen: "Record" } }] });
});

test("a competing destination cannot replace a session launch already being saved", async () => {
  let finish!: () => void;
  mockSave.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  start();
  fireEvent.press(screen.getByTestId("sport-running"));
  fireEvent.press(screen.getByTestId("onboarding-preview"));
  act(() => {
    fireEvent.press(screen.getByTestId("onboarding-finish"));
    fireEvent.press(screen.getByTestId("onboarding-later"));
  });
  expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async () => finish());

  expect(mockReset).toHaveBeenCalledTimes(1);
  expect(mockReset).toHaveBeenCalledWith({ index: 1, routes: [{ name: "Tabs" }, { name: "SessionForm", params: { sport: "running" } }] });
});
