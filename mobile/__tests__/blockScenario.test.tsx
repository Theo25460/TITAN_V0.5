/* V1.7.6 — Scénarios multisports on Android: the shared test set of the website (tests/fixtures/block-scenario-v176.json), replayed
   through the copied modules by the very same replay (tools/block-scenario/replay.cjs), gives exactly the website's calendars,
   comparisons, previews, refusals, bilan contexts, follow-ups and measure (tests/fixtures/block-scenario-v176.expected.json). On the
   screen Ma semaine, the comparison written on the website is read with the same figures, « Une longue et une courte » is applied from
   Monday 30 November through its preview and saved in the profile preferences (schedule), then undone, and the decision is read again
   at the bilan of the week. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type React from "react";
import { BlockScenario, Sports, TrainingBlock, WeekPlan, type Schedule } from "../src/core";
import type { TrainingLog } from "../src/core/types";

jest.setTimeout(30000);
const read = (p: string) => JSON.parse(readFileSync(join(__dirname, p), "utf8"));
type Case = { name: string; journal: string[]; ops: Record<string, unknown>[]; read: { today: string } };
const FIXTURE = read("../../tests/fixtures/block-scenario-v176.json") as { zone: string; type: Schedule; logs: TrainingLog[]; weeks: string[]; cases: Case[] };
const EXPECTED = read("../../tests/fixtures/block-scenario-v176.expected.json") as { version: number; cases: Record<string, { calendar: Record<string, (string | null)[]>; previews: { op: string; words: { lines: string[]; notes: string[]; where: string } }[] }> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { replay, project } = require("../../tools/block-scenario/replay.cjs") as {
  replay: (W: unknown, B: unknown, S: unknown, f: unknown, c: unknown) => { schedule: Schedule; pauses: string[]; journal: TrainingLog[] };
  project: (W: unknown, B: unknown, S: unknown, res: unknown, label: (s: string) => string, dayLong: (k: string) => string) => unknown;
};
const label = (s: string) => Sports.label(s);
const caseOf = (prefix: string) => FIXTURE.cases.find((c) => c.name.startsWith(prefix))!;
const run = (prefix: string) => replay(WeekPlan, TrainingBlock, BlockScenario, FIXTURE, caseOf(prefix));
const expected = (prefix: string) => EXPECTED.cases[caseOf(prefix).name];
const calendar = (schedule: Schedule, today: string) => Object.fromEntries(FIXTURE.weeks.map((m) => [m, WeekPlan.reference(schedule, m, { current: WeekPlan.weekOf(today) }).days.map((d) => (d ? `${d.sport}:${d.minutes ?? "?"}` : null))]));

test("the Android copy of the modules is the website's, with the same rules version", () => {
  for (const f of ["block-scenario.js", "training-block.js", "week-plan.js"]) expect(readFileSync(join(__dirname, `../src/core/web/${f}`), "utf8")).toBe(readFileSync(join(__dirname, `../../js/core/${f}`), "utf8"));
  expect(BlockScenario.VERSION).toBe(EXPECTED.version);
});

test.each(FIXTURE.cases.map((c) => [c.name, c] as const))("same scenarios as the website — %s", (_name, c) => {
  expect(project(WeekPlan, TrainingBlock, BlockScenario, replay(WeekPlan, TrainingBlock, BlockScenario, FIXTURE, c), label, (k: string) => k)).toEqual(EXPECTED.cases[c.name]);
});

/* ---------- The screen: Progrès › Ma semaine with the profile preferences of a real hook contract ---------- */
/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = (el: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><ToastProvider>{el}</ToastProvider></SafeAreaProvider>);
const text = (id: string) => {
  const c = screen.getByTestId(id).props.children;
  return Array.isArray(c) ? c.join("") : String(c);
};
const mockSaved: { schedule?: Schedule }[] = [];
const mockState = { prefs: { schedule: {} as Schedule, cadencePauses: [] as string[] }, logs: [] as TrainingLog[] };
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return { ...actual, useNavigation: () => ({ navigate: jest.fn(), push: jest.fn() }) };
});
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "u1" }));
jest.mock("../src/data/hooks", () => ({
  usePrefs: () => ({ weeklyGoalSessions: 3, favoriteSports: [], onboardedAt: null, notifications: {}, ...mockState.prefs }),
  useSavePrefs: () => ({ isPending: false, mutateAsync: jest.fn(async ({ prefs }: { prefs: { schedule?: Schedule } }) => { mockSaved.push(prefs); return {}; }) }),
  useLogs: () => ({ logs: mockState.logs, active: mockState.logs }),
}));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
const at = (iso: string, fn: () => Promise<void>) => async () => {
  jest.useFakeTimers({ now: new Date(iso), doNotFake: ["nextTick", "setImmediate"] });
  mockSaved.length = 0;
  try { await fn(); } finally { jest.useRealTimers(); }
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const screenOf = () => require("../src/screens/progress/PlanScreen").PlanScreen as () => React.ReactElement;
const dayLong = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const words = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}/g, (k) => dayLong(k));

test("Ma semaine: the comparison written on the website, then « Une longue et une courte » applied from Monday 30 November through its preview", at("2026-11-24T12:00:00+01:00", async () => {
  const base = run("1 —");
  mockState.prefs = { schedule: base.schedule, cadencePauses: [] };
  mockState.logs = base.journal;
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  expect(text("scenario-status")).toBe("Brouillon privé : ton programme actif ne change pas tant que tu n’appliques pas une variante.");
  expect(screen.getByText("Actif 12 h · A 24 h · B 12 h 30 · écart B − A −11 h 30")).toBeTruthy();
  expect(screen.getByText("Actif 5 · A 4 · B 1 · écart B − A −3")).toBeTruthy();
  expect(screen.getByText("Jeudi 10 décembre : Badminton prévu alors que ta décision déjà prise y place Escalade bloc")).toBeTruthy();
  fireEvent.press(screen.getByTestId("scenario-apply-b"));
  const want = expected("3 —").previews.find((p) => p.op === "sc-apply")!.words;
  for (const line of want.lines.slice(0, 3)) expect(screen.getAllByText(words(line)).length).toBeGreaterThan(0);
  expect(text("scenario-where")).toBe("S’applique à partir du lundi 30 novembre.");
  expect(screen.getByText(want.notes[0])).toBeTruthy();
  // The week in progress is not offered; closing the sheet writes nothing.
  expect(screen.queryByTestId("scenario-from-2026-11-23")).toBeNull();
  fireEvent.press(screen.getByTestId("scenario-cancel"));
  expect(mockSaved.length).toBe(0);
  fireEvent.press(screen.getByTestId("scenario-apply-b"));
  await act(async () => { fireEvent.press(screen.getByTestId("scenario-confirm")); });
  await waitFor(() => expect(mockSaved.length).toBe(1));
  const saved = mockSaved[0].schedule!;
  expect(calendar(saved, "2026-11-24")).toEqual(expected("3 —").calendar);
  expect(saved.scenarios["velo-badminton"].applied).toMatchObject({ variant: "b", from: "2026-11-30", block: "cyclo-100", undone: null });
}));

test("Ma semaine: undo on Thursday 26 November through its preview — the plan before comes back", at("2026-11-26T12:00:00+01:00", async () => {
  const base = run("3 —");
  mockState.prefs = { schedule: base.schedule, cadencePauses: [] };
  mockState.logs = base.journal;
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  expect(text("scenario-status")).toBe("« Une longue et une courte » appliqué le mardi 24 novembre à partir du lundi 30 novembre.");
  fireEvent.press(screen.getByTestId("scenario-undo"));
  expect(text("scenario-where")).toBe("Le programme d’avant revient à partir du lundi 30 novembre.");
  await act(async () => { fireEvent.press(screen.getByTestId("scenario-confirm")); });
  await waitFor(() => expect(mockSaved.length).toBe(1));
  expect(calendar(mockSaved[0].schedule!, "2026-11-26")).toEqual(expected("4 bis").calendar);
}));

test("Ma semaine: the bilan of the week of 30 November reads the decision and what the week held", at("2026-12-06T18:00:00+01:00", async () => {
  const res = run("6 —");
  mockState.prefs = { schedule: res.schedule, cadencePauses: [] };
  mockState.logs = res.journal;
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  expect(text("scenario-followup-lead")).toBe("Scénario « Une longue et une courte » (Vélo ou badminton) appliqué le mardi 24 novembre à partir du lundi 30 novembre.");
  expect(text("scenario-followup-done")).toBe("Fait : Badminton 55 min · Escalade bloc 1 h 30 · Vélo 4 h 40.");
  expect(screen.getByText("« Une longue et une courte » du scénario « Vélo ou badminton » choisi ; cette semaine passe de « Semaine 5 » à « Semaine 5 · scénario B ».")).toBeTruthy();
}));

test("Ma semaine: a variant made to fit the paused week from the phone stays a draft — the active programme does not change", at("2026-11-24T12:00:00+01:00", async () => {
  const base = run("1 —");
  mockState.prefs = { schedule: base.schedule, cadencePauses: [] };
  mockState.logs = base.journal;
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  await act(async () => { fireEvent.press(screen.getByTestId("scenario-fit-a-3")); });
  await waitFor(() => expect(mockSaved.length).toBe(1));
  const saved = mockSaved[0].schedule!;
  expect(saved.scenarios["velo-badminton"].variants.a.weeks[3].days.every((d: unknown) => d === null)).toBe(true);
  expect(calendar(saved, "2026-11-24")).toEqual(calendar(base.schedule, "2026-11-24"));
  expect(JSON.stringify({ b: saved.blocks, w: saved.weeks })).toBe(JSON.stringify({ b: base.schedule.blocks, w: base.schedule.weeks }));
}));
