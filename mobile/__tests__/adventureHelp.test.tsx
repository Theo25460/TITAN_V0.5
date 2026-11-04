import { fireEvent, render, screen } from "@testing-library/react-native";
import { AdventureHelp, ADVENTURE_WORDS } from "../src/components/AdventureHelp";

test("the adventure vocabulary is one tap away, in the order a session meets it, and hidden by default (V12-35)", () => {
  render(<AdventureHelp />);
  expect(screen.queryByText(/Tout part d’un effort réel/)).toBeNull();
  fireEvent.press(screen.getByTestId("adventure-help-toggle"));
  expect(screen.getByText(/Tout part d’un effort réel/)).toBeTruthy();
  expect(ADVENTURE_WORDS.map((w) => w.word)).toEqual(["Séance", "Chapitre", "Balise", "Gardien", "Repos"]);
  expect(screen.getByTestId("adventure-help-toggle").props.accessibilityState.expanded).toBe(true);
  fireEvent.press(screen.getByTestId("adventure-help-toggle"));
  expect(screen.queryByText(/Tout part d’un effort réel/)).toBeNull();
});
