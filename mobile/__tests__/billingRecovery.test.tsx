/* The background recovery runs at sign-in, on foreground and on reconnection, only in billing builds, and refreshes the profile when access arrived. */
import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";

let mockOwner: string | null = "owner-a";
let mockOnline = true;
const mockInvalidate = jest.fn(async () => undefined);
let mockProfile: { is_elite: boolean } | undefined = { is_elite: false };
let mockReconnect: (() => void) | null = null;
jest.mock("../src/data/auth", () => ({ useAuth: () => ({ owner: mockOwner }) }));
jest.mock("../src/data/hooks", () => ({ keys: { profile: (o: string) => ["profile", o] } }));
jest.mock("../src/lib/network", () => ({ isOnline: () => mockOnline, onReconnect: (cb: () => void) => { mockReconnect = cb; return () => { mockReconnect = null; }; } }));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "owner-a" } } } }) } } }));
jest.mock("@tanstack/react-query", () => ({ ...jest.requireActual("@tanstack/react-query"), useQueryClient: () => ({ invalidateQueries: mockInvalidate, getQueryData: () => mockProfile }) }));

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const { BillingRecovery, RECOVERY_MIN_INTERVAL_MS } = require("../src/data/BillingRecovery");

let appStateListener: ((s: string) => void) | null = null;
beforeEach(() => {
  mockOwner = "owner-a";
  mockOnline = true;
  mockProfile = { is_elite: false };
  mockInvalidate.mockClear();
  appStateListener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: (s: string) => void) => { appStateListener = l; return { remove: () => { appStateListener = null; } }; }) as never);
});
afterEach(() => jest.restoreAllMocks());
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

test("at sign-in it checks Play for this account with the profile's access, and refreshes the profile when a purchase was recovered", async () => {
  const recover = jest.fn(async (_owner: string, getAccessToken: () => Promise<string | null>) => ((await getAccessToken()) ? 1 : 0));
  render(<BillingRecovery enabled recover={recover} />);
  await flush();
  expect(recover).toHaveBeenCalledTimes(1);
  expect(recover.mock.calls[0][0]).toBe("owner-a");
  expect((recover.mock.calls[0] as unknown[])[2]).toEqual({ hasAccess: false });
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["profile", "owner-a"] });
});

test("nothing recovered means no profile refresh; an unknown profile is passed as unknown", async () => {
  mockProfile = undefined;
  const recover = jest.fn(async () => 0);
  render(<BillingRecovery enabled recover={recover} />);
  await flush();
  expect((recover.mock.calls[0] as unknown[])[2]).toEqual({ hasAccess: null });
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test("a build without Play Billing, a signed-out app and an offline phone never call Play", async () => {
  const recover = jest.fn(async () => 0);
  render(<BillingRecovery enabled={false} recover={recover} />);
  mockOwner = null;
  render(<BillingRecovery enabled recover={recover} />);
  mockOwner = "owner-a";
  mockOnline = false;
  render(<BillingRecovery enabled recover={recover} />);
  await flush();
  expect(recover).not.toHaveBeenCalled();
});

test("returning to the foreground retries, but not more often than the minimum interval; a reconnection follows the same rule", async () => {
  const now = jest.spyOn(Date, "now");
  now.mockReturnValue(1_000_000);
  const recover = jest.fn(async () => 0);
  render(<BillingRecovery enabled recover={recover} />);
  await flush();
  expect(recover).toHaveBeenCalledTimes(1);
  appStateListener?.("active");
  await flush();
  expect(recover).toHaveBeenCalledTimes(1);
  now.mockReturnValue(1_000_000 + RECOVERY_MIN_INTERVAL_MS + 1);
  appStateListener?.("background");
  appStateListener?.("active");
  await flush();
  expect(recover).toHaveBeenCalledTimes(2);
  now.mockReturnValue(1_000_000 + 2 * RECOVERY_MIN_INTERVAL_MS + 2);
  mockReconnect?.();
  await flush();
  expect(recover).toHaveBeenCalledTimes(3);
});

test("a failing recovery never surfaces an error", async () => {
  const recover = jest.fn(async () => { throw new Error("boom"); });
  render(<BillingRecovery enabled recover={recover} />);
  await flush();
  expect(recover).toHaveBeenCalledTimes(1);
});
