/* V1.9.2 — Retour sur la séance, athlete side on Android. The payloads are the server's own answers (tests/fixtures/coach-feedback.json,
   assembled by tools/db/coach-feedback/build-fixtures.mjs on PostgreSQL 16). Wording comes from the website's module, byte for byte. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CoachFeedbackList } from "../src/screens/community/CoachFeedback";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FX = require("../../tests/fixtures/coach-feedback.json");
const OWNER = "19200000-0000-4000-8000-0000000000a1";
const SESSION = "19200000-0000-4000-8000-0000000005a1";
const mockRpc = jest.fn();
const mockAlert = jest.fn();
const mockAsk = jest.fn(async () => true);
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "19200000-0000-4000-8000-0000000000a1" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "19200000-0000-4000-8000-0000000000a1" }));
jest.mock("../src/components/Dialog", () => ({ Alert: { alert: (...a: unknown[]) => mockAlert(...a) }, ask: (...a: unknown[]) => mockAsk(...(a as [])) }));

let state: { flag: boolean; inbox: unknown; answer: unknown; delay: number };
beforeEach(() => {
  jest.clearAllMocks();
  state = { flag: true, inbox: FX.athlete_session, answer: FX.answer_accepted, delay: 0 };
  mockRpc.mockImplementation((name: string, params: { p_action?: string }) => {
    const data = name === "titan_feature_flags_v1" ? { flags: { "screens.coach_feedback": state.flag } }
      : name === "titan_coach_feedback_v1" && params.p_action === "athlete" ? state.inbox
      : state.answer;
    const result = new Promise((r) => setTimeout(() => r({ data, error: null }), state.delay));
    return { setHeader: () => result };
  });
});
const show = (sessionId?: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoachFeedbackList owner={OWNER} online sessionId={sessionId} /></QueryClientProvider>);
const calls = (action: string) => mockRpc.mock.calls.filter(([n, p]) => n === "titan_coach_feedback_v1" && p.p_action === action);

test("the shared module is the website's file, byte for byte", () => {
  const web = readFileSync(join(__dirname, "../../js/core/coach-feedback.js"), "utf8");
  const app = readFileSync(join(__dirname, "../src/core/web/coach-feedback.js"), "utf8");
  expect(app).toBe(web);
});

test("from the session: the coach's observation, then the proposal, then what the coach sees of the session", async () => {
  show(SESSION);
  const row = FX.athlete_session.rows[0];
  const card = await screen.findByTestId(`feedback-${row.id}`, undefined, slow);
  expect(calls("athlete")[0][1].p_data).toEqual({ session_id: SESSION });
  expect(screen.getByText("Retour de ton coach sur cette séance")).toBeTruthy();
  expect(within(screen.getByTestId(`observation-${row.id}`)).getByText(row.observation)).toBeTruthy();
  const adj = within(screen.getByTestId(`adjustment-${row.id}`));
  expect(adj.getByText("À confirmer")).toBeTruthy();
  expect(adj.getByText("Ajuster « Force · Squat 5 × 5 »")).toBeTruthy();
  expect(adj.getByText("Consignes : 5 séries de 5 à 82,5 kg → 5 séries de 5 à 80 kg, RIR 2 sur chaque série")).toBeTruthy();
  expect(adj.queryByText(row.observation)).toBeNull();
  const shared = within(screen.getByTestId(`shared-${row.id}`));
  expect(shared.getByText("Squat · 4 × 6 à 80 kg — 80 kg × 6 (RIR 2) · 80 kg × 6 (RIR 1) · 80 kg × 6 (RIR 1) · 80 kg × 5 (RIR 0)")).toBeTruthy();
  expect(shared.getByText("Tu ne partages pas : la note.")).toBeTruthy();
  expect(within(card).queryByText(/Épaule/)).toBeNull();
});

test("accepting sends one answer, whatever the number of taps, after confirmation", async () => {
  state.delay = 300;
  show(SESSION);
  const row = FX.athlete_session.rows[0];
  const card = await screen.findByTestId(`feedback-${row.id}`, undefined, slow);
  const accept = within(card).getByText("Accepter l’ajustement");
  fireEvent.press(accept); fireEvent.press(accept); fireEvent.press(accept);
  await waitFor(() => expect(calls("answer").length).toBe(1), slow);
  await new Promise((r) => setTimeout(r, 400));
  expect(calls("answer")).toHaveLength(1);
  expect(calls("answer")[0][1].p_data).toEqual({ id: row.id, revision: row.revision, accept: true });
  expect(mockAsk).toHaveBeenCalled();
});

test("declining and « compris » send their own answer; a stale adjustment is reported, nothing changed", async () => {
  show();
  const row = FX.athlete_session.rows[0];
  const card = await screen.findByTestId(`feedback-${row.id}`, undefined, slow);
  state.answer = { ok: false, code: "ADJUSTMENT_STALE", row };
  fireEvent.press(within(card).getByText("Décliner"));
  await waitFor(() => expect(calls("answer").length).toBe(1), slow);
  expect(calls("answer")[0][1].p_data).toEqual({ id: row.id, revision: row.revision, accept: false });
  await waitFor(() => expect(mockAlert).toHaveBeenCalledWith("Ajustement non appliqué", "La proposition visée a changé ou a été annulée depuis : cet ajustement n’est plus applicable. Rien n’a été modifié."), slow);
  state.answer = row;
  fireEvent.press(within(await screen.findByTestId(`feedback-${row.id}`, undefined, slow)).getByText("Compris"));
  await waitFor(() => expect(calls("read").length).toBe(1), slow);
  expect(calls("read")[0][1].p_data).toEqual({ id: row.id });
});

test("the proposals screen lists every feedback, the new session to decide first, with the accepted one's result", async () => {
  state.inbox = FX.athlete_inbox;
  show();
  const [pending, accepted] = FX.athlete_inbox.rows;
  await screen.findByTestId(`feedback-${pending.id}`, undefined, slow);
  expect(screen.getByText("Retours de ton coach")).toBeTruthy();
  expect(within(screen.getByTestId(`adjustment-${pending.id}`)).getByText("Ajouter « Décharge »")).toBeTruthy();
  expect(within(screen.getByTestId(`adjustment-${pending.id}`)).getByText("Nom : Décharge")).toBeTruthy();
  expect(within(screen.getByTestId(`adjustment-${accepted.id}`)).getByText("Acceptée")).toBeTruthy();
  expect(within(screen.getByTestId(`feedback-${accepted.id}`)).queryByText("Accepter l’ajustement")).toBeNull();
});

test("after revocation: read-only, no answer offered, and the coach no longer sees the session", async () => {
  state.inbox = FX.athlete_revoked;
  show();
  const row = FX.athlete_revoked.rows[0];
  const card = await screen.findByTestId(`feedback-${row.id}`, undefined, slow);
  expect(within(card).getByText("Partage arrêté : lecture seule. Ton coach ne voit plus ce retour ni ta séance.")).toBeTruthy();
  expect(within(card).queryByText("Accepter l’ajustement")).toBeNull();
  expect(within(card).queryByText("Compris")).toBeNull();
  expect(within(card).getByText("Tu as archivé ou remplacé cette séance : ton coach ne voit plus ses mesures. Le retour reste lisible.")).toBeTruthy();
});

test("closed flag: nothing is asked and nothing is shown", async () => {
  state.flag = false;
  show(SESSION);
  await new Promise((r) => setTimeout(r, 300));
  expect(screen.queryByTestId("session-coach-feedback")).toBeNull();
  expect(calls("athlete")).toHaveLength(0);
});
