import * as SecureStore from "expo-secure-store";

/* Supabase session storage backed by the Android Keystore (expo-secure-store).
   Values are split in chunks so a long session (access + refresh token) never hits a per-entry size limit. */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

async function removeChunks(key: string, from: number) {
  for (let i = from; i < 64; i++) {
    const k = `${key}.${i}`;
    const exists = await SecureStore.getItemAsync(k);
    if (exists === null) break;
    await SecureStore.deleteItemAsync(k);
  }
}

export const secureSessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const key = safeKey(name);
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(name: string, value: string): Promise<void> {
    const key = safeKey(name);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, parts[i]);
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
    await removeChunks(key, parts.length);
  },
  async removeItem(name: string): Promise<void> {
    const key = safeKey(name);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await removeChunks(key, 0);
  },
};
