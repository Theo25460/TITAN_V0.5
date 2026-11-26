/* V1.8.1 on Android — Relais de cordée. The relay step of the pilot route shows the shared state, what this member can do and how the
   others contribute; only the button the server offers is shown (the opener is never offered to receive their own relay); a double tap
   sends one call; a refused session keeps the passage open and says why; a repeated validation answers « Déjà fait ». An invitation
   link https://titan-app.fr/defi?t=… opens Communauté › Défis with a native card that joins only on « S’encorder ». */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";
import { ToastProvider } from "../src/components/Toast";
import { Cordee } from "../src/core/cordee";
import { linking } from "../src/navigation/linking";
import { parseInvite } from "../src/lib/invite";
import { ChallengeLinkCard } from "../src/screens/community/ChallengeLinkCard";
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
let state: { cordees: unknown[]; relay: (args: Record<string, unknown>) => Answer | Promise<Answer>; preview: unknown } = { cordees: [], relay: () => ({ data: null, error: null }), preview: null };
beforeEach(() => {
  jest.clearAllMocks();
  resetDialogs();
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    let out: Answer | Promise<Answer> = { data: true, error: null };
    if (name === "titan_feature_flags_v1") out = { data: { flags: { "screens.cordee": true, "screens.cordee_relay": true } }, error: null };
    if (name === "titan_cordees_v1") out = { data: { cordees: state.cordees, titles: [] }, error: null };
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
const relayCalls = () => mockRpc.mock.calls.filter((c) => c[0] === "titan_cordee_relay_v1");

test("the vendored module is the website's, byte for byte, with the relay wording", () => {
  const web = readFileSync(join(__dirname, "../../js/core/cordee.js"), "utf8");
  const copy = readFileSync(join(__dirname, "../src/core/web/cordee.js"), "utf8");
  expect(copy).toBe(web);
  expect(Cordee.RELAY.route).toBe("aube");
  expect(Cordee.relayMessage({ message: "RELAY_OWN" })).toBe(Cordee.RELAY_MESSAGES.RELAY_OWN);
});

test("I open the passage with my confirmed session; afterwards I am never offered to receive my own relay", async () => {
  state.cordees = [{ ...CORDEE, relay: { step: "sentinelle", status: "waiting", active: true, can: "transmit", hint: "transmit", opener: null, receiver: null } }];
  state.relay = () => ({ data: { step: "sentinelle", status: "opened", active: true, can: null, hint: "own", changed: true, opener: { name: "Moi", me: true, family: "endurance" }, receiver: null }, error: null });
  panel();
  expect((await screen.findByTestId("cordee-relay-shared-k1", undefined, slow)).props.children).toBe("Passage fermé : personne ne l’a encore ouvert.");
  fireEvent.press(screen.getByTestId("cordee-relay-transmit-k1"));
  await waitFor(() => expect(relayCalls()).toEqual([["titan_cordee_relay_v1", { p_id: "k1", p_action: "transmit" }]]), slow);
  await waitFor(() => expect(screen.getByTestId("cordee-relay-shared-k1").props.children).toBe("Tu as ouvert le passage (Souffle)."), slow);
  expect(screen.getByTestId("cordee-relay-mine-k1").props.children).toMatch(/À un autre membre de jouer/);
  expect(screen.queryByTestId("cordee-relay-confirm-k1")).toBeNull();
  expect(screen.queryByTestId("cordee-relay-transmit-k1")).toBeNull();
  expect((await screen.findAllByText("Passage ouvert", undefined, slow)).length).toBeGreaterThanOrEqual(3); // state, step and toast
});

test("a friend opened the passage: a double tap confirms once; then the relay is passed from Léa to me", async () => {
  state.cordees = [{ ...CORDEE, relay: { step: "sentinelle", status: "opened", active: true, can: "confirm", hint: "confirm", opener: LEA, receiver: null } }];
  state.relay = () => new Promise((r) => setTimeout(() => r({ data: { step: "sentinelle", status: "confirmed", active: true, can: null, hint: "done", changed: true, opener: LEA, receiver: { name: "Moi", me: true, family: "endurance" } }, error: null }), 200));
  panel();
  expect((await screen.findByTestId("cordee-relay-shared-k1", undefined, slow)).props.children).toBe("Passage ouvert par Léa (Prisme). Le relais attend un autre membre.");
  const button = screen.getByTestId("cordee-relay-confirm-k1");
  fireEvent.press(button);
  fireEvent.press(button);
  await waitFor(() => expect(screen.getByTestId("cordee-relay-shared-k1").props.children).toMatch(/^Relais passé : Léa \(Prisme\) → toi \(Souffle\)/), slow);
  expect(relayCalls()).toHaveLength(1);
  expect(await screen.findByText("Relais reçu", undefined, slow)).toBeTruthy();
});

test("a refused session keeps the passage open and says why; a repeated validation unlocks nothing", async () => {
  state.cordees = [{ ...CORDEE, relay: { step: "sentinelle", status: "opened", active: true, can: "confirm", hint: "confirm", opener: LEA, receiver: null } }];
  state.relay = () => ({ data: null, error: { code: "22023", message: "RELAY_NO_SESSION" } });
  panel();
  fireEvent.press(await screen.findByTestId("cordee-relay-confirm-k1", undefined, slow));
  expect(await screen.findByText(Cordee.RELAY_MESSAGES.RELAY_NO_SESSION, undefined, slow)).toBeTruthy();
  expect(screen.getByTestId("cordee-relay-shared-k1").props.children).toMatch(/^Passage ouvert par Léa/);
  state.relay = () => ({ data: { step: "sentinelle", status: "confirmed", active: true, can: null, hint: "done", changed: false, opener: LEA, receiver: { name: "Moi", me: true, family: "endurance" } }, error: null });
  await waitFor(() => expect(screen.getByTestId("cordee-relay-confirm-k1").props.accessibilityState?.disabled).not.toBe(true), slow);
  fireEvent.press(screen.getByTestId("cordee-relay-confirm-k1"));
  expect(await screen.findByText("Déjà fait", undefined, slow)).toBeTruthy();
  expect(screen.getByText(/La cordée : 8 \/ 30/)).toBeTruthy();
});

test("a third member sees what is open and how to contribute; a nameless member has no family", async () => {
  state.cordees = [{ ...CORDEE, mine: false, relay: { step: "sentinelle", status: "confirmed", active: true, can: null, hint: "done", opener: LEA, receiver: { name: "Membre de la cordée", me: false, family: null } } }];
  panel();
  expect((await screen.findByTestId("cordee-relay-shared-k1", undefined, slow)).props.children).toBe("Relais passé : Léa (Prisme) → Membre de la cordée. La Sentinelle laisse passer la cordée.");
  expect(screen.getByTestId("cordee-relay-mine-k1").props.children).toMatch(/^À ton tour de faire avancer la cordée/);
  expect(screen.queryByTestId("cordee-relay-confirm-k1")).toBeNull();
  // Another route: no relay step at all.
});

test("an invitation link /defi?t=… opens Community on the challenges with its token; malformed tokens are dropped", () => {
  const token = "ab".repeat(32);
  const stateOf = (path: string) => linking.getStateFromPath!(path, linking.config as never);
  const leaf = (s: unknown) => {
    let route: { name: string; params?: Record<string, unknown> } | undefined;
    while (s && typeof s === "object" && "routes" in (s as object)) {
      const r = (s as { routes: { name: string; params?: Record<string, unknown>; state?: unknown }[] }).routes.at(-1)!;
      route = r; s = r.state;
    }
    return route;
  };
  for (const path of [`/defi?t=${token}`, `defi.html?t=${token}`, `/defi?utm=x&t=${token}#top`]) {
    const r = leaf(stateOf(path));
    expect(r?.name).toBe("Community");
    expect(r?.params).toEqual({ defi: token });
    expect(parseInvite(r?.params).challenge).toBe(token);
  }
  expect(parseInvite(leaf(stateOf("/defi?t=zz"))?.params).challenge).toBeNull();
  expect(leaf(stateOf("/social?ami=TN-AB12"))?.params).toEqual({ ami: "TN-AB12" });
  // The Android App Link claims /defi next to /social.
  const config = readFileSync(join(__dirname, "../app.config.ts"), "utf8");
  expect(config).toMatch(/pathPrefix: "\/social" \}, \{ scheme: "https", host: "titan-app\.fr", pathPrefix: "\/defi" \}/);
});

test("the native invitation card presents the cordée without a name and joins only on « S’encorder »", async () => {
  const token = "cd".repeat(32);
  state.preview = { valid: true, title: "Les crêtes de l’Aube", metric: "pitches", sport: null, target: 10, endsAt: "2026-12-08T10:00:00Z", kind: "cordee", route: "aube", pace: "reguliere", participants: 2 };
  const done = jest.fn();
  show(<ChallengeLinkCard owner="owner-a" token={token} online onDone={done} />);
  expect(await screen.findByText("Grande Cordée · invitation", undefined, slow)).toBeTruthy();
  expect(screen.getByText(/10 longueurs par membre \(allure régulière\)/)).toBeTruthy();
  expect(screen.getByText(/le relais de la Sentinelle se joue à deux/)).toBeTruthy();
  expect(mockRpc.mock.calls.map((c) => c[0])).not.toContain("titan_challenge_link_accept_v1");
  fireEvent.press(screen.getByTestId("challenge-link-join"));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_challenge_link_accept_v1", { p_token: token }), slow);
  await waitFor(() => expect(done).toHaveBeenCalled(), slow);
});

test("a spent link reads the same plain message", async () => {
  state.preview = { valid: false };
  show(<ChallengeLinkCard owner="owner-a" token={"ef".repeat(32)} online onDone={() => {}} />);
  expect(await screen.findByTestId("challenge-link-invalid", undefined, slow)).toBeTruthy();
  expect(screen.getByText(/Ce lien n’est plus valable/)).toBeTruthy();
});
