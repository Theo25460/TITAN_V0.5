import { render, screen } from "@testing-library/react-native";
import { LiveScene } from "../src/core/live";
import { LiveTrail, mix } from "../src/components/LiveTrail";

// « L'Expédition » on the phone: the same geometry as the website, drawn with react-native-svg.
const base = { beatOne: "manche", beatMany: "manches", label: "La Joute", seed: "badminton", family: "jeu", elan: { value: 30, max: 90 } };

test("each beat lights one waypoint and the drawn trail appears with the first beat", () => {
  const view = render(<LiveTrail {...base} lit={0} planned={3} echo={null} />);
  expect(screen.queryAllByTestId("live-expedition-lit")).toHaveLength(0);
  expect(screen.queryByTestId("live-expedition-done")).toBeNull();
  view.rerender(<LiveTrail {...base} lit={2} planned={3} echo={null} />);
  expect(screen.getAllByTestId("live-expedition-lit")).toHaveLength(2);
  expect(screen.getByTestId("live-expedition-done")).toBeTruthy();
  expect(screen.queryByTestId("live-expedition-summit")).toBeNull();
});

test("a finished plan reaches the summit, and the scene says so to a screen reader", () => {
  render(<LiveTrail {...base} lit={3} planned={3} echo={2} />);
  expect(screen.getByTestId("live-expedition-summit")).toBeTruthy();
  const label = screen.getByTestId("live-expedition").props.accessibilityLabel as string;
  expect(label).toBe("La Joute : 3 manches sur 3, élan du jour 30 sur 90, Écho à 2, sommet atteint");
  expect(screen.getByText("3 manches sur 3 · Écho : 2")).toBeTruthy();
});

test("the phone and the website share one geometry: same input, same scene", () => {
  const a = LiveScene.scene({ beats: 4, planCount: 9, seed: "running", elan: { value: 10, max: 90 } });
  const b = LiveScene.scene({ beats: 4, planCount: 9, seed: "running", elan: { value: 10, max: 90 } });
  expect(a).toEqual(b);
  expect(a.nodes.filter((n) => n.lit)).toHaveLength(4);
  expect(a.traveller).toMatchObject({ x: a.nodes[3].x, y: a.nodes[3].y, atCamp: false });
});

test("colour mixing stays a valid colour at both ends", () => {
  expect(mix("#000000", "#ffffff", 1)).toBe("#000000");
  expect(mix("#000000", "#ffffff", 0)).toBe("#ffffff");
  expect(mix("#3DD9E8", "#0E141A", 0.16)).toMatch(/^#[0-9a-f]{6}$/);
});
