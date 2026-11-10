import { render, screen } from "@testing-library/react-native";
import { WorldStory } from "../src/components/WorldStory";

test("shows the change only for the account that earned the campaign receipt", () => {
  const snapshot = { owner: "a", rewards: [{ world: "aube", chapter: 1, earned_at: "2026-11-05T12:00:00Z" }] };
  const { rerender } = render(<WorldStory snapshot={snapshot} world="aube" owner="a" color="#81e0c2" />);
  expect(screen.getByText("Les lanternes du sentier")).toBeVisible();
  expect(screen.getByText("Balise 5")).toBeVisible();
  rerender(<WorldStory snapshot={snapshot} world="aube" owner="b" color="#81e0c2" />);
  expect(screen.queryByText("Les lanternes du sentier")).toBeNull();
});
