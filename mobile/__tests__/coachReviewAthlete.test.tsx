/* V1.9.3 — Revue de suivi, athlete side on Android. The coach prepared and sent Zoé's next proposal from the weekly review; she finds it in
   « Mes suivis de coaching », reads where it comes from in its history and answers it there, once. Payloads are the server's own answers
   (tests/fixtures/coach-review.json, printed by tools/db/coach-review/fixtures.sql on PostgreSQL 16). */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoachFollowup as F } from "../src/core/coachFollowup";
import { CoachProposals } from "../src/screens/community/CoachProposals";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FX = require("../../tests/fixtures/coach-review.json");
const OWNER = FX.athlete.owner as string;
const SENT = FX.send.assignment.id as string;
const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "19300000-0000-4000-8000-0000000000a3" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "19300000-0000-4000-8000-0000000000a3" }));
jest.mock("../src/components/Dialog", () => ({ Alert: { alert: jest.fn() }, ask: jest.fn(async () => true) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockImplementation((name: string, params: { p_action?: string }) => {
    const data = name === "titan_feature_flags_v1" ? { flags: { "screens.coach_followup": true } }
      : name === "titan_coach_followup_v1" && params.p_action === "athlete" ? FX.athlete
      : { ok: true };
    const result = new Promise((r) => setTimeout(() => r({ data, error: null }), 200));
    return { setHeader: () => result };
  });
});
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoachProposals owner={OWNER} online /></QueryClientProvider>);

test("the proposal sent from the review waits for Zoé in her own space, with its origin in the history", async () => {
  show();
  const card = await screen.findByTestId(`proposal-${SENT}`, undefined, slow);
  expect(within(card).getByText("En attente")).toBeTruthy();
  expect(within(card).getByText("Seuil 3 × 8 min")).toBeTruthy();
  fireEvent.press(within(card).getByText("Voir l’historique"));
  expect(within(card).getByText(new RegExp(`Préparée lors de la revue de la semaine du ${F.day(FX.week_all.week)}, envoyée par le coach$`))).toBeTruthy();
});

test("Zoé accepts it once, whatever the number of taps; nothing else is sent", async () => {
  show();
  const card = await screen.findByTestId(`proposal-${SENT}`, undefined, slow);
  const accept = within(card).getByText("Accepter");
  fireEvent.press(accept); fireEvent.press(accept); fireEvent.press(accept);
  await waitFor(() => expect(mockRpc.mock.calls.filter(([n]) => n === "titan_coach_portal")).toHaveLength(1));
  expect(mockRpc.mock.calls.find(([n]) => n === "titan_coach_portal")![1]).toEqual({ p_action: "assignment_status", p_data: { id: SENT, revision: 1, status: "accepted" } });
  expect(mockRpc.mock.calls.some(([n]) => n === "titan_coach_review_v1")).toBe(false);
});
