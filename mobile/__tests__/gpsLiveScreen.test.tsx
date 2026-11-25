/* V1.7.7 — the live GPS outing screen: three views, what the engine sees right now, the banners (route, way back, goal, step),
   the sheets, the confirmation before ending and the bilan. The location service is faked; the recorder, the engine, the route
   library and the personal points are the real ones, on the in-memory key-value store. Outings are built with a recorder whose
   clock is driven by the test and that ends « now », then handed to the screen as the stored recording. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { Deps, RawFix, Recording, StartSetup } from "../src/lib/gpsRecorder";

const mockStore = new Map<string, Recording | null>();
const mockState = { permission: "ok" as "ok" | "denied" | "blocked" | "unavailable", updates: false, active: null as string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDraft = jest.fn(async (..._a: any[]) => true);
const mockAlert = jest.fn();
const mockWeek = { view: { occurrences: [] as unknown[] } };
jest.mock("../src/lib/gpsNative", () => {
  const { createRecorder } = jest.requireActual("../src/lib/gpsRecorder");
  const { loadRouteForFollow } = jest.requireActual("../src/lib/routeLibrary");
  const recorder = createRecorder({
    read: async (k: string) => (mockStore.get(k) ? JSON.parse(JSON.stringify(mockStore.get(k))) : null),
    write: async (k: string, v: Recording | null) => void mockStore.set(k, v ? JSON.parse(JSON.stringify(v)) : null),
    startUpdates: async () => void (mockState.updates = true),
    stopUpdates: async () => void (mockState.updates = false),
    updatesRunning: async () => mockState.updates,
    now: () => Date.now(),
    loadRoute: (owner: string, id: string) => loadRouteForFollow(owner, id),
    alert: (kind: string) => mockAlert(kind),
  });
  return {
    recorder,
    ensureLocationPermission: async () => mockState.permission,
    getActiveOwner: async () => mockState.active,
    setActiveOwner: async (o: string | null, expected?: string) => {
      if (expected === undefined || mockState.active === expected) mockState.active = o;
    },
  };
});
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a", useAuth: () => ({ status: "signedIn", owner: "owner-a" }) }));
jest.mock("../src/data/drafts", () => ({ saveDraft: (...a: unknown[]) => mockDraft(...a) }));
jest.mock("../src/data/api", () => ({ routeSave: jest.fn(async () => ({})), routeLink: jest.fn(async () => ({})) }));
jest.mock("../src/lib/exportFile", () => ({ shareTextFile: jest.fn(async () => undefined) }));
jest.mock("../src/lib/haptics", () => ({ haptic: jest.fn() }));
jest.mock("../src/lib/reminders", () => ({ ensurePermission: async () => true }));
jest.mock("../src/lib/weekPlan", () => ({ useWeekPlan: () => mockWeek.view }));
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const RN = require("react-native");
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { DialogHost, resetDialogs } = require("../src/components/Dialog");
const { GpsRecordScreen } = require("../src/screens/session/GpsRecordScreen");
const { createRecorder, recKey } = require("../src/lib/gpsRecorder") as typeof import("../src/lib/gpsRecorder");
const { loadGpsPrefs, saveGpsPrefs } = require("../src/lib/gpsPrefs") as typeof import("../src/lib/gpsPrefs");
const { listPlaces, addPlace } = require("../src/lib/places") as typeof import("../src/lib/places");
const { listOfflineRoutes, loadRouteForFollow, saveRouteOffline } = require("../src/lib/routeLibrary") as typeof import("../src/lib/routeLibrary");
const { voiceEnabled } = require("../src/lib/voiceCoach") as typeof import("../src/lib/voiceCoach");
const { GpsNav, GpsSession } = require("../src/core") as typeof import("../src/core");
/* eslint-enable @typescript-eslint/no-require-imports */

const nav = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
const show = (params: { sport: string; follow?: string } = { sport: "running" }, frame = { width: 360, height: 780 }) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, ...frame }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
      <ToastProvider><GpsRecordScreen navigation={nav} route={{ params }} /><DialogHost /></ToastProvider>
    </SafeAreaProvider>,
  );

const M_PER_DEG = (Math.PI / 180) * 6371008.8;
const LAT = 48.58, LON = 7.7;
const point = (north: number, east = 0) => ({ lat: LAT + north / M_PER_DEG, lon: LON + east / (M_PER_DEG * Math.cos((LAT * Math.PI) / 180)) });
type Drive = { rec: ReturnType<typeof createRecorder>; fix: (north: number, sec: number, east?: number, over?: Partial<RawFix>) => RawFix; feed: (fixes: RawFix[]) => Promise<void>; clock: (sec: number) => void };
/** Builds an outing of `seconds` that ends now, and stores it as the recording the screen finds (the service still running). */
async function seed(sport: string, seconds: number, drive: (d: Drive) => Promise<void>, setup: StartSetup = {}) {
  const T = Date.now() - seconds * 1000;
  let clock = T;
  const local = new Map<string, unknown>();
  const deps: Deps = {
    read: async (k) => (local.get(k) ? JSON.parse(JSON.stringify(local.get(k))) : null),
    write: async (k, v) => void local.set(k, v ? JSON.parse(JSON.stringify(v)) : null),
    startUpdates: async () => {},
    stopUpdates: async () => {},
    updatesRunning: async () => true,
    now: () => clock,
    loadRoute: (owner, id) => loadRouteForFollow(owner, id),
  };
  const rec = createRecorder(deps);
  await rec.start("owner-a", sport, setup);
  const fix: Drive["fix"] = (north, sec, east = 0, over = {}) => ({ ...point(north, east), alt: null, altAcc: null, acc: 5, t: T + sec * 1000, ...over });
  const feed: Drive["feed"] = async (fixes) => {
    for (let i = 0; i < fixes.length; i += 30) {
      const part = fixes.slice(i, i + 30);
      clock = part[part.length - 1]!.t;
      await rec.append("owner-a", part);
    }
  };
  await drive({ rec, fix, feed, clock: (sec) => (clock = T + sec * 1000) });
  const stored = local.get(recKey("owner-a")) as Recording;
  mockStore.set(recKey("owner-a"), stored);
  mockState.updates = stored.status === "recording";
  mockState.active = "owner-a";
  return stored;
}
/** `seconds` of steady movement north at `speed` m/s, one fix every 2 s, ending at second `until`. */
const cruise = (d: Drive, from: number, speed: number, start: number, until: number, over: Partial<RawFix> = {}) => {
  const out: RawFix[] = [];
  for (let s = start; s <= until; s += 2) out.push(d.fix(from + speed * (s - start), s, 0, { spd: speed, hdg: 0, ...over }));
  return out;
};
const stored = () => mockStore.get(recKey("owner-a"))!;
const label = (id: string) => screen.getByTestId(id).props.accessibilityLabel as string;

beforeEach(async () => {
  resetDialogs();
  await AsyncStorage.clear();
  mockStore.clear();
  mockWeek.view = { occurrences: [] };
  mockState.permission = "ok";
  mockState.updates = false;
  mockState.active = null;
  [mockDraft, mockAlert, nav.replace, nav.goBack, nav.navigate].forEach((f) => f.mockClear());
});

test("three views — Carte, Compteur, Mixte — switched in one tap and remembered for the account", async () => {
  await seed("running", 300, async (d) => d.feed(cruise(d, 0, 3, 0, 300)));
  show();
  // Compteur by default: two main figures of the sport (distance and moving time on foot), four secondary cells, the signal.
  await screen.findByTestId("gps-view-dash");
  expect(label("gps-main-distance")).toMatch(/^Distance : 0,90 km$/);
  expect(label("gps-main-moving")).toMatch(/^En mouvement : 5:0\d$/);
  expect(["speed", "avgMoving", "ascent", "elapsed"].map((k) => !!screen.getByTestId(`gps-cell-${k}`))).toEqual([true, true, true, true]);
  expect(label("gps-cell-speed")).toMatch(/^Allure : 5:33 \/km$/); // the receiver's own speed, 3 m/s
  expect(label("gps-cell-ascent")).toMatch(/non disponible\. Altitude pas assez fiable/);
  expect(label("gps-signal")).toBe("Signal GPS (± 5 m)");
  expect(label("gps-state")).toBe("En mouvement");
  expect(screen.queryByTestId("gps-map")).toBeNull();

  fireEvent.press(screen.getByText("Carte"));
  await screen.findByTestId("gps-view-map");
  expect(label("gps-map-surface")).toMatch(/Carte de la sortie : 0,90 km parcourus/);
  expect(screen.getByText("Fond neutre : trace et position seulement")).toBeTruthy();
  expect(label("gps-map-scale")).toBe("Échelle : 100 m"); // zoom 16 on foot
  fireEvent.press(screen.getByTestId("gps-map-zoom-out"));
  expect(label("gps-map-scale")).toBe("Échelle : 200 m");
  expect(screen.queryByTestId("gps-map-recenter")).toBeNull(); // still following the position
  expect(screen.getAllByTestId("gps-signal")).toHaveLength(1); // on the map, at its edge

  fireEvent.press(screen.getByText("Mixte"));
  await screen.findByTestId("gps-view-mixed");
  expect(screen.getByTestId("gps-map")).toBeTruthy();
  expect(screen.getByTestId("gps-main-distance")).toBeTruthy();
  expect(screen.queryByTestId("gps-cell-elapsed")).toBeNull(); // two cells only under the map
  await waitFor(async () => expect((await loadGpsPrefs("owner-a")).view).toBe("mixed"));
  // The footer is the same in every view.
  for (const id of ["gps-toggle", "gps-finish", "gps-more"]) expect(screen.getByTestId(id)).toBeTruthy();
});

test("a stop is said as a stop (« À l’arrêt depuis… »), with the signal still good — not as a lost signal", async () => {
  await seed("cycling", 250, async (d) => {
    await d.feed(cruise(d, 0, 6, 0, 120));
    const halt: RawFix[] = [];
    for (let s = 122; s <= 250; s += 2) halt.push(d.fix(720 + (s % 4 ? 0.5 : -0.5), s, 0, { spd: 0 }));
    await d.feed(halt);
  });
  show({ sport: "cycling" });
  await screen.findByTestId("gps-view-dash");
  expect(label("gps-state")).toMatch(/^À l’arrêt depuis 2:(0[5-9]|1\d)$/);
  expect(label("gps-signal")).toBe("Signal GPS (± 5 m)");
  expect(label("gps-main-speed")).toBe("Vitesse : 0,0 km/h");
  expect(label("gps-main-distance")).toMatch(/^Distance : 0,72 km$/);
  expect(label("gps-cell-moving")).toMatch(/^En mouvement : 2:0\d$/); // the stop is not in the moving time
  expect(stored().track.segs.flat().length).toBeLessThan(70);
});

test("no position for 40 s is « Sans signal »; an imprecise one is a weak signal that is not used", async () => {
  await seed("running", 100, async (d) => d.feed(cruise(d, 0, 3, 0, 60)));
  const view = show();
  await screen.findByTestId("gps-view-dash");
  expect(label("gps-state")).toBe("Sans signal");
  expect(label("gps-signal")).toMatch(/Signal GPS perdu/);
  expect(screen.getByText("Signal perdu")).toBeTruthy();
  expect(label("gps-cell-speed")).toMatch(/non disponible/);
  view.unmount();

  await seed("running", 60, async (d) => {
    await d.feed(cruise(d, 0, 3, 0, 40));
    await d.feed(cruise(d, 120, 3, 42, 60, { acc: 55 }));
  });
  show();
  await screen.findByTestId("gps-view-dash");
  expect(label("gps-signal")).toBe("Signal faible (± 55 m) : position non utilisée.");
  expect(screen.getByText("GPS faible ± 55 m")).toBeTruthy();
  expect(stored().track.why?.accuracy).toBe(10);
});

test("« Terminer » asks first: « Continuer la sortie » keeps recording, only the confirmation ends it", async () => {
  await seed("running", 120, async (d) => d.feed(cruise(d, 0, 3, 0, 120)));
  show();
  fireEvent.press(await screen.findByTestId("gps-finish"));
  expect(await screen.findByText("Terminer la sortie ?")).toBeTruthy();
  expect(stored().status).toBe("recording"); // still running while the question is open
  fireEvent.press(screen.getByText("Continuer la sortie"));
  await waitFor(() => expect(screen.queryByText("Terminer la sortie ?")).toBeNull());
  expect(stored().status).toBe("recording");
  expect(mockState.updates).toBe(true);
  expect(screen.getByText(/Enregistrement en cours/)).toBeTruthy();
  await waitFor(() => {
    if (!screen.queryByText("Terminer la sortie ?")) fireEvent.press(screen.getByTestId("gps-finish"));
    expect(screen.getByText("Oui, terminer")).toBeTruthy();
  });
  fireEvent.press(screen.getByText("Oui, terminer"));
  await screen.findByText(/Séance terminée/);
  expect(stored().status).toBe("ended");
  expect(mockState.updates).toBe(false);
});

test("paused: the time breakdown so far; ended: the bilan with the breakdown, the splits, the quality of the data and how it is computed", async () => {
  await seed("running", 1500, async (d) => {
    await d.feed(cruise(d, 0, 3, 0, 800)); // 2.4 km
    const halt: RawFix[] = [];
    for (let s = 802; s <= 920; s += 2) halt.push(d.fix(2400 + (s % 4 ? 0.4 : -0.4), s));
    await d.feed(halt); // 2 min standing
    d.clock(920);
    await d.rec.pause("owner-a");
    d.clock(1100); // 3 min of pause
    await d.rec.resume("owner-a");
    await d.feed([d.fix(2400, 1102), d.fix(2700, 1202), ...cruise(d, 2700, 3, 1204, 1500), d.fix(9000, 1500.5)]); // 100 s without a position, then one impossible jump
  });
  show();
  fireEvent.press(await screen.findByTestId("gps-toggle"));
  await screen.findByText(/^En pause · /);
  expect(screen.getByText("Jusqu’ici")).toBeTruthy();
  expect(label("gps-row-paused")).toMatch(/^En pause : 3:0\d$/);
  expect(label("gps-row-stopped")).toMatch(/^À l’arrêt : (1:5\d|2:0\d)\. 1 arrêt · le plus long (1 min 5\d|2 min( 0\d)?)$/);
  expect(screen.queryByTestId("gps-view-dash")).toBeNull();

  fireEvent.press(screen.getByTestId("gps-finish"));
  fireEvent.press(await screen.findByText("Oui, terminer"));
  await screen.findByText(/Séance terminée/);
  // Finished while paused: the outing ends where it last ran.
  expect(label("gps-row-elapsed")).toMatch(/^Temps total : 25:0\d\. Du départ à la fin$/);
  expect(label("gps-row-moving")).toMatch(/^En mouvement : 18:[12]\d$/);
  expect(label("gps-row-paused")).toMatch(/^En pause : 3:00$/);
  expect(label("gps-row-missing")).toMatch(/^Sans position : 1:40\. /);
  expect(label("gps-row-avg-moving")).toMatch(/^Allure moyenne en mouvement : 5:3\d \/km$/);
  expect(label("gps-row-avg-overall")).toMatch(/^Allure moyenne globale : 7:[2-4]\d \/km\. Arrêts, pauses et trous compris$/);
  expect(label("gps-main-distance")).toMatch(/^Distance : 3,2\d km$/);
  expect(within(screen.getByTestId("gps-timebar")).getByText(/^En mouvement 18 min/)).toBeTruthy();
  expect(within(screen.getByTestId("gps-timebar")).getByText(/^Sans position 1 min 40$/)).toBeTruthy();
  expect(screen.getByText("Dénivelé : altitude pas assez fiable sur cette sortie, aucun chiffre n’est affiché.")).toBeTruthy();
  const splits = within(screen.getByTestId("gps-splits"));
  expect(splits.getByText("km 1")).toBeTruthy();
  expect(splits.getByText("km 3")).toBeTruthy();
  const quality = within(screen.getByTestId("gps-quality"));
  expect(quality.getByText(/1 position refusée : vitesse impossible pour ce sport\./)).toBeTruthy();
  expect(quality.getByText(/Trou de 1 min 40 vers le km 2,4 : 0,30 km à vol d’oiseau, non ajoutés à la distance\./)).toBeTruthy();
  expect(label("gps-map-surface")).toMatch(/en 2 tronçons non reliés/);
  // The method, on demand.
  expect(screen.queryByText(/^Temps total : du départ à la fin/)).toBeNull();
  fireEvent.press(screen.getByTestId("gps-how"));
  expect(screen.getByText(/^Temps total : du départ à la fin, 25 min/)).toBeTruthy();
  expect(screen.getByText(/un arrêt est compté quand tu restes dans un rayon d’environ 6 m/)).toBeTruthy();
  expect(screen.getByText("La durée de la séance est le temps en mouvement.")).toBeTruthy();
  // Then the session: the effort as the duration, the digest with it, and a copy of the route kept on the phone to follow it later.
  fireEvent.press(screen.getByTestId("gps-keep"));
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("SessionForm", { sport: "running" }));
  const draft = mockDraft.mock.calls[0][1];
  expect(Math.abs(draft.gpx.movingMinutes - 18.3)).toBeLessThan(0.2);
  expect(draft.gps).toMatchObject({ v: 1, family: "run", pausedS: 180, missingS: 100, gapDistanceM: 300 });
  const kept = await listOfflineRoutes("owner-a");
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ id: draft.gpsRouteId, origin: "recorded", sport: "running" });
  expect((await loadRouteForFollow("owner-a", draft.gpsRouteId))!.segs).toHaveLength(2);
});

test("a route kept on the phone is offered before the start, followed after it, and the banner says what is left with a range", async () => {
  const line = GpsNav.makeRoute([Array.from({ length: 81 }, (_, i) => point(i * 50))], { name: "Tour du lac" })!; // 4 km north
  await saveRouteOffline("owner-a", "r1", line);
  const view = show({ sport: "running", follow: "r1" });
  expect(await screen.findByText(/Tour du lac · 4,00 km/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-start"));
  await screen.findByText(/Enregistrement en cours/);
  expect(stored().follow).toMatchObject({ id: "r1", name: "Tour du lac" });
  expect(within(screen.getByTestId("gps-follow")).getByText("En attente d’une position fiable pour te situer.")).toBeTruthy();
  view.unmount();

  // 80 m east of the start of the line: not on it yet.
  await seed("running", 20, async (d) => d.feed([d.fix(0, 2, 80), d.fix(4, 4, 80), d.fix(8, 6, 80)]), { follow: { id: "r1", name: "Tour du lac" } });
  const far = show({ sport: "running", follow: "r1" });
  expect(await screen.findByText("À 80 m du parcours")).toBeTruthy();
  far.unmount();

  // 6 minutes along it at 3 m/s: 1 080 m done, 2.92 km left, the estimate is a range at the pace of this outing.
  await seed("running", 360, async (d) => d.feed(cruise(d, 0, 3, 0, 360)), { follow: { id: "r1", name: "Tour du lac" } });
  show({ sport: "running", follow: "r1" });
  const banner = within(await screen.findByTestId("gps-follow"));
  expect(banner.getByText("Tour du lac")).toBeTruthy();
  expect(banner.getByText(/^Reste 2,92 km · arrivée estimée dans 14–20 min$/)).toBeTruthy();
  expect(banner.getByText("Estimation hors arrêts ; le relief à venir n’est pas pris en compte.")).toBeTruthy();
  // The planned line is on the map, apart from the travelled trace.
  fireEvent.press(screen.getByText("Carte"));
  expect(label("gps-map-surface")).toMatch(/parcours à suivre en pointillés/);
});

test("leaving the route shows « Hors parcours » in amber with the margin; a route that is not on the phone is said as such", async () => {
  await saveRouteOffline("owner-a", "r1", GpsNav.makeRoute([Array.from({ length: 81 }, (_, i) => point(i * 50))], { name: "Tour du lac" })!);
  await seed("running", 244, async (d) => {
    await d.feed(cruise(d, 0, 3, 0, 200));
    await d.feed(Array.from({ length: 22 }, (_, i) => d.fix(600, 202 + i * 2, (i + 1) * 6)));
  }, { follow: { id: "r1", name: "Tour du lac" } });
  const view = show();
  const banner = within(await screen.findByTestId("gps-follow"));
  expect(banner.getByText(/^Hors parcours · 13\d m$/)).toBeTruthy();
  expect(banner.getByText("Écart au-delà de la marge de 30 m, précision du GPS comprise.")).toBeTruthy();
  expect(stored().follow!.state.off).toBe(true);
  view.unmount();

  // An outing that follows a route since removed from the phone: the banner says so instead of showing a stale figure.
  await seed("running", 20, async (d) => d.feed([d.fix(0, 2), d.fix(6, 4), d.fix(12, 6)]), { follow: { id: "gone", name: "Ancien parcours" } });
  const missing = show();
  expect(await screen.findByText("Ce parcours n’est pas enregistré sur ce téléphone : il ne peut pas être suivi ici.")).toBeTruthy();
  missing.unmount();
  mockStore.clear();
  show({ sport: "running", follow: "gone" });
  expect(await screen.findByText(/Ce parcours n’est pas enregistré sur ce téléphone\. Ouvre-le dans Mes parcours/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-setup-route"));
  expect(nav.navigate).toHaveBeenCalledWith("Routes");
  fireEvent.press(screen.getByTestId("gps-start"));
  await screen.findByText(/Enregistrement en cours/);
  expect(stored().follow).toBeNull(); // nothing pretends to follow a line that is not there
});

test("« Retour au départ »: the two honest options, the straight line as an indication only, and the way back by the same path", async () => {
  await seed("hiking", 800, async (d) => {
    await d.feed(cruise(d, 0, 1.5, 0, 400)); // 600 m north
    await d.feed(Array.from({ length: 200 }, (_, i) => d.fix(600, 402 + i * 2, (i + 1) * 3))); // 600 m east
  });
  show({ sport: "hiking" });
  fireEvent.press(await screen.findByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-back"));
  const same = within(await screen.findByTestId("gps-back-same"));
  expect(same.getByText("Par le même chemin")).toBeTruthy();
  expect(same.getByText(/Distance par ce chemin : 1,20 km/)).toBeTruthy();
  expect(same.getByText(/^Temps estimé : 11–17 min, à ton rythme en mouvement, hors arrêts/)).toBeTruthy();
  expect(screen.getByText("Calcul d’itinéraire indisponible ici : il demande une connexion et un service de routage configuré.")).toBeTruthy();
  expect(screen.getByText(/^Départ à 84\d m à vol d’oiseau, direction sud-ouest — indication, pas un chemin\.$/)).toBeTruthy();
  expect(screen.getByText("Indication seulement : TITAN ne garantit ni l’état ni la sécurité du chemin.")).toBeTruthy();
  expect(screen.queryByTestId("gps-follow")).toBeNull();
  fireEvent.press(screen.getByTestId("gps-back-on"));
  const banner = within(await screen.findByTestId("gps-follow"));
  expect(banner.getByText("Retour au départ")).toBeTruthy();
  expect(banner.getByText(/^Reste 1,(19|20) km · retour estimé dans 11–17 min$/)).toBeTruthy();
  expect(stored().back!.state.joined).toBe(true);
  // Asked again: it can be stopped; the map draws the way back, never a straight line.
  fireEvent.press(screen.getByText("Carte"));
  expect(label("gps-map-surface")).toMatch(/chemin du retour en pointillés/);
  fireEvent.press(screen.getByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-back"));
  fireEvent.press(await screen.findByTestId("gps-back-off"));
  await waitFor(() => expect(stored().back).toBeNull());
});

test("a trace with a pause says its hole in the way back, and a trace too short says so", async () => {
  await seed("running", 400, async (d) => {
    await d.feed(cruise(d, 0, 3, 0, 100));
    d.clock(100);
    await d.rec.pause("owner-a");
    d.clock(200);
    await d.rec.resume("owner-a");
    await d.feed(cruise(d, 800, 3, 202, 400)); // resumed 500 m further
  });
  const view = show();
  fireEvent.press(await screen.findByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-back"));
  expect(await screen.findByText(/^1 trou non enregistré \(pause ou signal perdu\), environ 0,50 km à vol d’oiseau : le chemin entre les tronçons n’est pas connu et n’est pas dessiné\.$/)).toBeTruthy();
  view.unmount();
  await seed("running", 5, async () => {});
  show();
  fireEvent.press(await screen.findByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-back"));
  expect(await screen.findByText("Pas encore assez de trace enregistrée pour revenir sur tes pas.")).toBeTruthy();
  expect(screen.getByText("Le point de départ sera connu dès la première position fiable.")).toBeTruthy();
  expect(screen.queryByTestId("gps-back-on")).toBeNull();
});

test("« Ajouter un point ici » saves a private point at the latest good position", async () => {
  await addPlace("owner-a", { name: "Abri du col", kind: "shelter", lat: point(200).lat, lon: point(200).lon, note: "" });
  await seed("running", 120, async (d) => d.feed(cruise(d, 0, 3, 0, 120)));
  show();
  fireEvent.press(await screen.findByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-place"));
  expect(await screen.findByText("Le point est posé sur ta dernière position fiable (± 5 m).")).toBeTruthy();
  expect(screen.getByTestId("gps-place-add").props.accessibilityState.disabled).toBe(true); // a point needs a name
  fireEvent.changeText(screen.getByTestId("gps-place-name"), "  Fontaine   du lavoir ");
  fireEvent.press(screen.getByTestId("gps-place-kind-water"));
  fireEvent.press(screen.getByTestId("gps-place-add"));
  await waitFor(async () => expect(await listPlaces("owner-a")).toHaveLength(2));
  const added = (await listPlaces("owner-a"))[1]!;
  const here = point(360);
  expect(added).toMatchObject({ name: "Fontaine du lavoir", kind: "water", lat: Math.round(here.lat * 1e5) / 1e5, lon: Math.round(here.lon * 1e5) / 1e5, dirty: true });
  expect(await screen.findByText("Point ajouté")).toBeTruthy();
  // Both points are now markers on the map.
  fireEvent.press(screen.getByText("Carte"));
  await waitFor(() => expect(label("gps-map-surface")).toMatch(/2 points personnels/));
});

test("without a position yet, a point cannot be posed and the sheet says why", async () => {
  await seed("running", 4, async () => {});
  show();
  fireEvent.press(await screen.findByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-place"));
  expect(await screen.findByText(/Aucune position fiable pour l’instant/)).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("gps-place-name"), "Source");
  expect(screen.getByTestId("gps-place-add").props.accessibilityState.disabled).toBe(true);
  expect(label("gps-signal")).toBe("Recherche du signal GPS…");
});

test("structured session: the step banner says the step, what is left and what comes next; « Étape suivante » ends it by hand", async () => {
  const steps = GpsSession.buildPlan({ warmup: { by: "manual" }, reps: 2, work: { by: "distance", value: 400 }, recover: { by: "time", value: 90 }, cooldown: null });
  await seed("running", 100, async (d) => d.feed(cruise(d, 0, 3, 0, 100)), { plan: { steps, alerts: true } });
  show();
  const banner = within(await screen.findByTestId("gps-step"));
  expect(banner.getByText(/^Échauffement · depuis 1:4\d$/)).toBeTruthy();
  expect(banner.getByText("Ensuite : Effort 1/2 · 0,40 km")).toBeTruthy();
  expect(banner.getByText(/^Étape 1\/4 · au signal/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-step-skip"));
  await waitFor(() => expect(stored().plan!.cursor.index).toBe(1));
  expect(stored().plan!.cursor.laps[0]).toMatchObject({ kind: "warmup", manual: true, metres: 300 });
  expect(await within(screen.getByTestId("gps-step")).findByText(/^Effort 1\/2 · reste 0,40 km$/)).toBeTruthy();
  expect(within(screen.getByTestId("gps-step")).getByText("Ensuite : Récupération 1/1 · 1:30")).toBeTruthy();
  // A batch from the background task ends the 400 m: the banner follows, and the vibration was asked for.
  const last = stored().track.segs.at(-1)!.at(-1)!;
  await act(async () => void (await require("../src/lib/gpsNative").recorder.append("owner-a", Array.from({ length: 25 }, (_, i) => ({ ...point(300 + (i + 1) * 17), alt: null, altAcc: null, acc: 5, t: last.t + (i + 1) * 2000 })))));
  await waitFor(() => expect(stored().plan!.cursor.index).toBe(2));
  expect(mockAlert).toHaveBeenCalledWith("step");
  expect(await within(screen.getByTestId("gps-step")).findByText(/^Récupération 1\/1 · reste /)).toBeTruthy();
});

test("goal: the banner says where the outing stands; a goal can be set during the outing from « Plus »", async () => {
  await seed("cycling", 600, async (d) => d.feed(cruise(d, 0, 6, 0, 600)), { goal: { kind: "distance", km: 10 } });
  show({ sport: "cycling" });
  const banner = within(await screen.findByTestId("gps-goal"));
  expect(banner.getByText("Objectif 10 km")).toBeTruthy();
  expect(banner.getByText("Reste 6,40 km")).toBeTruthy();
  expect(banner.getByText(/^Environ 1\d min à 2\d min à ton rythme en mouvement, hors arrêts\.$/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-goal"));
  fireEvent.press(await screen.findByText("Durée"));
  fireEvent.changeText(screen.getByTestId("gps-goal-minutes"), "8");
  fireEvent.press(screen.getByTestId("gps-goal-apply"));
  await waitFor(() => expect(stored().goal).toEqual({ kind: "time", minutes: 8 }));
  expect(await within(screen.getByTestId("gps-goal")).findByText("Objectif de durée atteint.")).toBeTruthy();
});

test("before the start: goal, structured session and settings are chosen in sheets and travel with « Démarrer »", async () => {
  // Monday's plan has 45 min of running today: offered, never imposed.
  mockWeek.view = { occurrences: [{ id: "occ-1", status: "today", effective: { sport: "running", day: "2026-11-25" }, planned: { minutes: 45 } }] };
  show();
  await screen.findByTestId("gps-start");
  expect(within(screen.getByTestId("gps-setup-route")).getByText("Choisir dans Mes parcours")).toBeTruthy();
  expect(within(screen.getByTestId("gps-setup-goal")).getByText("Aucun · Prévu aujourd’hui : 45 min")).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-setup-goal"));
  fireEvent.press(await screen.findByTestId("gps-goal-planned"));
  expect(await within(screen.getByTestId("gps-setup-goal")).findByText("45 min")).toBeTruthy();

  fireEvent.press(screen.getByTestId("gps-setup-plan"));
  await screen.findByTestId("gps-plan-preview");
  expect(screen.getByTestId("gps-plan-apply").props.accessibilityState.disabled).toBe(true);
  fireEvent.press(within(screen.getByTestId("gps-plan-warmup")).getByText("Temps"));
  fireEvent.changeText(screen.getByTestId("gps-plan-warmup-value"), "10:00");
  fireEvent.press(within(screen.getByTestId("gps-plan-work")).getByText("Distance"));
  fireEvent.changeText(screen.getByTestId("gps-plan-work-value"), "1,5 km");
  fireEvent.changeText(screen.getByTestId("gps-plan-reps"), "3");
  fireEvent.press(within(screen.getByTestId("gps-plan-recover")).getByText("Temps"));
  fireEvent.changeText(screen.getByTestId("gps-plan-recover-value"), "abc");
  expect(screen.getByText("Une valeur n’est pas lisible : corrige-la pour valider.")).toBeTruthy();
  expect(screen.getByTestId("gps-plan-apply").props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByTestId("gps-plan-recover-value"), "1:30");
  fireEvent.press(within(screen.getByTestId("gps-plan-cooldown")).getByText("Au signal"));
  const preview = within(screen.getByTestId("gps-plan-preview"));
  expect(preview.getByText("7 étapes")).toBeTruthy();
  for (const line of ["Échauffement · 10:00", "Effort 1/3 · 1,50 km", "Récupération 2/2 · 1:30", "Effort 3/3 · 1,50 km", "Retour au calme · au signal"]) expect(preview.getByText(line)).toBeTruthy();
  expect(screen.getByText(/il ne prescrit aucune intensité/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-plan-alerts"));
  fireEvent.press(screen.getByTestId("gps-plan-apply"));
  expect(await within(screen.getByTestId("gps-setup-plan")).findByText("7 étapes")).toBeTruthy();

  fireEvent.press(screen.getByTestId("gps-setup-settings"));
  expect(await screen.findByText("Fond de carte non configuré dans cette version : la carte montre ta trace sur fond neutre.")).toBeTruthy();
  expect(screen.queryByTestId("gps-basemap")).toBeNull(); // no switch for something that cannot work
  expect(screen.getByText(/Activée : la durée de la séance est ton temps en mouvement/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-auto-pause"));
  expect(await screen.findByText("Désactivée : les arrêts détectés restent dans la durée de la séance.")).toBeTruthy();
  // The four secondary figures: one replaced by another.
  expect(screen.getByTestId("gps-field-ascent").props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByTestId("gps-field-ascent"));
  fireEvent.press(screen.getByTestId("gps-field-clock"));
  await waitFor(async () => expect((await loadGpsPrefs("owner-a")).fields.run).toEqual(["speed", "avgMoving", "elapsed", "clock"]));
  fireEvent.press(screen.getByTestId("gps-field-stopped")); // a fifth is not added
  expect(screen.getByTestId("gps-field-stopped").props.accessibilityState.selected).toBe(false);
  // The optional per-kilometre voice kept its switch, here.
  expect(screen.getByTestId("gps-voice").props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByTestId("gps-voice"));
  await waitFor(async () => expect(await voiceEnabled()).toBe(false));
  fireEvent.press(screen.getAllByLabelText("Fermer").at(-1)!);

  fireEvent.press(screen.getByTestId("gps-start"));
  await screen.findByText(/Enregistrement en cours/);
  const r = stored();
  expect(r.goal).toEqual({ kind: "time", minutes: 45 });
  expect(r.opts).toEqual({ autoPause: false, offRouteAlert: true });
  expect(r.plan!.steps).toHaveLength(7);
  expect(r.plan!.alerts).toBe(false);
  expect(await loadGpsPrefs("owner-a")).toMatchObject({ autoPause: false, stepAlerts: false });
  expect(screen.getByTestId("gps-cell-clock")).toBeTruthy();
  expect(screen.queryByTestId("gps-cell-ascent")).toBeNull();
  expect(screen.getByTestId("gps-step")).toBeTruthy();
  expect(screen.getByTestId("gps-goal")).toBeTruthy();
});

test("small phone (320 × 640) and large text (×1.3): the three views render, the figures shrink to fit instead of being cut", async () => {
  const dims = jest.spyOn(RN, "useWindowDimensions").mockReturnValue({ width: 320, height: 640, scale: 3, fontScale: 1.3 });
  let view: ReturnType<typeof show> | null = null;
  try {
    await saveGpsPrefs("owner-a", { view: "map" });
    await saveRouteOffline("owner-a", "r1", GpsNav.makeRoute([Array.from({ length: 81 }, (_, i) => point(i * 50))], { name: "Tour du lac par la rive nord et le belvédère" })!);
    const steps = GpsSession.buildPlan({ warmup: { by: "time", value: 600 }, reps: 4, work: { by: "distance", value: 1000 }, recover: { by: "time", value: 120 } });
    await seed("trail", 4000, async (d) => d.feed(cruise(d, 0, 3, 0, 4000)), { follow: { id: "r1", name: "Tour du lac par la rive nord et le belvédère" }, plan: { steps, alerts: true }, goal: { kind: "return", at: Date.now() + 3600_000 } });
    view = show({ sport: "trail" }, { width: 320, height: 640 });
    await screen.findByTestId("gps-view-map"); // the remembered view
    for (const view of ["Compteur", "Mixte", "Carte"]) {
      fireEvent.press(screen.getByText(view));
      for (const id of ["gps-toggle", "gps-finish", "gps-more", "gps-follow", "gps-step", "gps-goal", "gps-state"]) expect(screen.getByTestId(id)).toBeTruthy();
    }
    fireEvent.press(screen.getByText("Compteur"));
    const big = within(screen.getByTestId("gps-main-moving")).getByText(/^1:06:4\d$/);
    expect(big.props.adjustsFontSizeToFit).toBe(true);
    expect(big.props.numberOfLines).toBe(1);
    expect(big.props.allowFontScaling).not.toBe(false);
    // Sentences are never truncated: no line limit on the banners.
    const follow = within(screen.getByTestId("gps-follow")).getByText(/^Hors parcours|^Reste|^Tu es au bout/);
    expect(follow.props.numberOfLines).toBeUndefined();
    expect(within(screen.getByTestId("gps-goal")).getByText(/^Retour pour \d\d:\d\d$/)).toBeTruthy();
  } finally {
    view?.unmount(); // before the real hook comes back: a mounted component must keep the same hooks
    dims.mockRestore();
  }
});

test("« Suivre ce parcours » opened during an outing attaches the route to it; settings changed during the outing apply at once", async () => {
  await saveRouteOffline("owner-a", "r1", GpsNav.makeRoute([Array.from({ length: 81 }, (_, i) => point(i * 50))], { name: "Tour du lac" })!);
  await seed("running", 360, async (d) => d.feed(cruise(d, 0, 3, 0, 360)));
  expect(stored().follow).toBeNull();
  show({ sport: "running", follow: "r1" });
  await waitFor(() => expect(stored().follow).toMatchObject({ id: "r1", name: "Tour du lac", state: { joined: true } }));
  expect(await within(await screen.findByTestId("gps-follow")).findByText(/^Reste 2,92 km/)).toBeTruthy(); // placed at once, from the latest position
  fireEvent.press(screen.getByTestId("gps-more"));
  fireEvent.press(await screen.findByTestId("gps-more-settings"));
  fireEvent.press(await screen.findByTestId("gps-auto-pause"));
  fireEvent.press(screen.getByTestId("gps-off-alert"));
  await waitFor(() => expect(stored().opts).toEqual({ autoPause: false, offRouteAlert: false }));
  expect(await loadGpsPrefs("owner-a")).toMatchObject({ autoPause: false, offRouteAlert: false });
  expect(stored().status).toBe("recording");
});
