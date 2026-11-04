/* Offline copy of the account's training log, stored in chunks (one AsyncStorage entry per 150 sessions) so a long
   history never exceeds Android's per-entry size limit. Read at start-up: the journal and statistics are usable
   offline and appear instantly, then the server copy replaces them. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TrainingLog } from "../core/types";

const CHUNK = 150;
const metaKey = (owner: string) => `titan.logs.v1:${owner}`;
const chunkKey = (owner: string, i: number) => `titan.logs.v1.${i}:${owner}`;

export async function saveLogsCache(owner: string, logs: TrainingLog[]) {
  const chunks: [string, string][] = [];
  for (let i = 0; i * CHUNK < logs.length; i++) chunks.push([chunkKey(owner, i), JSON.stringify(logs.slice(i * CHUNK, (i + 1) * CHUNK))]);
  const previous = await readMeta(owner);
  if (chunks.length) await AsyncStorage.multiSet(chunks);
  await AsyncStorage.setItem(metaKey(owner), JSON.stringify({ chunks: chunks.length, savedAt: Date.now(), count: logs.length }));
  const stale = [];
  for (let i = chunks.length; i < (previous?.chunks ?? 0); i++) stale.push(chunkKey(owner, i));
  if (stale.length) await AsyncStorage.multiRemove(stale);
}

async function readMeta(owner: string): Promise<{ chunks: number; savedAt: number; count: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(metaKey(owner));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function readLogsCache(owner: string): Promise<{ logs: TrainingLog[]; savedAt: number } | null> {
  const meta = await readMeta(owner);
  if (!meta) return null;
  try {
    const keys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(owner, i));
    const rows = keys.length ? await AsyncStorage.multiGet(keys) : [];
    const logs: TrainingLog[] = [];
    for (const [, value] of rows) {
      if (value === null) return null;
      logs.push(...(JSON.parse(value) as TrainingLog[]));
    }
    return { logs: logs.filter((l) => !l.user_id || l.user_id === owner), savedAt: meta.savedAt };
  } catch {
    return null;
  }
}
