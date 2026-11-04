import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Screen } from "../src/components/Screen";
import { Button } from "../src/components/Button";
import { TOUCH } from "../src/theme/tokens";

describe("Android button sizing on compact screens", () => {
  test.each([true, false])("small=%s stays tappable and keeps explanatory labels", (small) => {
    const label = "Synchroniser mes pas avec Santé Connect";
    render(<Button label={label} small={small} onPress={jest.fn()} />);

    const control = screen.getByRole("button", { name: label });
    // Tap passes a pressed-state style callback through to React Native's Pressable.
    const rawStyle = control.props.style;
    const style = StyleSheet.flatten(typeof rawStyle === "function" ? rawStyle({ pressed: false }) : rawStyle);
    expect(style.minHeight).toBeGreaterThanOrEqual(TOUCH);
    expect(screen.getByText(label).props.numberOfLines).toBe(2);
  });
});


test("tablet-size screens keep content and actions at a readable width", () => {
  const view = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 900, height: 1100 }, insets: { top: 24, bottom: 24, left: 0, right: 0 } }}>
      <Screen footer={<Text>Enregistrer</Text>}><Text>Contenu</Text></Screen>
    </SafeAreaProvider>,
  );
  const scroller = view.UNSAFE_getByType(ScrollView);
  const contentStyle = StyleSheet.flatten(scroller.props.contentContainerStyle);
  expect(contentStyle.maxWidth).toBe(720);
  expect(contentStyle.width).toBe("100%");
  // Footer and body share the same cap, so primary actions do not stretch across the entire tablet.
  expect(view.getByText("Enregistrer")).toBeTruthy();
});

describe("Button double activation (V12-41)", () => {
  test("while an asynchronous action runs, a second press does not start it again", async () => {
    let finish: () => void = () => {};
    const onPress = jest.fn(() => new Promise<void>((r) => { finish = r; }));
    render(<Button label="Enregistrer la séance" onPress={onPress} />);
    const b = screen.getByRole("button", { name: "Enregistrer la séance" });
    fireEvent.press(b);
    fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(2);
  });
  test("quick presses of a synchronous action are all kept (a Suivant button is not throttled)", () => {
    const onPress = jest.fn();
    render(<Button label="Suivant" onPress={onPress} />);
    const b = screen.getByRole("button", { name: "Suivant" });
    fireEvent.press(b);
    fireEvent.press(b);
    fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(3);
  });
  test("a failing action releases the button", async () => {
    const onPress = jest.fn(() => Promise.reject(new Error("réseau")).catch(() => { throw new Error("x"); }));
    render(<Button label="Réessayer" onPress={onPress as unknown as () => Promise<void>} />);
    const b = screen.getByRole("button", { name: "Réessayer" });
    fireEvent.press(b);
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(2);
  });
  test("a disabled or loading button never fires", () => {
    const onPress = jest.fn();
    render(<Button label="Envoi" onPress={onPress} loading />);
    fireEvent.press(screen.getByRole("button", { name: "Envoi" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
