/* V1.7.7 — useful points read from OpenStreetMap through TITAN's server function: what the phone asks (a rounded position or a
   thinned route), what it keeps for later, and what it allows itself to say about a volunteer map (never « open »). */
import AsyncStorage from "@react-native-async-storage/async-storage";
let mockOwner: string | null = "a";
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: async () => ({ data: { session: mockOwner ? { user: { id: mockOwner }, access_token: `token-${mockOwner}` } : null } }) } } }));
import { GpsNav } from "../src/core";
import {
  buildPoiRequest, fetchPois, POI_STATES, poiAsPlace, poiExtras, poiFreshness, poiHours, poisAlong, poiSourceLine, poiTitle, readPoiCache, thinRoute, writePoiCache, type Poi, type PoiAnswer, type PoiFailure,
} from "../src/lib/poi";

const poi = (over: Partial<Poi> = {}): Poi => ({ id: "node/1", kind: "water", lat: 48.59, lon: 7.75, name: null, openingHours: null, fee: null, access: null, osmUpdatedAt: null, ...over });
const fetched = new Date(2026, 10, 25, 14, 5, 0).toISOString();
const answer = (pois: unknown[], over: Record<string, unknown> = {}) => ({ ok: true, source: "OpenStreetMap", license: "ODbL", attribution: "© les contributeurs d’OpenStreetMap", fetchedAt: fetched, pois, truncated: false, ...over });
const answering = (status: number, body: unknown) => jest.fn(async () => ({ status, json: async () => { if (body === undefined) throw new Error("not json"); return body; } })) as unknown as typeof fetch;
const online = { online: () => true };
const here = { lat: 48.583912, lon: 7.745534 };
beforeEach(async () => { mockOwner = "a"; await AsyncStorage.clear(); });

test("around a position: only the known kinds, the position rounded to about 100 m, the radius within the server's limits", () => {
  expect(buildPoiRequest({ kinds: ["toilets", "water", "casino"], around: { ...here, radiusM: 1000 } })).toEqual({ ok: true, body: { kinds: ["water", "toilets"], around: { lat: 48.584, lon: 7.746, radiusM: 1000 } } });
  expect((buildPoiRequest({ kinds: ["water"], around: { ...here, radiusM: 90000 } }) as { body: { around: { radiusM: number } } }).body.around.radiusM).toBe(5000);
  expect((buildPoiRequest({ kinds: ["water"], around: { ...here, radiusM: 5 } }) as { body: { around: { radiusM: number } } }).body.around.radiusM).toBe(100);
  expect(buildPoiRequest({ kinds: [], around: { ...here, radiusM: 1000 } })).toEqual({ ok: false, error: "Choisis au moins un type de point." });
  expect(buildPoiRequest({ kinds: ["water"], around: { lat: NaN, lon: 7, radiusM: 1000 } })).toMatchObject({ ok: false });
  expect(buildPoiRequest({ kinds: ["water"] })).toMatchObject({ ok: false });
});

test("along a route: the line is thinned to 60 points at most, ends kept, and sent with about 10 m of precision", () => {
  const winding = GpsNav.makeRoute([Array.from({ length: 2500 }, (_, i) => ({ lat: 48.5 + i * 0.0002, lon: 7.7 + Math.sin(i / 40) * 0.01 }))], {})!;
  const thin = thinRoute(winding);
  expect(thin.length).toBeLessThanOrEqual(60);
  expect(thin.length).toBeGreaterThan(10);
  expect(thin[0]).toEqual([winding.segs[0]![0]!.lat, winding.segs[0]![0]!.lon]);
  expect(thin[thin.length - 1]).toEqual([winding.segs[0]![2499]!.lat, winding.segs[0]![2499]!.lon]);
  const built = buildPoiRequest({ kinds: ["water", "shelter"], along: { points: [[48.583912, 7.745534], [48.6, 7.8]], radiusM: 250 } });
  expect(built).toEqual({ ok: true, body: { kinds: ["water", "shelter"], along: { points: [[48.5839, 7.7455], [48.6, 7.8]], radiusM: 250 } } });
  expect((buildPoiRequest({ kinds: ["water"], along: { points: [[48.5, 7.7], [48.6, 7.8]], radiusM: 5000 } }) as { body: { along: { radiusM: number } } }).body.along.radiusM).toBe(500);
  expect(buildPoiRequest({ kinds: ["water"], along: { points: [[48.5, 7.7]], radiusM: 250 } })).toMatchObject({ ok: false });
  expect(buildPoiRequest({ kinds: ["water"], along: { points: Array.from({ length: 61 }, (_, i) => [48 + i * 0.001, 7] as [number, number]), radiusM: 250 } })).toMatchObject({ ok: false });
});

test("the request goes to TITAN's server function with the account's token; the answer is read strictly", async () => {
  const network = answering(200, answer([
    { id: "node/1", kind: "water", lat: 48.59, lon: 7.75, name: "Fontaine Saint-Martin", openingHours: "Mo-Su 08:00-20:00", fee: "no", access: "yes", osmUpdatedAt: "2024-06-01T10:00:00Z" },
    { id: "node/2", kind: "toilets", lat: 48.58, lon: 7.74, name: null, openingHours: null, fee: null, access: null, osmUpdatedAt: null },
    { id: "node/3", kind: "water", lat: "48.5", lon: 7.7 },
    { id: "node/4", kind: "water", lat: 95, lon: 7.7 },
    null,
  ]));
  const result = await fetchPois("a", { kinds: ["water", "toilets"], around: { ...here, radiusM: 2000 } }, { fetch: network, ...online });
  const [url, init] = (network as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://titan-app.fr/.netlify/functions/poi-nearby");
  expect(init.headers).toMatchObject({ Authorization: "Bearer token-a" });
  expect(JSON.parse(String(init.body))).toEqual({ kinds: ["water", "toilets"], around: { lat: 48.584, lon: 7.746, radiusM: 2000 } });
  if (!result.ok) throw new Error("expected points");
  expect(result.pois.map((p) => p.id)).toEqual(["node/1", "node/2"]);
  expect(result).toMatchObject({ source: "OpenStreetMap", license: "ODbL", fetchedAt: fetched, truncated: false });
  expect(result.pois[0]).toEqual({ id: "node/1", kind: "water", lat: 48.59, lon: 7.75, name: "Fontaine Saint-Martin", openingHours: "Mo-Su 08:00-20:00", fee: "no", access: "yes", osmUpdatedAt: "2024-06-01T10:00:00Z" });
});

test("every failure is a named state: source not set up (503, or a function not deployed), limits, an outage, no network", async () => {
  const query = { kinds: ["water"], around: { ...here, radiusM: 1000 } };
  const cases: [number, unknown, PoiFailure][] = [
    [503, { ok: false, code: "POI_NOT_CONFIGURED" }, "POI_NOT_CONFIGURED"],
    [404, undefined, "POI_NOT_CONFIGURED"],
    [401, { ok: false, code: "AUTH_REQUIRED" }, "AUTH_REQUIRED"],
    [400, { ok: false, code: "BAD_REQUEST" }, "BAD_REQUEST"],
    [429, { ok: false, code: "RATE_LIMITED" }, "RATE_LIMITED"],
    [503, { ok: false, code: "QUOTA_EXCEEDED" }, "QUOTA_EXCEEDED"],
    [502, { ok: false, code: "UPSTREAM_UNAVAILABLE" }, "UPSTREAM_UNAVAILABLE"],
    [503, { ok: false, code: "SERVICE_UNAVAILABLE" }, "UPSTREAM_UNAVAILABLE"],
    [418, undefined, "UNKNOWN"],
  ];
  for (const [status, body, code] of cases) expect(await fetchPois("a", query, { fetch: answering(status, body), ...online })).toEqual({ ok: false, code });
  expect(await fetchPois("a", query, { fetch: jest.fn(async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch, ...online })).toEqual({ ok: false, code: "OFFLINE" });
  const never = answering(200, answer([]));
  expect(await fetchPois("a", query, { fetch: never, online: () => false })).toEqual({ ok: false, code: "OFFLINE" });
  expect(await fetchPois("a", { kinds: [], around: query.around }, { fetch: never, ...online })).toEqual({ ok: false, code: "BAD_REQUEST" });
  expect(never).not.toHaveBeenCalled();
  expect(POI_STATES.POI_NOT_CONFIGURED.text).toMatch(/Ce n’est pas un réglage de ton téléphone/);
  expect(POI_STATES.POI_NOT_CONFIGURED.text).toMatch(/tes propres points fonctionnent normalement/);
  expect(POI_STATES.OFFLINE.text).toMatch(/dernier relevé gardé sur ce téléphone/);
});

test("the last answers are kept per account, with their date, for use without a network", async () => {
  const kept: PoiAnswer = { source: "OpenStreetMap", license: "ODbL", attribution: "© les contributeurs d’OpenStreetMap", fetchedAt: fetched, pois: [poi()], truncated: false };
  await writePoiCache("a", "around", { answer: kept, kinds: ["water"], center: here, radiusM: 1000 }, 1000);
  expect(await readPoiCache("a", "around")).toEqual({ answer: kept, kinds: ["water"], center: here, radiusM: 1000, savedAt: 1000 });
  expect(await readPoiCache("b", "around")).toBeNull();
  expect(await readPoiCache("a", "route:r1")).toBeNull();
  // « Around me » stays; of the routes, the eight looked at last.
  for (let i = 0; i < 12; i++) await writePoiCache("a", `route:r${i}`, { answer: kept, kinds: ["water"], radiusM: 250 }, 2000 + i);
  expect(await readPoiCache("a", "route:r11")).not.toBeNull();
  expect(await readPoiCache("a", "route:r4")).not.toBeNull();
  expect(await readPoiCache("a", "route:r3")).toBeNull();
  expect((await readPoiCache("a", "around"))?.savedAt).toBe(1000);
});

test("what is said about a point never goes beyond the source: quoted hours, the year of the last change or « unknown », no « open »", () => {
  expect(poiSourceLine({ source: "OpenStreetMap", license: "ODbL", fetchedAt: fetched })).toBe("Source : OpenStreetMap (ODbL), relevé du 25/11 à 14:05");
  expect(poiSourceLine({ source: "overpass", license: "", fetchedAt: "n/a" })).toBe("Source : OpenStreetMap (ODbL), date du relevé inconnue");
  expect(poiFreshness(poi({ osmUpdatedAt: "2024-06-01T10:00:00Z" }))).toBe("fiche modifiée en 2024");
  expect(poiFreshness(poi())).toBe("fraîcheur inconnue");
  expect(poiFreshness(poi({ osmUpdatedAt: "pas une date" }))).toBe("fraîcheur inconnue");
  expect(poiHours(poi({ openingHours: "24/7" }))).toBe("Horaires indiqués : 24/7 (non vérifiés)");
  expect(poiHours(poi({ openingHours: "Mo-Fr 08:00-18:00; PH off" }))).toBe("Horaires indiqués : Mo-Fr 08:00-18:00; PH off (non vérifiés)");
  expect(poiHours(poi())).toBeNull();
  for (const p of [poi({ openingHours: "24/7", fee: "no", access: "yes" }), poi({ openingHours: "Mo-Su 00:00-24:00", fee: true })]) {
    expect(`${poiHours(p)} ${poiExtras(p)} ${poiFreshness(p)} ${poiTitle(p)}`).not.toMatch(/ouvert|fermé/i);
  }
  expect(poiExtras(poi({ access: "customers", fee: "yes" }))).toBe("accès indiqué : customers · tarif indiqué : yes (non vérifié)");
  expect(poiExtras(poi())).toBeNull();
  expect(poiTitle(poi())).toBe("Point d’eau");
  expect(poiTitle(poi({ kind: "bike_repair", name: "Atelier du canal" }))).toBe("Atelier du canal");
  expect(poiTitle(poi({ kind: "inconnu" }))).toBe("Point utile");
  expect(poiAsPlace(poi({ name: "Fontaine Saint-Martin" }), fetched)).toEqual({ name: "Fontaine Saint-Martin", kind: "water", lat: 48.59, lon: 7.75, note: "Repris d’OpenStreetMap le 25/11/2026" });
  expect(poiAsPlace(poi({ kind: "picnic" }), fetched).kind).toBe("other");
});

test("along a route the points are ordered by the kilometre where they are met, and those away from the line are left out", () => {
  // 10 km due north; one degree of latitude is about 111.2 km.
  const north = GpsNav.makeRoute([Array.from({ length: 101 }, (_, i) => ({ lat: 48.5 + (i * 100) / 111195, lon: 7.7 }))], {})!;
  const at = (km: number, eastM: number, id: string) => poi({ id, lat: 48.5 + (km * 1000) / 111195, lon: 7.7 + eastM / (111195 * Math.cos((48.5 * Math.PI) / 180)) });
  const along = poisAlong([at(7.2, 30, "late"), at(1.1, -12, "early"), at(4, 900, "far"), at(4.5, 240, "edge")], north, 250);
  expect(along.map((p) => p.id)).toEqual(["early", "edge", "late"]);
  expect(along.map((p) => p.km)).toEqual(["1,1", "4,5", "7,2"]);
  expect(along[0]!.offM).toBe(12);
  expect(along[1]!.offM).toBeGreaterThan(230);
});
