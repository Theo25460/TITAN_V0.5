/* Session draft and stopwatch, kept on the device per account (like the website's titan_seance_draft_v3 / timer). */
import { useEffect, useSyncExternalStore } from "react";
import type { SessionDraft } from "../core/session";
import { ownerKey, readJSON, remove, writeJSON } from "../lib/storage";
import { useAuth } from "./auth";

const DAY = 86400000;
export type Stopwatch = { elapsed: number; started: number | null };
type Stored = { draft: SessionDraft; updatedAt: number } | null;

let current: { owner: string | null; stored: Stored; timer: Stopwatch } = { owner: null, stored: null, timer: { elapsed: 0, started: null } };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let loadEpoch = 0;

export async function loadDrafts(owner: string) {
  const epoch = ++loadEpoch;
  const stored = await readJSON<Stored>(ownerKey("draft", owner), null);
  const timer = await readJSON<Stopwatch>(ownerKey("draft-timer", owner), { elapsed: 0, started: null });
  if (epoch !== loadEpoch) return;
  current = { owner, stored: stored && Date.now() - stored.updatedAt < 2 * DAY ? stored : null, timer };
  emit();
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function saveDraft(owner: string, draft: SessionDraft) {
  const stored = { draft, updatedAt: Date.now() };
  if (current.owner === owner) {
    current = { ...current, stored };
    emit();
  }
  clearTimeout(saveTimers.get(owner));
  saveTimers.set(owner, setTimeout(() => {
    saveTimers.delete(owner);
    writeJSON(ownerKey("draft", owner), stored).catch(() => {});
  }, 250));
}

export async function clearDraft(owner: string) {
  clearTimeout(saveTimers.get(owner));
  saveTimers.delete(owner);
  if (current.owner === owner) {
    current = { ...current, stored: null, timer: { elapsed: 0, started: null } };
    emit();
  }
  await remove(ownerKey("draft", owner));
  await remove(ownerKey("draft-timer", owner));
}

export function setStopwatch(owner: string, timer: Stopwatch) {
  if (current.owner === owner) {
    current = { ...current, timer };
    emit();
  }
  writeJSON(ownerKey("draft-timer", owner), timer).catch(() => {});
}

export const elapsedMs = (t: Stopwatch) => t.elapsed + (t.started ? Math.max(0, Date.now() - t.started) : 0);

function useStore() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function useDrafts() {
  const { owner } = useAuth();
  const store = useStore();
  useEffect(() => {
    if (owner && store.owner !== owner) loadDrafts(owner).catch(() => {});
  }, [owner, store.owner]);
  return store.owner === owner ? { ...store, ready: true } : { owner, stored: null, timer: { elapsed: 0, started: null }, ready: false };
}

export function useDraftSport() {
  return useDrafts().stored?.draft ?? null;
}
