import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Progress } from "../src/core";
import { lastSessionToRepeat, RepeatLastCard } from "../src/components/RepeatLastCard";
import { logs } from "../test-fixtures/data";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({ ...jest.requireActual("@react-navigation/native"), useNavigation: () => ({ navigate: mockNavigate }) }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 24, bottom: 16, left: 0, right: 0 } };

describe("Refaire ma dernière séance (V12-13/32)", () => {
  test("offers the most recent known session and opens the pre-filled form on one tap", () => {
    const active = Progress.activeLogs(logs);
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
    const unknown = { ...logs[0], sport: "sport_inexistant_xyz" };
    expect(lastSessionToRepeat([unknown])).toBeNull();
    expect(lastSessionToRepeat([unknown, logs[1]])).toBe(logs[1]);
  });
});
