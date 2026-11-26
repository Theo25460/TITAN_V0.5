/* « Partager » (before V2): the route of a session as a shape for its story card. The track comes from the phone's route outbox
   (a route just recorded may not be on the server yet) or from the account's own route library; its first and last 300 m are
   removed (no card when the route is too short to hide both ends, as for a shared GPX), and only planar offsets in metres from the
   south-west corner leave this module: no coordinate reaches the card, nothing is drawn under it, no map server is contacted. */
import * as api from "../data/api";
import { decodeTrack, trimEnds, type Track } from "./gpsTrack";
import { pendingLinks, pendingRoutes } from "./routeSync";

/** A trimmed track → planar offsets in metres (x east, y north) from the south-west corner of its bounding box. */
export function toPlanar(track: Track): { segs: number[][][] } | null {
  const pts = track.segs.flat();
  if (pts.length < 2) return null;
  const lat0 = Math.min(...pts.map((p) => p.lat));
  const lon0 = Math.min(...pts.map((p) => p.lon));
  const k = Math.cos((((lat0 + Math.max(...pts.map((p) => p.lat))) / 2) * Math.PI) / 180);
  return { segs: track.segs.filter((s) => s.length).map((s) => s.map((p) => [Math.round((p.lon - lon0) * k * 111320), Math.round((p.lat - lat0) * 110574)])) };
}

export async function storyRoute(owner: string, eventId: string | null | undefined): Promise<{ segs: number[][][] } | null> {
  if (!owner || !eventId) return null;
  let track: Track | null = null;
  const link = (await pendingLinks(owner).catch(() => [])).find((l) => l.eventId === eventId);
  if (link) {
    const pending = (await pendingRoutes(owner).catch(() => [])).find((r) => r.clientRouteId === link.clientRouteId);
    if (pending) track = decodeTrack(pending.track);
  }
  if (!track) {
    const meta = await api.routeForEvent(owner, eventId).catch(() => null);
    if (meta?.id) {
      const full = await api.routeGet(owner, meta.id).catch(() => null);
      if (full?.track) track = decodeTrack(full.track);
    }
  }
  if (!track) return null;
  const trimmed = trimEnds(track);
  return trimmed ? toPlanar(trimmed) : null;
}
