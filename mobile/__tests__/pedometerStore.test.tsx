import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { _resetPedometerStoreForTests, usePedometer } from "../src/data/pedometer";
import { _setPedometerForTests, createPedometer, type PedometerNative } from "../src/lib/pedometer";
import { forgetAccountCache } from "../src/lib/storage";

let mockOwner = "owner-a";
jest.mock("../src/data/auth", () => ({ useOwner: () => mockOwner }));

const BOOT = Date.now() - 3_600_000;
function fakeSensor(initial = 1000) {
  let total = initial;
  const listeners = new Set<(e: { total: number; at: number }) => void>();
  const native: PedometerNative = {
    isAvailable: () => true,
    bootEpochMs: () => BOOT,
    readTotalAsync: async () => total,
    addListener: (_e, cb) => { listeners.add(cb); return { remove: () => listeners.delete(cb) }; },
  };
  return { native, walk: (n: number) => { total += n; listeners.forEach((l) => l({ total, at: Date.now() })); }, closedWalk: (n: number) => { total += n; }, listeners };
}
const perms = (granted: boolean) => ({ check: async () => granted, request: async () => (granted ? ("granted" as const) : ("denied" as const)) });

beforeEach(async () => {
  _resetPedometerStoreForTests();
  await AsyncStorage.clear();
  mockOwner = "owner-a";
});

describe("TITAN pedometer store", () => {
  test("off by default: nothing is read until the person switches the counter on, and the permission is asked only then", async () => {
    const s = fakeSensor();
    _setPedometerForTests(createPedometer(s.native, perms(false)));
    const { result } = renderHook(() => usePedometer());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.enabled).toBe(false);
    expect(result.current.supported).toBe(true);
    expect(s.listeners.size).toBe(0);
    let r = "";
    await act(async () => { r = await result.current.enable(); });
    expect(r).toBe("denied");
    expect(result.current.enabled).toBe(false);
    expect(result.current.permission).toBe("denied");
  });

  test("once on, the number moves as the sensor streams, and survives a restart of the app", async () => {
    const s = fakeSensor(5000);
    _setPedometerForTests(createPedometer(s.native, perms(true)));
    const { result, unmount } = renderHook(() => usePedometer());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.enable(); });
    await waitFor(() => expect(s.listeners.size).toBe(1));
    act(() => s.walk(30));
    act(() => s.walk(25));
    expect(result.current.ledger.days[Object.keys(result.current.ledger.days)[0]!]).toBe(55);
    expect(result.current.liveAt).not.toBeNull();
    unmount(); // the app leaves: the sensor stream is dropped and the ledger is written
    expect(s.listeners.size).toBe(0);

    // The person walks 400 steps with TITAN closed, then opens it again.
    s.closedWalk(400);
    // Two hours really passed while the app was closed (the plausibility cap is per hour elapsed).
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const key = "titan.pedometer.v1:owner-a";
    const stored = JSON.parse((await AsyncStorage.getItem(key))!);
    stored.lastAt -= 2 * 3_600_000;
    await AsyncStorage.setItem(key, JSON.stringify(stored));
    _resetPedometerStoreForTests();
    const again = renderHook(() => usePedometer());
    await waitFor(() => expect(again.result.current.ready).toBe(true));
    await waitFor(() => expect(Object.values(again.result.current.ledger.days).reduce((a, b) => a + b, 0)).toBe(455));
  });

  test("leaving TITAN while the stored steps are still being read never replaces them with an empty ledger", async () => {
    const key = "titan.pedometer.v1:owner-a";
    const history = { v: 1, boot: BOOT, last: 900, lastAt: Date.now() - 60_000, days: { "2026-11-01": 8123, "2026-11-02": 6400 }, est: {}, firstAt: Date.now() - 20 * 86_400_000 };
    await AsyncStorage.setItem(key, JSON.stringify(history));
    await AsyncStorage.setItem("titan.pedometer-on.v1:owner-a", "true");
    const s = fakeSensor(1000);
    _setPedometerForTests(createPedometer(s.native, perms(true)));
    // The store answers late: the person opens TITAN and leaves it at once (or the screen that shows the steps is closed).
    const getItem = AsyncStorage.getItem as jest.Mock;
    const real = getItem.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    getItem.mockImplementation(async (k: string) => { if (k === key) await gate; return real(k); });
    try {
      const { result, unmount } = renderHook(() => usePedometer());
      expect(result.current.ready).toBe(false);
      unmount();
      await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
      expect(JSON.parse((await real(key)) as string).days).toEqual(history.days);
    } finally {
      release();
      getItem.mockImplementation(real);
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(JSON.parse((await AsyncStorage.getItem(key))!).days["2026-11-01"]).toBe(8123);
    // Opened again: the history is there and the 100 steps taken since the last reading are added, not lost.
    _resetPedometerStoreForTests();
    const again = renderHook(() => usePedometer());
    await waitFor(() => expect(again.result.current.ready).toBe(true));
    expect(again.result.current.ledger.days["2026-11-01"]).toBe(8123);
    await waitFor(() => expect(Object.values(again.result.current.ledger.days).reduce((a, b) => a + b, 0)).toBe(8123 + 6400 + 100));
  });

  test("another account on the same phone never sees these steps", async () => {
    const s = fakeSensor();
    _setPedometerForTests(createPedometer(s.native, perms(true)));
    const a = renderHook(() => usePedometer());
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    await act(async () => { await a.result.current.enable(); });
    a.unmount();
    _resetPedometerStoreForTests();
    mockOwner = "owner-b";
    const b = renderHook(() => usePedometer());
    await waitFor(() => expect(b.result.current.ready).toBe(true));
    expect(b.result.current.enabled).toBe(false);
    expect(b.result.current.ledger.firstAt).toBeNull();
  });

  test("an ordinary sign-out keeps the steps counted on this phone, the counter's on/off choice and the goal; the cached copies still go", async () => {
    const s = fakeSensor(5000);
    _setPedometerForTests(createPedometer(s.native, perms(true)));
    const first = renderHook(() => usePedometer());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await act(async () => { await first.result.current.enable(); });
    await waitFor(() => expect(s.listeners.size).toBe(1));
    act(() => s.walk(120));
    first.unmount(); // signing out leaves the screens: the ledger is written
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await AsyncStorage.setItem("titan.steps-goal.v1:owner-a", "8000");
    await AsyncStorage.setItem("titan.steps-sync.v1:owner-a", "1");
    await AsyncStorage.setItem("titan.profile.v1:owner-a", "{\"cached\":true}");

    await forgetAccountCache("owner-a"); // what signOut() calls

    expect(Object.values(JSON.parse((await AsyncStorage.getItem("titan.pedometer.v1:owner-a"))!).days)).toEqual([120]);
    expect(await AsyncStorage.getItem("titan.pedometer-on.v1:owner-a")).toBe("true");
    expect(await AsyncStorage.getItem("titan.steps-goal.v1:owner-a")).toBe("8000");
    expect(await AsyncStorage.getItem("titan.profile.v1:owner-a")).toBeNull();
    expect(await AsyncStorage.getItem("titan.steps-sync.v1:owner-a")).toBeNull();

    // Another person signs in on the same phone: none of it is theirs, and their own counter is off.
    _resetPedometerStoreForTests();
    mockOwner = "owner-b";
    const other = renderHook(() => usePedometer());
    await waitFor(() => expect(other.result.current.ready).toBe(true));
    expect(other.result.current.enabled).toBe(false);
    expect(other.result.current.ledger.days).toEqual({});
    expect(other.result.current.ledger.firstAt).toBeNull();
    expect(s.listeners.size).toBe(0);
    other.unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(await AsyncStorage.getItem("titan.pedometer-on.v1:owner-b")).toBeNull();

    // The first person comes back after a restart of the app: the steps are there and the counter is still on.
    _resetPedometerStoreForTests();
    mockOwner = "owner-a";
    const back = renderHook(() => usePedometer());
    await waitFor(() => expect(back.result.current.ready).toBe(true));
    expect(back.result.current.enabled).toBe(true);
    expect(Object.values(back.result.current.ledger.days)).toEqual([120]);
  });

  test("deleting the account erases the steps for good: a save still pending in memory cannot write them back", async () => {
    const s = fakeSensor(5000);
    _setPedometerForTests(createPedometer(s.native, perms(true)));
    const { result, unmount } = renderHook(() => usePedometer());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.enable(); });
    await waitFor(() => expect(s.listeners.size).toBe(1));
    act(() => s.walk(300)); // counted in memory, its save is still waiting
    await AsyncStorage.setItem("titan.steps-goal.v1:owner-a", "8000");
    await AsyncStorage.setItem("titan.pedometer.v1:owner-b", "{\"v\":1,\"days\":{\"2026-11-01\":10}}");

    await act(async () => { await forgetAccountCache("owner-a", { keepQueue: false }); }); // what account deletion calls

    const gone = async () => {
      expect(await AsyncStorage.getItem("titan.pedometer.v1:owner-a")).toBeNull();
      expect(await AsyncStorage.getItem("titan.pedometer-on.v1:owner-a")).toBeNull();
      expect(await AsyncStorage.getItem("titan.steps-goal.v1:owner-a")).toBeNull();
    };
    await gone();
    expect(s.listeners.size).toBe(0); // the sensor is no longer listened to for the erased account
    expect(result.current.ledger.days).toEqual({});
    // The screens close, the delayed save fires, the app goes on: nothing comes back.
    unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 3200)); });
    await gone();
    // Another account's steps on the same phone are untouched.
    expect(await AsyncStorage.getItem("titan.pedometer.v1:owner-b")).not.toBeNull();
  });

  test("a phone without the sensor says so and never claims a count", async () => {
    _setPedometerForTests(createPedometer(null, perms(true)));
    const { result } = renderHook(() => usePedometer());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.supported).toBe(false);
    let r = "";
    await act(async () => { r = await result.current.enable(); });
    expect(r).toBe("unsupported");
    expect(result.current.enabled).toBe(false);
  });

  test("switching off stops the stream and keeps the steps already counted; clearing forgets them", async () => {
    const s = fakeSensor();
    _setPedometerForTests(createPedometer(s.native, perms(true)));
    const { result } = renderHook(() => usePedometer());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.enable(); });
    await waitFor(() => expect(s.listeners.size).toBe(1));
    act(() => s.walk(10));
    await act(async () => { await result.current.disable(); });
    expect(s.listeners.size).toBe(0);
    expect(result.current.enabled).toBe(false);
    expect(Object.values(result.current.ledger.days).reduce((a, b) => a + b, 0)).toBe(10);
    await act(async () => { await result.current.clear(); });
    expect(result.current.ledger.firstAt).toBeNull();
  });

  test("TITAN explains first: declining its dialog asks Android nothing; accepting goes on to the system prompt (V12-08)", async () => {
    const s = fakeSensor();
    const request = jest.fn(async () => "granted" as const);
    _setPedometerForTests(createPedometer(s.native, { check: async () => false, request }));
    const { result } = renderHook(() => usePedometer());
    await waitFor(() => expect(result.current.ready).toBe(true));
    let r = "";
    await act(async () => { r = await result.current.enable(async () => false); });
    expect(r).toBe("cancelled");
    expect(request).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    await act(async () => { r = await result.current.enable(async () => true); });
    expect(r).toBe("granted");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
