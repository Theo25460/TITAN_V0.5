/* V1.7.7 — the planning screen: an honest panel when no routing service exists (the state of today), the form for A → B and for a
   loop, every failure rendered with what to do next, and a result that can be saved as a planned route or followed at once. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { addPlace } from "../src/lib/places";
import { listOfflineRoutes, loadRouteForFollow, pendingLibraryRoutes, _resetLibraryForTests } from "../src/lib/routeLibrary";

const mockApi = { siteFunction: jest.fn(), routeSaveV2: jest.fn(), routesLibrary: jest.fn(), routeGetV2: jest.fn(), routeRename: jest.fn() } as Record<string, jest.Mock>;
jest.mock("../src/data/api", () => ({
  siteFunction: (...a: unknown[]) => mockApi.siteFunction(...a), routeSaveV2: (...a: unknown[]) => mockApi.routeSaveV2(...a), routesLibrary: (...a: unknown[]) => mockApi.routesLibrary(...a),
  routeGetV2: (...a: unknown[]) => mockApi.routeGetV2(...a), routeRename: (...a: unknown[]) => mockApi.routeRename(...a),
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "o1", useAuth: () => ({ owner: "o1" }) }));
jest.mock("../src/lib/exportFile", () => ({ shareTextFile: jest.fn(async () => undefined) }));
const mockLocation = { granted: true };
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 }, hasServicesEnabledAsync: async () => true,
  getForegroundPermissionsAsync: async () => ({ granted: mockLocation.granted, canAskAgain: false }),
  requestForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 48.58392, longitude: 7.74553, accuracy: 8 }, timestamp: 1 }),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { RoutePlannerScreen } = require("../src/screens/session/RoutePlannerScreen");
const { DialogHost, resetDialogs } = require("../src/components/Dialog");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const wrap = (params?: { sport?: string }) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SafeAreaProvider initialMetrics={metrics}><ToastProvider><RoutePlannerScreen navigation={nav} route={{ params }} /><DialogHost /></ToastProvider></SafeAreaProvider></QueryClientProvider>);

type Body = { profile: string; points?: number[][]; loop?: { start: number[]; distanceM: number; seed?: number }; prefer?: Record<string, boolean> };
const refuse = (status: number, code: string) => ({ status, body: { ok: false, code } });
const plan = (body: Body, over: Record<string, unknown> = {}) => ({ status: 200, body: {
  ok: true, provider: "openrouteservice", attribution: "© openrouteservice.org, © les contributeurs d’OpenStreetMap", profile: body.profile, profileNote: null,
  distanceM: body.loop ? 21400 + (body.loop.seed ?? 0) * 100 : 6200, durationS: 4320, ascentM: 240, descentM: 238,
  segs: [Array.from({ length: 40 }, (_, i) => [48.58 + i * 0.001, 7.74 + i * 0.001, 140 + i])],
  surface: [{ key: "asphalt", label: "Asphalte", share: 0.7 }, { key: "unknown", label: "Non renseigné", share: 0.3 }], waytype: null,
  warnings: ["Préférence « voies calmes » non prise en charge par le fournisseur pour ce profil : elle n’a pas été appliquée."],
  requested: { profile: body.profile, ...(body.loop ? { loop: { ...body.loop, seed: body.loop.seed ?? 0 } } : { points: body.points }), prefer: body.prefer ?? {} }, ...over,
} });
/** What the server answers to a computation; the probe sent when the screen opens (no position) is answered apart. */
let compute: (body: Body) => unknown = (body) => plan(body);
let probe: () => unknown = () => refuse(400, "BAD_REQUEST");
const computations = () => mockApi.siteFunction.mock.calls.map((c) => c[2] as Body).filter((b) => b.points || b.loop);
const pickCoords = async (target: number | "loop", text: string) => {
  fireEvent.press(await screen.findByTestId(`point-pick-${target}`));
  fireEvent.changeText(await screen.findByTestId("point-coords"), text);
  fireEvent.press(screen.getByTestId("point-coords-use"));
  await waitFor(() => expect(screen.queryByTestId("point-coords")).toBeNull());
};

beforeEach(async () => {
  _resetLibraryForTests();
  resetDialogs();
  await AsyncStorage.clear();
  Object.values(mockApi).forEach((m) => m.mockReset());
  nav.navigate.mockClear();
  mockLocation.granted = true;
  compute = (body) => plan(body);
  probe = () => refuse(400, "BAD_REQUEST");
  mockApi.siteFunction.mockImplementation(async (_owner: string, name: string, body: Body) => {
    expect(name).toBe("route-plan");
    return body.points || body.loop ? compute(body) : probe();
  });
  mockApi.routesLibrary.mockResolvedValue({ routes: [], legacy: false });
});

test("no routing service on the server: a full explanation instead of a form — what is needed, what works meanwhile", async () => {
  probe = () => refuse(503, "ROUTING_NOT_CONFIGURED");
  wrap();
  expect(await screen.findByTestId("planner-not-configured")).toBeTruthy();
  expect(screen.getByText("La planification n’est pas encore disponible")).toBeTruthy();
  expect(screen.getByText(/un compte chez un fournisseur d’itinéraires, configuré sur le serveur TITAN \(voir docs\/V177_CARTES_ET_ROUTAGE\.md\)/)).toBeTruthy();
  expect(screen.getByText("• Importer un GPX créé dans n’importe quel planificateur, puis le suivre.")).toBeTruthy();
  expect(screen.getByText("• Suivre un parcours déjà enregistré dans Mes parcours.")).toBeTruthy();
  expect(screen.getByText("• Pendant une sortie GPS, revenir par le même chemin.")).toBeTruthy();
  // No button that could not work: nothing to compute with.
  expect(screen.queryByTestId("planner-compute")).toBeNull();
  fireEvent.press(screen.getByTestId("planner-import"));
  expect(nav.navigate).toHaveBeenCalledWith("Routes", { importGpx: true });
  fireEvent.press(screen.getByTestId("planner-library"));
  expect(nav.navigate).toHaveBeenCalledWith("Routes");
  // Once the server is set up, « Vérifier de nouveau » brings the form.
  probe = () => refuse(400, "BAD_REQUEST");
  fireEvent.press(screen.getByTestId("planner-recheck"));
  expect(await screen.findByTestId("planner-compute")).toBeTruthy();
});

test("A → B: points typed, taken from my points or read from my position; steps are added, moved and removed; the request follows the form", async () => {
  await addPlace("o1", { name: "Fontaine du col", kind: "water", lat: 48.6, lon: 7.8 }, "pl-aaaaaaa1");
  wrap({ sport: "hiking" });
  expect(await screen.findByText("Profil (proposé pour randonnée)")).toBeTruthy();
  expect(screen.getByTestId("profile-hike").props.accessibilityState.selected).toBe(true);
  // Computing with nothing chosen names what is missing, and asks nothing of the server.
  fireEvent.press(screen.getByTestId("planner-compute"));
  expect(await screen.findByText("Choisis le point de départ.")).toBeTruthy();
  expect(computations()).toHaveLength(0);

  fireEvent.press(screen.getByTestId("point-pick-0"));
  expect(await screen.findByText("Recherche d’adresse non disponible : choisis un point enregistré ou saisis des coordonnées")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("point-coords"), "chez moi");
  fireEvent.press(screen.getByTestId("point-coords-use"));
  expect(await screen.findByTestId("point-error")).toBeTruthy();
  fireEvent.press(screen.getByTestId("point-here"));
  await waitFor(() => expect(screen.getByTestId("point-value-0").props.children).toBe("Ma position"));
  fireEvent.press(screen.getByTestId("point-pick-1"));
  fireEvent.press(await screen.findByTestId("point-place-pl-aaaaaaa1"));
  await waitFor(() => expect(screen.getByTestId("point-value-1").props.children).toBe("Fontaine du col"));
  fireEvent.press(screen.getByTestId("point-add"));
  await pickCoords(1, "48.59, 7.77");
  fireEvent.press(screen.getByTestId("point-add"));
  await pickCoords(2, "48.595, 7.79");
  // The second step goes before the first, then is removed.
  fireEvent.press(screen.getByTestId("point-up-2"));
  expect(screen.getByTestId("point-value-1").props.children).toBe("48.59500, 7.79000");
  fireEvent.press(screen.getByTestId("point-remove-1"));
  fireEvent.press(screen.getByTestId("profile-walk"));
  fireEvent.press(screen.getByTestId("planner-compute"));
  await screen.findByTestId("plan-result");
  expect(computations()).toEqual([{ profile: "walk", points: [[48.58392, 7.74553], [48.59, 7.77], [48.6, 7.8]] }]);
});

test("my position refused: the reason is said and the coordinates remain; a route's start can be a point", async () => {
  mockLocation.granted = false;
  const R1 = "11111111-1111-4111-8111-111111111111";
  mockApi.routesLibrary.mockResolvedValue({ legacy: false, routes: [{ id: R1, sport: "running", startedAt: "2026-11-02T08:00:00Z", distanceM: 5300, durationS: 1800, ascentM: 42, points: 60, name: "Tour du lac", origin: "recorded", summary: null }] });
  mockApi.routeGetV2.mockResolvedValue({ id: R1, sport: "running", legacy: false, track: { v: 1, t0: 0, segs: [[[4858000, 774000, 0, null], [4859000, 775000, 0, null], [4860000, 776000, 0, null]]] } });
  wrap();
  fireEvent.press(await screen.findByTestId("point-pick-0"));
  fireEvent.press(await screen.findByTestId("point-here"));
  expect(await screen.findByText(/La localisation est refusée pour TITAN dans les réglages d’Android/)).toBeTruthy();
  fireEvent.press(await screen.findByTestId(`point-route-end-${R1}`));
  await waitFor(() => expect(screen.getByTestId("point-value-0").props.children).toBe("Arrivée de « Tour du lac »"));
  expect(screen.getByText("48.60000, 7.76000")).toBeTruthy();
});

test.each([
  ["NO_ROUTE", 422, "Aucun itinéraire trouvé", false],
  ["RATE_LIMITED", 429, "Trop de calculs", true],
  ["QUOTA_EXCEEDED", 503, "Quota atteint", false],
  ["UPSTREAM_UNAVAILABLE", 502, "Service d’itinéraire indisponible", true],
  ["AUTH_REQUIRED", 401, "Session expirée", false],
  ["BAD_REQUEST", 400, "Demande refusée", false],
])("a failed computation is explained and the form stays: %s", async (code, status, title, retry) => {
  compute = () => refuse(status as number, code as string);
  wrap();
  await pickCoords(0, "48.58, 7.74");
  await pickCoords(1, "48.6, 7.8");
  fireEvent.press(screen.getByTestId("planner-compute"));
  expect(await screen.findByTestId(`planner-state-${code}`)).toBeTruthy();
  expect(screen.getByText(title as string)).toBeTruthy();
  expect(screen.queryByTestId("plan-result")).toBeNull();
  expect(!!screen.queryByTestId("planner-retry")).toBe(retry);
  expect(screen.getByTestId("planner-compute").props.accessibilityState.busy).toBe(false);
});

test("no network, an unreadable answer, then a retry that works; a service found missing at computation shows the full panel", async () => {
  compute = () => { throw new TypeError("Network request failed"); };
  const first = wrap();
  await pickCoords(0, "48.58, 7.74");
  await pickCoords(1, "48.6, 7.8");
  fireEvent.press(screen.getByTestId("planner-compute"));
  expect(await screen.findByTestId("planner-state-OFFLINE")).toBeTruthy();
  expect(screen.getByText("Le calcul d’itinéraire demande une connexion. Tes parcours enregistrés restent utilisables.")).toBeTruthy();
  compute = () => ({ status: 200, body: { ok: true, segs: [] } });
  fireEvent.press(screen.getByTestId("planner-retry"));
  expect(await screen.findByTestId("planner-state-UNKNOWN")).toBeTruthy();
  compute = (body) => plan(body);
  fireEvent.press(screen.getByTestId("planner-retry"));
  expect(await screen.findByTestId("plan-result")).toBeTruthy();
  first.unmount();

  compute = () => ({ status: 404, body: null });
  wrap();
  await pickCoords(0, "48.58, 7.74");
  await pickCoords(1, "48.6, 7.8");
  fireEvent.press(screen.getByTestId("planner-compute"));
  expect(await screen.findByTestId("planner-not-configured")).toBeTruthy();
});

test("loop: asked against obtained, the provider's time named as such, shares as bars, warnings; another proposal changes the seed", async () => {
  wrap({ sport: "cycling" });
  fireEvent.press(await screen.findByText("Boucle"));
  await pickCoords("loop", "48.58391, 7.74553");
  fireEvent.changeText(screen.getByTestId("loop-distance"), "20");
  fireEvent(screen.getByTestId("loop-flat"), "valueChange", true);
  fireEvent(screen.getByTestId("loop-quiet"), "valueChange", true);
  fireEvent.press(screen.getByTestId("planner-compute"));
  expect(await screen.findByTestId("plan-result")).toBeTruthy();
  expect(computations()).toEqual([{ profile: "bike", loop: { start: [48.58391, 7.74553], distanceM: 20000 }, prefer: { flat: true, quiet: true } }]);
  expect(screen.getByTestId("plan-loop").props.children).toBe("Distance demandée : 20,0 km · obtenue : 21,4 km (+7 %)");
  expect(screen.getByTestId("plan-relief").props.children).toBe("Tu as demandé plutôt plat · D+ obtenu : 240 m (préférence, pas garantie)");
  expect(screen.getByTestId("plan-duration").props.children).toBe("Durée estimée par le fournisseur : 1 h 12. C’est son calcul, pas ton allure.");
  expect(screen.getByText("240 m")).toBeTruthy();
  expect(screen.getByText("D+ · D− 238 m")).toBeTruthy();
  expect(screen.getByLabelText("Revêtement : Asphalte 70 %, Non renseigné 30 %")).toBeTruthy();
  expect(screen.getByText("Type de voie : donnée non fournie")).toBeTruthy();
  expect(screen.getByText(/Préférence « voies calmes » non prise en charge/)).toBeTruthy();
  expect(screen.getByTestId("plan-attribution").props.children.join("")).toBe("Calculé par openrouteservice · © openrouteservice.org, © les contributeurs d’OpenStreetMap");
  expect(screen.getByText(/Itinéraire indicatif : TITAN ne connaît ni l’état des chemins/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("plan-another"));
  await waitFor(() => expect(computations()).toHaveLength(2));
  expect(computations()[1]!.loop).toEqual({ start: [48.58391, 7.74553], distanceM: 20000, seed: 1 });
  await waitFor(() => expect(screen.getByTestId("plan-loop").props.children).toBe("Distance demandée : 20,0 km · obtenue : 21,5 km (+8 %)"));
  // « Modifier » comes back to the form with what was typed.
  fireEvent.press(screen.getByTestId("plan-edit"));
  expect((await screen.findByTestId("loop-distance")).props.value).toBe("20");
});

test("a missing duration or surface is said as missing; the provider's note about the profile is shown", async () => {
  compute = (body) => plan(body, { durationS: null, ascentM: null, descentM: null, surface: null, profileNote: "Le fournisseur n’a pas de profil course à pied : calcul avec le profil marche, sans durée estimée.", warnings: [] });
  wrap({ sport: "running" });
  await pickCoords(0, "48.58, 7.74");
  await pickCoords(1, "48.6, 7.8");
  fireEvent.press(screen.getByTestId("planner-compute"));
  expect((await screen.findByTestId("plan-duration")).props.children).toBe("Durée : non fournie par le fournisseur pour ce profil.");
  expect(screen.getByText("Revêtement : donnée non fournie")).toBeTruthy();
  expect(screen.getByText("D+ non fourni")).toBeTruthy();
  expect(screen.getByTestId("plan-profile-note").props.children).toMatch(/sans durée estimée/);
  expect(screen.queryByTestId("plan-loop")).toBeNull();
  expect(screen.queryByTestId("plan-another")).toBeNull();
});

test("the result is saved as a planned route (name, sport, origin) through the offline-first path, or followed at once from the phone", async () => {
  mockApi.routeSaveV2.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", created: true, legacy: false });
  const first = wrap({ sport: "gravel" });
  await pickCoords(0, "48.58, 7.74");
  await pickCoords(1, "48.6, 7.8");
  fireEvent.press(screen.getByTestId("planner-compute"));
  expect((await screen.findByTestId("plan-name")).props.value).toMatch(/^Itinéraire 6[,.]2\s?km · Gravel$/);
  fireEvent.changeText(screen.getByTestId("plan-name"), "Boucle du canal");
  fireEvent.press(screen.getByTestId("plan-save"));
  await waitFor(() => expect(mockApi.routeSaveV2).toHaveBeenCalledWith("o1", expect.objectContaining({ name: "Boucle du canal", sport: "gravel", origin: "planned", durationS: 0, ascentM: 39, track: expect.objectContaining({ v: 1 }) })));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith("Routes"));
  expect((await listOfflineRoutes("o1")).map((m) => m.id)).toEqual(["22222222-2222-4222-8222-222222222222"]);
  expect(await pendingLibraryRoutes("o1")).toEqual([]);
  first.unmount();

  mockApi.routeSaveV2.mockClear();
  wrap({ sport: "gravel" });
  await pickCoords(0, "48.58, 7.74");
  await pickCoords(1, "48.6, 7.8");
  fireEvent.press(screen.getByTestId("planner-compute"));
  fireEvent.press(await screen.findByTestId("plan-follow"));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith("GpsRecord", { sport: "gravel", follow: expect.any(String) }));
  const id = (nav.navigate.mock.calls.find((c) => c[0] === "GpsRecord")![1] as { follow: string }).follow;
  expect(await loadRouteForFollow("o1", id)).toMatchObject({ origin: "planned", sport: "gravel", points: 40 });
  expect(mockApi.routeSaveV2).not.toHaveBeenCalled();
});
