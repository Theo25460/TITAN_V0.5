/* V1.9.1 — Une séance assignée, athlete side on Android. The payloads are the server's own answers (tests/fixtures/coach-followup.json,
   printed by tools/db/coach-followup/fixtures.sql on PostgreSQL 16). Wording and allowed actions come from the website's module. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CoachFollowup as F } from "../src/core/coachFollowup";
import { CoachProposals } from "../src/screens/community/CoachProposals";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FX = require("../../tests/fixtures/coach-followup.json");
const OWNER = FX.athlete_before.owner as string;
const mockRpc = jest.fn();
const mockAlert = jest.fn();
const mockAsk = jest.fn(async () => true);
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "19100000-0000-4000-8000-0000000000a1" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "19100000-0000-4000-8000-0000000000a1" }));
jest.mock("../src/components/Dialog", () => ({ Alert: { alert: (...a: unknown[]) => mockAlert(...a) }, ask: (...a: unknown[]) => mockAsk(...(a as [])) }));

let state: { flag: boolean; inbox: unknown; answer: unknown; delay: number };
beforeEach(() => {
  jest.clearAllMocks();
  state = { flag: true, inbox: FX.athlete_before, answer: { ok: true }, delay: 0 };
  mockRpc.mockImplementation((name: string, params: { p_action?: string }) => {
    const data = name === "titan_feature_flags_v1" ? { flags: { "screens.coach_followup": state.flag } }
      : name === "titan_coach_followup_v1" && params.p_action === "athlete" ? state.inbox
      : state.answer;
    const result = new Promise((r) => setTimeout(() => r({ data, error: null }), state.delay));
    return { setHeader: () => result };
  });
});
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoachProposals owner={OWNER} online /></QueryClientProvider>);
const row = (inbox: { rows: { title: string; id: string; revision: number }[] }, title: string) => inbox.rows.find((r) => r.title === title)!;
const calls = (action: string) => mockRpc.mock.calls.filter(([n, p]) => n === "titan_coach_followup_v1" && p.p_action === action);

test("the shared module is the website's file, byte for byte", () => {
  const web = readFileSync(join(__dirname, "../../js/core/coach-followup.js"), "utf8");
  const app = readFileSync(join(__dirname, "../src/core/web/coach-followup.js"), "utf8");
  expect(app).toBe(web);
});

test("a change to review beside the version in force, and a match only suggested", async () => {
  show();
  const easy = row(FX.athlete_before, "Footing souple");
  expect(await screen.findByTestId(`changes-${easy.id}`, undefined, slow)).toBeTruthy();
  expect(screen.getByText("Ton coach propose un changement. Ta version acceptée reste valable tant que tu n’as pas répondu.")).toBeTruthy();
  expect(screen.getByText("Consignes : 45 min en aisance → 50 min dont 10 min allure marathon")).toBeTruthy();
  expect(screen.getByText("Mot de ton coach : « On allonge un peu cette semaine »")).toBeTruthy();
  const hill = row(FX.athlete_before, "Côtes · 8 × 45 s") as unknown as { id: string; planned_date: string; moved_date: string };
  expect(within(screen.getByTestId(`proposal-${hill.id}`)).getByText("À rapprocher")).toBeTruthy();
  expect(screen.getByText(`Prévue : ${F.day(hill.planned_date)}`)).toBeTruthy();
  expect(screen.getByText(`Déplacée au : ${F.day(hill.moved_date)}`)).toBeTruthy();
  expect(screen.getByText("Une séance de ton journal semble correspondre. Confirme si c’est bien elle : rien n’est lié sans toi.")).toBeTruthy();
  expect(calls("link")).toHaveLength(0);
});

test("confirming the match sends one link, whatever the number of taps", async () => {
  state.delay = 300;
  show();
  const hill = row(FX.athlete_before, "Côtes · 8 × 45 s");
  const button = within(await screen.findByTestId(`proposal-${hill.id}`, undefined, slow)).getByText("Oui, c’est elle : relier");
  fireEvent.press(button);
  fireEvent.press(button);
  await waitFor(() => expect(calls("link")).toHaveLength(1), slow);
  expect(calls("link")[0][1].p_data).toEqual({ id: hill.id, revision: hill.revision, session_id: "19100000-0000-4000-8000-0000000005a1" });
});

test("a second link attempt is answered with the link in place, never applied", async () => {
  state.answer = FX.link_refused;
  show();
  const hill = row(FX.athlete_before, "Côtes · 8 × 45 s");
  fireEvent.press(within(await screen.findByTestId(`proposal-${hill.id}`, undefined, slow)).getByText("Oui, c’est elle : relier"));
  await waitFor(() => expect(mockAlert).toHaveBeenCalledWith("Lien non ajouté", "Cette proposition est déjà liée à une séance : le lien en place est gardé."), slow);
});

test("the athlete answers the change, and moves a session to another day", async () => {
  show();
  const easy = row(FX.athlete_before, "Footing souple");
  fireEvent.press(await screen.findByText("Garder ma version", undefined, slow));
  await waitFor(() => expect(calls("answer_change")).toHaveLength(1), slow);
  expect(calls("answer_change")[0][1].p_data).toEqual({ id: easy.id, revision: easy.revision, accept: false });
  const hill = row(FX.athlete_before, "Côtes · 8 × 45 s") as unknown as { id: string; revision: number; planned_date: string };
  fireEvent.press(within(screen.getByTestId(`proposal-${hill.id}`)).getByText("Déplacer"));
  const target = new Date(Date.parse(hill.planned_date + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  fireEvent.press(await screen.findByTestId(`move-${hill.id}-${target}`, undefined, slow));
  await waitFor(() => expect(calls("move")).toHaveLength(1), slow);
  expect(calls("move")[0][1].p_data).toEqual({ id: hill.id, revision: hill.revision, date: target });
});

test("after the link: the athlete may remove it, after a confirmation that says the journal stays as it is", async () => {
  state.inbox = FX.athlete_after;
  show();
  const hill = row(FX.athlete_after, "Côtes · 8 × 45 s");
  fireEvent.press(await screen.findByText("Retirer ce lien", undefined, slow));
  await waitFor(() => expect(calls("unlink")).toHaveLength(1), slow);
  expect(mockAsk).toHaveBeenCalledWith("Retirer ce lien ?", "La proposition redevient « prévue ». Ta séance reste dans ton journal, inchangée.", { confirmLabel: "Retirer le lien" });
  expect(calls("unlink")[0][1].p_data).toEqual({ id: hill.id, revision: hill.revision });
});

test("after a revocation: read-only, and the athlete still finds her own session", async () => {
  state.inbox = FX.athlete_revoked;
  show();
  expect((await screen.findAllByText("Partage arrêté : lecture seule. Ta séance reste dans ton journal.", undefined, slow)).length).toBe(3);
  const linked = FX.athlete_revoked.rows.find((r: { title: string }) => r.title === "Côtes · 8 × 45 s");
  expect(screen.getByText(`Ta séance : ${F.day(linked.linked.day)} · 9,4 km · 52 min`)).toBeTruthy();
  for (const label of ["Accepter", "Accepter le changement", "Retirer ce lien", "Déplacer", "Oui, c’est elle : relier"]) expect(screen.queryByText(label)).toBeNull();
  fireEvent.press(screen.getAllByText("Voir l’historique")[2]);
  expect(screen.getByText(/Seconde tentative de lien refusée : le lien en place est gardé$/)).toBeTruthy();
});

test("closed flag: nothing is shown and the follow-up is not even asked", async () => {
  state.flag = false;
  show();
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_feature_flags_v1", {}), slow);
  expect(screen.queryByTestId("coach-proposals")).toBeNull();
  expect(calls("athlete")).toHaveLength(0);
});
