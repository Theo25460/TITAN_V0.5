/* V1.9.6 — Suivi collectif individualisé, athlete side on Android. A programme sent from a coach's group is an ordinary V1.9.4 programme:
   Zoé reads hers in « Mes suivis de coaching » and answers it, and nothing on her screen names the group, another athlete or a variant.
   Paul reads his version, a week later. After the coach deletes the group, Zoé still reads the same programme.
   Payloads are the server's own answers (tests/fixtures/coach-group.json, printed by tools/db/coach-group/fixtures.sql on PostgreSQL 16). */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoachPrograms } from "../src/screens/community/CoachPrograms";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FX = require("../../tests/fixtures/coach-group.json");
const mockRpc = jest.fn();
let mockUser = "";
let mockAthlete: unknown = null;
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: mockUser }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => mockUser }));
jest.mock("../src/components/Dialog", () => ({ Alert: { alert: jest.fn() }, ask: jest.fn(async () => true) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockImplementation((name: string, params: { p_action?: string }) => {
    const data = name === "titan_feature_flags_v1" ? { flags: { "screens.coach_programs": true, "screens.coach_groups": true } }
      : name === "titan_coach_program_v1" && params.p_action === "athlete" ? mockAthlete
      : name === "titan_coach_program_v1" && params.p_action === "answer" ? { ok: true, results: [] }
      : { ok: true };
    const result = new Promise((r) => setTimeout(() => r({ data, error: null }), 120));
    return { setHeader: () => result };
  });
});
const show = (payload: { owner: string }) => {
  mockUser = payload.owner; mockAthlete = payload;
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoachPrograms owner={payload.owner} online /></QueryClientProvider>);
};
const texts = (node: unknown): string => JSON.stringify(node);

test("Zoé reads the programme sent from the group as her own, with nothing of the group or of the others", async () => {
  const view = show(FX.program_athlete_zoe);
  const plan = FX.program_athlete_zoe.plans[0];
  const card = await screen.findByTestId(`plan-${plan.id}`, undefined, slow);
  expect(within(card).getByText("Bloc 10 km — 4 semaines")).toBeTruthy();
  const all = texts(view.toJSON());
  for (const other of ["Noé", "Paul", "Inès", "Malo", "Léa", "Hugo", "Sacha", "Groupe 10 km", "groupe", "variante"]) expect(all).not.toContain(other);
  expect(mockRpc.mock.calls.some(([n]) => n === "titan_coach_group_v1")).toBe(false);
});

test("Paul reads his own version, a week later, and answers it once", async () => {
  show(FX.program_athlete_paul);
  const plan = FX.program_athlete_paul.plans[0];
  expect(plan.start_date > FX.program_athlete_zoe.plans[0].start_date).toBe(true);
  const card = await screen.findByTestId(`plan-${plan.id}`, undefined, slow);
  fireEvent.press(within(card).getByTestId("answer-w1-tue-accept"));
  const btn = within(card).getByText("Envoyer mes réponses (1)");
  fireEvent.press(btn); fireEvent.press(btn);
  await waitFor(() => expect(mockRpc.mock.calls.filter(([n, p]) => n === "titan_coach_program_v1" && p.p_action === "answer").length).toBe(1), slow);
});

test("after the coach deletes the group, Zoé still reads the same programme", async () => {
  show(FX.program_athlete_zoe_after_delete);
  const plan = FX.program_athlete_zoe_after_delete.plans[0];
  expect(plan.id).toBe(FX.program_athlete_zoe.plans[0].id);
  expect(await screen.findByTestId(`plan-${plan.id}`, undefined, slow)).toBeTruthy();
});
