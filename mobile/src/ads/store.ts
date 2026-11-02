/* The frequency state lives on the phone, per account, so it survives restarts and never leaks to another account. */
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { freshState, type AdState } from "./policy";

export async function loadAdState(owner: string): Promise<AdState> {
  const s = await readJSON<AdState>(ownerKey("ads", owner), freshState());
  return s && s.v === 1 ? s : freshState();
}
export async function saveAdState(owner: string, s: AdState) {
  await writeJSON(ownerKey("ads", owner), s).catch(() => {});
}
