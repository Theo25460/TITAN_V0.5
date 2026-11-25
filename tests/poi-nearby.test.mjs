import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import handler, { KINDS, buildQuery, buildRequest, normalise, validInput } from '../functions/poi-nearby.mjs';

const USER = '00000000-0000-4000-8000-000000000177';
const TOKEN = 'fake-token-used-only-in-tests';
const ENDPOINT = 'https://overpass.example.test/api/interpreter';
const ENV = { SUPABASE_URL: 'https://database.example.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', POI_OVERPASS_URL: ENDPOINT };
const AROUND = { kinds: ['water', 'toilets'], around: { lat: 45.19321, lon: 6.43105, radiusM: 2000 } };
const ALONG = { kinds: ['bike_repair'], along: { points: [[45.19321, 6.43105], [45.2, 6.5], [45.25, 6.55]], radiusM: 300 } };
const QUOTA = '/rest/v1/rpc/titan_poi_quota_v1';

// An answer of the recorded Overpass shape (out:json, « out meta center »): a node, a way with its centre, contributors' metadata.
const answer = (elements = ELEMENTS, extra = {}) => ({
    version: 0.6, generator: 'Overpass API 0.7.62', osm3s: { timestamp_osm_base: '2026-11-25T08:12:44Z', copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.' },
    elements, ...extra
});
const ELEMENTS = [
    { type: 'way', id: 2002, center: { lat: 45.2, lon: 6.44 }, nodes: [1, 2, 3, 1], timestamp: '2025-06-01T10:00:00Z', version: 2, changeset: 9, user: 'mapper-b', uid: 22,
        tags: { amenity: 'toilets', fee: 'no', access: 'customers', opening_hours: 'Mo-Su 08:00-20:00; PH off', wheelchair: 'yes' } },
    { type: 'node', id: 1001, lat: 45.1934, lon: 6.4312, timestamp: '2024-03-02T07:30:00Z', version: 4, changeset: 8, user: 'mapper-a', uid: 11,
        tags: { amenity: 'drinking_water', name: 'Fontaine  du\tvillage', seasonal: 'summer' } },
    { type: 'node', id: 1003, lat: 45.195, lon: 6.433, timestamp: 'yesterday', tags: { natural: 'spring', drinking_water: 'yes', name: '<script>alert(1)</script>' } }
];

function request(body = AROUND, headers = {}) {
    return new Request('https://titan.example.test/functions/poi-nearby', {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    });
}
const json = (body, status = 200) => Response.json(body, { status });
async function runtime(callback, { env = {}, responses = {}, user = {}, upstream = () => json(answer()) } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch;
    const calls = [];
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    globalThis.fetch = async (url, init) => {
        const { pathname, host } = new URL(url);
        calls.push({ url, path: pathname, host, init });
        if (Object.hasOwn(responses, pathname)) return typeof responses[pathname] === 'function' ? responses[pathname](init) : responses[pathname];
        if (pathname === '/auth/v1/user') return json({ id: USER, is_anonymous: false, email: 'verified@example.test', ...user });
        if (pathname === QUOTA) return json(true);
        if (host !== 'database.example.test') return upstream(init, url);
        throw Error('Unexpected network call');
    };
    try { return await callback(calls); }
    finally { globalThis.fetch = previousFetch; if (previousNetlify === undefined) delete globalThis.Netlify; else globalThis.Netlify = previousNetlify; }
}
const outside = calls => calls.filter(c => c.host !== 'database.example.test');
const sentQuery = call => new URLSearchParams(call.init.body).get('data');

test('poi-nearby: without an owner-chosen https instance the function answers POI_NOT_CONFIGURED and calls nothing', async () => {
    for (const env of [{ POI_OVERPASS_URL: '' }, { POI_OVERPASS_URL: 'http://overpass.example.test/api/interpreter' }, { POI_OVERPASS_URL: 'https://user:pw@overpass.example.test/api/interpreter' },
        { POI_OVERPASS_URL: 'https://overpass.example.test/api/interpreter?data=out' }, { POI_OVERPASS_URL: 'overpass.example.test' }, { SUPABASE_URL: '' }, { SUPABASE_PUBLISHABLE_KEY: '' }]) {
        await runtime(async calls => {
            for (const headers of [{}, { Authorization: '' }]) {
                const response = await handler(request(AROUND, headers));
                assert.equal(response.status, 503); assert.deepEqual(await response.json(), { ok: false, code: 'POI_NOT_CONFIGURED' });
            }
            assert.equal(calls.length, 0);
        }, { env });
    }
    // No instance is built into the code: the only address ever called is the configured one.
    const source = await readFile(new URL('../functions/poi-nearby.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ''), /overpass-api\.de|kumi\.systems|private\.coffee/);
});
test('poi-nearby: method, content type, origin and bearer are checked before any network call', async () => runtime(async calls => {
    assert.equal((await handler(new Request('https://titan.example.test/functions/poi-nearby'))).status, 405);
    assert.equal((await handler(request(AROUND, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await handler(request(AROUND, { origin: 'https://attacker.test' }))).status, 403);
    for (const Authorization of ['', 'Basic abc', 'Bearer short']) {
        const response = await handler(request(AROUND, { Authorization }));
        assert.equal(response.status, 401); assert.deepEqual(await response.json(), { ok: false, code: 'AUTH_REQUIRED' });
    }
    assert.equal((await handler(request('x'.repeat(8 * 1024 + 1)))).status, 413);
    assert.equal((await handler(request('{bad'))).status, 400);
    assert.equal(calls.length, 0);
}));
test('poi-nearby: the Auth server decides who the bearer is, then the per-account quota (60 an hour) is asked with the same token', async () => {
    await runtime(async calls => {
        assert.equal((await handler(request(AROUND, { origin: 'https://titan.example.test' }))).status, 200);
        assert.deepEqual(calls.map(c => c.url), [`${ENV.SUPABASE_URL}/auth/v1/user`, `${ENV.SUPABASE_URL}${QUOTA}`, ENDPOINT]);
        for (const call of calls.slice(0, 2)) { assert.equal(call.init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY); assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`); }
        assert.ok(calls.every(c => c.init.signal instanceof AbortSignal));
    });
    for (const user of [{ is_anonymous: true }, { id: 'bad' }]) await runtime(async calls => { assert.equal((await handler(request())).status, 401); assert.equal(calls.length, 1); }, { user });
    await runtime(async calls => { assert.equal((await handler(request())).status, 401); assert.equal(calls.length, 1); }, { responses: { '/auth/v1/user': json({}, 401) } });
    await runtime(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 429); assert.deepEqual(await response.json(), { ok: false, code: 'RATE_LIMITED' }); assert.equal(outside(calls).length, 0);
    }, { responses: { [QUOTA]: json(false) } });
    for (const quota of [json({ message: 'function not found' }, 404), json({ message: 'secret' }, 500), json(1)]) {
        await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'SERVICE_UNAVAILABLE'); assert.equal(outside(calls).length, 0); }, { responses: { [QUOTA]: quota } });
    }
});
test('poi-nearby: strict validation — kinds from the table, exactly one zone, bounded radius and points', async () => runtime(async calls => {
    const sixtyOne = Array.from({ length: 61 }, (_, i) => [45 + i / 1000, 6]);
    const bad = [null, [], {}, { kinds: ['water'] }, { ...AROUND, along: ALONG.along },
        { ...AROUND, kinds: [] }, { ...AROUND, kinds: 'water' }, { ...AROUND, kinds: ['pharmacy'] }, { ...AROUND, kinds: ['water', 'water'] }, { ...AROUND, kinds: ['constructor'] },
        { ...AROUND, kinds: [['amenity', 'bar']] }, { ...AROUND, kinds: ['water"];node(1);out;//'] }, { ...AROUND, kinds: ['water', 'toilets', 'shelter', 'bike_repair', 'food', 'viewpoint', 'parking', 'water'] },
        { kinds: ['water'], around: { lat: 45, lon: 6, radiusM: 99 } }, { kinds: ['water'], around: { lat: 45, lon: 6, radiusM: 5001 } }, { kinds: ['water'], around: { lat: 45, lon: 6 } },
        { kinds: ['water'], around: { lat: 90.5, lon: 6, radiusM: 500 } }, { kinds: ['water'], around: { lat: 45, lon: -181, radiusM: 500 } },
        { kinds: ['water'], around: { lat: '45', lon: 6, radiusM: 500 } }, { kinds: ['water'], around: { lat: 45, lon: 6, radiusM: '500' } },
        { kinds: ['water'], around: { lat: '45);node(1', lon: 6, radiusM: 500 } }, { kinds: ['water'], around: { lat: 45, lon: 6, radiusM: '500);out;' } },
        { kinds: ['water'], around: { lat: 45, lon: 6, radiusM: 500, timeout: 900 } }, { kinds: ['water'], around: [45, 6, 500] },
        { kinds: ['water'], along: { points: [[45, 6]], radiusM: 100 } }, { kinds: ['water'], along: { points: sixtyOne, radiusM: 100 } },
        { kinds: ['water'], along: { points: [[45, 6], [45.1, 6.1]], radiusM: 49 } }, { kinds: ['water'], along: { points: [[45, 6], [45.1, 6.1]], radiusM: 501 } },
        { kinds: ['water'], along: { points: [[45, 6], ['45.1', 6.1]], radiusM: 100 } }, { kinds: ['water'], along: { points: [[45, 6], [45.1, 6.1, '0);out;']], radiusM: 100 } },
        { kinds: ['water'], along: { points: '45,6,45.1,6.1', radiusM: 100 } },
        { ...AROUND, query: '[out:json];node(1);out;' }, { ...AROUND, data: 'x' }, { ...AROUND, user_id: USER }];
    for (const payload of bad) {
        const response = await handler(request(JSON.stringify(payload)));
        assert.equal(response.status, 400, JSON.stringify(payload).slice(0, 90)); assert.deepEqual(await response.json(), { ok: false, code: 'BAD_REQUEST' });
    }
    assert.equal(calls.length, 0);
    assert.deepEqual(validInput({ kinds: ['toilets', 'water'], around: { lat: 45.1234567, lon: 6, radiusM: 100.4 } }), { kinds: ['water', 'toilets'], around: { lat: 45.123457, lon: 6, radiusM: 100 } });
    assert.equal(validInput({ kinds: ['water'], along: { points: sixtyOne.slice(0, 60), radiusM: 500 } }).along.points.length, 60);
}));
test('poi-nearby: the query is written by the server from validated numbers and its own tags — nothing else', async () => {
    assert.equal(buildQuery(validInput(AROUND)), [
        '[out:json][timeout:10];', '(',
        '  nwr["amenity"="drinking_water"](around:2000,45.193210,6.431050);',
        '  nwr["man_made"="water_tap"]["drinking_water"="yes"](around:2000,45.193210,6.431050);',
        '  nwr["natural"="spring"]["drinking_water"="yes"](around:2000,45.193210,6.431050);',
        '  nwr["amenity"="toilets"](around:2000,45.193210,6.431050);',
        ');', 'out meta center 201;'].join('\n'));
    assert.equal(buildQuery(validInput(ALONG)), [
        '[out:json][timeout:10];', '(',
        '  nwr["amenity"="bicycle_repair_station"](around:300,45.193210,6.431050,45.200000,6.500000,45.250000,6.550000);',
        '  nwr["shop"="bicycle"](around:300,45.193210,6.431050,45.200000,6.500000,45.250000,6.550000);',
        ');', 'out meta center 201;'].join('\n'));
    const shelter = buildQuery(validInput({ kinds: ['shelter'], around: { lat: -33.9, lon: -70.6, radiusM: 5000 } }));
    for (const line of ['nwr["amenity"="shelter"](around:5000,-33.900000,-70.600000);', 'nwr["tourism"="wilderness_hut"]', 'nwr["tourism"="alpine_hut"]']) assert.ok(shelter.includes(line), line);
    // Every query the function can build is made of the same few characters: words of the table, digits, and Overpass punctuation.
    const all = { kinds: Object.keys(KINDS), along: { points: Array.from({ length: 60 }, (_, i) => [-89.999999 + i, -179.999999 + i * 2]), radiusM: 500 } };
    for (const input of [AROUND, ALONG, all, { kinds: ['water'], around: { lat: 1e-7, lon: -1e-9, radiusM: 100 } }]) assert.match(buildQuery(validInput(input)), /^[a-z_"=\[\]():;,.\d\s-]+$/);
    // Values that skipped validation cannot be formatted into a query.
    for (const forged of [{ kinds: ['water'], around: { lat: '45);out;', lon: 6, radiusM: 500 } }, { kinds: ['water'], around: { lat: 45, lon: 6, radiusM: '1);out;' } },
        { kinds: ['water'], around: { lat: 45, lon: 6, radiusM: 1e9 } }, { kinds: ['water'], around: { lat: 1e21, lon: 6, radiusM: 100 } }, { kinds: ['water'], around: { lat: NaN, lon: 6, radiusM: 100 } }]) {
        assert.throws(() => buildQuery(forged), /BAD_NUMBER/);
    }
    assert.throws(() => buildQuery({ kinds: ['pharmacy"];out;'], around: { lat: 45, lon: 6, radiusM: 500 } }));
    await runtime(async calls => {
        assert.equal((await handler(request(ALONG))).status, 200);
        const [call] = outside(calls);
        assert.equal(call.url, ENDPOINT); assert.equal(call.init.method, 'POST'); assert.equal(call.init.redirect, 'error');
        assert.equal(sentQuery(call), buildQuery(validInput(ALONG)));
        assert.equal(call.init.headers.Authorization, undefined);
        assert.doesNotMatch(JSON.stringify([call.init.headers, call.init.body]), new RegExp(`${USER}|${TOKEN}|sb_publishable|verified`));
    });
    assert.deepEqual(buildRequest(validInput(AROUND), ENDPOINT).init.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=UTF-8');
});
test('poi-nearby: an Overpass answer becomes TITAN’s contract — source, licence, date read, raw opening hours, last change in OpenStreetMap', async () => runtime(async () => {
    const before = Date.now();
    const response = await handler(request());
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.ok(Date.parse(body.fetchedAt) >= before - 1000 && Date.parse(body.fetchedAt) <= Date.now() && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(body.fetchedAt));
    assert.deepEqual({ ...body, fetchedAt: null }, {
        ok: true, source: 'OpenStreetMap', license: 'ODbL', licenseUrl: 'https://www.openstreetmap.org/copyright', attribution: '© les contributeurs d’OpenStreetMap',
        fetchedAt: null, osmBaseAt: '2026-11-25T08:12:44Z',
        pois: [ // nearest to the centre first
            { id: 'node/1001', kind: 'water', lat: 45.1934, lon: 6.4312, name: 'Fontaine du village', openingHours: null, fee: null, access: null, osmUpdatedAt: '2024-03-02T07:30:00Z' },
            { id: 'node/1003', kind: 'water', lat: 45.195, lon: 6.433, name: '<script>alert(1)</script>', openingHours: null, fee: null, access: null, osmUpdatedAt: null },
            { id: 'way/2002', kind: 'toilets', lat: 45.2, lon: 6.44, name: null, openingHours: 'Mo-Su 08:00-20:00; PH off', fee: 'no', access: 'customers', osmUpdatedAt: '2025-06-01T10:00:00Z' }
        ],
        truncated: false
    });
    // Opening hours are passed on as written: nothing in the answer says « open », and no contributor name is forwarded.
    assert.doesNotMatch(JSON.stringify(body), /"open"|isOpen|ouvert|mapper-a|mapper-b|changeset|"uid"/);
}));
test('poi-nearby: elements that are not usable points are left out, never guessed', () => {
    const input = validInput(AROUND);
    const odd = [null, 'node', { type: 'node', id: 1, lat: 45, lon: 6 }, { type: 'node', id: 2, lat: 45, lon: 6, tags: { amenity: 'bar' } }, { type: 'node', id: 3, lat: 95, lon: 6, tags: { amenity: 'toilets' } },
        { type: 'way', id: 4, tags: { amenity: 'toilets' } }, { type: 'area', id: 5, lat: 45, lon: 6, tags: { amenity: 'toilets' } }, { type: 'node', id: '6', lat: 45, lon: 6, tags: { amenity: 'toilets' } },
        { type: 'node', id: 7, lat: 45, lon: 6, tags: { man_made: 'water_tap' } }, { type: 'node', id: 8, lat: 45, lon: 6, tags: { amenity: 'shelter' } },
        { type: 'relation', id: 9, center: { lat: 45.2, lon: 6.4 }, tags: { amenity: 'toilets', name: 'x'.repeat(300), fee: ['yes'], opening_hours: '24/7\u0000\u0007' } },
        { type: 'relation', id: 9, center: { lat: 45.2, lon: 6.4 }, tags: { amenity: 'toilets' } }];
    const result = normalise(input, answer(odd), '2026-11-25T09:00:00.000Z');
    assert.deepEqual(result.pois.map(p => p.id), ['relation/9']);
    assert.equal(result.pois[0].name.length, 120); assert.equal(result.pois[0].fee, null); assert.equal(result.pois[0].openingHours, '24/7');
    assert.equal(result.fetchedAt, '2026-11-25T09:00:00.000Z');
    for (const body of [null, [], {}, { elements: 'none' }, 'text']) assert.equal(normalise(input, body, 'now'), null);
    assert.equal(normalise(input, { elements: [] }, 'now').osmBaseAt, null);
});
test('poi-nearby: 200 points at most; one more in the answer, or a remark of the instance, says the list was cut', async () => {
    const many = n => Array.from({ length: n }, (_, i) => ({ type: 'node', id: i + 1, lat: 45.19321 + (n - i) / 1e5, lon: 6.43105, tags: { amenity: 'toilets' } }));
    await runtime(async calls => {
        const body = await (await handler(request())).json();
        assert.equal(body.pois.length, 200); assert.equal(body.truncated, true);
        assert.equal(body.pois[0].id, 'node/201', 'the nearest are kept'); assert.ok(!body.pois.some(p => p.id === 'node/1'), 'the farthest is the one left out');
        assert.match(sentQuery(outside(calls)[0]), /out meta center 201;$/);
    }, { upstream: () => json(answer(many(201))) });
    await runtime(async () => { const body = await (await handler(request())).json(); assert.equal(body.pois.length, 200); assert.equal(body.truncated, false); }, { upstream: () => json(answer(many(200))) });
    await runtime(async () => { const body = await (await handler(request())).json(); assert.equal(body.pois.length, 3); assert.equal(body.truncated, true); },
        { upstream: () => json(answer(ELEMENTS, { remark: 'runtime error: Query timed out in "query" at line 3 after 11 seconds.' })) });
});
test('poi-nearby: upstream failures are bounded codes — never the instance’s text, never an empty list taken for « nothing here »', async () => {
    const cases = [[() => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, 502, 'UPSTREAM_UNAVAILABLE'], [() => { throw TypeError('fetch failed'); }, 502, 'UPSTREAM_UNAVAILABLE'],
        [() => new Response('<html>504 Gateway Timeout: the server is probably too busy</html>', { status: 504 }), 502, 'UPSTREAM_UNAVAILABLE'], [() => json({ error: 'boom secret' }, 500), 502, 'UPSTREAM_UNAVAILABLE'],
        [() => new Response('<html>rate_limited</html>', { status: 429 }), 503, 'QUOTA_EXCEEDED'], [() => new Response('blocked secret', { status: 403 }), 503, 'QUOTA_EXCEEDED'],
        [() => new Response('<?xml version="1.0"?><osm/>', { status: 200 }), 502, 'UPSTREAM_UNAVAILABLE'], [() => json({ elements: 'secret' }), 502, 'UPSTREAM_UNAVAILABLE'],
        [() => json(answer([], { remark: 'runtime error: Query run out of memory using about 2048 MB of RAM. secret' })), 502, 'UPSTREAM_UNAVAILABLE'],
        [() => new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } }), 502, 'UPSTREAM_UNAVAILABLE']];
    for (const [upstream, status, expected] of cases) {
        await runtime(async calls => {
            const response = await handler(request());
            const text = await response.text();
            assert.equal(response.status, status); assert.deepEqual(JSON.parse(text), { ok: false, code: expected });
            assert.doesNotMatch(text, /secret|html|busy/); assert.equal(outside(calls).length, 1, 'one attempt, no retry against a struggling instance');
        }, { upstream });
    }
    // An instance that answers with no point at all, and no remark, is a real « nothing here ».
    await runtime(async () => { const response = await handler(request()); assert.equal(response.status, 200); assert.deepEqual((await response.json()).pois, []); }, { upstream: () => json(answer([])) });
});
test('poi-nearby: every kind of the athlete’s own points except « other » can be searched, each with tags of the table only', () => {
    assert.deepEqual(Object.keys(KINDS), ['water', 'toilets', 'shelter', 'bike_repair', 'food', 'viewpoint', 'parking']);
    for (const filters of Object.values(KINDS)) for (const filter of filters) for (const [key, value] of filter) { assert.match(key, /^[a-z_]+$/); assert.match(value, /^[a-z_]+$/); }
    const result = normalise(validInput({ kinds: ['food', 'viewpoint', 'parking', 'shelter', 'bike_repair'], around: { lat: 45, lon: 6, radiusM: 500 } }), answer([
        { type: 'node', id: 1, lat: 45.001, lon: 6, tags: { shop: 'bakery', name: 'Boulangerie' } }, { type: 'node', id: 2, lat: 45.002, lon: 6, tags: { tourism: 'viewpoint' } },
        { type: 'way', id: 3, center: { lat: 45.003, lon: 6 }, tags: { amenity: 'parking', fee: 'yes' } }, { type: 'node', id: 4, lat: 45.004, lon: 6, tags: { tourism: 'alpine_hut', name: 'Refuge' } },
        { type: 'node', id: 5, lat: 45.0045, lon: 6, tags: { shop: 'bicycle', amenity: 'cafe' } }, { type: 'node', id: 6, lat: 45.005, lon: 6, tags: { amenity: 'toilets' } }]), 'now');
    assert.deepEqual(result.pois.map(p => [p.id, p.kind]), [['node/1', 'food'], ['node/2', 'viewpoint'], ['way/3', 'parking'], ['node/4', 'shelter'], ['node/5', 'bike_repair']]);
});
