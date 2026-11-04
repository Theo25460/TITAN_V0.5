import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { LineChart, nearestPoint } from "../src/components/Charts";

const points = Array.from({ length: 30 }, (_, i) => ({ label: `J${i + 1}`, value: 100 + i }));

describe("LineChart is usable without a precise finger (V12-42, AND-07)", () => {
  test("a touch anywhere selects the nearest of 30 points on a 320 dp screen", () => {
    // 296 dp of drawing width, 30 points: a point every ~10 dp. The nearest one wins, the ends are clamped.
    expect(nearestPoint(10, 296, 30)).toBe(0);
    expect(nearestPoint(286, 296, 30)).toBe(29);
    expect(nearestPoint(-50, 296, 30)).toBe(0);
    expect(nearestPoint(900, 296, 30)).toBe(29);
    expect(nearestPoint(148, 296, 30)).toBe(Math.round((138 / 276) * 29));
    expect(nearestPoint(5, 0, 1)).toBe(0);
  });

  test("previous / next buttons walk through the points and the value is read out", () => {
    render(<LineChart points={points} unit="kg" accessibilityLabel="Poids" />);
    expect(screen.getByText("Touche le graphique ou utilise les flèches")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Point suivant"));
    expect(screen.getByText("J1 · 100 kg")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Point suivant"));
    expect(screen.getByText("J2 · 101 kg")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Point précédent"));
    expect(screen.getByText("J1 · 100 kg")).toBeTruthy();
    // At the first point "previous" is inert instead of wrapping around.
    expect(screen.getByLabelText("Point précédent").props.accessibilityState.disabled).toBe(true);
  });

  test("touching the chart surface selects the point under the finger", () => {
    render(<LineChart points={points} unit="kg" accessibilityLabel="Poids" />);
    const surface = screen.getByTestId("line-chart-touch");
    act(() => surface.props.onLayout({ nativeEvent: { layout: { width: 296, height: 140, x: 0, y: 0 } } }));
    act(() => surface.props.onResponderGrant({ nativeEvent: { locationX: 286 } }));
    expect(screen.getByText("J30 · 129 kg")).toBeTruthy();
    act(() => surface.props.onResponderMove({ nativeEvent: { locationX: 10 } }));
    expect(screen.getByText("J1 · 100 kg")).toBeTruthy();
  });
});
