let mockOwner = "a";
let mockSwitchBeforeRequest = false;
let mockResponseOwner = "a";
let mockPending: ((result: unknown) => void) | null = null;
let mockDelay = false;
const mockCalls: { name: string; params: Record<string, unknown>; token: string }[] = [];
jest.mock("../src/lib/supabase", () => ({ supabase: {
 auth: { getSession: async () => { const session = { user: { id: mockOwner }, access_token: `token-${mockOwner}` }; if (mockSwitchBeforeRequest) { mockSwitchBeforeRequest = false; mockOwner = "b"; } return { data: { session } }; } },
 rpc: (name: string, params: Record<string, unknown>) => ({ setHeader: (_key: string, token: string) => {
  mockCalls.push({ name, params, token });
  if (mockDelay) return new Promise(resolve => { mockPending = resolve; });
  return Promise.resolve({ data: { version: 1, owner: mockResponseOwner, world: params.p_world }, error: null });
 } }),
} }));
import { adventureRpgAction, fetchAdventureRpg } from "../src/data/adventureRpg";
beforeEach(() => { mockOwner = "a"; mockResponseOwner = "a"; mockSwitchBeforeRequest = false; mockDelay = false; mockPending = null; mockCalls.length = 0; });
test("encounter calls pin the validated owner's actual Authorization header", async () => {
 await adventureRpgAction("a", "aube", "claim", 2, 1);
 expect(mockCalls).toEqual([{ name: "titan_adventure_rpg_action_v1", params: { p_world: "aube", p_action: "claim", p_ordinal: 2, p_choice: 1 }, token: "Bearer token-a" }]);
});
test("replacement auth cannot silently send an old action under its new token", async () => {
 mockSwitchBeforeRequest = true;
 await expect(adventureRpgAction("a", "forge", "start")).rejects.toThrow("AUTH_REQUIRED");
 expect(mockCalls[0].token).toBe("Bearer token-a");
});
test("wrong current owner rejects before sending; cross-owner server response is rejected", async () => {
 mockOwner = "b"; await expect(fetchAdventureRpg("a", "aube")).rejects.toThrow("AUTH_REQUIRED"); expect(mockCalls).toHaveLength(0);
 mockOwner = "a"; mockResponseOwner = "b"; await expect(fetchAdventureRpg("a", "aube")).rejects.toThrow("RPG_OWNER_MISMATCH");
});
test("an in-flight read is discarded if the account changes before it returns", async () => {
 mockDelay = true; const request = fetchAdventureRpg("a", "marees");
 await Promise.resolve(); await Promise.resolve();
 mockOwner = "b"; expect(mockPending).not.toBeNull(); mockPending!({ data: { version: 1, owner: "a", world: "marees" }, error: null });
 await expect(request).rejects.toThrow("AUTH_REQUIRED");
});
