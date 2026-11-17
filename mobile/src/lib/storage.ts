import AsyncStorage from "@react-native-async-storage/async-storage";

/* Local, per-account storage. Every key that holds account data carries the owner id so switching accounts on the
   same phone can never show or send another person's data. */
export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
/** Durable outboxes must distinguish a missing key from an unreadable key before any read-modify-write. */
export async function readJSONStrict<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw) as T;
}
export async function remove(key: string) {
  await AsyncStorage.removeItem(key);
}
export const ownerKey = (scope: string, owner: string) => `titan.${scope}.v1:${owner}`;

/* What an ordinary sign-out keeps on the phone for the account, because it exists nowhere else: unsent sessions and preferences, drafts,
   the GPS recording and unsent routes, and TITAN's own step counter (the daily ledger, its on/off choice, the personal goal).
   Every key carries the owner id, so another account on the same phone never reads them. */
const KEPT_ON_SIGN_OUT = [
  "titan.preferences-pending.", "titan.queue.", "titan.draft.", "titan.gps.v1", "titan.routes-outbox.", "titan.routes-links.", "titan.routes-await-session.",
  "titan.pedometer.", "titan.pedometer-on.", "titan.steps-goal.",
];

type ErasureListener = (owner: string) => void;
const erasureListeners = new Set<ErasureListener>();
/** A store that keeps an account's data in memory and writes it back later (the step counter) registers here: once the account is
    erased, it must drop that memory at once, or a late save would put the erased data back on the phone. */
export function onAccountErased(listener: ErasureListener): () => void {
  erasureListeners.add(listener);
  return () => { erasureListeners.delete(listener); };
}

/** Sign-out (default): removes the account's cached copies and keeps what exists only on this phone (see KEPT_ON_SIGN_OUT).
    Account deletion (`keepQueue: false`): removes every local trace of the account, with nothing kept. */
export async function forgetAccountCache(owner: string, { keepQueue = true }: { keepQueue?: boolean } = {}) {
  if (!keepQueue) erasureListeners.forEach((listener) => { try { listener(owner); } catch { /* the keys are removed below in any case */ } });
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.endsWith(`:${owner}`) && !(keepQueue && KEPT_ON_SIGN_OUT.some((prefix) => k.startsWith(prefix))));
  if (mine.length) await AsyncStorage.multiRemove(mine);
}
