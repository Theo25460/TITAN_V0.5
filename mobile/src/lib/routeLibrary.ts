/* V1.7.7 — the routes kept on this phone so they can be followed without a network: a route opened, imported, planned or recorded
   is copied here (one key per route: a long trace must stay under what the key-value store reads back). The server library
   (private.titan_routes) stays the reference on every device; this copy is what « Suivre ce parcours » reads, online or not.
   A copy is a trace, not a map: following it offline shows the line and the position, never a background map nor a recomputed road. */
import type { NavRoute } from "../core";
import { ownerKey, readJSON, remove, writeJSON } from "./storage";

export type OfflineRouteMeta = { id: string; name: string; sport: string | null; origin: NavRoute["origin"]; distanceM: number; ascentM: number | null; savedAt: number; bytes: number };
const INDEX = (owner: string) => ownerKey("route-offline-index", owner);
const ITEM = (owner: string, id: string) => `titan.route-offline.v1:${id}:${owner}`;
/** 60 routes of at most 3 000 points: about 6 MB at the very most, usually far less. The oldest copy leaves when the 61st arrives. */
export const MAX_OFFLINE_ROUTES = 60;

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
    for (const old of next.splice(MAX_OFFLINE_ROUTES)) await remove(ITEM(owner, old.id));
    await writeJSON(INDEX(owner), next);
    return meta;
  });
}

/** The route to follow, read from this phone only. Null when it was never copied here (the caller then says so). */
export const loadRouteForFollow = (owner: string, id: string) => readJSON<NavRoute | null>(ITEM(owner, id), null);

export function removeRouteOffline(owner: string, id: string): Promise<void> {
  return lock(async () => {
    await remove(ITEM(owner, id));
    await writeJSON(INDEX(owner), (await listOfflineRoutes(owner)).filter((m) => m.id !== id));
  });
}

export const offlineBytes = async (owner: string) => (await listOfflineRoutes(owner)).reduce((n, m) => n + m.bytes, 0);
