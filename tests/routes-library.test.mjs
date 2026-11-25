// V1.7.7 — the rules of the web route library, tested without a browser: the « unknown function » helper, a v1 row read as a v2 one,
// the arguments of a save (and its v1 fallback), the client route id that makes a retry harmless, the copies kept in the browser
// (quota included), the candidates of a comparison and the hand-off the outing page reads.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../js/core/gps-engine.js');
const N = require('../js/core/gps-nav.js');
const G = require('../js/core/gpx.js');
const R = require('../js/app/parcours.js');

const T0 = Date.UTC(2026, 10, 20, 8, 0, 0);
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
/** A straight line heading north from (48.85, 2.35): `n` points `stepM` metres apart, one every 5 s. */
const line = (n, stepM = 20, lon = 2.35, timed = true) => Array.from({ length: n }, (_, i) => ({ lat: 48.85 + (i * stepM) / 111320, lon, ele: 100 + i * 0.5, ...(timed ? { t: T0 + i * 5000 } : {}) }));
const route = (n = 200, meta = {}, lon = 2.35, timed = false) => N.makeRoute([line(n, 20, lon, timed)], { origin: 'imported', sport: 'running', ...meta });
/** A storage like localStorage that refuses anything beyond `limit` characters in total. */
function memory(limit = Infinity) {
    const map = new Map();
    const used = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
    return { map, getItem: k => (map.has(k) ? map.get(k) : null), removeItem: k => { map.delete(k); },
        setItem: (k, v) => { const before = map.get(k); map.delete(k); if (used() + k.length + String(v).length > limit) { if (before !== undefined) map.set(k, before); throw Object.assign(Error('QuotaExceededError'), { name: 'QuotaExceededError' }); } map.set(k, String(v)); } };
}

test('missing(): only « the server does not know this function » is a reason to fall back', () => {
    assert.equal(R.missing({ code: 'PGRST202', message: 'Could not find the function public.titan_routes_v2(p_limit) in the schema cache' }), true);
    assert.equal(R.missing({ status: 404, message: 'Not Found' }), true);
    assert.equal(R.missing({ code: '42883', message: 'function public.titan_route_rename_v1(uuid, text) does not exist' }), true);
    assert.equal(R.missing({ message: 'Could not find the function public.titan_places_v1 in the schema cache' }), true);
    // A refusal by a function that exists is never « missing »: falling back there would hide a real error.
    assert.equal(R.missing({ code: '22023', status: 400, message: 'ROUTE_LIMIT' }), false);
    assert.equal(R.missing({ code: '42501', status: 401, message: 'AUTH_REQUIRED' }), false);
    assert.equal(R.missing({ message: 'TypeError: Failed to fetch', status: 0 }), false);
    assert.equal(R.missing(null), false);
    assert.equal(R.unreachable({ message: 'TypeError: Failed to fetch', code: '' }), true);
    assert.equal(R.unreachable({ code: '22023', message: 'ROUTE_LIMIT' }), false);
});

test('a v1 row reads like a v2 row: recorded, unnamed, without summary — unless this browser kept its name', () => {
    const v1 = { id: 'r1', sport: 'running', startedAt: '2026-11-20T08:00:00+00:00', distanceM: 4000, durationS: 1200, ascentM: null, points: 200, eventId: null };
    const plain = R.normalize(v1, {});
    assert.deepEqual({ name: plain.name, origin: plain.origin, summary: plain.summary, nameLocal: plain.nameLocal, ascentM: plain.ascentM }, { name: '', origin: 'recorded', summary: null, nameLocal: false, ascentM: null });
    const kept = R.normalize(v1, { r1: { name: '  Tour   du lac ', origin: 'imported' } });
    assert.deepEqual({ name: kept.name, origin: kept.origin, nameLocal: kept.nameLocal }, { name: 'Tour du lac', origin: 'imported', nameLocal: true });
    // A v2 row is the reference: its own name and origin win over what the browser kept.
    const summary = { v: 1, elapsedS: 1500, movingS: 1200, stoppedS: 300, pausedS: 0, missingS: 0, distanceM: 4010 };
    const v2 = R.normalize({ ...v1, name: 'Canal', origin: 'planned', summary, track: { v: 1, t0: 0, segs: [] } }, { r1: { name: 'Autre', origin: 'imported' } });
    assert.deepEqual({ name: v2.name, origin: v2.origin, nameLocal: v2.nameLocal }, { name: 'Canal', origin: 'planned', nameLocal: false });
    assert.equal(v2.summary.movingS, 1200);
    assert.ok(v2.track);
    assert.equal(R.normalize({ ...v1, origin: 'stolen', summary: [1, 2] }, {}).origin, 'recorded');
    assert.equal(R.normalize({ ...v1, summary: { movingS: 0 } }, {}).summary, null);
    assert.equal(R.normalize(null), null);
    assert.equal(R.normalize({ sport: 'running' }), null);
});

test('the arguments of a save: v2 carries name, origin and summary; v1 is the same save without them', () => {
    const r = route(300, { name: 'Boucle du bois' });
    const spec = R.saveArgs(r, { origin: 'imported', sport: 'running', name: '  Boucle   du bois ', now: NOW });
    assert.equal(spec.ok, true);
    assert.deepEqual(Object.keys(spec.v2).sort(), ['p_ascent_m', 'p_client_route_id', 'p_distance_m', 'p_duration_s', 'p_name', 'p_origin', 'p_sport', 'p_started_at', 'p_summary', 'p_track']);
    assert.deepEqual(R.v1Args(spec.v2), spec.v1);
    assert.deepEqual(Object.keys(spec.v1).sort(), ['p_ascent_m', 'p_client_route_id', 'p_distance_m', 'p_duration_s', 'p_sport', 'p_started_at', 'p_track']);
    assert.equal(spec.v2.p_name, 'Boucle du bois');
    assert.equal(spec.v2.p_origin, 'imported');
    assert.equal(spec.v2.p_summary, null);
    assert.equal(spec.v2.p_duration_s, 0, 'a file to follow carries no effort');
    assert.equal(spec.v2.p_distance_m, r.distanceM);
    assert.equal(spec.v2.p_started_at, new Date(NOW).toISOString(), 'an undated line enters the library today');
    assert.match(spec.clientRouteId, /^[A-Za-z0-9_.:-]{8,64}$/);
    assert.equal(spec.v2.p_track.v, 1);
    assert.equal(spec.v2.p_track.segs[0].length, 300);
    assert.ok(spec.v2.p_track.segs[0].every(p => p.length === 4 && p[2] === 0), 'no time in an untimed line');
    assert.equal(spec.meta.origin, 'imported');
    // The server keeps 3,000 points and 200 stretches: a long file is thinned, a file in 201 pieces is refused in words.
    const long = R.saveArgs(N.makeRoute([Array.from({ length: 9000 }, (_, i) => ({ lat: 48 + i * 0.0002, lon: 2 + Math.sin(i / 40) * 0.01, ele: null }))], {}), { origin: 'imported', sport: 'cycling', now: NOW });
    assert.equal(long.ok, true);
    assert.ok(long.v2.p_track.segs[0].length <= N.MAX_ROUTE_POINTS);
    const pieces = N.makeRoute(Array.from({ length: 201 }, (_, s) => [{ lat: 48 + s * 0.01, lon: 2 }, { lat: 48 + s * 0.01 + 0.001, lon: 2 }]), {});
    assert.match(R.saveArgs(pieces, { origin: 'imported', sport: 'hiking', now: NOW }).error, /200/);
    assert.match(R.saveArgs(r, { origin: 'imported', now: NOW }).error, /sport/i);
    assert.equal(R.saveArgs(null, { sport: 'running' }).ok, false);
    // A file older than the 400 days the server accepts is dated at its import; a recent one keeps its own start.
    const old = N.makeRoute([line(50).map((p, i) => ({ ...p, t: Date.UTC(2019, 4, 1) + i * 5000 }))], {});
    assert.equal(R.saveArgs(old, { origin: 'imported', sport: 'running', now: NOW }).v2.p_started_at, new Date(NOW).toISOString());
    const recent = N.makeRoute([line(50, 20, 2.35, true)], {});
    assert.equal(R.saveArgs(recent, { origin: 'imported', sport: 'running', now: NOW }).v2.p_started_at, new Date(T0).toISOString());
});

test('a recording is saved with the engine digest, and its client route id comes from its start: a retry never duplicates', () => {
    const fixes = line(240, 12, 2.35, true).map(p => ({ lat: p.lat, lon: p.lon, alt: p.ele, t: p.t, acc: 5 }));
    const rec = { sport: 'running', startedAt: T0, endedAt: T0 + 240 * 5000, segs: [fixes] };
    const a = E.analyse(rec);
    const r = N.fromFixes(rec.segs, { sport: 'running' });
    const options = { origin: 'recorded', sport: 'running', startedAt: T0, distanceM: a.distanceM, durationS: a.effortS, ascentM: a.ascentM, summary: E.digest(a), now: NOW };
    const one = R.saveArgs(r, options), two = R.saveArgs(r, { ...options, name: 'Sortie du jeudi', now: NOW + 3600000 });
    assert.equal(one.clientRouteId, two.clientRouteId, 'same recording, same id — whatever the name or the hour of the retry');
    assert.equal(one.clientRouteId, R.clientRouteId('recorded', T0, 'running'));
    assert.match(one.clientRouteId, /^rec-[a-z0-9]+-running$/);
    assert.notEqual(R.clientRouteId('recorded', T0 + 1000, 'running'), one.clientRouteId);
    assert.equal(R.clientRouteId('recorded', NaN, 'running'), null);
    assert.equal(one.v2.p_origin, 'recorded');
    assert.equal(one.v2.p_summary.movingS, a.movingS);
    assert.equal(one.v2.p_summary.v, 1);
    assert.ok(Object.values(one.v2.p_summary).every(v => v === null || typeof v !== 'object'), 'the server accepts a flat summary only');
    assert.ok(JSON.stringify(one.v2.p_summary).length <= 2048);
    assert.equal(one.v2.p_started_at, new Date(T0).toISOString());
    assert.equal(one.v2.p_track.t0, T0);
    assert.equal(one.v2.p_track.segs[0][1][2], 5, 'seconds since the start');
    assert.equal(one.v2.p_duration_s, a.effortS);
    // A file and a planned line are named after their own shape: the same file twice is one route, another file is another.
    const same = R.saveArgs(route(100), { origin: 'imported', sport: 'running', name: 'A', now: NOW }), again = R.saveArgs(route(100), { origin: 'imported', sport: 'running', name: 'B', now: NOW + 5 });
    assert.equal(same.clientRouteId, again.clientRouteId);
    assert.notEqual(R.saveArgs(route(101), { origin: 'imported', sport: 'running', now: NOW }).clientRouteId, same.clientRouteId);
    assert.match(R.saveArgs(route(100), { origin: 'planned', sport: 'running', now: NOW }).clientRouteId, /^pln-[0-9a-f]{16}$/);
    assert.match(same.clientRouteId, /^imp-[0-9a-f]{16}$/);
});

test('offline copies: kept per owner, read back as a route to follow, removed on request', () => {
    const storage = memory(), store = R.offlineStore(storage, 'user-a');
    const r = route(120, { name: 'Tour' }), doc = N.encode(r);
    const put = store.put('r1', { name: 'Tour', sport: 'running', origin: 'imported', distanceM: r.distanceM, ascentM: r.ascentM }, doc, 1000);
    assert.equal(put.ok, true);
    assert.ok(put.meta.bytes > 1000);
    assert.deepEqual(store.list().map(m => [m.id, m.name, m.savedAt]), [['r1', 'Tour', 1000]]);
    assert.equal(store.bytes(), put.meta.bytes);
    const back = N.decode(store.get('r1').doc, { name: 'Tour', sport: 'running', origin: 'imported' });
    assert.equal(back.points, 120);
    assert.ok(Math.abs(back.distanceM - r.distanceM) <= 5);
    // Another account in the same browser sees nothing of it.
    assert.deepEqual(R.offlineStore(storage, 'user-b').list(), []);
    assert.equal(R.offlineStore(storage, 'user-b').get('r1'), null);
    assert.equal(store.patch('r1', { name: 'Tour du lac' }), true);
    assert.equal(store.list()[0].name, 'Tour du lac');
    assert.equal(store.patch('nope', { name: 'x' }), false);
    // Removed on purpose: the route is remembered as « no copy wanted » until a copy is asked again.
    assert.equal(store.remove('r1', true), true);
    assert.equal(store.get('r1'), null);
    assert.equal(store.declined('r1'), true);
    assert.equal(store.put('r1', { name: 'Tour' }, doc, 2000).ok, true);
    assert.equal(store.declined('r1'), false);
    assert.equal(storage.map.size, 2, 'one index and one route');
    // A corrupted index or item never throws.
    storage.setItem('titan.routes.offline.v1:user-a', '{oops');
    assert.deepEqual(store.list(), []);
});

test('offline copies: the least recently kept one leaves at the ceiling, and a full storage is an answer, not an exception', () => {
    const doc = N.encode(route(60));
    const few = R.offlineStore(memory(), 'u', 3);
    for (let i = 1; i <= 4; i++) assert.equal(few.put(`r${i}`, { name: `R${i}` }, doc, i * 1000).ok, true);
    assert.deepEqual(few.list().map(m => m.id), ['r4', 'r3', 'r2'], 'r1, the oldest, left');
    assert.equal(few.get('r1'), null);
    // A route waiting to be sent is never the one that leaves.
    const queue = R.offlineStore(memory(), 'u', 2);
    queue.put('local:a', { name: 'En attente', queued: true }, doc, 1000);
    queue.put('r2', { name: 'R2' }, doc, 2000);
    const third = queue.put('r3', { name: 'R3' }, doc, 3000);
    assert.deepEqual(third.evicted, ['r2']);
    assert.deepEqual(queue.list().map(m => m.id).sort(), ['local:a', 'r3']);
    // Quota: room is made by dropping the oldest copies (three at most); when that is not enough the answer says so.
    const size = JSON.stringify(doc).length;
    const tight = memory(size * 2 + 900), small = R.offlineStore(tight, 'u');
    assert.equal(small.put('r1', { name: 'R1' }, doc, 1000).ok, true);
    assert.equal(small.put('r2', { name: 'R2' }, doc, 2000).ok, true);
    const squeezed = small.put('r3', { name: 'R3' }, doc, 3000);
    assert.equal(squeezed.ok, true);
    assert.deepEqual(squeezed.evicted, ['r1']);
    const none = R.offlineStore(memory(200), 'u').put('r1', { name: 'R1' }, doc, 1000);
    assert.deepEqual(none, { ok: false, reason: 'quota' });
    const blocked = R.offlineStore(memory(size + 400), 'u');
    blocked.put('local:a', { name: 'En attente', queued: true }, doc, 1000);
    assert.deepEqual(blocked.put('r2', { name: 'R2' }, doc, 2000), { ok: false, reason: 'quota' }, 'nothing waiting to be sent is sacrificed');
    assert.ok(blocked.get('local:a'));
});

test('comparison candidates: recorded outings of the same family of sport within 10 % of the distance, newest first, 25 at most', () => {
    const row = (id, over = {}) => ({ id, sport: 'running', origin: 'recorded', distanceM: 10000, startedAt: `2026-11-${String(10 + Number(id.slice(1)) % 15).padStart(2, '0')}T08:00:00Z`, durationS: 3000, summary: null, ...over });
    const target = row('r0');
    const rows = [target, row('r1'), row('r2', { distanceM: 10900 }), row('r3', { distanceM: 11200 }), row('r4', { distanceM: 9050 }), row('r5', { distanceM: 8900 }),
        row('r6', { sport: 'trail' }), row('r7', { sport: 'cycling' }), row('r8', { origin: 'imported' }), row('r9', { origin: 'planned' }), row('r10', { distanceM: 0 })];
    const ids = R.candidates(target, rows).map(r => r.id);
    assert.deepEqual([...ids].sort(), ['r1', 'r2', 'r4', 'r6'].sort());
    assert.ok(!ids.includes('r0'), 'never the route itself');
    const dates = R.candidates(target, rows).map(r => r.startedAt);
    assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
    const many = Array.from({ length: 40 }, (_, i) => row(`r${i + 1}`));
    assert.equal(R.candidates(target, many).length, R.CANDIDATES_MAX);
    assert.equal(R.candidates(target, many, 5).length, 5);
    assert.deepEqual(R.candidates({ ...target, distanceM: 0 }, rows), []);
    // An imported line can be the reference: the recorded outings that match it are the candidates.
    assert.ok(R.candidates({ ...target, id: 'x', origin: 'imported' }, rows).some(r => r.id === 'r0'));
});

test('comparison: moving time ranks, an outing without summary is shown apart, « best » needs two comparable outings', () => {
    const sum = (movingS, over = {}) => ({ v: 1, elapsedS: movingS + 120, movingS, stoppedS: 120, pausedS: 0, missingS: 0, distanceM: 10000, ...over });
    const row = (id, summary, over = {}) => ({ id, sport: 'running', origin: 'recorded', distanceM: 10000, durationS: 3100, startedAt: '2026-11-20T08:00:00Z', summary, ...over });
    const target = row('a', sum(3000));
    const alone = R.comparison(target, [{ row: target, direction: 'same' }]);
    assert.equal(alone.best, null);
    assert.equal(alone.comparable.length, 1);
    assert.match(alone.note, /au moins deux sorties comparables/);
    const full = R.comparison(target, [{ row: target, direction: 'same' }, { row: row('b', sum(2800)), direction: 'same' }, { row: row('c', null), direction: 'same' },
        { row: row('d', sum(2700)), direction: 'reverse' }, { row: row('e', sum(2900, { missingS: 400 })), direction: 'same' }]);
    assert.deepEqual(full.comparable.map(e => e.id), ['b', 'a'], 'fastest moving time first');
    assert.equal(full.best.id, 'b');
    assert.deepEqual(full.approx.map(e => [e.id, e.activeS, e.exact]), [['c', 3100, false]], 'no summary: active time, stops included, never ranked');
    assert.deepEqual(full.excluded.map(e => e.id).sort(), ['d', 'e']);
    assert.match(full.excluded.find(e => e.id === 'd').reason, /autre sens/);
    assert.match(full.excluded.find(e => e.id === 'e').reason, /sans position/);
    assert.equal(full.criteria, N.SAME.text);
    // Two outings without summary never make a best time.
    assert.equal(R.comparison(row('x', null), [{ row: row('x', null), direction: 'same' }, { row: row('y', null), direction: 'same' }]).best, null);
});

test('the same route is found by its shape, a different one is not (what the comparison reads before ranking)', () => {
    const a = route(300), b = N.makeRoute([line(300).map(p => ({ ...p, lat: p.lat + 0.00003 }))], { sport: 'running' }), other = route(300, {}, 2.40);
    assert.equal(N.sameRoute(a, b).match, true);
    assert.equal(N.sameRoute(a, other).match, false);
});

test('hand-off to the outing page: the key is per owner and the payload is the route itself, 3,000 points at most', () => {
    assert.equal(R.followKey('00000000-0000-4000-8000-000000000a91'), 'titan.gps.follow.v1:00000000-0000-4000-8000-000000000a91');
    assert.equal(R.followKey('guest_abc123'), 'titan.gps.follow.v1:guest_abc123');
    const r = route(200, { name: 'Tour', sport: 'hiking' });
    const h = R.handoff(r, 'r1', 1234);
    assert.deepEqual(Object.keys(h).sort(), ['at', 'id', 'route']);
    assert.equal(h.id, 'r1');
    assert.equal(h.at, 1234);
    assert.deepEqual({ v: h.route.v, name: h.route.name, sport: h.route.sport, origin: h.route.origin, points: h.route.points, distanceM: h.route.distanceM }, { v: 1, name: 'Tour', sport: 'hiking', origin: 'imported', points: 200, distanceM: r.distanceM });
    assert.equal(R.handoff(r, null, 5).id, null, 'a route followed without being saved has no id');
    assert.equal(R.handoff(r, undefined, 5).id, null);
    const big = N.makeRoute([Array.from({ length: 8000 }, (_, i) => ({ lat: 48 + i * 0.0002, lon: 2 + Math.sin(i / 30) * 0.01 }))], {});
    const fitted = R.handoff(big, null, 1).route;
    assert.ok(fitted.points <= N.MAX_ROUTE_POINTS && fitted.points === fitted.segs.reduce((n, s) => n + s.length, 0));
    assert.ok(Number.isFinite(JSON.parse(JSON.stringify(h)).route.segs[0][0].lat), 'it survives localStorage');
    // The outing page can follow it as it is.
    const c = N.course(JSON.parse(JSON.stringify(h)).route);
    assert.ok(Math.abs(c.totalM - r.distanceM) <= 2);
});

test('an imported GPX goes all the way: read, previewed facts, saved arguments', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="t"><trk><name>Tour &amp; détour</name><trkseg>${line(150, 30, 2.35, false).map(p => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"/>`).join('')}</trkseg></trk></gpx>`;
    const read = N.importGpx(gpx, G);
    assert.equal(read.ok, true);
    assert.equal(read.route.name, 'Tour & détour');
    assert.equal(read.route.ascentM, null, 'no altitude in the file: no climb is shown');
    assert.equal(read.facts.points, 150);
    const spec = R.saveArgs(read.route, { origin: 'imported', sport: 'hiking', name: read.route.name, now: NOW });
    assert.equal(spec.v2.p_ascent_m, null);
    assert.equal(spec.v2.p_name, 'Tour & détour');
    assert.equal(N.importGpx('<gpx><trk><trkseg></trkseg></trk></gpx>', G).ok, false);
    assert.match(N.importGpx('pas du xml', G).error, /incomplet|pris en charge/);
});

test('server refusals are said in words, never as a code', () => {
    assert.match(R.saveError('ROUTE_LIMIT'), /200 parcours/);
    assert.match(R.saveError('SPORT_UNKNOWN'), /sport/);
    assert.match(R.saveError('TRACK_TOO_LARGE'), /trace/);
    assert.match(R.saveError('anything else'), /Réessaie/);
    assert.ok(!/[A-Z]{4,}_/.test(R.saveError('BAD_TRACK')));
    assert.equal(R.cleanName('  a\u0007b \n c  '), 'a b c');
    assert.equal(R.cleanName('x'.repeat(200)).length, 80);
});
