/* V1.7.7 — the server functions written for this version are not applied in production yet: every call must fall back when
   PostgREST answers « unknown function » (PGRST202 / HTTP 404), and never hide a real refusal behind that fallback. */
type Answer = { data?: unknown; error?: unknown };
let mockOwner: string | null = "a";
const mockAnswers: Record<string, Answer | ((params: Record<string, unknown>) => Answer)> = {};
const mockCalls: { name: string; params: Record<string, unknown>; auth?: string }[] = [];
const mockRpc = jest.fn((name: string, params: Record<string, unknown>) => {
  const call: { name: string; params: Record<string, unknown>; auth?: string } = { name, params };
  mockCalls.push(call);
  const given = mockAnswers[name];
  const answer = typeof given === "function" ? given(params) : given ?? { error: { code: "PGRST202", message: `Could not find the function public.${name} in the schema cache` } };
  const result = { data: answer.data ?? null, error: answer.error ?? null };
  return { setHeader: (_h: string, value: string) => { call.auth = value; return Promise.resolve(result); } };
});
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (name: string, params: Record<string, unknown>) => mockRpc(name, params), auth: { getSession: async () => ({ data: { session: mockOwner ? { user: { id: mockOwner }, access_token: `token-${mockOwner}` } : null } }) } } }));
import { placeDelete, placeSave, placesList, routeGetV2, routeRename, routeSaveV2, routesLibrary, rpcMissing, siteFunction, _resetRpcMissing } from "../src/data/api";

const route = { clientRouteId: "route-one", sport: "running", startedAt: "2026-11-02T08:00:00Z", distanceM: 3000, durationS: 0, ascentM: null, track: { v: 1, t0: 0, segs: [] }, name: "  Tour du lac ", origin: "imported" as const };
const names = () => mockCalls.map((c) => c.name);
beforeEach(() => { mockOwner = "a"; mockCalls.length = 0; mockRpc.mockClear(); for (const k of Object.keys(mockAnswers)) delete mockAnswers[k]; _resetRpcMissing(); });

test("rpcMissing recognises an unknown function and nothing else", () => {
  expect(rpcMissing({ code: "PGRST202", message: "Could not find the function public.titan_routes_v2 in the schema cache" })).toBe(true);
  expect(rpcMissing({ status: 404, message: "Not Found" })).toBe(true);
  expect(rpcMissing({ message: "Could not find the function public.titan_places_v1() in the schema cache" })).toBe(true);
  expect(rpcMissing({ code: "22023", message: "ROUTE_LIMIT" })).toBe(false);
  expect(rpcMissing({ code: "42501", message: "AUTH_REQUIRED" })).toBe(false);
  expect(rpcMissing(new Error("Network request failed"))).toBe(false);
  expect(rpcMissing(null)).toBe(false);
});

test("save: v2 carries the name, the origin and the summary; without v2 the route is saved through v1 and reported as such", async () => {
  mockAnswers.titan_route_save_v2 = { data: { id: "id-1", created: true } };
  expect(await routeSaveV2("a", route)).toEqual({ id: "id-1", created: true, legacy: false });
  expect(mockCalls[0]).toMatchObject({ name: "titan_route_save_v2", auth: "Bearer token-a", params: { p_client_route_id: "route-one", p_name: "Tour du lac", p_origin: "imported", p_summary: null, p_duration_s: 0 } });

  delete mockAnswers.titan_route_save_v2;
  mockAnswers.titan_route_save_v1 = { data: { id: "id-1", created: false } };
  mockCalls.length = 0;
  expect(await routeSaveV2("a", route)).toEqual({ id: "id-1", created: false, legacy: true });
  expect(names()).toEqual(["titan_route_save_v2", "titan_route_save_v1"]);
  expect(mockCalls[1]!.params).not.toHaveProperty("p_name");
  // Found missing a moment ago: v2 is not asked again at once.
  mockCalls.length = 0;
  await routeSaveV2("a", route);
  expect(names()).toEqual(["titan_route_save_v1"]);
});

test("save: a real refusal of v2 is passed on, never retried through v1", async () => {
  mockAnswers.titan_route_save_v2 = { error: { code: "22023", message: "ROUTE_LIMIT" } };
  mockAnswers.titan_route_save_v1 = { data: { id: "id-1", created: true } };
  await expect(routeSaveV2("a", route)).rejects.toMatchObject({ message: "ROUTE_LIMIT" });
  expect(names()).toEqual(["titan_route_save_v2"]);
  mockOwner = "b";
  await expect(routeSaveV2("a", route)).rejects.toThrow("AUTH_REQUIRED");
});

test("list: v2 rows with name, origin and summary, two pages for a full library; without v2 the v1 rows with unknown origin", async () => {
  const row = (i: number) => ({ id: `r${i}`, sport: "running", startedAt: new Date(Date.UTC(2026, 0, 1) - i * 86400000).toISOString(), distanceM: 1000, durationS: 600, ascentM: null, points: 10, name: i === 0 ? "Premier" : null, origin: i === 1 ? "planned" : "recorded", summary: null });
  mockAnswers.titan_routes_v2 = (p) => ({ data: p.p_before ? Array.from({ length: 40 }, (_, i) => row(100 + i)) : Array.from({ length: 100 }, (_, i) => row(i)) });
  const full = await routesLibrary("a");
  expect(full.legacy).toBe(false);
  expect(full.routes).toHaveLength(140);
  expect(full.routes[0]).toMatchObject({ name: "Premier", origin: "recorded" });
  expect(full.routes[1]).toMatchObject({ origin: "planned" });
  expect(mockCalls[1]!.params).toEqual({ p_limit: 100, p_before: row(99).startedAt });

  delete mockAnswers.titan_routes_v2;
  _resetRpcMissing();
  mockAnswers.titan_routes_v1 = { data: [{ id: "r1", sport: "running", startedAt: "2026-11-02T08:00:00Z", distanceM: 1000, durationS: 600, ascentM: null, points: 10 }] };
  expect(await routesLibrary("a")).toEqual({ legacy: true, routes: [expect.objectContaining({ id: "r1", name: null, origin: null, summary: null })] });
});

test("get and rename fall back; a rename the server knows but that matches no route is an error, not a silent local name", async () => {
  mockAnswers.titan_route_get_v1 = { data: { id: "r1", sport: "running", startedAt: "2026-11-02T08:00:00Z", distanceM: 1000, durationS: 600, ascentM: null, points: 10, track: { v: 1, t0: 0, segs: [] } } };
  expect(await routeGetV2("a", "r1")).toMatchObject({ id: "r1", legacy: true, name: null, origin: null, track: { v: 1 } });
  expect(await routeRename("a", "r1", "Tour")).toBe("local");
  _resetRpcMissing();
  mockAnswers.titan_route_rename_v1 = { data: true };
  expect(await routeRename("a", "r1", "Tour")).toBe("server");
  expect(mockCalls[mockCalls.length - 1]!.params).toEqual({ p_id: "r1", p_name: "Tour" });
  mockAnswers.titan_route_rename_v1 = { data: false };
  await expect(routeRename("a", "r1", "Tour")).rejects.toThrow("ROUTE_NOT_FOUND");
});

test("personal points: each call answers null while the server has no such function, and the real answer once it has", async () => {
  expect(await placesList("a")).toBeNull();
  expect(await placeSave("a", { clientPlaceId: "pl-12345678", name: "Fontaine", kind: "water", lat: 48.5, lon: 7.7, note: "" })).toBeNull();
  expect(await placeDelete("a", "id-1")).toBeNull();
  _resetRpcMissing();
  mockAnswers.titan_places_v1 = { data: [] };
  mockAnswers.titan_place_save_v1 = { data: { id: "id-1", created: true } };
  mockAnswers.titan_place_delete_v1 = { data: true };
  expect(await placesList("a")).toEqual([]);
  expect(await placeSave("a", { clientPlaceId: "pl-12345678", name: "Fontaine", kind: "water", lat: 48.5, lon: 7.7, note: "" })).toEqual({ id: "id-1", created: true });
  expect(mockCalls[mockCalls.length - 1]!.params).toEqual({ p_client_place_id: "pl-12345678", p_name: "Fontaine", p_kind: "water", p_lat: 48.5, p_lon: 7.7, p_note: "" });
  expect(await placeDelete("a", "id-1")).toBe(true);
  mockAnswers.titan_places_v1 = { error: { code: "42501", message: "AUTH_REQUIRED" } };
  await expect(placesList("a")).rejects.toMatchObject({ message: "AUTH_REQUIRED" });
});

test("TITAN's own server functions are called on the website with the checked owner's token, and an HTTP error is an answer, not a crash", async () => {
  const network = jest.fn(async () => ({ status: 503, json: async () => ({ ok: false, code: "ROUTING_NOT_CONFIGURED" }) })) as unknown as typeof fetch;
  expect(await siteFunction("a", "route-plan", { profile: "walk" }, network)).toEqual({ status: 503, body: { ok: false, code: "ROUTING_NOT_CONFIGURED" } });
  const [url, init] = (network as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://titan-app.fr/.netlify/functions/route-plan");
  expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ profile: "walk" }), headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" } });
  const html = (async () => ({ status: 404, json: async () => { throw new Error("not json"); } })) as unknown as typeof fetch;
  expect(await siteFunction("a", "poi-nearby", {}, html)).toEqual({ status: 404, body: null });
  mockOwner = "b";
  await expect(siteFunction("a", "route-plan", {}, network)).rejects.toThrow("AUTH_REQUIRED");
  expect(network).toHaveBeenCalledTimes(1);
});
