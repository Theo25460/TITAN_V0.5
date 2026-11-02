import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const session = (owner: string) => ({ user: { id: owner }, access_token: `token-${owner}` });
let mockAuthEvent: (event: string, next: unknown) => void;
let mockResolveOld: (p: unknown) => void;
const mockFetch = jest.fn((owner: string) => owner === "a" ? new Promise((r) => { mockResolveOld = r; }) : Promise.resolve({ id: owner }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: { user: { id: "a" }, access_token: "token-a" } } }),
  onAuthStateChange: (cb: typeof mockAuthEvent) => { mockAuthEvent = cb; return { data: { subscription: { unsubscribe: jest.fn() } } }; },
} } }));
jest.mock("../src/lib/googleAuth", () => ({ googleEnabled: () => false }));
jest.mock("../src/data/api", () => ({ fetchProfile: (owner: string) => mockFetch(owner), createProfile: jest.fn() }));
jest.mock("../src/data/queue", () => ({ loadQueue: jest.fn(async () => undefined) }));
jest.mock("../src/data/logsCache", () => ({ readLogsCache: jest.fn(async () => null) }));
jest.mock("../src/data/queryClient", () => ({ queryClient: { removeQueries: jest.fn(), getQueryData: jest.fn(), setQueryData: jest.fn() } }));
import { AuthProvider, useAuth } from "../src/data/auth";
function Probe() { const a = useAuth(); return <Text testID="identity">{a.owner ?? a.status}</Text>; }

test.each(["b", null])("a slow previous login cannot undo a later auth transition to %s", async (next) => {
  mockFetch.mockClear();
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("a"));
  act(() => mockAuthEvent(next ? "SIGNED_IN" : "SIGNED_OUT", next ? session(next) : null));
  await waitFor(() => expect(screen.getByTestId("identity").props.children).toBe(next ?? "signedOut"));
  await act(async () => { mockResolveOld({ id: "a" }); });
  expect(screen.getByTestId("identity").props.children).toBe(next ?? "signedOut");
});
