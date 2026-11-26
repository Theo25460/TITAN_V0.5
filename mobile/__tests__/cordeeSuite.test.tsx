/* V1.8.3 on Android — Un groupe qui se retrouve. A finished cordée stays readable with its story; « Repartir ensemble » shows the proposals
   (acceptances named under the Cordée rule, refusals as a count); I propose a route at the suggested pace without any text; a double tap
   accepts once and the group sets off with the counters at zero; two distinct proposals are a choice; with the flag closed only my own
   proposal can be withdrawn. The server is a recorder (titan_cordee_suite_v1); its rules are proven by sql/tests/300_cordee_suite.sql. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";
import { ToastProvider } from "../src/components/Toast";
import { Cordee } from "../src/core/cordee";
import { CordeePanel } from "../src/screens/community/CordeePanel";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));

const LEA = { name: "Léa", me: false };
const ME = { name: "Moi", me: true };
const STORY = [
  { kind: "formed", at: "2026-11-01T08:00:00Z", members: 4 },
  { kind: "relay_opened", at: "2026-11-05T08:00:00Z", who: { name: "Léa", me: false, family: "technique" } },
  { kind: "summit", at: "2026-11-15T08:00:00Z", total: 40 },
];
const CORDEE = {
  id: "k1", title: "Les crêtes de l’Aube", route: "aube", pace: "soutenue", startsAt: "2026-11-01T08:00:00Z", endsAt: "2026-11-15T08:00:00Z", days: 14,
  status: "summited", summitedAt: "2026-11-15T08:00:00Z", mine: true, myStatus: "joined", share: 10, cap: 15, target: 40, longueurs: 34, variety: 6, total: 40, percent: 100, camps: 4,
  families: ["technique", "endurance"], joined: 4, title_key: "cordee:aube", earned: true,
  me: { pitches: 12, counted: 12, days: 8, families: ["endurance"], strand: true },
  members: [
    { id: "owner-a", name: "Moi", status: "joined", me: true, pitches: 12, strand: true, families: ["endurance"] },
    { id: "u-lea", name: "Léa", status: "joined", me: false, pitches: 10, strand: true, families: ["technique"] },
    { id: null, name: "Membre de la cordée", status: "joined", me: false },
  ],
  relay: null, follows: null, story: STORY,
};
const SUITE = { closesAt: "2099-12-01T00:00:00Z", can: [], group: 4, waiting: 0, choice: false, previous: { route: "aube", pace: "soutenue", days: 14, summited: false }, proposals: [], hint: "propose" };
const P = (p: Record<string, unknown>) => ({ id: "p1", route: "marees", pace: "douce", days: 14, status: "open", by: LEA, mine: false, myAnswer: null, yes: 1, no: 0, eligible: 4, waiting: 3,
  accepted: [LEA], others: 0, expiresAt: "2099-12-01T00:00:00Z", startedId: null, myStatus: null, joined: null, turn: ["accept", "decline"], ...p });
const finished = (suite: Record<string, unknown>) => ({ ...CORDEE, suite: { ...SUITE, ...suite } });
type Answer = { data: unknown; error: unknown };
let state: { cordees: unknown[]; relay: (args: Record<string, unknown>) => Answer | Promise<Answer>; turn: (args: Record<string, unknown>) => Answer | Promise<Answer>; suite?: (args: Record<string, unknown>) => Answer | Promise<Answer>; afterError?: (l: unknown[]) => unknown[]; preview: unknown; flag?: boolean } =
  { cordees: [], relay: () => ({ data: null, error: null }), turn: () => ({ data: null, error: null }), preview: null };
beforeEach(() => {
  jest.clearAllMocks();
  state.afterError = undefined;
  state.flag = true;
  resetDialogs();
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    let out: Answer | Promise<Answer> = { data: true, error: null };
    if (name === "titan_feature_flags_v1") out = { data: { flags: { "screens.cordee": true, "screens.cordee_suite": state.flag !== false } }, error: null };
    if (name === "titan_cordees_v1") out = { data: { cordees: state.cordees, titles: [] }, error: null };
    if (name === "titan_cordee_relay_turn_v1") out = Promise.resolve(state.turn(args)).then((a) => {
      if (!a.error) state.cordees = state.cordees.map((c) => ((c as { id: string }).id === args.p_id ? { ...(c as object), relay: a.data } : c));
      else if (state.afterError) state.cordees = state.afterError(state.cordees);
      return a;
    });
    if (name === "titan_cordee_relay_v1") out = Promise.resolve(state.relay(args)).then((a) => {
      if (!a.error) state.cordees = state.cordees.map((c) => ((c as { id: string }).id === args.p_id ? { ...(c as object), relay: a.data } : c));
      return a;
    });
    if (name === "titan_cordee_suite_v1") out = Promise.resolve(state.suite ? state.suite(args) : { data: null, error: null }).then((a) => {
      const next = (a.data as { cordees?: unknown[] } | null)?.cordees;
      if (!a.error && next) state.cordees = next;
      return a;
    });
    if (name === "titan_challenge_link_preview_v1") out = { data: state.preview, error: null };
    if (name === "titan_challenge_link_accept_v1") out = { data: { id: "k1" }, error: null };
    const result = Promise.resolve(out);
    return { setHeader: () => result, then: (yes: (v: unknown) => unknown, no?: (e: unknown) => unknown) => result.then(yes, no) };
  });
});

function show(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
        <ToastProvider>{node}<DialogHost /></ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}
const panel = () => show(<CordeePanel owner="owner-a" online friends={[]} />);
const suiteCalls = () => mockRpc.mock.calls.filter((c) => c[0] === "titan_cordee_suite_v1");

test("the vendored modules are the website's, byte for byte, with the V1.8.3 wording", () => {
  for (const f of ["cordee.js", "social-digest.js"]) {
    expect(readFileSync(join(__dirname, `../src/core/web/${f}`), "utf8")).toBe(readFileSync(join(__dirname, `../../js/core/${f}`), "utf8"));
  }
  expect(Cordee.SUITE.labels.propose).toBe("Proposer un nouvel itinéraire");
  expect(Cordee.SUITE.proposalHours).toBe(72);
  expect(Cordee.suiteMessage({ message: "SUITE_ALREADY_IN" })).toBe(Cordee.SUITE_MESSAGES.SUITE_ALREADY_IN);
});

test("our cordée is over: its story stays readable; I propose a route at the suggested pace, no text asked", async () => {
  state.cordees = [finished({ can: ["propose"], hint: "propose" })];
  state.suite = (a) => ({ data: { proposal: "p9", status: "open", started: null, canonical: false, changed: true,
    cordees: [finished({ hint: "mine", proposals: [P({ id: "p9", route: a.p_route, pace: a.p_pace, days: a.p_days, by: ME, mine: true, myAnswer: "yes", accepted: [ME], turn: ["withdraw"] })] })] }, error: null });
  panel();
  await screen.findByTestId("cordee-story-k1", undefined, slow);
  expect(screen.getByTestId("cordee-story-k1-0").props.children).toBe("La cordée se forme à 4 sur « Les crêtes de l’Aube ».");
  expect(screen.getByTestId("cordee-story-k1-1").props.children).toBe("Léa (Prisme) ouvre le passage de la Sentinelle.");
  expect(screen.getByTestId("cordee-suite-hint-k1").props.children).toMatch(/seuls ceux qui acceptent repartent, avec des compteurs à zéro/);
  fireEvent.press(screen.getByTestId("cordee-suite-propose-k1"));
  expect(await screen.findByText("Régulière · conseillée", undefined, slow)).toBeTruthy();
  expect(screen.queryByPlaceholderText(/./)).toBeNull();
  fireEvent.press(screen.getByTestId("cordee-suite-route-forge"));
  fireEvent.press(screen.getByTestId("cordee-suite-days-21"));
  fireEvent.press(screen.getByTestId("cordee-suite-submit-k1"));
  await waitFor(() => expect(suiteCalls()).toEqual([["titan_cordee_suite_v1", { p_from: "k1", p_action: "propose", p_suite: null, p_route: "forge", p_pace: "reguliere", p_days: 21 }]]), slow);
  await waitFor(() => expect(screen.getByTestId("cordee-proposal-mine-p9").props.children).toBe("Tu as accepté en proposant."), slow);
  expect(screen.getByTestId("cordee-proposal-counts-p9").props.children).toBe("1 sur 4 a accepté · 3 n’ont pas encore répondu");
  expect(screen.getByTestId("cordee-proposal-withdraw-p9")).toBeTruthy();
});

test("a proposal waits for me: a double tap accepts once, the group sets off and the new cordée names the one it follows", async () => {
  state.cordees = [finished({ hint: "answer", waiting: 1, proposals: [P({ yes: 1, no: 1, waiting: 2 })] })];
  state.suite = () => new Promise((r) => setTimeout(() => r({ data: { proposal: "p1", status: "started", started: "n1", canonical: false, changed: true, cordees: [
    finished({ hint: "in", proposals: [P({ status: "started", myAnswer: "yes", myStatus: "joined", yes: 2, no: 1, joined: 2, accepted: [LEA, ME], turn: [] })] }),
    { ...CORDEE, id: "n1", route: "marees", status: "active", summitedAt: null, endsAt: "2099-12-01T00:00:00Z", earned: false, total: 0, target: 10, share: 5, longueurs: 0, variety: 0, percent: 0, camps: 0, joined: 2,
      story: null, suite: null, follows: { id: "k1", route: "aube", pace: "soutenue", summited: true, endedAt: "2026-11-15T08:00:00Z", proposedBy: LEA, group: 4, camps: 4, total: 40, target: 40 } }] }, error: null }), 200));
  panel();
  expect((await screen.findByTestId("cordee-proposal-counts-p1", undefined, slow)).props.children).toBe("1 sur 4 a accepté · 1 a décliné · 2 n’ont pas encore répondu");
  expect(screen.getByTestId("cordee-proposal-accepted-p1").props.children).toBe("A accepté : Léa.");
  const button = screen.getByTestId("cordee-proposal-accept-p1");
  fireEvent.press(button);
  fireEvent.press(button);
  await waitFor(() => expect(screen.getByTestId("cordee-follows-n1")).toBeTruthy(), slow);
  expect(suiteCalls()).toEqual([["titan_cordee_suite_v1", { p_from: "k1", p_action: "accept", p_suite: "p1", p_route: null, p_pace: null, p_days: null }]]);
  expect(screen.getByTestId("cordee-follows-n1").props.children).toBe("Suite de « Les crêtes de l’Aube » (sommet atteint, à 4). Proposée par Léa. Les compteurs sont repartis de zéro.");
  expect(screen.getByText(/La cordée : 0 \/ 10/)).toBeTruthy();
  expect(screen.getByTestId("cordee-proposal-mine-p1").props.children).toBe("Tu fais partie de la nouvelle cordée.");
  expect(await screen.findByText("La cordée repart", undefined, slow)).toBeTruthy();
});

test("two distinct proposals: an explicit choice; already roped in elsewhere, the refusal reads plainly", async () => {
  state.cordees = [finished({ hint: "answer", choice: true, waiting: 2, proposals: [P({}), P({ id: "p2", route: "forge", by: { name: "Membre de la cordée", me: false }, accepted: [], others: 1 })] })];
  state.suite = () => ({ data: null, error: { code: "22023", message: "SUITE_ALREADY_IN" } });
  panel();
  expect((await screen.findByTestId("cordee-suite-choice-k1", undefined, slow)).props.children).toMatch(/une acceptation à la fois/);
  expect(screen.getByTestId("cordee-proposal-accepted-p2").props.children).toBe("A accepté : 1 membre.");
  fireEvent.press(screen.getByTestId("cordee-proposal-accept-p2"));
  expect(await screen.findByText(Cordee.SUITE_MESSAGES.SUITE_ALREADY_IN, undefined, slow)).toBeTruthy();
});

test("the flag closed: the story stays, only my own proposal can be withdrawn; a refusal is never named", async () => {
  state.flag = false;
  state.cordees = [finished({ hint: "mine", proposals: [P({ id: "p3", by: ME, mine: true, myAnswer: "yes", no: 2, accepted: [ME], turn: ["withdraw"] }), P({ id: "p4" })] })];
  panel();
  await screen.findByTestId("cordee-story-k1", undefined, slow);
  expect(await screen.findByTestId("cordee-proposal-withdraw-p3", undefined, slow)).toBeTruthy();
  expect(screen.queryByTestId("cordee-proposal-p4")).toBeNull();
  expect(screen.queryByTestId("cordee-suite-propose-k1")).toBeNull();
  expect(screen.queryByTestId("cordee-suite-hint-k1")).toBeNull();
  expect(screen.getByTestId("cordee-proposal-counts-p3").props.children).toBe("1 sur 4 a accepté · 2 ont décliné · 1 n’a pas encore répondu");
});
