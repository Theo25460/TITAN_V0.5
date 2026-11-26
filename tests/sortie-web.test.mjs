/* V1.7.7 — the outing recorded in the browser (js/app/sortie-model.js): stretches, reload, background holes, the session that is saved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../js/core/gps-engine.js');
const N = require('../js/core/gps-nav.js');
const S = require('../js/core/gps-session.js');
const R = require('../js/app/sortie-model.js');

const LAT = 48.58, LON = 7.70, MLAT = (Math.PI / 180) * 6371008.8, MLON = MLAT * Math.cos((LAT * Math.PI) / 180);
const T0 = new Date(2026, 10, 25, 9, 0, 0).getTime();
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
const fix = (t, north, east = 0, extra = {}) => ({ t, lat: LAT + north / MLAT, lon: LON + east / MLON, acc: 5, alt: null, altAcc: null, spd: null, hdg: null, ...extra });
/** Rides north at `speed` m/s for `seconds`, one position every `step` s, starting at `t` from `north` metres. Returns the state after. */
function ride(rec, at, seconds, speed, step = 5) {
  let { t, north } = at;
  for (let s = step; s <= seconds; s += step) rec = R.addFix(rec, fix(t + s * 1000, north + s * speed));
  return { rec, t: t + seconds * 1000, north: north + seconds * speed };
}
/** Stands still for `seconds` (the receiver wanders by a metre), one position every 10 s. */
function halt(rec, at, seconds) {
  for (let s = 10; s <= seconds; s += 10) rec = R.addFix(rec, fix(at.t + s * 1000, at.north + (s % 20 ? 0.8 : -0.6), s % 30 ? 0.5 : -0.4));
  return { rec, t: at.t + seconds * 1000, north: at.north };
}
const start = (extra = {}) => R.create({ owner: 'guest_1', sport: 'gravel', now: T0, ...extra });
const sum = (a) => a.ms.moving + a.ms.stopped + a.ms.paused + a.ms.interrupted + a.ms.missing;

test('a new outing runs from its start, with one open stretch, and only usable options are kept', () => {
  const rec = start({ goal: { kind: 'distance', km: 30 }, steps: [{ kind: 'warmup', by: 'time', value: 600 }, { kind: 'nope' }], follow: { id: 'r1', route: N.makeRoute([[{ lat: LAT, lon: LON }, { lat: LAT + 0.01, lon: LON }]], { name: 'Boucle du canal' }) } });
  assert.equal(rec.v, 2); assert.equal(rec.status, 'recording'); assert.deepEqual(rec.stretches, [{ s: T0, e: null, why: null }]);
  assert.deepEqual(rec.goal, { kind: 'distance', km: 30 }); assert.equal(rec.plan.steps.length, 1); assert.equal(rec.plan.alerts, true);
  assert.equal(rec.follow.name, 'Boucle du canal'); assert.equal(rec.follow.id, 'r1'); assert.equal(rec.follow.state.joined, false);
  const bare = start({ goal: { kind: 'distance', km: -3 }, steps: [], follow: { id: 'x', route: null } });
  assert.equal(bare.goal, null); assert.equal(bare.plan, null); assert.equal(bare.follow, null); assert.equal(bare.opts.autoPause, true);
  assert.equal(start({ autoPause: false }).opts.autoPause, false);
});

test('ride, 20-minute stop, ride: moving, stopped and total match the construction, and the time bar adds up', () => {
  let s = ride(start(), { t: T0, north: 0 }, 600, 6);
  s = halt(s.rec, s, 1200);
  s = ride(s.rec, s, 300, 6);
  const rec = R.finish(s.rec, s.t), a = R.analysis(rec, s.t + 99999);
  assert.equal(rec.status, 'ended'); assert.equal(rec.endedAt, s.t); assert.equal(rec.stretches[0].why, 'finish');
  // the first position arrives 5 s after the start: those 5 s are not movement, and their 30 m were never measured
  near(a.distanceM, 5370, 30, 'distance'); near(a.movingS, 895, 15, 'moving'); near(a.stoppedS, 1205, 15, 'stopped');
  assert.equal(a.elapsedS, 2100); assert.equal(sum(a), a.ms.elapsed); assert.equal(a.pausedS + a.interruptedS + a.missingS, 0);
  near(a.avgMovingKmh, 21.6, 0.4, 'moving average'); near(a.avgOverallKmh, 5370 / 2100 * 3.6, 0.2, 'overall average');
  assert.equal(a.stops.length, 1); near(a.stops[0].seconds, 1200, 15, 'the stop');
  // a 20-minute stop is two positions that say how long it lasted, not 120
  assert.ok(a.points < 600 / 5 + 300 / 5 + 8, `${a.points} positions kept`);
  const bar = R.timeBar(a);
  near(bar.parts.reduce((n, p) => n + p.share, 0), 1, 1e-9, 'shares'); assert.deepEqual(bar.legend.map((l) => l.kind), ['moving', 'stopped']);
  assert.match(bar.text, /^En mouvement 14 min 5\d, À l’arrêt 20 min 0\d$/);
});

test('pause and resume: the pause is its own time, the trace is not joined across it, and nothing arrives while paused', () => {
  let s = ride(start(), { t: T0, north: 0 }, 300, 6);
  let rec = R.pause(s.rec, s.t);
  assert.equal(rec.status, 'paused'); assert.deepEqual(rec.stretches, [{ s: T0, e: s.t, why: 'pause' }]); assert.equal(R.pause(rec, s.t + 5), rec);
  assert.equal(R.addFix(rec, fix(s.t + 60000, 5000)), rec, 'a position during a pause is not recorded');
  assert.equal(R.stateLine(rec, R.analysis(rec, s.t + 120000), s.t + 120000).text, 'En pause');
  rec = R.resume(rec, s.t + 600000); // ten minutes later, 3 km away (a train)
  assert.equal(rec.status, 'recording'); assert.equal(rec.stretches.length, 2); assert.equal(rec.newSegment, true); assert.equal(R.resume(rec, 1), rec);
  s = ride(rec, { t: s.t + 600000, north: 4800 }, 300, 6);
  const a = R.analysis(R.finish(s.rec, s.t), s.t);
  assert.equal(s.rec.track.segs.length, 2, 'two pieces of trace');
  near(a.distanceM, 3540, 40, 'the 3 km of the pause are not counted'); assert.equal(a.pausedS, 600); near(a.movingS, 590, 15, 'moving');
  assert.equal(sum(a), a.ms.elapsed);
});

test('reload in the middle: the stretch ends at the last position (interrupted), the figures are kept and the outing goes on', () => {
  let s = ride(start(), { t: T0, north: 0 }, 600, 6);
  const before = R.analysis(s.rec, s.t);
  // the stored recording survives JSON (the page is closed, then opened 4 minutes later)
  const stored = JSON.parse(JSON.stringify(s.rec)), reopened = s.t + 240000;
  let rec = R.reconcile(stored, reopened);
  assert.equal(rec.status, 'paused'); assert.equal(rec.interrupted, true); assert.deepEqual(rec.stretches, [{ s: T0, e: s.t, why: 'interrupted' }]);
  assert.equal(R.stateLine(rec, R.analysis(rec, reopened), reopened).kind, 'interrupted');
  const offered = R.analysis(rec, reopened);
  assert.equal(offered.distanceM, before.distanceM); assert.equal(offered.movingS, before.movingS); assert.equal(offered.interruptedS, 240);
  assert.equal(R.reconcile(rec, reopened + 5), rec, 'a paused recording is left as it is');
  rec = R.resume(rec, reopened);
  s = ride(rec, { t: reopened, north: s.north + 900 }, 300, 6);
  const a = R.analysis(R.finish(s.rec, s.t), s.t);
  near(a.distanceM, 5340, 40, 'distance of both parts, not the 900 m of the closed page'); assert.equal(a.interruptedS, 240); assert.equal(a.pausedS, 0);
  assert.equal(sum(a), a.ms.elapsed); assert.equal(E.digest(a).pausedS, 240, 'the saved digest counts the interruption with the pauses');
  // without any position, the stretch closes where it began; a raw position that was refused still proves the page was alive
  assert.deepEqual(R.reconcile(start(), T0 + 9e6).stretches, [{ s: T0, e: T0, why: 'interrupted' }]);
  const weak = R.addFix(start(), fix(T0 + 40000, 0, 0, { acc: 80 }));
  assert.equal(weak.track.rejected, 1); assert.equal(R.reconcile(weak, T0 + 9e6).stretches[0].e, T0 + 40000);
});

test('finishing from the resume offer ends the outing at its last stretch: two days of closed page are not part of it', () => {
  const s = ride(start(), { t: T0, north: 0 }, 600, 6);
  const later = s.t + 2 * 86400000;
  const rec = R.finish(R.reconcile(s.rec, later), later), a = R.analysis(rec, later + 5000);
  assert.equal(rec.status, 'ended'); assert.equal(rec.endedAt, s.t); assert.equal(a.elapsedS, 600); assert.equal(a.interruptedS, 0);
  assert.equal(R.finish(rec, later + 1), rec);
});

test('screen locked or tab in the background: the hole is « sans position », its straight line is not distance, the trace is cut', () => {
  let s = ride(start(), { t: T0, north: 0 }, 300, 6);
  // 4 minutes without a position while the athlete went 1.4 km further
  s = ride(s.rec, { t: s.t + 240000, north: s.north + 1440 }, 300, 6);
  const a = R.analysis(s.rec, s.t);
  assert.equal(s.rec.track.segs.length, 2, 'never joined by a line');
  near(a.missingS, 245, 6, 'missing time'); near(a.gapDistanceM, 1470, 40, 'reported apart'); near(a.distanceM, 3540, 40, 'distance without the hole');
  assert.equal(a.gaps.length, 1); assert.equal(sum(a), a.ms.elapsed);
  assert.match(R.quality(a).holesText, /^1 trou dans la trace \(4 min \d+ sans position\), soit au moins 1,4\d km à vol d’oiseau non ajoutés à la distance\.$/);
  // while it lasts, the state line says so instead of pretending to move
  const quiet = ride(start(), { t: T0, north: 0 }, 60, 6);
  assert.deepEqual(R.stateLine(quiet.rec, R.analysis(quiet.rec, quiet.t + 95000), quiet.t + 95000), { kind: 'nosignal', text: 'Sans signal depuis 1:35' });
});

test('positions: a cached one from before the stretch is ignored, a weak or impossible one is refused with its reason, the latest is shown', () => {
  let rec = start();
  assert.equal(R.addFix(rec, fix(T0 - 4000, 0)), rec);
  rec = R.addFix(rec, fix(T0 + 2000, 0, 0, { acc: 55, spd: 1.2, hdg: 90 }));
  assert.equal(rec.track.segs.length, 0); assert.deepEqual(rec.track.why, { accuracy: 1, speed: 0, order: 0, invalid: 0, full: 0 });
  assert.equal(rec.live.acc, 55); assert.equal(E.signal(rec.live, T0 + 3000).state, 'weak'); assert.equal(rec.newSegment, true);
  rec = R.addFix(rec, fix(T0 + 4000, 0)); rec = R.addFix(rec, fix(T0 + 9000, 30));
  rec = R.addFix(rec, fix(T0 + 10000, 3000)); // 2970 m in one second
  assert.equal(rec.track.why.speed, 1); assert.equal(rec.track.segs[0].length, 2); assert.equal(rec.newSegment, false);
  assert.equal(R.quality(R.analysis(rec, T0 + 11000)).refusedText, '2 positions refusées : 1 trop imprécises (plus de 30 m), 1 vitesse impossible pour ce sport.');
  assert.deepEqual(R.stateLine(start(), R.analysis(start(), T0 + 5000), T0 + 5000), { kind: 'waiting', text: 'Recherche du signal GPS…' });
});

test('a browser position becomes a fix: rounded, its own time when plausible, the page clock otherwise', () => {
  const pos = (timestamp, coords) => ({ timestamp, coords: { latitude: 48.5812345678, longitude: 7.7501234567, accuracy: 4.26, altitude: 143.27, altitudeAccuracy: 3.9, speed: 5.456, heading: 187.6, ...coords } });
  assert.deepEqual(R.fixOf(pos(T0 + 1000), T0 + 1200), { t: T0 + 1000, lat: 48.581235, lon: 7.750123, acc: 4.3, alt: 143.3, altAcc: 3.9, spd: 5.46, hdg: 188 });
  assert.equal(R.fixOf(pos(T0 + 60000), T0).t, T0, 'a time in the future is the page clock');
  assert.equal(R.fixOf(pos(978307200000 + 5000), T0).t, T0, 'another epoch is the page clock');
  const bare = R.fixOf(pos(T0, { altitude: null, altitudeAccuracy: null, speed: null, heading: NaN }), T0);
  assert.deepEqual([bare.alt, bare.altAcc, bare.spd, bare.hdg], [null, null, null, null]);
  assert.equal(R.fixOf(pos(T0, { speed: -1 }), T0).spd, null); assert.equal(R.fixOf(null, T0), null); assert.equal(R.fixOf({}, T0), null);
});

test('the state line says a stop once the engine detected it, counted from its first second, then movement again', () => {
  let s = ride(start(), { t: T0, north: 0 }, 120, 6);
  assert.equal(R.stateLine(s.rec, R.analysis(s.rec, s.t + 1000), s.t + 1000).text, 'En mouvement');
  const stopAt = s.t;
  s = halt(s.rec, s, 90);
  const line = R.stateLine(s.rec, R.analysis(s.rec, s.t + 2000), s.t + 2000);
  assert.equal(line.kind, 'stopped'); assert.match(line.text, /^À l’arrêt depuis 1:3\d$/); near(R.analysis(s.rec, s.t).stops[0].at, stopAt, 6000, 'from its first second');
  s = ride(s.rec, s, 30, 6);
  assert.equal(R.stateLine(s.rec, R.analysis(s.rec, s.t + 1000), s.t + 1000).kind, 'moving');
});

test('the saved session: one idempotency key for good, kilometres, effort minutes with and without the automatic pause, totals only', () => {
  const build = (autoPause) => { let s = ride(start({ autoPause }), { t: T0, north: 0 }, 600, 6); s = halt(s.rec, s, 1200); s = ride(s.rec, s, 300, 6); return R.finish(s.rec, s.t); };
  let n = 0;
  const once = R.withEventId(build(true), () => `evt-${++n}`);
  assert.equal(once.eventId, 'evt-1'); assert.equal(R.withEventId(once, () => `evt-${++n}`), once); assert.equal(n, 1);
  assert.equal(R.withEventId(JSON.parse(JSON.stringify(once)), () => 'other').eventId, 'evt-1', 'kept across a reload');

  const a = R.analysis(once, once.endedAt), d = R.sessionDetails(once, a);
  assert.equal(d.ok, true); assert.equal(d.sport, 'gravel'); assert.equal(d.unit, 'km'); near(d.val, 5.37, 0.03, 'km');
  near(d.data.val2, 15, 0.25, 'effort is the moving time'); assert.equal(d.data.duration, d.data.val2); assert.equal(d.data.client_event_id, 'evt-1');
  assert.equal(d.data.performedAt, new Date(T0).toISOString()); assert.equal(d.data.hasGpx, true); assert.equal('elevation' in d.data, false, 'no climb without a reliable altitude');
  assert.deepEqual({ ...d.data.gpxStats, movingMinutes: 0, distanceKm: 0, points: 0 }, { distanceKm: 0, movingMinutes: 0, elapsedMinutes: 35, pauseMinutes: 0, ascent: null, descent: null, points: 0, source: 'gps_titan_web', verified: false, analysisVersion: 'gps-engine-v1' });
  assert.equal(d.data.gpxStats.movingMinutes, d.data.val2);
  assert.deepEqual(d.data.gps, { ...E.digest(a), client: 'web' }); assert.equal(d.data.gps.autoPause, true); near(d.data.gps.stoppedS, 1200, 15, 'stopped');
  assert.equal('gpxFingerprint' in d.data, false, 'a recorded outing is not a file import');
  assert.doesNotMatch(JSON.stringify(d.data), /"lat"|"lon"|48\.5|7\.7\d/, 'no position in the session');

  const kept = build(false), b = R.analysis(kept, kept.endedAt), e = R.sessionDetails(kept, b);
  near(e.data.val2, 35, 0.25, 'without the automatic pause the detected stops stay in the duration'); assert.equal(e.data.gps.autoPause, false);
  near(e.val, d.val, 0.001, 'the distance is the same');
});

test('the saved session: a reliable altitude gives a climb, a goal and a plan leave their result, nothing measured is not a session', () => {
  let rec = start({ goal: { kind: 'distance', km: 2 }, steps: [{ kind: 'warmup', by: 'distance', value: 1000 }, { kind: 'work', by: 'manual' }] });
  let t = T0, north = 0;
  for (let i = 1; i <= 120; i++) { t += 5000; north += 30; rec = R.addFix(rec, fix(t, north, 0, { alt: 200 + i, altAcc: 4 })); }
  const live = R.analysis(rec, t), run = S.runPlan(rec.plan.steps, rec.plan.cursor, live);
  rec = R.finish({ ...rec, plan: { ...rec.plan, cursor: run.cursor } }, t);
  const a = R.analysis(rec, t), d = R.sessionDetails(rec, a);
  near(d.data.elevation, 120, 4, 'climb'); assert.equal(d.data.gpxStats.ascent, d.data.elevation); assert.equal(d.data.gps.altitude, 'gnss');
  assert.deepEqual(d.data.gps.plan, { total: 2, done: 1, complete: false }); assert.deepEqual(d.data.gps.goal, { kind: 'distance', reached: true });
  assert.deepEqual(R.goalResult(rec, a), { kind: 'distance', reached: true, title: 'Objectif 2 km', line: 'Objectif de distance atteint.' });
  assert.match(R.goalResult({ ...rec, goal: { kind: 'time', minutes: 60 } }, a).line, /^10 min d’effort sur 1 h 00 visés\.$/);
  const back = R.goalResult({ ...rec, goal: { kind: 'return', at: t - 60000 } }, a);
  assert.equal(back.reached, false); assert.match(back.line, /^Sortie terminée à 09:10, après l’heure de retour prévue\.$/);
  assert.equal(R.goalResult(start(), a), null);

  const nothing = R.finish(start(), T0 + 300000), n = R.sessionDetails(nothing, R.analysis(nothing, T0 + 300000));
  assert.equal(n.ok, false); assert.match(n.error, /rien à enregistrer/);
  // signal lost for the whole outing but the automatic pause is off: the time recorded standing still is known, the distance is not
  let still = start({ autoPause: false }); for (let s = 10; s <= 900; s += 10) still = R.addFix(still, fix(T0 + s * 1000, s % 20 ? 0.5 : 0));
  still = R.finish(still, T0 + 900000);
  const u = R.sessionDetails(still, R.analysis(still, T0 + 900000));
  assert.equal(u.ok, true); assert.equal(u.unit, 'min'); assert.equal(u.data.unitOverride, 'min'); assert.equal(u.data.extras.distance_unknown, true); near(u.val, 15, 0.3, 'minutes');
});

test('following a route and coming back: the route state moves with the positions, the way back is the trace reversed with its holes', () => {
  const line = Array.from({ length: 41 }, (_, i) => ({ lat: LAT + (i * 50) / MLAT, lon: LON }));
  let rec = start({ follow: { id: null, route: N.makeRoute([line], { name: 'Canal' }) } });
  const course = N.course(rec.follow.route);
  let t = T0;
  rec = R.addFix(rec, fix(t += 5000, 0, -200), course);
  assert.equal(rec.follow.state.joined, false); near(rec.follow.state.offM, 200, 3, 'distance to the route before joining');
  for (let east = -175; east <= 0; east += 25) rec = R.addFix(rec, fix(t += 5000, 0, east), course);
  let s = ride(rec, { t, north: 0 }, 300, 5);
  assert.equal(s.rec.follow.state.joined, true); assert.equal(s.rec.follow.state.off, false); near(s.rec.follow.state.remainingM, 500, 15, 'remaining');
  assert.equal(R.guide(s.rec).kind, 'follow');
  // drifts away from the line, 40 m more every 5 s: said « off the route » only after 10 s and 3 positions beyond the margin
  const offAt = [];
  for (let k = 1; k <= 4; k++) { s.rec = R.addFix(s.rec, fix(s.t + k * 5000, s.north, 40 * k), course); offAt.push(s.rec.follow.state.off); }
  assert.deepEqual(offAt, [false, false, false, true]); near(s.rec.follow.state.offM, 160, 3, 'gap');
  for (let k = 5; k <= 8; k++) s.rec = R.addFix(s.rec, fix(s.t + k * 5000, s.north, 40 * (8 - k)), course);
  assert.equal(s.rec.follow.state.off, false, 'back on the route');
  s.t += 40000;
  // a weak position never moves the route state
  const weak = R.addFix(s.rec, fix(s.t + 5000, s.north, 400, { acc: 60 }), course);
  assert.equal(weak.follow.state, s.rec.follow.state);

  const a = R.analysis(s.rec, s.t + 30000), way = R.wayBack(s.rec, a);
  near(way.straight.distanceM, Math.hypot(1500, 200), 5, 'straight line'); assert.equal(way.straight.cardinal, 'sud'); assert.equal(way.near, false);
  near(way.same.route.distanceM, 200 + 1500 + 320, 25, 'the way actually taken'); assert.ok(way.eta && way.eta.lowS < way.eta.highS);
  const back = R.startBack(s.rec, s.t + 30000);
  assert.equal(R.guide(back).kind, 'back'); assert.equal(back.back.name, 'Retour par le même chemin'); assert.equal(back.follow.name, 'Canal', 'the chosen route is kept');
  const home = R.addFix(back, fix(s.t + 40000, s.north - 30, 0));
  assert.equal(home.back.state.joined, true); assert.ok(home.back.state.remainingM < way.same.route.distanceM);
  assert.equal(R.guide(R.stopBack(home)).kind, 'follow'); assert.equal(R.guide(R.stopFollow(R.stopBack(home))), null);
  assert.equal(R.wayBack(start(), R.analysis(start(), T0)), null);
  assert.equal(R.startBack(start(), T0).back, null, 'nothing to walk back without a trace');
});

test('the structured session form: minutes, seconds, kilometres, metres or « au signal »; what cannot be used is named, not guessed', () => {
  const p = R.planFromForm({ warmup: { mode: 'min', value: '10' }, reps: 3, work: { mode: 'm', value: 400 }, recover: { mode: 's', value: '90' }, cooldown: { mode: 'manual' } });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.steps.map(S.describeStep), ['Échauffement · 10:00', 'Effort 1/3 · 0,40 km', 'Récupération 1/2 · 1:30', 'Effort 2/3 · 0,40 km', 'Récupération 2/2 · 1:30', 'Effort 3/3 · 0,40 km', 'Retour au calme · au signal']);
  assert.deepEqual(R.planFromForm({ work: { mode: 'km', value: '2,5' }, reps: 1, recover: { mode: 'min', value: 2 } }).steps.map(S.describeStep), ['Effort · 2,50 km'], 'one repeat has no recovery');
  assert.deepEqual(R.planFromForm({ warmup: { mode: 'none' }, work: { mode: 'none' } }), { steps: [], errors: [] });
  const bad = R.planFromForm({ warmup: { mode: 's', value: 2 }, reps: 2, work: { mode: 'm', value: '' }, cooldown: { mode: 'km', value: 900 } });
  assert.equal(bad.steps.length, 0); assert.equal(bad.errors.length, 3); assert.match(bad.errors[0], /^Échauffement : indique une durée de 5 s à 6 h/);
  assert.equal(R.planFromForm({ work: { mode: 'min', value: 1 }, reps: 99 }).steps.length, 30, 'at most 30 repeats');
  assert.equal(R.partOf({ mode: 'weeks', value: 2 }), null);
});

test('« être rentré pour HH:MM » is the next time the clock shows that hour; preferences fall back to safe values', () => {
  assert.equal(R.returnAt('12:30', T0), new Date(2026, 10, 25, 12, 30).getTime());
  assert.equal(R.returnAt('08:15', T0), new Date(2026, 10, 26, 8, 15).getTime(), 'already past: tomorrow');
  assert.equal(R.returnAt('7h05', T0), new Date(2026, 10, 26, 7, 5).getTime());
  for (const bad of ['', '25:00', '12:60', 'midi', null]) assert.equal(R.returnAt(bad, T0), null);
  assert.deepEqual(R.prefsOf(null), { sport: null, view: 'mixed', autoPause: true, vibrate: true, tiles: false, fields: {} });
  const p = R.prefsOf({ sport: 'gravel', view: 'map', autoPause: false, vibrate: false, tiles: true, fields: { bike: ['moving', 'ascent', 'clock', 'stopped'], run: ['moving', 'moving', 'clock', 'stopped'], walk: ['heart'], nope: ['moving'] } });
  assert.deepEqual(p, { sport: 'gravel', view: 'map', autoPause: false, vibrate: false, tiles: true, fields: { bike: ['moving', 'ascent', 'clock', 'stopped'] } });
  assert.deepEqual(S.layout('gravel', p.fields.bike).more, ['moving', 'ascent', 'clock', 'stopped']);
  assert.equal(R.prefsOf({ sport: 'yoga', view: 'satellite' }).sport, null); assert.equal(R.prefsOf({ view: 'satellite' }).view, 'mixed');
  assert.equal(R.gpxName(start()), 'titan-gravel-2026-11-25.gpx');
  assert.deepEqual([R.recKey('a'), R.followKey('a'), R.prefsKey('a')], ['titan.gps.rec.v2:a', 'titan.gps.follow.v1:a', 'titan.gps.prefs.v1:a']);
});
