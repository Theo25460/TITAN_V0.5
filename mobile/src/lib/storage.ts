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
export async function remove(key: string) {
  await AsyncStorage.removeItem(key);
}
export const ownerKey = (scope: string, owner: string) => `titan.${scope}.v1:${owner}`;

/** Removes every local trace of an account except its unsent sessions (kept so nothing is lost on sign-out). */
export async function forgetAccountCache(owner: string, { keepQueue = true }: { keepQueue?: boolean } = {}) {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.endsWith(`:${owner}`) && !(keepQueue && (k.startsWith("titan.queue.") || k.startsWith("titan.draft."))));
  if (mine.length) await AsyncStorage.multiRemove(mine);
}
