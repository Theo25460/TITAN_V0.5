let mockOwner = "a";
let mockSwitchBeforeRequest = false;
let mockResponseOwner = "a";
let mockPending: ((result: unknown) => void) | null = null;
let mockDelay = false;
let mockMissingBranch = false;
let mockMissingGuardian = false;
const mockCalls: { name: string; params: Record<string, unknown>; token: string }[] = [];
jest.mock("../src/lib/supabase", () => ({ supabase: {
 auth: { getSession: async () => { const session = { user: { id: mockOwner }, access_token: `token-${mockOwner}` }; if (mockSwitchBeforeRequest) { mockSwitchBeforeRequest = false; mockOwner = "b"; } return { data: { session } }; } },
 rpc: (name: string, params: Record<string, unknown>) => ({ setHeader: (_key: string, token: string) => {
  mockCalls.push({ name, params, token });
  if (mockDelay) return new Promise(resolve => { mockPending = resolve; });
  // A server without V1.5.0 has no V1.5.1 either; one with V1.5.0 only lacks the guardian RPCs.
  if ((mockMissingBranch || mockMissingGuardian) && name.startsWith("titan_adventure_guardian_")) return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
  if (mockMissingBranch && name.startsWith("titan_adventure_branch_")) return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
  return Promise.resolve({ data: { version: 1, owner: mockResponseOwner, world: params.p_world }, error: null });
 } }),
} }));
import { adventureBranchAction, adventureGuardianAction, adventureRpgAction, fetchAdventureRpg, resetAdventureRpgContract } from "../src/data/adventureRpg";
beforeEach(() => { resetAdventureRpgContract(); mockMissingBranch = false; mockMissingGuardian = false; mockOwner = "a"; mockResponseOwner = "a"; mockSwitchBeforeRequest = false; mockDelay = false; mockPending = null; mockCalls.length = 0; });
test("encounter calls pin the validated owner's actual Authorization header", async () => {
 await adventureRpgAction("a", "aube", "claim", 2, 1);
 expect(mockCalls).toEqual([{ name: "titan_adventure_guardian_action_v1", params: { p_world: "aube", p_action: "claim", p_ordinal: 2, p_choice: 1, p_route: null, p_sign: null }, token: "Bearer token-a" }]);
});
test("V1.5.0 pilot actions send the explicit route (through the V1.5.1 superset when the server has it)", async () => {
 await adventureBranchAction("a", "aube", "enter");
 await adventureBranchAction("a", "aube", "confirm", "ruines");
 expect(mockCalls.map(c => [c.name, c.params.p_action, c.params.p_route])).toEqual([
  ["titan_adventure_guardian_action_v1", "enter", null], ["titan_adventure_guardian_action_v1", "confirm", "ruines"]]);
 resetAdventureRpgContract(); mockCalls.length = 0; mockMissingGuardian = true;
 await adventureBranchAction("a", "aube", "confirm", "ruines");
 expect(mockCalls.map(c => [c.name, c.params.p_action, c.params.p_route])).toEqual([
  ["titan_adventure_guardian_action_v1", "confirm", "ruines"], ["titan_adventure_branch_action_v1", "confirm", "ruines"]]);
});
test("V1.5.1 guardian actions send the sign; a server without the migration keeps V1.5.0, guardian actions never fall back", async () => {
 await adventureGuardianAction("a", "aube", "prepare", "fissure");
 await adventureGuardianAction("a", "aube", "resolve");
 expect(mockCalls.map(c => [c.name, c.params.p_action, c.params.p_sign])).toEqual([
  ["titan_adventure_guardian_action_v1", "prepare", "fissure"], ["titan_adventure_guardian_action_v1", "resolve", null]]);
 resetAdventureRpgContract(); mockCalls.length = 0; mockMissingGuardian = true;
 await fetchAdventureRpg("a", "aube");
 expect(mockCalls.map(c => c.name)).toEqual(["titan_adventure_guardian_snapshot_v1", "titan_adventure_branch_snapshot_v1"]);
 await expect(adventureGuardianAction("a", "aube", "resolve")).rejects.toThrow("GUARDIAN_UNAVAILABLE");
 expect(mockCalls).toHaveLength(2);
 resetAdventureRpgContract(); mockCalls.length = 0;
 await expect(adventureGuardianAction("a", "aube", "prepare", "gravure")).rejects.toMatchObject({ code: "PGRST202" });
 expect(mockCalls.map(c => c.name)).toEqual(["titan_adventure_guardian_action_v1"]);
});
test("a server without the V1.5.0 migration keeps the v1 journal; pilot actions never fall back", async () => {
 mockMissingBranch = true;
 await fetchAdventureRpg("a", "aube");
 expect(mockCalls.map(c => c.name)).toEqual(["titan_adventure_guardian_snapshot_v1", "titan_adventure_branch_snapshot_v1", "titan_adventure_rpg_snapshot_v1"]);
 await adventureRpgAction("a", "aube", "sync");
 expect(mockCalls[3].name).toBe("titan_adventure_rpg_action_v1");
 resetAdventureRpgContract(); mockCalls.length = 0;
 await expect(adventureBranchAction("a", "aube", "confirm", "corniche")).rejects.toMatchObject({ code: "PGRST202" });
 expect(mockCalls.map(c => c.name)).toEqual(["titan_adventure_guardian_action_v1", "titan_adventure_branch_action_v1"]);
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
