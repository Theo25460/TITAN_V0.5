import { fireEvent, render, screen } from "@testing-library/react-native";
import { RpeSelector, rpeColumns } from "../src/components/RpeSelector";

describe("RPE selector — compact, tablet and split-screen layouts", () => {
  test.each([
    [240, 4],
    [280, 4],
    [320, 5],
    [360, 5],
    [900, 5],
  ])("%i dp wide window fits %i touch-safe columns", (width, expected) => {
    expect(rpeColumns(width)).toBe(expected);
  });

  it("renders ten individually selectable accessible ratings", () => {
    const onChange = jest.fn();
    render(<RpeSelector value={null} onChange={onChange} />);
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(10);
    fireEvent.press(options[9]!);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("pressing the selected rating clears it", () => {
    const onChange = jest.fn();
    render(<RpeSelector value={6} onChange={onChange} />);
    const option = screen.getByRole("radio", { name: /6,/ });
    expect(option.props.accessibilityState.checked).toBe(true);
    fireEvent.press(option);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
