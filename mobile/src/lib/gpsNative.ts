/* Android glue for the GPS recorder: a foreground location service (visible notification, started by the athlete),
   fed to the pure recorder in gpsRecorder.ts. Imported by index.ts so the background task is defined before React mounts. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { createRecorder, KEY_ACTIVE, type Deps, type Recording } from "./gpsRecorder";
import { compactFix, type Fix } from "./gpsTrack";

export const GPS_TASK = "titan-gps-recording";

const deps: Deps = {
  // A recording that cannot be read is NOT an absent recording: answering null here would offer « Démarrer » and let a new start
  // overwrite the trace. The failure is passed on: the screen says the recording cannot be read and offers to retry.
  read: async (key) => {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Recording) : null;
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

export const toFix = (l: Location.LocationObject): Fix => compactFix({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  alt: l.coords.altitude ?? null,
  altAcc: l.coords.altitudeAccuracy ?? null,
  acc: l.coords.accuracy ?? null,
  t: l.timestamp,
});

/** The recording is written under the account that started it, whoever is signed in when the batch arrives. */
export const getActiveOwner = () => AsyncStorage.getItem(KEY_ACTIVE);
let ownerWrites: Promise<void> = Promise.resolve();
export function setActiveOwner(owner: string | null, expected?: string) {
  const next = ownerWrites.then(async () => {
    if (expected !== undefined && await getActiveOwner() !== expected) return;
    if (owner) await AsyncStorage.setItem(KEY_ACTIVE, owner);
    else await AsyncStorage.removeItem(KEY_ACTIVE);
  });
  ownerWrites = next.catch(() => {});
  return next;
}

if (!TaskManager.isTaskDefined(GPS_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(GPS_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    try {
      const owner = await getActiveOwner();
      if (owner) await recorder.append(owner, data.locations.map(toFix));
    } catch {
      // The store did not answer for this batch. Nothing is overwritten; the next batch is written normally.
    }
  });
}

export type StartResult = "ok" | "denied" | "blocked" | "unavailable";

/** Asks for the foreground location permission (the only one needed) right when the athlete taps Démarrer. */
export async function ensureLocationPermission(explain?: () => Promise<boolean>): Promise<StartResult> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) return "unavailable";
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) return "ok";
    if (!cur.canAskAgain) return "blocked";
    if (explain && !(await explain())) return "denied";
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
  await recorder.reconcile(active).catch(() => {});
  await recorder.pause(active).catch(() => {});
  // Even when the recording could not be read (so not paused), the location service of the previous account never keeps running.
  await deps.stopUpdates().catch(() => {});
  await setActiveOwner(null, active);
}
