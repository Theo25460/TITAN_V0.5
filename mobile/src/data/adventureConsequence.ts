/* V1.5.2 — Camp et conséquences. What the Veilleur's canonical outcome opened in the Vallée, read from the adventure server
   (never from the LIVE world): the Camp de base shows the link, the World screen the access. One query per account, shared by
   both screens; actions never fall back and never queue (the server records one discovery, then the visits). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertOwner, ownerRpc } from "./api";
import type { AdventureWorld } from "./adventureRpg";

export type ConsequenceItem = {
  state: "discover" | "open" | "unknown"; world: AdventureWorld; id: string; version: number; returnPoint?: string;
  outcome?: string; route?: string; kind?: "shortcut" | "annex"; resolvedAt?: string; attempts?: number; lastAnswer?: string[] | null;
  lastCorrect?: boolean | null; discoveredAt?: string | null; visits?: number; lastVisitAt?: string | null;
};
export type Consequences = { contract: 1; owner: string; items: ConsequenceItem[] };

// Until the V1.5.2 migration is applied, the Camp and the World screen show no access at all.
let api = true;
const missing = (error: unknown) => { const e = error as { code?: string; message?: string }; return e?.code === "PGRST202" || /Could not find the function/.test(e?.message ?? ""); };
const empty = (owner: string): Consequences => ({ contract: 1, owner, items: [] });
async function checked(owner: string, data: Consequences | null) {
  await assertOwner(owner);
  if (data?.owner !== owner || !Array.isArray(data?.items)) throw new Error("RPG_OWNER_MISMATCH");
  return data;
}
export async function fetchConsequences(owner: string): Promise<Consequences> {
  if (!api) return empty(owner);
  try { return await checked(owner, await ownerRpc<Consequences>(owner, "titan_adventure_consequences_v1", {})); }
  catch (error) { if (!missing(error)) throw error; api = false; return empty(owner); }
}
export async function consequenceAction(owner: string, world: AdventureWorld, action: "discover" | "visit", marks: string[] | null = null): Promise<Consequences> {
  if (!api) throw new Error("CONSEQUENCE_UNAVAILABLE");
  return checked(owner, await ownerRpc<Consequences>(owner, "titan_adventure_consequence_action_v1", { p_world: world, p_action: action, p_marks: marks }));
}
/** Test hook: forget a previous fallback. */
export const resetConsequenceContract = () => { api = true; };
export const consequenceKeys = { all: (owner: string) => ["adventureConsequences", owner] as const };
export function useConsequences(owner: string | null) {
  return useQuery({ queryKey: consequenceKeys.all(owner ?? ""), queryFn: () => fetchConsequences(owner as string), enabled: !!owner && !owner.startsWith("guest_") });
}
export function useConsequenceAction(owner: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ world, action, marks }: { world: AdventureWorld; action: "discover" | "visit"; marks?: string[] | null }) => consequenceAction(owner, world, action, marks ?? null),
    onSuccess: (data) => qc.setQueryData(consequenceKeys.all(owner), data),
  });
}
