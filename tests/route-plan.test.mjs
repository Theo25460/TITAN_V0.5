import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import handler, { buildRequest, normalise, noRoute, routingConfig, validInput } from '../functions/route-plan.mjs';

const USER = '00000000-0000-4000-8000-000000000177';
const KEY = 'ors-fake-key-0123456789abcdef';
const TOKEN = 'fake-token-used-only-in-tests';
const ENV = {
    SUPABASE_URL: 'https://database.example.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake',
    ROUTING_PROVIDER: 'openrouteservice', ROUTING_API_KEY: KEY
};
const GH = { ROUTING_PROVIDER: 'graphhopper', ROUTING_API_KEY: KEY };
const A = [45.19321, 6.43105], B = [45.2, 6.5], C = [45.25, 6.55];
const INPUT = { profile: 'bike', points: [A, B] };
const LOOP = { profile: 'run', loop: { start: A, distanceM: 10000, seed: 7 } };
const QUOTA = '/rest/v1/rpc/titan_route_plan_quota_v1';

// Answers of the recorded shape (openrouteservice v2 GeoJSON, GraphHopper POST /route), reduced to a few points.
const orsAnswer = ({ distance = 10000, duration = 2400, extras = true, elevation = true, warnings } = {}) => ({
    type: 'FeatureCollection', bbox: [6.43, 45.19, 6.5, 45.2],
    features: [{
        type: 'Feature', bbox: [6.43, 45.19, 6.5, 45.2],
        properties: {
            ...(elevation ? { ascent: 212.4, descent: 198.6 } : {}),
            ...(extras ? { extras: {
                surface: { values: [[0, 2, 3], [2, 3, 10]], summary: [{ value: 3, distance: 7500, amount: 75 }, { value: 10, distance: 2000, amount: 20 }, { value: 0, distance: 500, amount: 5 }] },
                waytypes: { values: [[0, 3, 6]], summary: [{ value: 6, distance: 6000, amount: 60 }, { value: 3, distance: 4000, amount: 40 }] }
            } } : {}),
            ...(warnings ? { warnings } : {}),
            way_points: [0, 3], summary: { distance, duration }
        },
        geometry: { type: 'LineString', coordinates: [[6.43105, 45.19321, 1510.2], [6.45, 45.195, 1560], [6.48, 45.198, 1622.48], [6.5, 45.2, 1700]].map(c => (elevation ? c : c.slice(0, 2))) }
    }],
    metadata: { attribution: 'openrouteservice.org | OpenStreetMap contributors', service: 'routing', query: { profile: 'cycling-regular' } }
});
const ghAnswer = ({ distance = 4447.8, time = 900000 } = {}) => ({
    paths: [{
        distance, time, ascend: 35.2, descend: 12.9, points_encoded: false, bbox: [0, 0, 0.04, 0],
        points: { type: 'LineString', coordinates: [[0, 0, 100], [0.01, 0, 110], [0.02, 0, 120], [0.03, 0, 125], [0.04, 0, 122.3]] },
        details: { surface: [[0, 3, 'asphalt'], [3, 4, 'gravel']], road_class: [[0, 2, 'cycleway'], [2, 4, 'tertiary']] },
        snapped_waypoints: { type: 'LineString', coordinates: [[0, 0, 100], [0.04, 0, 122.3]] }
    }],
    info: { copyrights: ['GraphHopper', 'OpenStreetMap contributors'], took: 4 }
});

function request(body = INPUT, headers = {}) {
    return new Request('https://titan.example.test/functions/route-plan', {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    });
}
const json = (body, status = 200) => Response.json(body, { status });
async function runtime(callback, { env = {}, responses = {}, user = {}, upstream = () => json(orsAnswer()) } = {}) {
    const previousNetlify = globalThis.Netlify, previousFetch = globalThis.fetch;
    const calls = [];
    globalThis.Netlify = { env: { get: name => ({ ...ENV, ...env })[name] || '' } };
    globalThis.fetch = async (url, init) => {
        const { pathname, host } = new URL(url);
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, path: pathname, host, init, body });
        if (Object.hasOwn(responses, pathname)) return typeof responses[pathname] === 'function' ? responses[pathname](body, init) : responses[pathname];
        if (pathname === '/auth/v1/user') return json({ id: USER, is_anonymous: false, email: 'verified@example.test', ...user });
        if (pathname === QUOTA) return json(true);
        if (host !== 'database.example.test') return upstream(body, init, url);
        throw Error('Unexpected network call');
    };
    try { return await callback(calls); }
    finally { globalThis.fetch = previousFetch; if (previousNetlify === undefined) delete globalThis.Netlify; else globalThis.Netlify = previousNetlify; }
}
const outside = calls => calls.filter(c => c.host !== 'database.example.test');
const code = async response => (await response.json()).code;

test('route-plan: unsupported method and content type never make network calls', async () => runtime(async calls => {
    const get = await handler(new Request('https://titan.example.test/functions/route-plan'));
    assert.equal(get.status, 405); assert.deepEqual(await get.json(), { ok: false, code: 'METHOD_NOT_ALLOWED' });
    assert.equal((await handler(request(INPUT, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal(calls.length, 0);
}));
test('route-plan: without a provider, a key or a valid address the function answers ROUTING_NOT_CONFIGURED and calls nothing', async () => {
    for (const env of [{ ROUTING_PROVIDER: '' }, { ROUTING_API_KEY: '' }, { ROUTING_PROVIDER: 'osrm' }, { ROUTING_PROVIDER: 'constructor' }, { ROUTING_BASE_URL: 'http://ors.example.test' },
        { ROUTING_BASE_URL: 'https://user:secret@ors.example.test' }, { ROUTING_API_KEY: 'two\nlines' }, { SUPABASE_URL: '' }, { SUPABASE_URL: 'http://unsafe.test' }, { SUPABASE_PUBLISHABLE_KEY: '' }]) {
        await runtime(async calls => {
            // The same answer with or without a token: an unconfigured function says nothing about the caller.
            for (const headers of [{}, { Authorization: '' }]) {
                const response = await handler(request(INPUT, headers));
                assert.equal(response.status, 503); assert.deepEqual(await response.json(), { ok: false, code: 'ROUTING_NOT_CONFIGURED' });
            }
            assert.equal(calls.length, 0);
        }, { env });
    }
    assert.equal(routingConfig(() => ''), null);
});
test('route-plan: a self-hosted instance may have no key; a hosted plan may not', async () => {
    assert.deepEqual(routingConfig(name => ({ ROUTING_PROVIDER: 'openrouteservice', ROUTING_BASE_URL: 'https://ors.example.test/ors/' })[name] || ''),
        { provider: 'openrouteservice', key: '', base: 'https://ors.example.test/ors' });
    await runtime(async calls => {
        assert.equal((await handler(request())).status, 200);
        const [call] = outside(calls);
        assert.equal(call.url, 'https://ors.example.test/ors/v2/directions/cycling-regular/geojson');
        assert.equal(call.init.headers.Authorization, undefined);
    }, { env: { ROUTING_API_KEY: '', ROUTING_BASE_URL: 'https://ors.example.test/ors/' } });
});
test('route-plan: missing or malformed bearer and a foreign origin are refused before any network call', async () => runtime(async calls => {
    for (const Authorization of ['', 'Basic abc', 'Bearer short', `Bearer ${TOKEN} extra`]) {
        const response = await handler(request(INPUT, { Authorization }));
        assert.equal(response.status, 401); assert.deepEqual(await response.json(), { ok: false, code: 'AUTH_REQUIRED' });
    }
    assert.equal((await handler(request(INPUT, { origin: 'https://attacker.test' }))).status, 403);
    assert.equal(calls.length, 0);
}));
test('route-plan: the website (same origin) and the Android application (no Origin header) are both accepted on their bearer', async () => runtime(async calls => {
    assert.equal((await handler(request(INPUT, { origin: 'https://titan.example.test' }))).status, 200);
    assert.equal((await handler(request())).status, 200);
    assert.equal(outside(calls).length, 2);
}));
test('route-plan: the Auth server decides who the bearer is; refused, anonymous and malformed accounts never reach the quota or the provider', async () => {
    for (const responses of [{ '/auth/v1/user': json({ message: 'invalid JWT' }, 401) }, { '/auth/v1/user': json({}, 403) }]) {
        await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 401); assert.equal(await code(response), 'AUTH_REQUIRED'); assert.deepEqual(calls.map(c => c.path), ['/auth/v1/user']); }, { responses });
    }
    for (const user of [{ is_anonymous: true }, { is_anonymous: undefined }, { id: 'bad' }, { id: [USER] }]) {
        await runtime(async calls => { assert.equal((await handler(request())).status, 401); assert.deepEqual(calls.map(c => c.path), ['/auth/v1/user']); }, { user });
    }
    await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 503); assert.equal(await code(response), 'SERVICE_UNAVAILABLE'); assert.equal(calls.length, 1); },
        { responses: { '/auth/v1/user': () => { throw Error('private upstream secret'); } } });
});
test('route-plan: oversized bodies and malformed JSON are rejected before Auth', async () => runtime(async calls => {
    assert.equal((await handler(request('x'.repeat(8 * 1024 + 1)))).status, 413);
    assert.equal((await handler(request('{bad'))).status, 400);
    assert.equal(calls.length, 0);
}));
test('route-plan: bad inputs are refused with BAD_REQUEST and nothing leaves the server', async () => runtime(async calls => {
    const twentySix = Array.from({ length: 26 }, (_, i) => [45 + i / 1000, 6]);
    const bad = [null, [], 'bike', {}, { profile: 'bike' },
        { profile: 'bike', points: [] }, { profile: 'bike', points: [A] }, { profile: 'bike', points: twentySix },
        { profile: 'bike', points: [A, [90.01, 6]] }, { profile: 'bike', points: [A, [-91, 6]] }, { profile: 'bike', points: [A, [45, 180.5]] },
        { profile: 'bike', points: [A, ['45.2', '6.5']] }, { profile: 'bike', points: [A, [45.2, 6.5, 1700]] }, { profile: 'bike', points: [A, { lat: 45.2, lon: 6.5 }] },
        { profile: 'bike', points: [A, [null, 6.5]] }, { profile: 'bike', points: 'A;B' },
        { profile: 'bike', points: [A, B], loop: { start: A, distanceM: 10000 } },
        { profile: 'car', points: [A, B] }, { profile: 'driving-car', points: [A, B] }, { profile: ['bike'], points: [A, B] }, { profile: 'constructor', points: [A, B] },
        { profile: 'run', loop: { start: A, distanceM: 999 } }, { profile: 'run', loop: { start: A, distanceM: 300001 } }, { profile: 'run', loop: { start: A, distanceM: '10000' } },
        { profile: 'run', loop: { start: A } }, { profile: 'run', loop: { start: [91, 0], distanceM: 5000 } }, { profile: 'run', loop: { distanceM: 5000 } },
        { profile: 'run', loop: { start: A, distanceM: 5000, seed: 100 } }, { profile: 'run', loop: { start: A, distanceM: 5000, seed: -1 } }, { profile: 'run', loop: { start: A, distanceM: 5000, seed: 1.5 } },
        { profile: 'run', loop: { start: A, distanceM: 5000, points: 12 } }, { profile: 'run', loop: [A, 5000] },
        { ...INPUT, prefer: { flat: 'yes' } }, { ...INPUT, prefer: { fast: true } }, { ...INPUT, prefer: [true] },
        { ...INPUT, user_id: USER }, { ...INPUT, options: { avoid_features: ['ferries'] } }, { ...INPUT, key: 'mine' }];
    for (const payload of bad) {
        const response = await handler(request(JSON.stringify(payload)));
        assert.equal(response.status, 400, JSON.stringify(payload).slice(0, 90)); assert.deepEqual(await response.json(), { ok: false, code: 'BAD_REQUEST' });
    }
    assert.equal(calls.length, 0);
    assert.deepEqual(validInput({ profile: 'bike', points: Array.from({ length: 25 }, (_, i) => [45 + i / 1000, 6]) }).points.length, 25);
    assert.deepEqual(validInput({ profile: 'hike', loop: { start: A, distanceM: 1000 }, prefer: { quiet: true, flat: false } }),
        { profile: 'hike', loop: { start: A, distanceM: 1000, seed: 0 }, prefer: { quiet: true } });
}));
test('route-plan: the quota is asked with the athlete’s own token, and a full quota stops before the provider', async () => {
    await runtime(async calls => {
        assert.equal((await handler(request())).status, 200);
        assert.equal(calls[0].url, `${ENV.SUPABASE_URL}/auth/v1/user`);
        assert.equal(calls[1].url, `${ENV.SUPABASE_URL}${QUOTA}`);
        for (const call of calls.slice(0, 2)) { assert.equal(call.init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY); assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`); }
        assert.deepEqual(calls[1].body, {});
        assert.ok(calls.every(c => c.init.signal instanceof AbortSignal));
    });
    await runtime(async calls => {
        const response = await handler(request());
        assert.equal(response.status, 429); assert.deepEqual(await response.json(), { ok: false, code: 'RATE_LIMITED' });
        assert.equal(outside(calls).length, 0);
    }, { responses: { [QUOTA]: json(false) } });
    // No answer from the counter (migration not applied, database down): fail closed, the provider is not called.
    for (const quota of [json({ code: 'PGRST202', message: 'function not found' }, 404), json({ message: 'secret' }, 500), json('true'), json(null), () => { throw Error('private'); }]) {
        await runtime(async calls => { const response = await handler(request()); assert.equal(response.status, 503); assert.equal(await code(response), 'SERVICE_UNAVAILABLE'); assert.equal(outside(calls).length, 0); },
            { responses: { [QUOTA]: quota } });
    }
    await runtime(async calls => { assert.equal((await handler(request())).status, 401); assert.equal(outside(calls).length, 0); }, { responses: { [QUOTA]: json({ message: 'JWT expired' }, 401) } });
});
test('route-plan: openrouteservice receives the points and the profile only — no identity, the key in its header, a 12 s limit', async () => runtime(async calls => {
    assert.equal((await handler(request({ profile: 'road', points: [A, B, C], prefer: { flat: true, quiet: true, unpaved: true } }))).status, 200);
    const [call] = outside(calls);
    assert.equal(call.url, 'https://api.openrouteservice.org/v2/directions/cycling-road/geojson');
    assert.equal(call.init.method, 'POST'); assert.equal(call.init.headers.Authorization, KEY); assert.equal(call.init.redirect, 'error');
    assert.deepEqual(call.body, { coordinates: [[6.43105, 45.19321], [6.5, 45.2], [6.55, 45.25]], elevation: true, instructions: false, extra_info: ['surface', 'waytype'],
        options: { profile_params: { weightings: { steepness_difficulty: 0 } } } });
    assert.doesNotMatch(JSON.stringify([call.url, call.init.headers, call.body]), new RegExp(`${USER}|${TOKEN}|sb_publishable|verified@`));
    assert.ok(call.init.signal instanceof AbortSignal);
}));
test('route-plan: adapters are pure — profiles, loops by target length and preferences per provider', () => {
    const ors = { provider: 'openrouteservice', key: KEY, base: 'https://api.openrouteservice.org' }, gh = { provider: 'graphhopper', key: 'k&y=1', base: 'https://graphhopper.com/api/1' };
    const profile = (provider, name) => { const { url, init } = buildRequest(provider, validInput({ profile: name, points: [A, B] }), provider === 'graphhopper' ? gh : ors); return provider === 'graphhopper' ? JSON.parse(init.body).profile : url.split('/').at(-2); };
    assert.deepEqual(['road', 'bike', 'gravel', 'mtb', 'run', 'walk', 'hike'].map(name => profile('openrouteservice', name)),
        ['cycling-road', 'cycling-regular', 'cycling-mountain', 'cycling-mountain', 'foot-walking', 'foot-walking', 'foot-hiking']);
    assert.deepEqual(['road', 'bike', 'gravel', 'mtb', 'run', 'walk', 'hike'].map(name => profile('graphhopper', name)), ['racingbike', 'bike', 'mtb', 'mtb', 'foot', 'foot', 'hike']);
    const loop = JSON.parse(buildRequest('openrouteservice', validInput({ ...LOOP, prefer: { quiet: true, flat: true } }), ors).init.body);
    assert.deepEqual(loop.coordinates, [[6.43105, 45.19321]]);
    assert.deepEqual(loop.options, { round_trip: { length: 10000, seed: 7 }, profile_params: { weightings: { quiet: 1 } } });
    const ghLoop = buildRequest('graphhopper', validInput(LOOP), gh);
    assert.equal(ghLoop.url, 'https://graphhopper.com/api/1/route?key=k%26y%3D1');
    assert.equal(ghLoop.init.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(ghLoop.init.body), { profile: 'foot', points: [[6.43105, 45.19321]], points_encoded: false, elevation: true, instructions: false, calc_points: true,
        details: ['surface', 'road_class'], algorithm: 'round_trip', 'round_trip.distance': 10000, 'round_trip.seed': 7, 'ch.disable': true });
    // GraphHopper preferences would need a custom model the adapter does not send: the request is the plain one.
    assert.equal(JSON.parse(buildRequest('graphhopper', validInput({ ...INPUT, prefer: { flat: true, quiet: true } }), gh).init.body).custom_model, undefined);
});
test('route-plan: an openrouteservice answer becomes TITAN’s contract — distance, estimate, climb, altitude, surface and way-type shares', async () => runtime(async () => {
    const response = await handler(request({ profile: 'bike', points: [A, B], prefer: { unpaved: true } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(await response.json(), {
        ok: true, provider: 'openrouteservice', attribution: 'Itinéraire : openrouteservice.org (HeiGIT) · Données © les contributeurs d’OpenStreetMap',
        attributionUrl: 'https://www.openstreetmap.org/copyright', profile: 'bike', profileNote: null,
        distanceM: 10000, durationS: 2400, ascentM: 212, descentM: 199,
        segs: [[[45.19321, 6.43105, 1510.2], [45.195, 6.45, 1560], [45.198, 6.48, 1622.5], [45.2, 6.5, 1700]]],
        surface: [{ key: 'asphalt', label: 'Asphalte', share: 0.75 }, { key: 'gravel', label: 'Gravier', share: 0.2 }, { key: 'unknown', label: 'Non renseigné', share: 0.05 }],
        waytype: [{ key: 'cycleway', label: 'Piste cyclable', share: 0.6 }, { key: 'street', label: 'Rue', share: 0.4 }],
        warnings: ['Préférence « chemins non revêtus » non prise en charge par le fournisseur pour ce profil : elle n’a pas été appliquée.'],
        requested: { profile: 'bike', points: [A, B], prefer: { unpaved: true } }
    });
}));
test('route-plan: a GraphHopper answer gives the same contract, shares measured on the geometry, the key in the address only', async () => runtime(async calls => {
    const response = await handler(request({ profile: 'bike', points: [[0, 0], [0, 0.04]] }));
    assert.equal(response.status, 200);
    const [call] = outside(calls);
    assert.equal(call.url, `https://graphhopper.com/api/1/route?key=${KEY}`);
    assert.deepEqual(call.body.points, [[0, 0], [0.04, 0]]);
    const body = await response.json();
    assert.deepEqual({ ...body, segs: null }, {
        ok: true, provider: 'graphhopper', attribution: 'Itinéraire : GraphHopper · Données © les contributeurs d’OpenStreetMap', attributionUrl: 'https://www.openstreetmap.org/copyright',
        profile: 'bike', profileNote: null, distanceM: 4448, durationS: 900, ascentM: 35, descentM: 13, segs: null,
        surface: [{ key: 'asphalt', label: 'Asphalte', share: 0.75 }, { key: 'gravel', label: 'Gravier', share: 0.25 }],
        waytype: [{ key: 'cycleway', label: 'Piste cyclable', share: 0.5 }, { key: 'road', label: 'Route', share: 0.5 }],
        warnings: [], requested: { profile: 'bike', points: [[0, 0], [0, 0.04]], prefer: {} }
    });
    assert.deepEqual(body.segs, [[[0, 0, 100], [0, 0.01, 110], [0, 0.02, 120], [0, 0.03, 125], [0, 0.04, 122.3]]]);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(KEY));
}, { env: GH, upstream: () => json(ghAnswer()) }));
test('route-plan: a profile the provider does not have is said, never hidden — gravel on the MTB profile, running without a walking time', async () => {
    for (const [env, upstream] of [[{}, orsAnswer()], [GH, ghAnswer()]]) {
        await runtime(async calls => {
            const gravel = await (await handler(request({ profile: 'gravel', points: [A, B] }))).json();
            assert.equal(gravel.profile, 'gravel'); assert.equal(gravel.profileNote, 'Le fournisseur n’a pas de profil gravel : calcul avec le profil VTT.');
            assert.equal(typeof gravel.durationS, 'number');
            const run = await (await handler(request({ profile: 'run', points: [A, B] }))).json();
            assert.equal(run.profileNote, 'Le fournisseur n’a pas de profil course à pied : calcul avec le profil marche, sans durée estimée.');
            assert.equal(run.durationS, null);
            assert.equal((await (await handler(request({ profile: 'mtb', points: [A, B] }))).json()).profileNote, null);
            assert.equal(outside(calls).length, 3);
        }, { env, upstream: () => json(upstream) });
    }
});
test('route-plan: a loop more than 10 % away from the length asked for says both figures; a close one says nothing', async () => {
    const warned = normalise('openrouteservice', validInput(LOOP), orsAnswer({ distance: 12340 }));
    assert.deepEqual(warned.warnings.filter(w => w.startsWith('Boucle')), ['Boucle demandée : 10,0 km ; boucle calculée : 12,3 km.']);
    assert.equal(warned.distanceM, 12340); assert.deepEqual(warned.requested, { profile: 'run', loop: { start: A, distanceM: 10000, seed: 7 }, prefer: {} });
    assert.deepEqual(normalise('graphhopper', validInput(LOOP), ghAnswer({ distance: 8900 })).warnings.filter(w => w.startsWith('Boucle')), ['Boucle demandée : 10,0 km ; boucle calculée : 8,9 km.']);
    for (const distance of [9000, 10000, 11000]) assert.deepEqual(normalise('openrouteservice', validInput(LOOP), orsAnswer({ distance })).warnings.filter(w => w.startsWith('Boucle')), []);
    await runtime(async calls => {
        const body = await (await handler(request(LOOP))).json();
        assert.ok(body.warnings.includes('Boucle demandée : 10,0 km ; boucle calculée : 15,0 km.'));
        assert.deepEqual(outside(calls)[0].body.options, { round_trip: { length: 10000, seed: 7 } });
    }, { upstream: () => json(orsAnswer({ distance: 15000 })) });
});
test('route-plan: missing data is null with a warning, never an invented figure; provider warnings are told by code, not by their text', () => {
    const bare = normalise('openrouteservice', validInput(INPUT), orsAnswer({ extras: false, elevation: false }));
    assert.equal(bare.ascentM, null); assert.equal(bare.descentM, null); assert.equal(bare.surface, null); assert.equal(bare.waytype, null);
    assert.ok(bare.segs[0].every(p => p.length === 3 && p[2] === null));
    assert.deepEqual(bare.warnings, ['Altitude non communiquée par le fournisseur : dénivelé indisponible pour cet itinéraire.',
        'Revêtement non communiqué par le fournisseur pour cet itinéraire.', 'Type de voie non communiqué par le fournisseur pour cet itinéraire.']);
    const flagged = normalise('openrouteservice', validInput(INPUT), orsAnswer({ warnings: [{ code: 1, message: 'There may be restrictions on some roads <script>' }, { code: 3, message: 'x' }, { code: 99, message: 'y' }] }));
    assert.deepEqual(flagged.warnings, ['Le fournisseur signale des restrictions d’accès possibles (voie privée ou interdite) sur une partie de l’itinéraire : vérifie sur place.',
        'Une partie de l’itinéraire n’a pas pu être calculée par le fournisseur : le tracé peut être incomplet.', 'Le fournisseur a émis un avertissement sur cet itinéraire : vérifie le tracé avant de partir.']);
    assert.doesNotMatch(JSON.stringify(flagged), /restrictions on some roads|script/);
    const answer = orsAnswer(); answer.features[0].properties.extras.surface.summary = [{ value: 0, distance: 3000 }, { value: 3, distance: 7000 }, { value: 42, distance: 0 }];
    assert.ok(normalise('openrouteservice', validInput(INPUT), answer).warnings.includes('Revêtement non renseigné dans OpenStreetMap sur 30 % de l’itinéraire.'));
    // The JSON flavour of openrouteservice keeps the climb inside the summary: read as well.
    const inSummary = orsAnswer({ elevation: true }); delete inSummary.features[0].properties.ascent; delete inSummary.features[0].properties.descent;
    Object.assign(inSummary.features[0].properties.summary, { ascent: 80.6, descent: 79.4 });
    assert.equal(normalise('openrouteservice', validInput(INPUT), inSummary).ascentM, 81);
    // A long geometry is thinned to the ceiling of a recording, both ends kept, and said.
    const long = ghAnswer(); long.paths[0].points.coordinates = Array.from({ length: 30000 }, (_, i) => [i / 1e5, 0, 100]); long.paths[0].details = {};
    const thinned = normalise('graphhopper', validInput(INPUT), long);
    assert.equal(thinned.segs[0].length, 12000); assert.deepEqual(thinned.segs[0][0], [0, 0, 100]); assert.deepEqual(thinned.segs[0].at(-1), [0, 0.29999, 100]);
    assert.ok(thinned.warnings.some(w => /^Tracé allégé : 12 000 points gardés sur 30 000/.test(w)));
});
test('route-plan: an answer that is not a route is UPSTREAM_UNAVAILABLE, never a half-built route', async () => {
    for (const body of [null, [], {}, { features: [] }, { features: [{ properties: { summary: { distance: 1, duration: 1 } }, geometry: { coordinates: [[6, 45]] } }] },
        { features: [{ properties: { summary: { distance: 'far' } }, geometry: { coordinates: [[6, 45], [6.1, 45.1]] } }] },
        { features: [{ properties: { summary: { distance: 10 } }, geometry: { coordinates: [[6, 45], [600, 45.1]] } }] }, 'not json']) {
        assert.equal(normalise('openrouteservice', validInput(INPUT), body), null);
        await runtime(async () => { const response = await handler(request()); assert.equal(response.status, 502); assert.deepEqual(await response.json(), { ok: false, code: 'UPSTREAM_UNAVAILABLE' }); },
            { upstream: () => (body === 'not json' ? new Response('<html>', { status: 200 }) : json(body)) });
    }
    assert.equal(normalise('graphhopper', validInput(INPUT), { paths: [] }), null);
    assert.equal(normalise('graphhopper', validInput(INPUT), { paths: [{ distance: 5, points: 'encoded_polyline' }] }), null);
});
test('route-plan: upstream timeout and 5xx are UPSTREAM_UNAVAILABLE; 429 and 403 are QUOTA_EXCEEDED; an unknown key is ROUTING_NOT_CONFIGURED', async () => {
    const cases = [[() => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, 502, 'UPSTREAM_UNAVAILABLE'],
        [() => { throw TypeError('fetch failed'); }, 502, 'UPSTREAM_UNAVAILABLE'], [() => json({ error: 'boom' }, 500), 502, 'UPSTREAM_UNAVAILABLE'], [() => new Response('', { status: 503 }), 502, 'UPSTREAM_UNAVAILABLE'],
        [() => json({ error: { code: 2003, message: 'bad parameter' } }, 400), 502, 'UPSTREAM_UNAVAILABLE'],
        [() => json({ error: 'Rate limit exceeded' }, 429), 503, 'QUOTA_EXCEEDED'], [() => json({ error: 'Daily quota reached or API key unauthorized' }, 403), 503, 'QUOTA_EXCEEDED'],
        [() => json({ error: 'Access to this API has been disallowed' }, 401), 503, 'ROUTING_NOT_CONFIGURED']];
    for (const env of [{}, GH]) for (const [upstream, status, expected] of cases) {
        await runtime(async calls => {
            const response = await handler(request());
            assert.equal(response.status, status); assert.deepEqual(await response.json(), { ok: false, code: expected });
            assert.equal(outside(calls).length, 1, 'one attempt, no silent retry on the provider’s quota');
        }, { env, upstream });
    }
});
test('route-plan: NO_ROUTE comes from the provider’s code or exception name, for both adapters', async () => {
    for (const [env, upstream] of [[{}, json({ error: { code: 2009, message: 'Route could not be found' } }, 404)], [{}, json({ error: { code: 2010, message: 'Could not find routable point within a radius of 350.0 meters' } }, 404)],
        [{}, json({ error: { code: 2004, message: 'The approximated route distance must not be greater than 300000.0 meters.' } }, 400)],
        [GH, json({ message: 'Cannot find point 0', hints: [{ message: 'Cannot find point 0', details: 'com.graphhopper.util.exceptions.PointNotFoundException', point_index: 0 }] }, 400)],
        [GH, json({ message: 'Connection between locations not found', hints: [{ details: 'com.graphhopper.util.exceptions.ConnectionNotFoundException' }] }, 400)]]) {
        await runtime(async () => { const response = await handler(request()); assert.equal(response.status, 422); assert.deepEqual(await response.json(), { ok: false, code: 'NO_ROUTE' }); }, { env, upstream: () => upstream.clone() });
    }
    assert.equal(noRoute('openrouteservice', 500, { error: { code: 2009 } }), false);
    assert.equal(noRoute('graphhopper', 400, { hints: [{ details: 'java.lang.IllegalArgumentException' }] }), false);
    assert.equal(noRoute('graphhopper', 400, { message: 'PointNotFoundException in prose only' }), false);
});
test('route-plan: the key never appears in a response, whatever the provider answers or throws, and the handler never throws', async () => {
    const leaks = [() => json({ error: { message: `Invalid key ${KEY}` } }, 400), () => json({ message: `key=${KEY}` }, 500), () => json({ paths: [{ distance: 1, note: KEY }] }),
        () => { throw Error(`request to https://graphhopper.com/api/1/route?key=${KEY} failed`); }, () => json(orsAnswer({ warnings: [{ code: 7, message: KEY }] })), () => json({ ...orsAnswer(), metadata: { key: KEY } })];
    for (const env of [{}, GH]) for (const upstream of leaks) for (const body of [INPUT, LOOP]) {
        await runtime(async () => {
            const response = await handler(request(body));
            const text = JSON.stringify([await response.text(), [...response.headers]]);
            assert.ok(!text.includes(KEY) && !text.includes(TOKEN) && !text.includes('sb_publishable'), text.slice(0, 200));
        }, { env, upstream });
    }
    // Every refusal path, with a key that could be mistaken for a word of the code.
    for (const [headers, payload] of [[{}, { profile: 'bike' }], [{ Authorization: '' }, INPUT], [{ origin: 'https://attacker.test' }, INPUT]]) {
        await runtime(async () => assert.ok(!(await (await handler(request(payload, headers))).text()).includes(KEY)));
    }
});
test('route-plan: nothing in the function or its answers calls a route safe', async () => {
    const source = await readFile(new URL('../functions/route-plan.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /s[ûu]re\b|sécuris|sans danger|garanti/i);
    assert.doesNotMatch(JSON.stringify([normalise('openrouteservice', validInput(INPUT), orsAnswer()), normalise('graphhopper', validInput(LOOP), ghAnswer())]), /s[ûu]re\b|sécuris|sans danger|garanti/i);
    assert.doesNotMatch(source, /console\.|process\.env/);
});
test('route-plan: the Netlify entries bundle the server modules outside the public build', async () => {
    for (const name of ['route-plan', 'poi-nearby']) {
        const entry = await readFile(new URL(`../netlify/functions/${name}.mts`, import.meta.url), 'utf8');
        assert.ok(entry.includes(`export { default } from '../../functions/${name}.mjs'`));
    }
});
