let mockOwner = "a";
let mockFlags = true;
let mockSources: unknown = [];
const mockCalls: { name: string; params: Record<string, unknown>; token: string }[] = [];
jest.mock("../src/lib/supabase", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: mockOwner }, access_token: `token-${mockOwner}` } } }) },
  rpc: (name: string, params: Record<string, unknown>) => ({ setHeader: (_key: string, token: string) => {
    mockCalls.push({ name, params, token });
    return Promise.resolve({ data: name === "titan_feature_flags_v1" ? { flags: { "screens.garmin": mockFlags } } : name === "titan_garmin_status_v1" ? { linked: false } : name === "titan_sources_v1" ? mockSources : name === "titan_economy_limits" ? { messageMaxLength: 280, chatGuildCost: 0 } : name === "titan_list_guild_messages" ? [] : { id: "message-1" }, error: null });
  } }),
} }));
import { connectGarmin, disconnectGarmin, garminFailureMessage, garminReturnMessage, readGarmin, loadGuildChat, postGuildMessage } from "../src/lib/nativeConnections";
beforeEach(() => { mockOwner = "a"; mockFlags = true; mockSources = []; mockCalls.length = 0; });
const network = (status = 200, url = "https://connect.garmin.com/oauth/confirm") => jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: status === 200, status, json: async () => ({ url }) } as Response));

test("Garmin requires explicit consent and a server flag; no request when either is missing", async () => {
  const open = jest.fn(); const fetcher = network();
  await expect(connectGarmin("a", false, open, fetcher)).rejects.toThrow();
  expect(mockCalls).toHaveLength(0);
  mockFlags = false;
  await expect(connectGarmin("a", true, open, fetcher)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});
test("Garmin grants the current account, pins its token, then opens the approved provider", async () => {
  const open = jest.fn(async () => undefined); const fetcher = network();
  await connectGarmin("a", true, open, fetcher);
  expect(mockCalls.find((c) => c.name === "titan_set_source_consent_v1")).toMatchObject({ params: { p_source: "garmin", p_granted: true }, token: "Bearer token-a" });
  expect(String(fetcher.mock.calls[0][0])).toContain("action=start&client=android&flow=handoff");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer token-a" } });
  expect(open).toHaveBeenCalledWith("https://connect.garmin.com/oauth/confirm");
});
test("Garmin rejects unsafe redirects and a changed account before opening the browser", async () => {
  const open = jest.fn(async () => undefined);
  await expect(connectGarmin("a", true, open, network(200, "https://garmin.com.evil.test/"))).rejects.toThrow();
  const fetcher = network(); fetcher.mockImplementationOnce(async () => { mockOwner = "b"; return { ok: true, json: async () => ({ url: "https://connect.garmin.com/oauth/confirm" }) } as Response; });
  await expect(connectGarmin("a", true, open, fetcher)).rejects.toThrow("AUTH_REQUIRED"); expect(open).not.toHaveBeenCalled();
});
test("Garmin withdrawal still removes local authorization when the provider endpoint is down", async () => {
  await disconnectGarmin("a", network(503));
  expect(mockCalls).toEqual(expect.arrayContaining([expect.objectContaining({ name: "titan_set_source_consent_v1", params: { p_source: "garmin", p_granted: false } }), expect.objectContaining({ name: "titan_garmin_unlink_v1" })]));
});
test("guild chat reads current rules, validates content and never sends under a replacement account", async () => {
  expect(await loadGuildChat("a")).toEqual({ messages: [], maxLength: 280, cost: 0 });
  await expect(postGuildMessage("a", " ", 280)).rejects.toThrow();
  await expect(postGuildMessage("a", "x".repeat(281), 280)).rejects.toThrow();
  await postGuildMessage("a", "  Salut la guilde  ", 280);
  expect(mockCalls.at(-1)).toMatchObject({ name: "titan_send_guild_message", params: { p_content: "Salut la guilde" }, token: "Bearer token-a" });
  mockOwner = "b"; await expect(postGuildMessage("a", "ancien compte", 280)).rejects.toThrow("AUTH_REQUIRED");
});

test("Garmin state keeps authorised, connected, received and integrated apart", async () => {
  // Nothing said yes yet.
  expect(await readGarmin("a")).toMatchObject({ enabled: true, linked: false, authorized: false, imported: 0, attached: 0 });
  // Consent given on the Garmin screen but the link was never finished: authorised, not connected.
  mockSources = [{ source: "garmin", granted: true, imported: 0, linked: 0 }];
  expect(await readGarmin("a")).toMatchObject({ linked: false, authorized: true });
  // Counters come from the server, and another source's consent is never read as Garmin's.
  mockSources = [{ source: "health_connect", granted: true, imported: 9 }, { source: "garmin", granted: true, imported: 3, linked: 1, last_import_at: "2026-11-04T10:00:00Z" }];
  expect(await readGarmin("a")).toMatchObject({ authorized: true, imported: 3, attached: 1, last_import_at: "2026-11-04T10:00:00Z" });
  // An unreadable source list never breaks the link status.
  mockSources = { message: "nope" };
  expect(await readGarmin("a")).toMatchObject({ linked: false, authorized: false });
});

test("Garmin callback messages accept the fixed native route and public stages", () => {
  expect(garminReturnMessage("titan://garmin?garmin=error&garmin_reason=token&secret=evil")).toMatch(/GARMIN_TOKEN/);
  expect(garminReturnMessage("titan://garmin?garmin=ok")).toMatch(/vérification/i);
  for (const url of ["https://evil.test/garmin?garmin=ok", "titan://garmin/evil?garmin=ok", "titan://other?garmin=ok", "titan://user@garmin?garmin=ok"]) {
    expect(garminReturnMessage(url)).toBeNull();
  }
  expect(garminReturnMessage("titan://garmin?garmin=error&garmin_reason=evil-secret")).not.toContain("evil-secret");
  expect(garminReturnMessage("titan://garmin?garmin=error&garmin_reason=__proto__")).toMatch(/GARMIN_UNAVAILABLE/);
  expect(garminFailureMessage(new Error("GARMIN_CONFIGURATION"))).toMatch(/GARMIN_CONFIGURATION/);
});
