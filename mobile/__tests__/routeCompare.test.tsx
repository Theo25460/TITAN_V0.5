/* V1.7.7 — « Comparer mes sorties sur ce parcours »: the same course is recognised by its trace (shared rule GpsNav.sameRoute), the
   work is capped and can be stopped, a best time needs two outings whose moving time was measured, and two different courses are
   only ever read side by side, with a warning. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { GpsNav, type NavRoute } from "../src/core";
import { APPROX_TIME_NOTE, COMPARE_MAX, compareCandidates, compareOnCourse, figuresOf, _resetLibraryForTests, type CompareMeta } from "../src/lib/routeLibrary";

const mockApi = { routesLibrary: jest.fn(), routeGetV2: jest.fn(), routeDelete: jest.fn(), routeSaveV2: jest.fn(), routeRename: jest.fn(), siteFunction: jest.fn() } as Record<string, jest.Mock>;
jest.mock("../src/data/api", () => ({
  routesLibrary: (...a: unknown[]) => mockApi.routesLibrary(...a), routeGetV2: (...a: unknown[]) => mockApi.routeGetV2(...a), routeDelete: (...a: unknown[]) => mockApi.routeDelete(...a),
  routeSaveV2: (...a: unknown[]) => mockApi.routeSaveV2(...a), routeRename: (...a: unknown[]) => mockApi.routeRename(...a), siteFunction: (...a: unknown[]) => mockApi.siteFunction(...a),
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "o1", useAuth: () => ({ owner: "o1" }) }));
jest.mock("../src/lib/exportFile", () => ({ shareTextFile: jest.fn(async () => undefined) }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { RouteDetailScreen } = require("../src/screens/session/RoutesScreen");
const { DialogHost, resetDialogs } = require("../src/components/Dialog");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const wrap = (id: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SafeAreaProvider initialMetrics={metrics}><ToastProvider><RouteDetailScreen navigation={nav} route={{ params: { id } }} /><DialogHost /></ToastProvider></SafeAreaProvider></QueryClientProvider>);

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
/** About 5 km: north-east (the course), the same with a few metres of noise, the same backwards, or due east (another course). */
function trace(kind: "course" | "noisy" | "reverse" | "other", n = 100): NavRoute {
  const pts = Array.from({ length: n }, (_, i) => kind === "other"
    ? { lat: 48.58, lon: 7.74 + i * 0.00068, t: T0 + i * 15000 }
    : { lat: 48.58 + i * 0.00036 + (kind === "noisy" ? (i % 2 ? 0.00003 : -0.00003) : 0), lon: 7.74 + i * 0.00041, t: T0 + i * 15000 });
  return GpsNav.makeRoute([kind === "reverse" ? pts.reverse().map((p, i) => ({ ...p, t: T0 + i * 15000 })) : pts], { sport: "running", origin: "recorded" })!;
}
const course = trace("course");
const meta = (n: number, over: Partial<CompareMeta> = {}): CompareMeta => ({ id: id(n), sport: "running", startedAt: new Date(T0 - n * 86400000).toISOString(), distanceM: course.distanceM, durationS: 1800, ascentM: 40, origin: "recorded", name: null, summary: null, ...over });
const measured = (movingS: number, extra: Record<string, number> = {}) => ({ v: 1, movingS, elapsedS: movingS + 200, missingS: 0, distanceM: course.distanceM, ...extra });
const row = (m: CompareMeta) => ({ ...m, points: 100 });
const traces: Record<string, NavRoute> = {};
const serve = (rows: CompareMeta[], shapes: Record<string, NavRoute>) => {
  Object.assign(traces, shapes);
  mockApi.routesLibrary.mockResolvedValue({ routes: rows.map(row), legacy: false });
  mockApi.routeGetV2.mockImplementation(async (_o: string, rid: string) => {
    const m = rows.find((r) => r.id === rid);
    if (!m || !traces[rid]) throw Object.assign(new Error("ROUTE_NOT_FOUND"), { code: "22023" });
    return { ...row(m), legacy: false, track: GpsNav.encode(traces[rid]!, T0) };
  });
};

beforeEach(async () => {
  _resetLibraryForTests();
  resetDialogs();
  await AsyncStorage.clear();
  Object.values(mockApi).forEach((m) => m.mockReset());
  for (const k of Object.keys(traces)) delete traces[k];
});

/* ---- the rule ---- */
test("only recorded outings of the same sport family within 10 % of the distance are loaded, 25 at most, most recent first", () => {
  const ref = meta(1);
  const all = [
    ref, meta(2), meta(3, { sport: "trail" }), meta(4, { sport: "cycling" }), meta(5, { distanceM: Math.round(course.distanceM * 1.2) }), meta(6, { origin: "planned", durationS: 0 }),
    meta(7, { origin: null }), meta(8, { distanceM: Math.round(course.distanceM * 0.93) }), meta(9, { origin: "imported", durationS: 0 }),
  ];
  expect(compareCandidates(ref, all).map((r) => r.id)).toEqual([id(2), id(3), id(7), id(8)]);
  const many = Array.from({ length: 60 }, (_, i) => meta(100 + i));
  const kept = compareCandidates(ref, many);
  expect(kept).toHaveLength(COMPARE_MAX);
  expect(kept[0]!.id).toBe(id(100));
});

test("the same course is found, another course of the same length is not; the best time is the measured one, an approximate time is flagged", async () => {
  const ref = meta(1, { summary: measured(1500) });
  const others = [meta(2, { summary: measured(1400) }), meta(3, { durationS: 1300 }), meta(4, { summary: measured(1200) }), meta(5, { summary: measured(1450) })];
  const shapes: Record<string, NavRoute> = { [id(2)]: trace("noisy"), [id(3)]: trace("course"), [id(4)]: trace("other"), [id(5)]: trace("reverse") };
  const load = jest.fn(async (rid: string) => shapes[rid] ?? null);
  const seen: [number, number][] = [];
  const result = await compareOnCourse({ meta: ref, route: course }, others, load, { onProgress: (done, total) => seen.push([done, total]) });
  expect(load).toHaveBeenCalledTimes(4);
  expect(seen).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
  expect(result).toMatchObject({ total: 4, examined: 4, stopped: false, unreadable: 0, criteria: GpsNav.SAME.text });
  // Another course: not an outing on this one, whatever its time.
  expect(result.different).toEqual([{ id: id(4), reason: expect.stringContaining("ne se recouvrent pas assez") }]);
  expect(result.comparable.map((e) => [e.id, e.movingS, e.approx, e.self])).toEqual([[id(3), 1300, true, false], [id(2), 1400, false, false], [id(1), 1500, false, true]]);
  expect(result.excluded).toEqual([expect.objectContaining({ id: id(5), reason: "Parcouru dans l’autre sens." })]);
  // The fastest line is an active time with stops in it: it does not take the best time.
  expect(result.best).toMatchObject({ id: id(2), movingS: 1400 });
});

test("not enough measured outings: no best time; too much time without a position or an unreadable trace are set aside and said", async () => {
  const ref = meta(1);
  const others = [meta(2), meta(3, { summary: measured(1400, { missingS: 200 }) }), meta(4, { summary: measured(1350) }), meta(5)];
  const shapes: Record<string, NavRoute | null> = { [id(2)]: trace("course"), [id(3)]: trace("course"), [id(4)]: trace("noisy"), [id(5)]: null };
  const result = await compareOnCourse({ meta: ref, route: course }, others, async (rid) => { if (rid === id(5)) throw new Error("Network request failed"); return shapes[rid] ?? null; });
  expect(result.unreadable).toBe(1);
  expect(result.comparable.map((e) => e.id)).toEqual([id(4), id(1), id(2)]);
  expect(result.excluded).toEqual([expect.objectContaining({ id: id(3), reason: "Plus de 3 % du temps sans position fiable." })]);
  // One measured outing only: nothing to call a best time.
  expect(result.best).toBeNull();
  expect(result.note).toBe("Il faut au moins deux sorties comparables dans le même sens pour parler d’un meilleur temps.");
});

test("the search can be stopped: what was examined is answered, the rest is not loaded; a planned line is no outing", async () => {
  let stop = false;
  const load = jest.fn(async () => { stop = true; return trace("course"); });
  const result = await compareOnCourse({ meta: meta(1, { origin: "planned", durationS: 0 }), route: course }, [meta(2), meta(3), meta(4)], load, { shouldStop: () => stop });
  expect(load).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ total: 3, examined: 1, stopped: true });
  // The reference is a plan: it has no time of its own, only the outing found on it is listed.
  expect(result.comparable.map((e) => e.id)).toEqual([id(2)]);
  expect(figuresOf(meta(1, { origin: "planned", durationS: 0 }))).toMatchObject({ timeS: null, speedKmh: null, approx: false });
  expect(figuresOf(meta(2, { durationS: 1800 }))).toMatchObject({ timeS: 1800, approx: true });
  expect(figuresOf(meta(2, { summary: measured(1500) }))).toMatchObject({ timeS: 1500, approx: false, speedKmh: Math.round((course.distanceM / 1500) * 36) / 10 });
});

/* ---- the screen ---- */
test("screen: criteria, outings ordered by moving time, the set-aside ones with their reason, a best time only when it exists", async () => {
  const rows = [meta(1, { summary: measured(1500) }), meta(2, { summary: measured(1400) }), meta(3, { durationS: 1300 }), meta(4, { summary: measured(1200) }), meta(5, { summary: measured(1450) })];
  serve(rows, { [id(1)]: course, [id(2)]: trace("noisy"), [id(3)]: trace("course"), [id(4)]: trace("other"), [id(5)]: trace("reverse") });
  wrap(id(1));
  fireEvent.press(await screen.findByTestId("compare-start"));
  expect(await screen.findByTestId("compare-result")).toBeTruthy();
  expect(screen.getByText(GpsNav.SAME.text)).toBeTruthy();
  const order = screen.getAllByTestId(/^compare-row-/).map((n) => n.props.testID);
  expect(order).toEqual([`compare-row-${id(3)}`, `compare-row-${id(2)}`, `compare-row-${id(1)}`]);
  expect(screen.getByTestId(`compare-row-${id(3)}`).props.children.join("")).toMatch(new RegExp(`^1\\. .* · 21:40 · .* · ${APPROX_TIME_NOTE}$`));
  expect(screen.getByTestId(`compare-row-${id(1)}`).props.children.join("")).toMatch(/^3\. Cette sortie · 25:00 · /);
  expect(screen.getByTestId("compare-best").props.children.join("")).toMatch(/^Meilleur temps en mouvement : 23:20, /);
  expect(screen.getByTestId(`compare-out-${id(5)}`).props.children.join("")).toMatch(/ : Parcouru dans l’autre sens\.$/);
  expect(screen.getByText(/4 tracés examinés sur 4 · 1 de distance proche est un autre parcours/)).toBeTruthy();
  expect(screen.queryByTestId("compare-none")).toBeNull();
  expect(screen.queryByTestId("compare-manual")).toBeNull();
  // Each other trace was read once, on demand.
  expect(mockApi.routeGetV2.mock.calls.map((c) => c[1]).filter((r) => r !== id(1)).sort()).toEqual([id(2), id(3), id(4), id(5)]);
});

test("screen: outings without a measured moving time are listed, flagged, and no best time nor « record » is announced", async () => {
  serve([meta(1), meta(2, { durationS: 1700 })], { [id(1)]: course, [id(2)]: trace("noisy") });
  wrap(id(1));
  fireEvent.press(await screen.findByTestId("compare-start"));
  expect(await screen.findByTestId(`compare-row-${id(2)}`)).toBeTruthy();
  expect(screen.queryByTestId("compare-best")).toBeNull();
  expect(screen.getByTestId("compare-no-best").props.children).toMatch(/^Pas de meilleur temps affiché/);
  const said = screen.getByTestId("compare-result").findAll((n) => typeof n.type === "string" && (n.type as string) === "Text").map((n) => [n.props.children].flat().join("")).join("\n");
  expect(said).not.toMatch(/record/i);
});

test("screen: nothing on this course → « Aucune autre sortie sur ce parcours », then a manual side-by-side with its warning", async () => {
  serve([meta(1, { summary: measured(1500) }), meta(4, { summary: measured(1200), name: "Canal est" })], { [id(1)]: course, [id(4)]: trace("other") });
  wrap(id(1));
  fireEvent.press(await screen.findByTestId("compare-start"));
  expect(await screen.findByText("Aucune autre sortie sur ce parcours")).toBeTruthy();
  expect(screen.queryByTestId("compare-best")).toBeNull();
  fireEvent.press(screen.getByTestId("compare-manual"));
  fireEvent.press(await screen.findByTestId(`versus-${id(4)}`));
  expect(await screen.findByText("Parcours différents : comparaison indicative")).toBeTruthy();
  const card = screen.getByTestId("compare-versus").findAll((n) => typeof n.type === "string" && (n.type as string) === "Text").map((n) => [n.props.children].flat().join(""));
  expect(card).toEqual(expect.arrayContaining(["Canal est", "Temps", "25:00", "20:00", "Distance"]));
  expect(card.join("\n")).not.toMatch(/record|meilleur/i);
});

test("screen: the library cannot be read → the comparison says it needs a connection, and offers to retry", async () => {
  serve([meta(1)], { [id(1)]: course });
  wrap(id(1));
  await screen.findByTestId("compare-start");
  mockApi.routesLibrary.mockRejectedValue(new Error("Network request failed"));
  fireEvent.press(screen.getByTestId("compare-start"));
  expect(await screen.findByText(/La comparaison a besoin de ta bibliothèque en ligne/)).toBeTruthy();
  await waitFor(() => expect(screen.queryByTestId("compare-progress")).toBeNull());
});
