/* V1.8.2 on Android — Reprise et relais facultatifs. The member who holds the relay passes the hand (to one member the server allows, or to
   the whole cordée) without any reason being asked; the member offered takes it back once (a double tap sends one call) and still has
   to receive it with their own session; a third member sees only that a handover is pending; a lost race reads plainly; leaving tells
   the truth; a group left with one member reads the collective rule. The server is a recorder (titan_cordee_relay_turn_v1); its rules
   are proven by sql/tests/300_cordee_reprise.sql. */
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

const LEA = { name: "Léa", me: false, family: "technique" };
const CORDEE = {
  id: "k1", title: "Les crêtes de l’Aube", route: "aube", pace: "reguliere", startsAt: "2026-11-20T10:00:00Z", endsAt: "2099-12-04T10:00:00Z", days: 14,
  status: "active", summitedAt: null, mine: true, myStatus: "joined", share: 10, cap: 15, target: 30, longueurs: 6, variety: 2, total: 8, percent: 26, camps: 1,
  families: ["technique", "endurance"], joined: 3, title_key: "cordee:aube", earned: false,
  me: { pitches: 2, counted: 2, days: 1, families: ["endurance"], strand: false },
  members: [
    { id: "owner-a", name: "Moi", status: "joined", me: true, pitches: 2, strand: false, families: ["endurance"] },
    { id: "u-lea", name: "Léa", status: "joined", me: false, pitches: 4, strand: false, families: ["technique"] },
    { id: null, name: "Membre de la cordée", status: "joined", me: false },
  ],
};
type Answer = { data: unknown; error: unknown };
let state: { cordees: unknown[]; relay: (args: Record<string, unknown>) => Answer | Promise<Answer>; turn: (args: Record<string, unknown>) => Answer | Promise<Answer>; afterError?: (l: unknown[]) => unknown[]; preview: unknown } =
  { cordees: [], relay: () => ({ data: null, error: null }), turn: () => ({ data: null, error: null }), preview: null };
beforeEach(() => {
  jest.clearAllMocks();
  state.afterError = undefined;
  resetDialogs();
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    let out: Answer | Promise<Answer> = { data: true, error: null };
    if (name === "titan_feature_flags_v1") out = { data: { flags: { "screens.cordee": true, "screens.cordee_relay": true } }, error: null };
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
const turnCalls = () => mockRpc.mock.calls.filter((c) => c[0] === "titan_cordee_relay_turn_v1");

const R = (relay: Record<string, unknown>) => ({ step: "sentinelle", status: "opened", active: true, can: null, opener: LEA, receiver: null, holder: null, holdUntil: null, handover: null, turn: [], choices: null, ...relay });
const ME = { name: "Moi", me: true, family: null };

test("the vendored module is the website's, byte for byte, with the V1.8.2 wording", () => {
  const web = readFileSync(join(__dirname, "../../js/core/cordee.js"), "utf8");
  expect(readFileSync(join(__dirname, "../src/core/web/cordee.js"), "utf8")).toBe(web);
  expect(Cordee.RELAY.turns.handover).toBe("Passer la main");
  expect(Cordee.RULE.holdHours).toBe(72);
  expect(Cordee.relayMessage({ message: "RELAY_HANDOVER_TAKEN" })).toBe(Cordee.RELAY_MESSAGES.RELAY_HANDOVER_TAKEN);
});

test("I hold the relay and need a pause: I pass the hand to Sam, no reason asked; then I can withdraw", async () => {
  state.cordees = [{ ...CORDEE, relay: R({ hint: "holder_session", holder: ME, turn: ["handover"], choices: [{ id: "u-sam", name: "Sam" }] }) }];
  state.turn = (a) => ({ data: R({ hint: "paused", changed: true, holder: ME, turn: ["withdraw"], handover: { pending: true, mine: true, forMe: false, open: a.p_to === null, to: a.p_to ? { name: "Sam", me: false, family: null } : null, expiresAt: "2099-01-01T00:00:00Z" } }), error: null });
  panel();
  expect((await screen.findByTestId("cordee-relay-holder-k1", undefined, slow)).props.children).toBe("Tu as pris le relais (72 h au plus).");
  fireEvent.press(screen.getByTestId("cordee-turn-handover-k1"));
  expect(await screen.findByText(/personne ne voit pourquoi tu passes la main/, undefined, slow)).toBeTruthy();
  expect(screen.queryByPlaceholderText(/raison|pourquoi/i)).toBeNull();
  fireEvent.press(screen.getByTestId("cordee-handover-to-u-sam"));
  fireEvent.press(screen.getByTestId("cordee-handover-submit-k1"));
  await waitFor(() => expect(turnCalls()).toEqual([["titan_cordee_relay_turn_v1", { p_id: "k1", p_action: "handover", p_to: "u-sam" }]]), slow);
  await waitFor(() => expect(screen.getByTestId("cordee-relay-handover-k1").props.children).toBe("Tu as passé la main à Sam : en attente de sa réponse."), slow);
  expect(screen.getByTestId("cordee-relay-mine-k1").props.children).toMatch(/Sans réponse, il redevient libre pour toute la cordée/);
  state.turn = () => ({ data: R({ hint: "holder_session", changed: true, holder: ME, turn: ["handover"], choices: [] }), error: null });
  fireEvent.press(screen.getByTestId("cordee-turn-withdraw-k1"));
  await waitFor(() => expect(screen.queryByTestId("cordee-relay-handover-k1")).toBeNull(), slow);
  expect(await screen.findByText("Passation retirée", undefined, slow)).toBeTruthy();
});

test("the relay is offered to me: a double tap takes it back once, and I still receive it with my own session", async () => {
  state.cordees = [{ ...CORDEE, relay: R({ hint: "offered", holder: { name: "Léa", me: false, family: null }, turn: ["accept"], handover: { pending: true, mine: false, forMe: true, open: false, to: null, expiresAt: "2099-01-01T00:00:00Z" } }) }];
  state.turn = () => new Promise((r) => setTimeout(() => r({ data: R({ hint: "holder", can: "confirm", changed: true, holder: ME, turn: ["handover"], choices: [] }), error: null }), 200));
  panel();
  expect((await screen.findByTestId("cordee-relay-handover-k1", undefined, slow)).props.children).toBe("Le relais t’est proposé : tu peux le reprendre.");
  expect(screen.queryByTestId("cordee-relay-confirm-k1")).toBeNull();
  const button = screen.getByTestId("cordee-turn-accept-k1");
  fireEvent.press(button);
  fireEvent.press(button);
  await waitFor(() => expect(screen.getByTestId("cordee-relay-confirm-k1")).toBeTruthy(), slow);
  expect(turnCalls()).toEqual([["titan_cordee_relay_turn_v1", { p_id: "k1", p_action: "accept", p_to: null }]]);
  expect(screen.getByTestId("cordee-relay-mine-k1").props.children).toMatch(/^Tu tiens le relais : ta séance confirmée d’un autre jour/);
  expect(screen.getByText(/La cordée : 8 \/ 30/)).toBeTruthy();
});

test("two members accept at once: the one who lost reads it and sees the new holder; a third member sees no recipient", async () => {
  state.cordees = [{ ...CORDEE, relay: R({ hint: "offered", holder: { name: "Léa", me: false, family: null }, turn: ["accept"], handover: { pending: true, mine: false, forMe: true, open: true, to: null, expiresAt: "2099-01-01T00:00:00Z" } }) }];
  state.turn = () => ({ data: null, error: { code: "22023", message: "RELAY_HANDOVER_TAKEN" } });
  state.afterError = (list) => list.map((c) => ({ ...(c as object), relay: R({ hint: "held", holder: { name: "Sam", me: false, family: null }, handover: { pending: false } }) }));
  panel();
  fireEvent.press(await screen.findByTestId("cordee-turn-accept-k1", undefined, slow));
  expect(await screen.findByText(Cordee.RELAY_MESSAGES.RELAY_HANDOVER_TAKEN, undefined, slow)).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("cordee-relay-holder-k1").props.children).toBe("Relais pris en charge par Sam."), slow);
  expect(screen.queryByTestId("cordee-turn-accept-k1")).toBeNull();
});

test("a third member: « Passation en cours. », no recipient, no reason, no button", async () => {
  state.cordees = [{ ...CORDEE, mine: false, relay: R({ hint: "held", holder: { name: "Membre de la cordée", me: false, family: null }, handover: { pending: true, mine: false, forMe: false, open: null, to: null, expiresAt: "2099-01-01T00:00:00Z" } }) }];
  panel();
  expect((await screen.findByTestId("cordee-relay-handover-k1", undefined, slow)).props.children).toBe("Passation en cours.");
  expect(screen.getByTestId("cordee-relay-mine-k1").props.children).not.toMatch(/pause|raison|motif/i);
  for (const t of ["take", "handover", "withdraw", "accept"]) expect(screen.queryByTestId(`cordee-turn-${t}-k1`)).toBeNull();
  expect(screen.queryByTestId("cordee-relay-confirm-k1")).toBeNull();
});

test("leaving tells the truth; a group left with one member reads the collective rule; the opener alone gets no button", async () => {
  state.cordees = [{ ...CORDEE, joined: 1, needs: 2, kept: 2, contributors: 2, target: 12, members: [CORDEE.members[0]], relay: R({ hint: "alone", opener: { name: "Moi", me: true, family: "technique" } }) }];
  panel();
  expect((await screen.findByTestId("cordee-kept-k1", undefined, slow)).props.children).toMatch(/^2 longueurs restent acquises grâce à des membres partis/);
  expect(screen.getByTestId("cordee-alone-k1").props.children).toMatch(/au moins deux membres/);
  expect(screen.getByTestId("cordee-relay-mine-k1").props.children).toMatch(/^Il faut un autre membre encordé/);
  for (const t of ["take", "handover", "withdraw", "accept"]) expect(screen.queryByTestId(`cordee-turn-${t}-k1`)).toBeNull();
  fireEvent.press(screen.getByTestId("cordee-leave-k1"));
  expect(await screen.findByText(Cordee.LEAVE, undefined, slow)).toBeTruthy();
  expect(screen.queryByText(/ne compteront plus/)).toBeNull();
});
