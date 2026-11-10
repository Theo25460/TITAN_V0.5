import { act, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

const session = (owner: string) => ({ user: { id: owner }, access_token: `token-${owner}` });
let mockAuthEvent: (event: string, next: unknown) => void;
const mockSignOut = jest.fn(async () => ({ error: null }));
let mockOnline = true;
let mockResolveOld: (p: unknown) => void;
const mockFetch = jest.fn((owner: string) => owner === "a" ? new Promise((r) => { mockResolveOld = r; }) : Promise.resolve({ id: owner }));
const mockLoadQueue = jest.fn(async (_owner: string | null) => undefined);
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: {
  signOut: () => mockSignOut(),
  onAuthStateChange: (cb: typeof mockAuthEvent) => {
    mockAuthEvent = cb;
    cb("INITIAL_SESSION", session("a"));
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  },
} } }));
jest.mock("../src/lib/googleAuth", () => ({ googleEnabled: () => false, createReturnWatch: () => ({ start: jest.fn(), foreground: jest.fn(), received: jest.fn(), pending: () => false }), watchAppState: () => () => {}, GOOGLE_NO_RETURN: "x", parseCallback: () => null }));
jest.mock("../src/lib/network", () => ({ isOnline: () => mockOnline }));
jest.mock("../src/data/api", () => ({ fetchProfile: (owner: string) => mockFetch(owner), createProfile: jest.fn() }));
jest.mock("../src/data/queue", () => ({ loadQueue: (owner: string | null) => mockLoadQueue(owner) }));
jest.mock("../src/data/logsCache", () => ({ readLogsCache: jest.fn(async () => null) }));
jest.mock("../src/data/queryClient", () => ({ queryClient: { removeQueries: jest.fn(), getQueryData: jest.fn(), setQueryData: jest.fn(), clear: jest.fn() } }));
import { AuthProvider, useAuth } from "../src/data/auth";
let signOutFromProbe: ReturnType<typeof useAuth>["signOut"];
function Probe() { const a = useAuth(); signOutFromProbe = a.signOut; return <><Text testID="identity">{a.owner ?? a.status}</Text><Text testID="token">{a.session?.access_token}</Text><Text testID="notice">{a.notice}</Text></>; }

async function emitAuth(event: string, next: unknown) {
  await act(async () => {
    mockAuthEvent(event, next);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("an offline relaunch opens the locally prepared account without waiting for a profile request", async () => {
  mockOnline = false;
  mockFetch.mockClear();
  try {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("identity").props.children).toBe("a"));
    expect(mockFetch).not.toHaveBeenCalled();
  } finally { mockOnline = true; }
});

test("a token refresh keeps the account closed until its profile is checked", async () => {
  mockFetch.mockClear();
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("a"));
  await emitAuth("TOKEN_REFRESHED", { ...session("a"), access_token: "refreshed-a" });
  expect(screen.getByTestId("identity").props.children).toBe("loading");
  await act(async () => { mockResolveOld({ id: "a" }); });
  expect(screen.getByTestId("identity").props.children).toBe("a");
  expect(screen.getByTestId("token").props.children).toBe("refreshed-a");
});

test("switching accounts closes the previous account while the new one is checked", async () => {
  mockFetch.mockClear();
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("a"));
  await act(async () => { mockResolveOld({ id: "a" }); });
  expect(screen.getByTestId("identity").props.children).toBe("a");
  let resolveNew!: (profile: unknown) => void;
  mockFetch.mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
  await emitAuth("SIGNED_IN", session("b"));
  expect(screen.getByTestId("identity").props.children).toBe("loading");
  await act(async () => { resolveNew({ id: "b" }); });
  expect(screen.getByTestId("identity").props.children).toBe("b");
});

test("late account deletion cleanup only forgets the deleted account", async () => {
  mockFetch.mockClear();
  mockSignOut.mockClear();
  await AsyncStorage.setItem("titan.queue.v1:a", "a-private-queue");
  await AsyncStorage.setItem("titan.queue.v1:b", "b-private-queue");
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("a"));
  await act(async () => { mockResolveOld({ id: "a" }); });
  const cleanupDeletedAccount = signOutFromProbe;
  await emitAuth("SIGNED_IN", session("b"));
  expect(screen.getByTestId("identity").props.children).toBe("b");
  await act(async () => { await cleanupDeletedAccount({ forget: true }); });
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem("titan.queue.v1:a")).toBeNull();
  expect(await AsyncStorage.getItem("titan.queue.v1:b")).toBe("b-private-queue");
});

test.each(["b", null])("a slow previous login cannot undo a later auth transition to %s", async (next) => {
  mockFetch.mockClear();
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("a"));
  act(() => mockAuthEvent(next ? "SIGNED_IN" : "SIGNED_OUT", next ? session(next) : null));
  await waitFor(() => expect(screen.getByTestId("identity").props.children).toBe(next ?? "signedOut"));
  await act(async () => { mockResolveOld({ id: "a" }); });
  expect(screen.getByTestId("identity").props.children).toBe(next ?? "signedOut");
});

test("a local queue read failure is explained without discarding the authenticated session", async () => {
  mockFetch.mockClear();
  mockLoadQueue.mockRejectedValueOnce(new Error("disk-unavailable"));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId("notice").props.children).toMatch(/stockage local/i));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("a"));
  await act(async () => { mockResolveOld({ id: "a" }); });
  await waitFor(() => expect(screen.getByTestId("identity").props.children).toBe("a"));
});
