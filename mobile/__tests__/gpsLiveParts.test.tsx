/* V1.7.7 — the pure parts of the live GPS screen: the map's scale, zoom and culling, the state line, the time bar, what is typed
   in the sheets, the preferences kept per account, and the base map shown only with a provider AND the athlete's opt-in. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { GpsEngine, type GpsAnalysis, type GpsFix } from "../src/core";
import { gpsStateLine } from "../src/components/GpsDashboard";
import { GpsLiveMap, liveZoom, metresPerPixel, scaleBar, visibleRuns } from "../src/components/GpsLiveMap";
import { EMPTY_PLAN_FORM, goalFromInput, parsePart, stepsOfForm } from "../src/components/GpsSheets";
import { timeSlices } from "../src/components/GpsSummary";
import { cleanGpsPrefs, DEFAULT_GPS_PREFS, fieldsFor, loadBasemap, loadGpsPrefs, saveBasemap, saveGpsPrefs } from "../src/lib/gpsPrefs";

const T0 = Date.UTC(2026, 10, 25, 8, 0, 0);
const M = (Math.PI / 180) * 6371008.8;
const at = (north: number, sec: number, over: Partial<GpsFix> = {}): GpsFix => ({ lat: 48.58 + north / M, lon: 7.7, alt: null, altAcc: null, acc: 5, t: T0 + sec * 1000, ...over });
const analyse = (sport: string, fixes: GpsFix[], now: number): GpsAnalysis => {
  let track = { segs: [] as GpsFix[][], rejected: 0 };
  fixes.forEach((f, i) => (track = GpsEngine.ingest(track, f, { sport, newSegment: i === 0 })));
  return GpsEngine.analyse({ sport, startedAt: T0, segs: track.segs, stretches: [{ s: T0, e: null, why: "pause" }] }, { now });
};

beforeEach(() => AsyncStorage.clear());

test("map: zoom by sport, a round scale bar, and only what can be seen is drawn", () => {
  expect([liveZoom("running"), liveZoom("hiking"), liveZoom("gravel"), liveZoom("mountain_bike"), liveZoom("kayak")]).toEqual([16, 16, 15, 15, 15]);
  expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
  expect(scaleBar(48.58, 16)).toEqual({ metres: 100, px: 63, label: "100 m" });
  expect(scaleBar(48.58, 15).label).toBe("200 m");
  expect(scaleBar(48.58, 10).label).toBe("5 km");
  expect(scaleBar(48.58, 16, 96).px).toBeLessThanOrEqual(96);
  // 20 km of trace, one point every 10 m; the view (z16, 360 × 500) sees a few hundred metres around km 10.
  const trace = [Array.from({ length: 2001 }, (_, i) => ({ lat: 48.58 + (i * 10) / M, lon: 7.7 }))];
  const view = { lat: 48.58 + 10000 / M, lon: 7.7, z: 16 };
  const runs = visibleRuns(trace, view, 360, 500);
  expect(runs).toHaveLength(1);
  expect(runs[0]!.length).toBeLessThan(260);
  expect(runs[0]!.length).toBeGreaterThan(100);
  expect(visibleRuns(trace, { ...view, lon: 8.5 }, 360, 500)).toEqual([]); // looking elsewhere: nothing
  // Two stretches stay two lines (a hole is never joined), and a dense view is thinned without losing its ends.
  const two = visibleRuns([trace[0]!.slice(990, 1000), trace[0]!.slice(1003, 1012)], view, 360, 500);
  expect(two.map((r) => r.length)).toEqual([10, 9]);
  const dense = [Array.from({ length: 12000 }, (_, i) => ({ lat: 48.58 + i * 1e-7, lon: 7.7 }))];
  const thinned = visibleRuns(dense, { lat: 48.58, lon: 7.7, z: 16 }, 360, 500);
  expect(thinned[0]!.length).toBeLessThanOrEqual(1802);
  expect(thinned[0]![0]).toBe(dense[0]![0]);
  expect(thinned[0]!.at(-1)).toBe(dense[0]!.at(-1));
});

test("map: neutral ground without a base map, an honest empty state, zoom limits, and a drag frees the map until « Recentrer »", () => {
  const segs = [[at(0, 0), at(300, 100)]];
  const view = render(<GpsLiveMap segs={[]} sport="running" basemap accessibilityLabel="Carte" />);
  expect(screen.getByText("La carte s’affichera dès la première position fiable.")).toBeTruthy();
  expect(screen.queryByTestId("gps-map-zoom-in")).toBeNull();
  view.unmount();
  render(<GpsLiveMap segs={segs} position={{ t: T0, lat: at(300, 0).lat, lon: 7.7, acc: 8, hdg: 90 }} moving sport="running" basemap={false} accessibilityLabel="Carte de la sortie" />);
  expect(screen.getByText("Fond neutre : trace et position seulement")).toBeTruthy();
  expect(screen.getByTestId("gps-map-surface").props.accessibilityRole).toBe("image");
  expect(screen.getByLabelText("Zoom avant")).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-map-zoom-in")); // 17 is the closest
  expect(screen.getByTestId("gps-map-zoom-in").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText("Échelle : 50 m")).toBeTruthy();
  expect(screen.queryByTestId("gps-map-recenter")).toBeNull();
  // A drag of 60 px: the map no longer follows the position.
  const surface = screen.getByTestId("gps-map-surface");
  const touch = (x: number, y: number, t: number) => ({ touchActive: true, startPageX: 100, startPageY: 100, startTimeStamp: 0, currentPageX: x, currentPageY: y, currentTimeStamp: t, previousPageX: 100, previousPageY: 100, previousTimeStamp: 0 });
  const event = (x: number, y: number, t: number) => ({ nativeEvent: { touches: [{}], changedTouches: [{}] }, touchHistory: { touchBank: [touch(x, y, t)], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: t } });
  act(() => {
    surface.props.onResponderGrant(event(100, 100, 0));
    surface.props.onResponderMove(event(140, 120, 16));
  });
  fireEvent.press(screen.getByLabelText("Recentrer la carte sur ta position"));
  expect(screen.queryByTestId("gps-map-recenter")).toBeNull();
});

test("state line: moving, a stop only once the sport's delay is reached, a hole, a pause", () => {
  const good = GpsEngine.signal({ t: T0 + 100_000, acc: 5 }, T0 + 100_000);
  const moving = analyse("cycling", Array.from({ length: 51 }, (_, i) => at(i * 12, i * 2)), T0 + 100_000);
  expect(gpsStateLine("recording", moving, good)).toEqual({ kind: "moving", text: "En mouvement" });
  const halt = (seconds: number) => analyse("cycling", [...Array.from({ length: 51 }, (_, i) => at(i * 12, i * 2)), ...Array.from({ length: seconds / 2 }, (_, i) => at(600.5, 100 + (i + 1) * 2))], T0 + (100 + seconds) * 1000);
  expect(gpsStateLine("recording", halt(6), good).kind).toBe("moving"); // 6 s at a crossing is not a stop for a cyclist
  expect(gpsStateLine("recording", halt(40), good)).toEqual({ kind: "stopped", text: "À l’arrêt depuis 0:40" });
  expect(gpsStateLine("recording", halt(3720), good).text).toBe("À l’arrêt depuis 1:02:00");
  expect(gpsStateLine("recording", moving, GpsEngine.signal({ t: T0 + 100_000, acc: 5 }, T0 + 140_000)).text).toBe("Sans signal");
  expect(gpsStateLine("recording", moving, GpsEngine.signal(null, T0)).text).toBe("Sans signal");
  expect(gpsStateLine("recording", analyse("cycling", [at(0, 0), at(12, 2)], T0 + 60_000), good).kind).toBe("nosignal"); // nothing usable for 58 s
  expect(gpsStateLine("paused", moving, good)).toEqual({ kind: "paused", text: "En pause" });
});

test("time bar: every period with its share, and hundreds of periods still one bar of at most 96 slices", () => {
  const a = analyse("running", [...Array.from({ length: 31 }, (_, i) => at(i * 6, i * 2)), ...Array.from({ length: 30 }, (_, i) => at(180.4, 60 + (i + 1) * 2))], T0 + 120_000);
  const slices = timeSlices(a);
  expect(slices.map((s) => s.kind)).toEqual(["moving", "stopped"]);
  expect(slices.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 6);
  const many = { ...a, start: 0, ms: { ...a.ms, elapsed: 400_000 }, timeline: Array.from({ length: 400 }, (_, i) => ({ from: i * 1000, to: (i + 1) * 1000, kind: i % 4 === 3 ? ("stopped" as const) : ("moving" as const) })) };
  const bucketed = timeSlices(many);
  expect(bucketed).toHaveLength(96);
  expect(bucketed.every((s) => s.kind === "moving")).toBe(true); // three quarters of each slice
  expect(timeSlices({ ...a, ms: { ...a.ms, elapsed: 0 } })).toEqual([]);
});

test("sheets: what is typed becomes a step or a goal, or a reason", () => {
  expect(parsePart({ by: "time", text: "5:30" }).input).toEqual({ by: "time", value: 330 });
  expect(parsePart({ by: "time", text: "12" }).input).toEqual({ by: "time", value: 720 });
  expect(parsePart({ by: "time", text: "0:03" })).toEqual({ input: null, error: "Durée en min:s, de 0:05 à 360:00 (6 h)." });
  expect(parsePart({ by: "time", text: "5:75" }).input).toBeNull();
  expect(parsePart({ by: "distance", text: "400" }).input).toEqual({ by: "distance", value: 400 });
  expect(parsePart({ by: "distance", text: "1,5 km" }).input).toEqual({ by: "distance", value: 1500 });
  expect(parsePart({ by: "distance", text: "800m" }).input).toEqual({ by: "distance", value: 800 });
  expect(parsePart({ by: "distance", text: "20" }).error).toMatch(/50 m à 200 km/);
  expect(parsePart({ by: "manual", text: "" }).input).toEqual({ by: "manual" });
  expect(parsePart({ by: "none", text: "9" })).toEqual({ input: null, error: null });
  expect(stepsOfForm(EMPTY_PLAN_FORM)).toEqual({ steps: [], invalid: false });
  const built = stepsOfForm({ ...EMPTY_PLAN_FORM, warmup: { by: "time", text: "10" }, reps: "4", work: { by: "distance", text: "1 km" }, recover: { by: "time", text: "2:00" } });
  expect(built.steps.map((s) => s.label)).toEqual(["Échauffement", "Effort 1/4", "Récupération 1/3", "Effort 2/4", "Récupération 2/3", "Effort 3/4", "Récupération 3/3", "Effort 4/4"]);
  expect(stepsOfForm({ ...EMPTY_PLAN_FORM, reps: "99", work: { by: "manual", text: "" } }).steps).toHaveLength(30);
  expect(stepsOfForm({ ...EMPTY_PLAN_FORM, work: { by: "time", text: "x" } })).toEqual({ steps: [], invalid: true });

  const now = new Date(2026, 10, 25, 14, 0, 0).getTime();
  const v = { km: "", hours: "", minutes: "", hh: "", mm: "" };
  expect(goalFromInput("none", v, now)).toEqual({ goal: null, error: null });
  expect(goalFromInput("distance", { ...v, km: "42,2" }, now).goal).toEqual({ kind: "distance", km: 42.2 });
  expect(goalFromInput("distance", { ...v, km: "0" }, now).error).toMatch(/distance entre/);
  expect(goalFromInput("time", { ...v, hours: "1", minutes: "30" }, now).goal).toEqual({ kind: "time", minutes: 90 });
  expect(goalFromInput("time", v, now).error).toMatch(/durée entre/);
  expect(goalFromInput("return", { ...v, hh: "18", mm: "30" }, now).goal).toEqual({ kind: "return", at: new Date(2026, 10, 25, 18, 30).getTime() });
  expect(goalFromInput("return", { ...v, hh: "9" }, now).goal).toEqual({ kind: "return", at: new Date(2026, 10, 26, 9, 0).getTime() }); // already past today: tomorrow
  expect(goalFromInput("return", { ...v, hh: "25" }, now).error).toMatch(/heure valide/);
});

test("preferences: kept per account, cleaned when read back, two quick changes both kept; the base map choice is the one of « Mes parcours »", async () => {
  expect(await loadGpsPrefs("owner-a")).toEqual(DEFAULT_GPS_PREFS);
  await Promise.all([saveGpsPrefs("owner-a", { view: "map" }), saveGpsPrefs("owner-a", { autoPause: false }), saveGpsPrefs("owner-a", { fields: { bike: ["elapsed", "clock", "elapsed", "nope" as never, "stopped", "ascent", "altitude"] } })]);
  const a = await loadGpsPrefs("owner-a");
  expect(a).toMatchObject({ view: "map", autoPause: false, offRouteAlert: true, stepAlerts: true });
  expect(a.fields).toEqual({ bike: ["elapsed", "clock", "stopped", "ascent"] });
  expect(fieldsFor(a, "gravel")).toEqual(["elapsed", "clock", "stopped", "ascent"]);
  expect(fieldsFor(a, "running")).toBeNull();
  expect(await loadGpsPrefs("owner-b")).toEqual(DEFAULT_GPS_PREFS); // another account on the same phone
  expect(cleanGpsPrefs({ view: "radar", autoPause: "no", fields: "x" })).toEqual({ ...DEFAULT_GPS_PREFS });
  expect(cleanGpsPrefs(null)).toEqual(DEFAULT_GPS_PREFS);
  expect(await loadBasemap()).toBe(false); // off by default: tiles tell a provider which area is looked at
  await saveBasemap(true);
  expect(await AsyncStorage.getItem("titan.basemap.v1")).toBe("true");
});
