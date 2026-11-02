import { assertOwner, ownerRpc } from "./api";
export type AdventureWorld = "aube" | "marees" | "forge" | "aurores";
export type RpgMilestone = { ordinal: number; arc: number; chapter: number; kind: string; effortTarget: number; daysTarget: number; ready: boolean; earned: boolean };
export type RpgSnapshot = { version: 1; owner: string; world: AdventureWorld; active: boolean; chapter: number; target: number; days: number; effort: number; milestones: RpgMilestone[]; rewards: { ordinal: number; choice: number | null; earnedAt: string }[]; familyTitles: { family: string; earnedAt: string }[] };
async function request(owner: string, world: AdventureWorld, action?: "start" | "sync" | "claim", ordinal: number | null = null, choice: number | null = null): Promise<RpgSnapshot> {
  const data = await ownerRpc<RpgSnapshot>(owner, action ? "titan_adventure_rpg_action_v1" : "titan_adventure_rpg_snapshot_v1", action ? { p_world: world, p_action: action, p_ordinal: ordinal, p_choice: choice } : { p_world: world });
  await assertOwner(owner);
  if (data?.owner !== owner || data?.world !== world || data?.version !== 1) throw new Error("RPG_OWNER_MISMATCH");
  return data as RpgSnapshot;
}
export const fetchAdventureRpg = (owner: string, world: AdventureWorld) => request(owner, world);
export const adventureRpgAction = (owner: string, world: AdventureWorld, action: "start" | "sync" | "claim", ordinal: number | null = null, choice: number | null = null) => request(owner, world, action, ordinal, choice);
