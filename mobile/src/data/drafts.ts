/* Session draft and stopwatch, kept on the device per account (like the website's titan_seance_draft_v3 / timer). */
import { randomUUID } from "expo-crypto";
import { useEffect, useSyncExternalStore } from "react";
import type { SessionDraft } from "../core/session";
import { ownerKey, readJSON, readJSONStrict, remove, writeJSON } from "../lib/storage";
import { useAuth } from "./auth";

const DAY = 86400000;
export type Stopwatch = { elapsed: number; started: number | null };
type Stored = { draft: SessionDraft; updatedAt: number; id?: string } | null;

let current: { owner: string | null; stored: Stored; timer: Stopwatch } = { owner: null, stored: null, timer: { elapsed: 0, started: null } };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let loadEpoch = 0;
const writes = new Map<string, Promise<unknown>>();

function serialize<T>(owner: string, task: () => Promise<T>): Promise<T> {
  const next = (writes.get(owner) ?? Promise.resolve()).then(task, task);
  writes.set(owner, next);
  const release = () => { if (writes.get(owner) === next) writes.delete(owner); };
  void next.then(release, release);
  return next;
}

export function loadDrafts(owner: string) {
  const epoch = ++loadEpoch;
  return serialize(owner, async () => {
    const stored = await readJSON<Stored>(ownerKey("draft", owner), null);
    const timer = await readJSON<Stopwatch>(ownerKey("draft-timer", owner), { elapsed: 0, started: null });
    if (epoch !== loadEpoch) return;
    current = { owner, stored: stored && Date.now() - stored.updatedAt < 2 * DAY ? stored : null, timer };
    emit();
  });
}

export function saveDraft(owner: string, draft: SessionDraft) {
  const stored = { draft, updatedAt: Date.now(), id: randomUUID() };
  if (current.owner === owner) {
    current = { ...current, stored };
    emit();
  }
  return serialize(owner, () => writeJSON(ownerKey("draft", owner), stored));
}

/** Capture the stored draft before enqueue. After it succeeds, only remove that owner's matching copy. */
export function draftCleanup(owner: string, submitted: SessionDraft) {
  const expected = current.owner === owner && current.stored?.draft === submitted ? current.stored : null;
  const timer = current.owner === owner ? current.timer : null;
  const matches = (stored: Stored) => expected?.id ? expected.id === stored?.id : JSON.stringify(expected) === JSON.stringify(stored);
  return () => serialize(owner, async () => {
    const key = ownerKey("draft", owner);
    const stored = await readJSONStrict<Stored>(key, null);
    if (!matches(stored)) return;
    if (expected) await remove(key);
    if (current.owner !== owner || !matches(current.stored)) return;
    current = { ...current, stored: null };
    if (current.timer === timer) {
      current = { ...current, timer: { elapsed: 0, started: null } };
      emit();
      await remove(ownerKey("draft-timer", owner));
    } else emit();
  });
}

export function setStopwatch(owner: string, timer: Stopwatch) {
  if (current.owner === owner) {
    current = { ...current, timer };
    emit();
  }
  void serialize(owner, () => writeJSON(ownerKey("draft-timer", owner), timer)).catch(() => {});
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
