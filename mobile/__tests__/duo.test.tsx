import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost } from "../src/components/Dialog";
import { ToastProvider } from "../src/components/Toast";
import { shouldPersist } from "../src/data/queryClient";
import { CommunityScreen } from "../src/screens/community/CommunityScreen";

const mockSession = jest.fn();
const mockRpc = jest.fn();
const mockOnline = jest.fn(() => true);
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: () => mockSession() }, rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/network", () => ({ useOnline: () => mockOnline(), isOnline: () => mockOnline() }));
jest.mock("../src/data/hooks", () => {
  const { social } = jest.requireActual("../test-fixtures/data");
  return { keys: { social: (owner: string) => ["social", owner] }, useSocial: () => ({ data: social, refetch: jest.fn() }) };
});

const partner = { id: "friend-1", name: "Alex Duo" };
const pending = { status: "pending", id: "duo-1", role: "invitee", partner };
const active = { status: "active", id: "duo-1", role: "invitee", partner, daysLeft: 14, target: 12, myDays: 0, partnerDays: 1, together: 1, nudgedToday: false, nudgesReceived: 0 };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const fixture = { enabled: true, data: {} as object, missing: false };
const mockBearer = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline.mockReturnValue(true);
  mockSession.mockResolvedValue({ data: { session: { user: { id: "owner-a" }, access_token: "token-a" } } });
  Object.assign(fixture, { enabled: true, data: { status: "none", friends: [partner] }, missing: false });
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => ({
    setHeader: (key: string, value: string) => {
      mockBearer(name, key, value);
      if (name === "titan_feature_flags_v1") return Promise.resolve({ data: { flags: { "screens.buddy": fixture.enabled } }, error: null });
      if (name === "titan_buddy_v1" && fixture.missing) return Promise.resolve({ data: null, error: { code: "PGRST202" } });
      if (name === "titan_buddy_invite_v1") fixture.data = { ...pending, role: "inviter" };
      if (name === "titan_buddy_respond_v1") fixture.data = args.p_accept ? active : { status: "none", friends: [partner] };
      if (name === "titan_buddy_nudge_v1") fixture.data = { ...active, nudgedToday: true };
      if (name === "titan_buddy_end_v1") fixture.data = { status: "none", friends: [partner] };
      return Promise.resolve({ data: name === "titan_buddy_v1" ? fixture.data : true, error: null });
    },
  }));
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastProvider><CommunityScreen /><DialogHost /></ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { client, rerender: () => view.rerender(tree()) };
}

test("invite an eligible friend only after confirmation and cancel the pending invitation", async () => {
  show();
  await screen.findByText("TITAN Duo");
  fireEvent.press(screen.getByRole("button", { name: "Choisir un ami" }));
  fireEvent.press(screen.getByRole("radio", { name: partner.name }));
  expect(mockRpc).not.toHaveBeenCalledWith("titan_buddy_invite_v1", expect.anything());
  fireEvent.press(screen.getByRole("button", { name: "Envoyer l’invitation" }));
  await screen.findByText(/Invitation envoyée à Alex Duo/);
  expect(mockRpc).toHaveBeenCalledWith("titan_buddy_invite_v1", { p_friend: partner.id });
  expect(mockBearer).toHaveBeenCalledWith("titan_buddy_invite_v1", "Authorization", "Bearer token-a");
  fireEvent.press(screen.getByRole("button", { name: "Annuler l’invitation" }));
  await screen.findByRole("button", { name: "Choisir un ami" });
});

test("accept an invitation and render only confirmed active days, then stop after confirmation", async () => {
  fixture.data = { ...pending };
  show();
  expect(await screen.findByText(/14 jours/)).toBeTruthy();
  expect(screen.queryByRole("progressbar", { name: "Jours actifs à deux" })).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Accepter l’expédition" }));
  await screen.findByText(/1 \/ 12 jours actifs/);
  expect(mockRpc).toHaveBeenCalledWith("titan_buddy_respond_v1", { p_id: "duo-1", p_accept: true });
  expect(screen.getByText(/Seul le total de jours actifs est partagé/)).toBeTruthy();
  expect(screen.getByText(/Aucun XP ni crédit/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Encourager Alex Duo" }));
  expect(await screen.findByRole("button", { name: "Encouragement envoyé", disabled: true })).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Arrêter l’expédition" }));
  expect(mockRpc).not.toHaveBeenCalledWith("titan_buddy_end_v1", expect.anything());
  fireEvent.press(await screen.findByRole("button", { name: "Arrêter" }));
  await screen.findByRole("button", { name: "Choisir un ami" });
  expect(mockRpc).toHaveBeenCalledWith("titan_buddy_end_v1", { p_id: "duo-1" });
});

test("hide private progress offline and exclude the Duo query from persistent storage", async () => {
  fixture.data = active;
  const { client, rerender } = show();
  await screen.findByText(/Expédition avec Alex Duo/);
  const entry = client.getQueryCache().getAll().find((q) => q.queryKey[0] === "duo");
  expect(entry?.queryKey).toEqual(["duo", "owner-a"]);
  expect(shouldPersist(entry!.queryKey)).toBe(false);
  mockOnline.mockReturnValue(false);
  rerender();
  await screen.findByText(/Reconnecte-toi pour retrouver ton expédition/);
  expect(screen.queryByText(/Alex Duo/)).toBeNull();
});

test.each(["disabled", "missing", "mismatched owner"])("hide Duo when it is %s", async (state) => {
  if (state === "disabled") fixture.enabled = false;
  if (state === "missing") fixture.missing = true;
  if (state === "mismatched owner") mockSession.mockResolvedValue({ data: { session: { user: { id: "owner-b" }, access_token: "token-b" } } });
  const { client } = show();
  await waitFor(() => expect(client.getQueryState(["duo", "owner-a"])?.fetchStatus).toBe("idle"));
  expect(screen.queryByText("TITAN Duo")).toBeNull();
  if (state !== "missing") expect(mockRpc).not.toHaveBeenCalledWith("titan_buddy_v1", expect.anything());
});
