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
export type RpgSnapshot = { version: 1; owner: string; world: AdventureWorld; active: boolean; chapter: number; target: number; days: number; effort: number; milestones: RpgMilestone[]; rewards: { ordinal: number; choice: number | null; earnedAt: string }[]; familyTitles: { family: string; earnedAt: string }[]; branchContract?: number; branch?: BranchState };
type Action = "start" | "sync" | "claim" | "enter" | "confirm";

// The branch RPCs are a superset of v1. Until the V1.5.0 migration is applied, the journal keeps working on v1 and the
// pilot stays hidden (pilot actions themselves never fall back: they need the server contract).
let branchApi = true;
const missing = (error: unknown) => { const e = error as { code?: string; message?: string }; return e?.code === "PGRST202" || /Could not find the function/.test(e?.message ?? ""); };
async function request(owner: string, world: AdventureWorld, action?: Action, ordinal: number | null = null, choice: number | null = null, route: string | null = null): Promise<RpgSnapshot> {
  let data: RpgSnapshot | null = null;
  if (branchApi) {
    try {
      data = await ownerRpc<RpgSnapshot>(owner, action ? "titan_adventure_branch_action_v1" : "titan_adventure_branch_snapshot_v1", action ? { p_world: world, p_action: action, p_ordinal: ordinal, p_choice: choice, p_route: route } : { p_world: world });
    } catch (error) {
      if (!missing(error) || action === "enter" || action === "confirm") throw error;
      branchApi = false;
    }
  }
  if (!branchApi) data = await ownerRpc<RpgSnapshot>(owner, action ? "titan_adventure_rpg_action_v1" : "titan_adventure_rpg_snapshot_v1", action ? { p_world: world, p_action: action, p_ordinal: ordinal, p_choice: choice } : { p_world: world });
  await assertOwner(owner);
  if (data?.owner !== owner || data?.world !== world || data?.version !== 1) throw new Error("RPG_OWNER_MISMATCH");
  return data as RpgSnapshot;
}
export const fetchAdventureRpg = (owner: string, world: AdventureWorld) => request(owner, world);
export const adventureRpgAction = (owner: string, world: AdventureWorld, action: "start" | "sync" | "claim", ordinal: number | null = null, choice: number | null = null) => request(owner, world, action, ordinal, choice);
/** Pilot actions: explicit entry at a compatible point, then one confirmation (stable, canonical on every device). */
export const adventureBranchAction = (owner: string, world: AdventureWorld, action: "enter" | "confirm", route: string | null = null) => request(owner, world, action, null, null, route);
/** Test hook: forget a previous fallback. */
export const resetAdventureRpgContract = () => { branchApi = true; };
