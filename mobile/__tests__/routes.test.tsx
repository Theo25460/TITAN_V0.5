/* Route library: outbox that never duplicates and never blocks, list and detail screens (tile-less map, GPX export, deletion), private by design. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { awaitSession, buildPending, flushRoutes, linkSavedSession, newRouteId, pendingLinks, pendingRoutes, queueRoute, _resetForTests } from "../src/lib/routeSync";
import { addFix, emptyTrack, type Fix, type Track } from "../src/lib/gpsTrack";

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
const track = (n: number): Track => {
  let t = emptyTrack();
  for (let i = 0; i < n; i++) t = addFix(t, { lat: 48.85 + i * 0.000045, lon: 2.35 + i * 0.00002, alt: 100 + i * 0.4, altAcc: 5, acc: 5, t: T0 + i * 1000 } as Fix);
  return t;
};
const mk = (id?: string) => buildPending({ track: track(60), sport: "running", startedAt: T0, distanceKm: 0.3, activeSeconds: 59, ascent: 12, id })!;

beforeEach(() => { _resetForTests(); mockShare.mockClear(); });

test("a finished recording becomes one pending route with a stable id; ids look like the server expects", () => {
  const p = mk("route-test-0001");
  expect(p).toMatchObject({ clientRouteId: "route-test-0001", sport: "running", distanceM: 300, durationS: 59, ascentM: 12, attempts: 0 });
  expect(p.track.segs[0]).toHaveLength(60);
  expect(newRouteId()).toMatch(/^[A-Za-z0-9_.:-]{8,64}$/);
  expect(buildPending({ track: track(1), sport: "running", startedAt: T0, distanceKm: 0, activeSeconds: 0, ascent: null })).toBeNull();
});

test("the outbox sends oldest first, once, and keeps what failed; queueing the same id twice keeps one", async () => {
  await queueRoute("o1", mk("route-aaaa-0001"));
  await queueRoute("o1", mk("route-aaaa-0001"));
  await queueRoute("o1", mk("route-aaaa-0002"));
  expect(await pendingRoutes("o1")).toHaveLength(2);
  const sent: string[] = [];
  const save = jest.fn(async (r: { clientRouteId: string }) => {
    if (r.clientRouteId.endsWith("0002")) throw new Error("network");
    sent.push(r.clientRouteId);
  });
  expect(await flushRoutes("o1", save)).toEqual({ sent: 1, left: 1 });
  expect(sent).toEqual(["route-aaaa-0001"]);
  save.mockResolvedValue(undefined);
  expect(await flushRoutes("o1", save)).toEqual({ sent: 1, left: 0 });
  expect(await flushRoutes("o1", save)).toEqual({ sent: 0, left: 0 });
});

test("outboxes are per account; two flushes at once send once; a refused route stays recoverable after five tries", async () => {
  await queueRoute("a", mk("route-aaaa-0003"));
  expect(await pendingRoutes("b")).toHaveLength(0);
  let calls = 0;
  const slow = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); };
  const [x, y] = await Promise.all([flushRoutes("a", slow), flushRoutes("a", slow)]);
  expect(calls).toBe(1);
  expect(x.sent + y.sent).toBe(1);
  await queueRoute("a", mk("route-aaaa-0004"));
  const refused = async () => { throw new Error("TRACK_TOO_LARGE"); };
  for (let i = 0; i < 4; i++) expect((await flushRoutes("a", refused)).left).toBe(1);
  expect((await flushRoutes("a", refused)).left).toBe(1);
});

test("the session saved from a recording is linked to its route: same sport, within two days, once, after the route itself; nothing is guessed", async () => {
  await queueRoute("l1", mk("route-link-0001"));
  await awaitSession("l1", "route-link-0001", "running", T0);
  expect(await linkSavedSession("l1", "cycling", "evt-session-0001", T0 + 1000)).toBe(false); // another sport: no link
  expect(await linkSavedSession("l1", "running", "evt-session-0001", T0 + 3 * 86400000)).toBe(false); // too late
  expect(await linkSavedSession("l1", "running", "evt-session-0001", T0 + 60_000)).toBe(true);
  expect(await linkSavedSession("l1", "running", "evt-session-0002", T0 + 61_000)).toBe(false); // the waiting slot was consumed
  expect(await pendingLinks("l1")).toEqual([{ clientRouteId: "route-link-0001", eventId: "evt-session-0001", attempts: 0 }]);
  const order: string[] = [];
  const save = async (r: { clientRouteId: string }) => void order.push(`save:${r.clientRouteId}`);
  const link = async (c: string, e: string) => void order.push(`link:${c}:${e}`);
  await flushRoutes("l1", save, link);
  expect(order).toEqual(["save:route-link-0001", "link:route-link-0001:evt-session-0001"]);
  expect(await pendingLinks("l1")).toEqual([]);
});

test("a link waits while its route is still waiting and remains recoverable after any refusal", async () => {
  await queueRoute("l2", mk("route-link-0002"));
  await awaitSession("l2", "route-link-0002", "running", T0);
  await linkSavedSession("l2", "running", "evt-session-0003", T0 + 1000);
  const link = jest.fn(async () => undefined);
  await flushRoutes("l2", async () => { throw new Error("network"); }, link);
  expect(link).not.toHaveBeenCalled();
  expect((await pendingLinks("l2")).length).toBe(1);
  await flushRoutes("l2", async () => undefined, async () => { throw new Error("network"); });
  expect((await pendingLinks("l2"))[0]!.attempts).toBe(1);
  await flushRoutes("l2", async () => undefined, async () => { throw new Error("ROUTE_ALREADY_LINKED"); });
  expect(await pendingLinks("l2")).toEqual([expect.objectContaining({ eventId: "evt-session-0003", attempts: 2 })]);
});

/* ---- screens ---- */
const mockApi = { routesList: jest.fn(), routeGet: jest.fn(), routeDelete: jest.fn() } as Record<string, jest.Mock>;
const mockShare = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("../src/data/api", () => ({ routesList: (...a: unknown[]) => mockApi.routesList(...a), routeGet: (...a: unknown[]) => mockApi.routeGet(...a), routeDelete: (...a: unknown[]) => mockApi.routeDelete(...a) }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "o1", useAuth: () => ({ owner: "o1" }) }));
jest.mock("../src/lib/exportFile", () => ({ shareTextFile: (...a: unknown[]) => mockShare(...a) }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { RoutesScreen, RouteDetailScreen } = require("../src/screens/session/RoutesScreen");
const { encodeTrack } = require("../src/lib/gpsTrack");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{ui}</ToastProvider></SafeAreaProvider></QueryClientProvider>);
const meta = { id: "r-1", sport: "running", startedAt: new Date(T0).toISOString(), distanceM: 5300, durationS: 1800, ascentM: 42, points: 60 };

test("library: lists the athlete's routes, opens one, says clearly that nothing is shared", async () => {
  mockApi.routesList.mockResolvedValue([meta]);
  wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText(/jamais partagées ni publiées/)).toBeTruthy();
  fireEvent.press(await screen.findByTestId("route-r-1"));
  expect(nav.navigate).toHaveBeenCalledWith("Route", { id: "r-1" });
});

test("library: empty state invites to record; a pending upload is announced", async () => {
  mockApi.routesList.mockResolvedValue([]);
  await queueRoute("o1", mk("route-aaaa-0009"));
  wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText(/1 parcours en attente d’envoi/)).toBeTruthy();
});

test("library: an unsent trace remains exportable while the server is unavailable", async () => {
  mockShare.mockClear();
  mockApi.routesList.mockRejectedValue(new Error("offline"));
  await queueRoute("o1", mk("route-offline-0001"));
  wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("pending-export-route-offline-0001"));
  await waitFor(() => expect(mockShare).toHaveBeenCalledWith(expect.stringMatching(/\.gpx$/), expect.stringContaining("<trkpt"), "application/gpx+xml"));
});

test("detail: map, figures, GPX export and deletion; no map server is contacted", async () => {
  mockApi.routeGet.mockResolvedValue({ ...meta, track: encodeTrack(track(400)) });
  mockApi.routeDelete.mockResolvedValue(true);
  const fetchSpy = jest.spyOn(global, "fetch");
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: "r-1" } }} />);
  expect(await screen.findByText(/5,3\s?km|5\.3\s?km/)).toBeTruthy();
  expect(screen.getByText("42 m")).toBeTruthy();
  fireEvent.press(screen.getByTestId("route-export"));
  await waitFor(() => expect(mockShare).toHaveBeenCalled());
  expect(mockShare.mock.calls[0]).toEqual([expect.stringMatching(/^titan-running-2026-11-02\.gpx$/), expect.stringContaining("<trkpt"), "application/gpx+xml"]);
  fireEvent.press(screen.getByTestId("route-share"));
  await waitFor(() => expect(mockShare.mock.calls.length).toBe(2));
  const shared = mockShare.mock.calls[1] as unknown[];
  expect(shared[0]).toBe("titan-parcours-2026-11-02.gpx");
  expect(String(shared[1])).not.toContain("<time>");
  expect(String(shared[1])).not.toContain("<ele>");
  fireEvent.press(screen.getByTestId("route-delete"));
  await waitFor(() => expect(mockApi.routeDelete).toHaveBeenCalledWith("o1", "r-1"));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  expect(fetchSpy).not.toHaveBeenCalled();
});
