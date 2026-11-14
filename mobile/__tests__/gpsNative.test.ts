/* The Android glue of the GPS recorder, with the location service and the task manager faked and the real key-value store mock.
   What is proved here is what the pure recorder cannot see: a recording that cannot be READ is never treated as absent
   (a new start would overwrite it), what is stored for a fix is compact, and an account change always stops the service. */
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockLocation = { running: false, started: 0, stopped: 0 };
let mockTask: ((body: { data?: unknown; error?: unknown }) => Promise<void>) | null = null;
jest.mock("expo-location", () => ({
  Accuracy: { BestForNavigation: 6 },
  ActivityType: { Fitness: 3 },
  startLocationUpdatesAsync: jest.fn(async () => { mockLocation.running = true; mockLocation.started++; }),
  stopLocationUpdatesAsync: jest.fn(async () => { mockLocation.running = false; mockLocation.stopped++; }),
  hasStartedLocationUpdatesAsync: jest.fn(async () => mockLocation.running),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
}));
jest.mock("expo-task-manager", () => ({
  isTaskDefined: () => false,
  defineTask: (_name: string, fn: (body: { data?: unknown; error?: unknown }) => Promise<void>) => { mockTask = fn; },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { recorder, setActiveOwner, getActiveOwner, guardAccount, toFix } = require("../src/lib/gpsNative") as typeof import("../src/lib/gpsNative");
const { recKey } = require("../src/lib/gpsRecorder") as typeof import("../src/lib/gpsRecorder");
/* eslint-enable @typescript-eslint/no-require-imports */

const T0 = Date.now();
const location = (i: number) => ({ timestamp: T0 + i * 2000 + 0.4, coords: { latitude: 48.85 + i * 0.00009123456789, longitude: 2.3522198765432, altitude: Math.fround(100.2), altitudeAccuracy: Math.fround(1.3333334), accuracy: Math.fround(4.288), heading: 0, speed: 3 } });
const getItem = AsyncStorage.getItem as jest.Mock;
const stored = async (owner: string) => JSON.parse((await AsyncStorage.getItem(recKey(owner))) as string);

beforeEach(async () => {
  await AsyncStorage.clear();
  mockLocation.running = false;
  mockLocation.started = 0;
  mockLocation.stopped = 0;
});

test("the background task writes compact fixes under the account that started the recording", async () => {
  await setActiveOwner("owner-a");
  await recorder.start("owner-a", "running");
  await mockTask!({ data: { locations: [location(1), location(2)] } });
  const rec = await stored("owner-a");
  expect(rec.track.segs[0]).toEqual([
    { lat: 48.850091, lon: 2.35222, alt: 100.2, altAcc: 1.3, acc: 4.3, t: T0 + 2000 },
    { lat: 48.850182, lon: 2.35222, alt: 100.2, altAcc: 1.3, acc: 4.3, t: T0 + 4000 },
  ]);
  expect(toFix(location(1) as never)).toEqual(rec.track.segs[0][0]);
});

test("a recording the phone cannot read back is not an absent recording: nothing starts over it, nothing is overwritten", async () => {
  await setActiveOwner("owner-a");
  await recorder.start("owner-a", "running");
  await mockTask!({ data: { locations: [location(1), location(2), location(3)] } });
  const before = await AsyncStorage.getItem(recKey("owner-a"));
  const real = getItem.getMockImplementation()!;
  // What Android answers for a row larger than its read window, or for a store that is briefly unavailable.
  getItem.mockImplementation(async (key: string) => {
    if (key === recKey("owner-a")) throw new Error("Row too big to fit into CursorWindow");
    return real(key);
  });
  try {
    await expect(recorder.load("owner-a")).rejects.toThrow("CursorWindow");
    await expect(recorder.reconcile("owner-a")).rejects.toThrow("CursorWindow");
    await expect(recorder.start("owner-a", "cycling")).rejects.toThrow("CursorWindow");
    // The background batch is dropped without an unhandled failure, and without writing anything over the trace.
    await expect(mockTask!({ data: { locations: [location(4)] } })).resolves.toBeUndefined();
  } finally {
    getItem.mockImplementation(real);
  }
  expect(await AsyncStorage.getItem(recKey("owner-a"))).toBe(before);
  expect((await recorder.load("owner-a"))?.track.segs[0]).toHaveLength(3);
  expect(mockLocation.started).toBe(1);
});

test("a damaged recording is reported, never replaced by a fresh one", async () => {
  await AsyncStorage.setItem(recKey("owner-a"), "{\"v\":1,\"owner\":\"owner-a\",\"status\":\"recor");
  await expect(recorder.start("owner-a", "running")).rejects.toThrow();
  expect(await AsyncStorage.getItem(recKey("owner-a"))).toContain("recor");
  expect(mockLocation.started).toBe(0);
});

test("an account change stops the location service even when the previous recording cannot be read", async () => {
  await setActiveOwner("owner-a");
  await recorder.start("owner-a", "running");
  expect(mockLocation.running).toBe(true);
  const real = getItem.getMockImplementation()!;
  getItem.mockImplementation(async (key: string) => {
    if (key === recKey("owner-a")) throw new Error("store unavailable");
    return real(key);
  });
  try {
    await guardAccount("owner-b");
  } finally {
    getItem.mockImplementation(real);
  }
  expect(mockLocation.running).toBe(false);
  expect(await getActiveOwner()).toBeNull();
  // The trace of the first account is still there for its owner.
  expect((await stored("owner-a")).owner).toBe("owner-a");
});

test("an account change pauses a readable recording and leaves the same account alone", async () => {
  await setActiveOwner("owner-a");
  await recorder.start("owner-a", "running");
  await guardAccount("owner-a");
  expect(mockLocation.running).toBe(true);
  await guardAccount(null);
  expect(mockLocation.running).toBe(false);
  expect((await stored("owner-a")).status).toBe("paused");
  expect(await getActiveOwner()).toBeNull();
});
