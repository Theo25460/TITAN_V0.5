/* V1.7.1 — Comparaisons justes on Android: the shared test set of the website (tests/fixtures/comparables-v171.json) gives,
   through the copied module, exactly the selection the website produces (tests/fixtures/comparables-v171.expected.json), and the
   session sheet shows the rule, the sample, the sources (each opens its sheet) and the precise limit of the data. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ComparisonCard } from "../src/components/ComparisonCard";
import { Progression } from "../src/core";
import type { TrainingLog } from "../src/core/types";

const read = (p: string) => JSON.parse(readFileSync(join(__dirname, p), "utf8"));
const FIXTURE = read("../../tests/fixtures/comparables-v171.json") as { rulesVersion: string; history: TrainingLog[]; cases: { name: string; subject: string }[] };
const EXPECTED = read("../../tests/fixtures/comparables-v171.expected.json") as { rulesVersion: string; cases: Record<string, { selection: unknown; comparison: unknown }> };
const H = FIXTURE.history;
const byId = (id: string) => H.find((l) => l.id === id)!;

test("the Android copy of the engine is the website's, with the same rules version", () => {
  expect(readFileSync(join(__dirname, "../src/core/web/progression.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/progression.js"), "utf8"));
  expect(Progression.RULES_VERSION).toBe(FIXTURE.rulesVersion);
  expect(Progression.RULES_VERSION).toBe(EXPECTED.rulesVersion);
});

test.each(FIXTURE.cases.map((c) => [c.name, c.subject]))("same comparables and same sources as the website — %s", (_name, subject) => {
  const log = byId(subject);
  expect(Progression.snapshot(Progression.comparables(log, H))).toEqual(EXPECTED.cases[subject].selection);
  const c = Progression.compare(log, H);
  expect(c ? { previous: c.previous.id, basis: c.basis, items: c.items.map((i) => ({ id: i.id, now: Progression.formatValue(i), before: Progression.formatValue(i, "previous"), direction: i.direction })) } : null).toEqual(EXPECTED.cases[subject].comparison);
});

test("conclusive case: the rule, the sample of three road runs, the trail set aside, and a source opens its sheet", () => {
  const onOpen = jest.fn();
  render(<ComparisonCard log={byId("run-today")} logs={H} onOpen={onOpen} />);
  expect(screen.getByText("Par rapport au 1 novembre")).toBeTruthy();
  expect(screen.getByText(/5:12 \/km · avant 5:27 \/km · en progrès/)).toBeTruthy();
  expect(screen.getByTestId("comparison-reference").props.children.join("")).toBe("Médiane de tes 3 séances retenues : 5:31 /km.");
  fireEvent.press(screen.getByTestId("comparables-toggle"));
  expect(screen.getByTestId("comparables-rule").props.children.join("")).toBe("Règle appliquée · Distance voisine et même parcours (Route) (règles 2026.11-v1)");
  expect(screen.getByText("• Parcours (Surface) : Route")).toBeTruthy();
  expect(screen.getByTestId("comparables-sample").props.children.join("")).toMatch(/^Échantillon · 3 séances retenues sur 10 examinées/);
  expect(screen.getByTestId("excluded-run-trail")).toBeTruthy();
  expect(screen.getByText("autre parcours (Chemin)")).toBeTruthy();
  expect(screen.getByText("dénivelé trop différent (38 m/km contre 4)")).toBeTruthy();
  // The kept sessions, in order, are the website's expected sources.
  const kept = screen.getAllByTestId(/^comparable-/).map((n) => String(n.props.testID).replace("comparable-", ""));
  expect(kept).toEqual(["run-road-3", "run-road-2", "run-road-1"]);
  fireEvent.press(screen.getByTestId("comparable-run-road-3"));
  expect(onOpen).toHaveBeenCalledWith("run-road-3");
});

test("limit case: an unknown scale says precisely why nothing is compared", () => {
  render(<ComparisonCard log={byId("boulder-yds")} logs={H} onOpen={() => undefined} />);
  expect(screen.getByText("Comparaison · données insuffisantes")).toBeTruthy();
  expect(screen.getByText(/TITAN ne sait pas ordonner les cotations de l’échelle « YDS » : aucune comparaison, et aucune conversion vers une autre échelle\./)).toBeTruthy();
  expect(screen.queryByTestId("session-comparison")).toBeNull();
});

test("limit case: a run without route is compared, and the sheet says the route is not checked", () => {
  render(<ComparisonCard log={byId("run-plain")} logs={H} onOpen={() => undefined} />);
  expect(screen.getByText("Comparaison élargie : un critère n’a pas pu être vérifié.")).toBeTruthy();
  expect(screen.getByText(/Le parcours de cette séance n’est pas renseigné \(Surface\)/)).toBeTruthy();
});

test("strength and climbing: homonymous variants and a second scale are set aside with their reason", () => {
  render(<ComparisonCard log={byId("lift-today")} logs={H} onOpen={() => undefined} />);
  fireEvent.press(screen.getByTestId("comparables-toggle"));
  expect(screen.getByText("même nom, autre variante (Squat · Front)")).toBeTruthy();
  expect(screen.getByText("variante non renseignée (squat · sans variante)")).toBeTruthy();
  screen.unmount();
  render(<ComparisonCard log={byId("boulder-today")} logs={H} onOpen={() => undefined} />);
  fireEvent.press(screen.getByTestId("comparables-toggle"));
  expect(screen.getByText("autre échelle de cotation (V-scale bloc)")).toBeTruthy();
  expect(screen.getByText("aucune réussite cotée (tentée 7A)")).toBeTruthy();
});
