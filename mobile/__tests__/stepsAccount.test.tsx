import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PropsWithChildren } from "react";
import { useSteps } from "../src/data/steps";
import type { DaySteps } from "../src/lib/healthConnect";

let mockOwner = "a";
let mockSessionOwner = "a";
const mockGranted = jest.fn();
const mockReadSteps = jest.fn();
const mockRpc = jest.fn();
jest.mock("../src/data/auth", () => ({ useOwner: () => mockOwner }));
jest.mock("../src/lib/healthConnect", () => ({ healthConnect: () => ({ granted: mockGranted, readSteps: mockReadSteps }) }));
jest.mock("../src/data/pedometer", () => ({ usePedometer: () => ({ ready: true, supported: false, ledger: jest.requireActual("../src/lib/stepLedger").emptyLedger() }) }));
jest.mock("../src/lib/supabase", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: mockSessionOwner }, access_token: `token-${mockSessionOwner}` } } }) },
  rpc: (name: string, params: Record<string, unknown>) => {
    let authorization: string | undefined;
    return {
      setHeader: function (_name: string, value: string) { authorization = value; return this; },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(mockRpc(name, params, authorization ?? `Bearer token-${mockSessionOwner}`)).then(resolve, reject),
    };
  },
} }));

const day = { day: "2026-11-08", steps: 6200 };
const next = { day: "2026-11-09", steps: 7900 };
const imports = () => mockRpc.mock.calls.filter(([name]) => name === "titan_import_daily_activity_v1");

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useSteps(), { wrapper }), invalidate };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockOwner = mockSessionOwner = "a";
  mockGranted.mockReset().mockResolvedValue({ steps: true });
  mockReadSteps.mockReset().mockResolvedValue([]);
  mockRpc.mockReset().mockImplementation((name, params, token) => ({ data: name === "titan_sources_v1" ? [{ source: "health_connect", granted: token === "Bearer token-a" }] : name === "titan_import_daily_activity_v1" ? { day: params.p_day, steps: params.p_steps } : [], error: null }));
});

test("a Health Connect reading started by A cannot import using B's active session", async () => {
  let finish!: (days: DaySteps[]) => void;
  mockReadSteps.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { invalidate } = show();
  await waitFor(() => expect(mockReadSteps).toHaveBeenCalledTimes(1));
  // Auth changes before React observes the replacement owner.
  mockSessionOwner = "b";
  await act(async () => finish([day]));
  expect(imports()).toEqual([]);
  expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["journey", "a"] }));
});

test("an owner switch during a confirmed write drops the rest of the batch", async () => {
  let finish!: (result: unknown) => void;
  const defaultRpc = mockRpc.getMockImplementation()!;
  mockReadSteps.mockResolvedValueOnce([day, next]);
  mockRpc.mockImplementation((name, params, token) => name === "titan_import_daily_activity_v1" ? new Promise(resolve => { finish = resolve; }) : defaultRpc(name, params, token));
  const { rerender, invalidate, result } = show();
  await waitFor(() => expect(imports()).toHaveLength(1));
  mockOwner = mockSessionOwner = "b";
  rerender(undefined);
  await act(async () => finish({ data: day, error: null }));
  expect(imports()).toEqual([["titan_import_daily_activity_v1", { p_source: "health_connect", p_day: day.day, p_steps: day.steps }, "Bearer token-a"]]);
  expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["journey", "a"] }));
  expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["journey", "b"] }));
  expect(result.current.syncing).toBe(false);
});

test("simultaneous refreshes make one read and invalidate only after a confirmed import", async () => {
  mockGranted.mockResolvedValue({ steps: false });
  const { result, invalidate } = show();
  await waitFor(() => expect(result.current.connected).toBe(false));
  mockGranted.mockResolvedValue({ steps: true });
  mockReadSteps.mockResolvedValue([day]);
  await act(async () => Promise.all([result.current.refresh(), result.current.refresh()]));
  expect(mockReadSteps).toHaveBeenCalledTimes(1);
  expect(imports()).toHaveLength(1);
  expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["journey", "a"] }));
});
