/* V1.7.2 — Planifié et réalisé on Android: the shared test set of the website (tests/fixtures/week-plan-v172.json), replayed through the
   copied module, gives exactly the website's weeks (tests/fixtures/week-plan-v172.expected.json): same occurrences, same ties, same
   gaps, same words. The week card asks when two sessions are eligible, records the athlete's choice through the profile preferences
   (game_state.user.schedule, the key the server already keeps), and never changes the session. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type React from "react";
import { WeekPlanCard } from "../src/components/WeekPlanCard";
import { Sports, WeekPlan, type Schedule, type WeekPlanView } from "../src/core";
import type { TrainingLog } from "../src/core/types";

const read = (p: string) => JSON.parse(readFileSync(join(__dirname, p), "utf8"));
type Op = { op: "edit" | "decide"; day?: string; value?: { sport: string; minutes?: number }; id?: string; decision?: { kind: "move" | "replace" | "skip" | "link" | "none" | "reset"; day?: string; sport?: string; session?: string }; today?: string; at?: string };
type Case = { name: string; journal: string[]; ops: Op[]; remote?: Op[]; edits?: { id: string; patch: Partial<TrainingLog> }[]; read?: { week?: string; today?: string; zone?: string; pauses?: string[] } };
const FIXTURE = read("../../tests/fixtures/week-plan-v172.json") as { zone: string; today: string; type: Schedule; logs: TrainingLog[]; cases: Case[] };
const EXPECTED = read("../../tests/fixtures/week-plan-v172.expected.json") as { version: number; cases: Record<string, { view: unknown; words: unknown; bilan: unknown }> };

/* Same replay as tools/week-plan/replay.mjs (the website side). */
function replay(c: Case) {
  const run = (start: Schedule, ops: Op[]) => ops.reduce((s, op) => (op.op === "edit" ? WeekPlan.editType(s, op.day!, op.value!, { today: op.today || FIXTURE.today, at: op.at }).schedule : WeekPlan.decide(s, op.id!, op.decision!, { today: op.today || FIXTURE.today, at: op.at })), start);
  const start = JSON.parse(JSON.stringify(FIXTURE.type));
  let schedule = run(start, c.ops);
  if (c.remote) schedule = WeekPlan.merge(schedule, run(start, c.remote));
  const journal = FIXTURE.logs.filter((l) => c.journal.includes(l.id)).map((l) => {
    const e = (c.edits || []).find((x) => x.id === l.id);
    return e ? { ...l, ...e.patch } : l;
  });
  const r = c.read || {};
  return { schedule, journal, view: WeekPlan.week(schedule, journal, { week: r.week, today: r.today || FIXTURE.today, zone: r.zone || FIXTURE.zone, pauses: r.pauses || [] }) };
}
const label = (s: string) => Sports.label(s);
/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const show = (el: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><ToastProvider>{el}</ToastProvider></SafeAreaProvider>);

test("the Android copy of the module is the website's, with the same rules version", () => {
  expect(readFileSync(join(__dirname, "../src/core/web/week-plan.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/week-plan.js"), "utf8"));
  expect(WeekPlan.VERSION).toBe(EXPECTED.version);
});

test.each(FIXTURE.cases.map((c) => [c.name, c] as const))("same week as the website — %s", (_name, c) => {
  const { view } = replay(c);
  const e = EXPECTED.cases[c.name];
  expect(WeekPlan.snapshot(view)).toEqual(e.view);
  expect(view.occurrences.map((o) => WeekPlan.describe(o, { label }))).toEqual(e.words);
  expect(WeekPlan.summarize(view)).toEqual(e.bilan);
});

const caseOf = (prefix: string) => FIXTURE.cases.find((c) => c.name.startsWith(prefix))!;

test("two eligible sessions: the card asks, the athlete chooses the evening run, the decision names the session only", async () => {
  const { view, journal } = replay(caseOf("3a"));
  const onDecide = jest.fn(async () => true);
  const onOpen = jest.fn();
  show(<WeekPlanCard view={view} logs={journal} onDecide={onDecide} onOpen={onOpen} />);
  expect(screen.getByTestId("occurrence-status-2026-11-16/1").props.children).toBe("2 séances possibles : laquelle correspond ?");
  fireEvent.press(screen.getByTestId("occurrence-act-2026-11-16/1"));
  expect(screen.getByTestId("link-run-tue-am")).toBeTruthy();
  fireEvent.press(screen.getByTestId("link-run-tue-pm"));
  await waitFor(() => expect(onDecide).toHaveBeenCalledWith("2026-11-16/1", { kind: "link", session: "run-tue-pm" }, "Séance reliée"));
});

test("the replacement keeps its real measures: the tied ride shows the journal's values and opens its own sheet", () => {
  const { view, journal } = replay(caseOf("1b"));
  const before = JSON.stringify(journal);
  const onOpen = jest.fn();
  show(<WeekPlanCard view={view} logs={journal} onDecide={jest.fn()} onOpen={onOpen} />);
  expect(screen.getByTestId("occurrence-status-2026-11-16/1").props.children).toBe("Remplacée par Vélo jeudi (reliée par toi)");
  expect(screen.getByText(/Vélo · jeu\. 19 · 1 h 12 · 31,4 km · D\+ 210 m/)).toBeTruthy();
  expect(screen.getByTestId("week-plan-changes").props.children).toBe("Changements : 1 remplacée.");
  fireEvent.press(screen.getByTestId("occurrence-session-2026-11-16/1"));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "ride-thu", val: 31.4 }));
  expect(JSON.stringify(journal)).toBe(before);
});

test("a move counts once: the moved run is done, one gap, no session outside the plan", () => {
  const { view, journal } = replay(caseOf("2 —"));
  show(<WeekPlanCard view={view} logs={journal} onDecide={jest.fn()} onOpen={jest.fn()} />);
  expect(screen.getByTestId("week-plan-result").props.children).toBe("Résultat : 2/3 faites, 1 à venir. Écarts : 1.");
  expect(screen.queryByText("Hors programme")).toBeNull();
});

test("a remote edit of the tied session is said, and a paused week shows no gap", () => {
  const broken = replay(caseOf("6c"));
  show(<WeekPlanCard view={broken.view} logs={broken.journal} onDecide={jest.fn()} onOpen={jest.fn()} />);
  expect(screen.getByText("La séance reliée a changé de semaine.")).toBeTruthy();
  const paused = replay(caseOf("7 —"));
  screen.unmount();
  show(<WeekPlanCard view={paused.view as WeekPlanView} logs={paused.journal} onDecide={jest.fn()} onOpen={jest.fn()} />);
  expect(screen.getByTestId("occurrence-status-2026-11-16/1").props.children).toBe("Semaine en pause : non faite, sans écart");
});

/* ---------- The screen: Progrès › Ma semaine (PlanScreen) with the profile preferences of a real hook contract ---------- */
const mockSaved: unknown[] = [];
const mockPrefs = { schedule: JSON.parse(JSON.stringify(FIXTURE.type)) as Schedule, cadencePauses: [] as string[] };
const mockLogs: TrainingLog[] = FIXTURE.logs.filter((l) => l.id === "run-thu" || l.id === "gym-thu");
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return { ...actual, useNavigation: () => ({ navigate: jest.fn(), push: jest.fn() }) };
});
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "u1" }));
jest.mock("../src/data/hooks", () => ({
  usePrefs: () => ({ weeklyGoalSessions: 3, favoriteSports: [], onboardedAt: null, notifications: {}, ...mockPrefs }),
  useSavePrefs: () => ({ isPending: false, mutateAsync: jest.fn(async ({ prefs }: { prefs: unknown }) => { mockSaved.push(prefs); return {}; }) }),
  useLogs: () => ({ logs: mockLogs, active: mockLogs }),
}));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));

test("Ma semaine: moving the Tuesday run to Thursday is saved in the schedule and read back as the website reads it", async () => {
  jest.useFakeTimers({ now: new Date("2026-11-21T10:00:00+01:00"), doNotFake: ["nextTick", "setImmediate"] });
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PlanScreen } = require("../src/screens/progress/PlanScreen");
    show(<PlanScreen />);
    expect(screen.getByTestId("week-plan-2026-11-16")).toBeTruthy();
    fireEvent.press(screen.getByTestId("occurrence-act-2026-11-16/1"));
    await act(async () => { fireEvent.press(screen.getByTestId("move-2026-11-19")); });
    await waitFor(() => expect(mockSaved.length).toBe(1));
    const saved = mockSaved[0] as { schedule: Schedule };
    expect(saved.schedule.weeks["2026-11-16"].occ["2026-11-16/1"]).toMatchObject({ kind: "move", day: "2026-11-19" });
    expect(saved.schedule.tuesday.sport).toBe("running");
    // The same schedule read back gives the website's week: the run tied on Thursday, counted once.
    const v = WeekPlan.week(saved.schedule, mockLogs, { today: "2026-11-21", zone: "Europe/Paris" });
    expect(v.summary).toMatchObject({ moved: 1, gaps: 1, extra: 0 });
  } finally {
    jest.useRealTimers();
  }
});
