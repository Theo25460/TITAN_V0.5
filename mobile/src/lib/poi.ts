/* V1.7.7 — « points utiles » (water, toilets, shelters, bike repair) read from OpenStreetMap through TITAN's own server function
   (/.netlify/functions/poi-nearby). Nothing is asked until the athlete taps: the request carries a position rounded to about 100 m
   (or a thinned route) and the account's token, never a name or a trace as recorded. What comes back is a volunteer map, not a
   promise: every line says where it comes from and when it was read, opening hours are quoted as written and never turned into
   « open », and a point without a date says its freshness is unknown. The last answer is kept per account for use without a network. */
import { GpsNav, type NavRoute } from "../core";
import { siteFunction } from "../data/api";
import { isOnline } from "./network";
import { ownerKey, readJSON, writeJSON } from "./storage";
import { PLACE_KINDS, type PlaceKind } from "./places";

export const POI_KINDS = ["water", "toilets", "shelter", "bike_repair"] as const;
export type PoiKind = (typeof POI_KINDS)[number];
export const POI_LABELS: Record<PoiKind, string> = { water: "Eau", toilets: "Toilettes", shelter: "Abris", bike_repair: "Réparation vélo" };
export const POI_RADII = [500, 1000, 2000, 5000] as const;
/** How far from the line a point still counts as « along the route ». */
export const POI_ALONG_M = 250;
export const POI_ALONG_POINTS = 60;

export type Poi = { id: string; kind: string; lat: number; lon: number; name: string | null; openingHours: string | null; fee: string | boolean | null; access: string | null; osmUpdatedAt: string | null };
export type PoiAnswer = { source: string; license: string; attribution: string; fetchedAt: string; pois: Poi[]; truncated: boolean };
export type PoiFailure = "POI_NOT_CONFIGURED" | "OFFLINE" | "AUTH_REQUIRED" | "BAD_REQUEST" | "RATE_LIMITED" | "QUOTA_EXCEEDED" | "UPSTREAM_UNAVAILABLE" | "UNKNOWN";
export type PoiResult = ({ ok: true } & PoiAnswer) | { ok: false; code: PoiFailure };
export type PoiQuery = { kinds: readonly string[]; around?: { lat: number; lon: number; radiusM: number }; along?: { points: [number, number][]; radiusM: number } };
export type PoiBody = { kinds: PoiKind[]; around?: { lat: number; lon: number; radiusM: number }; along?: { points: [number, number][]; radiusM: number } };

const round = (x: number, per: number) => Math.round(x * per) / per;
const validAt = (lat: unknown, lon: unknown): boolean => typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** The body sent to the server, or why nothing can be asked. Around a position: rounded to 3 decimals (about 100 m), 100 m to 5 km.
    Along a route: 60 points at most, rounded to 4 decimals (about 10 m), 50 to 500 m on each side (the server's own limits). */
export function buildPoiRequest(q: PoiQuery): { ok: true; body: PoiBody } | { ok: false; error: string } {
  const kinds = POI_KINDS.filter((k) => q.kinds.includes(k));
  if (!kinds.length) return { ok: false, error: "Choisis au moins un type de point." };
  if (q.around && !q.along) {
    if (!validAt(q.around.lat, q.around.lon)) return { ok: false, error: "Position inconnue." };
    return { ok: true, body: { kinds, around: { lat: round(q.around.lat, 1e3), lon: round(q.around.lon, 1e3), radiusM: Math.min(5000, Math.max(100, Math.round(q.around.radiusM) || 1000)) } } };
  }
  if (q.along && !q.around) {
    const points = q.along.points.filter((p) => validAt(p[0], p[1])).map((p) => [round(p[0], 1e4), round(p[1], 1e4)] as [number, number]);
    if (points.length < 2) return { ok: false, error: "Ce parcours n’a pas assez de points." };
    if (points.length > POI_ALONG_POINTS) return { ok: false, error: "Parcours trop détaillé pour cette recherche." };
    return { ok: true, body: { kinds, along: { points, radiusM: Math.min(500, Math.max(50, Math.round(q.along.radiusM) || POI_ALONG_M)) } } };
  }
  return { ok: false, error: "Recherche incomplète." };
}

/** The route as at most `max` [lat, lon] pairs: shape first (Douglas–Peucker with a growing tolerance), ends always kept. */
export function thinRoute(route: Pick<NavRoute, "segs">, max = POI_ALONG_POINTS): [number, number][] {
  const all = route.segs.flat();
  let pts = all, tol = 10;
  while (pts.length > max && tol < 20000) { pts = GpsNav.simplify(all, tol); tol *= 1.6; }
  if (pts.length > max) pts = pts.filter((_, i) => i === pts.length - 1 || i % Math.ceil(pts.length / (max - 1)) === 0).slice(0, max);
  return pts.map((p) => [p.lat, p.lon]);
}

const CODES: readonly PoiFailure[] = ["POI_NOT_CONFIGURED", "AUTH_REQUIRED", "BAD_REQUEST", "RATE_LIMITED", "QUOTA_EXCEEDED", "UPSTREAM_UNAVAILABLE"];
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
function readAnswer(body: Record<string, unknown>, now: number): PoiAnswer {
  const pois = (Array.isArray(body.pois) ? body.pois : []).flatMap((raw): Poi[] => {
    const p = (raw ?? {}) as Record<string, unknown>;
    if (!validAt(p.lat, p.lon)) return [];
    return [{ id: String(p.id ?? `${p.lat},${p.lon}`), kind: String(p.kind ?? "other"), lat: p.lat as number, lon: p.lon as number, name: text(p.name, 80), openingHours: text(p.openingHours, 160),
      fee: typeof p.fee === "boolean" ? p.fee : text(p.fee, 40), access: text(p.access, 40), osmUpdatedAt: text(p.osmUpdatedAt, 40) }];
  });
  const fetched = text(body.fetchedAt, 40);
  return { source: text(body.source, 60) ?? "OpenStreetMap", license: text(body.license, 40) ?? "ODbL", attribution: text(body.attribution, 120) ?? "© les contributeurs d’OpenStreetMap",
    fetchedAt: fetched && Number.isFinite(Date.parse(fetched)) ? fetched : new Date(now).toISOString(), pois, truncated: body.truncated === true };
}

export type PoiDeps = { fetch?: typeof fetch; online?: () => boolean; now?: () => number };
/** Asks the server. Never throws: every failure is a named state the screen explains (no network, service not set up on the server,
    quota…). No request is made without a network. */
export async function fetchPois(owner: string, query: PoiQuery, deps: PoiDeps = {}): Promise<PoiResult> {
  const built = buildPoiRequest(query);
  if (!built.ok) return { ok: false, code: "BAD_REQUEST" };
  if (!(deps.online ?? isOnline)()) return { ok: false, code: "OFFLINE" };
  let answer: { status: number; body: Record<string, unknown> | null };
  try {
    answer = await siteFunction(owner, "poi-nearby", built.body, deps.fetch);
  } catch (e) {
    // A request cut after its time limit is a service that does not answer, not a phone without a network.
    return { ok: false, code: /AUTH_REQUIRED/.test(String((e as Error)?.message)) ? "AUTH_REQUIRED" : (e as Error)?.name === "AbortError" ? "UPSTREAM_UNAVAILABLE" : "OFFLINE" };
  }
  const { status, body } = answer;
  if (body?.ok === true && status >= 200 && status < 300) return { ok: true, ...readAnswer(body, (deps.now ?? Date.now)()) };
  const code = CODES.find((c) => c === body?.code);
  if (code) return { ok: false, code };
  // The function itself is not on the server yet (404), or the server has no source set up.
  if (status === 404) return { ok: false, code: "POI_NOT_CONFIGURED" };
  if (status === 401) return { ok: false, code: "AUTH_REQUIRED" };
  if (status === 429) return { ok: false, code: "RATE_LIMITED" };
  if (status >= 500) return { ok: false, code: "UPSTREAM_UNAVAILABLE" };
  return { ok: false, code: "UNKNOWN" };
}

/* ---- The last answers, kept on the phone per account ---- */
export type PoiCached = { answer: PoiAnswer; kinds: string[]; center?: { lat: number; lon: number }; radiusM: number; savedAt: number };
const CACHE = (owner: string) => ownerKey("poi-cache", owner);
const MAX_SLOTS = 9; // « around me » and the eight routes looked at last
/** `slot`: "around" for the search around a position, "route:<id>" for a route. */
export const readPoiCache = async (owner: string, slot: string): Promise<PoiCached | null> => (await readJSON<Record<string, PoiCached>>(CACHE(owner), {}))[slot] ?? null;
export async function writePoiCache(owner: string, slot: string, entry: Omit<PoiCached, "savedAt">, now = Date.now()): Promise<void> {
  const all = await readJSON<Record<string, PoiCached>>(CACHE(owner), {});
  all[slot] = { ...entry, answer: { ...entry.answer, pois: entry.answer.pois.slice(0, 300) }, savedAt: now };
  const kept = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_SLOTS);
  await writeJSON(CACHE(owner), Object.fromEntries(kept));
}

/* ---- What is said about a point: never more than the source says ---- */
const two = (n: number) => String(n).padStart(2, "0");
/** « Source : OpenStreetMap (ODbL), relevé du 25/11 à 14:05 » (the phone's own time zone). */
export function poiSourceLine(a: Pick<PoiAnswer, "source" | "license" | "fetchedAt">): string {
  const d = new Date(a.fetchedAt);
  const source = !a.source || /osm|openstreetmap|overpass/i.test(a.source) ? "OpenStreetMap" : a.source;
  const when = Number.isFinite(d.getTime()) ? `relevé du ${two(d.getDate())}/${two(d.getMonth() + 1)} à ${two(d.getHours())}:${two(d.getMinutes())}` : "date du relevé inconnue";
  return `Source : ${source} (${a.license || "ODbL"}), ${when}`;
}
/** « fiche modifiée en 2024 », or « fraîcheur inconnue » when the source gives no date. */
export function poiFreshness(p: Pick<Poi, "osmUpdatedAt">): string {
  const year = p.osmUpdatedAt ? new Date(p.osmUpdatedAt).getFullYear() : NaN;
  return Number.isFinite(year) && year > 2000 ? `fiche modifiée en ${year}` : "fraîcheur inconnue";
}
/** Opening hours exactly as the map gives them. TITAN does not interpret them: it never says a place is open. */
export const poiHours = (p: Pick<Poi, "openingHours">): string | null => (p.openingHours ? `Horaires indiqués : ${p.openingHours} (non vérifiés)` : null);
/** Access and price as written on the map, when it says something. */
export function poiExtras(p: Pick<Poi, "fee" | "access">): string | null {
  const parts = [
    p.access ? `accès indiqué : ${p.access}` : null,
    p.fee === true ? "indiqué payant" : p.fee === false ? "indiqué gratuit" : p.fee ? `tarif indiqué : ${p.fee}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")} (non vérifié)` : null;
}
const KIND_NAMES: Record<string, string> = { ...PLACE_KINDS };
export const poiKindLabel = (kind: string) => KIND_NAMES[kind] ?? "Point utile";
export const poiTitle = (p: Pick<Poi, "name" | "kind">) => p.name || poiKindLabel(p.kind);
/** A point of the map as a personal point: the athlete's own copy, which no later reading of the map changes. */
export function poiAsPlace(p: Poi, fetchedAt: string): { name: string; kind: PlaceKind; lat: number; lon: number; note: string } {
  const d = new Date(fetchedAt);
  const day = Number.isFinite(d.getTime()) ? ` le ${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}` : "";
  return { name: poiTitle(p).slice(0, 60), kind: (p.kind in PLACE_KINDS ? p.kind : "other") as PlaceKind, lat: p.lat, lon: p.lon, note: `Repris d’OpenStreetMap${day}` };
}
/** The points within `maxM` of the route, in the order they are met, with the kilometre where each one is. */
export function poisAlong<P extends { lat: number; lon: number }>(pois: P[], route: NavRoute, maxM = POI_ALONG_M): (P & { offM: number; alongM: number; km: string })[] {
  return GpsNav.nearRoute(pois, route, maxM).map((p) => ({ ...p, km: (p.alongM / 1000).toFixed(1).replace(".", ",") }));
}

/** What the screen says for each failure: what happened, what still works, what is needed. */
export const POI_STATES: Record<PoiFailure, { title: string; text: string; retry: boolean }> = {
  POI_NOT_CONFIGURED: { title: "Points utiles : service pas encore en place", text: "Le serveur TITAN n’a pas encore de source de points utiles configurée. Ce n’est pas un réglage de ton téléphone : une mise à jour du serveur l’activera. En attendant, tes propres points fonctionnent normalement.", retry: false },
  OFFLINE: { title: "Pas de connexion", text: "Chercher des points utiles demande une connexion. Tes propres points et le dernier relevé gardé sur ce téléphone restent consultables.", retry: true },
  AUTH_REQUIRED: { title: "Session expirée", text: "Reconnecte-toi pour chercher des points utiles.", retry: false },
  BAD_REQUEST: { title: "Recherche refusée", text: "Le serveur n’a pas accepté cette recherche. Change le rayon ou les types de points, puis réessaie.", retry: true },
  RATE_LIMITED: { title: "Trop de recherches", text: "Beaucoup de recherches en peu de temps. Patiente une minute, puis réessaie.", retry: true },
  QUOTA_EXCEEDED: { title: "Quota atteint", text: "Le nombre de recherches possibles pour aujourd’hui est atteint. Réessaie demain ; tes propres points restent disponibles.", retry: false },
  UPSTREAM_UNAVAILABLE: { title: "Source indisponible", text: "La source de points utiles ne répond pas pour le moment. Réessaie dans quelques minutes.", retry: true },
  UNKNOWN: { title: "Recherche impossible", text: "La recherche n’a pas abouti. Réessaie dans un instant.", retry: true },
};
