/* V1.7.7 — useful points on the screens: nothing is asked before a tap, the states of today (service not set up, no network) are
   said plainly, the results quote the map without interpreting it, and along a route they come in the order they are met. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { GpsNav } from "../src/core";
import { listPlaces } from "../src/lib/places";
import { _resetLibraryForTests } from "../src/lib/routeLibrary";

const mockApi = { placesList: jest.fn(), placeSave: jest.fn(), placeDelete: jest.fn(), siteFunction: jest.fn(), routeGetV2: jest.fn(), routesLibrary: jest.fn() } as Record<string, jest.Mock>;
jest.mock("../src/data/api", () => ({
  placesList: (...a: unknown[]) => mockApi.placesList(...a), placeSave: (...a: unknown[]) => mockApi.placeSave(...a), placeDelete: (...a: unknown[]) => mockApi.placeDelete(...a),
  siteFunction: (...a: unknown[]) => mockApi.siteFunction(...a), routeGetV2: (...a: unknown[]) => mockApi.routeGetV2(...a), routesLibrary: (...a: unknown[]) => mockApi.routesLibrary(...a),
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "o1", useAuth: () => ({ owner: "o1" }) }));
jest.mock("../src/lib/exportFile", () => ({ shareTextFile: jest.fn(async () => undefined) }));
const mockLocation = { granted: true, reads: 0 };
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 }, hasServicesEnabledAsync: async () => true,
  getForegroundPermissionsAsync: async () => ({ granted: mockLocation.granted, canAskAgain: false }),
  requestForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
  getCurrentPositionAsync: async () => { mockLocation.reads++; return { coords: { latitude: 48.583912, longitude: 7.745534, accuracy: 8 }, timestamp: 1 }; },
  getLastKnownPositionAsync: async () => null,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { PlacesScreen } = require("../src/screens/session/PlacesScreen");
const { RouteDetailScreen } = require("../src/screens/session/RoutesScreen");
const { DialogHost, resetDialogs } = require("../src/components/Dialog");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{ui}<DialogHost /></ToastProvider></SafeAreaProvider></QueryClientProvider>);
const fetched = new Date(2026, 10, 25, 14, 5, 0).toISOString();
const answer = (pois: unknown[], over: Record<string, unknown> = {}) => ({ status: 200, body: { ok: true, source: "OpenStreetMap", license: "ODbL", attribution: "© les contributeurs d’OpenStreetMap", fetchedAt: fetched, pois, truncated: false, ...over } });
const texts = () => screen.UNSAFE_root.findAll((n) => typeof n.type === "string" && (n.type as string) === "Text").map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children ?? ""))).join("\n");

beforeEach(async () => {
  _resetLibraryForTests();
  resetDialogs();
  await AsyncStorage.clear();
  Object.values(mockApi).forEach((m) => m.mockReset());
  Object.assign(mockLocation, { granted: true, reads: 0 });
  mockApi.placesList.mockResolvedValue([]);
});

test("around me: nothing is read or sent before the search; results show distance, quoted hours, freshness and their source; one can be kept", async () => {
  mockApi.siteFunction.mockResolvedValue(answer([
    { id: "node/2", kind: "toilets", lat: 48.5929, lon: 7.7455, name: null, openingHours: null, fee: null, access: null, osmUpdatedAt: null },
    { id: "node/1", kind: "water", lat: 48.5861, lon: 7.7455, name: "Fontaine Saint-Martin", openingHours: "Mo-Su 08:00-20:00", fee: "no", access: "yes", osmUpdatedAt: "2024-06-01T10:00:00Z" },
  ]));
  wrap(<PlacesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("poi-open"));
  await screen.findByTestId("poi-search");
  expect(mockApi.siteFunction).not.toHaveBeenCalled();
  expect(mockLocation.reads).toBe(0);
  fireEvent.press(screen.getByTestId("poi-kind-shelter"));
  fireEvent.press(screen.getByTestId("poi-kind-bike_repair"));
  fireEvent.press(screen.getByText("2 km"));
  fireEvent.press(screen.getByTestId("poi-search"));
  expect(await screen.findByText("Fontaine Saint-Martin")).toBeTruthy();
  expect(mockApi.siteFunction).toHaveBeenCalledTimes(1);
  expect(mockApi.siteFunction.mock.calls[0]!.slice(0, 3)).toEqual(["o1", "poi-nearby", { kinds: ["water", "toilets"], around: { lat: 48.584, lon: 7.746, radiusM: 2000 } }]);
  expect(screen.getByTestId("poi-source").props.children).toBe("Source : OpenStreetMap (ODbL), relevé du 25/11 à 14:05");
  // Nearest first, each with what the map says and nothing more.
  expect(screen.getByText("à 240 m · Point d’eau · fiche modifiée en 2024")).toBeTruthy();
  expect(screen.getByText("Horaires indiqués : Mo-Su 08:00-20:00 (non vérifiés)")).toBeTruthy();
  expect(screen.getByText("accès indiqué : yes · tarif indiqué : no (non vérifié)")).toBeTruthy();
  expect(screen.getAllByText("Toilettes")).toHaveLength(2); // the chip, and the unnamed point called by its kind
  expect(screen.getByText("à 1,0 km · fraîcheur inconnue")).toBeTruthy();
  expect(texts()).not.toMatch(/\bouverte?s?\b/i);
  fireEvent.press(screen.getByTestId("poi-save-node/1"));
  await waitFor(async () => expect(await listPlaces("o1")).toEqual([expect.objectContaining({ name: "Fontaine Saint-Martin", kind: "water", lat: 48.5861, lon: 7.7455, note: "Repris d’OpenStreetMap le 25/11/2026" })]));
  expect(await screen.findByText("Enregistré dans tes points")).toBeTruthy();
});

test("around me: source not set up, nothing found, then no network with the last reading still shown with its date", async () => {
  mockApi.siteFunction.mockResolvedValue({ status: 503, body: { ok: false, code: "POI_NOT_CONFIGURED" } });
  const first = wrap(<PlacesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("poi-open"));
  fireEvent.press(await screen.findByTestId("poi-search"));
  expect(await screen.findByText("Points utiles : service pas encore en place")).toBeTruthy();
  expect(screen.getByText(/Ce n’est pas un réglage de ton téléphone/)).toBeTruthy();
  expect(screen.queryByTestId("poi-retry")).toBeNull();
  expect(screen.queryByTestId("poi-source")).toBeNull();

  mockApi.siteFunction.mockResolvedValue(answer([]));
  fireEvent.press(screen.getByTestId("poi-search"));
  expect(await screen.findByTestId("poi-empty")).toBeTruthy();
  expect(screen.queryByTestId("poi-state")).toBeNull();
  mockApi.siteFunction.mockResolvedValue(answer([{ id: "node/1", kind: "water", lat: 48.5861, lon: 7.7455, name: "Fontaine Saint-Martin", openingHours: null, fee: null, access: null, osmUpdatedAt: null }], { truncated: true }));
  fireEvent.press(screen.getByTestId("poi-search"));
  expect(await screen.findByText("Fontaine Saint-Martin")).toBeTruthy();
  expect(screen.getByText(/Liste incomplète/)).toBeTruthy();
  first.unmount();

  mockApi.siteFunction.mockRejectedValue(new TypeError("Network request failed"));
  wrap(<PlacesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("poi-open"));
  expect(await screen.findByTestId("poi-cached")).toBeTruthy();
  expect(screen.getByText("Fontaine Saint-Martin")).toBeTruthy();
  expect(screen.getByTestId("poi-source").props.children).toBe("Source : OpenStreetMap (ODbL), relevé du 25/11 à 14:05");
  fireEvent.press(screen.getByTestId("poi-search"));
  expect(await screen.findByText("Pas de connexion")).toBeTruthy();
  expect(screen.getByTestId("poi-retry")).toBeTruthy();
  expect(screen.getByText("Fontaine Saint-Martin")).toBeTruthy();
});

test("around me: a refused position is said, and no search leaves", async () => {
  mockLocation.granted = false;
  wrap(<PlacesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("poi-open"));
  fireEvent.press(await screen.findByTestId("poi-search"));
  expect(await screen.findByText("Position indisponible")).toBeTruthy();
  expect(mockApi.siteFunction).not.toHaveBeenCalled();
});

test("along a route: asked on a tap with a thinned line, answered in kilometre order, kept for later; the missing service is said", async () => {
  const R1 = "11111111-1111-4111-8111-111111111111";
  // 10 km due north, 1 001 points.
  const north = GpsNav.makeRoute([Array.from({ length: 1001 }, (_, i) => ({ lat: 48.5 + (i * 10) / 111195, lon: 7.7, ele: 200, t: 1_800_000_000_000 + i * 4000 }))], { sport: "running", origin: "recorded" })!;
  const at = (km: number, eastM: number) => ({ lat: 48.5 + (km * 1000) / 111195, lon: 7.7 + eastM / (111195 * Math.cos((48.5 * Math.PI) / 180)) });
  mockApi.routeGetV2.mockResolvedValue({ id: R1, sport: "running", startedAt: "2026-11-02T08:00:00.000Z", distanceM: 10000, durationS: 4000, ascentM: 0, points: 1001, name: "Canal nord", origin: "recorded", summary: null, legacy: false, track: GpsNav.encode(north, 1_800_000_000_000) });
  mockApi.siteFunction.mockResolvedValue({ status: 503, body: { ok: false, code: "POI_NOT_CONFIGURED" } });
  const first = wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  await screen.findByTestId("along-search");
  expect(mockApi.siteFunction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("along-search"));
  expect(await screen.findByText("Points utiles : service pas encore en place")).toBeTruthy();
  const sent = mockApi.siteFunction.mock.calls[0]![2] as { kinds: string[]; along: { points: number[][]; radiusM: number } };
  expect(mockApi.siteFunction.mock.calls[0]![1]).toBe("poi-nearby");
  expect(sent.kinds).toEqual(["water", "toilets", "shelter", "bike_repair"]);
  expect(sent.along.radiusM).toBe(250);
  expect(sent.along.points.length).toBeGreaterThanOrEqual(2);
  expect(sent.along.points.length).toBeLessThanOrEqual(60);
  expect(sent.along.points[0]).toEqual([48.5, 7.7]);

  mockApi.siteFunction.mockResolvedValue(answer([
    { id: "node/7", kind: "shelter", ...at(7.2, 30), name: "Abri du pont", openingHours: null, fee: null, access: null, osmUpdatedAt: "2021-03-01T10:00:00Z" },
    { id: "node/1", kind: "water", ...at(1.1, -12), name: null, openingHours: "24/7", fee: null, access: null, osmUpdatedAt: null },
    { id: "node/9", kind: "toilets", ...at(4, 900), name: "Trop loin", openingHours: null, fee: null, access: null, osmUpdatedAt: null },
  ]));
  fireEvent.press(screen.getByTestId("along-search"));
  expect(await screen.findByText("Abri du pont")).toBeTruthy();
  expect(screen.queryByTestId("along-state")).toBeNull();
  expect(screen.getByText("km 1,1 · à 12 m du tracé · fraîcheur inconnue")).toBeTruthy();
  expect(screen.getByText("Horaires indiqués : 24/7 (non vérifiés)")).toBeTruthy();
  expect(screen.getByText("km 7,2 · à 30 m du tracé · Abri · fiche modifiée en 2021")).toBeTruthy();
  expect(screen.queryByText("Trop loin")).toBeNull();
  const order = screen.getAllByTestId(/^poi-node\//).map((n) => n.props.testID);
  expect(order).toEqual(["poi-node/1", "poi-node/7"]);
  expect(screen.getByTestId("along-source").props.children).toBe("Source : OpenStreetMap (ODbL), relevé du 25/11 à 14:05");
  first.unmount();

  // Opened again without a network: the reading kept on the phone is there, dated, and no request left.
  mockApi.siteFunction.mockClear();
  mockApi.routeGetV2.mockRejectedValue(new Error("Network request failed"));
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  expect(await screen.findByTestId("along-cached")).toBeTruthy();
  expect(await screen.findByText("Abri du pont")).toBeTruthy();
  expect(mockApi.siteFunction).not.toHaveBeenCalled();
});
