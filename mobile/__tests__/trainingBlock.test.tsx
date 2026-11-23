/* V1.7.4 — Objectifs et blocs d’entraînement on Android: the shared test set of the website (tests/fixtures/training-block-v174.json),
   replayed through the copied modules by the very same replay (tools/training-block/replay.cjs), gives exactly the website's blocks,
   weeks, previews, refusals, bilan contexts and measure (tests/fixtures/training-block-v174.expected.json). On the screen Ma semaine, a
   block is shifted, created from a model and an action declared through a preview, saved in the profile preferences (schedule), and the
   state written by the website is read the same way. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type React from "react";
import { Sports, TrainingBlock, WeekPlan, type Schedule } from "../src/core";
import type { TrainingLog } from "../src/core/types";

jest.setTimeout(30000);
const read = (p: string) => JSON.parse(readFileSync(join(__dirname, p), "utf8"));
type Case = { name: string; journal: string[]; ops: Record<string, unknown>[]; read: { today: string } };
const FIXTURE = read("../../tests/fixtures/training-block-v174.json") as { zone: string; type: Schedule; logs: TrainingLog[]; cases: Case[] };
const EXPECTED = read("../../tests/fixtures/training-block-v174.expected.json") as { version: number; cases: Record<string, { blocks: ({ id: string; words: unknown; conflict: boolean } & Record<string, unknown>)[]; previews: { op: string; words: { lines: string[]; notes: string[]; where: string } }[] }> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { replay, project } = require("../../tools/training-block/replay.cjs") as {
  replay: (W: unknown, B: unknown, f: unknown, c: unknown) => { schedule: Schedule; pauses: string[]; journal: TrainingLog[] };
  project: (W: unknown, B: unknown, res: unknown, label: (s: string) => string, dayLong: (k: string) => string) => unknown;
};
const label = (s: string) => Sports.label(s);
const caseOf = (prefix: string) => FIXTURE.cases.find((c) => c.name.startsWith(prefix))!;
const run = (prefix: string) => replay(WeekPlan, TrainingBlock, FIXTURE, caseOf(prefix));
const expectedBlock = (prefix: string, id = "gravel-90") => {
  const { words, conflict, log, signature, ...rest } = EXPECTED.cases[caseOf(prefix).name].blocks.find((b) => b.id === id)! as Record<string, unknown> & { id: string; words: unknown; conflict: boolean };
  return rest;
};
const strip = (v: unknown) => { const { log, signature, ...rest } = v as Record<string, unknown>; return rest; };

test("the Android copy of the modules is the website's, with the same rules version", () => {
  for (const f of ["training-block.js", "week-plan.js"]) expect(readFileSync(join(__dirname, `../src/core/web/${f}`), "utf8")).toBe(readFileSync(join(__dirname, `../../js/core/${f}`), "utf8"));
  expect(TrainingBlock.VERSION).toBe(EXPECTED.version);
});

test.each(FIXTURE.cases.map((c) => [c.name, c] as const))("same blocks as the website — %s", (_name, c) => {
  expect(project(WeekPlan, TrainingBlock, replay(WeekPlan, TrainingBlock, FIXTURE, c), label, (k: string) => k)).toEqual(EXPECTED.cases[c.name]);
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
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return { ...actual, useNavigation: () => ({ navigate: mockNavigate, push: jest.fn() }) };
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

test("Ma semaine: the paused week, then the shift of one week through its preview — the same words and the same block as the website", at("2026-11-24T12:00:00+01:00", async () => {
  const base = run("3 bis");
  mockState.prefs = { schedule: base.schedule, cadencePauses: base.pauses };
  mockState.logs = base.journal;
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  expect(text("block-where")).toMatch(/^Semaine 4 · allégée · 4ᵉ semaine sur 6/);
  fireEvent.press(screen.getByTestId("block-shift"));
  fireEvent.press(screen.getByTestId("block-from-4"));
  fireEvent.press(screen.getByTestId("block-by-1"));
  const want = EXPECTED.cases[caseOf("3 —").name].previews.find((p) => p.op === "shift")!.words;
  expect(screen.getByText(want.lines[0].replace("2026-11-30", "lundi 30 novembre"))).toBeTruthy();
  expect(text("block-where-applies")).toBe("S’applique à partir du lundi 30 novembre.");
  expect(screen.getByText("La pause reste sur sa semaine : semaine du lundi 23 novembre.")).toBeTruthy();
  // « Annuler » writes nothing.
  fireEvent.press(screen.getByTestId("block-cancel"));
  expect(mockSaved.length).toBe(0);
  fireEvent.press(screen.getByTestId("block-shift"));
  fireEvent.press(screen.getByTestId("block-from-4"));
  await act(async () => { fireEvent.press(screen.getByTestId("block-confirm")); });
  await waitFor(() => expect(mockSaved.length).toBe(1));
  const saved = mockSaved[0].schedule!;
  const view = TrainingBlock.view(saved, base.journal, "gravel-90", { today: "2026-11-24", zone: FIXTURE.zone, pauses: base.pauses });
  expect(strip(TrainingBlock.snapshot(view))).toEqual(expectedBlock("3 —"));
  // The closed weeks and the week in progress are those of before the shift.
  for (const w of ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]) {
    const o = { week: w, today: "2026-11-24", zone: FIXTURE.zone, pauses: base.pauses };
    expect(WeekPlan.snapshot(WeekPlan.week(saved, base.journal, o))).toEqual(WeekPlan.snapshot(WeekPlan.week(base.schedule, base.journal, o)));
  }
}));

test("Ma semaine: the state written by the website reads the same — the week of the block, the shift's source and effect, the milestone reached by its session", at("2026-12-13T18:00:00+01:00", async () => {
  const res = run("5 —");
  mockState.prefs = { schedule: res.schedule, cadencePauses: res.pauses };
  mockState.logs = res.journal;
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  expect(text("block-context")).toBe("Cette semaine est « Semaine 5 » (6ᵉ sur 7).");
  expect(screen.getByText("Bloc décalé le mardi 24 novembre")).toBeTruthy();
  expect(screen.getByText("Cette semaine passe de « Semaine 6 » à « Semaine 5 » ; le jalon « Sortie de 72 km » passe de la semaine du lundi 30 novembre à celle du lundi 7 décembre.")).toBeTruthy();
  expect(text("block-goal-state")).toBe("Atteint le samedi 12 décembre");
  expect(text("block-milestone-state-j2")).toBe("Atteint le samedi 12 décembre");
  fireEvent.press(screen.getByTestId("block-milestone-session-j2"));
  expect(mockNavigate).toHaveBeenCalledWith("SessionDetail", { id: "grav-6b" });
}));

test("Ma semaine: a block created from the model « sortie longue » — six weeks on two sports, the two milestones kept, nothing before « Confirmer »", at("2026-11-01T18:00:00+01:00", async () => {
  mockState.prefs = { schedule: JSON.parse(JSON.stringify(FIXTURE.type)), cadencePauses: [] };
  mockState.logs = [];
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  fireEvent.press(screen.getByTestId("block-create"));
  fireEvent.press(screen.getByTestId("block-tpl-endurance"));
  fireEvent.press(screen.getByTestId("block-sport-gravel"));
  fireEvent.changeText(screen.getByTestId("block-title"), "Gravel 90 km");
  fireEvent.changeText(screen.getByTestId("block-goal-title"), "Sortie gravel de 90 km");
  fireEvent.changeText(screen.getByTestId("block-goal-km"), "90");
  fireEvent.changeText(screen.getByTestId("block-goal-date"), "2026-12-12");
  fireEvent.press(screen.getByTestId("block-start-2026-11-02"));
  expect(screen.getByText("Semaine du lundi 2 novembre : semaine type → Semaine 1")).toBeTruthy();
  expect(screen.getByText("Jalon « Sortie de 54 km » : semaine du lundi 16 novembre")).toBeTruthy();
  expect(mockSaved.length).toBe(0);
  await act(async () => { fireEvent.press(screen.getByTestId("block-confirm")); });
  await waitFor(() => expect(mockSaved.length).toBe(1));
  const s = mockSaved[0].schedule!;
  const id = Object.keys(s.blocks)[0];
  const v = TrainingBlock.view(s, [], id, { today: "2026-11-01", zone: FIXTURE.zone, pauses: [] })!;
  expect(v.weeks).toHaveLength(6);
  expect(v.weeks.every((w) => w.days[1] === "bouldering" && w.days[5] === "gravel")).toBe(true);
  expect(v.milestones.map((m) => [m.title, m.week, m.state])).toEqual([["Sortie de 54 km", "2026-11-16", "pending"], ["Sortie de 72 km", "2026-11-30", "pending"]]);
  expect(v.goal).toMatchObject({ title: "Sortie gravel de 90 km", date: "2026-12-12", state: "pending" });
}));

test("Ma semaine: a declared action is reached only by the athlete's declaration, saved with its time", at("2026-12-10T19:00:00+01:00", async () => {
  const res = run("3 —");
  const s = TrainingBlock.setMilestone(res.schedule, "gravel-90", { newId: "j3", title: "Réviser le vélo", week: 5, kind: "declared" }, { today: "2026-11-26", at: "2026-11-26T20:00:00.000Z", zone: FIXTURE.zone, pauses: res.pauses, logs: res.journal }).schedule;
  mockState.prefs = { schedule: s, cadencePauses: res.pauses };
  mockState.logs = res.journal;
  const PlanScreen = screenOf();
  show(<PlanScreen />);
  expect(text("block-milestone-state-j3")).toBe("À déclarer quand c’est fait");
  await act(async () => { fireEvent.press(screen.getByTestId("block-declare-j3")); });
  await waitFor(() => expect(mockSaved.length).toBe(1));
  expect(mockSaved[0].schedule!.blocks["gravel-90"].milestones.j3.declared.at).toMatch(/^2026-12-10T/);
}));
