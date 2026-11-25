/* V1.7.7 — the GPS engine on synthetic outings whose figures are known in advance (computed here from the construction, not by the engine). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../js/core/gps-engine.js');

const T0 = Date.UTC(2026, 10, 25, 8, 0, 0);
const LAT = 48.58, LON = 7.70;
const M_PER_DEG_LAT = (Math.PI / 180) * 6371008.8;
/** A walker along a meridian: `metres` north of the origin, so distances are exact by construction. */
const at = (metres, t, extra = {}) => ({ lat: LAT + metres / M_PER_DEG_LAT, lon: LON, alt: null, altAcc: null, acc: 5, t, ...extra });
/** Feeds positions through the same filter the recorders use. */
function record(sport, fixes, opts = {}) {
  let track = { segs: [], rejected: 0 };
  let newSegment = true;
  for (const f of fixes) {
    if (f === 'cut') { newSegment = true; continue; }
    const before = track;
    track = E.ingest(track, f, { sport, newSegment, ...opts });
    if (track !== before && track.rejected === before.rejected) newSegment = false;
  }
  return track;
}
/** Constant speed from `from` metres, one position every `step` seconds, for `seconds`. Returns [fixes, end metres, end time]. */
function cruise(from, t, speed, seconds, step = 2, extra = {}) {
  const out = [];
  for (let s = step; s <= seconds; s += step) out.push(at(from + speed * s, t + s * 1000, extra));
  return [out, from + speed * seconds, t + seconds * 1000];
}
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
const sumIsElapsed = (a) => assert.equal(a.ms.moving + a.ms.stopped + a.ms.paused + a.ms.interrupted + a.ms.missing, a.ms.elapsed, 'the pieces add up to the elapsed time, to the millisecond');

test('acceptance example: 3 h elapsed, 2 h 35 moving, 25 min stopped, 52 km → 20.1 km/h moving and 17.3 km/h overall', () => {
  // 52 km in 2 h 35 of movement is 5.5914 m/s. One 20 min stop and one 5 min stop, both with the receiver still delivering positions.
  const v = 52000 / (155 * 60);
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, v, 60 * 60); fixes.push(...a);
  for (let s = 2; s <= 20 * 60; s += 2) fixes.push(at(m + (s % 4 ? 0.8 : -0.8), t + s * 1000));
  t += 20 * 60 * 1000;
  [a, m, t] = cruise(m, t, v, 50 * 60); fixes.push(...a);
  for (let s = 2; s <= 5 * 60; s += 2) fixes.push(at(m, t + s * 1000));
  t += 5 * 60 * 1000;
  [a, m, t] = cruise(m, t, v, 45 * 60); fixes.push(...a);
  const track = record('gravel', fixes);
  const r = E.analyse({ sport: 'gravel', startedAt: T0, endedAt: t, segs: track.segs, stretches: [{ s: T0, e: t, why: 'finish' }] });
  assert.equal(r.elapsedS, 3 * 3600);
  near(r.movingS, 155 * 60, 30, 'moving time');
  near(r.stoppedS, 25 * 60, 30, 'stopped time');
  assert.equal(r.pausedS, 0); assert.equal(r.missingS, 0);
  near(r.distanceM, 52000, 60, 'distance');
  near(r.avgMovingKmh, 20.1, 0.1, 'moving average'); near(r.avgOverallKmh, 17.3, 0.1, 'overall average');
  assert.equal(r.stops.length, 2);
  assert.equal(r.effortS, r.movingS, 'the effort is the moving time');
  sumIsElapsed(r);
  // a 20-minute stop is two stored positions, not six hundred
  assert.ok(track.segs.flat().length < fixes.length - 700);
});

test('a 20-minute stop during which the phone delivers nothing (no movement, no position) is a stop, not a hole', () => {
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 5, 600); fixes.push(...a);
  t += 20 * 60 * 1000; fixes.push(at(m + 1, t)); // first position after the stop, one metre away
  [a, m, t] = cruise(m + 1, t, 5, 600); fixes.push(...a);
  const r = E.analyse({ sport: 'cycling', startedAt: T0, endedAt: t, segs: record('cycling', fixes).segs, stretches: [{ s: T0, e: t, why: 'finish' }] });
  assert.equal(r.stoppedS, 20 * 60); assert.equal(r.movingS, 20 * 60); assert.equal(r.missingS, 0);
  near(r.distanceM, 6000, 5, 'distance'); near(r.avgMovingKmh, 18, 0.05, 'moving average');
  sumIsElapsed(r);
});

test('manual pauses are never effort and never bridged; several pauses do not count twice', () => {
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 3, 300); fixes.push(...a);
  const p1 = t; t += 7 * 60 * 1000; const r1 = t; // paused 7 min, and the athlete walked 400 m meanwhile (not recorded)
  fixes.push('cut'); m += 400; fixes.push(at(m, t + 2000));
  [a, m, t] = cruise(m, t + 2000, 3, 298); fixes.push(...a);
  const p2 = t; t += 3 * 60 * 1000; const r2 = t;
  fixes.push('cut'); fixes.push(at(m, t + 2000));
  [a, m, t] = cruise(m, t + 2000, 3, 298); fixes.push(...a);
  const stretches = [{ s: T0, e: p1, why: 'pause' }, { s: r1, e: p2, why: 'pause' }, { s: r2, e: t, why: 'finish' }];
  const track = record('running', fixes);
  const r = E.analyse({ sport: 'running', startedAt: T0, endedAt: t, segs: track.segs, stretches });
  assert.equal(track.segs.length, 3, 'one stretch of positions per recording period');
  assert.equal(r.pausedS, 10 * 60); assert.equal(r.elapsedS, 25 * 60);
  near(r.movingS, 15 * 60, 5, 'moving'); near(r.distanceM, 3 * 896, 10, 'the 400 m walked during the pause are not in the distance');
  assert.equal(r.recordingS, 15 * 60);
  sumIsElapsed(r);
});

test('slow walking (2 km/h) and a mountain-bike climb at 3 km/h are movement, even with a poor signal', () => {
  for (const [sport, speed, acc] of [['walking', 2 / 3.6, 5], ['hiking', 2 / 3.6, 22], ['mountain_bike', 3 / 3.6, 25], ['snowshoeing', 1.8 / 3.6, 12]]) {
    const [a, m, t] = cruise(0, T0, speed, 1800, 2, { acc });
    const r = E.analyse({ sport, startedAt: T0, endedAt: t, segs: record(sport, [at(0, T0, { acc }), ...a]).segs, stretches: [{ s: T0, e: t, why: 'finish' }] });
    assert.equal(r.stoppedS, 0, `${sport}: no stop invented`); assert.equal(r.movingS, 1800);
    near(r.distanceM, m, 2, `${sport} distance`);
  }
});

test('a short red light (25 s) is a stop for a cyclist; a 6-second halt stays movement (hysteresis)', () => {
  const run = (halt) => {
    const fixes = [at(0, T0)];
    let [a, m, t] = cruise(0, T0, 7, 120); fixes.push(...a);
    for (let s = 2; s <= halt; s += 2) fixes.push(at(m + 0.5, t + s * 1000));
    t += halt * 1000;
    [a, m, t] = cruise(m, t, 7, 120); fixes.push(...a);
    return E.analyse({ sport: 'cycling_road', startedAt: T0, endedAt: t, segs: record('cycling_road', fixes).segs, stretches: [{ s: T0, e: t, why: 'finish' }] });
  };
  const light = run(26), halt = run(6);
  near(light.stoppedS, 26, 3, 'red light'); assert.equal(light.stops.length, 1);
  assert.equal(halt.stoppedS, 0); assert.equal(halt.movingS, 246);
  near(light.distanceM, 1680, 3, 'distance with the light'); near(halt.distanceM, 1680, 3, 'distance with the halt');
});

test('GPS drift at a standstill adds no distance and no moving time worth mentioning', () => {
  // a seeded random walk of the reported position around a bench, ±7 m, during 20 minutes, with a mediocre accuracy
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 1.4, 300); fixes.push(...a);
  let dx = 0, dy = 0;
  for (let s = 2; s <= 1200; s += 2) {
    dx = Math.max(-7, Math.min(7, dx + rnd() * 2.2)); dy = Math.max(-7, Math.min(7, dy + rnd() * 2.2));
    fixes.push({ ...at(m + dy, t + s * 1000, { acc: 12 }), lon: LON + dx / (M_PER_DEG_LAT * Math.cos(LAT * Math.PI / 180)) });
  }
  t += 1200 * 1000;
  [a, m, t] = cruise(m, t, 1.4, 300); fixes.push(...a);
  const r = E.analyse({ sport: 'hiking', startedAt: T0, endedAt: t, segs: record('hiking', fixes).segs, stretches: [{ s: T0, e: t, why: 'finish' }] });
  near(r.distanceM, 840, 40, 'distance without the drift');
  assert.ok(r.stoppedS >= 1100, `stopped ${r.stoppedS} s of 1200`);
  near(r.movingS, 600, 100, 'moving');
  sumIsElapsed(r);
});

test('a GPS jump is refused, a real relocation resumes in a new stretch, and neither invents a line', () => {
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 3, 60); fixes.push(...a);
  fixes.push(at(m + 5000, t + 2000)); // one position 5 km away, 2 s later
  [a, m, t] = cruise(m, t + 2000, 3, 60); fixes.push(...a);
  const track = record('running', fixes);
  assert.equal(track.why.speed, 1); assert.equal(track.segs.length, 1);
  near(E.analyse({ sport: 'running', startedAt: T0, endedAt: t, segs: track.segs }).distanceM, 360, 8, 'distance without the jump');

  // the first position of the recording is a stale one, 3 km away: the trace must not stay stuck on it
  const stale = [at(3000, T0), ...cruise(0, T0, 3, 60)[0]];
  const recovered = record('running', stale);
  assert.equal(recovered.segs.length, 1, 'the lone wrong position is dropped');
  assert.ok(recovered.segs[0].length >= 28);
  near(E.analyse({ sport: 'running', startedAt: T0, endedAt: T0 + 60000, segs: recovered.segs }).distanceM, 180, 12, 'distance after recovery');
});

test('a lost signal (tunnel) is missing time: not effort, and its straight line is reported apart from the distance', () => {
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 8, 300); fixes.push(...a);
  t += 240 * 1000; m += 8 * 240; fixes.push(at(m, t)); // 4 minutes without any position, 1 920 m further
  [a, m, t] = cruise(m, t, 8, 300); fixes.push(...a);
  const r = E.analyse({ sport: 'cycling', startedAt: T0, endedAt: t, segs: record('cycling', fixes).segs, stretches: [{ s: T0, e: t, why: 'finish' }] });
  assert.equal(r.missingS, 240); assert.equal(r.movingS, 600); assert.equal(r.effortS, 600);
  near(r.distanceM, 4800, 5, 'measured distance'); near(r.gapDistanceM, 1920, 5, 'straight line of the hole');
  assert.equal(r.gaps.length, 1); near(r.avgMovingKmh, 28.8, 0.05, 'the average ignores the hole on both sides');
  assert.ok(E.explain(r).some((line) => /Sans position fiable/.test(line)));
  sumIsElapsed(r);
});

test('weak signal: positions worse than 30 m are refused with their reason and the period is not counted as effort', () => {
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 3, 120); fixes.push(...a);
  const [bad] = cruise(m, t, 3, 120, 2, { acc: 65 }); fixes.push(...bad);
  m += 360; t += 120 * 1000;
  [a, m, t] = cruise(m, t, 3, 120); fixes.push(...a);
  const track = record('running', fixes);
  assert.equal(track.why.accuracy, 60); assert.equal(track.rejected, 60);
  const r = E.analyse({ sport: 'running', startedAt: T0, endedAt: t, segs: track.segs, stretches: [{ s: T0, e: t, why: 'finish' }], rejected: track.rejected, why: track.why });
  near(r.missingS, 122, 2, 'missing'); near(r.movingS, 238, 2, 'moving'); assert.equal(r.why.accuracy, 60);
  assert.equal(E.signal({ t: T0, acc: 65 }, T0 + 1000).state, 'weak');
  assert.equal(E.signal({ t: T0, acc: 6 }, T0 + 1000).state, 'good');
  assert.equal(E.signal({ t: T0, acc: 6 }, T0 + 30000).state, 'lost');
  assert.equal(E.signal(null, T0).state, 'searching');
});

test('missing, doubled and backwards timestamps are refused, never guessed', () => {
  const track = record('running', [at(0, T0), at(6, T0 + 2000), at(12, T0 + 2000), at(18, T0 + 1000), at(24, NaN), { ...at(30, T0 + 4000), lat: 0, lon: 0 }, at(12, T0 + 4000)]);
  assert.deepEqual([track.why.order, track.why.invalid], [2, 2]);
  assert.equal(track.segs[0].length, 3);
  const r = E.analyse({ sport: 'running', startedAt: T0, endedAt: T0 + 4000, segs: track.segs });
  assert.ok(r.movingS >= 0 && r.stoppedS >= 0 && r.missingS >= 0);
  // an empty recording has no negative or invented figure
  const none = E.analyse({ sport: 'running', startedAt: T0, endedAt: T0 + 90000, segs: [], stretches: [{ s: T0, e: T0 + 90000, why: 'finish' }] });
  assert.equal(none.distanceM, 0); assert.equal(none.movingS, 0); assert.equal(none.missingS, 90); assert.equal(none.avgMovingKmh, null);
});

test('an interrupted recording is closed at its last position and the hole until the resume is not effort', () => {
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 3, 600); fixes.push(...a);
  const lost = t; const resumed = t + 15 * 60 * 1000;
  fixes.push('cut'); fixes.push(at(m + 2000, resumed + 1000));
  [a, m, t] = cruise(m + 2000, resumed + 1000, 3, 599); fixes.push(...a);
  const r = E.analyse({ sport: 'trail', startedAt: T0, endedAt: t, segs: record('trail', fixes).segs, stretches: [{ s: T0, e: lost, why: 'interrupted' }, { s: resumed, e: t, why: 'finish' }] });
  assert.equal(r.interruptedS, 900); assert.equal(r.pausedS, 0); near(r.movingS, 1199, 2, 'moving');
  near(r.distanceM, 3597, 6, 'the 2 km covered while the recording was lost are not counted');
  assert.equal(E.digest(r).pausedS, 900, 'the saved summary groups both kinds of pause');
  sumIsElapsed(r);
});

test('the same outing gives the same figures in any time zone, including across a zone change', () => {
  const fixes = [at(0, T0), ...cruise(0, T0, 4, 7200)[0]];
  const segs = record('running', fixes).segs;
  const before = process.env.TZ;
  const out = ['Europe/Paris', 'America/Los_Angeles', 'Asia/Kathmandu', 'UTC'].map((zone) => {
    process.env.TZ = zone;
    return JSON.stringify(E.digest(E.analyse({ sport: 'running', startedAt: T0, endedAt: T0 + 7200000, segs })));
  });
  process.env.TZ = before;
  assert.equal(new Set(out).size, 1);
});

test('automatic pause can be turned off: stops are still measured but stay in the duration of the session', () => {
  const fixes = [at(0, T0)];
  let [a, m, t] = cruise(0, T0, 3, 300); fixes.push(...a);
  t += 300 * 1000; fixes.push(at(m, t));
  [a, m, t] = cruise(m, t, 3, 300); fixes.push(...a);
  const rec = { sport: 'running', startedAt: T0, endedAt: t, segs: record('running', fixes).segs, stretches: [{ s: T0, e: t, why: 'finish' }] };
  const on = E.analyse(rec), off = E.analyse(rec, { autoPause: false });
  assert.equal(on.stoppedS, 300); assert.equal(off.stoppedS, 300);
  assert.equal(on.effortS, 600); assert.equal(off.effortS, 900);
  assert.equal(on.distanceM, off.distanceM);
});

test('kilometre splits use moving time only, and climb comes only from a reliable altitude', () => {
  const fixes = [at(0, T0, { alt: 200, altAcc: 4 })];
  for (let s = 2; s <= 1000; s += 2) fixes.push(at(4 * s, T0 + s * 1000, { alt: 200 + s * 0.1, altAcc: 4 })); // 4 km, +100 m
  const stopT = T0 + 1000 * 1000 + 120000; fixes.push(at(4000, stopT, { alt: 300, altAcc: 4 })); // 2 min stop at km 4
  for (let s = 2; s <= 250; s += 2) fixes.push(at(4000 + 4 * s, stopT + s * 1000, { alt: 300 - s * 0.08, altAcc: 4 })); // 1 km, −20 m
  const end = stopT + 250000;
  const r = E.analyse({ sport: 'running', startedAt: T0, endedAt: end, segs: record('running', fixes).segs, stretches: [{ s: T0, e: end, why: 'finish' }] });
  assert.equal(r.splits.length, 5);
  for (const s of r.splits) near(s.movingS, 250, 1.5, `split ${s.index}`);
  near(r.ascentM, 100, 4, 'climb'); near(r.descentM, 20, 4, 'descent'); assert.equal(r.altitude.reliable, true);
  const flat = E.analyse({ sport: 'running', startedAt: T0, endedAt: end, segs: record('running', fixes.map((f) => ({ ...f, altAcc: 40 }))).segs });
  assert.equal(flat.ascentM, null); assert.equal(flat.altitude.reliable, false);
  assert.ok(E.explain(flat).some((line) => /aucun chiffre/.test(line)));
});

test('a very long outing is thinned, never frozen, and only GPS sports ask for a position', () => {
  let track = { segs: [], rejected: 0 };
  for (let i = 0; i < 2500; i++) track = E.ingest(track, at(i * 10, T0 + i * 2000), { sport: 'cycling', newSegment: i === 0, maxPoints: 1000 });
  assert.ok(track.segs.flat().length <= 1000); assert.ok(track.every >= 4000); assert.equal(track.rejected, 0);
  near(E.analyse({ sport: 'cycling', startedAt: T0, endedAt: T0 + 2499 * 2000, segs: track.segs }).distanceM, 24990, 80, 'distance after thinning');
  assert.equal(E.isGpsSport('gravel'), true); assert.equal(E.isGpsSport('mountain_bike'), true);
  for (const indoor of ['musculation', 'badminton', 'climbing_boulder', 'yoga', 'swimming', 'treadmill']) assert.equal(E.isGpsSport(indoor), false);
  assert.equal(E.familyOf('gravel'), 'bike'); assert.equal(E.familyOf('hiking'), 'walk'); assert.equal(E.familyOf('mountain_bike'), 'mtb');
});
