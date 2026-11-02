/* Routes recorded with the GPS wait in a durable local outbox until the server has them. The server answers the same client route id
   with the first row, so a retry, a lost answer or two phones never duplicate a route (and a route never creates XP). */
import { ownerKey, readJSON, writeJSON } from "./storage";
import { encodeTrack, type EncodedTrack, type Track } from "./gpsTrack";

export type PendingRoute = { clientRouteId: string; sport: string; startedAt: string; distanceM: number; durationS: number; ascentM: number | null; track: EncodedTrack; attempts: number };
export type Saver = (r: Omit<PendingRoute, "attempts">) => Promise<unknown>;
export type Linker = (clientRouteId: string, eventId: string) => Promise<unknown>;
export type PendingLink = { clientRouteId: string; eventId: string; attempts: number };
const LINKS = (o: string) => ownerKey("routes-links", o);
const AWAIT = (o: string) => ownerKey("routes-await-session", o);
const TWO_DAYS = 2 * 86400000;

/** Right after a GPS recording is kept, the route waits for the session saved from the same recording. */
export async function awaitSession(owner: string, clientRouteId: string, sport: string, now = Date.now()) {
  await writeJSON(AWAIT(owner), { clientRouteId, sport, at: now }).catch(() => {});
}
/** When that session is saved (same sport, within two days), the link route <-> session is queued, once. No match, no link: nothing is guessed. */
export async function linkSavedSession(owner: string, sport: string, eventId: string, now = Date.now()): Promise<boolean> {
  const w = await readJSON<{ clientRouteId: string; sport: string; at: number } | null>(AWAIT(owner), null);
  if (!w || w.sport !== sport || now - w.at > TWO_DAYS || !eventId) return false;
  const list = await readJSON<PendingLink[]>(LINKS(owner), []);
  if (!list.some((l) => l.clientRouteId === w.clientRouteId)) await writeJSON(LINKS(owner), [...list, { clientRouteId: w.clientRouteId, eventId, attempts: 0 }].slice(-MAX_PENDING));
  await writeJSON(AWAIT(owner), null).catch(() => {});
  return true;
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
  const list = await readJSON<PendingRoute[]>(KEY(owner), []);
  if (list.some((x) => x.clientRouteId === r.clientRouteId)) return;
  await writeJSON(KEY(owner), [...list, r].slice(-MAX_PENDING));
}
export const pendingRoutes = (owner: string) => readJSON<PendingRoute[]>(KEY(owner), []);

let flushing = new Set<string>();
/** Sends what is waiting, oldest first. A network or server failure keeps the route for later; a permanent refusal (bad data, ceiling) drops it after 5 tries so it never blocks the rest. */
export async function flushRoutes(owner: string, save: Saver, link?: Linker): Promise<{ sent: number; left: number }> {
  if (flushing.has(owner)) return { sent: 0, left: (await pendingRoutes(owner)).length };
  flushing.add(owner);
  let sent = 0;
  try {
    const list = await pendingRoutes(owner);
    const keep: PendingRoute[] = [];
    for (const r of list) {
      try {
        const { attempts: _a, ...payload } = r;
        void _a;
        await save(payload);
        sent++;
      } catch (e) {
        const permanent = /BAD_|SPORT_UNKNOWN|TRACK_TOO_LARGE|ROUTE_LIMIT/.test(String((e as Error)?.message ?? ""));
        const next = { ...r, attempts: r.attempts + 1 };
        if (!(permanent && next.attempts >= 5)) keep.push(next);
      }
    }
    await writeJSON(KEY(owner), keep);
    // Links go after the routes they point at; a link whose route is still waiting simply stays.
    if (link) {
      const waiting = new Set(keep.map((r) => r.clientRouteId));
      const keepLinks: PendingLink[] = [];
      for (const l of await pendingLinks(owner)) {
        if (waiting.has(l.clientRouteId)) {
          keepLinks.push(l);
          continue;
        }
        try {
          await link(l.clientRouteId, l.eventId);
        } catch (e) {
          const permanent = /BAD_EVENT_ID|ROUTE_ALREADY_LINKED|SESSION_ALREADY_HAS_ROUTE/.test(String((e as Error)?.message ?? ""));
          if (!permanent && l.attempts < 20) keepLinks.push({ ...l, attempts: l.attempts + 1 });
        }
      }
      await writeJSON(LINKS(owner), keepLinks);
    }
    return { sent, left: keep.length };
  } finally {
    flushing.delete(owner);
  }
}
export const _resetForTests = () => {
  flushing = new Set();
};
