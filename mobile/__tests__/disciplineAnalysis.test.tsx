/* V1.7.5 — Analyse avancée par discipline on Android: the shared test set of the website (tests/fixtures/discipline-analysis-v175.json)
   gives, through the copied module, exactly the views and readings the website produces (discipline-analysis-v175.expected.json),
   and the Progrès card shows them side by side with the period before, a real V1.7.4 block and one session, with the missing values
   shown missing and every source session opening its sheet. */
process.env.TZ = "UTC"; // the views print local dates; the expected output was written in UTC
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DisciplineAnalysisCard } from "../src/components/DisciplineAnalysisCard";
import { DisciplineAnalysis, TrainingBlock, type AnalysisDiscipline, type AnalysisReference, type Schedule } from "../src/core";
import type { TrainingLog } from "../src/core/types";

const read = (p: string) => JSON.parse(readFileSync(join(__dirname, p), "utf8"));
type Case = { name: string; options: { discipline: AnalysisDiscipline; sport?: string; group?: string; reference?: AnalysisReference } };
const FIXTURE = read("../../tests/fixtures/discipline-analysis-v175.json") as { version: string; now: string; weeks: number; schedule: Schedule; history: TrainingLog[]; cases: Case[] };
const EXPECTED = read("../../tests/fixtures/discipline-analysis-v175.expected.json") as { version: string; cases: { name: string; view: unknown; reading: string[] }[] };
const H = FIXTURE.history;
const NOW = new Date(FIXTURE.now);
const reading = () => screen.getAllByTestId(/^analysis-line-\d+$/).map((n) => n.props.children[1]);
const blocks = () => TrainingBlock.list(FIXTURE.schedule, H, { today: "2026-11-20", zone: "UTC" }).map((b) => ({ id: b.id, title: b.title, start: b.start, end: b.end }));

test("the Android copy of the module is the website's, with the same rules version", () => {
  expect(readFileSync(join(__dirname, "../src/core/web/discipline-analysis.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/discipline-analysis.js"), "utf8"));
  expect(readFileSync(join(__dirname, "../src/core/web/progression.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/progression.js"), "utf8"));
  expect(DisciplineAnalysis.VERSION).toBe(FIXTURE.version);
  expect(DisciplineAnalysis.VERSION).toBe(EXPECTED.version);
});

test.each(FIXTURE.cases.map((c, i) => [c.name, i] as const))("same view and same reading as the website — %s", (_name, i) => {
  const v = DisciplineAnalysis.view(H, { ...FIXTURE.cases[i].options, now: NOW, weeks: FIXTURE.weeks });
  expect(JSON.parse(JSON.stringify(v))).toEqual(EXPECTED.cases[i].view);
  expect(DisciplineAnalysis.reading(v)).toEqual(EXPECTED.cases[i].reading);
});

test("the block of the shared schedule is the V1.7.4 block « Base aérobie », finished, 14 September – 11 October", () => {
  expect(blocks()).toEqual([{ id: "blk-base", title: "Base aérobie", start: "2026-09-14", end: "2026-10-11" }]);
});

test("endurance: long gravel outings against the period before, the block and one outing; a gap stays « non mesurée »; a source opens", () => {
  const onOpen = jest.fn();
  render(<DisciplineAnalysisCard logs={H} blocks={blocks()} now={NOW} onOpen={onOpen} />);
  fireEvent.press(screen.getByLabelText("6 sem."));
  expect(screen.getByTestId("analysis-title").props.children).toBe("Gravel · ≈ 78 km · Chemin roulant");
  expect(reading()).toEqual(EXPECTED.cases[0].reading);
  expect(screen.getByTestId("analysis-value-speed").props.children.join("")).toBe("20,9 km/h (3/4 séances) · référence 19,6 km/h (3/3 séances) · en progrès");
  expect(screen.getByText("7 nov. · non mesurée")).toBeTruthy();
  fireEvent.press(screen.getByTestId("analysis-rules-toggle"));
  fireEvent.press(screen.getByTestId("analysis-source-speed-g-c1"));
  expect(onOpen).toHaveBeenCalledWith("g-c1");
  fireEvent.press(screen.getByTestId("analysis-ref-block:blk-base"));
  expect(reading()).toEqual(EXPECTED.cases[1].reading);
  fireEvent.press(screen.getByTestId("analysis-ref-period"));
  fireEvent.press(screen.getByTestId("analysis-compare-g-r2"));
  expect(reading()).toEqual(EXPECTED.cases[2].reading);
});

test("endurance: a history too short gives the values of its one run, without verdict, and names what is not measured", () => {
  render(<DisciplineAnalysisCard logs={H} now={NOW} onOpen={() => undefined} />);
  fireEvent.press(screen.getByLabelText("6 sem."));
  fireEvent.press(screen.getByTestId("analysis-sport-running"));
  expect(screen.getByTestId("analysis-status").props.children).toBe("Données insuffisantes pour une tendance");
  expect(reading()).toEqual(EXPECTED.cases[5].reading);
  expect(screen.getByTestId("analysis-value-hold").props.children.join("")).toBe("— (0/1 séance)");
});

test("force and escalade: variants and scales stay apart, levels in Fontainebleau bloc, YDS without levels", () => {
  render(<DisciplineAnalysisCard logs={H} now={NOW} onOpen={() => undefined} />);
  fireEvent.press(screen.getByLabelText("Force"));
  fireEvent.press(screen.getByLabelText("6 sem."));
  expect(reading()).toEqual(EXPECTED.cases[6].reading);
  expect(screen.getByTestId("analysis-group-strength:muscu_gym|squat|front|")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Escalade"));
  expect(reading()).toEqual(EXPECTED.cases[10].reading);
  expect(screen.getByText("7A · 0 réussie · 1 tentée")).toBeTruthy();
  fireEvent.press(screen.getByTestId("analysis-group-climbing:bouldering|YDS|bloc"));
  expect(reading()).toEqual(EXPECTED.cases[12].reading);
  expect(screen.queryByTestId("analysis-levels")).toBeNull();
});
