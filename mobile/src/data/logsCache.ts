/* Offline copy of the account's training log, stored in chunks (one AsyncStorage entry per 150 sessions) so a long
   history never exceeds Android's per-entry size limit. Read at start-up: the journal and statistics are usable
   offline and appear instantly, then the server copy replaces them.
   V1.6.6 — Journal longue durée: the rows are kept sorted by id, so a correction, an archive or a confirmation changes one chunk and
   only the chunks that changed are written again (a 10 000-session history was rewritten whole, 18 MB of JSON, on every refresh).
   The meta entry keeps the coverage of the copy (src/core/web/history-window.js): complete or not, from which date, checked when. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HistoryCoverage } from "../core";
import type { TrainingLog } from "../core/types";

const CHUNK = 150;
const metaKey = (owner: string) => `titan.logs.v1:${owner}`;
const chunkKey = (owner: string, i: number) => `titan.logs.v1.${i}:${owner}`;
type Meta = { chunks: number; savedAt: number; count: number; coverage?: HistoryCoverage | null; sorted?: boolean };

const byId = (a: TrainingLog, b: TrainingLog) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const rowSig = (r: TrainingLog & { status?: string; is_suspicious?: boolean }) =>
  `${r.id}~${r.revision ?? ""}~${r.syncStatus ?? ""}~${r.archived_at ?? ""}~${r.status ?? ""}~${r.is_suspicious ? 1 : 0}~${r.date ?? ""}~${r.val ?? ""}~${r.xp ?? ""}`;
/** What this process last wrote or read for each owner, chunk by chunk. */
const written = new Map<string, string[]>();
export let lastWrite = { chunks: 0, wrote: 0 };

export async function saveLogsCache(owner: string, logs: TrainingLog[], coverage?: HistoryCoverage | null) {
  const rows = [...logs].sort(byId);
  const blocks: TrainingLog[][] = [];
  for (let i = 0; i * CHUNK < rows.length; i++) blocks.push(rows.slice(i * CHUNK, (i + 1) * CHUNK));
  const sigs = blocks.map((b) => b.map(rowSig).join("|"));
  const previous = await readMeta(owner);
  const known = previous?.sorted ? written.get(owner) : undefined;
  const chunks: [string, string][] = [];
  blocks.forEach((b, i) => {
    if (known && known[i] === sigs[i]) return;
    chunks.push([chunkKey(owner, i), JSON.stringify(b)]);
  });
  if (chunks.length) await AsyncStorage.multiSet(chunks);
  const meta: Meta = { chunks: blocks.length, savedAt: Date.now(), count: rows.length, coverage: coverage === undefined ? previous?.coverage ?? null : coverage, sorted: true };
  await AsyncStorage.setItem(metaKey(owner), JSON.stringify(meta));
  const stale = [];
  for (let i = blocks.length; i < (previous?.chunks ?? 0); i++) stale.push(chunkKey(owner, i));
  if (stale.length) await AsyncStorage.multiRemove(stale);
  written.set(owner, sigs);
  lastWrite = { chunks: blocks.length, wrote: chunks.length };
}

async function readMeta(owner: string): Promise<Meta | null> {
  try {
    const raw = await AsyncStorage.getItem(metaKey(owner));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** The copy and its coverage. A copy saved before V1.6.6 has none: it was only ever written after a complete read, so it is a
    complete copy whose check date is unknown (the next refresh verifies it by manifest). */
export async function readLogsCache(owner: string): Promise<{ logs: TrainingLog[]; savedAt: number; coverage: HistoryCoverage | null } | null> {
  const meta = await readMeta(owner);
  if (!meta) return null;
  try {
    const keys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(owner, i));
    const rows = keys.length ? await AsyncStorage.multiGet(keys) : [];
    const logs: TrainingLog[] = [];
    const sigs: string[] = [];
    for (const [, value] of rows) {
      if (value === null) return null;
      const block = JSON.parse(value) as TrainingLog[];
      sigs.push(block.map(rowSig).join("|"));
      logs.push(...block);
    }
    if (meta.sorted) written.set(owner, sigs);
    const coverage = meta.coverage ?? (logs.length ? { complete: true, count: logs.length, total: null, oldest: null, newest: null, checkedAt: null, mode: "legacy" } : null);
    return { logs: logs.filter((l) => !l.user_id || l.user_id === owner), savedAt: meta.savedAt, coverage };
  } catch {
    return null;
  }
}
