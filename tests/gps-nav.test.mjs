/* V1.7.7 — route geometry: GPX in and out, following, leaving the route, going back, comparing outings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../js/core/gpx.js');
const E = require('../js/core/gps-engine.js');
const N = require('../js/core/gps-nav.js');

const LAT = 48.58, LON = 7.70, MLAT = (Math.PI / 180) * 6371008.8, MLON = MLAT * Math.cos(LAT * Math.PI / 180);
/** A point `north` and `east` metres from the origin. */
const P = (north, east = 0, extra = {}) => ({ lat: LAT + north / MLAT, lon: LON + east / MLON, ...extra });
const line = (n, step, f = (i) => [i * step, 0]) => Array.from({ length: n }, (_, i) => { const [a, b] = f(i); return P(a, b, { ele: 200 + i }); });
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
const T0 = Date.UTC(2026, 10, 25, 8, 0, 0);
const gpxOf = (pts, withTime = true) => `<?xml version="1.0"?><gpx version="1.1" creator="x"><trk><name>Tour &amp; détour</name><trkseg>${pts.map((p, i) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.ele}</ele>${withTime ? `<time>${new Date(T0 + i * 10000).toISOString()}</time>` : ''}</trkpt>`).join('')}</trkseg></trk></gpx>`;

test('a valid GPX becomes a route with its distance, and a climb only when every point has an altitude', () => {
  const r = N.importGpx(gpxOf(line(201, 50)), G, { sport: 'gravel' });
  assert.equal(r.ok, true); near(r.route.distanceM, 10000, 15, 'distance'); near(r.route.ascentM, 200, 3, 'climb');
  assert.equal(r.route.name, 'Tour & détour'); assert.equal(r.route.origin, 'imported'); assert.equal(r.facts.hasAltitude, true);
  const noEle = N.importGpx(gpxOf(line(50, 50)).replace(/<ele>\d+<\/ele>/g, ''), G);
  assert.equal(noEle.route.ascentM, null); assert.equal(noEle.facts.hasAltitude, false);
  // a planner's file (rte, no time) is a route too
  const rte = N.importGpx(`<gpx><rte>${line(20, 100).map((p) => `<rtept lat="${p.lat}" lon="${p.lon}"/>`).join('')}</rte></gpx>`, G);
  assert.equal(rte.ok, true); assert.equal(rte.facts.hasTime, false); near(rte.route.distanceM, 1900, 5, 'route distance');
});

test('invalid, hostile, empty and oversized GPX files are refused with a reason, never half-read', () => {
  for (const [text, pattern] of [
    ['', /vide/], ['pas du xml', /incomplet|exploitable/], ['<gpx><trk><trkseg><trkpt lat="48" lon="7"></trkseg></trk></gpx>', /incomplet/],
    ['<!DOCTYPE gpx [<!ENTITY x "y">]><gpx></gpx>', /entités/], ['<gpx><trk><trkseg><trkpt lat="48" lon="7"/></trkseg></trk></gpx>', /exploitable/],
    ['<gpx><trk><trkseg><trkpt lat="948" lon="7"/><trkpt lat="x" lon="7"/></trkseg></trk></gpx>', /exploitable/],
    [gpxOf([P(0), P(10)]), /moins de 50 m/], ['x'.repeat(15 * 1024 * 1024 + 1), /15 Mo/],
  ]) { const r = N.importGpx(text, G); assert.equal(r.ok, false); assert.match(r.error, pattern); }
});

test('a large GPX (60 000 points) is read, and thinned to what one stored route may hold without moving its ends', () => {
  const pts = Array.from({ length: 60000 }, (_, i) => P(i * 2, Math.sin(i / 300) * 400, { ele: 300 }));
  const r = N.importGpx(gpxOf(pts, false), G);
  assert.equal(r.ok, true); assert.equal(r.facts.points, 60000);
  const doc = N.encode(r.route);
  const kept = doc.segs.flat();
  assert.ok(kept.length <= 3000, `${kept.length} points`);
  assert.ok(JSON.stringify(doc).length < 262144, 'under the server ceiling of 256 kB');
  const back = N.decode(doc, { origin: 'imported' });
  near(back.distanceM, r.route.distanceM, r.route.distanceM * 0.01, 'distance after thinning');
  near(N.haversine(back.segs[0][0], pts[0]), 0, 1.5, 'start'); near(N.haversine(back.segs[0].at(-1), pts.at(-1)), 0, 1.5, 'end');
});

test('export then import gives back the same outing: stretches, distance and times', () => {
  const fix = (m, s, east = 0) => ({ ...P(m, east), alt: 200 + m / 50, altAcc: 4, acc: 5, t: T0 + s * 1000 });
  const segs = [Array.from({ length: 300 }, (_, i) => fix(i * 6, i * 2)), Array.from({ length: 200 }, (_, i) => fix(1800 + i * 6, 1200 + i * 2, 30))];
  const file = N.toGpx(segs, 'Sortie <test> & co');
  const a = G.analyse(file);
  assert.equal(a.ok, true); assert.equal(a.segmentCount, 2); assert.equal(a.kind, 'recorded');
  const direct = E.analyse({ sport: 'running', segs });
  near(a.distanceKm * 1000, direct.distanceM, 12, 'distance read back'); near(a.movingMinutes * 60, direct.movingS, 6, 'moving time read back');
  const r = N.importGpx(file, G);
  assert.equal(r.route.name, 'Sortie <test> & co'); assert.equal(r.route.segs.length, 2, 'the pause is not bridged');
  // the shared copy hides both ends and carries neither time nor altitude
  const shared = N.toGpx(N.trimEnds(segs), 'x', { time: false, ele: false });
  assert.ok(!/<time>|<ele>/.test(shared));
  const sp = G.points(shared);
  assert.ok(N.haversine(sp[0], segs[0][0]) >= 295 && N.haversine(sp.at(-1), segs[1].at(-1)) >= 295);
  assert.equal(N.trimEnds([segs[0].slice(0, 100)]), null, 'too short to hide both ends: not shared at all');
});

test('following a route: progress, remaining distance, and an off-route alert only when the gap persists beyond GPS noise', () => {
  const route = N.makeRoute([line(101, 50)], { sport: 'gravel' });
  const c = N.course(route);
  let s = N.startFollow(), t = T0;
  const step = (north, east, acc = 6) => { t += 2000; s = N.follow(c, s, { ...P(north, east), acc, t }, { sport: 'gravel' }); return s; };
  step(-80, 0); assert.equal(s.joined, false); assert.equal(s.off, false, 'approaching the start is not « off the route »');
  for (let m = 0; m <= 1000; m += 20) step(m, (m / 20) % 2 ? 6 : -6);
  assert.equal(s.joined, true); assert.equal(s.off, false); near(s.alongM, 1000, 5, 'progress'); near(s.remainingM, 4000, 5, 'remaining');
  // a noisy position (announced ± 40 m) 60 m aside is inside the uncertainty: no alert
  for (let i = 1; i <= 8; i++) step(1000 + i * 20, 60, 40);
  assert.equal(s.off, false);
  // a real detour: 120 m aside with a good signal — not on the first position, then yes after 10 s
  step(1180, 120); assert.equal(s.off, false);
  for (let i = 1; i <= 6; i++) step(1180 + i * 20, 120);
  assert.equal(s.off, true); assert.ok(s.offM > 100); near(s.alongM, 1160, 30, 'progress is held while off the route');
  // coming back clears it
  for (let i = 1; i <= 4; i++) step(1400 + i * 20, 3);
  assert.equal(s.off, false); near(s.alongM, 1480, 5, 'progress after the detour');
  for (let m = 1500; m <= 5000; m += 25) step(m, 0);
  assert.equal(s.done, true); assert.equal(s.remainingM, 0);
});

test('an out-and-back route is followed in order: the return leg does not snap back to the outward leg', () => {
  const out = line(41, 50), back = out.slice(0, -1).reverse();
  const c = N.course(N.makeRoute([[...out, ...back]], {}));
  let s = N.startFollow(), t = T0;
  for (let m = 0; m <= 2000; m += 25) { t += 3000; s = N.follow(c, s, { ...P(m, 2), acc: 5, t }, { sport: 'running' }); }
  near(s.alongM, 2000, 6, 'at the turn');
  for (let m = 1975; m >= 500; m -= 25) { t += 3000; s = N.follow(c, s, { ...P(m, -2), acc: 5, t }, { sport: 'running' }); }
  near(s.alongM, 3500, 6, 'on the way back'); near(s.remainingM, 500, 6, 'remaining on the way back');
});

test('back to the start: the recorded way reversed, holes left open, a straight line given only as a direction', () => {
  const fix = (m, s, east = 0) => ({ ...P(m, east), alt: 200, altAcc: 4, acc: 5, t: T0 + s * 1000 });
  const segs = [Array.from({ length: 200 }, (_, i) => fix(i * 10, i * 2)), Array.from({ length: 100 }, (_, i) => fix(2600 + i * 10, 800 + i * 2, 500))];
  const b = N.backtrack(segs, { sport: 'gravel' });
  assert.equal(b.route.origin, 'backtrack'); assert.equal(b.holes, 1); assert.ok(b.holesStraightM > 700);
  near(N.haversine(b.route.segs[0][0], segs[1].at(-1)), 0, 1, 'starts where the athlete is');
  near(N.haversine(b.route.segs.at(-1).at(-1), segs[0][0]), 0, 1, 'ends at the real start of the outing');
  near(b.route.distanceM, 1990 + 990, 5, 'only the recorded way, the hole is not added');
  assert.ok(b.route.points < 20, 'a straight way is a few points');
  const str = N.straight(segs[1].at(-1), b.start);
  near(str.distanceM, Math.hypot(3590, 500), 8, 'straight distance'); assert.equal(str.cardinal, 'sud');
  assert.equal(N.backtrack([[fix(0, 0)]], {}), null, 'nothing recorded: nothing to follow');
  // an arrival estimate needs real movement first, and is a range
  assert.equal(N.eta(3000, { movingS: 100, distanceM: 300 }), null);
  const e = N.eta(3000, { movingS: 1200, distanceM: 6000, splits: [] });
  assert.equal(e.seconds, 600); assert.equal(e.lowS, 500); assert.equal(e.highS, 750);
  const withSplits = N.eta(5000, { movingS: 1000, distanceM: 5000, splits: [180, 200, 200, 220, 200].map((movingS, i) => ({ index: i + 1, distanceM: 1000, movingS })) });
  assert.ok(withSplits.lowS < 1000 && withSplits.highS > 1000 && withSplits.highS - withSplits.lowS < 250);
});

test('two outings are « the same route » only when each covers the other; direction is told apart; weak data is set aside', () => {
  const loop = (n, radius, phase = 0, dir = 1) => Array.from({ length: n + 1 }, (_, i) => P(radius * Math.sin(dir * (i / n) * 2 * Math.PI + phase) + radius, radius * Math.cos(dir * (i / n) * 2 * Math.PI + phase)));
  const a = N.makeRoute([loop(400, 1500)], {}), b = N.makeRoute([loop(380, 1508)], {}), rev = N.makeRoute([loop(400, 1500, 0, -1)], {});
  const cut = N.makeRoute([loop(400, 1500).slice(0, 200)], {}), other = N.makeRoute([loop(400, 1500).map((p) => ({ lat: p.lat + 0.01, lon: p.lon }))], {});
  const same = N.sameRoute(a, b);
  assert.equal(same.match, true); assert.equal(same.direction, 'same');
  assert.equal(N.sameRoute(a, rev).match, true); assert.equal(N.sameRoute(a, rev).direction, 'reverse');
  assert.equal(N.sameRoute(a, cut).match, false, 'half of the loop is not the loop');
  assert.equal(N.sameRoute(a, other).match, false);
  assert.match(N.sameRoute(a, N.makeRoute([[P(0), P(100)]], {})).reason, /trop courte/);
  const cmp = N.compareEfforts(a.distanceM, [
    { id: 'a', movingS: 1800, elapsedS: 2000, missingS: 0, distanceM: a.distanceM, direction: 'same' },
    { id: 'b', movingS: 1750, elapsedS: 1800, missingS: 0, distanceM: a.distanceM * 1.02, direction: 'same' },
    { id: 'c', movingS: 1500, elapsedS: 2000, missingS: 200, distanceM: a.distanceM, direction: 'same' },
    { id: 'd', movingS: 1400, elapsedS: 1400, missingS: 0, distanceM: a.distanceM * 0.8, direction: 'same' },
    { id: 'e', movingS: 1300, elapsedS: 1300, missingS: 0, distanceM: a.distanceM, direction: 'reverse' },
    { id: 'f', movingS: 0, distanceM: a.distanceM },
  ]);
  assert.deepEqual(cmp.comparable.map((x) => x.id), ['b', 'a']); assert.equal(cmp.best.id, 'b');
  assert.deepEqual(cmp.excluded.map((x) => x.id), ['c', 'd', 'e', 'f']);
  const alone = N.compareEfforts(a.distanceM, [{ id: 'a', movingS: 1800, elapsedS: 1800, distanceM: a.distanceM, direction: 'same' }]);
  assert.equal(alone.best, null); assert.match(alone.note, /au moins deux sorties/);
});

test('points near a route are listed in the order they are met; a profile exists only with altitudes', () => {
  const route = N.makeRoute([line(101, 50)], {});
  const found = N.nearRoute([{ id: 'far', ...P(2000, 900) }, { id: 'late', ...P(4000, 40) }, { id: 'early', ...P(500, -60) }], route, 150);
  assert.deepEqual(found.map((p) => p.id), ['early', 'late']); near(found[0].alongM, 500, 3, 'position along the route'); assert.equal(found[0].offM, 60);
  assert.equal(N.profile(route, 20).length >= 20, true);
  assert.deepEqual(N.profile(N.makeRoute([line(10, 50).map((p) => ({ lat: p.lat, lon: p.lon }))], {})), []);
});
