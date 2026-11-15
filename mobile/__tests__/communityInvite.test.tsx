/* Invitations a non-user can follow (AUD-05, AUD-06, AUD-11, AUD-12): shared codes carry an https link, an unfindable profile is
   offered the switch before a dead code is sent, the guild code is visible with an invite button, and an opened link fills the field. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Share } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";
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

function show(params?: { ami?: string; guilde?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    setHeader: () => Promise.resolve({ data: name === "titan_get_my_guild" ? { id: "g", code: "G-K7P2Q", name: "Les Aubes" } : name === "titan_feature_flags_v1" ? { flags: {} } : null, error: null }),
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
  expect(parseInvite({ ami: "TN-AB12", guilde: "nope" })).toEqual({ friend: "TN-AB12", guild: null });
  expect(parseInvite(undefined)).toEqual({ friend: null, guild: null });
});

test("a findable profile shares its code with a link at once", async () => {
  show();
  fireEvent.press(await screen.findByTestId("share-friend-code"));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: friendInviteMessage("TN-ABCD") }));
  expect(mockSave).not.toHaveBeenCalled();
});

test("an unfindable profile is offered the switch first; cancelling sends nothing, accepting saves then shares", async () => {
  mockSocial.mockReturnValue({ ...social, me: { ...social.me, findable: false } });
  show();
  fireEvent.press(await screen.findByTestId("share-friend-code"));
  expect(await screen.findByText("Rendre ton profil trouvable ?")).toBeTruthy();
  fireEvent.press(screen.getByText("Annuler"));
  await waitFor(() => expect(screen.queryByText("Rendre ton profil trouvable ?")).toBeNull());
  expect(share).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();

  fireEvent.press(screen.getByTestId("share-friend-code"));
  fireEvent.press(await screen.findByText("Rendre trouvable et partager"));
  await waitFor(() => expect(share).toHaveBeenCalled());
  expect(mockSave).toHaveBeenCalledWith({ prefs: {}, privacy: { publicProfile: true, showStats: true, socialPresence: false, friendRankings: false } });
});

test("a guild member sees the join code and can invite with a link", async () => {
  show({ guilde: "G-K7P2Q" });
  expect(await screen.findByText("Code de guilde : G-K7P2Q")).toBeTruthy();
  fireEvent.press(screen.getByText("Inviter dans la guilde"));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: guildInviteMessage("Les Aubes", "G-K7P2Q") }));
});

test("an opened friend link fills the code field; a malformed one is ignored", async () => {
  show({ ami: "tn-zz99" });
  expect(await screen.findByDisplayValue("TN-ZZ99")).toBeTruthy();
});

test("an opened guild link fills the join field for someone without a guild", async () => {
  mockSocial.mockReturnValue({ ...social, guild: null });
  show({ guilde: "G-K7P2Q" });
  expect(await screen.findByDisplayValue("G-K7P2Q")).toBeTruthy();
});
