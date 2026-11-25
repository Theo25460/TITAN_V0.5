// V1.7.7 — route computation, server side. DISABLED until the owner sets ROUTING_PROVIDER and ROUTING_API_KEY (docs/V177_CARTES_ET_ROUTAGE.md):
// nothing in this file contains a key, and no account, plan or key was created by the code. The key lives only in the server
// environment; it is never logged, never returned and never part of an error.
//   POST (signed-in athlete, Bearer; the website from its own origin, the Android app without an Origin header, as for functions/garmin.mjs)
//   { profile, points: [[lat, lon], …] }  or  { profile, loop: { start: [lat, lon], distanceM, seed? } },  prefer?: { flat?, quiet?, unpaved? }
// The athlete's points are sent to the provider WITHOUT any identity: no account id, no e-mail, no token, no address of the device.
// One provider-agnostic contract, two adapters (openrouteservice first, GraphHopper second), both pure: buildRequest() and normalise()
// take and return plain data, so the tests feed them answers of the recorded shape.
// UNVERIFIED AGAINST THE LIVE SERVICES: the build container cannot reach either provider. The request and answer shapes below are
// written from the public API references (openrouteservice v2 « directions/{profile}/geojson », GraphHopper « POST /route ») and
// must be confirmed with one real call per adapter before the function is switched on.
// A computed route is an indication built from OpenStreetMap data: it is never presented as safe, legal or passable.
import { readBoundedBytes } from './request-body.mjs';

const MAX_BODY = 8 * 1024;
const UPSTREAM_TIMEOUT_MS = 12_000;
const MAX_POINTS_OUT = 12_000; // the ceiling of one recording in js/core/gps-engine.js: a longer geometry is thinned, never cut
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILES = ['road', 'bike', 'gravel', 'mtb', 'run', 'walk', 'hike'];
const PREFERENCES = ['flat', 'quiet', 'unpaved'];
const DEFAULT_BASE = { openrouteservice: 'https://api.openrouteservice.org', graphhopper: 'https://graphhopper.com/api/1' };
const OSM_CREDIT = '© les contributeurs d’OpenStreetMap';
const ATTRIBUTION = {
    openrouteservice: `Itinéraire : openrouteservice.org (HeiGIT) · Données ${OSM_CREDIT}`,
    graphhopper: `Itinéraire : GraphHopper · Données ${OSM_CREDIT}`
};
// TITAN profile → provider profile. `note` says what the provider computed instead when it has no such profile; `noDuration` drops an
// estimate made for another pace (a walking time is not a running time).
const PROFILE_MAP = {
    openrouteservice: {
        road: { id: 'cycling-road' }, bike: { id: 'cycling-regular' }, mtb: { id: 'cycling-mountain' },
        gravel: { id: 'cycling-mountain', note: 'Le fournisseur n’a pas de profil gravel : calcul avec le profil VTT.' },
        walk: { id: 'foot-walking' }, hike: { id: 'foot-hiking' },
        run: { id: 'foot-walking', noDuration: true, note: 'Le fournisseur n’a pas de profil course à pied : calcul avec le profil marche, sans durée estimée.' }
    },
    graphhopper: {
        road: { id: 'racingbike' }, bike: { id: 'bike' }, mtb: { id: 'mtb' },
        gravel: { id: 'mtb', note: 'Le fournisseur n’a pas de profil gravel : calcul avec le profil VTT.' },
        walk: { id: 'foot' }, hike: { id: 'hike' },
        run: { id: 'foot', noDuration: true, note: 'Le fournisseur n’a pas de profil course à pied : calcul avec le profil marche, sans durée estimée.' }
    }
};
const SURFACE_LABEL = {
    asphalt: 'Asphalte', paved: 'Revêtu', concrete: 'Béton', paving_stones: 'Dalles et pavés lisses', cobblestone: 'Pavés', compacted: 'Stabilisé',
    fine_gravel: 'Gravier fin', gravel: 'Gravier', unpaved: 'Non revêtu', dirt: 'Terre', ground: 'Sol naturel', grass: 'Herbe', sand: 'Sable',
    wood: 'Bois', metal: 'Métal', ice: 'Glace', other: 'Autre', unknown: 'Non renseigné'
};
const WAYTYPE_LABEL = {
    road_major: 'Route principale', road: 'Route', street: 'Rue', path: 'Sentier', track: 'Chemin', cycleway: 'Piste cyclable', footway: 'Voie piétonne',
    steps: 'Escaliers', ferry: 'Ferry', construction: 'Voie en travaux', other: 'Autre', unknown: 'Non renseigné'
};
// openrouteservice « extra_info » codes (surface, waytype), in the order of its reference tables (16 woodchips and 18 grass paver have
// no TITAN name: « Autre »). Written from the public reference, to confirm with the first real answer like the rest of the shape.
const ORS_SURFACE = ['unknown', 'paved', 'unpaved', 'asphalt', 'concrete', 'cobblestone', 'metal', 'wood', 'compacted', 'fine_gravel', 'gravel', 'dirt', 'ground',
    'ice', 'paving_stones', 'sand', 'other', 'grass', 'other'];
const ORS_WAYTYPE = ['unknown', 'road_major', 'road', 'street', 'path', 'track', 'cycleway', 'footway', 'steps', 'ferry', 'construction'];
// GraphHopper path details are words: « surface » is used as it is when TITAN names it, « road_class » is grouped.
const GH_SURFACE = { missing: 'unknown' };
const GH_ROAD_CLASS = {
    motorway: 'road_major', trunk: 'road_major', primary: 'road_major', secondary: 'road', tertiary: 'road', unclassified: 'road', road: 'road',
    residential: 'street', living_street: 'street', service: 'street', track: 'track', path: 'path', bridleway: 'path', cycleway: 'cycleway',
    footway: 'footway', pedestrian: 'footway', platform: 'footway', corridor: 'footway', steps: 'steps', construction: 'construction', other: 'other'
};

const env = name => String(globalThis.Netlify?.env?.get(name) || '');
export const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
const refuse = (status, code) => reply(status, { ok: false, code });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const km = metres => (Math.round(metres / 100) / 10).toFixed(1).replace('.', ',');
const round = (value, digits) => { const f = 10 ** digits; return Math.round(value * f) / f; };

/** [lat, lon] as two finite numbers in range, or null. Nothing else is ever sent to a provider. */
export function coordinate(value) {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [lat, lon] = value;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [round(lat, 6), round(lon, 6)];
}

/** The validated request, or null. Exactly one of « points » and « loop »; no other key is accepted. */
export function validInput(body) {
    if (!plain(body) || !onlyKeys(body, ['profile', 'points', 'loop', 'prefer']) || typeof body.profile !== 'string' || !PROFILES.includes(body.profile)) return null;
    if ((body.points === undefined) === (body.loop === undefined)) return null;
    const input = { profile: body.profile };
    if (body.points !== undefined) {
        if (!Array.isArray(body.points) || body.points.length < 2 || body.points.length > 25) return null;
        input.points = body.points.map(coordinate);
        if (input.points.includes(null)) return null;
    } else {
        const loop = body.loop;
        if (!plain(loop) || !onlyKeys(loop, ['start', 'distanceM', 'seed'])) return null;
        const start = coordinate(loop.start);
        if (!start || typeof loop.distanceM !== 'number' || !Number.isFinite(loop.distanceM) || loop.distanceM < 1000 || loop.distanceM > 300000) return null;
        if (loop.seed !== undefined && (!Number.isInteger(loop.seed) || loop.seed < 0 || loop.seed > 99)) return null;
        input.loop = { start, distanceM: Math.round(loop.distanceM), seed: loop.seed ?? 0 };
    }
    input.prefer = {};
    if (body.prefer !== undefined) {
        if (!plain(body.prefer) || !onlyKeys(body.prefer, PREFERENCES)) return null;
        for (const key of PREFERENCES) {
            if (body.prefer[key] === undefined) continue;
            if (typeof body.prefer[key] !== 'boolean') return null;
            if (body.prefer[key]) input.prefer[key] = true;
        }
    }
    return input;
}

/** An https address without credentials, query or fragment, trailing slashes removed; '' when it is not one. */
export function httpsBase(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
        return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
    } catch (_) { return ''; }
}

/** What the server environment says about routing: null unless a known provider and its key (or a self-hosted address) are set. */
export function routingConfig(read = env) {
    const provider = read('ROUTING_PROVIDER'), key = read('ROUTING_API_KEY'), custom = read('ROUTING_BASE_URL');
    if (!Object.hasOwn(DEFAULT_BASE, provider)) return null;
    const base = custom ? httpsBase(custom) : DEFAULT_BASE[provider];
    // A hosted plan always needs its key; an instance the owner hosts may have none.
    if (!base || (!custom && !key) || /[\s\x00-\x1f\x7f]/.test(key)) return null;
    return { provider, key, base };
}

/** Which preferences the provider can honour for this profile: { applied: [...], ignored: [...] }. */
function preferences(provider, input) {
    const asked = PREFERENCES.filter(key => input.prefer?.[key]);
    const cycling = ['road', 'bike', 'gravel', 'mtb'].includes(input.profile);
    // openrouteservice: « steepness_difficulty » exists for the cycling profiles, « quiet » for the foot profiles; nothing prefers unpaved ways.
    // GraphHopper: a preference needs a custom model (flexible mode), which the adapter does not send: nothing is applied.
    const applied = provider === 'openrouteservice' ? asked.filter(key => (key === 'flat' && cycling) || (key === 'quiet' && !cycling)) : [];
    return { applied, ignored: asked.filter(key => !applied.includes(key)) };
}

/** The upstream call for a validated input: { url, init }. Pure; the key appears only where the provider reads it. */
export function buildRequest(provider, input, config) {
    const profile = PROFILE_MAP[provider][input.profile].id;
    const lonLat = ([lat, lon]) => [lon, lat];
    const { applied } = preferences(provider, input);
    if (provider === 'openrouteservice') {
        const body = { coordinates: (input.loop ? [input.loop.start] : input.points).map(lonLat), elevation: true, instructions: false, extra_info: ['surface', 'waytype'] };
        const options = {};
        if (input.loop) options.round_trip = { length: input.loop.distanceM, seed: input.loop.seed };
        const weightings = {};
        if (applied.includes('flat')) weightings.steepness_difficulty = 0;
        if (applied.includes('quiet')) weightings.quiet = 1;
        if (Object.keys(weightings).length) options.profile_params = { weightings };
        if (Object.keys(options).length) body.options = options;
        const headers = { 'Content-Type': 'application/json', Accept: 'application/geo+json, application/json' };
        if (config.key) headers.Authorization = config.key;
        return { url: `${config.base}/v2/directions/${profile}/geojson`, init: { method: 'POST', headers, body: JSON.stringify(body) } };
    }
    const body = { profile, points: (input.loop ? [input.loop.start] : input.points).map(lonLat), points_encoded: false, elevation: true, instructions: false,
        calc_points: true, details: ['surface', 'road_class'] };
    if (input.loop) Object.assign(body, { algorithm: 'round_trip', 'round_trip.distance': input.loop.distanceM, 'round_trip.seed': input.loop.seed, 'ch.disable': true });
    return {
        url: `${config.base}/route${config.key ? `?key=${encodeURIComponent(config.key)}` : ''}`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }
    };
}

const RADIUS = 6371008.8;
function metresBetween(a, b) {
    const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** GeoJSON positions [lon, lat, ele?] → [[lat, lon, ele|null], …], or null when one of them is not a position. */
function track(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const out = [];
    for (const c of coordinates) {
        if (!Array.isArray(c) || !coordinate([c[1], c[0]])) return null;
        out.push([round(c[1], 5), round(c[0], 5), typeof c[2] === 'number' && Number.isFinite(c[2]) ? round(c[2], 1) : null]);
    }
    return out;
}

/** Shares by key, largest first: [{ key, label, share }]. `rows` is [[key, metres], …]; null when there is nothing to share out. */
function shares(rows, labels) {
    const sums = new Map();
    let total = 0;
    for (const [key, metres] of rows) {
        if (!(metres > 0)) continue;
        const known = Object.hasOwn(labels, key) ? key : 'other';
        sums.set(known, (sums.get(known) || 0) + metres);
        total += metres;
    }
    if (!(total > 0)) return null;
    return [...sums].map(([key, metres]) => ({ key, label: labels[key], share: round(metres / total, 3) })).sort((a, b) => b.share - a.share || a.key.localeCompare(b.key));
}

// openrouteservice: extras.<name>.summary = [{ value, distance, amount }]; the answer names « waytypes » what the request names « waytype ».
function orsShares(extra, table, labels) {
    if (!Array.isArray(extra?.summary)) return null;
    return shares(extra.summary.filter(row => plain(row) && Number.isInteger(row.value) && typeof row.distance === 'number')
        .map(row => [table[row.value] || 'other', row.distance]), labels);
}
// GraphHopper: details.<name> = [[from, to, value], …], indexes into the points of the path.
function ghShares(detail, points, map, labels) {
    if (!Array.isArray(detail)) return null;
    const rows = [];
    for (const row of detail) {
        if (!Array.isArray(row) || !Number.isInteger(row[0]) || !Number.isInteger(row[1]) || row[0] < 0 || row[1] >= points.length || row[1] <= row[0]) continue;
        let metres = 0;
        for (let i = row[0]; i < row[1]; i++) metres += metresBetween(points[i], points[i + 1]);
        const word = typeof row[2] === 'string' ? row[2].toLowerCase() : 'missing';
        rows.push([map[word] || word, metres]); // a word TITAN does not name is counted as « Autre » by shares()
    }
    return shares(rows, labels);
}

/** Keeps at most `max` points, the first and the last included, evenly spread. */
function thin(points, max) {
    if (points.length <= max) return points;
    const out = [], step = (points.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
    return out;
}

/** The provider's answer in TITAN's contract, or null when it is not the expected shape. Nothing of the upstream text is copied. */
export function normalise(provider, input, upstream) {
    const mapped = PROFILE_MAP[provider]?.[input.profile];
    if (!mapped || !plain(upstream)) return null;
    const warnings = [];
    let points, distance, duration, ascent, descent, surface, waytype;
    if (provider === 'openrouteservice') {
        const feature = Array.isArray(upstream.features) ? upstream.features[0] : null, properties = feature?.properties;
        points = track(feature?.geometry?.coordinates);
        if (!points || !plain(properties) || !plain(properties.summary)) return null;
        distance = properties.summary.distance; duration = properties.summary.duration;
        // The GeoJSON answer carries the climb beside the summary, the JSON answer inside it: both are read.
        ascent = properties.ascent ?? properties.summary.ascent; descent = properties.descent ?? properties.summary.descent;
        surface = orsShares(properties.extras?.surface, ORS_SURFACE, SURFACE_LABEL);
        waytype = orsShares(properties.extras?.waytypes ?? properties.extras?.waytype, ORS_WAYTYPE, WAYTYPE_LABEL);
        // Provider warnings are told by their code only: 1 access restrictions, 3 skipped segments, 4 skipped extra information.
        const codes = new Set((Array.isArray(properties.warnings) ? properties.warnings : []).map(w => (plain(w) ? w.code : null)));
        if (codes.has(1)) warnings.push('Le fournisseur signale des restrictions d’accès possibles (voie privée ou interdite) sur une partie de l’itinéraire : vérifie sur place.');
        if (codes.has(3)) warnings.push('Une partie de l’itinéraire n’a pas pu être calculée par le fournisseur : le tracé peut être incomplet.');
        if ([...codes].some(code => code !== null && ![1, 3, 4].includes(code))) warnings.push('Le fournisseur a émis un avertissement sur cet itinéraire : vérifie le tracé avant de partir.');
    } else {
        const path = Array.isArray(upstream.paths) ? upstream.paths[0] : null;
        points = track(path?.points?.coordinates);
        if (!points || !plain(path)) return null;
        distance = path.distance; duration = typeof path.time === 'number' ? path.time / 1000 : null;
        ascent = path.ascend; descent = path.descend;
        surface = ghShares(path.details?.surface, points, GH_SURFACE, SURFACE_LABEL);
        waytype = ghShares(path.details?.road_class, points, GH_ROAD_CLASS, WAYTYPE_LABEL);
    }
    if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) return null;
    const number = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);
    const hasAltitude = points.every(p => p[2] !== null);
    if (!hasAltitude) for (const p of points) p[2] = null; // a half-known profile is not a profile
    const ascentM = hasAltitude ? number(ascent) : null, descentM = hasAltitude ? number(descent) : null;
    if (!hasAltitude) warnings.push('Altitude non communiquée par le fournisseur : dénivelé indisponible pour cet itinéraire.');
    else if (ascentM === null) warnings.push('Dénivelé non communiqué par le fournisseur pour cet itinéraire.');
    if (!surface) warnings.push('Revêtement non communiqué par le fournisseur pour cet itinéraire.');
    if (!waytype) warnings.push('Type de voie non communiqué par le fournisseur pour cet itinéraire.');
    const unknown = surface?.find(row => row.key === 'unknown')?.share || 0;
    if (unknown >= 0.2) warnings.push(`Revêtement non renseigné dans OpenStreetMap sur ${Math.round(unknown * 100)} % de l’itinéraire.`);
    const { ignored } = preferences(provider, input);
    const wording = { flat: 'éviter le relief', quiet: 'voies calmes', unpaved: 'chemins non revêtus' };
    for (const key of ignored) warnings.push(`Préférence « ${wording[key]} » non prise en charge par le fournisseur pour ce profil : elle n’a pas été appliquée.`);
    if (input.loop && Math.abs(distance - input.loop.distanceM) > input.loop.distanceM * 0.1) {
        warnings.push(`Boucle demandée : ${km(input.loop.distanceM)} km ; boucle calculée : ${km(distance)} km.`);
    }
    if (points.length > MAX_POINTS_OUT) warnings.push(`Tracé allégé : ${MAX_POINTS_OUT.toLocaleString('fr-FR').replace(/\s/g, ' ')} points gardés sur ${points.length.toLocaleString('fr-FR').replace(/\s/g, ' ')}, du départ à l’arrivée.`);
    return {
        ok: true, provider, attribution: ATTRIBUTION[provider], attributionUrl: 'https://www.openstreetmap.org/copyright',
        profile: input.profile, profileNote: mapped.note || null,
        distanceM: Math.round(distance), durationS: mapped.noDuration ? null : number(duration), ascentM, descentM,
        segs: [thin(points, MAX_POINTS_OUT)], surface, waytype, warnings,
        requested: { profile: input.profile, ...(input.loop ? { loop: input.loop } : { points: input.points }), prefer: input.prefer }
    };
}

/** True when the provider's refusal says « no route between these points » (by its code or exception name, never by its prose). */
export function noRoute(provider, status, data) {
    if (status < 400 || status >= 500 || !plain(data)) return false;
    // openrouteservice: 2004 request beyond the plan's distance, 2009 no route found, 2010 no routable point near a coordinate.
    if (provider === 'openrouteservice') return [2004, 2009, 2010].includes(data.error?.code);
    const names = (Array.isArray(data.hints) ? data.hints : []).map(hint => (plain(hint) ? String(hint.details || '') : ''));
    return names.some(name => /(?:PointNotFound|ConnectionNotFound|PointDistanceExceeded|MaximumNodesExceeded)Exception$/.test(name));
}

async function network(url, init, timeout = 8_000) {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeout) });
    let data = null; try { data = await response.json(); } catch (_) { /* Upstream bodies are never reflected. */ }
    return { ok: response.ok, status: response.status, data };
}

/** The checks both location functions share before anything leaves for a provider: method, JSON, origin, Supabase configuration,
    bearer, bounded body, the account behind the token and its quota. Returns { body } or { response }. `configured` is checked
    before the athlete's token is read, so an unconfigured function answers the same to everyone. */
export async function gate(request, { configured, notConfigured, quotaRpc, maxBody = MAX_BODY }) {
    if (request.method !== 'POST') return { response: refuse(405, 'METHOD_NOT_ALLOWED') };
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) return { response: refuse(415, 'JSON_REQUIRED') };
    // The website calls from its own origin; the Android application sends no Origin header and is known by its bearer alone.
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return { response: refuse(403, 'ORIGIN_REFUSED') };
    const url = httpsBase(env('SUPABASE_URL')), publishable = env('SUPABASE_PUBLISHABLE_KEY');
    let root = false; try { root = new URL(url).pathname === '/'; } catch (_) { /* Fail closed. */ }
    if (!configured || !root || !publishable) return { response: refuse(503, notConfigured) };
    const bearer = request.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer)) return { response: refuse(401, 'AUTH_REQUIRED') };
    let body;
    try {
        const raw = await readBoundedBytes(request, maxBody);
        if (raw === null) return { response: refuse(413, 'BODY_TOO_LARGE') };
        body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    } catch (_) { return { response: refuse(400, 'BAD_REQUEST') }; }
    return { body, async account() {
        // The quota is asked with the athlete's own token: the function holds no service key.
        const headers = { apikey: publishable, Authorization: bearer, Accept: 'application/json' };
        try {
            const auth = await network(`${url}/auth/v1/user`, { method: 'GET', headers });
            if (!auth.ok) return auth.status === 401 || auth.status === 403 ? refuse(401, 'AUTH_REQUIRED') : refuse(503, 'SERVICE_UNAVAILABLE');
            if (!plain(auth.data) || typeof auth.data.id !== 'string' || !UUID.test(auth.data.id) || auth.data.is_anonymous !== false) return refuse(401, 'AUTH_REQUIRED');
            const quota = await network(`${url}/rest/v1/rpc/${quotaRpc}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
            if (quota.status === 401 || quota.status === 403) return refuse(401, 'AUTH_REQUIRED');
            // Without an answer from the counter nothing is sent to the provider: its quota is shared by every athlete.
            if (!quota.ok || typeof quota.data !== 'boolean') return refuse(503, 'SERVICE_UNAVAILABLE');
            return quota.data ? null : refuse(429, 'RATE_LIMITED');
        } catch (_) { return refuse(503, 'SERVICE_UNAVAILABLE'); }
    } };
}

export default async function handler(request) {
    const config = routingConfig();
    const gated = await gate(request, { configured: !!config, notConfigured: 'ROUTING_NOT_CONFIGURED', quotaRpc: 'titan_route_plan_quota_v1' });
    if (gated.response) return gated.response;
    const input = validInput(gated.body);
    if (!input) return refuse(400, 'BAD_REQUEST');
    const refused = await gated.account();
    if (refused) return refused;
    let upstream;
    try {
        const { url, init } = buildRequest(config.provider, input, config);
        upstream = await network(url, init, UPSTREAM_TIMEOUT_MS);
    } catch (_) { return refuse(502, 'UPSTREAM_UNAVAILABLE'); } // a timeout, a refused connection, a redirect: never the reason, which may name the key
    if (upstream.status === 429 || upstream.status === 403) return refuse(503, 'QUOTA_EXCEEDED');
    if (upstream.status === 401) return refuse(503, 'ROUTING_NOT_CONFIGURED'); // the provider does not know this key
    if (noRoute(config.provider, upstream.status, upstream.data)) return refuse(422, 'NO_ROUTE');
    if (!upstream.ok) return refuse(502, 'UPSTREAM_UNAVAILABLE');
    const route = normalise(config.provider, input, upstream.data);
    return route ? reply(200, route) : refuse(502, 'UPSTREAM_UNAVAILABLE');
}
