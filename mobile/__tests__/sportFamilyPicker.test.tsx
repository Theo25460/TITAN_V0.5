import { fireEvent, render, screen } from "@testing-library/react-native";
import { SportFamilyPicker } from "../src/components/SportPicker";
import { Sports } from "../src/core";

test("le catalogue ouvre chaque famille hors ligne et transmet la discipline choisie", () => {
  const choose = jest.fn();
  render(<SportFamilyPicker onPick={choose} />);
  const catalog = Sports.all();
  for (const family of new Set(catalog.map((sport) => sport.family))) {
    fireEvent.press(screen.getByLabelText(Sports.FAMILY_LABEL[family]));
    const members = catalog.filter((sport) => sport.family === family);
    for (const sport of members) expect(screen.getByTestId(`sport-${sport.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`sport-${members[0].id}`));
    expect(choose).toHaveBeenLastCalledWith(members[0].id);
  }
});
