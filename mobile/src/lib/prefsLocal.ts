/* Device-only preferences (not account data): haptic feedback. */
import { readJSON, writeJSON } from "./storage";
import { setHapticsEnabled } from "./haptics";

const KEY = "titan.device-prefs.v1";
export type DevicePrefs = { haptics: boolean };
export async function loadDevicePrefs(): Promise<DevicePrefs> {
  const p = await readJSON<DevicePrefs>(KEY, { haptics: true });
  setHapticsEnabled(p.haptics !== false);
  return p;
}
export async function saveDevicePrefs(p: DevicePrefs) {
  setHapticsEnabled(p.haptics);
  await writeJSON(KEY, p);
}
loadDevicePrefs().catch(() => {});
