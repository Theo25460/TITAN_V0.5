import { render, screen } from "@testing-library/react-native";
import { TabLabel, TAB_LABEL_SCALE_CAP } from "../src/navigation/Tabs";

jest.mock("../src/data/queue", () => ({ useQueue: () => ({ items: [] }) }));

test("tab labels stay on one line and stop growing at 1.3x so five tabs fit at 200 % system font (V12-24)", () => {
  render(<TabLabel color="#fff">Aventure</TabLabel>);
  const label = screen.getByText("Aventure");
  expect(label.props.maxFontSizeMultiplier).toBe(TAB_LABEL_SCALE_CAP);
  expect(label.props.numberOfLines).toBe(1);
});
