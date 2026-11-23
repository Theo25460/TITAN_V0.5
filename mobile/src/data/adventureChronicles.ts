/* V1.5.5 — Chroniques et aventures rejouables. The chronicle of each world's first arc and the new runs of an arc already
   achieved, read from the adventure server (run 1 from the facts the arcs wrote, new runs from their own table). One query per
   account, shared by every World screen; actions never fall back and never queue (the server keeps one active run per arc, one
   route per run, one outcome). Nothing is stored on the phone: reinstalled, the app reads the same chronicle again. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertOwner, ownerRpc } from "./api";

export type ChronicleRun = {
  run: number; kind: "pilot" | "legacy" | "journal" | "replay"; arc: string; version: number | null; state: string; route: string | null;
  outcome: string | null; [key: string]: unknown;
};
export type ChronicleArc = { world: string; arc: string; version: number; completed: boolean; activeRun: number | null; replayable: boolean;
  activeOutcome: { route: string; outcome: string; run: number } | null; discovered: { route: string; scene: boolean; clue: boolean; outcome: boolean }[];
  runs: ChronicleRun[]; [key: string]: unknown };
export type Chronicles = { contract: 1; owner: string; rules: number; arcs: ChronicleArc[] };
export type ChronicleAction = "start" | "choose" | "advance" | "solve" | "resolve" | "abandon" | "read" | "sync";
export type ChronicleParams = { run?: number | null; route?: string | null; step?: string | null; answer?: string[] | null };

// Until the V1.5.5 migration is applied, no chronicle is shown.
let api = true;
const missing = (error: unknown) => { const e = error as { code?: string; message?: string }; return e?.code === "PGRST202" || /Could not find the function/.test(e?.message ?? ""); };
const empty = (owner: string): Chronicles => ({ contract: 1, owner, rules: 1, arcs: [] });
async function checked(owner: string, data: Chronicles | null) {
  await assertOwner(owner);
  if (data?.owner !== owner || !Array.isArray(data?.arcs)) throw new Error("RPG_OWNER_MISMATCH");
  return data;
}
export async function fetchChronicles(owner: string): Promise<Chronicles> {
  if (!api) return empty(owner);
  try { return await checked(owner, await ownerRpc<Chronicles>(owner, "titan_adventure_chronicles_v1", {})); }
  catch (error) { if (!missing(error)) throw error; api = false; return empty(owner); }
}
export async function chronicleAction(owner: string, world: string, action: ChronicleAction, p: ChronicleParams = {}): Promise<Chronicles> {
  if (!api) throw new Error("CHRONICLE_UNAVAILABLE");
  return checked(owner, await ownerRpc<Chronicles>(owner, "titan_adventure_chronicle_action_v1",
    { p_world: world, p_action: action, p_run: p.run ?? null, p_route: p.route ?? null, p_step: p.step ?? null, p_answer: p.answer ?? null }));
}
/** Test hook: forget a previous fallback. */
export const resetChronicleContract = () => { api = true; };
export const chronicleKeys = { all: (owner: string) => ["adventureChronicles", owner] as const };
export function useChronicles(owner: string | null) {
  return useQuery({ queryKey: chronicleKeys.all(owner ?? ""), queryFn: () => fetchChronicles(owner as string), enabled: !!owner && !owner.startsWith("guest_") });
}
export function useChronicleAction(owner: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ world, action, params }: { world: string; action: ChronicleAction; params?: ChronicleParams }) => chronicleAction(owner, world, action, params ?? {}),
    onSuccess: (data) => qc.setQueryData(chronicleKeys.all(owner), data),
  });
}
