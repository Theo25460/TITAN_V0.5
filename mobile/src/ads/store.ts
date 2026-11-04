/* The frequency state lives on the phone, per account, so it survives restarts and never leaks to another account. */
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { freshState, type AdState } from "./policy";

export async function loadAdState(owner: string): Promise<AdState> {
  const s = await readJSON<AdState>(ownerKey("ads", owner), freshState());
  return s && s.v === 1 ? s : freshState();
}
export async function saveAdState(owner: string, s: AdState) {
  await writeJSON(ownerKey("ads", owner), s);
}

// Serialise each account's read/modify/write operations: overlapping result screens must not lose counts or caps.
const pending = new Map<string, Promise<unknown>>();
export function updateAdState(owner: string, update: (s: AdState) => AdState): Promise<AdState> {
  const task = (pending.get(owner) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const next = update(await loadAdState(owner));
    await saveAdState(owner, next);
    return next;
  });
  pending.set(owner, task);
  void task.finally(() => { if (pending.get(owner) === task) pending.delete(owner); }).catch(() => {});
  return task;
}
