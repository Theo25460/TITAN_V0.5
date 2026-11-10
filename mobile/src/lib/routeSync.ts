/* Routes recorded with the GPS wait in a durable local outbox until the server has them. The server answers the same client route id
   with the first row, so a retry, a lost answer or two phones never duplicate a route (and a route never creates XP). */
import { ownerKey, readJSONStrict as readJSON, writeJSON } from "./storage";
import { encodeTrack, type EncodedTrack, type Track } from "./gpsTrack";

export type PendingRoute = { clientRouteId: string; sport: string; startedAt: string; distanceM: number; durationS: number; ascentM: number | null; track: EncodedTrack; attempts: number; rejected?: boolean };
export type Saver = (r: Omit<PendingRoute, "attempts">) => Promise<unknown>;
export type Linker = (clientRouteId: string, eventId: string) => Promise<unknown>;
export type PendingLink = { clientRouteId: string; eventId: string; attempts: number };
const LINKS = (o: string) => ownerKey("routes-links", o);
// Only local mutations hold this lock; network uploads must not prevent a new recording from being saved.
let mutations = new Map<string, Promise<unknown>>();
function mutate<T>(owner: string, fn: () => Promise<T>): Promise<T> {
  const run = (mutations.get(owner) ?? Promise.resolve()).then(fn, fn);
  mutations.set(owner, run.catch(() => {}));
  return run;
}

/** A confirmed session can link only to the route id carried by its own GPS draft. */
export async function queueRouteLink(owner: string, clientRouteId: string, eventId: string) {
  return mutate(owner, async () => {
    const list = await readJSON<PendingLink[]>(LINKS(owner), []);
    if (list.some((l) => l.clientRouteId === clientRouteId)) return;
    if (list.length >= MAX_PENDING) throw new Error("ROUTE_OUTBOX_FULL");
    await writeJSON(LINKS(owner), [...list, { clientRouteId, eventId, attempts: 0 }]);
  });
}
export const pendingLinks = (owner: string) => readJSON<PendingLink[]>(LINKS(owner), []);
const KEY = (o: string) => ownerKey("routes-outbox", o);
const MAX_PENDING = 20;

export const newRouteId = (rand: () => number = Math.random, now = Date.now) => `r${now().toString(36)}-${Math.floor(rand() * 36 ** 8).toString(36).padStart(8, "0")}`;

export function buildPending(opts: { track: Track; sport: string; startedAt: number; distanceKm: number; activeSeconds: number; ascent: number | null; id?: string }): PendingRoute | null {
  const track = encodeTrack(opts.track);
  if (!track) return null;
  return {
    clientRouteId: opts.id ?? newRouteId(),
    sport: opts.sport,
    startedAt: new Date(opts.startedAt).toISOString(),
    distanceM: Math.max(0, Math.round(opts.distanceKm * 1000)),
    durationS: Math.max(0, Math.round(opts.activeSeconds)),
    ascentM: opts.ascent,
    track,
    attempts: 0,
  };
}

export async function queueRoute(owner: string, r: PendingRoute) {
  return mutate(owner, async () => {
    const list = await readJSON<PendingRoute[]>(KEY(owner), []);
    if (list.some((x) => x.clientRouteId === r.clientRouteId)) return;
    if (list.length >= MAX_PENDING) throw new Error("ROUTE_OUTBOX_FULL");
    await writeJSON(KEY(owner), [...list, r]);
  });
}
export const pendingRoutes = (owner: string) => readJSON<PendingRoute[]>(KEY(owner), []);

let flushing = new Map<string, Promise<void>>();
/** Sends oldest first. Failures keep the only local copy; each item is independent, so a refused route never blocks the others.
    Apply each answer to the current outbox, preserving routes queued while the request was in flight. */
export async function flushRoutes(owner: string, save: Saver, link?: Linker): Promise<{ sent: number; left: number }> {
  const inProgress = flushing.get(owner);
  if (inProgress) {
    await inProgress;
    return flushRoutes(owner, save, link);
  }
  let release!: () => void;
  flushing.set(owner, new Promise((resolve) => { release = resolve; }));
  let sent = 0;
  try {
    const list = await pendingRoutes(owner);
    for (const r of list) {
      let failed = false;
      let rejected = false;
      try {
        const { attempts: _a, rejected: _r, ...payload } = r;
        void _a; void _r;
        await save(payload);
        sent++;
      } catch (e) {
        failed = true;
        rejected = /BAD_|SPORT_UNKNOWN|TRACK_TOO_LARGE|ROUTE_LIMIT/.test(String((e as Error)?.message ?? ""));
      }
      await mutate(owner, async () => {
        const current = await pendingRoutes(owner);
        await writeJSON(KEY(owner), failed
          ? current.map((x) => x.clientRouteId === r.clientRouteId ? { ...x, attempts: x.attempts + 1, rejected } : x)
          : current.filter((x) => x.clientRouteId !== r.clientRouteId));
      });
    }
    // Links go after the routes they point at; a link whose route is still waiting simply stays.
    if (link) {
      const waiting = new Set((await pendingRoutes(owner)).map((r) => r.clientRouteId));
      for (const l of await pendingLinks(owner)) {
        if (waiting.has(l.clientRouteId)) {
          continue;
        }
        let failed = false;
        try {
          failed = await link(l.clientRouteId, l.eventId) === false;
        } catch (e) {
          void e;
          failed = true;
        }
        await mutate(owner, async () => {
          const current = await pendingLinks(owner);
          await writeJSON(LINKS(owner), failed
            ? current.map((x) => x.clientRouteId === l.clientRouteId && x.eventId === l.eventId ? { ...x, attempts: x.attempts + 1 } : x)
            : current.filter((x) => x.clientRouteId !== l.clientRouteId || x.eventId !== l.eventId));
        });
      }
    }
    return { sent, left: (await pendingRoutes(owner)).length };
  } finally {
    flushing.delete(owner);
    release();
  }
}
export const _resetForTests = () => {
  flushing = new Map();
  mutations = new Map();
};
