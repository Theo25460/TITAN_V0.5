/* Pure GPS track arithmetic for the native recorder: fix filtering, distance, active time, speed, reliable ascent, GPX.
   No Android API here, so every rule is testable in Node. Positions never leave the phone from this module. */
export type Fix = { lat: number; lon: number; alt: number | null; altAcc: number | null; acc: number | null; t: number };
export type Seg = Fix[];
export type Track = { segs: Seg[]; rejected: number };

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export const haversine = (a: Pick<Fix, "lat" | "lon">, b: Pick<Fix, "lat" | "lon">) => {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Limits: a fix less precise than 30 m, or implying more than 28 m/s (100 km/h) between two fixes, is a glitch. */
export const MAX_ACCURACY_M = 30;
export const MAX_SPEED_MS = 28;
export const MOVING_MS = 0.5; // below 1.8 km/h the athlete is considered stopped
export const MAX_POINTS = 20000;

export const emptyTrack = (): Track => ({ segs: [], rejected: 0 });

const valid = (f: Fix) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180 && Number.isFinite(f.t) && !(f.lat === 0 && f.lon === 0);

/** Adds a fix to the open segment (a new one when `newSegment`), or counts it as rejected. Pure: returns a new track. */
export function addFix(track: Track, fix: Fix, newSegment = false): Track {
  if (!valid(fix) || (fix.acc !== null && fix.acc > MAX_ACCURACY_M)) return { ...track, rejected: track.rejected + 1 };
  const segs = track.segs.map((s) => s);
  let last = segs[segs.length - 1];
  if (!last || newSegment) {
    segs.push([fix]);
    return { segs, rejected: track.rejected };
  }
  const prev = last[last.length - 1];
  const dt = (fix.t - prev.t) / 1000;
  if (dt <= 0) return { ...track, rejected: track.rejected + 1 };
  const d = haversine(prev, fix);
  if (d / dt > MAX_SPEED_MS) return { ...track, rejected: track.rejected + 1 };
  if (segs.reduce((n, s) => n + s.length, 0) >= MAX_POINTS) return { ...track, rejected: track.rejected + 1 };
  last = [...last, fix];
  segs[segs.length - 1] = last;
  return { segs, rejected: track.rejected };
}

/** Distance in metres. Never bridges a pause: each segment is measured on its own. Stops within GPS jitter add nothing. */
export function distanceM(track: Track): number {
  let total = 0;
  for (const s of track.segs)
    for (let i = 1; i < s.length; i++) {
      const dt = (s[i].t - s[i - 1].t) / 1000;
      const d = haversine(s[i - 1], s[i]);
      if (dt > 0 && d / dt >= MOVING_MS) total += d;
    }
  return total;
}

/** Seconds spent actually moving (fixes at least MOVING_MS apart, no gap over 30 s counted: a gap means no signal). */
export function movingSeconds(track: Track): number {
  let sec = 0;
  for (const s of track.segs)
    for (let i = 1; i < s.length; i++) {
      const dt = (s[i].t - s[i - 1].t) / 1000;
      if (dt > 0 && dt <= 30 && haversine(s[i - 1], s[i]) / dt >= MOVING_MS) sec += dt;
    }
  return sec;
}

/** Current speed in m/s over the last ~10 s of the open segment (null when stopped or too little data). */
export function currentSpeed(track: Track, now: number): number | null {
  const s = track.segs[track.segs.length - 1];
  if (!s || s.length < 2) return null;
  const last = s[s.length - 1];
  if (now - last.t > 15000) return null;
  let i = s.length - 2;
  while (i > 0 && last.t - s[i].t < 10000) i--;
  const dt = (last.t - s[i].t) / 1000;
  if (dt <= 0) return null;
  const v = haversine(s[i], last) / dt;
  return v >= MOVING_MS ? v : 0;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ALT_ACC_MAX = 15;

/** Positive ascent in metres, or null when altitude is not reliable enough: fewer than 80 % of points carry an altitude
    with a vertical accuracy of 15 m or better. 5-point median smoothing, then a 3 m hysteresis. Never a made-up figure. */
export function ascentM(track: Track): number | null {
  const all = track.segs.flat();
  if (all.length < 10) return null;
  const good = all.filter((f) => f.alt !== null && Number.isFinite(f.alt) && (f.altAcc === null || f.altAcc <= ALT_ACC_MAX));
  if (good.length / all.length < 0.8) return null;
  let ascent = 0;
  for (const s of track.segs) {
    const alts = s.map((f) => (f.alt !== null && (f.altAcc === null || f.altAcc <= ALT_ACC_MAX) ? f.alt : null));
    const sm = alts.map((_, i) => {
      const w = alts.slice(Math.max(0, i - 2), i + 3).filter((x): x is number => x !== null);
      return w.length ? median(w) : null;
    });
    let ref: number | null = null;
    for (const a of sm) {
      if (a === null) continue;
      if (ref === null) ref = a;
      else if (a - ref >= 3) {
        ascent += a - ref;
        ref = a;
      } else if (ref - a >= 3) ref = a;
    }
  }
  return Math.round(ascent);
}

export type Summary = { distanceKm: number; activeSeconds: number; movingSeconds: number; avgSpeedKmh: number | null; ascent: number | null; points: number; rejected: number; start: number | null; end: number | null };

export function summarize(track: Track, activeMs: number): Summary {
  const flat = track.segs.flat();
  const dist = distanceM(track);
  const active = Math.max(0, Math.round(activeMs / 1000));
  return {
    distanceKm: Math.round(dist / 10) / 100,
    activeSeconds: active,
    movingSeconds: Math.round(movingSeconds(track)),
    avgSpeedKmh: active >= 30 && dist >= 50 ? Math.round((dist / active) * 3.6 * 10) / 10 : null,
    ascent: ascentM(track),
    points: flat.length,
    rejected: track.rejected,
    start: flat.length ? flat[0].t : null,
    end: flat.length ? flat[flat.length - 1].t : null,
  };
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);

/** A standard GPX 1.1 file, one trkseg per recording stretch (so a pause is never drawn as a straight line). */
export function toGpx(track: Track, name: string, opts: { time?: boolean; ele?: boolean } = {}): string {
  const withAlt = opts.ele !== false && ascentM(track) !== null;
  const withTime = opts.time !== false;
  const segs = track.segs
    .filter((s) => s.length)
    .map(
      (s) =>
        `<trkseg>${s
          .map((f) => `<trkpt lat="${f.lat.toFixed(6)}" lon="${f.lon.toFixed(6)}">${withAlt && f.alt !== null ? `<ele>${f.alt.toFixed(1)}</ele>` : ""}${withTime ? `<time>${new Date(f.t).toISOString()}</time>` : ""}</trkpt>`)
          .join("")}</trkseg>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TITAN" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${xml(name)}</name>${segs}</trk></gpx>\n`;
}

/** Sports for which a live GPS recording makes sense (distance-based, outdoors). */
export const GPS_SPORTS = new Set(["running", "trail", "walking", "hiking", "cycling", "cycling_road", "mtb", "gravel", "cyclocross"]);

/** The sport the GPS shortcut proposes: the first GPS sport among the favourites, then the most recent sessions, then running. */
export function gpsShortcutSport(favorites: string[], recent: string[]): string {
  return favorites.find((s) => GPS_SPORTS.has(s)) ?? recent.find((s) => GPS_SPORTS.has(s)) ?? "running";
}

/* ---- Route library: compact, privacy-neutral encoding (the server stores it as is; nothing here leaves the phone on its own) ---- */
export type EncodedTrack = { v: 1; t0: number; segs: (number | null)[][][] };
export const MAX_ROUTE_POINTS = 3000;

/** lat/lon in 1e-5 degrees (about 1 m), time in seconds since the first fix, altitude in decimetres or null when not reliable.
    Longer traces are thinned evenly (first and last fix of every segment always kept) to stay under the server ceiling. */
export function encodeTrack(track: Track, maxPoints = MAX_ROUTE_POINTS): EncodedTrack | null {
  const segs = track.segs.filter((s) => s.length > 0);
  const total = segs.reduce((n, s) => n + s.length, 0);
  if (total < 2) return null;
  const t0 = segs[0]![0]!.t;
  const reliable = ascentM(track) !== null;
  const step = total > maxPoints ? total / maxPoints : 1;
  const out: EncodedTrack = { v: 1, t0, segs: [] };
  let kept = 0;
  for (const s of segs) {
    const pts: (number | null)[][] = [];
    for (let i = 0; i < s.length; i++) {
      const last = i === s.length - 1;
      if (!last && i !== 0 && step > 1 && Math.floor(i / step) === Math.floor((i - 1) / step)) continue;
      const f = s[i]!;
      pts.push([Math.round(f.lat * 1e5), Math.round(f.lon * 1e5), Math.max(0, Math.round((f.t - t0) / 1000)), reliable && f.alt !== null ? Math.round(f.alt * 10) : null]);
      kept++;
    }
    out.segs.push(pts);
  }
  return kept >= 2 ? thinTo(out, maxPoints) : null;
}
function thinTo(doc: EncodedTrack, max: number): EncodedTrack | null {
  let n = doc.segs.reduce((a, s) => a + s.length, 0);
  while (n > max) {
    // drop every second interior point of the longest segment until the ceiling holds
    const seg = doc.segs.reduce((a, b) => (b.length > a.length ? b : a));
    for (let i = seg.length - 2; i >= 1; i -= 2) seg.splice(i, 1);
    n = doc.segs.reduce((a, s) => a + s.length, 0);
  }
  return n >= 2 ? doc : null;
}

export function decodeTrack(doc: EncodedTrack): Track {
  return {
    rejected: 0,
    segs: doc.segs.map((s) => s.map((p) => ({ lat: (p[0] as number) / 1e5, lon: (p[1] as number) / 1e5, t: doc.t0 + (p[2] as number) * 1000, alt: p[3] === null ? null : (p[3] as number) / 10, altAcc: p[3] === null ? null : 5, acc: 5 }))),
  };
}

/** Projection for a map without tiles (no request, so a route never reveals where you are to a map server): equirectangular, fitted in a box. */
export function projectTrack(track: Track, width: number, height: number, pad = 12): { segs: { x: number; y: number }[][]; start: { x: number; y: number } | null; end: { x: number; y: number } | null } {
  const pts = track.segs.flat();
  if (pts.length < 2) return { segs: [], start: null, end: null };
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = Math.max((maxLon - minLon) * k, 1e-6), h = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const ox = (width - w * scale) / 2, oy = (height - h * scale) / 2;
  const at = (p: Fix) => ({ x: ox + (p.lon - minLon) * k * scale, y: height - (oy + (p.lat - minLat) * scale) });
  const segs = track.segs.filter((s) => s.length).map((s) => s.map(at));
  const first = track.segs.find((s) => s.length)![0]!;
  const lastSeg = [...track.segs].reverse().find((s) => s.length)!;
  return { segs, start: at(first), end: at(lastSeg[lastSeg.length - 1]!) };
}

/** For voluntary sharing: removes the first and last `meters` of the trace (measured along the path) so neither the start nor the end, often home, is
    revealed. Returns null when the route is too short to hide both ends and still show something (never a partial protection). */
export const SHARE_TRIM_M = 300;
export function trimEnds(track: Track, meters = SHARE_TRIM_M): Track | null {
  const pts = track.segs.flat();
  if (pts.length < 4) return null;
  const cum: number[] = [0];
  const flatIdx: Fix[] = [];
  let seg = -1;
  const segOf: number[] = [];
  track.segs.forEach((s, si) => s.forEach((f, i) => { flatIdx.push(f); segOf.push(si); void i; }));
  for (let i = 1; i < flatIdx.length; i++) cum[i] = cum[i - 1]! + (segOf[i] === segOf[i - 1] ? haversine(flatIdx[i - 1]!, flatIdx[i]!) : 0);
  void seg;
  const total = cum[cum.length - 1]!;
  if (total < meters * 2 + 150) return null;
  const keepIdx = new Set<number>();
  for (let i = 0; i < flatIdx.length; i++) if (cum[i]! >= meters && cum[i]! <= total - meters) keepIdx.add(i);
  if (keepIdx.size < 2) return null;
  const out: Track = { rejected: 0, segs: [] };
  let k = 0;
  for (const s of track.segs) {
    const kept: Fix[] = [];
    for (const f of s) {
      if (keepIdx.has(k)) kept.push(f);
      k++;
    }
    if (kept.length) out.segs.push(kept);
  }
  return out;
}
