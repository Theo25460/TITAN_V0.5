/* V1.7.3 — Bilan et ajustements on Android: the shared test set of the website (tests/fixtures/week-review-v173.json), replayed through
   the copied modules, gives exactly the website's bilans (tests/fixtures/week-review-v173.expected.json): same observation, sources,
   actions, preview, programme, follow-up and words. The card previews before anything is written; « Annuler » and « Pas maintenant »
   write nothing; the screen saves the choice and its undo through the profile preferences (schedule and cadence pauses). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type React from "react";
import { WeekReviewCard } from "../src/components/WeekReviewCard";
import { Sports, WeekPlan, WeekReview, type ReviewAction, type Schedule } from "../src/core";
import type { TrainingLog } from "../src/core/types";

const read = (p: string) => JSON.parse(readFileSync(join(__dirname, p), "utf8"));
type Op = { op: "edit" | "decide" | "apply" | "undo"; day?: string; value?: { sport: string; minutes?: number }; id?: string; decision?: Parameters<typeof WeekPlan.decide>[2]; week?: string; action?: ReviewAction; today: string; at?: string };
type Case = { name: string; journal: string[]; ops: Op[]; remote?: Op[]; type?: Schedule; preview?: ReviewAction; read: { week: string; today: string; program?: string } };
const FIXTURE = read("../../tests/fixtures/week-review-v173.json") as { zone: string; type: Schedule; logs: TrainingLog[]; cases: Case[] };
const EXPECTED = read("../../tests/fixtures/week-review-v173.expected.json") as { version: number; cases: Record<string, unknown> };
const label = (s: string) => Sports.label(s);
const dayLong = (k: string) => k;

/* Same replay and projection as tools/week-review/replay.mjs (the website side). */
type St = { schedule: Schedule; pauses: string[] };
function replay(c: Case) {
  const journal = FIXTURE.logs.filter((l) => c.journal.includes(l.id));
  const until = (at?: string) => journal.filter((l) => !at || new Date(l.date).getTime() <= new Date(at).getTime());
  const run = (start: St, ops: Op[]) => ops.reduce<St>((st, op) => {
    const o = { today: op.today, zone: FIXTURE.zone, pauses: st.pauses, at: op.at };
    if (op.op === "edit") return { ...st, schedule: WeekPlan.editType(st.schedule, op.day!, op.value!, { today: op.today, at: op.at }).schedule };
    if (op.op === "decide") return { ...st, schedule: WeekPlan.decide(st.schedule, op.id!, op.decision!, { today: op.today, at: op.at }) };
    if (op.op === "apply") { const r = WeekReview.apply(st.schedule, until(op.at), { ...o, week: op.week }, op.action!); return { schedule: r.schedule, pauses: r.pauses }; }
    const r = WeekReview.undo(st.schedule, st.pauses, { week: op.week!, today: op.today, at: op.at });
    return { schedule: r.schedule, pauses: r.pauses };
  }, start);
  const start: St = { schedule: JSON.parse(JSON.stringify(c.type || FIXTURE.type)), pauses: [] };
  let st = run(start, c.ops || []);
  if (c.remote) {
    const other = run(st, c.remote);
    st = { schedule: WeekPlan.merge(st.schedule, other.schedule), pauses: [...new Set([...st.pauses, ...other.pauses])] };
  }
  const opts = { week: c.read.week, today: c.read.today, zone: FIXTURE.zone, pauses: st.pauses, at: "2026-11-22T17:59:00.000Z" };
  const before = JSON.stringify(st);
  const view = WeekReview.review(st.schedule, journal, opts);
  const preview = c.preview ? WeekReview.preview(st.schedule, journal, opts, c.preview) : null;
  const unchanged = JSON.stringify(st) === before;
  const program = c.read.program ? WeekPlan.week(st.schedule, journal, { week: c.read.program, today: c.read.today, zone: FIXTURE.zone, pauses: st.pauses }) : null;
  return { ...st, journal, view, preview, program, unchanged, opts };
}
function project(res: ReturnType<typeof replay>) {
  return {
    review: WeekReview.snapshot(res.view),
    words: { observation: WeekReview.describeObservation(res.view.observation, { label }), followUp: WeekReview.describeFollowUp(res.view.followUp, { label, dayLong }) },
    preview: res.preview ? { changes: res.preview.changes, appliesFrom: res.preview.appliesFrom, scope: res.preview.scope, words: WeekReview.describePreview(res.preview, { label, dayLong }) } : null,
    program: res.program ? { paused: res.program.paused, occurrences: res.program.occurrences.map((o) => ({ id: o.id, effective: o.effective, status: o.status, decision: o.decision ? o.decision.kind : null, origin: o.decision?.origin || null })), adjustments: WeekReview.adjustments(res.schedule, { week: res.program.week, today: res.opts.today }).map((a) => ({ week: a.week, action: a.action })) } : null,
    pauses: res.pauses,
    type: WeekPlan.typeDays(res.schedule).map((d) => (d ? d.sport : null)),
    measure: WeekReview.measure(res.schedule, res.journal, res.opts),
  };
}
const caseOf = (prefix: string) => FIXTURE.cases.find((c) => c.name.startsWith(prefix))!;

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

test("the Android copy of the modules is the website's, with the same rules version", () => {
  for (const f of ["week-review.js", "week-plan.js"]) expect(readFileSync(join(__dirname, `../src/core/web/${f}`), "utf8")).toBe(readFileSync(join(__dirname, `../../js/core/${f}`), "utf8"));
  expect(WeekReview.VERSION).toBe(EXPECTED.version);
});

test.each(FIXTURE.cases.map((c) => [c.name, c] as const))("same bilan as the website — %s", (_name, c) => {
  expect(project(replay(c))).toEqual(EXPECTED.cases[c.name]);
});

test("the card: the observation, its sources with their own measures (each opens its sheet), the actions", () => {
  const res = replay(caseOf("1 —"));
  const onOpen = jest.fn();
  show(<WeekReviewCard review={res.view} schedule={res.schedule} logs={res.journal} today="2026-11-22" zone="Europe/Paris" pauses={[]} onApply={jest.fn()} onUndo={jest.fn()} onOpen={onOpen} />);
  expect(text("review-observation")).toBe("Le créneau du mardi (Course à pied) a été déplacé 2 fois sur 4 semaines suivies");
  expect(screen.getByText("Escalade bloc du jeudi : 4/4 comme prévu.")).toBeTruthy();
  fireEvent.press(screen.getByTestId("review-source-run-w4"));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "run-w4" }));
  expect(screen.getByTestId("review-suggested")).toBeTruthy();
  for (const id of ["review-keep", "review-move", "review-pause", "review-dismiss"]) expect(screen.getByTestId(id)).toBeTruthy();
});

test("the preview: next week only, then the typical week; « Annuler » writes nothing, « Confirmer » sends the chosen action", async () => {
  const res = replay(caseOf("1 —"));
  const onApply = jest.fn(async () => true);
  show(<WeekReviewCard review={res.view} schedule={res.schedule} logs={res.journal} today="2026-11-22" zone="Europe/Paris" pauses={[]} onApply={onApply} onUndo={jest.fn()} onOpen={jest.fn()} />);
  fireEvent.press(screen.getByTestId("review-suggested"));
  expect(screen.getByText("Mardi : Course à pied → libre")).toBeTruthy();
  expect(screen.getByText("Mercredi : libre → Course à pied")).toBeTruthy();
  expect(text("review-where")).toMatch(/^Seulement la semaine du lundi 23 novembre\. Ta semaine type ne change pas\.$/);
  fireEvent.press(screen.getByTestId("review-scope-type"));
  expect(text("review-where")).toBe("Ta semaine type change à partir du lundi 23 novembre.");
  fireEvent.press(screen.getByTestId("review-cancel"));
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("review-suggested"));
  await act(async () => { fireEvent.press(screen.getByTestId("review-confirm")); });
  expect(onApply).toHaveBeenCalledWith("2026-11-16", { kind: "move", from: 1, to: 2, scope: "next" });
});

test("history too short: no change is suggested, keep the plan or enrich the history", () => {
  const res = replay(caseOf("7 —"));
  show(<WeekReviewCard review={res.view} schedule={res.schedule} logs={res.journal} today="2026-11-22" zone="Europe/Paris" pauses={[]} onApply={jest.fn()} onUndo={jest.fn()} onOpen={jest.fn()} />);
  expect(text("review-observation")).toBe("Historique trop court pour un constat");
  expect(screen.queryByTestId("review-suggested")).toBeNull();
  expect(screen.getByText("Garder mon plan")).toBeTruthy();
});

test("the second bilan: the change decided, then what was observed after it applied, with the session", () => {
  const res = replay(caseOf("5 —"));
  show(<WeekReviewCard review={res.view} schedule={res.schedule} logs={res.journal} today="2026-11-29" zone="Europe/Paris" pauses={[]} onApply={jest.fn()} onUndo={jest.fn()} onOpen={jest.fn()} />);
  expect(text("review-decided")).toBe("Décidé au bilan de la semaine du lundi 16 novembre : déplacer Course à pied du mardi au mercredi la semaine suivante.");
  expect(text("review-observed")).toBe("Observé après : Course à pied faite le mercredi, comme décidé.");
  expect(screen.getByTestId("review-follow-session-run-w5")).toBeTruthy();
  expect(screen.getByText("Garder le mercredi dans ma semaine type")).toBeTruthy();
});

/* ---------- The screen: Progrès › Ma semaine with the profile preferences of a real hook contract ---------- */
const mockSaved: { schedule?: Schedule; cadencePauses?: string[] }[] = [];
const mockState = { prefs: { schedule: {} as Schedule, cadencePauses: [] as string[] }, logs: [] as TrainingLog[] };
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return { ...actual, useNavigation: () => ({ navigate: jest.fn(), push: jest.fn() }) };
});
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "u1" }));
jest.mock("../src/data/hooks", () => ({
  usePrefs: () => ({ weeklyGoalSessions: 3, favoriteSports: [], onboardedAt: null, notifications: {}, ...mockState.prefs }),
  useSavePrefs: () => ({ isPending: false, mutateAsync: jest.fn(async ({ prefs }: { prefs: { schedule?: Schedule; cadencePauses?: string[] } }) => { mockSaved.push(prefs); return {}; }) }),
  useLogs: () => ({ logs: mockState.logs, active: mockState.logs }),
}));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));

test("Ma semaine: the bilan's pause is saved with the schedule in one write, shown for next week, and undone from there", async () => {
  jest.useFakeTimers({ now: new Date("2026-11-22T18:00:00+01:00"), doNotFake: ["nextTick", "setImmediate"] });
  try {
    const base = replay(caseOf("1 —"));
    mockState.prefs = { schedule: base.schedule, cadencePauses: [] };
    mockState.logs = base.journal;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PlanScreen } = require("../src/screens/progress/PlanScreen");
    const view = show(<PlanScreen />);
    expect(screen.getByTestId("week-review-2026-11-16")).toBeTruthy();
    fireEvent.press(screen.getByTestId("review-pause"));
    expect(text("review-where")).toMatch(/^La semaine du lundi 23 novembre est mise en pause/);
    await act(async () => { fireEvent.press(screen.getByTestId("review-confirm")); });
    await waitFor(() => expect(mockSaved.length).toBe(1));
    expect(mockSaved[0].cadencePauses).toEqual(["2026-11-23"]);
    expect(mockSaved[0].schedule!.reviews["2026-11-16"].action).toEqual({ kind: "pause", scope: "next" });
    // Read back (as the website reads the same preferences): next week's adjustment with its origin, and its undo.
    mockState.prefs = { schedule: mockSaved[0].schedule!, cadencePauses: mockSaved[0].cadencePauses! };
    view.unmount();
    show(<PlanScreen />);
    expect(screen.getByTestId("adjustment-2026-11-16")).toBeTruthy();
    expect(screen.getByText("Semaine du lundi 23 novembre · choisi au bilan de la semaine du lundi 16 novembre")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("adjustment-undo-2026-11-16")); });
    await waitFor(() => expect(mockSaved.length).toBe(2));
    expect(mockSaved[1].cadencePauses).toEqual([]);
    expect(mockSaved[1].schedule!.reviews["2026-11-16"].undone).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});
