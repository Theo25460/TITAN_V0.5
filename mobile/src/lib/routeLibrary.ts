/* V1.7.7 — the routes kept on this phone so they can be followed without a network: a route opened, imported, planned or recorded
   is copied here (one key per route: a long trace must stay under what the key-value store reads back). The server library
   (private.titan_routes) stays the reference on every device; this copy is what « Suivre ce parcours » reads, online or not.
   A copy is a trace, not a map: following it offline shows the line and the position, never a background map nor a recomputed road.

   Also here, because they are the phone's side of the same library:
   - the outbox of the routes the athlete imported or planned (sent with their name and origin once a network exists, never twice);
   - the notes the phone keeps while the server cannot (a name, an origin: the v1 functions know neither);
   - « same course? » over the library, with the work capped and stoppable. */
import { GpsEngine, GpsNav, type NavEffort, type NavEncoded, type NavRoute } from "../core";
import type { Track } from "./gpsTrack";
import { ownerKey, readJSON, readJSONStrict, remove, writeJSON } from "./storage";

export type OfflineRouteMeta = { id: string; name: string; sport: string | null; origin: NavRoute["origin"]; distanceM: number; ascentM: number | null; savedAt: number; bytes: number };
const INDEX = (owner: string) => ownerKey("route-offline-index", owner);
const ITEM = (owner: string, id: string) => `titan.route-offline.v1:${id}:${owner}`;
/** A route saved before the server knew it is copied under its client id; once the server answers, the copy moves under the server
    id and the client id keeps pointing at it (an outing that follows it can still read it after a restart). */
const ALIAS = (owner: string) => ownerKey("route-offline-alias", owner);
/** 60 routes of at most 3 000 points: about 6 MB at the very most, usually far less. The oldest copy leaves when the 61st arrives. */
export const MAX_OFFLINE_ROUTES = 60;
/** Server ids are UUIDs; anything else is an id made on this phone (a route the server has not confirmed, or never received). */
export const isServerRouteId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

let chain: Promise<unknown> = Promise.resolve();
const lock = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

export const listOfflineRoutes = (owner: string) => readJSON<OfflineRouteMeta[]>(INDEX(owner), []);

export function saveRouteOffline(owner: string, id: string, route: NavRoute): Promise<OfflineRouteMeta> {
  return lock(async () => {
    const raw = JSON.stringify(route);
    const meta: OfflineRouteMeta = { id, name: route.name, sport: route.sport, origin: route.origin, distanceM: route.distanceM, ascentM: route.ascentM, savedAt: Date.now(), bytes: raw.length };
    const index = (await listOfflineRoutes(owner)).filter((m) => m.id !== id);
    await writeJSON(ITEM(owner, id), route);
    const next = [meta, ...index];
    // Copies of routes the server has can be fetched again: they leave first. A copy that exists only here leaves last.
    while (next.length > MAX_OFFLINE_ROUTES) {
      let at = -1;
      for (let i = next.length - 1; i > 0 && at < 0; i--) if (isServerRouteId(next[i]!.id)) at = i;
      const [old] = next.splice(at < 0 ? next.length - 1 : at, 1);
      await remove(ITEM(owner, old!.id));
    }
    await writeJSON(INDEX(owner), next);
    return meta;
  });
}

/** The route to follow, read from this phone only. Null when it was never copied here (the caller then says so). */
export const loadRouteForFollow = async (owner: string, id: string): Promise<NavRoute | null> => {
  const direct = await readJSON<NavRoute | null>(ITEM(owner, id), null);
  if (direct) return direct;
  const moved = (await readJSON<Record<string, string>>(ALIAS(owner), {}))[id];
  return moved ? readJSON<NavRoute | null>(ITEM(owner, moved), null) : null;
};

/** The id a route answers to now: the server id once a route saved from this phone was confirmed, else the id itself. */
export const currentRouteId = async (owner: string, id: string): Promise<string> => (await readJSON<Record<string, string>>(ALIAS(owner), {}))[id] ?? id;

export function removeRouteOffline(owner: string, id: string): Promise<void> {
  return lock(async () => {
    await remove(ITEM(owner, id));
    await writeJSON(INDEX(owner), (await listOfflineRoutes(owner)).filter((m) => m.id !== id));
    const alias = await readJSON<Record<string, string>>(ALIAS(owner), {});
    const kept = Object.fromEntries(Object.entries(alias).filter(([from, to]) => from !== id && to !== id));
    if (Object.keys(kept).length !== Object.keys(alias).length) await writeJSON(ALIAS(owner), kept);
  });
}

export const offlineBytes = async (owner: string) => (await listOfflineRoutes(owner)).reduce((n, m) => n + m.bytes, 0);

/** The copy saved under a phone id moves under the id the server gave. Nothing happens when no copy exists. */
export function rekeyOfflineRoute(owner: string, from: string, to: string, patch?: Partial<Pick<NavRoute, "name" | "sport" | "origin">>): Promise<void> {
  return lock(async () => {
    if (from === to) return;
    const route = await readJSON<NavRoute | null>(ITEM(owner, from), null);
    if (!route) return;
    const moved = { ...route, ...(patch ?? {}) };
    await writeJSON(ITEM(owner, to), moved);
    const index = await listOfflineRoutes(owner);
    const old = index.find((m) => m.id === from);
    const meta: OfflineRouteMeta = { id: to, name: moved.name, sport: moved.sport, origin: moved.origin, distanceM: moved.distanceM, ascentM: moved.ascentM, savedAt: old?.savedAt ?? Date.now(), bytes: JSON.stringify(moved).length };
    await writeJSON(INDEX(owner), [meta, ...index.filter((m) => m.id !== from && m.id !== to)]);
    const alias = await readJSON<Record<string, string>>(ALIAS(owner), {});
    const entries = [...Object.entries(alias).filter(([k]) => k !== from), [from, to] as [string, string]].slice(-MAX_OFFLINE_ROUTES);
    await writeJSON(ALIAS(owner), Object.fromEntries(entries));
    await remove(ITEM(owner, from));
  });
}

/** A route as the map and the existing GPX helpers read it (a route has no accuracy; a planned or imported one has no time). */
export const routeToTrack = (route: Pick<NavRoute, "segs">): Track => ({
  rejected: 0,
  segs: route.segs.map((s) => s.map((p) => ({ lat: p.lat, lon: p.lon, alt: p.ele ?? null, altAcc: null, acc: null, t: p.t ?? 0 }))),
});

/* ---- What the phone remembers while the server cannot: a name, an origin ---- */
export type RouteNote = { name?: string; origin?: "recorded" | "imported" | "planned"; /** the name still has to reach the server */ unsent?: boolean };
const NOTES = (owner: string) => ownerKey("route-names", owner);
export const routeNotes = (owner: string) => readJSON<Record<string, RouteNote>>(NOTES(owner), {});
/** Merges a note for a route (by server id); `null` forgets it. */
export function setRouteNote(owner: string, id: string, note: RouteNote | null): Promise<void> {
  return lock(async () => {
    const all = await readJSONStrict<Record<string, RouteNote>>(NOTES(owner), {});
    if (note === null) delete all[id];
    else all[id] = { ...(all[id] ?? {}), ...note };
    await writeJSON(NOTES(owner), all);
  });
}
/** 1 to 80 characters, white space folded: what the server keeps as a route name. Empty when nothing is left. */
export const cleanRouteName = (name: string) => String(name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim();

/* ---- Outbox of the routes imported or planned on this phone ---- */
export type PendingLibraryRoute = { clientRouteId: string; sport: string; startedAt: string; distanceM: number; durationS: number; ascentM: number | null; name: string; origin: "imported" | "planned"; attempts: number; rejected?: boolean; reason?: string };
export type LibrarySavePayload = Omit<PendingLibraryRoute, "attempts" | "rejected" | "reason"> & { track: NavEncoded };
export type LibrarySaver = (r: LibrarySavePayload) => Promise<{ id: string; created: boolean; legacy: boolean }>;
const OUTBOX = (owner: string) => ownerKey("routes-library-outbox", owner);
// One key per trace: twenty long traces in a single value would not be read back (about 2 MB a row on Android).
const OUTBOX_ITEM = (owner: string, id: string) => `titan.routes-library-outbox.item:${id}:${owner}`;
export const MAX_PENDING_LIBRARY = 20;
/** The server keeps 2 000 km and 20 000 m of climb at most for one route. */
export const MAX_LIBRARY_DISTANCE_M = 2_000_000;

const newId = () => `r${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 8).toString(36).padStart(8, "0")}`;
export const pendingLibraryRoutes = (owner: string) => readJSONStrict<PendingLibraryRoute[]>(OUTBOX(owner), []);

/** Puts an imported or planned route in the library, network or not: the copy for following exists at once (under the returned id),
    the upload waits in the outbox. Asking twice with the same id keeps one. Throws ROUTE_TOO_LONG / ROUTE_OUTBOX_FULL / ROUTE_NAME. */
export async function addToLibrary(owner: string, route: NavRoute, meta: { name: string; sport: string; origin: "imported" | "planned"; id?: string; now?: number }): Promise<PendingLibraryRoute> {
  const name = cleanRouteName(meta.name);
  if (!name) throw new Error("ROUTE_NAME");
  if (route.distanceM > MAX_LIBRARY_DISTANCE_M) throw new Error("ROUTE_TOO_LONG");
  const id = meta.id ?? newId();
  const fitted = GpsNav.fit({ ...route, name, sport: meta.sport, origin: meta.origin });
  const pending: PendingLibraryRoute = {
    clientRouteId: id, sport: meta.sport, startedAt: new Date(meta.now ?? Date.now()).toISOString(), distanceM: Math.round(fitted.distanceM), durationS: 0,
    ascentM: fitted.ascentM === null ? null : Math.min(20000, Math.max(0, Math.round(fitted.ascentM))), name, origin: meta.origin, attempts: 0,
  };
  await saveRouteOffline(owner, id, fitted);
  return lock(async () => {
    const list = await pendingLibraryRoutes(owner);
    const known = list.find((x) => x.clientRouteId === id);
    if (known) return known;
    if (list.length >= MAX_PENDING_LIBRARY) throw new Error("ROUTE_OUTBOX_FULL");
    await writeJSON(OUTBOX_ITEM(owner, id), GpsNav.encode(fitted));
    await writeJSON(OUTBOX(owner), [...list, pending]);
    return pending;
  });
}
/** The athlete withdraws a route still waiting: it will never be sent. Its copy on the phone is left to the caller. */
export function discardLibraryRoute(owner: string, clientRouteId: string): Promise<boolean> {
  return lock(async () => {
    const list = await pendingLibraryRoutes(owner);
    const kept = list.filter((r) => r.clientRouteId !== clientRouteId);
    await remove(OUTBOX_ITEM(owner, clientRouteId));
    if (kept.length === list.length) return false;
    await writeJSON(OUTBOX(owner), kept);
    return true;
  });
}
/** A waiting route renamed before it left: the upload carries the new name. */
export function renamePendingLibraryRoute(owner: string, clientRouteId: string, name: string): Promise<boolean> {
  return lock(async () => {
    const list = await pendingLibraryRoutes(owner);
    if (!list.some((r) => r.clientRouteId === clientRouteId)) return false;
    await writeJSON(OUTBOX(owner), list.map((r) => (r.clientRouteId === clientRouteId ? { ...r, name: cleanRouteName(name) || r.name } : r)));
    return true;
  });
}

let flushing = new Map<string, Promise<unknown>>();
/** Sends the waiting routes, oldest first; each one is independent (a refused route never blocks the others) and a failure keeps it.
    The server answers the same client id with the first row, so a lost answer or a retry never duplicates a route. When it only has the
    v1 functions (`legacy`), the route is saved without its name and origin: the phone notes them under the server id. */
export async function flushLibraryRoutes(owner: string, save: LibrarySaver): Promise<{ sent: number; left: number; legacy: boolean }> {
  const inProgress = flushing.get(owner);
  if (inProgress) {
    await inProgress.catch(() => {});
    return flushLibraryRoutes(owner, save);
  }
  let release!: () => void;
  flushing.set(owner, new Promise<void>((resolve) => { release = resolve; }));
  let sent = 0, legacy = false;
  try {
    for (const r of await pendingLibraryRoutes(owner)) {
      let failure: string | null = null;
      let saved: { id: string; legacy: boolean } | null = null;
      try {
        const track = await readJSON<NavEncoded | null>(OUTBOX_ITEM(owner, r.clientRouteId), null);
        if (!track) throw new Error("BAD_TRACK");
        const { attempts: _a, rejected: _r, reason: _why, ...payload } = r;
        void _a; void _r; void _why;
        saved = await save({ ...payload, track });
        sent++;
      } catch (e) {
        failure = String((e as { message?: unknown })?.message ?? e ?? "");
      }
      if (saved) {
        legacy = legacy || saved.legacy;
        // The name may have been changed while the request was in flight: the outbox row is read again.
        const current = (await pendingLibraryRoutes(owner)).find((x) => x.clientRouteId === r.clientRouteId) ?? r;
        const renamed = current.name !== r.name;
        if (saved.legacy || renamed) await setRouteNote(owner, saved.id, { name: current.name, origin: r.origin, ...(saved.legacy ? {} : { unsent: true }) });
        await rekeyOfflineRoute(owner, r.clientRouteId, saved.id, { name: current.name });
      }
      await lock(async () => {
        const current = await pendingLibraryRoutes(owner);
        if (failure === null) {
          await remove(OUTBOX_ITEM(owner, r.clientRouteId));
          await writeJSON(OUTBOX(owner), current.filter((x) => x.clientRouteId !== r.clientRouteId));
        } else {
          const code = /BAD_[A-Z_]+|SPORT_UNKNOWN|TRACK_TOO_LARGE|ROUTE_LIMIT/.exec(failure)?.[0];
          await writeJSON(OUTBOX(owner), current.map((x) => (x.clientRouteId === r.clientRouteId ? { ...x, attempts: x.attempts + 1, rejected: !!code, reason: code } : x)));
        }
      });
    }
    return { sent, left: (await pendingLibraryRoutes(owner)).length, legacy };
  } finally {
    flushing.delete(owner);
    release();
  }
}
export const _resetLibraryForTests = () => { flushing = new Map(); chain = Promise.resolve(); };

/* ---- Same course? Comparing the outings of the library on one route ---- */
export type CompareMeta = { id: string; sport: string; startedAt: string; distanceM: number; durationS: number; ascentM: number | null; origin: string | null; name?: string | null; summary: { movingS?: number; elapsedS?: number; missingS?: number; distanceM?: number } | null };
/** At most this many other routes have their trace loaded and compared for one question. */
export const COMPARE_MAX = 25;
export const APPROX_TIME_NOTE = "temps actif, arrêts compris";
/** The routes worth loading: recorded outings (a planned or imported line has no time) of the same sport family whose distance is
    within 10 % of the reference, most recent first, 25 at most. */
export function compareCandidates(ref: CompareMeta, all: CompareMeta[]): CompareMeta[] {
  const family = GpsEngine.familyOf(ref.sport);
  return all
    .filter((r) => r.id !== ref.id && (r.origin ?? "recorded") === "recorded" && r.durationS > 0 && GpsEngine.familyOf(r.sport) === family
      && ref.distanceM > 0 && Math.abs(r.distanceM - ref.distanceM) / Math.max(r.distanceM, ref.distanceM) <= GpsNav.SAME.length)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, COMPARE_MAX);
}
/** `approx`: no engine summary was saved with this outing, so its time is the active time, stops included. */
export type CourseEffort = NavEffort & { approx: boolean; self: boolean };
export const effortOf = (m: CompareMeta, direction: NavEffort["direction"], self = false): CourseEffort => {
  const moving = Number(m.summary?.movingS);
  const precise = Number.isFinite(moving) && moving > 0;
  return {
    id: m.id, date: m.startedAt, movingS: precise ? moving : m.durationS, elapsedS: Number(m.summary?.elapsedS) || undefined, missingS: Number(m.summary?.missingS) || undefined,
    distanceM: Number(m.summary?.distanceM) > 0 ? Number(m.summary!.distanceM) : m.distanceM, direction, approx: !precise, self,
  };
};
export type CourseComparison = {
  total: number; examined: number; stopped: boolean; unreadable: number; different: { id: string; reason: string }[];
  comparable: (CourseEffort & { speedKmh: number })[]; excluded: (CourseEffort & { reason: string })[];
  /** Only among outings with a measured moving time, and only with two of them. */
  best: (CourseEffort & { speedKmh: number }) | null;
  criteria: string; note: string;
};
/** Looks for the reference course among the candidates, one trace at a time (`load` fetches it lazily), then compares the outings
    found on their moving time. `shouldStop` is asked before each trace: what was examined so far is still answered. */
export async function compareOnCourse(ref: { meta: CompareMeta; route: NavRoute }, candidates: CompareMeta[], load: (id: string) => Promise<NavRoute | null>,
  opts: { onProgress?: (done: number, total: number) => void; shouldStop?: () => boolean } = {}): Promise<CourseComparison> {
  const list = candidates.slice(0, COMPARE_MAX);
  const efforts: CourseEffort[] = [];
  if ((ref.meta.origin ?? "recorded") === "recorded" && ref.meta.durationS > 0) efforts.push(effortOf(ref.meta, "same", true));
  const different: CourseComparison["different"] = [];
  let examined = 0, unreadable = 0, stopped = false;
  for (const c of list) {
    if (opts.shouldStop?.()) { stopped = true; break; }
    let other: NavRoute | null = null;
    try { other = await load(c.id); } catch { other = null; }
    examined++;
    if (!other) unreadable++;
    else {
      const same = GpsNav.sameRoute(ref.route, other);
      if (same.match) efforts.push(effortOf(c, same.direction));
      else different.push({ id: c.id, reason: same.reason });
    }
    opts.onProgress?.(examined, list.length);
  }
  // The shared rule returns each effort as it was given (the extra fields of CourseEffort come back with it).
  type Compared = { comparable: (CourseEffort & { speedKmh: number })[]; excluded: (CourseEffort & { reason: string })[]; best: (CourseEffort & { speedKmh: number }) | null; criteria: string; note: string };
  const all = GpsNav.compareEfforts(ref.route.distanceM, efforts) as unknown as Compared;
  const measured = GpsNav.compareEfforts(ref.route.distanceM, efforts.filter((e) => !e.approx)) as unknown as Compared;
  return { total: list.length, examined, stopped, unreadable, different, comparable: all.comparable, excluded: all.excluded, best: measured.best, criteria: all.criteria, note: measured.note };
}
/** The figures of one route for a side-by-side reading (two different courses: indicative only). */
export function figuresOf(m: CompareMeta): { distanceM: number; ascentM: number | null; timeS: number | null; approx: boolean; speedKmh: number | null } {
  const e = effortOf(m, null);
  const timeS = e.movingS > 0 ? e.movingS : null;
  return { distanceM: e.distanceM, ascentM: m.ascentM, timeS, approx: timeS !== null && e.approx, speedKmh: timeS && e.distanceM > 0 ? Math.round((e.distanceM / timeS) * 36) / 10 : null };
}
