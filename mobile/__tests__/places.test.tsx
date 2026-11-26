/* V1.7.7 — personal points: local first, then synchronised both ways with the account (two phones, deletions, the missing server
   function), a position asked once, and the screen « Mes points » with its optional search of useful points. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import {
  addPlace, distanceBetween, distanceLabel, lastKnownPosition, listPlaces, locateOnce, parseCoordinates, PLACES_LOCAL_NOTE, rawPlaces, removePlace, syncPlaces, updatePlace, _resetPlacesSyncForTests,
  type PlacesRemote,
} from "../src/lib/places";
import { forgetAccountCache } from "../src/lib/storage";

const mockLocation = {
  services: true, granted: true, canAskAgain: true, grantOnAsk: true, asked: 0,
  position: { coords: { latitude: 48.58392, longitude: 7.74553, accuracy: 8 }, timestamp: 1_800_000_000_000 } as { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number } | null,
};
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  hasServicesEnabledAsync: async () => mockLocation.services,
  getForegroundPermissionsAsync: async () => ({ granted: mockLocation.granted, canAskAgain: mockLocation.canAskAgain }),
  requestForegroundPermissionsAsync: async () => { mockLocation.asked++; mockLocation.granted = mockLocation.grantOnAsk; return { granted: mockLocation.granted, canAskAgain: mockLocation.canAskAgain }; },
  getCurrentPositionAsync: async () => mockLocation.position,
  getLastKnownPositionAsync: async () => mockLocation.position,
}));
const mockApi = { placesList: jest.fn(), placeSave: jest.fn(), placeDelete: jest.fn(), siteFunction: jest.fn() } as Record<string, jest.Mock>;
jest.mock("../src/data/api", () => ({
  placesList: (...a: unknown[]) => mockApi.placesList(...a), placeSave: (...a: unknown[]) => mockApi.placeSave(...a), placeDelete: (...a: unknown[]) => mockApi.placeDelete(...a),
  siteFunction: (...a: unknown[]) => mockApi.siteFunction(...a),
}));
jest.mock("../src/data/auth", () => ({ useOwner: () => "o1", useAuth: () => ({ owner: "o1" }) }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { SafeAreaProvider } = require("react-native-safe-area-context");
const { ToastProvider } = require("../src/components/Toast");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const { PlacesScreen } = require("../src/screens/session/PlacesScreen");
const { DialogHost, resetDialogs } = require("../src/components/Dialog");
/* eslint-enable @typescript-eslint/no-require-imports */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SafeAreaProvider initialMetrics={metrics}><ToastProvider><PlacesScreen navigation={{ navigate: jest.fn() }} /><DialogHost /></ToastProvider></SafeAreaProvider></QueryClientProvider>);

type Row = { id: string; clientPlaceId: string; name: string; kind: string; lat: number; lon: number; note: string; updatedAt: string };
/** The account's points, as the three server functions keep them (same client id sent again = the same point, updated). */
function account(start = Date.UTC(2026, 10, 25, 10, 0, 0)) {
  let rows: Row[] = [], n = 0, clock = start;
  const calls = { list: 0, save: 0, remove: 0 };
  const remote: PlacesRemote = {
    list: async () => { calls.list++; return rows.map((r) => ({ ...r })); },
    save: async (p) => {
      calls.save++;
      clock += 1000;
      const cur = rows.find((r) => r.clientPlaceId === p.clientPlaceId);
      if (cur) { Object.assign(cur, p, { updatedAt: new Date(clock).toISOString() }); return { id: cur.id, created: false }; }
      rows.push({ id: `srv-${++n}`, ...p, updatedAt: new Date(clock).toISOString() });
      return { id: `srv-${n}`, created: true };
    },
    remove: async (id) => { calls.remove++; const before = rows.length; rows = rows.filter((r) => r.id !== id); return rows.length < before; },
  };
  return { remote, calls, rows: () => rows, at: (t: number) => { clock = t; } };
}
const fountain = { name: "Fontaine du col", kind: "water" as const, lat: 48.58391, lon: 7.74552 };
const names = async (owner: string) => (await listPlaces(owner)).map((p) => p.name).sort();
let now = Date.UTC(2026, 10, 25, 9, 0, 0);
const clock = jest.spyOn(Date, "now");

beforeEach(async () => {
  _resetPlacesSyncForTests();
  resetDialogs();
  await AsyncStorage.clear();
  Object.values(mockApi).forEach((m) => m.mockReset());
  Object.assign(mockLocation, { services: true, granted: true, canAskAgain: true, grantOnAsk: true, asked: 0, position: { coords: { latitude: 48.58392, longitude: 7.74553, accuracy: 8 }, timestamp: 1_800_000_000_000 } });
  now = Date.UTC(2026, 10, 25, 9, 0, 0);
  clock.mockImplementation(() => now);
});
afterAll(() => clock.mockRestore());

/* ---- the store ---- */
test("a point exists at once on the phone, is edited and deleted there, and is kept across a sign-out", async () => {
  const p = await addPlace("o1", { ...fountain, name: "  Fontaine   du col ", note: " eau  fraîche " }, "pl-aaaaaaa1");
  expect(p).toMatchObject({ id: "pl-aaaaaaa1", name: "Fontaine du col", note: "eau fraîche", lat: 48.58391, dirty: true });
  await expect(addPlace("o1", { ...fountain, name: " " })).rejects.toThrow("PLACE_NAME");
  await expect(addPlace("o1", { ...fountain, lat: 91 })).rejects.toThrow("PLACE_POSITION");
  expect(await updatePlace("o1", "pl-aaaaaaa1", { name: "Fontaine", kind: "shelter" })).toMatchObject({ name: "Fontaine", kind: "shelter", lat: 48.58391 });
  await forgetAccountCache("o1");
  expect(await names("o1")).toEqual(["Fontaine"]);
  expect(await listPlaces("someone-else")).toEqual([]);
  // Never sent: it simply disappears, no tombstone is needed.
  await removePlace("o1", "pl-aaaaaaa1");
  expect(await rawPlaces("o1")).toEqual([]);
});

test("coordinates typed by hand are read in the usual spellings and refused when they are not a position", () => {
  expect(parseCoordinates("48.5839, 7.7455")).toEqual({ lat: 48.5839, lon: 7.7455 });
  expect(parseCoordinates(" 48,5839 ; 7,7455 ")).toEqual({ lat: 48.5839, lon: 7.7455 });
  expect(parseCoordinates("48.5839 7.7455")).toEqual({ lat: 48.5839, lon: 7.7455 });
  expect(parseCoordinates("-33.85, 151.21")).toEqual({ lat: -33.85, lon: 151.21 });
  for (const bad of ["", "Strasbourg", "48.58", "95, 7", "48.5, 181", "48.5, 7.7, 3", "1e2, 7"]) expect(parseCoordinates(bad)).toBeNull();
  expect(distanceLabel(240)).toBe("240 m");
  expect(distanceLabel(1240)).toBe("1,2 km");
  expect(distanceLabel(14300)).toBe("14 km");
  expect(Math.round(distanceBetween({ lat: 48.58, lon: 7.74 }, { lat: 48.59, lon: 7.74 }))).toBe(1112);
});

/* ---- synchronisation ---- */
test("sync sends the points of the phone and brings the account's; a second run changes nothing", async () => {
  const srv = account();
  srv.rows().push({ id: "srv-old", clientPlaceId: "pl-elsewhere", name: "Abri du lac", kind: "shelter", lat: 48.6, lon: 7.7, note: "", updatedAt: "2026-11-20T10:00:00.000Z" });
  await addPlace("o1", fountain, "pl-aaaaaaa1");
  expect(await syncPlaces("o1", srv.remote)).toEqual({ state: "synced", pushed: 1, pulled: 1, removed: 0, waiting: 0 });
  expect(await names("o1")).toEqual(["Abri du lac", "Fontaine du col"]);
  expect(srv.rows().map((r) => r.clientPlaceId).sort()).toEqual(["pl-aaaaaaa1", "pl-elsewhere"]);
  const mine = (await rawPlaces("o1")).find((p) => p.id === "pl-aaaaaaa1")!;
  expect(mine).toMatchObject({ serverId: "srv-1", dirty: false, seen: srv.rows()[1]!.updatedAt });
  srv.calls.save = 0;
  expect(await syncPlaces("o1", srv.remote)).toEqual({ state: "synced", pushed: 0, pulled: 0, removed: 0, waiting: 0 });
  expect(srv.calls.save).toBe(0);
});

test("two phones that each add a point both end with the two points", async () => {
  const srv = account();
  await addPlace("phone-a", { ...fountain, name: "Fontaine" }, "pl-from-a01");
  await addPlace("phone-b", { ...fountain, name: "Atelier vélo", kind: "bike_repair", lat: 48.6 }, "pl-from-b01");
  await syncPlaces("phone-a", srv.remote);
  await syncPlaces("phone-b", srv.remote);
  await syncPlaces("phone-a", srv.remote);
  expect(await names("phone-a")).toEqual(["Atelier vélo", "Fontaine"]);
  expect(await names("phone-b")).toEqual(["Atelier vélo", "Fontaine"]);
  expect(srv.rows()).toHaveLength(2);
});

test("a deletion travels: tombstone on the phone until the account confirms, then the other phone loses the point too", async () => {
  const srv = account();
  await addPlace("phone-a", fountain, "pl-from-a01");
  await syncPlaces("phone-a", srv.remote);
  await syncPlaces("phone-b", srv.remote);
  expect(await names("phone-b")).toEqual(["Fontaine du col"]);
  await removePlace("phone-a", "pl-from-a01");
  expect(await listPlaces("phone-a")).toEqual([]);
  expect(await rawPlaces("phone-a")).toEqual([expect.objectContaining({ deleted: true, dirty: true, serverId: "srv-1" })]);
  // No network: the tombstone waits.
  const down: PlacesRemote = { ...srv.remote, list: async () => { throw new Error("Network request failed"); } };
  expect(await syncPlaces("phone-a", down)).toMatchObject({ state: "pending", waiting: 1 });
  expect(await syncPlaces("phone-a", srv.remote)).toMatchObject({ state: "synced", removed: 1 });
  expect(await rawPlaces("phone-a")).toEqual([]);
  expect(srv.rows()).toEqual([]);
  expect(await syncPlaces("phone-b", srv.remote)).toMatchObject({ state: "synced", removed: 1 });
  expect(await listPlaces("phone-b")).toEqual([]);
});

test("the same point changed on two phones: the latest change wins, on both", async () => {
  const srv = account();
  await addPlace("phone-a", fountain, "pl-from-a01");
  await syncPlaces("phone-a", srv.remote);
  await syncPlaces("phone-b", srv.remote);
  now += 60_000;
  await updatePlace("phone-a", "pl-from-a01", { name: "Fontaine (A, plus tôt)" });
  now += 60_000;
  await updatePlace("phone-b", "pl-from-a01", { name: "Fontaine (B, plus tard)" });
  srv.at(now + 1000);
  await syncPlaces("phone-b", srv.remote);
  expect(await syncPlaces("phone-a", srv.remote)).toMatchObject({ state: "synced", pushed: 0, pulled: 1 });
  expect(await names("phone-a")).toEqual(["Fontaine (B, plus tard)"]);
  expect(srv.rows()[0]!.name).toBe("Fontaine (B, plus tard)");
  // And the other way round: a change made after the account's version replaces it.
  now += 10 * 60_000;
  await updatePlace("phone-a", "pl-from-a01", { note: "coupée en hiver" });
  await updatePlace("phone-b", "pl-from-a01", { note: "plus ancien" });
  now -= 5 * 60_000;
  await updatePlace("phone-b", "pl-from-a01", { note: "plus ancien" });
  srv.at(now);
  await syncPlaces("phone-b", srv.remote);
  await syncPlaces("phone-a", srv.remote);
  await syncPlaces("phone-b", srv.remote);
  expect((await listPlaces("phone-b"))[0]!.note).toBe("coupée en hiver");
});

test("a change made here is never judged by the clocks when the account did not move; a point edited here but deleted elsewhere comes back", async () => {
  const srv = account(Date.UTC(2027, 0, 1)); // the server's clock is weeks ahead of the phone's
  await addPlace("phone-a", fountain, "pl-from-a01");
  await syncPlaces("phone-a", srv.remote);
  await updatePlace("phone-a", "pl-from-a01", { name: "Fontaine renommée" });
  expect(await syncPlaces("phone-a", srv.remote)).toMatchObject({ pushed: 1, pulled: 0 });
  expect(srv.rows()[0]!.name).toBe("Fontaine renommée");
  // Deleted at once on a phone whose clock is behind: the deletion still goes through.
  await removePlace("phone-a", "pl-from-a01");
  expect(await syncPlaces("phone-a", srv.remote)).toMatchObject({ state: "synced", removed: 1 });
  expect(srv.rows()).toEqual([]);

  await addPlace("phone-a", { ...fountain, name: "Abri" }, "pl-from-a02");
  await syncPlaces("phone-a", srv.remote);
  await syncPlaces("phone-b", srv.remote);
  await removePlace("phone-a", "pl-from-a02");
  await syncPlaces("phone-a", srv.remote);
  await updatePlace("phone-b", "pl-from-a02", { note: "toit refait" });
  expect(await syncPlaces("phone-b", srv.remote)).toMatchObject({ state: "synced", pushed: 1 });
  expect(srv.rows().map((r) => r.note)).toEqual(["toit refait"]);
});

test("a server without the function keeps everything on the phone; a failed save stays to be sent; an edit made during a save is not lost", async () => {
  await addPlace("o1", fountain, "pl-aaaaaaa1");
  const missing: PlacesRemote = { list: async () => null, save: async () => null, remove: async () => null };
  expect(await syncPlaces("o1", missing)).toEqual({ state: "local", pushed: 0, pulled: 0, removed: 0, waiting: 1 });
  expect(await rawPlaces("o1")).toEqual([expect.objectContaining({ id: "pl-aaaaaaa1", dirty: true })]);

  const srv = account();
  const refusing: PlacesRemote = { ...srv.remote, save: async () => { throw new Error("Network request failed"); } };
  expect(await syncPlaces("o1", refusing)).toMatchObject({ state: "pending", pushed: 0, waiting: 1 });
  expect(await names("o1")).toEqual(["Fontaine du col"]);

  const slow: PlacesRemote = { ...srv.remote, save: async (p) => { now += 1000; await updatePlace("o1", "pl-aaaaaaa1", { name: "Renommée pendant l’envoi" }); return srv.remote.save(p); } };
  expect(await syncPlaces("o1", slow)).toMatchObject({ state: "pending", pushed: 1, waiting: 1 });
  expect(await rawPlaces("o1")).toEqual([expect.objectContaining({ name: "Renommée pendant l’envoi", dirty: true, serverId: "srv-1" })]);
  expect(await syncPlaces("o1", srv.remote)).toMatchObject({ state: "synced", pushed: 1 });
  expect(srv.rows()).toEqual([expect.objectContaining({ name: "Renommée pendant l’envoi" })]);
});

/* ---- one position, asked once ---- */
test("the position is read once; TITAN explains before Android asks, and a refusal is a named state", async () => {
  const explain = jest.fn(async () => true);
  expect(await locateOnce(explain)).toEqual({ ok: true, lat: 48.58392, lon: 7.74553, accuracyM: 8, at: 1_800_000_000_000 });
  expect(explain).not.toHaveBeenCalled(); // already granted: nothing to explain, nothing asked
  mockLocation.granted = false;
  expect(await lastKnownPosition()).toBeNull(); // never a prompt just to show a distance
  expect(await locateOnce(async () => false)).toEqual({ ok: false, reason: "denied" });
  expect(mockLocation.asked).toBe(0);
  mockLocation.grantOnAsk = false;
  expect(await locateOnce(explain)).toEqual({ ok: false, reason: "denied" });
  expect(explain).toHaveBeenCalledTimes(1);
  mockLocation.canAskAgain = false;
  expect(await locateOnce(explain)).toEqual({ ok: false, reason: "blocked" });
  mockLocation.services = false;
  expect(await locateOnce(explain)).toEqual({ ok: false, reason: "unavailable" });
  Object.assign(mockLocation, { services: true, granted: true, position: null });
  expect(await locateOnce(explain, 10)).toEqual({ ok: false, reason: "timeout" });
});

/* ---- the screen ---- */
test("screen: a point is added with typed coordinates, shown with its distance, and said to be on this phone only while the server cannot keep it", async () => {
  mockApi.placesList.mockResolvedValue(null);
  wrap();
  expect(await screen.findByText("Aucun point pour le moment")).toBeTruthy();
  expect(await screen.findByText(PLACES_LOCAL_NOTE)).toBeTruthy();
  fireEvent.press(screen.getByTestId("place-add"));
  fireEvent.press(await screen.findByTestId("place-save"));
  expect(await screen.findByText("Donne un nom à ce point.")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("place-name"), "Fontaine du col");
  fireEvent.press(screen.getByTestId("place-save"));
  expect(await screen.findByTestId("place-error")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("place-coords"), "48.5929, 7.7455");
  fireEvent.press(screen.getByTestId("place-kind-water"));
  fireEvent.press(screen.getByTestId("place-save"));
  expect(await screen.findByText("Fontaine du col")).toBeTruthy();
  expect(await screen.findByText(/^Point d’eau · à 1,0 km de ta dernière position connue$/)).toBeTruthy();
  expect(await listPlaces("o1")).toEqual([expect.objectContaining({ name: "Fontaine du col", lat: 48.5929, lon: 7.7455, dirty: true })]);
  expect(mockApi.placeSave).not.toHaveBeenCalled();
  expect(screen.getByText(PLACES_LOCAL_NOTE)).toBeTruthy();
});

test("screen: a point added at my position reaches the account; it is renamed, then deleted after a confirmation", async () => {
  const srv = account();
  mockApi.placesList.mockImplementation(() => srv.remote.list());
  mockApi.placeSave.mockImplementation((_o: string, p: Parameters<PlacesRemote["save"]>[0]) => srv.remote.save(p));
  mockApi.placeDelete.mockImplementation((_o: string, id: string) => srv.remote.remove(id));
  wrap();
  fireEvent.press(await screen.findByTestId("place-add"));
  fireEvent.changeText(await screen.findByTestId("place-name"), "Abri du col");
  fireEvent.press(screen.getByTestId("place-kind-shelter"));
  fireEvent.press(screen.getByTestId("place-here"));
  expect(await screen.findByText(/^Position lue : 48\.58392, 7\.74553 \(précision annoncée ± 8 m\)$/)).toBeTruthy();
  fireEvent.press(screen.getByTestId("place-save"));
  await waitFor(() => expect(srv.rows()).toEqual([expect.objectContaining({ name: "Abri du col", kind: "shelter", lat: 48.58392, lon: 7.74553 })]));
  expect(await screen.findByTestId("places-synced")).toBeTruthy();
  const [place] = await listPlaces("o1");
  fireEvent.press(screen.getByTestId(`place-${place!.id}`));
  fireEvent.changeText(await screen.findByTestId("place-name"), "Abri du grand col");
  fireEvent.press(screen.getByTestId("place-save"));
  await waitFor(() => expect(srv.rows()[0]!.name).toBe("Abri du grand col"));
  fireEvent.press(await screen.findByTestId(`place-${place!.id}`));
  fireEvent.press(await screen.findByTestId("place-delete"));
  expect(await screen.findByText("Supprimer ce point ?")).toBeTruthy();
  expect(srv.rows()).toHaveLength(1);
  fireEvent.press(screen.getByText("Supprimer"));
  await waitFor(() => expect(srv.rows()).toEqual([]));
  expect(await listPlaces("o1")).toEqual([]);
});
