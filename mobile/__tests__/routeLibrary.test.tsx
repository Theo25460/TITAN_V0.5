/* V1.7.7 — « Mes parcours »: GPX import through a preview, a save that works without a network and never duplicates, names kept on
   the phone while the server cannot, deletion after a confirmation (server row and phone copy), following a route from the copy
   kept on the phone, and the offline list. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { GpsNav, type NavRoute } from "../src/core";
import {
  addToLibrary, currentRouteId, flushLibraryRoutes, listOfflineRoutes, loadRouteForFollow, MAX_OFFLINE_ROUTES, pendingLibraryRoutes, routeNotes, saveRouteOffline, _resetLibraryForTests, type LibrarySaver,
} from "../src/lib/routeLibrary";
import { forgetAccountCache } from "../src/lib/storage";

const mockApi = { routesLibrary: jest.fn(), routeGetV2: jest.fn(), routeDelete: jest.fn(), routeSaveV2: jest.fn(), routeRename: jest.fn() } as Record<string, jest.Mock>;
jest.mock("../src/data/api", () => ({
  routesLibrary: (...a: unknown[]) => mockApi.routesLibrary(...a), routeGetV2: (...a: unknown[]) => mockApi.routeGetV2(...a), routeDelete: (...a: unknown[]) => mockApi.routeDelete(...a),
  routeSaveV2: (...a: unknown[]) => mockApi.routeSaveV2(...a), routeRename: (...a: unknown[]) => mockApi.routeRename(...a),
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "o1", useAuth: () => ({ owner: "o1" }) }));
jest.mock("../src/lib/exportFile", () => ({ shareTextFile: jest.fn(async () => undefined) }));
const mockFile: { text: string; size: number | undefined; name: string } = { text: "", size: 0, name: "sortie.gpx" };
jest.mock("expo-document-picker", () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file:///cache/sortie.gpx", name: mockFile.name, size: mockFile.size }] }) }));
const mockRead = jest.fn(async () => mockFile.text);
jest.mock("expo-file-system/legacy", () => ({ readAsStringAsync: () => mockRead(), getInfoAsync: async () => ({ exists: true, size: mockFile.size }), cacheDirectory: null }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { RoutesScreen, RouteDetailScreen, sendLibrary, NAME_KEPT_ON_PHONE } = require("../src/screens/session/RoutesScreen");
const { DialogHost, resetDialogs } = require("../src/components/Dialog");
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SafeAreaProvider initialMetrics={metrics}><ToastProvider>{ui}<DialogHost /></ToastProvider></SafeAreaProvider></QueryClientProvider>);
const R1 = "11111111-1111-4111-8111-111111111111", R2 = "22222222-2222-4222-8222-222222222222";
const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
/** A straight line of `n` points about 55 m apart, going north-east. */
const line = (n: number, opts: { ele?: boolean; t0?: number } = {}): NavRoute => GpsNav.makeRoute([Array.from({ length: n }, (_, i) => ({
  lat: 48.58 + i * 0.0004, lon: 7.74 + i * 0.0003, ele: opts.ele === false ? null : 140 + i, ...(opts.t0 ? { t: opts.t0 + i * 20000 } : {}),
}))], { name: "Tour test", sport: "running", origin: "imported" })!;
const gpx = (n: number, ele = true, name = "Tour du lac") => `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>${name}</name><trkseg>${Array.from({ length: n }, (_, i) =>
  `<trkpt lat="${(48.58 + i * 0.0004).toFixed(6)}" lon="${(7.74 + i * 0.0003).toFixed(6)}">${ele && i !== 3 ? `<ele>${140 + i}</ele>` : ele ? "<ele>143</ele>" : i % 2 ? "<ele>150</ele>" : ""}</trkpt>`).join("")}</trkseg></trk></gpx>`;
const meta = { id: R1, sport: "running", startedAt: new Date(T0).toISOString(), distanceM: 5300, durationS: 1800, ascentM: 42, points: 60, name: null, origin: "recorded", summary: null };
const library = (routes: unknown[], legacy = false) => ({ routes, legacy });
const full = (over: Record<string, unknown> = {}) => ({ ...meta, legacy: false, track: GpsNav.encode(line(80, { t0: T0 }), T0), ...over });
const saved = (id = R2, legacy = false) => ({ id, created: true, legacy });

beforeEach(async () => {
  _resetLibraryForTests();
  resetDialogs();
  await AsyncStorage.clear();
  Object.values(mockApi).forEach((m) => m.mockReset());
  nav.navigate.mockClear(); nav.goBack.mockClear();
  mockRead.mockClear();
  mockApi.routesLibrary.mockResolvedValue(library([]));
  Object.assign(mockFile, { text: gpx(60), size: 4000, name: "sortie.gpx" });
});

/* ---- the phone's side of the library ---- */
test("a route added to the library is followable at once, waits in a durable outbox and is sent once", async () => {
  const offline: LibrarySaver = async () => { throw new Error("Network request failed"); };
  const pending = await addToLibrary("o1", line(60), { name: "  Tour   du lac ", sport: "running", origin: "imported", id: "r-local-0001" });
  expect(pending).toMatchObject({ clientRouteId: "r-local-0001", name: "Tour du lac", origin: "imported", durationS: 0, attempts: 0 });
  // Usable before any network exists.
  expect((await loadRouteForFollow("o1", "r-local-0001"))?.name).toBe("Tour du lac");
  await addToLibrary("o1", line(60), { name: "Tour du lac", sport: "running", origin: "imported", id: "r-local-0001" });
  expect(await pendingLibraryRoutes("o1")).toHaveLength(1);
  expect(await flushLibraryRoutes("o1", offline)).toMatchObject({ sent: 0, left: 1 });
  expect((await pendingLibraryRoutes("o1"))[0]).toMatchObject({ attempts: 1, rejected: false });

  const sent: unknown[] = [];
  const online: LibrarySaver = async (r) => { sent.push(r); return saved(); };
  expect(await flushLibraryRoutes("o1", online)).toEqual({ sent: 1, left: 0, legacy: false });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ clientRouteId: "r-local-0001", name: "Tour du lac", origin: "imported", sport: "running", track: { v: 1, t0: 0 } });
  expect(await flushLibraryRoutes("o1", online)).toEqual({ sent: 0, left: 0, legacy: false });
  expect(sent).toHaveLength(1);
  // The copy now answers to the server's id, and still to the phone's id (an outing in progress keeps reading it).
  expect(await currentRouteId("o1", "r-local-0001")).toBe(R2);
  expect((await listOfflineRoutes("o1")).map((m) => m.id)).toEqual([R2]);
  expect(await loadRouteForFollow("o1", "r-local-0001")).not.toBeNull();
  expect(await loadRouteForFollow("o1", R2)).not.toBeNull();
});

test("two flushes at once send a route once; a refusal keeps it with its reason; an unnamed route is refused before anything is written", async () => {
  await addToLibrary("o1", line(60), { name: "A", sport: "running", origin: "planned", id: "r-local-0002" });
  let calls = 0;
  const slow: LibrarySaver = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return saved(); };
  const [a, b] = await Promise.all([flushLibraryRoutes("o1", slow), flushLibraryRoutes("o1", slow)]);
  expect(calls).toBe(1);
  expect(a.sent + b.sent).toBe(1);
  await addToLibrary("o1", line(60), { name: "B", sport: "running", origin: "planned", id: "r-local-0003" });
  for (let i = 0; i < 3; i++) await flushLibraryRoutes("o1", async () => { throw Object.assign(new Error("ROUTE_LIMIT"), { code: "22023" }); });
  expect(await pendingLibraryRoutes("o1")).toEqual([expect.objectContaining({ clientRouteId: "r-local-0003", attempts: 3, rejected: true, reason: "ROUTE_LIMIT" })]);
  await expect(addToLibrary("o1", line(60), { name: "   ", sport: "running", origin: "imported" })).rejects.toThrow("ROUTE_NAME");
  expect(await pendingLibraryRoutes("o1")).toHaveLength(1);
});

test("a server that only has the v1 functions: the route is saved, its name and origin stay noted on the phone", async () => {
  await addToLibrary("o1", line(60), { name: "Boucle des crêtes", sport: "hiking", origin: "planned", id: "r-local-0004" });
  expect(await flushLibraryRoutes("o1", async () => saved(R2, true))).toEqual({ sent: 1, left: 0, legacy: true });
  expect(await routeNotes("o1")).toEqual({ [R2]: { name: "Boucle des crêtes", origin: "planned" } });
});

test("the waiting routes and the names kept on the phone survive a sign-out; the copies of the account's routes leave last", async () => {
  await addToLibrary("o1", line(60), { name: "En attente", sport: "running", origin: "imported", id: "r-local-0005" });
  await flushLibraryRoutes("o1", async () => saved(R2, true));
  await addToLibrary("o1", line(60), { name: "Pas encore envoyé", sport: "running", origin: "imported", id: "r-local-0006" });
  await forgetAccountCache("o1");
  expect(await pendingLibraryRoutes("o1")).toHaveLength(1);
  expect(Object.keys(await routeNotes("o1"))).toEqual([R2]);
  expect(await flushLibraryRoutes("o1", async (r) => { expect(r.track.segs[0]!.length).toBe(60); return saved(R1); })).toMatchObject({ sent: 1, left: 0 });
  await forgetAccountCache("o1", { keepQueue: false });
  expect(await pendingLibraryRoutes("o1")).toEqual([]);
  // A copy that exists nowhere else is not the one evicted when the 61st copy arrives.
  await saveRouteOffline("o2", "r-phone-only", line(20));
  for (let i = 0; i < MAX_OFFLINE_ROUTES + 2; i++) await saveRouteOffline("o2", `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, line(5));
  const kept = await listOfflineRoutes("o2");
  expect(kept).toHaveLength(MAX_OFFLINE_ROUTES);
  expect(kept.some((m) => m.id === "r-phone-only")).toBe(true);
});

/* ---- import: preview, then an explicit choice ---- */
test("import: a valid GPX is previewed with what the file really contains, then saved with its name, sport and origin", async () => {
  mockApi.routeSaveV2.mockResolvedValue(saved());
  wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("routes-import"));
  expect(await screen.findByText("Aperçu du GPX")).toBeTruthy();
  expect(screen.getByText(/^Distance : 2[,.]9\s?km$/)).toBeTruthy();
  expect(screen.getByText(/^Dénivelé positif : \d+ m$/)).toBeTruthy();
  expect(screen.getByText(/60 points lus, 0 ignoré/)).toBeTruthy();
  expect(screen.getByText(/^1 tronçon$/)).toBeTruthy();
  expect(screen.getByTestId("import-name").props.value).toBe("Tour du lac");
  // Nothing is saved before the athlete chooses; without a sport the choice is asked, not guessed.
  expect(mockApi.routeSaveV2).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("import-save"));
  expect(await screen.findByText("Choisis le sport de ce parcours.")).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-sport-hiking"));
  fireEvent.changeText(screen.getByTestId("import-name"), "Tour du grand lac");
  fireEvent.press(screen.getByTestId("import-save"));
  await waitFor(() => expect(mockApi.routeSaveV2).toHaveBeenCalledTimes(1));
  expect(mockApi.routeSaveV2.mock.calls[0]![0]).toBe("o1");
  expect(mockApi.routeSaveV2.mock.calls[0]![1]).toMatchObject({ name: "Tour du grand lac", sport: "hiking", origin: "imported", durationS: 0, track: { v: 1 } });
  expect(await screen.findByText("Parcours enregistré dans Mes parcours")).toBeTruthy();
  expect((await listOfflineRoutes("o1")).map((m) => m.id)).toEqual([R2]);
  expect(await pendingLibraryRoutes("o1")).toEqual([]);
});

test("import: without altitude on every point no climb is shown; an invalid file gives the parser's reason; a file over 15 MB is not read", async () => {
  mockFile.text = gpx(40, false);
  const first = wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("routes-import"));
  expect(await screen.findByText("Dénivelé : non calculable, le fichier n’a pas d’altitude partout")).toBeTruthy();
  expect(screen.queryByText(/Dénivelé positif/)).toBeNull();
  first.unmount();

  mockFile.text = "<gpx><trk><trkseg><trkpt lat=\"48.5\" lon=\"7.7\"></trkpt></trkseg></trk></gpx>";
  const second = wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("routes-import"));
  expect(await screen.findByText("GPX illisible")).toBeTruthy();
  expect(screen.getByTestId("import-error").props.children).toBe("Ce fichier ne contient pas de trace exploitable.");
  expect(screen.queryByTestId("import-save")).toBeNull();
  second.unmount();

  mockFile.size = 16 * 1024 * 1024;
  mockRead.mockClear();
  wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("routes-import"));
  expect(await screen.findByText("Le GPX doit faire moins de 15 Mo.")).toBeTruthy();
  expect(mockRead).not.toHaveBeenCalled();
  expect(await listOfflineRoutes("o1")).toEqual([]);
});

test("import without a network: the route is kept on the phone, listed as waiting, then sent once when the network is back", async () => {
  mockApi.routeSaveV2.mockRejectedValue(new Error("Network request failed"));
  wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("routes-import"));
  fireEvent.press(await screen.findByTestId("gps-sport-running"));
  fireEvent.press(screen.getByTestId("import-save"));
  expect(await screen.findByText("Parcours enregistré sur ce téléphone")).toBeTruthy();
  const [waiting] = await pendingLibraryRoutes("o1");
  expect(waiting).toMatchObject({ name: "Tour du lac", origin: "imported", rejected: false });
  expect(await loadRouteForFollow("o1", waiting!.clientRouteId)).not.toBeNull();
  expect(await screen.findByTestId(`waiting-${waiting!.clientRouteId}`)).toBeTruthy();
  expect(screen.getByText("En attente d’envoi : déjà utilisable sur ce téléphone.")).toBeTruthy();

  mockApi.routeSaveV2.mockReset();
  mockApi.routeSaveV2.mockResolvedValue(saved());
  expect(await sendLibrary("o1")).toMatchObject({ sent: 1, left: 0 });
  expect(mockApi.routeSaveV2.mock.calls[0]![1].clientRouteId).toBe(waiting!.clientRouteId);
  await sendLibrary("o1");
  expect(mockApi.routeSaveV2).toHaveBeenCalledTimes(1);
});

test("import on a server without the v2 functions: the save goes through and the screen says the name stays on the phone", async () => {
  mockApi.routeSaveV2.mockResolvedValue(saved(R2, true));
  wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("routes-import"));
  fireEvent.press(await screen.findByTestId("gps-sport-running"));
  fireEvent.press(screen.getByTestId("import-save"));
  expect(await screen.findByText(`${NAME_KEPT_ON_PHONE}.`)).toBeTruthy();
  expect((await routeNotes("o1"))[R2]).toEqual({ name: "Tour du lac", origin: "imported" });
});

test("« Suivre maintenant »: the copy exists on the phone before the GPS screen opens, and nothing is sent to the library", async () => {
  wrap(<RoutesScreen navigation={nav} />);
  fireEvent.press(await screen.findByTestId("routes-import"));
  fireEvent.press(await screen.findByTestId("gps-sport-cycling"));
  fireEvent.press(screen.getByTestId("import-follow"));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith("GpsRecord", { sport: "cycling", follow: expect.any(String) }));
  const id = (nav.navigate.mock.calls.find((c) => c[0] === "GpsRecord")![1] as { follow: string }).follow;
  expect(await loadRouteForFollow("o1", id)).toMatchObject({ name: "Tour du lac", sport: "cycling", origin: "imported" });
  expect(mockApi.routeSaveV2).not.toHaveBeenCalled();
  expect(await pendingLibraryRoutes("o1")).toEqual([]);
});

/* ---- list ---- */
test("list: name or sport and date, origin, search by name; a full library says so", async () => {
  mockApi.routesLibrary.mockResolvedValue(library([
    { ...meta, id: R1, name: "Tour du lac", origin: "imported", durationS: 0 },
    { ...meta, id: R2, name: null, origin: "recorded" },
  ]));
  const view = wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText("Tour du lac")).toBeTruthy();
  expect(screen.getByText("Importé")).toBeTruthy();
  expect(screen.getByText("Enregistré")).toBeTruthy();
  expect(screen.getByTestId(`route-${R2}`).props.accessibilityLabel).toMatch(/^Course à pied · .*2026, Enregistré, 5[,.]3\s?km$/);
  fireEvent.changeText(screen.getByTestId("routes-search"), "LAC");
  expect(screen.queryByTestId(`route-${R2}`)).toBeNull();
  expect(screen.getByTestId(`route-${R1}`)).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("routes-search"), "zzz");
  expect(screen.getByTestId("routes-no-match")).toBeTruthy();
  view.unmount();

  mockApi.routesLibrary.mockResolvedValue(library(Array.from({ length: 200 }, (_, i) => ({ ...meta, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }))));
  wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByTestId("routes-full")).toBeTruthy();
});

test("list: empty state names the three ways in; an error offers to retry; offline shows the copies kept on this phone", async () => {
  const empty = wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText("Enregistre une sortie GPS, importe un GPX ou crée un parcours")).toBeTruthy();
  fireEvent.press(screen.getByTestId("routes-plan"));
  expect(nav.navigate).toHaveBeenCalledWith("RoutePlanner");
  fireEvent.press(screen.getByTestId("routes-places"));
  expect(nav.navigate).toHaveBeenCalledWith("Places");
  empty.unmount();

  mockApi.routesLibrary.mockRejectedValue(Object.assign(new Error("boom"), { code: "XX000" }));
  const broken = wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText("Impossible de charger ces données")).toBeTruthy();
  mockApi.routesLibrary.mockResolvedValue(library([meta]));
  fireEvent.press(screen.getByText("Réessayer"));
  expect(await screen.findByTestId(`route-${R1}`)).toBeTruthy();
  broken.unmount();

  await saveRouteOffline("o1", R1, { ...line(60), name: "Tour du lac" });
  mockApi.routesLibrary.mockRejectedValue(new Error("Network request failed"));
  wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText("Hors ligne : parcours enregistrés sur ce téléphone")).toBeTruthy();
  fireEvent.press(await screen.findByTestId(`copy-${R1}`));
  expect(nav.navigate).toHaveBeenCalledWith("Route", { id: R1 });
  expect(screen.getByTestId("routes-retry")).toBeTruthy();
});

/* ---- detail ---- */
test("detail: opening a route copies it on the phone (size shown); the copy can be removed and kept again", async () => {
  mockApi.routeGetV2.mockResolvedValue(full({ summary: { v: 1, movingS: 1500, elapsedS: 1900, stoppedS: 320 } }));
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  expect(await screen.findByText(/Gardé sur ce téléphone \(\d+ ko\)/)).toBeTruthy();
  expect(await loadRouteForFollow("o1", R1)).not.toBeNull();
  // The saved summary of a recorded outing: moving, total, stopped.
  expect(screen.getByTestId("route-summary").props.children.join("")).toBe("En mouvement : 25:00 · Temps total : 31:40 · À l’arrêt : 5:20");
  fireEvent.press(screen.getByTestId("route-copy-remove"));
  await waitFor(async () => expect(await loadRouteForFollow("o1", R1)).toBeNull());
  fireEvent.press(await screen.findByTestId("route-copy-keep"));
  await waitFor(async () => expect(await loadRouteForFollow("o1", R1)).not.toBeNull());
});

test("detail: renaming goes to the account; when the server cannot rename yet, the name is kept on the phone and said so", async () => {
  mockApi.routeGetV2.mockResolvedValue(full());
  mockApi.routeRename.mockResolvedValue("server");
  const view = wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  fireEvent.press(await screen.findByTestId("route-rename"));
  fireEvent.changeText(screen.getByTestId("rename-field"), "   ");
  fireEvent.press(screen.getByTestId("rename-save"));
  expect(await screen.findByText("Le nom fait entre 1 et 80 caractères.")).toBeTruthy();
  expect(mockApi.routeRename).not.toHaveBeenCalled();
  mockApi.routeGetV2.mockResolvedValue(full({ name: "Tour du lac" }));
  fireEvent.changeText(screen.getByTestId("rename-field"), "  Tour  du lac ");
  fireEvent.press(screen.getByTestId("rename-save"));
  await waitFor(() => expect(mockApi.routeRename).toHaveBeenCalledWith("o1", R1, "Tour du lac"));
  await waitFor(() => expect(screen.getByTestId("route-title").props.children).toBe("Tour du lac"));
  expect(screen.queryByTestId("route-name-local")).toBeNull();
  expect((await loadRouteForFollow("o1", R1))?.name).toBe("Tour du lac");
  view.unmount();

  mockApi.routeGetV2.mockResolvedValue(full());
  mockApi.routeRename.mockResolvedValue("local");
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  fireEvent.press(await screen.findByTestId("route-rename"));
  fireEvent.changeText(screen.getByTestId("rename-field"), "Sortie longue");
  fireEvent.press(screen.getByTestId("rename-save"));
  expect(await screen.findByText(`${NAME_KEPT_ON_PHONE}.`)).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("route-title").props.children).toBe("Sortie longue"));
  expect(screen.getByTestId("route-name-local")).toBeTruthy();
  expect((await routeNotes("o1"))[R1]).toMatchObject({ name: "Sortie longue", unsent: true });
});

test("a name kept on the phone leaves for the account the first time the server can keep it", async () => {
  await addToLibrary("o1", line(60), { name: "Boucle des crêtes", sport: "hiking", origin: "planned", id: "r-local-0007" });
  await flushLibraryRoutes("o1", async () => saved(R1, true));
  mockApi.routesLibrary.mockResolvedValue(library([{ ...meta, id: R1, origin: null }], true));
  const legacy = wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText("Boucle des crêtes")).toBeTruthy();
  expect(screen.getByText("Planifié")).toBeTruthy();
  expect(screen.getByText(NAME_KEPT_ON_PHONE)).toBeTruthy();
  expect(mockApi.routeRename).not.toHaveBeenCalled();
  legacy.unmount();

  mockApi.routesLibrary.mockResolvedValue(library([{ ...meta, id: R1, name: null, origin: "recorded" }]));
  mockApi.routeRename.mockResolvedValue("server");
  wrap(<RoutesScreen navigation={nav} />);
  expect(await screen.findByText("Boucle des crêtes")).toBeTruthy();
  expect(mockApi.routeRename).toHaveBeenCalledWith("o1", R1, "Boucle des crêtes");
  expect(screen.queryByText(NAME_KEPT_ON_PHONE)).toBeNull();
  // The origin is still only known here (the server has no way to change it): the phone keeps saying « Planifié ».
  expect(screen.getByText("Planifié")).toBeTruthy();
  expect((await routeNotes("o1"))[R1]).toEqual({ origin: "planned" });
});

test("detail: « Suivre ce parcours » proposes the route's own sport and opens the GPS with the id, the copy being on the phone", async () => {
  mockApi.routeGetV2.mockResolvedValue(full({ sport: "hiking" }));
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  fireEvent.press(await screen.findByTestId("route-follow"));
  expect(await screen.findByText("Suivre en randonnée")).toBeTruthy();
  fireEvent.press(screen.getByTestId("gps-sport-trail"));
  fireEvent.press(screen.getByTestId("follow-go"));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith("GpsRecord", { sport: "trail", follow: R1 }));
  expect(await loadRouteForFollow("o1", R1)).not.toBeNull();
});

test("detail: deleting asks first, then removes the server row, the copy on the phone and the phone's notes", async () => {
  mockApi.routeGetV2.mockResolvedValue(full());
  mockApi.routeDelete.mockResolvedValue(true);
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  await screen.findByText(/Gardé sur ce téléphone/);
  fireEvent.press(screen.getByTestId("route-delete"));
  expect(await screen.findByText("Supprimer ce parcours ?")).toBeTruthy();
  fireEvent.press(screen.getByText("Annuler"));
  await waitFor(() => expect(screen.queryByText("Supprimer ce parcours ?")).toBeNull());
  expect(mockApi.routeDelete).not.toHaveBeenCalled();
  expect(await loadRouteForFollow("o1", R1)).not.toBeNull();
  fireEvent.press(screen.getByTestId("route-delete"));
  fireEvent.press(await screen.findByText("Supprimer"));
  await waitFor(() => expect(mockApi.routeDelete).toHaveBeenCalledWith("o1", R1));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  expect(await loadRouteForFollow("o1", R1)).toBeNull();
  expect(await listOfflineRoutes("o1")).toEqual([]);
});

test("detail without a network: the copy on the phone is shown as such and can be followed; a route only on the phone can join the library", async () => {
  await saveRouteOffline("o1", R1, { ...line(60), name: "Tour du lac" });
  mockApi.routeGetV2.mockRejectedValue(new Error("Network request failed"));
  const stale = wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: R1 } }} />);
  expect(await screen.findByTestId("route-stale")).toBeTruthy();
  fireEvent.press(screen.getByTestId("route-follow"));
  fireEvent.press(await screen.findByTestId("follow-go"));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith("GpsRecord", { sport: "running", follow: R1 }));
  stale.unmount();

  await saveRouteOffline("o1", "r-phone-0001", { ...line(60), name: "Fichier d’un ami", sport: "cycling" });
  mockApi.routeSaveV2.mockResolvedValue(saved(R2));
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: "r-phone-0001" } }} />);
  expect(await screen.findByTestId("route-phone-only")).toBeTruthy();
  expect(mockApi.routeGetV2).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId("route-add"));
  await waitFor(() => expect(mockApi.routeSaveV2).toHaveBeenCalledWith("o1", expect.objectContaining({ clientRouteId: "r-phone-0001", name: "Fichier d’un ami", sport: "cycling", origin: "imported" })));
});

test("opened from the planner to import a file: the picker starts at once and the preview follows", async () => {
  const setParams = jest.fn();
  wrap(<RoutesScreen navigation={{ ...nav, setParams }} route={{ params: { importGpx: true } }} />);
  expect(await screen.findByText("Aperçu du GPX")).toBeTruthy();
  expect(setParams).toHaveBeenCalledWith({ importGpx: undefined });
});

test("detail of a route still waiting: it says so, and deleting it withdraws the upload and the copy without asking the server", async () => {
  await addToLibrary("o1", line(60), { name: "Pas encore envoyé", sport: "running", origin: "imported", id: "r-local-0009" });
  wrap(<RouteDetailScreen navigation={nav} route={{ params: { id: "r-local-0009" } }} />);
  expect(await screen.findByTestId("route-pending")).toBeTruthy();
  expect(screen.getByText("Importé")).toBeTruthy();
  expect(screen.queryByTestId("route-add")).toBeNull();
  fireEvent.press(screen.getByTestId("route-delete"));
  expect(await screen.findByText(/Il n’a pas encore été envoyé/)).toBeTruthy();
  fireEvent.press(screen.getByText("Supprimer"));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  expect(await pendingLibraryRoutes("o1")).toEqual([]);
  expect(await loadRouteForFollow("o1", "r-local-0009")).toBeNull();
  expect(mockApi.routeDelete).not.toHaveBeenCalled();
  expect(mockApi.routeGetV2).not.toHaveBeenCalled();
});
