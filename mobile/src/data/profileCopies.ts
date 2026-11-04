import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Preferences } from "./api";
import type { Privacy, Profile } from "../core/types";

const PREFIX = "titan.preferences-pending.v1:";
export type PreferenceEdit = { prefs: Preferences; username?: string; privacy?: Privacy };
export type ProfileCopy = { key: string; owner: string; at: string; base: PreferenceEdit | null; edit: PreferenceEdit };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export const preferenceSignature = (value: unknown) => JSON.stringify(canonical(value));
export function preferenceBase(profile: Profile, edit: PreferenceEdit): PreferenceEdit {
  const user = profile.game_state?.user ?? {};
  return { prefs: Object.fromEntries(Object.keys(edit.prefs).map(k => [k, user[k]])), ...(edit.username !== undefined ? { username: profile.username ?? undefined } : {}), ...(edit.privacy !== undefined ? { privacy: profile.privacy ?? {} } : {}) };
}
export async function listProfileCopies(owner: string): Promise<ProfileCopy[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX) && k.endsWith(`:${owner}`));
  const rows = await AsyncStorage.multiGet(keys);
  return rows.flatMap(([key, raw]) => {
    if (raw === null) return [];
    const copy = JSON.parse(raw) as ProfileCopy;
    if (copy.owner !== owner || copy.key !== key || !copy.edit?.prefs || !("base" in copy)) throw new Error("PROFILE_COPY_INVALID");
    return [copy];
  }).sort((a, b) => a.at.localeCompare(b.at));
}
/** Storage failure prevents sending: never acknowledge an edit we cannot recover. */
export async function protectPreferences(owner: string, edit: PreferenceEdit, base: PreferenceEdit | null): Promise<ProfileCopy> {
  const key = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}:${owner}`;
  const copy = JSON.parse(JSON.stringify({ key, owner, at: new Date().toISOString(), base, edit })) as ProfileCopy;
  await AsyncStorage.setItem(key, JSON.stringify(copy));
  return copy;
}
export async function removeProfileCopy(owner: string, key: string) {
  if (!key.startsWith(PREFIX) || !key.endsWith(`:${owner}`)) throw new Error("PROFILE_MISMATCH");
  await AsyncStorage.removeItem(key);
}
function merge(base: unknown, local: unknown, cloud: unknown): unknown {
  if (preferenceSignature(base) === preferenceSignature(local)) return cloud;
  if (base && local && typeof base === "object" && typeof local === "object" && !Array.isArray(base) && !Array.isArray(local)) {
    const b = base as Record<string, unknown>, l = local as Record<string, unknown>;
    const out: Record<string, unknown> = cloud && typeof cloud === "object" && !Array.isArray(cloud) ? { ...cloud } : {};
    for (const key of new Set([...Object.keys(b), ...Object.keys(l)])) {
      const value = merge(b[key], l[key], out[key]);
      if (value === undefined) delete out[key]; else out[key] = value;
    }
    return out;
  }
  return local;
}
/** Only locally changed fields win; independent cloud preferences are retained. */
export function mergePreferenceCopy(copy: ProfileCopy, fresh: Profile): PreferenceEdit {
  if (copy.owner !== fresh.id) throw new Error("PROFILE_MISMATCH");
  if (copy.base === null) return copy.edit;
  return merge(copy.base, copy.edit, preferenceBase(fresh, copy.edit)) as PreferenceEdit;
}
