/* Durable session queue: a session is written to the device BEFORE anything else, then sent to the server.
   - One queue per account (key carries the owner id): switching accounts can never send someone else's session.
   - The payload is frozen: a retry sends exactly the same request, and the server's receipt for that
     client_event_id makes the retry return the original result instead of creating a duplicate.
   - Network failures keep the session pending (sent again on reconnect / app resume); validation refusals stop
     the session with a visible reason instead of retrying forever. */
import { useSyncExternalStore } from "react";
import { toAppError } from "../lib/errors";
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import type { TrainingLog, TrainingPayload } from "../core/types";
import { assertOwner, submitSession, type SubmitReceipt } from "./api";

export type QueueItem = {
  key: string;
  ownerId: string;
  payload: TrainingPayload;
  status: "pending" | "error";
  reason?: string;
  queuedAt: string;
  attempts: number;
};

type Listener = () => void;

const state = { owner: null as string | null, items: [] as QueueItem[], sending: false };
let snapshot = { owner: state.owner, items: state.items, sending: state.sending };
const listeners = new Set<Listener>();
let writeChain: Promise<unknown> = Promise.resolve();
let flushing: Promise<FlushResult> | null = null;
let flushAgain = false;

function emit() {
  snapshot = { owner: state.owner, items: state.items, sending: state.sending };
  listeners.forEach((l) => l());
}

/** Serialises every storage write so two quick saves can never overwrite each other. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => {});
  return next;
}

async function persist(owner: string, items: QueueItem[]) {
  await writeJSON(ownerKey("queue", owner), items);
}

export async function loadQueue(owner: string | null) {
  state.owner = owner;
  state.items = owner ? (await readJSON<QueueItem[]>(ownerKey("queue", owner), [])).filter((i) => i && i.ownerId === owner && i.payload?.details?.client_event_id) : [];
  emit();
}

/** The session is stored durably before the promise resolves; only then may the UI celebrate. */
export function enqueue(owner: string, payload: TrainingPayload): Promise<QueueItem> {
  return serial(async () => {
    if (state.owner !== owner) throw new Error("Le compte a changé. Rien n’a été enregistré.");
    const id = payload.details.client_event_id!;
    const item: QueueItem = { key: `${owner}:${id}`, ownerId: owner, payload: JSON.parse(JSON.stringify(payload)), status: "pending", queuedAt: new Date().toISOString(), attempts: 0 };
    const items = [...state.items.filter((i) => i.key !== item.key), item];
    await persist(owner, items);
    if (state.owner === owner) {
      state.items = items;
      emit();
    }
    return item;
  });
}

function replace(owner: string, mutate: (items: QueueItem[]) => QueueItem[]) {
  return serial(async () => {
    const current = state.owner === owner ? state.items : await readJSON<QueueItem[]>(ownerKey("queue", owner), []);
    const items = mutate(current);
    await persist(owner, items);
    if (state.owner === owner) {
      state.items = items;
      emit();
    }
  });
}

export const discard = (owner: string, key: string) => replace(owner, (items) => items.filter((i) => i.key !== key));
export const retryItem = (owner: string, key: string) => replace(owner, (items) => items.map((i) => (i.key === key ? { ...i, status: "pending" as const, reason: undefined } : i)));

export type FlushResult = { sent: number; remaining: number; receipts: Record<string, SubmitReceipt>; offline: boolean };

/** Sends pending sessions one by one, in order. Single flight: concurrent calls share the same run. */
export function flushQueue(owner: string, onSent?: (eventId: string, receipt: SubmitReceipt) => void): Promise<FlushResult> {
  if (flushing) {
    // A session queued during a running send is picked up by one more pass right after it.
    flushAgain = true;
    return flushing;
  }
  const run = async (): Promise<FlushResult> => {
    const receipts: Record<string, SubmitReceipt> = {};
    let sent = 0;
    let offline = false;
    try {
      await assertOwner(owner);
    } catch {
      return { sent, remaining: state.items.length, receipts, offline };
    }
    state.sending = true;
    emit();
    try {
      for (const item of [...state.items]) {
        if (state.owner !== owner || item.ownerId !== owner || item.status !== "pending") continue;
        try {
          await assertOwner(owner);
          const receipt = await submitSession(item.payload);
          const eventId = item.payload.details.client_event_id!;
          receipts[eventId] = receipt;
          await discard(owner, item.key);
          sent++;
          onSent?.(eventId, receipt);
        } catch (e) {
          const err = toAppError(e);
          if (err.code === "AUTH_REQUIRED") break;
          await replace(owner, (items) =>
            items.map((i) => (i.key === item.key ? { ...i, attempts: i.attempts + 1, status: err.permanent ? "error" : "pending", reason: err.message } : i)),
          );
          if (!err.permanent) {
            offline = err.network;
            break;
          }
        }
      }
    } finally {
      state.sending = false;
      emit();
    }
    return { sent, remaining: state.items.length, receipts, offline };
  };
  flushing = run().finally(() => {
    flushing = null;
    if (flushAgain) {
      flushAgain = false;
      if (state.owner === owner && state.items.some((i) => i.status === "pending")) flushQueue(owner, onSent).catch(() => {});
    }
  });
  return flushing;
}

export function useQueue() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

/** Provisional journal entries for sessions not confirmed by the server yet. */
export function provisionalLogs(items: QueueItem[], confirmedIds: Set<string>): TrainingLog[] {
  return items
    .filter((i) => !confirmedIds.has(i.payload.details.client_event_id!))
    .map((i) => ({
      ...i.payload,
      id: i.payload.details.client_event_id!,
      client_event_id: i.payload.details.client_event_id,
      cat: i.payload.category,
      xp: 0,
      created_at: i.queuedAt,
      syncStatus: i.status,
      syncReason: i.reason,
    }));
}

export const queueSnapshot = () => snapshot;
