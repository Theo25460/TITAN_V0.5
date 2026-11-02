import { addFix, ascentM, currentSpeed, distanceM, emptyTrack, haversine, movingSeconds, summarize, toGpx, type Fix, type Track } from "../src/lib/gpsTrack";
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
    expect(Math.abs(re.ascent - (live.ascent ?? 0))).toBeLessThanOrEqual(6);
  }
  expect(toGpx(t, "Sortie <test> & co")).toContain("Sortie &lt;test&gt; &amp; co");
});

test("haversine sanity", () => {
  expect(haversine({ lat: 48.85, lon: 2.35 }, { lat: 48.86, lon: 2.35 })).toBeGreaterThan(1100);
});
