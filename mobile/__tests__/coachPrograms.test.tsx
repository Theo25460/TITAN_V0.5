/* V1.9.4 — Programmation multi-semaines, athlete side on Android. Inès reads the programme of Coach Lou week by week in « Mes suivis de
   coaching », answers session by session (accept, decline, to discuss with a word) once whatever the number of taps, accepts one change
   and keeps her version of another, and keeps a read-only view when the link is paused or ended, with her own linked session.
   Payloads are the server's own answers (tests/fixtures/coach-program.json, printed by tools/db/coach-program/fixtures.sql on PostgreSQL 16). */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CoachProgram as P } from "../src/core/coachProgram";
import { CoachPrograms } from "../src/screens/community/CoachPrograms";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FX = require("../../tests/fixtures/coach-program.json");
const OWNER = FX.athlete_sent.owner as string;
const mockRpc = jest.fn();
let mockStage = "sent";
let mockUser = "19400000-0000-4000-8000-0000000000a4";
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: mockUser }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => mockUser }));
jest.mock("../src/components/Dialog", () => ({ Alert: { alert: jest.fn() }, ask: jest.fn(async () => true) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Alert } = require("../src/components/Dialog");

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockImplementation((name: string, params: { p_action?: string; p_data?: { decisions?: { answer: string }[] } }) => {
    const athlete = ({ sent: FX.athlete_sent, changes: FX.athlete_changes, paused: FX.athlete_paused, revoked: FX.athlete_revoked } as Record<string, unknown>)[mockStage];
    const data = name === "titan_feature_flags_v1" ? { flags: { "screens.coach_programs": true } }
      : name === "titan_coach_program_v1" && params.p_action === "athlete" ? athlete
      : name === "titan_coach_program_v1" && params.p_action === "answer" ? (params.p_data?.decisions?.some((d) => d.answer.includes("change") || d.answer === "keep_version") ? FX.answer_changes : FX.answer)
      : { ok: true };
    const result = new Promise((r) => setTimeout(() => r({ data, error: null }), 200));
    return { setHeader: () => result };
  });
});
const show = (owner = OWNER) => { mockUser = owner; return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoachPrograms owner={owner} online /></QueryClientProvider>); };
const answers = () => mockRpc.mock.calls.filter(([n, p]) => n === "titan_coach_program_v1" && p.p_action === "answer");

test("the module synchronised from the website is the website's, byte for byte", () => {
  const web = readFileSync(join(__dirname, "../../js/core/coach-program.js"), "utf8");
  expect(readFileSync(join(__dirname, "../src/core/web/coach-program.js"), "utf8")).toBe(web);
  expect(readFileSync(join(__dirname, "../src/core/web/coach-followup.js"), "utf8")).toBe(readFileSync(join(__dirname, "../../js/core/coach-followup.js"), "utf8"));
});

test("Inès reads the programme week by week and answers: accept, decline, to discuss with a word — sent once", async () => {
  mockStage = "sent";
  show();
  const plan = FX.athlete_sent.plans[0];
  const card = await screen.findByTestId(`plan-${plan.id}`, undefined, slow);
  expect(within(card).getByText("Course et renforcement — Inès")).toBeTruthy();
  expect(within(card).getByTestId(`plan-summary-${plan.id}`).props.children).toBe("11 en attente de réponse");
  expect(within(card).getByText(P.weeks(plan, "athlete")[1].label)).toBeTruthy();
  fireEvent.press(within(card).getByTestId("answer-w1-tue-accept"));
  fireEvent.press(within(card).getByTestId("answer-w4-thu-decline"));
  fireEvent.press(within(card).getByTestId("answer-w3-sat-discuss"));
  fireEvent.changeText(within(card).getByTestId("note-w3-sat"), "Je préfère des côtes ce samedi-là");
  const sendBtn = within(card).getByText("Envoyer mes réponses (3)");
  fireEvent.press(sendBtn); fireEvent.press(sendBtn); fireEvent.press(sendBtn);
  await waitFor(() => expect(answers()).toHaveLength(1));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Réponses envoyées", "Ton coach voit tes réponses. Ton journal ne change pas."));
  expect(answers()).toHaveLength(1);
  expect(answers()[0][1].p_data).toEqual({ id: plan.id, decisions: [
    { key: "w1-tue", answer: "accept" }, { key: "w4-thu", answer: "decline" }, { key: "w3-sat", answer: "discuss", note: "Je préfère des côtes ce samedi-là" }] });
  expect(mockRpc.mock.calls.some(([n]) => n === "titan_coach_portal")).toBe(false);
});

test("after a revision: one change accepted, her version kept for another; the session done stays as it is", async () => {
  mockStage = "changes";
  show();
  const plan = FX.athlete_changes.plans[0];
  const card = await screen.findByTestId(`plan-${plan.id}`, undefined, slow);
  expect(within(card).getByTestId("plan-change-w2-thu")).toBeTruthy();
  expect(within(card).getAllByText("Liée").length).toBe(2);
  expect(within(card).queryByTestId("answer-w2-tue-accept")).toBeNull();
  fireEvent.press(within(card).getByTestId("answer-w2-thu-accept_change"));
  fireEvent.press(within(card).getByTestId("answer-w2-sat-keep_version"));
  fireEvent.press(within(card).getByText("Envoyer mes réponses (2)"));
  await waitFor(() => expect(answers()).toHaveLength(1));
  expect(answers()[0][1].p_data.decisions).toEqual([{ key: "w2-thu", answer: "accept_change" }, { key: "w2-sat", answer: "keep_version" }]);
});

test("paused, then ended: read-only, her own linked session still there, nothing to send", async () => {
  for (const stage of ["paused", "revoked"]) {
    mockStage = stage;
    const data = stage === "paused" ? FX.athlete_paused : FX.athlete_revoked;
    const view = show(data.owner);
    const plan = data.plans[0];
    const card = await screen.findByTestId(`plan-${plan.id}`, undefined, slow);
    expect(within(card).getByTestId(`plan-readonly-${plan.id}`).props.children).toBe(stage === "paused" ? "Suivi en pause : lecture seule, rien n’est supprimé." : "Partage arrêté : lecture seule.");
    expect(within(card).queryByText(/Envoyer mes réponses/)).toBeNull();
    expect(within(card).queryByText("Tout accepter")).toBeNull();
    expect(within(card).getAllByText(/Reliée à ta séance du/).length).toBeGreaterThan(0);
    view.unmount();
  }
  expect(answers()).toHaveLength(0);
});
