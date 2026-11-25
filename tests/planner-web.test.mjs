// V1.7.7 — the web route planner, tested without a browser: what is sent to the route-plan function (a line through points, a loop),
// how every answer and every refusal becomes one state the sheet can say in words, and how a loop is shown as what was asked beside
// what was obtained. The request is checked against the function's own validation, so both sides cannot drift apart.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../js/core/gps-engine.js');
const N = require('../js/core/gps-nav.js');
const P = require('../js/app/planifier.js');
const { validInput } = await import('../functions/route-plan.mjs');

const A = { lat: 48.583921, lon: 7.745531 }, B = { lat: 48.6, lon: 7.8 }, C = { lat: 48.62, lon: 7.82 };
const answer = (over = {}) => ({ ok: true, provider: 'openrouteservice', attribution: 'Itinéraire : openrouteservice.org (HeiGIT) · Données © les contributeurs d’OpenStreetMap', profile: 'gravel',
    profileNote: 'Le fournisseur n’a pas de profil gravel : calcul avec le profil VTT.', distanceM: 21400, durationS: 4380, ascentM: 420, descentM: 418,
    segs: [Array.from({ length: 120 }, (_, i) => [48.58 + Math.sin(i / 19) * 0.02, 7.74 + Math.cos(i / 19) * 0.03, 140 + i])],
    surface: [{ key: 'asphalt', label: 'Asphalte', share: 0.62 }, { key: 'gravel', label: 'Gravier', share: 0.3 }, { key: 'unknown', label: 'Non renseigné', share: 0.08 }],
    waytype: [{ key: 'track', label: 'Chemin', share: 0.55 }, { key: 'road', label: 'Route', share: 0.45 }],
    warnings: ['Boucle demandée : 20,0 km ; boucle calculée : 21,4 km.'], requested: { profile: 'gravel', loop: { start: [48.58392, 7.74553], distanceM: 20000, seed: 0 }, prefer: { flat: true } }, ...over });

test('every plannable sport has a profile, and the sports no profile fits have none', () => {
    assert.deepEqual(Object.keys(P.PROFILES), ['road', 'bike', 'gravel', 'mtb', 'run', 'walk', 'hike']);
    assert.deepEqual([P.profileOf('cycling_road'), P.profileOf('cycling'), P.profileOf('gravel'), P.profileOf('mountain_bike'), P.profileOf('running'), P.profileOf('walking'), P.profileOf('hiking')], ['road', 'bike', 'gravel', 'mtb', 'run', 'walk', 'hike']);
    for (const sport of E.GPS_SPORTS) {
        const fam = E.familyOf(sport), profile = P.profileOf(sport);
        if (['walk', 'run', 'bike', 'mtb'].includes(fam)) assert.ok(Object.hasOwn(P.PROFILES, profile), sport);
        else assert.equal(profile, null, `${sport}: nothing is planned for a sport no routing profile fits`);
    }
    assert.equal(P.profileOf('chess'), null);
});

test('from a point to another: the body is exactly what the function accepts', () => {
    const r = P.buildRequest({ profile: 'bike', mode: 'points', points: [A, C, B], prefer: { flat: false, quiet: true, unpaved: false } });
    assert.deepEqual(r, { ok: true, body: { profile: 'bike', points: [[48.58392, 7.74553], [48.62, 7.82], [48.6, 7.8]], prefer: { quiet: true } } });
    assert.ok(validInput(r.body), 'accepted by functions/route-plan.mjs');
    const bare = P.buildRequest({ profile: 'run', mode: 'points', points: [A, B], prefer: {} });
    assert.deepEqual(Object.keys(bare.body), ['profile', 'points'], 'no empty preference travels');
    assert.ok(validInput(bare.body));
    // What cannot be sent is said about the point it concerns.
    assert.match(P.buildRequest({ profile: 'bike', mode: 'points', points: [A] }).error, /départ et une arrivée/);
    const hole = P.buildRequest({ profile: 'bike', mode: 'points', points: [A, null, B] });
    assert.equal(hole.ok, false); assert.equal(hole.at, 1); assert.match(hole.error, /L’étape 1/);
    assert.match(P.buildRequest({ profile: 'bike', mode: 'points', points: [null, B] }).error, /^Le départ/);
    assert.match(P.buildRequest({ profile: 'bike', mode: 'points', points: [A, { lat: 95, lon: 7 }] }).error, /^L’arrivée/);
    assert.match(P.buildRequest({ profile: 'bike', mode: 'points', points: [A, { ...A }] }).error, /même endroit/);
    assert.match(P.buildRequest({ profile: 'bike', mode: 'points', points: Array.from({ length: 26 }, (_, i) => ({ lat: 48 + i * 0.01, lon: 7 })) }).error, /25 points/);
    assert.equal(P.buildRequest({ profile: 'bike', mode: 'points', points: Array.from({ length: 25 }, (_, i) => ({ lat: 48 + i * 0.01, lon: 7 })) }).ok, true);
    assert.match(P.buildRequest({ profile: 'boat', mode: 'points', points: [A, B] }).error, /profil/);
    assert.deepEqual(P.parseCoords('48.5839, 7.7455'), { lat: 48.5839, lon: 7.7455 });
    assert.equal(P.parseCoords('12 rue des Lilas'), null, 'no address is ever looked up');
});

test('a loop: start, wished length, a seed the function accepts, and only the preferences that are set', () => {
    const r = P.buildRequest({ profile: 'gravel', mode: 'loop', loop: { start: A, km: '20', seed: 7 }, prefer: { flat: true, quiet: true, unpaved: true } });
    assert.deepEqual(r, { ok: true, body: { profile: 'gravel', loop: { start: [48.58392, 7.74553], distanceM: 20000, seed: 7 }, prefer: { flat: true, quiet: true, unpaved: true } } });
    assert.ok(validInput(r.body));
    assert.equal(P.buildRequest({ profile: 'run', mode: 'loop', loop: { start: A, km: '7,5' } }).body.loop.distanceM, 7500);
    assert.deepEqual(Object.keys(P.buildRequest({ profile: 'run', mode: 'loop', loop: { start: A, km: 10 } }).body.loop), ['start', 'distanceM']);
    for (const km of ['', 'vingt', '0', '0.5', '301', '-4']) assert.match(P.buildRequest({ profile: 'run', mode: 'loop', loop: { start: A, km } }).error, /entre 1 et 300 km/, km);
    assert.match(P.buildRequest({ profile: 'run', mode: 'loop', loop: { start: null, km: 10 } }).error, /départ de la boucle/);
    // « Autre proposition »: a new seed, always inside what the function accepts, never the one just shown.
    for (let i = 0; i < 300; i++) { const s = P.newSeed(i % 100); assert.ok(Number.isInteger(s) && s >= 0 && s <= 99 && s !== i % 100); }
    assert.ok(validInput(P.buildRequest({ profile: 'run', mode: 'loop', loop: { start: A, km: 10, seed: P.newSeed(0) } }).body));
    assert.equal(P.buildRequest({ profile: 'run', mode: 'loop', loop: { start: A, km: 10, seed: 5000 } }).body.loop.seed, 99);
});

test('a usable answer becomes a plan and a route to keep or follow', () => {
    const read = P.readResponse(200, answer());
    assert.equal(read.state, 'ok');
    const plan = read.plan;
    assert.deepEqual([plan.provider, plan.profile, plan.distanceM, plan.durationS, plan.ascentM, plan.descentM], ['openrouteservice', 'gravel', 21400, 4380, 420, 418]);
    assert.match(plan.profileNote, /profil VTT/);
    assert.match(plan.attribution, /OpenStreetMap/);
    assert.deepEqual(plan.surface.map(s => [s.label, s.pct]), [['Asphalte', 62], ['Gravier', 30], ['Non renseigné', 8]]);
    assert.deepEqual(plan.waytype.map(s => s.pct), [55, 45]);
    assert.deepEqual(plan.warnings, ['Boucle demandée : 20,0 km ; boucle calculée : 21,4 km.']);
    const route = P.toRoute(plan, { sport: 'gravel', name: 'Boucle' });
    assert.deepEqual([route.origin, route.sport, route.points, route.name], ['planned', 'gravel', 120, 'Boucle']);
    assert.ok(route.distanceM > 1000 && route.ascentM !== null);
    assert.ok(N.course(route).totalM > 0, 'the outing page can follow it');
    // What the provider does not give stays unknown: no estimate is invented.
    const thin = P.readResponse(200, answer({ durationS: null, ascentM: null, descentM: null, surface: null, waytype: null, profileNote: null, warnings: 'x', segs: [[[48.5, 7.7, null], [48.51, 7.71, null]]] })).plan;
    assert.deepEqual([thin.durationS, thin.ascentM, thin.descentM, thin.surface, thin.waytype, thin.profileNote], [null, null, null, null, null, null]);
    assert.deepEqual(thin.warnings, []);
    assert.equal(P.toRoute(thin, {}).ascentM, null);
    assert.equal(P.hoursMinutes(4380), '1 h 13');
    assert.equal(P.hoursMinutes(900), '15 min');
});

test('shares: fractions or percents, largest first, a long tail gathered as « Autres »', () => {
    assert.deepEqual(P.shares([{ key: 'a', label: 'A', share: 25 }, { key: 'b', label: 'B', share: 75 }]).map(r => [r.label, r.pct]), [['B', 75], ['A', 25]]);
    const many = P.shares(Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, share: 0.2 - i * 0.01 })));
    assert.equal(many.length, 6);
    assert.equal(many[5].label, 'Autres');
    assert.ok(Math.abs(many.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
    assert.equal(P.shares([]), null);
    assert.equal(P.shares(null), null);
    assert.equal(P.shares([{ key: 'a', label: 'A', share: 0 }, { key: 'b', share: 'x' }]), null);
    assert.equal(P.shares([{ key: 'asphalt', share: 1 }])[0].label, 'asphalt');
});

test('every error code and every broken answer is one state with its own sentence', () => {
    const cases = [
        [503, { ok: false, code: 'ROUTING_NOT_CONFIGURED' }, 'not_configured'], [404, null, 'not_configured'], [404, { message: 'Not Found' }, 'not_configured'],
        [401, { ok: false, code: 'AUTH_REQUIRED' }, 'auth'], [403, { ok: false, code: 'ORIGIN_REFUSED' }, 'auth'],
        [400, { ok: false, code: 'BAD_REQUEST' }, 'bad'], [429, { ok: false, code: 'RATE_LIMITED' }, 'rate'], [422, { ok: false, code: 'NO_ROUTE' }, 'no_route'],
        [503, { ok: false, code: 'QUOTA_EXCEEDED' }, 'quota'], [502, { ok: false, code: 'UPSTREAM_UNAVAILABLE' }, 'unavailable'], [503, { ok: false, code: 'SERVICE_UNAVAILABLE' }, 'unavailable'],
        [500, null, 'unavailable'], [200, null, 'unavailable'], [200, '<!doctype html>', 'unavailable'], [200, { ok: true }, 'unavailable'],
        [200, answer({ segs: [] }), 'unavailable'], [200, answer({ segs: [[[48.5, 7.7, 1]]] }), 'unavailable'], [200, answer({ distanceM: null }), 'unavailable'], [200, answer({ distanceM: -5 }), 'unavailable'],
        [200, answer({ segs: [[['a', 'b'], [200, 500]]] }), 'unavailable'],
    ];
    for (const [status, json, state] of cases) assert.equal(P.readResponse(status, json).state, state, `${status} ${JSON.stringify(json)?.slice(0, 60)}`);
    for (const state of ['not_configured', 'offline', 'guest', 'auth', 'no_route', 'rate', 'quota', 'bad', 'unavailable']) assert.ok(P.MESSAGES[state].length > 30, state);
    assert.equal(P.MESSAGES.offline, 'Le calcul d’itinéraire demande une connexion. Tes parcours enregistrés restent utilisables.');
    assert.ok(!Object.values(P.MESSAGES).some(m => /[A-Z]{4,}_[A-Z]/.test(m)), 'no code is shown to the athlete');
    assert.ok(!/(^|[^a-zà-ÿ])sûre?s?(?![a-zà-ÿ])|sécuris/i.test(Object.values(P.MESSAGES).join(' ')), 'a route is never called safe');
});

test('a loop is shown as asked beside obtained, and every line says it is a preference', () => {
    const plan = P.readResponse(200, answer()).plan;
    const facts = P.loopFacts(plan, { distanceM: 20000, ceilingM: 300, prefer: { flat: true, quiet: false, unpaved: true } });
    assert.deepEqual(facts.map(f => f.key), ['distance', 'climb', 'prefer']);
    assert.equal(facts[0].text, 'Distance demandée : 20,0 km · obtenue : 21,4 km (+7 %). La longueur d’une boucle est une préférence, pas une garantie.');
    assert.equal(facts[1].over, true);
    assert.match(facts[1].text, /D\+ souhaité : 300 m au plus · obtenu : 420 m — au-dessus de ton souhait\. Préférence, pas garantie/);
    assert.match(facts[2].text, /plutôt plat, chemins plutôt que bitume.*préférence, pas garantie/);
    assert.ok(facts.every(f => /préférence, pas (une )?garantie/i.test(f.text)));
    const under = P.loopFacts({ ...plan, distanceM: 19000, ascentM: 250 }, { distanceM: 20000, ceilingM: 300 });
    assert.match(under[0].text, /\(−5 %\)/);
    assert.equal(under[1].over, false);
    assert.ok(!/au-dessus/.test(under[1].text));
    // The provider gave no climb: the wish cannot be checked, and the screen says exactly that.
    assert.match(P.loopFacts({ ...plan, ascentM: null }, { distanceM: 20000, ceilingM: 300 })[1].text, /ne donne pas le dénivelé.*impossible de comparer/);
    assert.deepEqual(P.loopFacts(plan, { distanceM: 20000 }).map(f => f.key), ['distance']);
    assert.equal(P.loopFacts({ ...plan, distanceM: 20000 }, { distanceM: 20000 })[0].text.includes('%'), false, 'no gap, no percentage');
    assert.deepEqual(P.loopFacts(plan, { prefer: { quiet: true } }).map(f => f.key), ['prefer'], 'a line through points only recalls its preferences');
});

test('the file sends no analytics event and talks only to its own function', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../js/app/planifier.js', import.meta.url), 'utf8');
    assert.ok(!/https?:\/\//.test(src), 'no external address: the provider is reached by the server, never by the browser');
    assert.deepEqual([...src.matchAll(/fetch\(\s*"([^"]+)"/g)].map(m => m[1]), ['/.netlify/functions/route-plan']);
    assert.ok(!/titanTrack|gtag\(|sendBeacon|TitanAnalytics/.test(src));
    assert.match(src, /docs\/V177_CARTES_ET_ROUTAGE\.md/);
});
