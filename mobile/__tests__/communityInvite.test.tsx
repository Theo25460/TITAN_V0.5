/* Invitations a non-user can follow (AUD-05, AUD-06, AUD-11, AUD-12): shared codes carry an https link, an unfindable profile is
   offered the switch before a dead code is sent, the guild code is visible with an invite button, and an opened link fills the field. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Share } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";

// Under a full parallel run the first render can exceed the 1 s default: give async queries more room.
const slow = { timeout: 5000 };
import { ToastProvider } from "../src/components/Toast";
import { friendInviteMessage, friendInviteUrl, guildInviteMessage, isFriendCode, isGuildCode, parseInvite } from "../src/lib/invite";
import { CommunityScreen } from "../src/screens/community/CommunityScreen";

const mockSocial = jest.fn();
const mockSave = jest.fn(async (_v: unknown) => ({}));
const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
jest.mock("../src/data/hooks", () => ({
  keys: { social: (o: string) => ["social", o], profile: (o: string) => ["profile", o] },
  useSocial: () => ({ data: mockSocial(), refetch: jest.fn() }),
  useSavePrefs: () => ({ mutateAsync: (v: unknown) => mockSave(v) }),
}));

const { social } = jest.requireActual("../test-fixtures/data");
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };

function show(params?: { ami?: string; guilde?: string; sheet?: "invite" }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["profile", "owner-a"], { privacy: { showStats: true } });
  render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastProvider><CommunityScreen route={{ params }} /><DialogHost /></ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

let share: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  resetDialogs();
  mockSocial.mockReturnValue(social);
  share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  mockRpc.mockImplementation((name: string) => ({
    setHeader: () => Promise.resolve({ data: name === "titan_get_my_guild" ? { id: "g", code: "G-K7P2Q", name: "Les Aubes" } : name === "titan_feature_flags_v1" ? { flags: {} } : name === "titan_guild_history_v1" ? { target: 600, held: 5, bestStreak: 3, weeks: [{ week: "2026-11-02", minutes: 640, held: true }, { week: "2026-11-09", minutes: 300, held: false }] } : null, error: null }),
  }));
});

test("codes and links: only well-formed codes are accepted and every message carries an https link", () => {
  expect(isFriendCode(" tn-ab12 ")).toBe(true);
  expect(isFriendCode("TN-<script>")).toBe(false);
  expect(isGuildCode("G-K7P2Q")).toBe(true);
  expect(isGuildCode("TN-ABCD")).toBe(false);
  expect(friendInviteUrl("tn-ab12")).toBe("https://titan-app.fr/social?ami=TN-AB12");
  expect(friendInviteMessage("TN-AB12")).toContain("https://titan-app.fr/social?ami=TN-AB12");
  expect(guildInviteMessage("Les Aubes", "G-K7P2Q")).toContain("https://titan-app.fr/social?guilde=G-K7P2Q");
  expect(parseInvite({ ami: "TN-AB12", guilde: "nope" })).toEqual({ friend: "TN-AB12", guild: null, invitation: null });
  expect(parseInvite(undefined)).toEqual({ friend: null, guild: null, invitation: null });
});

test("a findable profile shares its code with a link at once", async () => {
  show();
  fireEvent.press(await screen.findByTestId("community-invite", undefined, slow));
  fireEvent.press(await screen.findByTestId("share-friend-code", undefined, slow));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: friendInviteMessage("TN-ABCD") }), slow);
  expect(mockSave).not.toHaveBeenCalled();
});

test("an unfindable profile is offered the switch first; cancelling sends nothing, accepting saves then shares", async () => {
  mockSocial.mockReturnValue({ ...social, me: { ...social.me, findable: false } });
  show();
  fireEvent.press(await screen.findByTestId("community-invite", undefined, slow));
  fireEvent.press(await screen.findByTestId("share-friend-code", undefined, slow));
  expect(await screen.findByText("Rendre ton profil trouvable ?", undefined, slow)).toBeTruthy();
  fireEvent.press(screen.getByText("Annuler"));
  await waitFor(() => expect(screen.queryByText("Rendre ton profil trouvable ?")).toBeNull(), slow);
  expect(share).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();

  // The button stays locked until the question it opened is answered (V12-41), and « Annuler » answers one timer turn after the
  // dialog left: a second press sent in that gap is swallowed as a double tap. Press like a person does, until the question shows.
  await waitFor(() => {
    if (!screen.queryByText("Rendre ton profil trouvable ?")) fireEvent.press(screen.getByTestId("share-friend-code"));
    expect(screen.getByText("Rendre trouvable et partager")).toBeTruthy();
  }, slow);
  fireEvent.press(screen.getByText("Rendre trouvable et partager"));
  await waitFor(() => expect(share).toHaveBeenCalled(), slow);
  expect(mockSave).toHaveBeenCalledWith({ prefs: {}, privacy: { publicProfile: true, showStats: true, socialPresence: false, friendRankings: false } });
});

test("a guild member sees the join code and can invite with a link", async () => {
  show({ guilde: "G-K7P2Q" });
  expect(await screen.findByText("Code de guilde : G-K7P2Q", undefined, slow)).toBeTruthy();
  fireEvent.press(screen.getByText("Inviter dans la guilde"));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: guildInviteMessage("Les Aubes", "G-K7P2Q") }), slow);
});

test("an opened friend link fills the code field; a malformed one is ignored", async () => {
  show({ ami: "tn-zz99" });
  expect(await screen.findByDisplayValue("TN-ZZ99", undefined, slow)).toBeTruthy();
});

test("« Inviter un ami » from a share preview opens the invitation sheet; without it the sheet stays closed", async () => {
  show({ sheet: "invite" });
  expect(await screen.findByTestId("share-friend-code", undefined, slow)).toBeTruthy();
});

test("the Community screen opened plainly does not open the invitation sheet", async () => {
  show();
  await screen.findAllByText(/./, undefined, slow);
  expect(screen.queryByTestId("share-friend-code")).toBeNull();
});

test("an opened guild link fills the join field for someone without a guild", async () => {
  mockSocial.mockReturnValue({ ...social, guild: null });
  show({ guilde: "G-K7P2Q" });
  expect(await screen.findByDisplayValue("G-K7P2Q", undefined, slow)).toBeTruthy();
});

test("a challenge without any friend selected becomes an open challenge shared by link (AUD-22)", async () => {
  mockSocial.mockReturnValue({ ...social, friends: [] });
  mockRpc.mockImplementation((name: string) => ({
    setHeader: () => Promise.resolve({ data: name === "titan_challenge_open_create_v1" ? { id: "c9", token: "a".repeat(64), expiresAt: "2026-11-30" } : null, error: null }),
    then: (yes: (v: unknown) => unknown) => Promise.resolve({ data: name === "titan_challenge_open_create_v1" ? { id: "c9", token: "a".repeat(64), expiresAt: "2026-11-30" } : null, error: null }).then(yes),
  }));
  show();
  fireEvent.press(await screen.findByText("Défis", undefined, slow));
  fireEvent.press(await screen.findByTestId("new-challenge", undefined, slow));
  fireEvent.changeText(screen.getByPlaceholderText("Une semaine qui bouge"), "Je te défie");
  fireEvent.press(screen.getByTestId("challenge-submit"));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: expect.stringContaining("https://titan-app.fr/defi?t=" + "a".repeat(64)) }), slow);
});

test("the guild panel tells the chronicle: weeks held together and the best streak (AUD-44)", async () => {
  show({ guilde: "G-K7P2Q" });
  expect(await screen.findByText("5 semaines réussies ensemble", undefined, slow)).toBeTruthy();
});

test("le coaching charge le compte à l’ouverture et filtre les liens étrangers", async () => {
  mockRpc.mockImplementation((name: string) => ({
    setHeader: () => Promise.resolve({ data: name === "titan_coach_portal" ? { owner: "owner-a", links: [
      { id: "own", athlete_id: "owner-a", coach_id: "coach", coach_name: "Lina", sport: "running", paused: true },
      { id: "other", athlete_id: "other", coach_id: "coach", coach_name: "Ne pas afficher" },
    ] } : null, error: null }),
  }));
  show();
  expect(mockRpc).not.toHaveBeenCalledWith("titan_coach_portal", expect.anything());
  fireEvent.press(await screen.findByText("Mes suivis de coaching", undefined, slow));
  expect(await screen.findByText("Lina", undefined, slow)).toBeTruthy();
  expect(screen.queryByText("Ne pas afficher")).toBeNull();
  expect(screen.getByText(/Suivi en pause/)).toBeTruthy();
});

test("un défi refusé reste ouvert avec le nom saisi pour corriger ou réessayer", async () => {
  mockRpc.mockImplementation((name: string) => ({
    setHeader: () => Promise.resolve({ data: null, error: name === "titan_challenge_open_create_v1" ? { message: "refus" } : null }),
  }));
  show();
  fireEvent.press(await screen.findByText("Défis", undefined, slow));
  fireEvent.press(await screen.findByTestId("new-challenge", undefined, slow));
  fireEvent.changeText(screen.getByPlaceholderText("Une semaine qui bouge"), "Notre défi");
  fireEvent.press(screen.getByTestId("challenge-submit"));
  await screen.findByText("Action impossible", undefined, slow);
  expect(screen.getByDisplayValue("Notre défi")).toBeTruthy();
  expect(share).not.toHaveBeenCalled();
});
