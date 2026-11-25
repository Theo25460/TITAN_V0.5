// V1.7.7 — personal points on the web, tested without a browser: the local-first list (add, edit, delete, tombstones), the merge of
// two devices through a server that behaves like the migration's functions, the server that does not know the functions yet, and
// what « Points utiles » sends and reads (never « ouvert », always a source and a date).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const N = require('../js/core/gps-nav.js');
const P = require('../js/app/lieux.js');

function memory(limit = Infinity) {
    const map = new Map();
    return { map, getItem: k => (map.has(k) ? map.get(k) : null), removeItem: k => { map.delete(k); },
        setItem: (k, v) => { if (String(v).length > limit) throw Error('QuotaExceededError'); map.set(k, String(v)); } };
}
/** A clock the tests move by hand: every device and the server read the same one, so « latest change wins » is exact. */
function world() {
    let now = 1_000_000;
    const rows = new Map(); // server rows by client id
    let serial = 0;
    const calls = [];
    const rpc = async (fn, args) => {
        calls.push({ fn, args });
        if (fn === 'titan_places_v1') return { data: [...rows.values()].map(r => ({ ...r })) };
        if (fn === 'titan_place_save_v1') {
            const cur = rows.get(args.p_client_place_id);
            const row = { id: cur ? cur.id : `srv-${++serial}`, clientPlaceId: args.p_client_place_id, name: args.p_name, kind: args.p_kind, lat: args.p_lat, lon: args.p_lon, note: args.p_note, updatedAt: new Date(now).toISOString() };
            rows.set(args.p_client_place_id, row);
            return { data: { id: row.id, created: !cur } };
        }
        if (fn === 'titan_place_delete_v1') { for (const [k, r] of rows) if (r.id === args.p_id) { rows.delete(k); return { data: true }; } return { data: false }; }
        return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` }, status: 404 };
    };
    const device = (owner = 'user-a') => { const storage = memory(); return { storage, store: P.placeStore(storage, owner, () => now) }; };
    return { rows, calls, rpc, device, tick: (ms = 1000) => { now += ms; return now; }, get now() { return now; } };
}
const fountain = { name: 'Fontaine du parc', kind: 'water', lat: 48.58392, lon: 7.74553, note: 'Coupée en hiver' };

test('typed coordinates: « 48.5839, 7.7455 » and its usual variants, nothing else', () => {
    assert.deepEqual(P.parseCoords('48.5839, 7.7455'), { lat: 48.5839, lon: 7.7455 });
    assert.deepEqual(P.parseCoords(' 48,5839 ; 7,7455 '), { lat: 48.5839, lon: 7.7455 });
    assert.deepEqual(P.parseCoords('48.5839 7.7455'), { lat: 48.5839, lon: 7.7455 });
    assert.deepEqual(P.parseCoords('-33.8568,151.2153'), { lat: -33.8568, lon: 151.2153 });
    assert.deepEqual(P.parseCoords('48,5839, 7,7455'), { lat: 48.5839, lon: 7.7455 });
    for (const bad of ['', 'Strasbourg', '48.5839', '91, 7', '48, 181', '0, 0', '48.5 7.7 3', '1 rue de la Paix', null, undefined]) assert.equal(P.parseCoords(bad), null, String(bad));
    assert.equal(P.coordsText({ lat: 48.5839, lon: 7.7455 }), '48.58390, 7.74550');
});

test('local first: a point exists as soon as it is added, edited and deleted without any server', () => {
    const w = world(), { store } = w.device();
    const p = store.add(fountain);
    assert.match(p.id, /^[A-Za-z0-9_.:-]{8,64}$/, 'the id the server accepts as client place id');
    assert.deepEqual({ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, note: p.note, dirty: p.dirty, updatedAt: p.updatedAt }, { ...fountain, dirty: true, updatedAt: w.now });
    assert.deepEqual(store.list().map(x => x.name), ['Fontaine du parc']);
    w.tick();
    const edited = store.update(p.id, { name: '  Fontaine   du   parc (nord) ', kind: 'nonsense' });
    assert.equal(edited.name, 'Fontaine du parc (nord)');
    assert.equal(edited.kind, 'other', 'an unknown kind is « Autre », never an invented one');
    assert.equal(edited.lat, fountain.lat, 'an edit that does not move the point keeps its position');
    assert.ok(edited.updatedAt > p.updatedAt && edited.dirty);
    assert.equal(store.update('nope', { name: 'x' }), null);
    // Never seen by the server: the deletion leaves nothing behind.
    assert.equal(store.remove(p.id), true);
    assert.deepEqual(store.raw(), []);
    assert.equal(store.remove(p.id), false);
    // Refusals are named, and nothing is written.
    assert.throws(() => store.add({ ...fountain, name: '   ' }), /PLACE_NAME/);
    assert.throws(() => store.add({ ...fountain, lat: 91 }), /PLACE_POSITION/);
    assert.throws(() => store.add({ ...fountain, lon: null }), /PLACE_POSITION/);
    assert.deepEqual(store.raw(), []);
    assert.equal(P.clean({ ...fountain, name: 'n'.repeat(100), note: 'x'.repeat(400) }).name.length, 60);
    assert.equal(P.clean({ ...fountain, note: 'x'.repeat(400) }).note.length, 200);
    // One list per account in the same browser.
    const storage = memory(), a = P.placeStore(storage, 'user-a'), b = P.placeStore(storage, 'guest_abc');
    a.add(fountain);
    assert.equal(b.list().length, 0);
    assert.equal(P.keyOf('user-a'), 'titan.places.v1:user-a');
    // A storage that refuses the write says so instead of pretending.
    assert.throws(() => P.placeStore(memory(10), 'u').add(fountain), /PLACE_STORAGE/);
    const full = P.placeStore(memory(), 'u');
    full.write(Array.from({ length: P.MAX_PLACES }, (_, i) => ({ id: `pl-seed-${i}`, ...fountain, updatedAt: 1 })));
    assert.throws(() => full.add(fountain), /PLACE_LIMIT/);
});

test('synchronisation: what is waiting is sent once, and a second run sends nothing', async () => {
    const w = world(), { store } = w.device();
    const p = store.add(fountain);
    const first = await P.syncWith(store, w.rpc);
    assert.deepEqual(first, { state: 'synced', pushed: 1, deleted: 0 });
    assert.deepEqual(w.calls.map(c => c.fn), ['titan_places_v1', 'titan_place_save_v1']);
    assert.deepEqual(w.calls[1].args, { p_client_place_id: p.id, p_name: fountain.name, p_kind: 'water', p_lat: fountain.lat, p_lon: fountain.lon, p_note: fountain.note });
    const kept = store.raw()[0];
    assert.equal(kept.serverId, 'srv-1');
    assert.ok(!('dirty' in kept) && !('deleted' in kept));
    w.calls.length = 0;
    assert.deepEqual(await P.syncWith(store, w.rpc), { state: 'synced', pushed: 0, deleted: 0 });
    assert.deepEqual(w.calls.map(c => c.fn), ['titan_places_v1'], 'nothing waiting: one read, no write');
});

test('two devices adding different points keep both', async () => {
    const w = world(), A = w.device(), B = w.device();
    A.store.add(fountain);
    w.tick();
    B.store.add({ name: 'Abri du col', kind: 'shelter', lat: 48.1, lon: 7.1 });
    await P.syncWith(A.store, w.rpc);
    await P.syncWith(B.store, w.rpc);
    await P.syncWith(A.store, w.rpc);
    const names = s => s.list().map(p => p.name);
    assert.deepEqual(names(A.store), ['Abri du col', 'Fontaine du parc']);
    assert.deepEqual(names(B.store), ['Abri du col', 'Fontaine du parc']);
    assert.equal(w.rows.size, 2);
    assert.ok(A.store.raw().every(p => p.serverId && !p.dirty));
    // The point B received keeps the id A gave it: an edit from B updates the same server row, it does not make a third point.
    assert.deepEqual(A.store.raw().map(p => p.id).sort(), B.store.raw().map(p => p.id).sort());
});

test('the same point changed on two devices: the latest change wins on both', async () => {
    const w = world(), A = w.device(), B = w.device();
    const p = A.store.add(fountain);
    await P.syncWith(A.store, w.rpc);
    await P.syncWith(B.store, w.rpc);
    w.tick(60000);
    A.store.update(p.id, { note: 'Vue depuis A (plus ancien)' });
    w.tick(60000);
    B.store.update(p.id, { note: 'Vue depuis B (plus récent)' });
    // B, the latest, synchronises first; A's older change must not overwrite it afterwards.
    await P.syncWith(B.store, w.rpc);
    w.tick();
    const a = await P.syncWith(A.store, w.rpc);
    assert.equal(a.pushed, 0, 'the older change is not sent over the newer one');
    assert.equal(A.store.list()[0].note, 'Vue depuis B (plus récent)');
    assert.equal(B.store.list()[0].note, 'Vue depuis B (plus récent)');
    assert.equal([...w.rows.values()][0].note, 'Vue depuis B (plus récent)');
    // And the other way round: a change made after the server's version is sent.
    w.tick(60000);
    A.store.update(p.id, { name: 'Fontaine (réparée)' });
    await P.syncWith(A.store, w.rpc);
    await P.syncWith(B.store, w.rpc);
    assert.equal(B.store.list()[0].name, 'Fontaine (réparée)');
    assert.equal(w.rows.size, 1);
});

test('tombstones: a deleted point stays until the server confirms, then leaves every device', async () => {
    const w = world(), A = w.device(), B = w.device();
    const p = A.store.add(fountain);
    await P.syncWith(A.store, w.rpc);
    await P.syncWith(B.store, w.rpc);
    w.tick();
    assert.equal(A.store.remove(p.id), true);
    assert.deepEqual(A.store.list(), [], 'gone from the list at once');
    assert.deepEqual(A.store.raw().map(x => [x.deleted, x.dirty, x.serverId]), [[true, true, 'srv-1']], 'kept as a tombstone');
    // The server is unreachable: the tombstone waits.
    const down = await P.syncWith(A.store, async fn => (fn === 'titan_places_v1' ? w.rpc(fn, {}) : { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 }));
    assert.equal(down.state, 'error');
    assert.equal(A.store.raw().length, 1);
    assert.equal(w.rows.size, 1);
    const done = await P.syncWith(A.store, w.rpc);
    assert.deepEqual(done, { state: 'synced', pushed: 0, deleted: 1 });
    assert.deepEqual(A.store.raw(), []);
    assert.equal(w.rows.size, 0);
    assert.ok(w.calls.some(c => c.fn === 'titan_place_delete_v1' && c.args.p_id === 'srv-1'));
    await P.syncWith(B.store, w.rpc);
    assert.deepEqual(B.store.raw(), [], 'deleted elsewhere: it leaves this device too');
    // A point changed on B AFTER A deleted it comes back on A: the change is the latest word.
    const q = A.store.add({ ...fountain, name: 'Robinet' });
    await P.syncWith(A.store, w.rpc);
    await P.syncWith(B.store, w.rpc);
    w.tick(1000);
    A.store.remove(q.id);
    w.tick(1000);
    B.store.update(q.id, { note: 'Toujours là' });
    await P.syncWith(B.store, w.rpc);
    await P.syncWith(A.store, w.rpc);
    assert.deepEqual(A.store.list().map(x => x.note), ['Toujours là']);
});

test('a server without the functions: the points stay here, marked as waiting, and nothing is lost', async () => {
    const w = world(), { store } = w.device();
    store.add(fountain);
    const old = async fn => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` }, status: 404 });
    assert.deepEqual(await P.syncWith(store, old), { state: 'local-only', pushed: 0, deleted: 0 });
    assert.deepEqual(store.raw().map(p => [p.name, p.dirty]), [['Fontaine du parc', true]]);
    // A real failure is not mistaken for a missing function, and a thrown error never escapes.
    assert.equal((await P.syncWith(store, async () => ({ data: null, error: { code: '42501', message: 'AUTH_REQUIRED' }, status: 401 }))).state, 'error');
    assert.equal((await P.syncWith(store, async () => { throw Error('boom'); })).state, 'error');
    assert.equal(store.raw().length, 1);
    // The day the migration is applied, the same list goes up.
    assert.deepEqual(await P.syncWith(store, w.rpc), { state: 'synced', pushed: 1, deleted: 0 });
    assert.equal(P.missing({ code: 'PGRST202' }), true);
    assert.equal(P.missing({ code: '22023', message: 'PLACE_LIMIT' }), false);
});

test('a point changed while a synchronisation runs is not overwritten by its answer', async () => {
    const w = world(), { store } = w.device();
    const p = store.add(fountain);
    const slow = async (fn, args) => {
        const r = await w.rpc(fn, args);
        if (fn === 'titan_place_save_v1') { w.tick(); store.update(p.id, { note: 'Modifié pendant l’envoi' }); store.add({ name: 'Ajouté pendant l’envoi', kind: 'food', lat: 48.2, lon: 7.2 }); }
        return r;
    };
    await P.syncWith(store, slow);
    const rows = store.raw();
    assert.equal(rows.length, 2);
    const first = rows.find(x => x.id === p.id);
    assert.deepEqual([first.note, first.dirty, first.serverId], ['Modifié pendant l’envoi', true, 'srv-1'], 'still waiting, already known to the server');
    assert.equal(rows.find(x => x.id !== p.id).dirty, true);
    await P.syncWith(store, w.rpc);
    assert.ok(store.raw().every(x => !x.dirty));
    assert.equal(w.rows.size, 2);
});

test('Points utiles: the request is what the function accepts, and a route is thinned to 60 positions', () => {
    const around = P.poiRequest({ kinds: ['water', 'toilets', 'water', 'casino'], mode: 'around', center: { lat: 48.583921, lon: 7.745531 }, radiusM: 1000 });
    assert.deepEqual(around, { ok: true, body: { kinds: ['water', 'toilets'], around: { lat: 48.58392, lon: 7.74553, radiusM: 1000 } } });
    assert.equal(P.poiRequest({ kinds: ['water'], mode: 'around', center: { lat: 48, lon: 7 }, radiusM: 90000 }).body.around.radiusM, 5000);
    assert.equal(P.poiRequest({ kinds: [], mode: 'around', center: { lat: 48, lon: 7 }, radiusM: 500 }).ok, false);
    assert.equal(P.poiRequest({ kinds: ['water'], mode: 'around', radiusM: 500 }).ok, false);
    const route = N.makeRoute([Array.from({ length: 2500 }, (_, i) => ({ lat: 48 + i * 0.0003, lon: 7 + Math.sin(i / 25) * 0.02 }))], {});
    const along = P.poiRequest({ kinds: ['bike_repair'], mode: 'along', route, radiusM: 2000 });
    assert.equal(along.ok, true);
    assert.ok(along.body.along.points.length >= 2 && along.body.along.points.length <= 60);
    assert.equal(along.body.along.radiusM, 500, 'the function accepts 500 m at most along a route');
    assert.deepEqual(along.body.along.points[0], [48, 7]);
    assert.ok(along.body.along.points.every(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])));
    assert.equal(P.poiRequest({ kinds: ['water'], mode: 'along', route: null, radiusM: 300 }).ok, false);
    assert.equal(P.thin(N.makeRoute([[{ lat: 48, lon: 7 }, { lat: 48.01, lon: 7 }]], {})).length, 2);
});

test('Points utiles: every answer becomes one honest state', () => {
    const ok = { ok: true, source: 'OpenStreetMap', license: 'ODbL', attribution: '© les contributeurs d’OpenStreetMap', fetchedAt: '2026-11-25T09:41:00Z', truncated: false, pois: [
        { id: 'node/1', kind: 'water', lat: 48.5841, lon: 7.7461, name: null, openingHours: null, fee: null, access: null, osmUpdatedAt: '2024-06-02T10:00:00Z' },
        { id: 'node/2', kind: 'bike_repair', lat: 48.59, lon: 7.75, name: 'Atelier <b>Vélo</b>', openingHours: 'Mo-Fr 09:00-18:00', fee: 'no', access: 'customers', osmUpdatedAt: null },
        { id: 'node/3', kind: 'water', lat: 'x', lon: 7 }, { id: 'node/4', kind: 'spaceport', lat: 48.6, lon: 7.7 }] };
    const read = P.readPoi(200, ok);
    assert.equal(read.state, 'ok');
    assert.equal(read.pois.length, 3, 'a point without a position is dropped');
    assert.equal(read.pois[2].kind, 'other');
    assert.equal(read.pois[1].name, 'Atelier <b>Vélo</b>', 'kept as text: the screen escapes it');
    assert.equal(P.readPoi(200, { ...ok, pois: [] }).state, 'empty');
    assert.equal(P.readPoi(503, { ok: false, code: 'POI_NOT_CONFIGURED' }).state, 'not_configured');
    assert.equal(P.readPoi(404, null).state, 'not_configured', 'the function is not deployed');
    assert.equal(P.readPoi(401, { ok: false, code: 'AUTH_REQUIRED' }).state, 'auth');
    assert.equal(P.readPoi(429, { ok: false, code: 'RATE_LIMITED' }).state, 'rate');
    assert.equal(P.readPoi(503, { ok: false, code: 'QUOTA_EXCEEDED' }).state, 'quota');
    assert.equal(P.readPoi(400, { ok: false, code: 'BAD_REQUEST' }).state, 'bad');
    for (const [status, json] of [[502, { ok: false, code: 'UPSTREAM_UNAVAILABLE' }], [503, { ok: false, code: 'SERVICE_UNAVAILABLE' }], [200, null], [200, { ok: true }], [200, { hello: 1 }], [500, 'oops']]) assert.equal(P.readPoi(status, json).state, 'unavailable');
    for (const state of ['not_configured', 'offline', 'auth', 'guest', 'rate', 'quota', 'bad', 'unavailable', 'empty']) assert.ok(P.POI_MESSAGES[state].length > 30, state);
    assert.match(P.POI_MESSAGES.not_configured, /V177_CARTES_ET_ROUTAGE/);
});

test('Points utiles: source, freshness and hours are quoted, never interpreted', () => {
    const at = new Date(2026, 10, 25, 9, 41).getTime();
    assert.equal(P.sourceLine({ source: 'OpenStreetMap', license: 'ODbL', fetchedAt: new Date(at).toISOString() }), 'Source : OpenStreetMap (ODbL), relevé du 25/11 à 09:41');
    assert.equal(P.sourceLine({ source: null, license: null, fetchedAt: null }, at), 'Source : OpenStreetMap (ODbL), relevé du 25/11 à 09:41', 'the time this browser read it, when the function gives none');
    assert.equal(P.freshness('2024-06-02T10:00:00Z'), 'fiche modifiée en 2024');
    assert.equal(P.freshness(null), 'fraîcheur inconnue');
    assert.equal(P.freshness('pas une date'), 'fraîcheur inconnue');
    assert.equal(P.hoursText('Mo-Fr 09:00-18:00'), 'Horaires indiqués : Mo-Fr 09:00-18:00 (non vérifiés)');
    assert.equal(P.hoursText(null), '');
    assert.equal(P.feeText('yes'), 'Indiqué payant (non vérifié)');
    assert.equal(P.accessText('customers'), 'Accès indiqué : customers (non vérifié)');
    assert.equal(P.accessText('yes'), '');
    const words = [P.hoursText('24/7'), P.feeText('no'), P.accessText('private'), P.freshness('2025-01-01T00:00:00Z'), ...Object.values(P.POI_MESSAGES)].join(' ');
    assert.ok(!/\bouvert\b/i.test(words), 'TITAN never says a place is open');
});

test('Points utiles: nearest first around a position, in the order met along a route', () => {
    const center = { lat: 48.58, lon: 7.74 };
    const pois = [{ id: 'far', kind: 'water', lat: 48.59, lon: 7.74 }, { id: 'near', kind: 'water', lat: 48.5805, lon: 7.74 }];
    const around = P.arrange(pois, { mode: 'around', center, radiusM: 2000 });
    assert.deepEqual(around.map(p => p.id), ['near', 'far']);
    assert.match(around[0].where, /^à \d+ m$/);
    assert.match(around[1].where, /^à 1,1 km$/);
    const route = N.makeRoute([Array.from({ length: 200 }, (_, i) => ({ lat: 48 + i * 0.0005, lon: 7 }))], {});
    const along = P.arrange([{ id: 'late', kind: 'toilets', lat: 48.08, lon: 7.001 }, { id: 'early', kind: 'water', lat: 48.01, lon: 7.0005 }, { id: 'off', kind: 'water', lat: 48.05, lon: 7.2 }], { mode: 'along', route, radiusM: 300 });
    assert.deepEqual(along.map(p => p.id), ['early', 'late'], 'ordered by kilometre, a point far from the line is left out');
    assert.match(along[0].where, /^km 1,1 du parcours · à \d+ m du tracé$/);
});

test('the file sends no analytics event and talks only to its own function', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../js/app/lieux.js', import.meta.url), 'utf8');
    assert.ok(!/https?:\/\//.test(src), 'no external address');
    assert.deepEqual([...src.matchAll(/fetch\(\s*"([^"]+)"/g)].map(m => m[1]), ['/.netlify/functions/poi-nearby']);
    assert.ok(!/titanTrack|gtag\(|sendBeacon|TitanAnalytics/.test(src));
    assert.deepEqual([...new Set([...src.matchAll(/"(titan_[a-z_]+_v\d)"/g)].map(m => m[1]))].sort(), ['titan_place_delete_v1', 'titan_place_save_v1', 'titan_places_v1']);
});
