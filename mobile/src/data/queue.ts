/* Durable session queue: a session is written to the device BEFORE anything else, then sent to the server.
   - One queue per account (key carries the owner id): switching accounts can never send someone else's session.
   - The payload is frozen: a retry sends exactly the same request, and the server's receipt for that
     client_event_id makes the retry return the original result instead of creating a duplicate.
   - Network failures keep the session pending (sent again on reconnect / app resume); validation refusals stop
     the session with a visible reason instead of retrying forever. */
import { useSyncExternalStore } from "react";
import { toAppError } from "../lib/errors";
import { queueRouteLink } from "../lib/routeSync";
import { ownerKey, readJSONStrict as readJSON, writeJSON } from "../lib/storage";
import type { TrainingLog, TrainingPayload } from "../core/types";
import { assertOwner, submitSession, type SubmitReceipt } from "./api";

export type QueueItem = {
  key: string;
  ownerId: string;
  payload: TrainingPayload;
  gpsRouteId?: string;
  status: "pending" | "error";
  reason?: string;
  queuedAt: string;
  attempts: number;
};

type Listener = () => void;

const state = { owner: null as string | null, items: [] as QueueItem[] };
let snapshot = { ...state, sending: false };
const listeners = new Set<Listener>();
let writeChain: Promise<unknown> = Promise.resolve();
const flushing = new Map<string, Promise<FlushResult>>();
const flushAgain = new Set<string>();
let loadEpoch = 0;
let readyOwner: string | null = null;

function emit() {
  snapshot = { ...state, sending: state.owner !== null && flushing.has(state.owner) };
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
  const epoch = ++loadEpoch;
  readyOwner = null;
  if (state.owner !== owner) {
    state.owner = owner;
    state.items = [];
    emit();
  }
  await serial(async () => {
    const items = owner ? (await readJSON<QueueItem[]>(ownerKey("queue", owner), [])).filter((i) => i && i.ownerId === owner && i.payload?.details?.client_event_id) : [];
    if (epoch !== loadEpoch || state.owner !== owner) return;
    state.items = items;
    readyOwner = owner;
    emit();
  });
}

/** The session is stored durably before the promise resolves; only then may the UI celebrate. */
export function enqueue(owner: string, payload: TrainingPayload, gpsRouteId?: string): Promise<QueueItem> {
  return serial(async () => {
    if (state.owner !== owner) throw new Error("Le compte a changé. Rien n’a été enregistré.");
    if (readyOwner !== owner) throw new Error("Ton journal local n’a pas pu être chargé. Réessaie avant d’enregistrer une nouvelle séance.");
    const id = payload.details.client_event_id!;
    const item: QueueItem = { key: `${owner}:${id}`, ownerId: owner, payload: JSON.parse(JSON.stringify(payload)), gpsRouteId, status: "pending", queuedAt: new Date().toISOString(), attempts: 0 };
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
    const current = state.owner === owner && readyOwner === owner ? state.items : await readJSON<QueueItem[]>(ownerKey("queue", owner), []);
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

/** Sends sessions in order. Concurrent calls for the same account share the complete run. */
export function flushQueue(owner: string, onSent?: (eventId: string, receipt: SubmitReceipt) => void): Promise<FlushResult> {
  const active = () => state.owner === owner && readyOwner === owner;
  const remaining = () => active() ? state.items.length : 0;
  const hasPending = () => active() && state.items.some((item) => item.status === "pending");
  if (!hasPending()) return Promise.resolve({ sent: 0, remaining: remaining(), receipts: {}, offline: false });
  const existing = flushing.get(owner);
  if (existing) {
    flushAgain.add(owner);
    return existing;
  }
  const run = async (): Promise<FlushResult> => {
    const receipts: Record<string, SubmitReceipt> = {};
    let sent = 0;
    let offline = false;
    try {
      do {
        flushAgain.delete(owner);
        try {
          await assertOwner(owner);
        } catch {
          break;
        }
        offline = false;
        for (const item of state.items) {
          if (!active()) break;
          if (item.ownerId !== owner || item.status !== "pending") continue;
          try {
            await assertOwner(owner);
            if (!active()) break;
            const receipt = await submitSession(owner, item.payload);
            const eventId = item.payload.details.client_event_id!;
            if (item.gpsRouteId) await queueRouteLink(owner, item.gpsRouteId, eventId);
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
      } while (flushAgain.has(owner) && hasPending());
      return { sent, remaining: remaining(), receipts, offline };
    } finally {
      flushing.delete(owner);
      flushAgain.delete(owner);
      if (state.owner === owner) emit();
    }
  };
  const flight = run();
  flushing.set(owner, flight);
  emit();
  return flight;
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
