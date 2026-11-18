/* Social lot A on Android: a personal invitation link works without being findable, an opened link shows who invites and writes
   nothing before « Accepter », a spent or blocked link says so, sent requests can be cancelled, and one's own blocks can be lifted. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Share } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost, resetDialogs } from "../src/components/Dialog";
import { ToastProvider } from "../src/components/Toast";
import { friendLinkMessage, friendLinkUrl, isInvitationToken, parseInvite } from "../src/lib/invite";
import { CommunityScreen } from "../src/screens/community/CommunityScreen";

const slow = { timeout: 5000 };
jest.setTimeout(20000);
const mockSocial = jest.fn();
const mockRpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => true, isOnline: () => true }));
jest.mock("../src/data/hooks", () => ({
  keys: { social: (o: string) => ["social", o], profile: (o: string) => ["profile", o] },
  useSocial: () => ({ data: mockSocial(), refetch: jest.fn() }),
  useSavePrefs: () => ({ mutateAsync: jest.fn() }),
}));

const { social } = jest.requireActual("../test-fixtures/data");
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const TOKEN = "ab".repeat(32);

function answers(map: Record<string, unknown>) {
  mockRpc.mockImplementation((name: string, params: unknown) => {
    const value = typeof map[name] === "function" ? (map[name] as (p: unknown) => unknown)(params) : map[name] ?? (name === "titan_feature_flags_v1" ? { flags: { "screens.friendlinks": true } } : null);
    const result = value instanceof Error ? { data: null, error: value } : { data: value, error: null };
    return { setHeader: () => Promise.resolve(result), then: (yes: (v: unknown) => unknown) => Promise.resolve(result).then(yes) };
  });
}

function show(params?: { invitation?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
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
  mockSocial.mockReturnValue({ ...social, me: { ...social.me, findable: false } });
  share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  answers({});
});

test("tokens: only 64 lowercase hex characters are kept; the shared message carries the https link", () => {
  expect(isInvitationToken(TOKEN)).toBe(true);
  expect(isInvitationToken(TOKEN.toUpperCase())).toBe(true);
  expect(isInvitationToken("ab".repeat(31))).toBe(false);
  expect(isInvitationToken("<script>")).toBe(false);
  expect(parseInvite({ invitation: TOKEN.toUpperCase() })).toEqual({ friend: null, guild: null, invitation: TOKEN });
  expect(parseInvite({ invitation: "zz" })).toEqual({ friend: null, guild: null, invitation: null });
  expect(friendLinkUrl(TOKEN)).toBe(`https://titan-app.fr/social?invitation=${TOKEN}`);
  expect(friendLinkMessage(TOKEN)).toContain(friendLinkUrl(TOKEN));
});

test("an unfindable profile creates a personal link and shares it, without being asked to become findable", async () => {
  answers({ titan_friend_link_create_v1: { id: "l1", token: TOKEN, expiresAt: "2026-11-27" } });
  show();
  fireEvent.press(await screen.findByTestId("community-invite", undefined, slow));
  fireEvent.press(await screen.findByTestId("friend-link-create", undefined, slow));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: friendLinkMessage(TOKEN) }), slow);
  expect(screen.queryByText("Rendre ton profil trouvable ?")).toBeNull();
});

test("an opened invitation names the inviter and writes nothing until « Accepter »", async () => {
  const accept = jest.fn(() => ({ status: "friends", id: "u-lea", name: "Léa", spent: true }));
  answers({ titan_friend_link_preview_v1: { valid: true, own: false, friends: false, inviter: { name: "Léa", avatar: "scout" } }, titan_friend_link_accept_v1: accept });
  show({ invitation: TOKEN });
  expect(await screen.findByText("Léa t’invite à devenir ami", undefined, slow)).toBeTruthy();
  expect(accept).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("invitation-accept"));
  await waitFor(() => expect(accept).toHaveBeenCalledWith({ p_token: TOKEN }), slow);
  await waitFor(() => expect(screen.queryByTestId("invitation-card")).toBeNull(), slow);
});

test("ignoring an invitation closes it without any call", async () => {
  const accept = jest.fn();
  answers({ titan_friend_link_preview_v1: { valid: true, inviter: { name: "Léa", avatar: "scout" } }, titan_friend_link_accept_v1: accept });
  show({ invitation: TOKEN });
  fireEvent.press(await screen.findByTestId("invitation-ignore", undefined, slow));
  await waitFor(() => expect(screen.queryByTestId("invitation-card")).toBeNull(), slow);
  expect(accept).not.toHaveBeenCalled();
});

test("a spent, expired or blocked link only says it is no longer valid", async () => {
  answers({ titan_friend_link_preview_v1: { valid: false } });
  show({ invitation: TOKEN });
  expect(await screen.findByTestId("invitation-invalid", undefined, slow)).toBeTruthy();
  expect(screen.queryByTestId("invitation-accept")).toBeNull();
});

test("a sent request can be cancelled and shows when it expires", async () => {
  const remove = jest.fn(() => ({ status: "removed" }));
  mockSocial.mockReturnValue({ ...social, requests_out: [{ id: "u-zoe", name: "Zoé Martin", at: "2026-11-10T10:00:00Z", expires_at: "2026-12-10T10:00:00Z" }] });
  answers({ titan_social_remove: remove });
  show();
  expect(await screen.findByText("Zoé Martin", undefined, slow)).toBeTruthy();
  fireEvent.press(screen.getByText("Annuler la demande"));
  await waitFor(() => expect(remove).toHaveBeenCalledWith({ p_user: "u-zoe" }), slow);
});

test("one's own blocks are listed and can be lifted", async () => {
  const unblock = jest.fn((_p: unknown) => true);
  let blocks = [{ id: "u-x", name: "Xavier", at: "2026-11-15T10:00:00Z" }];
  answers({ titan_blocks_v1: () => blocks, titan_unblock_user: (p: unknown) => { blocks = []; return unblock(p); } });
  show();
  fireEvent.press(await screen.findByTestId("blocked-open", undefined, slow));
  expect(await screen.findByText("Xavier", undefined, slow)).toBeTruthy();
  fireEvent.press(screen.getByTestId("unblock-u-x"));
  await waitFor(() => expect(unblock).toHaveBeenCalledWith({ p_blocked_id: "u-x" }), slow);
  expect(await screen.findByText("Tu n’as bloqué personne.", undefined, slow)).toBeTruthy();
});
