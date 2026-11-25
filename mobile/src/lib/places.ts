/* V1.7.7 — personal points (a fountain, a shelter, a bike shop the athlete wants to find again). Private: they live on this phone and,
   once the server knows them, on the athlete's account only (private.titan_places). They are never part of a share, a card or the
   adventure. Local first: a point added without a network exists at once and is sent later (`dirty`); a deleted point stays as a
   tombstone until the server has removed it. */
import { ownerKey, readJSONStrict, writeJSON } from "./storage";

export const PLACE_KINDS = { water: "Point d’eau", toilets: "Toilettes", shelter: "Abri", bike_repair: "Réparation vélo", food: "Ravitaillement", viewpoint: "Point de vue", parking: "Stationnement", other: "Autre" } as const;
export type PlaceKind = keyof typeof PLACE_KINDS;
export type Place = { id: string; name: string; kind: PlaceKind; lat: number; lon: number; note: string; updatedAt: number; dirty?: boolean; deleted?: boolean; serverId?: string };
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
