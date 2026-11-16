/* TITAN LIVE data: the running session is written on the phone (per account) after every meaningful step, so a killed
   app, a reboot or a flat battery loses nothing; settlements wait in a small per-account outbox until the server has
   confirmed the session. The server decides every reward (titan_live_settle_v1). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { LiveState } from "../core/live";
import { ownerKey, readJSON, remove, writeJSON } from "../lib/storage";
import { toAppError } from "../lib/errors";
import { ownerRpc } from "./api";
import { useAuth, useOwner } from "./auth";

export type LiveWorldSnapshot = {
  version: 1; enabled: boolean;
  wallet: { eclats: number; essences: Record<string, number> };
  buildings: Record<string, number>; collection: string[];
  voies: Record<string, { sessions: number; days: number }>; days: number; distinctVoies: number;
};
export type LiveSettlement = {
  status: "settled" | "held" | "no_journal" | "not_eligible" | "too_late" | "unknown_sport";
  replay?: boolean; voie?: string; essence?: string; essenceAmount?: number; eclats?: number; missions?: string[];
  missionsIgnored?: boolean; find?: string | null; findNew?: boolean; findName?: string | null;
};

type Stored = { state: LiveState; savedAt: number } | null;
let current: { owner: string | null; stored: Stored } = { owner: null, stored: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const writes = new Map<string, Promise<unknown>>();
function serialize<T>(owner: string, task: () => Promise<T>): Promise<T> {
  const next = (writes.get(owner) ?? Promise.resolve()).then(task, task);
  writes.set(owner, next);
  const release = () => { if (writes.get(owner) === next) writes.delete(owner); };
  void next.then(release, release);
  return next;
}

const SESSION_TTL = 2 * 86400000;
export const liveKey = (owner: string) => ownerKey("live", owner);
export const settleKey = (owner: string) => ownerKey("live-settle", owner);

export function loadLive(owner: string) {
  return serialize(owner, async () => {
    const stored = await readJSON<Stored>(liveKey(owner), null);
    const fresh = stored && stored.state?.v === 1 && Date.now() - stored.savedAt < SESSION_TTL ? stored : null;
    current = { owner, stored: fresh };
    emit();
    return fresh?.state ?? null;
  });
}

/** Saves the running session for this account only. `null` forgets it (finished or abandoned). */
export function saveLive(owner: string, state: LiveState | null) {
  const stored = state ? { state, savedAt: Date.now() } : null;
  if (current.owner === owner) { current = { owner, stored }; emit(); }
  return serialize(owner, () => (stored ? writeJSON(liveKey(owner), stored) : remove(liveKey(owner))));
}

export function useLiveSession(): LiveState | null {
  const owner = useOwner();
  useEffect(() => { void loadLive(owner); }, [owner]);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => (current.owner === owner ? current.stored?.state ?? null : null));
}

/* ---------------- settlement outbox ---------------- */
type Pending = { eventId: string; addedAt: number; tries: number }[];

export async function queueSettlement(owner: string, eventId: string) {
  return serialize(owner, async () => {
    const list = await readJSON<Pending>(settleKey(owner), []);
    if (!list.some((p) => p.eventId === eventId)) list.push({ eventId, addedAt: Date.now(), tries: 0 });
    await writeJSON(settleKey(owner), list.slice(-30));
  });
}

/** Tries to settle one session. Final answers leave the outbox; "held" and network errors stay for later. */
export async function settleLive(owner: string, eventId: string): Promise<LiveSettlement | null> {
  try {
    const result = await ownerRpc<LiveSettlement>(owner, "titan_live_settle_v1", { p_event: eventId });
    if (result && result.status !== "held") await dropSettlement(owner, eventId);
    return result;
  } catch (error) {
    const e = toAppError(error);
    // The session is not on the server yet (still in the offline queue): keep it. A permanent refusal leaves the outbox.
    if (e.permanent && !/LIVE_SESSION_NOT_FOUND/.test(`${e.code} ${e.message}`)) await dropSettlement(owner, eventId);
    else await bumpSettlement(owner, eventId);
    return null;
  }
}

async function dropSettlement(owner: string, eventId: string) {
  return serialize(owner, async () => {
    const list = await readJSON<Pending>(settleKey(owner), []);
    await writeJSON(settleKey(owner), list.filter((p) => p.eventId !== eventId));
  });
}
async function bumpSettlement(owner: string, eventId: string) {
  return serialize(owner, async () => {
    const list = await readJSON<Pending>(settleKey(owner), []);
    // Three days is the server's settlement window; after it the request can only answer "too_late".
    await writeJSON(settleKey(owner), list.map((p) => (p.eventId === eventId ? { ...p, tries: p.tries + 1 } : p)).filter((p) => Date.now() - p.addedAt < 3 * 86400000));
  });
}

export async function flushSettlements(owner: string) {
  const list = await readJSON<Pending>(settleKey(owner), []);
  const results: LiveSettlement[] = [];
  for (const p of list.slice(0, 10)) {
    const r = await settleLive(owner, p.eventId);
    if (r) results.push(r);
  }
  return results;
}

/* ---------------- flag and world ---------------- */
export const liveKeys = { world: (o: string) => ["live-world", o] as const };

/* The live experience exists only when the server flag screens.live is on for this player. LiveSync (mounted once in
   App) reads it for the signed-in account; screens read the result without needing the auth context. */
let flag: { owner: string | null; enabled: boolean } = { owner: null, enabled: false };
const flagListeners = new Set<() => void>();
const setFlag = (next: typeof flag) => { flag = next; flagListeners.forEach((l) => l()); };
const subscribeFlag = (l: () => void) => { flagListeners.add(l); listeners.add(l); return () => { flagListeners.delete(l); listeners.delete(l); }; };

export async function refreshLiveFlag(owner: string) {
  try {
    const flags = await ownerRpc<{ flags?: Record<string, boolean> }>(owner, "titan_feature_flags_v1", {});
    setFlag({ owner, enabled: flags?.flags?.["screens.live"] === true });
  } catch {
    if (flag.owner !== owner) setFlag({ owner, enabled: false }); // offline at start-up: stays off until the next check
  }
  return flag.enabled;
}

export function LiveSync() {
  const { owner } = useAuth();
  useEffect(() => {
    if (!owner) { setFlag({ owner: null, enabled: false }); return; }
    let alive = true;
    void refreshLiveFlag(owner).then((on) => {
      if (!alive || !on) return;
      void loadLive(owner);
      void flushSettlements(owner).catch(() => {});
    });
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void refreshLiveFlag(owner); });
    return () => { alive = false; sub.remove(); };
  }, [owner]);
  return null;
}

export const useLiveFlag = () => useSyncExternalStore(subscribeFlag, () => flag.enabled);
/** The live session saved on this phone for the signed-in account, if any. */
export const useSavedLive = () => useSyncExternalStore(subscribeFlag, () => (flag.owner && current.owner === flag.owner ? current.stored?.state ?? null : null));

export function useLiveWorld(enabled = true) {
  const owner = useOwner();
  return useQuery({ queryKey: liveKeys.world(owner), queryFn: () => ownerRpc<LiveWorldSnapshot>(owner, "titan_live_world_v1", {}), enabled });
}

export function useLiveBuild() {
  const owner = useOwner();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (building: string) => ownerRpc<LiveWorldSnapshot>(owner, "titan_live_build_v1", { p_building: building }),
    onSuccess: (world) => qc.setQueryData(liveKeys.world(owner), world),
  });
}
