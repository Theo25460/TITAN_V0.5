import { trimEnds, SHARE_TRIM_M, MAX_POINTS, addFix, ascentM, compactFix, currentSpeed, decodeTrack, distanceM, emptyTrack, encodeTrack, haversine, movingSeconds, projectTrack, summarize, toGpx, type Fix, type Track } from "../src/lib/gpsTrack";
import { Gpx } from "../src/core";

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
// ~5 m/s heading north from Paris: 1e-5 deg of latitude is about 1.11 m.
const fix = (i: number, over: Partial<Fix> = {}): Fix => ({ lat: 48.85 + i * 0.000045, lon: 2.35, alt: 100, altAcc: 5, acc: 5, t: T0 + i * 1000, ...over });
const build = (n: number, over: (i: number) => Partial<Fix> = () => ({})) => {
  let t: Track = emptyTrack();
  for (let i = 0; i < n; i++) t = addFix(t, fix(i, over(i)));
  return t;
};

test("distance and active time of a steady effort", () => {
  const t = build(61);
  const s = summarize(t, 60_000);
  expect(s.distanceKm).toBeGreaterThan(0.29);
  expect(s.distanceKm).toBeLessThan(0.31);
  expect(s.movingSeconds).toBe(60);
  expect(s.avgSpeedKmh).toBeGreaterThan(17);
  expect(currentSpeed(t, T0 + 60_000)).toBeGreaterThan(4);
  expect(currentSpeed(t, T0 + 120_000)).toBeNull();
});

test("imprecise, impossible and invalid fixes are rejected, not counted", () => {
  let t = build(10);
  const before = distanceM(t);
  t = addFix(t, fix(10, { acc: 80 }));
  t = addFix(t, fix(11, { lat: 49.5 })); // 70 km in one second
  t = addFix(t, fix(12, { lat: NaN }));
  t = addFix(t, fix(9)); // out of order
  t = addFix(t, { ...fix(13), lat: 0, lon: 0 });
  expect(t.rejected).toBe(5);
  expect(distanceM(t)).toBeCloseTo(before, 5);
});

test("a pause is never bridged: the jump between segments adds no distance", () => {
  let t = build(10);
  t = addFix(t, { ...fix(10), lat: 48.9, t: T0 + 600_000 }, true); // resumed 5 km away, 10 minutes later
  t = addFix(t, { ...fix(11), lat: 48.9 + 0.000045, t: T0 + 601_000 });
  expect(t.segs).toHaveLength(2);
  expect(distanceM(t)).toBeLessThan(120);
  expect(toGpx(t, "x").match(/<trkseg>/g)).toHaveLength(2);
});

test("standing still inside GPS jitter adds no distance or moving time", () => {
  const t = build(40, () => ({ lat: 48.85, lon: 2.35 + 0.0000005 }));
  expect(distanceM(t)).toBeLessThan(1);
  expect(movingSeconds(t)).toBe(0);
});

test("no signal gap: time without fixes is not counted as moving", () => {
  let t = build(5);
  t = addFix(t, fix(65)); // 60 s later, ~300 m: far under the speed limit
  expect(movingSeconds(t)).toBe(4);
});

test("ascent is only reported from reliable altitude and ignores noise", () => {
  const climb = build(60, (i) => ({ alt: 100 + i * 0.5 }));
  expect(ascentM(climb)).toBeGreaterThanOrEqual(25);
  expect(ascentM(build(60, (i) => ({ alt: 100 + (i % 2 ? 1 : -1) })))).toBe(0); // noise below the 3 m hysteresis
  expect(ascentM(build(60, () => ({ alt: null, altAcc: null })))).toBeNull(); // no altitude: no figure
  expect(ascentM(build(60, (i) => ({ alt: 100 + i, altAcc: 40 })))).toBeNull(); // altitude too imprecise
  expect(ascentM(build(5, (i) => ({ alt: 100 + i * 10 })))).toBeNull(); // too few points
  expect(toGpx(build(60, () => ({ alt: null, altAcc: null })), "x")).not.toContain("<ele>");
});

test("the exported GPX re-imports with the website reader and matches the live figures", () => {
  const t = build(120, (i) => ({ alt: 100 + i * 0.4 }));
  const live = summarize(t, 119_000);
  const re = Gpx.analyse(toGpx(t, "Sortie <test> & co"));
  expect(re.ok).toBe(true);
  if (re.ok) {
    expect(re.points).toBe(120);
    expect(re.distanceKm).toBeCloseTo(live.distanceKm, 1);
    expect(re.start).toBe(new Date(T0).toISOString());
    expect(re.ascent).not.toBeNull();
    if (re.ascent !== null) expect(Math.abs(re.ascent - (live.ascent ?? 0))).toBeLessThanOrEqual(6);
  }
  expect(toGpx(t, "Sortie <test> & co")).toContain("Sortie &lt;test&gt; &amp; co");
});

test("haversine sanity", () => {
  expect(haversine({ lat: 48.85, lon: 2.35 }, { lat: 48.86, lon: 2.35 })).toBeGreaterThan(1100);
});

test("route encoding: compact integers, pauses stay separate segments, round-trips within a metre, altitude only when reliable", () => {
  let t = build(40, (i) => ({ alt: 100 + i * 0.5 }));
  t = addFix(t, { ...fix(100), t: T0 + 700_000 }, true);
  t = addFix(t, { ...fix(101), t: T0 + 701_000 });
  const doc = encodeTrack(t)!;
  expect(doc.v).toBe(1);
  expect(doc.segs).toHaveLength(2);
  expect(doc.segs[0]).toHaveLength(40);
  expect(doc.segs[0]![0]).toEqual([Math.round(48.85 * 1e5), Math.round(2.35 * 1e5), 0, 1000]);
  const back = decodeTrack(doc);
  expect(back.segs[0]![10]!.lat).toBeCloseTo(t.segs[0]![10]!.lat, 4);
  expect(haversine(back.segs[0]![10]!, t.segs[0]![10]!)).toBeLessThan(1.5);
  expect(back.segs[0]![10]!.t).toBe(t.segs[0]![10]!.t);
  const noAlt = encodeTrack(build(30, () => ({ alt: null, altAcc: null })))!;
  expect(noAlt.segs[0]!.every((p) => p[3] === null)).toBe(true);
  expect(encodeTrack(build(1))).toBeNull();
});

test("a very long trace is thinned under the ceiling, keeping its first and last point", () => {
  const long = build(5000);
  const doc = encodeTrack(long, 1000)!;
  const n = doc.segs.flat().length;
  expect(n).toBeLessThanOrEqual(1000);
  expect(doc.segs[0]![0]![2]).toBe(0);
  expect(doc.segs[0]!.at(-1)![2]).toBe(4999);
  expect(encodeTrack(long)!.segs.flat().length).toBeLessThanOrEqual(3000);
});

test("map projection fits the box without tiles, keeps north up and the aspect, marks start and end", () => {
  const p = projectTrack(build(60), 300, 200);
  const pts = p.segs.flat();
  expect(pts.every((q) => q.x >= 0 && q.x <= 300 && q.y >= 0 && q.y <= 200)).toBe(true);
  expect(p.start!.y).toBeGreaterThan(p.end!.y); // heading north: the end is higher on screen
  expect(projectTrack(emptyTrack(), 300, 200)).toEqual({ segs: [], start: null, end: null });
});

test("sharing: the first and last 300 m are removed, a trace too short to hide both ends is refused, shared files carry no time or altitude", () => {
  const long = build(400, (i) => ({ alt: 100 + i * 0.3 })); // about 2 km at 5 m/s
  const t = trimEnds(long)!;
  const pts = t.segs.flat();
  const all = long.segs.flat();
  expect(pts.length).toBeLessThan(all.length);
  expect(haversine(all[0]!, pts[0]!)).toBeGreaterThanOrEqual(SHARE_TRIM_M - 10);
  expect(haversine(all.at(-1)!, pts.at(-1)!)).toBeGreaterThanOrEqual(SHARE_TRIM_M - 10);
  expect(pts.every((p) => haversine(p, all[0]!) >= SHARE_TRIM_M - 10 && haversine(p, all.at(-1)!) >= SHARE_TRIM_M - 10)).toBe(true);
  expect(trimEnds(build(60))).toBeNull(); // about 300 m in all
  expect(trimEnds(build(3))).toBeNull();
  const gpx = toGpx(t, "Partage", { time: false, ele: false });
  expect(gpx).not.toContain("<time>");
  expect(gpx).not.toContain("<ele>");
  expect(gpx).toContain("<trkpt");
});

// ---- V1.3.1: a very long recording must stay readable by the phone's store and must keep recording ----
// Android reads one stored value through a 2 MB window; the recording is one value. The figures below are what the location
// sensor really hands over: doubles widened from floats.
const sensor = (i: number): Fix => ({ lat: 48.8566123456789 + i * 0.0000271234567, lon: -122.3522198765432 + Math.sin(i / 40) * 0.0003, alt: Math.fround(1235.2 + i * 0.013), altAcc: Math.fround(1.3333334), acc: Math.fround(4.288 + (i % 7) * 0.31), t: 1794650000123 + i * 2003 });

test("a stored fix is rounded to what a phone GPS can mean, and a full recording stays well under the 2 MB a stored value can be read back at", () => {
  expect(compactFix(sensor(5))).toEqual({ lat: 48.856748, lon: -122.352182, alt: 1235.3, altAcc: 1.3, acc: 5.8, t: 1794650010138 });
  expect(compactFix({ lat: 1.23456789, lon: 2, alt: null, altAcc: null, acc: null, t: 10.4 })).toEqual({ lat: 1.234568, lon: 2, alt: null, altAcc: null, acc: null, t: 10 });
  const raw = Array.from({ length: MAX_POINTS }, (_, i) => sensor(i));
  const stored = JSON.stringify({ v: 1, owner: "00000000-0000-4000-8000-0000000000b1", sport: "cycling", status: "recording", track: { segs: [raw.map(compactFix)], rejected: 0, every: 4000 } });
  expect(stored.length).toBeLessThan(1_300_000);
  // What the same number of fixes weighed before: the reason an 8 h outing could no longer be read back.
  expect(JSON.stringify(raw).length).toBeGreaterThan(1_600_000);
});

test("at the ceiling the trace is thinned and goes on recording: nothing is refused, the ends stay, the distance holds", () => {
  const winding = (i: number): Fix => compactFix({ lat: 48.85 + i * 0.00009, lon: 2.35 + Math.sin(i / 25) * 0.0004, alt: 100, altAcc: 5, acc: 5, t: T0 + i * 2000 });
  let t: Track = emptyTrack();
  let reference = 0;
  const total = MAX_POINTS + 4000;
  for (let i = 0; i < total; i++) {
    if (i > 0) reference += haversine(winding(i - 1), winding(i));
    t = addFix(t, winding(i), i === 9000); // one pause on the way
  }
  const kept = t.segs.reduce((n, s) => n + s.length, 0);
  expect(t.rejected).toBe(0);
  expect(kept).toBeLessThanOrEqual(MAX_POINTS);
  expect(kept).toBeGreaterThan(MAX_POINTS / 2);
  expect(t.every).toBe(4000);
  expect(t.segs).toHaveLength(2);
  expect(t.segs[0]![0]).toEqual(winding(0));
  expect(t.segs[0]!.at(-1)).toEqual(winding(8999));
  expect(t.segs[1]![0]).toEqual(winding(9000));
  // After thinning, a fix that comes sooner than the new spacing is not kept; the trace still ends on a recent fix.
  expect(total - 1 - Math.round((t.segs[1]!.at(-1)!.t - T0) / 2000)).toBeLessThanOrEqual(1);
  const gaps = t.segs[1]!.slice(-50).map((f, i, a) => (i ? f.t - a[i - 1]!.t : 4000));
  expect(Math.max(...gaps)).toBeLessThanOrEqual(4000);
  // The pause (one missing edge) is the only distance not measured; thinning itself costs well under 1 %.
  const pauseEdge = haversine(winding(8999), winding(9000));
  expect(distanceM(t)).toBeGreaterThan((reference - pauseEdge) * 0.99);
  expect(distanceM(t)).toBeLessThanOrEqual(reference);
  expect(movingSeconds(t)).toBeGreaterThan((total - 2) * 2 * 0.99);
});

test("below the ceiling nothing changes: every valid fix is kept as it came", () => {
  const t = build(500);
  expect(t.every).toBeUndefined();
  expect(t.segs[0]).toHaveLength(500);
});
