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

export async function loadDrafts(owner: string) {
  const stored = await readJSON<Stored>(ownerKey("draft", owner), null);
  const timer = await readJSON<Stopwatch>(ownerKey("draft-timer", owner), { elapsed: 0, started: null });
  current = { owner, stored: stored && Date.now() - stored.updatedAt < 2 * DAY ? stored : null, timer };
  emit();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function saveDraft(owner: string, draft: SessionDraft) {
  current = { ...current, stored: { draft, updatedAt: Date.now() } };
  emit();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeJSON(ownerKey("draft", owner), current.stored).catch(() => {});
  }, 250);
}

export async function clearDraft(owner: string) {
  clearTimeout(saveTimer);
  current = { ...current, stored: null, timer: { elapsed: 0, started: null } };
  emit();
  await remove(ownerKey("draft", owner));
  await remove(ownerKey("draft-timer", owner));
}

export function setStopwatch(owner: string, timer: Stopwatch) {
  current = { ...current, timer };
  emit();
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
  return store.owner === owner ? store : { owner, stored: null, timer: { elapsed: 0, started: null } };
}

export function useDraftSport() {
  return useDrafts().stored?.draft ?? null;
}
