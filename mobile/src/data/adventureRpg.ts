import { assertOwner, ownerRpc } from "./api";
export type AdventureWorld = "aube" | "marees" | "forge" | "aurores";
export type RpgMilestone = { ordinal: number; arc: number; chapter: number; kind: string; effortTarget: number; daysTarget: number; ready: boolean; earned: boolean };
/** V1.5.0 pilot block of the snapshot (server facts only; titan_adventure_branch_snapshot_v1). */
export type BranchState = {
  state: "none" | "available" | "entered" | "confirmed" | "legacy" | "unknown";
  pilot?: string; version?: number; enteredAt?: string; route?: string; confirmedAt?: string; effortSince?: number; daysSince?: number;
  steps?: { ordinal: number; kind: string; effortTarget: number; daysTarget: number; branchReady: boolean; earned: boolean; earnedAt: string | null }[];
  clue?: { id: string; state: "found" | "usable"; foundAt: string; usableAt: string | null } | null;
};
/** V1.5.1 guardian block of the snapshot (server facts only; titan_adventure_guardian_snapshot_v1). */
export type GuardianState = {
  state: "none" | "locked" | "observe" | "prepare" | "waiting" | "ready" | "resolved" | "legacy" | "unknown";
  id?: string; version?: number; route?: string; clue?: string; observeOrdinal?: number; ordinal?: number; signs?: string[];
  observedAt?: string | null; attempts?: number; lastSign?: string | null; lastCorrect?: boolean | null; preparedAt?: string | null;
  outcome?: string | null; resolvedAt?: string | null;
  threshold?: { ordinal: number; effort: number; effortTarget: number; days: number; daysTarget: number; chapter: number; chapterTarget: number; ready: boolean };
  sincePrepared?: { effort: number; sessions: number }; corrected?: { effort: number; sessions: number };
};
/** V1.5.3 mechanic block (server facts only; titan_adventure_campaign_snapshot_v1). Never carries the expected answer. */
export type MechanicState = {
  state: string; primitive?: "pick" | "chart" | "sequence" | "link"; route?: string; slots?: { id: string; pool: string[] }[];
  attempts?: number; lastAnswer?: string[] | null; lastCorrect?: boolean | null; firstWrong?: number | null; solved?: boolean;
};
export type RpgSnapshot = { version: 1; owner: string; world: AdventureWorld; active: boolean; chapter: number; target: number; days: number; effort: number; milestones: RpgMilestone[]; rewards: { ordinal: number; choice: number | null; earnedAt: string }[]; familyTitles: { family: string; earnedAt: string }[]; branchContract?: number; branch?: BranchState; guardianContract?: number; guardian?: GuardianState; campaignContract?: number; campaign?: string; mechanic?: MechanicState };
type Action = "start" | "sync" | "claim" | "enter" | "confirm" | "prepare" | "resolve" | "solve";

// The branch RPCs are a superset of v1. Until the V1.5.0 migration is applied, the journal keeps working on v1 and the
// pilot stays hidden (pilot actions themselves never fall back: they need the server contract).
let branchApi = true;
// Same for the V1.5.1 guardian RPCs (a superset of the branch ones); prepare/resolve never fall back.
let guardianApi = true;
// Same for the V1.5.3 common campaign RPCs (a superset of the guardian ones); solve never falls back.
let campaignApi = true;
const missing = (error: unknown) => { const e = error as { code?: string; message?: string }; return e?.code === "PGRST202" || /Could not find the function/.test(e?.message ?? ""); };
async function request(owner: string, world: AdventureWorld, action?: Action, ordinal: number | null = null, choice: number | null = null, route: string | null = null, sign: string | null = null, answer: string[] | null = null): Promise<RpgSnapshot> {
  let data: RpgSnapshot | null = null;
  let done = false;
  if (campaignApi && guardianApi && branchApi) {
    // In the Vallée the sign is the one-slot answer of the same "solve" action.
    const act = action === "prepare" ? "solve" : action, ans = action === "prepare" ? [sign ?? ""] : answer;
    try {
      data = await ownerRpc<RpgSnapshot>(owner, act ? "titan_adventure_campaign_action_v1" : "titan_adventure_campaign_snapshot_v1", act ? { p_world: world, p_action: act, p_ordinal: ordinal, p_choice: choice, p_route: route, p_answer: ans } : { p_world: world });
      done = true;
    } catch (error) {
      if (!missing(error) || action === "solve") throw error;
      campaignApi = false;
    }
  }
  if (!done && action === "solve") throw new Error("GUARDIAN_UNAVAILABLE");
  if (!done && guardianApi && branchApi) {
    try {
      data = await ownerRpc<RpgSnapshot>(owner, action ? "titan_adventure_guardian_action_v1" : "titan_adventure_guardian_snapshot_v1", action ? { p_world: world, p_action: action, p_ordinal: ordinal, p_choice: choice, p_route: route, p_sign: sign } : { p_world: world });
      done = true;
    } catch (error) {
      if (!missing(error) || action === "prepare" || action === "resolve") throw error;
      guardianApi = false;
    }
  }
  if (!done && (action === "prepare" || action === "resolve")) throw new Error("GUARDIAN_UNAVAILABLE");
  if (!done && branchApi) {
    try {
      data = await ownerRpc<RpgSnapshot>(owner, action ? "titan_adventure_branch_action_v1" : "titan_adventure_branch_snapshot_v1", action ? { p_world: world, p_action: action, p_ordinal: ordinal, p_choice: choice, p_route: route } : { p_world: world });
      done = true;
    } catch (error) {
      if (!missing(error) || action === "enter" || action === "confirm") throw error;
      branchApi = false;
    }
  }
  if (!done && !branchApi) data = await ownerRpc<RpgSnapshot>(owner, action ? "titan_adventure_rpg_action_v1" : "titan_adventure_rpg_snapshot_v1", action ? { p_world: world, p_action: action, p_ordinal: ordinal, p_choice: choice } : { p_world: world });
  await assertOwner(owner);
  if (data?.owner !== owner || data?.world !== world || data?.version !== 1) throw new Error("RPG_OWNER_MISMATCH");
  return data as RpgSnapshot;
}
export const fetchAdventureRpg = (owner: string, world: AdventureWorld) => request(owner, world);
export const adventureRpgAction = (owner: string, world: AdventureWorld, action: "start" | "sync" | "claim", ordinal: number | null = null, choice: number | null = null) => request(owner, world, action, ordinal, choice);
/** Pilot actions: explicit entry at a compatible point, then one confirmation (stable, canonical on every device). */
export const adventureBranchAction = (owner: string, world: AdventureWorld, action: "enter" | "confirm", route: string | null = null) => request(owner, world, action, null, null, route);
/** Test hook: forget a previous fallback. */
export const resetAdventureRpgContract = () => { branchApi = true; guardianApi = true; campaignApi = true; };
/** Guardian actions (V1.5.1): match the clue to a sign, then resolve once; the outcome is always the server's. */
export const adventureGuardianAction = (owner: string, world: AdventureWorld, action: "prepare" | "resolve", sign: string | null = null) => request(owner, world, action, null, null, null, sign);
/** V1.5.3 mechanic of the Marées, the Forge or the Aurores: one token per slot, checked by the server; never falls back. */
export const adventureCampaignSolve = (owner: string, world: AdventureWorld, answer: string[]) => request(owner, world, "solve", null, null, null, null, answer);
