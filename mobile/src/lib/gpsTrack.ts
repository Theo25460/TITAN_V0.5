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
export function toGpx(track: Track, name: string): string {
  const withAlt = ascentM(track) !== null;
  const segs = track.segs
    .filter((s) => s.length)
    .map(
      (s) =>
        `<trkseg>${s
          .map((f) => `<trkpt lat="${f.lat.toFixed(6)}" lon="${f.lon.toFixed(6)}">${withAlt && f.alt !== null ? `<ele>${f.alt.toFixed(1)}</ele>` : ""}<time>${new Date(f.t).toISOString()}</time></trkpt>`)
          .join("")}</trkseg>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TITAN" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${xml(name)}</name>${segs}</trk></gpx>\n`;
}

/** Sports for which a live GPS recording makes sense (distance-based, outdoors). */
export const GPS_SPORTS = new Set(["running", "trail", "walking", "hiking", "cycling", "cycling_road", "mtb", "gravel", "cyclocross"]);
