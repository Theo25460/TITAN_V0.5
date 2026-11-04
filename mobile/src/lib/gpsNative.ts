/* Android glue for the GPS recorder: a foreground location service (visible notification, started by the athlete),
   fed to the pure recorder in gpsRecorder.ts. Imported by index.ts so the background task is defined before React mounts. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { createRecorder, KEY_ACTIVE, type Deps, type Recording } from "./gpsRecorder";
import type { Fix } from "./gpsTrack";

export const GPS_TASK = "titan-gps-recording";

const deps: Deps = {
  read: async (key) => {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Recording) : null;
    } catch {
      return null;
    }
  },
  write: async (key, value) => {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  startUpdates: async () => {
    await Location.startLocationUpdatesAsync(GPS_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,
      distanceInterval: 3,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "TITAN enregistre ta séance",
        notificationBody: "Suivi GPS actif · ouvre TITAN pour mettre en pause ou terminer.",
        notificationColor: "#3DD9E8",
        killServiceOnDestroy: true,
      },
    });
  },
  stopUpdates: async () => {
    if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false)) await Location.stopLocationUpdatesAsync(GPS_TASK);
  },
  updatesRunning: () => Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false),
  now: () => Date.now(),
};

export const recorder = createRecorder(deps);

const toFix = (l: Location.LocationObject): Fix => ({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  alt: l.coords.altitude ?? null,
  altAcc: l.coords.altitudeAccuracy ?? null,
  acc: l.coords.accuracy ?? null,
  t: l.timestamp,
});

/** The recording is written under the account that started it, whoever is signed in when the batch arrives. */
export const setActiveOwner = (owner: string | null) => (owner ? AsyncStorage.setItem(KEY_ACTIVE, owner) : AsyncStorage.removeItem(KEY_ACTIVE));
export const getActiveOwner = () => AsyncStorage.getItem(KEY_ACTIVE);

if (!TaskManager.isTaskDefined(GPS_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(GPS_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const owner = await getActiveOwner();
    if (owner) await recorder.append(owner, data.locations.map(toFix));
  });
}

export type StartResult = "ok" | "denied" | "blocked" | "unavailable";

/** Asks for the foreground location permission (the only one needed) right when the athlete taps Démarrer. */
export async function ensureLocationPermission(): Promise<StartResult> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) return "unavailable";
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) return "ok";
    const res = await Location.requestForegroundPermissionsAsync();
    return res.granted ? "ok" : res.canAskAgain ? "denied" : "blocked";
  } catch {
    return "unavailable";
  }
}

export const hasLocationPermission = () => Location.getForegroundPermissionsAsync().then((p) => p.granted).catch(() => false);

/** When the signed-in account changes (or signs out), a recording that belongs to another account is paused and its
    foreground service stopped: nothing keeps tracking someone else's phone session under a new account. */
export async function guardAccount(owner: string | null) {
  const active = await getActiveOwner();
  if (!active || active === owner) return;
  await recorder.pause(active).catch(() => {});
  await setActiveOwner(null);
}
