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
    // A recorded GPS session is a measure, not a half-typed form: it never expires silently (the 48-hour rule is for forms).
    current = { owner, stored: stored && (isRecording(stored) || Date.now() - stored.updatedAt < 2 * DAY) ? stored : null, timer };
    emit();
  });
}

/** The draft holds a finished GPS recording (its trace already waits in the route outbox). */
const isRecording = (stored: Stored) => Boolean(stored?.draft?.gpsRouteId);

/** One draft per account. A finished GPS recording is pinned in it until it is sent or explicitly cleaned: typing in another
    sport's form must not overwrite the only copy of a measured distance and duration (the recorder is released once the draft
    is on disk). Edits of that same recording are saved as usual. Resolves to false when the write was held back: a caller that
    is about to release another measure (a second GPS recording, a TITAN LIVE session) must check it and keep its own copy. */
export function saveDraft(owner: string, draft: SessionDraft, { release = false }: { release?: boolean } = {}): Promise<boolean> {
  const stored = { draft, updatedAt: Date.now(), id: randomUUID() };
  // A form only edits: another sport's form is held back, the recording's own form may edit it, even clear its trace.
  // A caller that releases a measure (`release`: GPS or live « Garder ») never replaces a different waiting recording, same sport or not.
  const pinned = (s: Stored) => isRecording(s) && (release ? s!.draft.gpsRouteId !== draft.gpsRouteId : s!.draft.sport !== draft.sport);
  if (current.owner === owner && pinned(current.stored)) return Promise.resolve(false);
  if (current.owner === owner) {
    current = { ...current, stored };
    emit();
  }
  return serialize(owner, async () => {
    if (pinned(await readJSON<Stored>(ownerKey("draft", owner), null))) return false;
    await writeJSON(ownerKey("draft", owner), stored);
    return true;
  });
}

/** The athlete explicitly gives up the stored draft (a pinned GPS recording included). */
export function discardDraft(owner: string) {
  if (current.owner === owner) {
    current = { ...current, stored: null };
    emit();
  }
  return serialize(owner, () => remove(ownerKey("draft", owner)));
}

/** Capture the stored draft before enqueue. After it succeeds, only remove that owner's matching copy. */
export function draftCleanup(owner: string, submitted: SessionDraft) {
  const expected = current.owner === owner && current.stored?.draft === submitted ? current.stored : null;
  const timer = current.owner === owner ? current.timer : null;
  const matches = (stored: Stored) => expected?.id ? expected.id === stored?.id : JSON.stringify(expected) === JSON.stringify(stored);
  return () => serialize(owner, async () => {
    const key = ownerKey("draft", owner);
    const stored = await readJSONStrict<Stored>(key, null);
    if (!matches(stored)) {
      // This form was never stored because a GPS recording of another sport is pinned: leave that draft alone, but the stopwatch
      // of the session just saved still starts again from zero, as it always did.
      if (!expected && timer && isRecording(stored) && current.owner === owner && current.timer === timer) {
        current = { ...current, timer: { elapsed: 0, started: null } };
        emit();
        await remove(ownerKey("draft-timer", owner));
      }
      return;
    }
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
