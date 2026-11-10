import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Progress } from "../src/core";
import { lastSessionToRepeat, RepeatLastCard } from "../src/components/RepeatLastCard";
import { RecordScreen } from "../src/screens/session/RecordScreen";
import { logs as mockLogs } from "../test-fixtures/data";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("../src/data/hooks", () => ({ useLogs: () => ({ active: mockLogs }), usePrefs: () => ({ favoriteSports: ["running"] }) }));
jest.mock("../src/data/drafts", () => ({ useDraftSport: () => null }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 24, bottom: 16, left: 0, right: 0 } };

describe("Refaire ma dernière séance (V12-13/32)", () => {
  test("offers the most recent known session and opens the pre-filled form on one tap", () => {
    const active = Progress.activeLogs(mockLogs);
    const last = lastSessionToRepeat(active)!;
    expect(last).toBeTruthy();
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <RepeatLastCard log={last} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText("Refaire ma dernière séance")).toBeTruthy();
    expect(screen.getByText(/Valeurs préremplies/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("repeat-last"));
    // The form is opened with the earlier values; nothing is recorded until the player validates it.
    expect(mockNavigate).toHaveBeenCalledWith("SessionForm", { sport: last.sport, duplicateOf: last.id });
  });

  test("ignores sessions of a sport the catalogue no longer knows and offers nothing when there is no history", () => {
    expect(lastSessionToRepeat([])).toBeNull();
    const unknown = { ...mockLogs[0], sport: "sport_inexistant_xyz" };
    expect(lastSessionToRepeat([unknown])).toBeNull();
    expect(lastSessionToRepeat([unknown, mockLogs[1]])).toBe(mockLogs[1]);
  });

  test("the session tab offers the repeat shortcut before opening the sport catalogue", () => {
    render(<SafeAreaProvider initialMetrics={metrics}><RecordScreen /></SafeAreaProvider>);
    expect(screen.getByTestId("repeat-last")).toBeTruthy();
    expect(screen.queryByTestId("sport-search")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Choisir un sport" }));
    expect(screen.getByTestId("sport-search")).toBeTruthy();
    fireEvent.press(screen.getByTestId("sport-running"));
    expect(mockNavigate).toHaveBeenLastCalledWith("SessionForm", { sport: "running" });
  });

  test("the first view of the session tab opens a favourite sport without expanding the catalogue", () => {
    mockNavigate.mockClear();
    render(<SafeAreaProvider initialMetrics={metrics}><RecordScreen /></SafeAreaProvider>);
    expect(screen.queryByTestId("sport-search")).toBeNull();
    fireEvent.press(screen.getByTestId("sport-running"));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("SessionForm", { sport: "running" });
  });
});

describe("GPS shortcut (V12-10)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gpsShortcutSport } = require("../src/lib/gpsTrack");
  test("proposes a GPS sport the player already uses, otherwise running", () => {
    expect(gpsShortcutSport(["muscu_gym", "cycling"], ["running"])).toBe("cycling");
    expect(gpsShortcutSport(["muscu_gym"], ["yoga", "hiking"])).toBe("hiking");
    expect(gpsShortcutSport([], [])).toBe("running");
  });
});
