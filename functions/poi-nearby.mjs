// V1.7.7 — useful points near a place or along a route (water, toilets, shelters, bike repair…), read from OpenStreetMap through an
// Overpass API instance the OWNER chooses. DISABLED until POI_OVERPASS_URL is set (docs/V177_CARTES_ET_ROUTAGE.md): there is no default
// address in the code. The public instance, https://overpass-api.de/api/interpreter, has fair-use limits and gives no guarantee: it is
// an example for a first trial, not a production choice.
//   POST (signed-in athlete, Bearer; same checks as functions/route-plan.mjs)
//   { kinds: ["water", …], around: { lat, lon, radiusM } }  or  { kinds, along: { points: [[lat, lon], …], radiusM } }
// The query is written HERE, from numbers this file validated and tags of its own table: no text of the athlete ever enters it.
// The zone asked for is sent to the instance WITHOUT any identity: no account id, no e-mail, no token.
// What comes back is what OpenStreetMap contributors wrote, with the date they last changed it: opening hours are passed on as
// written, never read as « open now », and a point on the map is not a promise that the tap runs or the shelter is unlocked.
// UNVERIFIED AGAINST A LIVE INSTANCE: the build container cannot reach one. The query syntax and the answer shape follow the public
// Overpass API reference and must be confirmed with one real call before the function is switched on.
import { coordinate, gate, httpsBase, reply } from './route-plan.mjs';

const UPSTREAM_TIMEOUT_MS = 12_000;
const MAX_POIS = 200;
const refuse = (status, code) => reply(status, { ok: false, code });
const env = name => String(globalThis.Netlify?.env?.get(name) || '');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const radius = (value, min, max) => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : null);

// kind → the tag filters that make an OpenStreetMap object one of them. Each filter is [[key, value], …], all required.
// The kinds are those of the athlete's own points (private.titan_places), « other » left out.
export const KINDS = {
    water: [[['amenity', 'drinking_water']], [['man_made', 'water_tap'], ['drinking_water', 'yes']], [['natural', 'spring'], ['drinking_water', 'yes']]],
    toilets: [[['amenity', 'toilets']]],
    shelter: [[['amenity', 'shelter']], [['tourism', 'wilderness_hut']], [['tourism', 'alpine_hut']]],
    bike_repair: [[['amenity', 'bicycle_repair_station']], [['shop', 'bicycle']]],
    food: [[['shop', 'bakery']], [['shop', 'convenience']], [['shop', 'supermarket']], [['amenity', 'cafe']], [['amenity', 'restaurant']], [['amenity', 'fast_food']]],
    viewpoint: [[['tourism', 'viewpoint']]],
    parking: [[['amenity', 'parking']]]
};

/** The validated request, or null. Exactly one of « around » and « along »; no other key is accepted. */
export function validInput(body) {
    if (!plain(body) || !onlyKeys(body, ['kinds', 'around', 'along']) || (body.around === undefined) === (body.along === undefined)) return null;
    if (!Array.isArray(body.kinds) || body.kinds.length < 1 || body.kinds.length > Object.keys(KINDS).length) return null;
    if (!body.kinds.every(kind => typeof kind === 'string' && Object.hasOwn(KINDS, kind)) || new Set(body.kinds).size !== body.kinds.length) return null;
    const input = { kinds: Object.keys(KINDS).filter(kind => body.kinds.includes(kind)) };
    if (body.around !== undefined) {
        const around = body.around;
        if (!plain(around) || !onlyKeys(around, ['lat', 'lon', 'radiusM'])) return null;
        const centre = coordinate([around.lat, around.lon]), radiusM = radius(around.radiusM, 100, 5000);
        if (!centre || radiusM === null) return null;
        input.around = { lat: centre[0], lon: centre[1], radiusM };
    } else {
        const along = body.along;
        if (!plain(along) || !onlyKeys(along, ['points', 'radiusM']) || !Array.isArray(along.points) || along.points.length < 2 || along.points.length > 60) return null;
        const points = along.points.map(coordinate), radiusM = radius(along.radiusM, 50, 500);
        if (points.includes(null) || radiusM === null) return null;
        input.along = { points, radiusM };
    }
    return input;
}

/** The Overpass QL of a validated request. Only numbers formatted here and the tags of KINDS reach the text. */
export function buildQuery(input) {
    const number = value => { const text = Number(value).toFixed(6); if (!/^-?\d{1,3}\.\d{6}$/.test(text)) throw new Error('BAD_NUMBER'); return text; };
    const whole = value => { if (!Number.isInteger(value) || value < 1 || value > 5000) throw new Error('BAD_NUMBER'); return String(value); };
    const where = input.around
        ? `(around:${whole(input.around.radiusM)},${number(input.around.lat)},${number(input.around.lon)})`
        : `(around:${whole(input.along.radiusM)},${input.along.points.map(([lat, lon]) => `${number(lat)},${number(lon)}`).join(',')})`;
    const lines = input.kinds.flatMap(kind => KINDS[kind].map(filter => `  nwr${filter.map(([key, value]) => `["${key}"="${value}"]`).join('')}${where};`));
    // One more than the ceiling is asked for, to know whether the answer was cut. « meta » carries the date of the last change.
    return `[out:json][timeout:10];\n(\n${lines.join('\n')}\n);\nout meta center ${MAX_POIS + 1};`;
}

/** The upstream call: { url, init }. Pure. */
export function buildRequest(input, endpoint) {
    return { url: endpoint, init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json', 'User-Agent': 'TITAN poi-nearby (titan-app.fr)' },
        body: `data=${encodeURIComponent(buildQuery(input))}` } };
}

// A contributor's text, kept as text: control characters removed, bounded. null when there is nothing to show.
const text = (value, max) => {
    if (typeof value !== 'string') return null;
    const clean = value.replace(/[\x00-\x1f\x7f-\x9f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    return clean || null;
};
const kindOf = (tags, kinds) => kinds.find(kind => KINDS[kind].some(filter => filter.every(([key, value]) => tags[key] === value))) || null;
const RADIUS = 6371008.8;
function metresBetween(a, b) {
    const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The instance's answer in TITAN's contract, or null when it is not an Overpass answer. `fetchedAt` is the caller's clock. */
export function normalise(input, upstream, fetchedAt) {
    if (!plain(upstream) || !Array.isArray(upstream.elements)) return null;
    const seen = new Set(), pois = [];
    for (const element of upstream.elements) {
        if (!plain(element) || !['node', 'way', 'relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.id <= 0 || !plain(element.tags)) continue;
        const position = coordinate(element.type === 'node' ? [element.lat, element.lon] : [element.center?.lat, element.center?.lon]);
        const kind = kindOf(element.tags, input.kinds), id = `${element.type}/${element.id}`;
        if (!position || !kind || seen.has(id)) continue;
        seen.add(id);
        pois.push({
            id, kind, lat: position[0], lon: position[1], name: text(element.tags.name, 120),
            openingHours: text(element.tags.opening_hours, 200), fee: text(element.tags.fee, 40), access: text(element.tags.access, 40),
            osmUpdatedAt: typeof element.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(element.timestamp) ? element.timestamp : null
        });
    }
    // Around a place, the nearest first: when the answer is cut, the farthest are the ones left out.
    if (input.around) {
        const centre = [input.around.lat, input.around.lon];
        pois.sort((a, b) => metresBetween(centre, [a.lat, a.lon]) - metresBetween(centre, [b.lat, b.lon]));
    }
    const base = upstream.osm3s?.timestamp_osm_base;
    return {
        ok: true, source: 'OpenStreetMap', license: 'ODbL', licenseUrl: 'https://www.openstreetmap.org/copyright', attribution: '© les contributeurs d’OpenStreetMap',
        fetchedAt, osmBaseAt: typeof base === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(base) ? base : null,
        pois: pois.slice(0, MAX_POIS),
        // Cut by the ceiling, or by the instance itself (a « remark » is how Overpass reports a query it stopped early).
        truncated: upstream.elements.length > MAX_POIS || pois.length > MAX_POIS || typeof upstream.remark === 'string'
    };
}

export default async function handler(request) {
    const endpoint = httpsBase(env('POI_OVERPASS_URL'));
    const gated = await gate(request, { configured: !!endpoint, notConfigured: 'POI_NOT_CONFIGURED', quotaRpc: 'titan_poi_quota_v1' });
    if (gated.response) return gated.response;
    const input = validInput(gated.body);
    if (!input) return refuse(400, 'BAD_REQUEST');
    const refused = await gated.account();
    if (refused) return refused;
    let status, data = null;
    try {
        const { url, init } = buildRequest(input, endpoint);
        const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
        status = response.status;
        try { data = await response.json(); } catch (_) { /* Upstream bodies are never reflected. */ }
    } catch (_) { return refuse(502, 'UPSTREAM_UNAVAILABLE'); }
    // 429: this server asked too much of the instance. 403: the instance refuses this server (public instances block some hosts).
    if (status === 429 || status === 403) return refuse(503, 'QUOTA_EXCEEDED');
    if (status < 200 || status >= 300) return refuse(502, 'UPSTREAM_UNAVAILABLE');
    const result = normalise(input, data, new Date().toISOString());
    // A query the instance stopped before finding anything is a failure, not « nothing here ».
    if (!result || (result.pois.length === 0 && typeof data.remark === 'string')) return refuse(502, 'UPSTREAM_UNAVAILABLE');
    return reply(200, result);
}
