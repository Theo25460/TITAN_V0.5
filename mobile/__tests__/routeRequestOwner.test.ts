let mockOwner: string | null = "a";
const mockHeaders: Record<string, string> = {};
let mockResult: unknown = true;
const mockRpc = jest.fn(() => ({
  setHeader: (name: string, value: string) => { mockHeaders[name] = value; return Promise.resolve({ data: mockResult, error: null }); },
  then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve({ data: mockResult, error: null })),
}));
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => (mockRpc as (...a: unknown[]) => unknown)(...args), auth: { getSession: async () => ({ data: { session: mockOwner ? { user: { id: mockOwner }, access_token: `token-${mockOwner}` } : null } }) } } }));
import type { AdventureSnapshot } from "../src/core/types";
import { adventureAction, deleteOwnAccount, exportOwnData, fetchAdventure, fetchAtelier, fetchCardSettings, fetchSocial, purchaseItem, routeSave, routeLink, routeGet, routeForEvent, routeDelete, routesList, saveCard, setAppearance, submitSession } from "../src/data/api";

const payload = { clientRouteId: "route-one", sport: "running", startedAt: "2026-11-02T08:00:00Z", distanceM: 100, durationS: 60, ascentM: null, track: { private: "coordinates" } };
beforeEach(() => { mockOwner = "a"; mockResult = true; mockRpc.mockClear(); for (const k of Object.keys(mockHeaders)) delete mockHeaders[k]; });

test("a previous account's trace is never submitted with the next account's credentials", async () => {
  mockOwner = "b";
  await expect((routeSave as unknown as (owner: string, p: typeof payload) => Promise<unknown>)("a", payload)).rejects.toThrow("AUTH_REQUIRED");
  expect(mockRpc).not.toHaveBeenCalled();
});

test("GPS route save and link bind the checked owner's token to the actual request", async () => {
  await (routeSave as unknown as (owner: string, p: typeof payload) => Promise<unknown>)("a", payload);
  expect(mockHeaders.Authorization).toBe("Bearer token-a");
  expect(mockRpc).toHaveBeenCalledWith("titan_route_save_v1", expect.objectContaining({ p_track: payload.track }));
  await (routeLink as unknown as (owner: string, id: string, event: string) => Promise<unknown>)("a", "route-one", "event-one");
  expect(mockHeaders.Authorization).toBe("Bearer token-a");
  mockOwner = null;
  await expect((routeLink as unknown as (owner: string, id: string, event: string) => Promise<unknown>)("a", "route-one", "event-one")).rejects.toThrow("AUTH_REQUIRED");
});

test("late route reads and deletions cannot run under a replacement account", async () => {
  mockOwner = "b";
  for (const fn of [routeGet, routeForEvent, routeDelete, routesList]) {
    await expect((fn as unknown as (owner: string, id?: string) => Promise<unknown>)("a", "route-one")).rejects.toThrow("AUTH_REQUIRED");
  }
  expect(mockRpc).not.toHaveBeenCalled();
});

test("session synchronization also pins the payload to the original account", async () => {
  const p = { sport: "running", category: "cardio", val: 5, unit: "km", date: "2026-11-02T08:00:00Z", details: { client_event_id: "event-a" } };
  mockOwner = "b";
  await expect((submitSession as unknown as (owner: string, value: typeof p) => Promise<unknown>)("a", p)).rejects.toThrow("AUTH_REQUIRED");
  expect(mockRpc).not.toHaveBeenCalled();
  mockOwner = "a";
  mockResult = { log_id: "server-session-a" };
  await (submitSession as unknown as (owner: string, value: typeof p) => Promise<unknown>)("a", p);
  expect(mockHeaders.Authorization).toBe("Bearer token-a");
});

test.each([
  ["profile deletion", () => deleteOwnAccount("a")],
  ["private export", () => exportOwnData("a")],
  ["adventure snapshot", () => fetchAdventure("a")],
  ["adventure claim", () => adventureAction({ owner: "a", revision: 1 } as AdventureSnapshot, "claim", { world: "aube", chapter: 1 }, "Europe/Paris")],
  ["cosmetic library", () => fetchAtelier("a")],
  ["cosmetic purchase", () => purchaseItem("a", "frame-one")],
  ["cosmetic equip", () => setAppearance("a", "frame", "frame-one")],
  ["community overview", () => fetchSocial("a")],
  ["public card settings", () => fetchCardSettings("a")],
  ["public card save", () => saveCard("a", true, {})],
] as const)("a stale %s request cannot run for the replacement account", async (_name, request) => {
  mockOwner = "b";
  await expect(request()).rejects.toThrow("AUTH_REQUIRED");
  expect(mockRpc).not.toHaveBeenCalled();
});
