import AsyncStorage from "@react-native-async-storage/async-storage";
import { flushRoutes, pendingLinks, pendingRoutes, queueRoute, queueRouteLink, _resetForTests, type PendingRoute } from "../src/lib/routeSync";
import { forgetAccountCache, ownerKey, writeJSON } from "../src/lib/storage";

const route = (id: string): PendingRoute => ({ clientRouteId: id, sport: "running", startedAt: "2026-11-02T08:00:00Z", distanceM: 100, durationS: 60, ascentM: null, track: { v: 1, segs: [[[48, 7, null, 0], [48.001, 7, null, 60]]] } as PendingRoute["track"], attempts: 0 });
beforeEach(async () => { _resetForTests(); await AsyncStorage.clear(); });

test("concurrent enqueues preserve both routes", async () => {
  await Promise.all([queueRoute("a", route("route-one")), queueRoute("a", route("route-two"))]);
  expect((await pendingRoutes("a")).map((r) => r.clientRouteId)).toEqual(["route-one", "route-two"]);
});

test("a route queued while an upload waits is not overwritten by the upload result", async () => {
  await queueRoute("a", route("route-one"));
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((r) => { started = r; });
  const blocked = new Promise<void>((r) => { release = r; });
  const flushing = flushRoutes("a", async () => { started(); await blocked; });
  await entered;
  await queueRoute("a", route("route-two"));
  release();
  await flushing;
  expect((await pendingRoutes("a")).map((r) => r.clientRouteId)).toEqual(["route-two"]);
});

test("server refusals never silently delete the only pending copy", async () => {
  await queueRoute("a", route("route-one"));
  for (let n = 0; n < 6; n++) await flushRoutes("a", async () => { throw new Error("ROUTE_LIMIT"); });
  expect(await pendingRoutes("a")).toEqual([expect.objectContaining({ clientRouteId: "route-one", attempts: 6 })]);
});

test("full outbox rejects the new save explicitly and preserves all twenty older routes", async () => {
  for (let n = 0; n < 20; n++) await queueRoute("a", route(`route-${n}`));
  await expect(queueRoute("a", route("route-overflow"))).rejects.toThrow("ROUTE_OUTBOX_FULL");
  expect((await pendingRoutes("a")).map((r) => r.clientRouteId)).toEqual(Array.from({ length: 20 }, (_, n) => `route-${n}`));
});

test("normal sign-out retains routes, their links and draft; deleting the account removes them", async () => {
  await queueRoute("a", route("route-one"));
  await queueRouteLink("a", "route-one", "session-one");
  await writeJSON(ownerKey("draft", "a"), { unsent: true });
  await writeJSON(ownerKey("profile", "a"), { cached: true });
  await forgetAccountCache("a");
  expect(await pendingRoutes("a")).toHaveLength(1);
  expect(await pendingLinks("a")).toHaveLength(1);
  expect(await AsyncStorage.getItem(ownerKey("draft", "a"))).not.toBeNull();
  expect(await AsyncStorage.getItem(ownerKey("profile", "a"))).toBeNull();
  expect(await pendingRoutes("b")).toEqual([]);
  await forgetAccountCache("a", { keepQueue: false });
  expect(await pendingRoutes("a")).toEqual([]);
  expect(await pendingLinks("a")).toEqual([]);
});

test("a link persist failure is surfaced so the owning queue can retry", async () => {
  const original = (AsyncStorage.setItem as jest.Mock).getMockImplementation();
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk-full"));
  await expect(queueRouteLink("a", "route-one", "session-one")).rejects.toThrow("disk-full");
  (AsyncStorage.setItem as jest.Mock).mockImplementation(original);
});

test("a transient disk read error cannot replace an existing outbox with an empty one", async () => {
  await queueRoute("a", route("route-one"));
  const original = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk-unavailable"));
  await expect(queueRoute("a", route("route-two"))).rejects.toThrow("disk-unavailable");
  (AsyncStorage.getItem as jest.Mock).mockImplementation(original);
  expect((await pendingRoutes("a")).map((r) => r.clientRouteId)).toEqual(["route-one"]);
});

test("an unconfirmed link stays queued when the server says the route is absent", async () => {
  await queueRouteLink("a", "route-one", "session-one");
  await flushRoutes("a", async () => undefined, async () => false);
  expect(await pendingLinks("a")).toEqual([{ clientRouteId: "route-one", eventId: "session-one", attempts: 1 }]);
});
