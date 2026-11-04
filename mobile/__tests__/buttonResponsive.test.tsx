import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
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
