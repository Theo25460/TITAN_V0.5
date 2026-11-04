/* The phone's own step counter (V12-01 "nos propres pas"): TITAN reads the hardware step sensor through its own small native module,
   with no Health Connect, no Google Fit and no account involved. The module only answers "what is the cumulative total since boot"
   (once, or as a stream while the app is open); the bookkeeping per day lives in stepLedger.ts.
   Everything here is injectable so tests (and the web preview) run with a fake sensor. */
import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";
import type { Reading } from "./stepLedger";

export type PedometerNative = {
  isAvailable(): boolean;
  bootEpochMs(): number;
  readTotalAsync(timeoutMs: number): Promise<number>;
  addListener(event: "onStep", cb: (e: { total: number; at: number }) => void): { remove(): void };
};

export type PermissionState = "granted" | "denied" | "blocked";
export type PedometerPermissions = { check(): Promise<boolean>; request(): Promise<PermissionState> };

/** Android 10+ asks for "physical activity"; before that the step counter needs no permission. */
export const androidPermissions: PedometerPermissions = {
  async check() {
    if (Platform.OS !== "android" || Number(Platform.Version) < 29) return true;
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
  },
  async request() {
    if (Platform.OS !== "android" || Number(Platform.Version) < 29) return "granted";
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION, {
      title: "Compter tes pas",
      message: "TITAN lit le compteur de pas de ton téléphone pour afficher tes pas du jour. Rien ne quitte ton téléphone.",
      buttonPositive: "Autoriser",
      buttonNegative: "Pas maintenant",
    });
    return r === PermissionsAndroid.RESULTS.GRANTED ? "granted" : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? "blocked" : "denied";
  },
};

export function createPedometer(native: PedometerNative | null, permissions: PedometerPermissions = androidPermissions) {
  const supported = () => {
    try {
      return !!native && native.isAvailable();
    } catch {
      return false;
    }
  };
  return {
    supported,
    permission: () => permissions.check().catch(() => false),
    request: () => permissions.request().catch((): PermissionState => "denied"),
    /** One reading of the cumulative total, or null when the sensor does not answer (no number is invented). */
    async read(timeoutMs = 2500): Promise<Reading | null> {
      if (!native || !supported()) return null;
      try {
        const total = await native.readTotalAsync(timeoutMs);
        return Number.isFinite(total) ? { total, boot: native.bootEpochMs(), at: Date.now() } : null;
      } catch {
        return null;
      }
    },
    /** Streams readings while the caller is subscribed (the app being open); returns the unsubscribe function. */
    watch(onReading: (r: Reading) => void): () => void {
      if (!native || !supported()) return () => {};
      const sub = native.addListener("onStep", (e) => {
        if (Number.isFinite(e.total)) onReading({ total: e.total, boot: native.bootEpochMs(), at: Number.isFinite(e.at) ? e.at : Date.now() });
      });
      return () => sub.remove();
    },
  };
}

export type Pedometer = ReturnType<typeof createPedometer>;

let instance: Pedometer | null = null;
export function pedometer(): Pedometer {
  if (!instance) {
    const native = Platform.OS === "android" ? (requireOptionalNativeModule("TitanPedometer") as PedometerNative | null) : null;
    instance = createPedometer(native);
  }
  return instance;
}
export const _setPedometerForTests = (p: Pedometer | null) => {
  instance = p;
};
