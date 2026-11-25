/* V1.7.7 — personal points (a fountain, a shelter, a bike shop the athlete wants to find again). Private: they live on this phone and,
   once the server knows them, on the athlete's account only (private.titan_places). They are never part of a share, a card or the
   adventure. Local first: a point added without a network exists at once and is sent later (`dirty`); a deleted point stays as a
   tombstone until the server has removed it. */
import { ownerKey, readJSONStrict, writeJSON } from "./storage";

export const PLACE_KINDS = { water: "Point d’eau", toilets: "Toilettes", shelter: "Abri", bike_repair: "Réparation vélo", food: "Ravitaillement", viewpoint: "Point de vue", parking: "Stationnement", other: "Autre" } as const;
export type PlaceKind = keyof typeof PLACE_KINDS;
/** `seen`: the server's `updatedAt` of the version this row was last aligned with (absent until the first synchronisation). */
export type Place = { id: string; name: string; kind: PlaceKind; lat: number; lon: number; note: string; updatedAt: number; dirty?: boolean; deleted?: boolean; serverId?: string; seen?: string };
export const MAX_PLACES = 300;
const KEY = (owner: string) => ownerKey("places", owner);

let chain: Promise<unknown> = Promise.resolve();
const lock = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};
const all = (owner: string) => readJSONStrict<Place[]>(KEY(owner), []);
const clean = (p: Pick<Place, "name" | "kind" | "lat" | "lon"> & { note?: string }) => {
  const name = String(p.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new Error("PLACE_NAME");
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) throw new Error("PLACE_POSITION");
  return { name, kind: (p.kind in PLACE_KINDS ? p.kind : "other") as PlaceKind, lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5, note: String(p.note || "").replace(/\s+/g, " ").trim().slice(0, 200) };
};

/** The points to show (tombstones left out). */
export const listPlaces = async (owner: string) => (await all(owner)).filter((p) => !p.deleted);
/** Every stored row, tombstones included: what the synchronisation reads. */
export const rawPlaces = all;

export function addPlace(owner: string, p: Pick<Place, "name" | "kind" | "lat" | "lon"> & { note?: string }, id = `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): Promise<Place> {
  return lock(async () => {
    const list = await all(owner);
    if (list.filter((x) => !x.deleted).length >= MAX_PLACES) throw new Error("PLACE_LIMIT");
    const place: Place = { id, ...clean(p), updatedAt: Date.now(), dirty: true };
    await writeJSON(KEY(owner), [...list, place]);
    return place;
  });
}
export function updatePlace(owner: string, id: string, patch: Partial<Pick<Place, "name" | "kind" | "note">>): Promise<Place | null> {
  return lock(async () => {
    const list = await all(owner);
    const cur = list.find((p) => p.id === id && !p.deleted);
    if (!cur) return null;
    const next: Place = { ...cur, ...clean({ ...cur, ...patch }), updatedAt: Date.now(), dirty: true };
    await writeJSON(KEY(owner), list.map((p) => (p.id === id ? next : p)));
    return next;
  });
}
export function removePlace(owner: string, id: string): Promise<void> {
  return lock(async () => {
    const list = await all(owner);
    // a point the server never saw simply disappears; one it knows stays as a tombstone until the deletion is confirmed
    await writeJSON(KEY(owner), list.flatMap((p) => (p.id !== id ? [p] : p.serverId ? [{ ...p, deleted: true, dirty: true, updatedAt: Date.now() }] : [])));
  });
}
/** Applies what a synchronisation settled: rows to replace by id, ids to drop for good. */
export function settlePlaces(owner: string, replace: Place[], drop: string[]): Promise<void> {
  return lock(async () => {
    const byId = new Map(replace.map((p) => [p.id, p]));
    const list = (await all(owner)).filter((p) => !drop.includes(p.id)).map((p) => byId.get(p.id) ?? p);
    for (const p of replace) if (!list.some((x) => x.id === p.id)) list.push(p);
    await writeJSON(KEY(owner), list);
  });
}

/* ---- Synchronisation with the account (private.titan_places) ---- */
/** What the synchronisation needs from the server. Each call answers `null` when the server does not have the function yet. */
export type PlacesRemote = {
  list: () => Promise<{ id: string; clientPlaceId: string; name: string; kind: string; lat: number; lon: number; note: string; updatedAt: string }[] | null>;
  save: (p: { clientPlaceId: string; name: string; kind: string; lat: number; lon: number; note: string }) => Promise<{ id: string; created: boolean } | null>;
  remove: (serverId: string) => Promise<boolean | null>;
};
/** "synced": the phone and the account hold the same points. "local": the server cannot keep points yet, they stay on this phone.
    "pending": something could not be sent (no network, a refusal): it stays here and is sent again next time. */
export type PlacesSync = { state: "synced" | "local" | "pending"; pushed: number; pulled: number; removed: number; waiting: number };
export const PLACES_LOCAL_NOTE = "Enregistrés sur ce téléphone seulement pour l’instant";

const stamp = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };
const fromServer = (s: NonNullable<Awaited<ReturnType<PlacesRemote["list"]>>>[number], id: string): Place => ({
  id, serverId: s.id, name: s.name, kind: (s.kind in PLACE_KINDS ? s.kind : "other") as PlaceKind, lat: s.lat, lon: s.lon, note: s.note ?? "", updatedAt: stamp(s.updatedAt), seen: s.updatedAt,
});

let syncing = new Map<string, Promise<PlacesSync>>();
/** Pulls the account's points, then sends what changed here. Rules:
    - a point known on one side only is copied to the other (two phones that each add a point both keep both);
    - a point changed here and untouched on the account since the last synchronisation is sent; changed on both sides, the latest
      change wins (`updatedAt`: the only case where the two clocks are compared);
    - a point deleted here is deleted on the account, unless it was changed there after the deletion (then it comes back);
    - a point deleted on another phone and untouched here disappears here; changed here in the meantime, it is saved again.
    One run at a time per account; nothing local is lost when a request fails, and a change made while a request was in flight
    is never overwritten by its answer. */
export function syncPlaces(owner: string, remote: PlacesRemote): Promise<PlacesSync> {
  const running = syncing.get(owner);
  if (running) return running;
  const run = syncOnce(owner, remote).finally(() => { if (syncing.get(owner) === run) syncing.delete(owner); });
  syncing.set(owner, run);
  return run;
}
type ServerRow = NonNullable<Awaited<ReturnType<PlacesRemote["list"]>>>[number];
type Decision = { id: string; base?: Place } & ({ next: Place } | { drop: true } | { sent: string });
async function syncOnce(owner: string, remote: PlacesRemote): Promise<PlacesSync> {
  const waitingOf = async () => (await all(owner)).filter((p) => p.dirty).length;
  let server: ServerRow[] | null;
  try {
    server = await remote.list();
  } catch {
    return { state: "pending", pushed: 0, pulled: 0, removed: 0, waiting: await waitingOf() };
  }
  if (server === null) return { state: "local", pushed: 0, pulled: 0, removed: 0, waiting: await waitingOf() };
  const local = await all(owner);
  const byServerId = new Map(server.map((s) => [s.id, s]));
  const byClientId = new Map(server.map((s) => [s.clientPlaceId, s]));
  const matched = new Set<string>();
  const decisions: Decision[] = [];
  let pushed = 0, pulled = 0, removed = 0, failed = false;
  const push = async (p: Place) => {
    try {
      const r = await remote.save({ clientPlaceId: p.id, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, note: p.note });
      if (r === null) failed = true;
      else { decisions.push({ id: p.id, base: p, sent: r.id }); pushed++; }
    } catch {
      failed = true;
    }
  };
  for (const p of local) {
    const s = (p.serverId ? byServerId.get(p.serverId) : undefined) ?? byClientId.get(p.id);
    if (s) matched.add(s.id);
    // The account's version moved since this phone last saw it, and later than the change made here: it wins.
    const theirs = !!s && p.seen !== undefined && s.updatedAt !== p.seen && stamp(s.updatedAt) > p.updatedAt;
    if (p.deleted) {
      if (!s) decisions.push({ id: p.id, base: p, drop: true });
      else if (theirs) { decisions.push({ id: p.id, base: p, next: fromServer(s, p.id) }); pulled++; }
      else {
        try {
          if ((await remote.remove(s.id)) === null) failed = true;
          else { decisions.push({ id: p.id, base: p, drop: true }); removed++; }
        } catch { failed = true; }
      }
    } else if (!s) {
      if (p.serverId && !p.dirty) { decisions.push({ id: p.id, base: p, drop: true }); removed++; }
      else await push(p);
    } else if (p.dirty) {
      if (theirs) { decisions.push({ id: p.id, base: p, next: fromServer(s, p.id) }); pulled++; }
      else await push(p);
    } else if (!p.serverId || p.seen !== s.updatedAt) {
      decisions.push({ id: p.id, base: p, next: fromServer(s, p.id) });
      if (p.name !== s.name || p.kind !== s.kind || p.note !== (s.note ?? "") || p.lat !== s.lat || p.lon !== s.lon) pulled++;
    }
  }
  for (const s of server) {
    if (matched.has(s.id)) continue;
    decisions.push({ id: s.clientPlaceId, next: fromServer(s, s.clientPlaceId) });
    pulled++;
  }
  // What was sent is read back once, to know the account's own date of each row (the next comparison then needs no clock).
  let after = new Map<string, ServerRow>();
  if (pushed) {
    try { after = new Map(((await remote.list()) ?? []).map((s) => [s.id, s])); } catch { /* the dates stay unknown: the phone's change keeps winning */ }
  }
  if (decisions.length) {
    await lock(async () => {
      const current = await all(owner);
      const index = new Map(current.map((p, i) => [p.id, i]));
      const gone = new Set<string>();
      for (const d of decisions) {
        const at = index.get(d.id);
        const now = at === undefined ? undefined : current[at]!;
        const untouched = !!now && !!d.base && now.updatedAt === d.base.updatedAt && !!now.deleted === !!d.base.deleted;
        if ("sent" in d) {
          if (!now) continue;
          const seen = after.get(d.sent)?.updatedAt;
          current[at!] = untouched ? { ...now, serverId: d.sent, dirty: false, seen } : { ...now, serverId: d.sent, seen: seen ?? now.seen };
        } else if ("drop" in d) {
          if (untouched) gone.add(d.id);
        } else if (!now) {
          if (!d.base) { index.set(d.id, current.length); current.push(d.next); }
        } else if (untouched) current[at!] = d.next;
        else current[at!] = { ...now, serverId: d.next.serverId };
      }
      await writeJSON(KEY(owner), current.filter((p) => !gone.has(p.id)));
    });
  }
  const waiting = await waitingOf();
  return { state: failed || waiting ? "pending" : "synced", pushed, pulled, removed, waiting };
}
export const _resetPlacesSyncForTests = () => { syncing = new Map(); chain = Promise.resolve(); };

/* ---- One position, asked once, in the foreground ---- */
export type Located = { ok: true; lat: number; lon: number; accuracyM: number | null; at: number } | { ok: false; reason: "denied" | "blocked" | "unavailable" | "timeout" };
export const LOCATE_FAILURES: Record<Exclude<Located, { ok: true }>["reason"], string> = {
  denied: "Position non autorisée. Tu peux saisir des coordonnées à la place.",
  blocked: "La localisation est refusée pour TITAN dans les réglages d’Android. Autorise-la là-bas, ou saisis des coordonnées.",
  unavailable: "La localisation du téléphone est coupée ou indisponible. Active-la, ou saisis des coordonnées.",
  timeout: "Pas de position obtenue. Mets-toi à ciel ouvert et réessaie, ou saisis des coordonnées.",
};
type LocationModule = typeof import("expo-location");
// Loaded when a position is asked, not when this file is imported: the stores above stay usable from any module and any test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const location = (): LocationModule => require("expo-location") as LocationModule;
/** Reads the position once (no tracking, no background). `explain` shows TITAN's own explanation before Android's prompt and
    answers whether the athlete goes on; it is only called when the permission has to be asked. */
export async function locateOnce(explain?: () => Promise<boolean>, timeoutMs = 20000): Promise<Located> {
  try {
    const Location = location();
    if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: "unavailable" };
    const cur = await Location.getForegroundPermissionsAsync();
    if (!cur.granted) {
      if (!cur.canAskAgain) return { ok: false, reason: "blocked" };
      if (explain && !(await explain())) return { ok: false, reason: "denied" };
      const res = await Location.requestForegroundPermissionsAsync();
      if (!res.granted) return { ok: false, reason: res.canAskAgain ? "denied" : "blocked" };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const got = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (!got || !Number.isFinite(got.coords.latitude) || !Number.isFinite(got.coords.longitude)) return { ok: false, reason: "timeout" };
    return { ok: true, lat: got.coords.latitude, lon: got.coords.longitude, accuracyM: got.coords.accuracy ?? null, at: got.timestamp };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
/** The last position Android already knows, only when the permission is already granted: never a prompt, never a new reading. */
export async function lastKnownPosition(): Promise<{ lat: number; lon: number; at: number } | null> {
  try {
    const Location = location();
    if (!(await Location.getForegroundPermissionsAsync()).granted) return null;
    const got = await Location.getLastKnownPositionAsync();
    return got && Number.isFinite(got.coords.latitude) && Number.isFinite(got.coords.longitude) ? { lat: got.coords.latitude, lon: got.coords.longitude, at: got.timestamp } : null;
  } catch {
    return null;
  }
}

/** « 48.5839, 7.7455 » (also « 48,5839 ; 7,7455 » or two numbers separated by a space). Null when it is not a latitude and a longitude. */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  let parts = raw.split(/\s*;\s*/);
  if (parts.length !== 2) {
    const dots = raw.split(/\s*,\s*|\s+/).filter(Boolean);
    // « 48,5839 7,7455 »: decimal commas, a space between the two numbers.
    const commas = raw.split(/\s+/).filter(Boolean);
    parts = dots.length === 2 ? dots : commas.length === 2 ? commas : [];
  }
  if (parts.length !== 2) return null;
  const [lat, lon] = parts.map((p) => (/^[+-]?\d{1,3}([.,]\d+)?$/.test(p) ? Number(p.replace(",", ".")) : NaN));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat!) > 90 || Math.abs(lon!) > 180) return null;
  return { lat: Math.round(lat! * 1e5) / 1e5, lon: Math.round(lon! * 1e5) / 1e5 };
}
const R = 6371008.8, RAD = Math.PI / 180;
/** Straight-line distance in metres. */
export function distanceBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const h = Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lon - a.lon) * RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** « 240 m », « 1,2 km », « 14 km ». */
export const distanceLabel = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : m < 10000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m / 1000)} km`);
