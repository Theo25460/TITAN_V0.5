/* Preview only (TITAN_PREVIEW=1, web): the GPS recorder on the browser's storage, with a location service that is « running » and
   never delivers anything. The screens are then reviewed on a recording seeded by scripts/gps-preview-shots.mjs. Never part of the
   Android build. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRecorder, KEY_ACTIVE, type Deps, type Recording } from "../../src/lib/gpsRecorder";
import { loadRouteForFollow } from "../../src/lib/routeLibrary";

export const GPS_TASK = "titan-gps-recording";
export const ALERT_STEP = [0, 160, 120, 160];
export const ALERT_OFF = [0, 600];
const deps: Deps = {
  read: async (key) => {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Recording) : null;
  },
  write: async (key, value) => {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  startUpdates: async () => {},
  stopUpdates: async () => {},
  updatesRunning: async () => true,
  now: () => Date.now(),
  loadRoute: loadRouteForFollow,
  alert: () => {},
};
export const recorder = createRecorder(deps);
export const toFix = (l: unknown) => l;
export const toRaw = (l: unknown) => l;
export const getActiveOwner = () => AsyncStorage.getItem(KEY_ACTIVE);
export const setActiveOwner = async (owner: string | null) => {
  if (owner) await AsyncStorage.setItem(KEY_ACTIVE, owner);
  else await AsyncStorage.removeItem(KEY_ACTIVE);
};
export type StartResult = "ok" | "denied" | "blocked" | "unavailable";
export const ensureLocationPermission = async (): Promise<StartResult> => "ok";
export const hasLocationPermission = async () => true;
export const guardAccount = async () => {};
