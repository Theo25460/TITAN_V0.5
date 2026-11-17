/* Social lot C on Android: La Grande Cordée. Behind screens.cordee; a card says the common goal, my part, the group and what is
   unlocked; forming sends the chosen route, pace, duration and friends; an invitation joins only on « S’encorder »; at the summit the
   title can be worn and the moment shared; the vendored rule is the website's. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const ACTIVE = {
  id: "k1", title: "Les crêtes de l’Aube", route: "aube", pace: "reguliere", startsAt: "2026-11-10T10:00:00Z", endsAt: "2099-11-24T10:00:00Z", days: 14,
  status: "active", summitedAt: null, mine: true, myStatus: "joined", share: 10, cap: 15, target: 30, longueurs: 25, variety: 4, total: 29, percent: 96, camps: 3,
  families: ["endurance", "mobilite", "force"], joined: 3, title_key: "cordee:aube", earned: false,
  me: { pitches: 4, counted: 4, days: 4, families: ["mobilite"], strand: false },
  members: [
    { id: "owner-a", name: "Moi", status: "joined", me: true, pitches: 4, strand: false, families: ["mobilite"] },
    { id: "u-max", name: "Max", status: "joined", me: false, pitches: 15, strand: true, families: ["endurance"] },
    { id: null, name: "Membre de la cordée", status: "joined", me: false, pitches: 6, strand: false, families: ["force"] },
  ],
};
let state: { flag: boolean; cordees: unknown[] } = { flag: true, cordees: [ACTIVE] };
beforeEach(() => {
  jest.clearAllMocks();
  resetDialogs();
  state = { flag: true, cordees: [ACTIVE] };
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    let data: unknown = true;
    if (name === "titan_feature_flags_v1") data = { flags: { "screens.cordee": state.flag } };
    if (name === "titan_cordees_v1") data = { cordees: state.cordees, titles: [] };
    if (name === "titan_cordee_create_v1") data = { id: "k9", invited: (args.p_invitees as string[]).length };
    const result = Promise.resolve({ data, error: null });
    return { setHeader: () => result, then: (yes: (v: unknown) => unknown) => result.then(yes) };
  });
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
        <ToastProvider><CordeePanel owner="owner-a" online friends={[{ id: "u-max", name: "Max" }, { id: "u-zoe", name: "Zoé" }]} /><DialogHost /></ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

test("the vendored rule is the website's: shares, cap and the four routes", () => {
  expect(Cordee.share("reguliere", 14)).toBe(10);
  expect(Cordee.cap(10)).toBe(15);
  expect(Object.keys(Cordee.ROUTES)).toEqual(["aube", "marees", "forge", "aurores"]);
});

test("nothing while the flag is closed", async () => {
  state.flag = false;
  show();
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_feature_flags_v1", {}), slow);
  expect(screen.queryByTestId("cordee-panel")).toBeNull();
  expect(mockRpc).not.toHaveBeenCalledWith("titan_cordees_v1", {});
});

test("a running cordée says the common goal, my part, the group and what is unlocked", async () => {
  show();
  expect(await screen.findByText("Objectif commun : 30 longueurs ensemble, soit 10 par membre encordé.", undefined, slow)).toBeTruthy();
  expect(screen.getByTestId("cordee-mine-k1").props.children).toMatch(/Ta part : 4 longueurs sur 10/);
  expect(screen.getByText(/La cordée : 29 \/ 30 \(dont 4 grâce à la variété des sports\)/)).toBeTruthy();
  expect(screen.getByText(/Débloqué : Le gué des premiers pas · La terrasse des bergers · Le col des Sentinelles/)).toBeTruthy();
  expect(screen.getByText(/Membre de la cordée · Acier/)).toBeTruthy();
});

test("forming a cordée sends the route, the pace, the duration and the friends ticked", async () => {
  state.cordees = [];
  show();
  fireEvent.press(await screen.findByTestId("cordee-new", undefined, slow));
  fireEvent.press(screen.getByTestId("cordee-route-forge"));
  fireEvent.press(screen.getByTestId("cordee-pace-douce"));
  fireEvent.press(screen.getByTestId("cordee-days-21"));
  expect(screen.getByTestId("cordee-preview").props.children.join("")).toMatch(/ajoute 9 longueurs .* jusqu’à 14/);
  fireEvent.press(screen.getByTestId("cordee-invite-u-zoe"));
  fireEvent.press(screen.getByTestId("cordee-submit"));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_cordee_create_v1", { p_route: "forge", p_pace: "douce", p_days: 21, p_invitees: ["u-zoe"] }), slow);
});

test("an invitation joins only on « S’encorder »; a summit offers the title and the moment", async () => {
  state.cordees = [{ ...ACTIVE, id: "k2", mine: false, myStatus: "invited", me: null }, { ...ACTIVE, id: "k3", status: "summited", total: 30, percent: 100, camps: 4, earned: true }];
  show();
  fireEvent.press(await screen.findByTestId("cordee-join-k2", undefined, slow));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_challenge_respond", { p_id: "k2", p_action: "join" }), slow);
  fireEvent.press(await screen.findByTestId("cordee-wear-k3", undefined, slow));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_set_displayed_title", { p_key: "cordee:aube" }), slow);
  fireEvent.press(await screen.findByTestId("cordee-share-k3", undefined, slow));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_moment_share", expect.objectContaining({ p_kind: "challenge", p_title: "Sommet : Les crêtes de l’Aube", p_visibility: "friends" })), slow);
});
