/* V1.5.4 — Quêtes entre les mondes. The notebook of clues and the chains between worlds, read from the adventure server (each
   clue is a fact of an arc the account already played). One query per account, shared by every World screen; actions never fall
   back and never queue (the server records one start, one link, one manner, one resolution). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertOwner, ownerRpc } from "./api";

export type QuestChain = {
  id: string; version?: number; from?: string; to?: string;
  state: "none" | "locked" | "available" | "link" | "choose" | "waiting" | "ready" | "resolved" | "unknown";
  clue?: string | null; clues?: { id: string; origin: Record<string, string>; foundAt: string | null }[]; startedAt?: string;
  attempts?: number; lastAnswer?: string[] | null; lastCorrect?: boolean | null; linkedAt?: string | null; manner?: string | null;
  chosenAt?: string | null; days?: number; daysTarget?: number; outcome?: string | null; resolvedAt?: string | null;
};
export type QuestClue = { id: string; chain: string; version: number; origin: Record<string, string>; foundAt: string; destination: string; state: "found" | "followed" | "linked" | "used" };
export type Quests = { contract: 1; owner: string; chains: QuestChain[]; clues: QuestClue[] };
export type QuestAction = "start" | "link" | "choose" | "resolve";

// Until the V1.5.4 migration is applied, no notebook and no map access are shown.
let api = true;
const missing = (error: unknown) => { const e = error as { code?: string; message?: string }; return e?.code === "PGRST202" || /Could not find the function/.test(e?.message ?? ""); };
const empty = (owner: string): Quests => ({ contract: 1, owner, chains: [], clues: [] });
async function checked(owner: string, data: Quests | null) {
  await assertOwner(owner);
  if (data?.owner !== owner || !Array.isArray(data?.chains) || !Array.isArray(data?.clues)) throw new Error("RPG_OWNER_MISMATCH");
  return data;
}
export async function fetchQuests(owner: string): Promise<Quests> {
  if (!api) return empty(owner);
  try { return await checked(owner, await ownerRpc<Quests>(owner, "titan_adventure_quests_v1", {})); }
  catch (error) { if (!missing(error)) throw error; api = false; return empty(owner); }
}
export async function questAction(owner: string, chain: string, action: QuestAction, answer: string[] | null = null, manner: string | null = null): Promise<Quests> {
  if (!api) throw new Error("QUEST_UNAVAILABLE");
  return checked(owner, await ownerRpc<Quests>(owner, "titan_adventure_quest_action_v1", { p_chain: chain, p_action: action, p_answer: answer, p_manner: manner }));
}
/** Test hook: forget a previous fallback. */
export const resetQuestContract = () => { api = true; };
export const questKeys = { all: (owner: string) => ["adventureQuests", owner] as const };
export function useQuests(owner: string | null) {
  return useQuery({ queryKey: questKeys.all(owner ?? ""), queryFn: () => fetchQuests(owner as string), enabled: !!owner && !owner.startsWith("guest_") });
}
export function useQuestAction(owner: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chain, action, answer, manner }: { chain: string; action: QuestAction; answer?: string[] | null; manner?: string | null }) =>
      questAction(owner, chain, action, answer ?? null, manner ?? null),
    onSuccess: (data) => qc.setQueryData(questKeys.all(owner), data),
  });
}
