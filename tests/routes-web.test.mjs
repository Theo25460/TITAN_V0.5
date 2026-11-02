// Web side of the route library: decoding, projection, GPX and the sharing trim are pure and tested here with the same trace shape the app uploads.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../js/app/parcours.js');

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
const doc = (n, alt = true) => ({ v: 1, t0: T0, segs: [Array.from({ length: n }, (_, i) => [Math.round((48.85 + i * 0.000045) * 1e5), Math.round(2.35 * 1e5), i, alt ? 1000 + i : null])] });
const hav = (a, b) => { const r = 6371008.8, d = x => x * Math.PI / 180, h = Math.sin(d(b.lat - a.lat) / 2) ** 2 + Math.cos(d(a.lat)) * Math.cos(d(b.lat)) * Math.sin(d(b.lon - a.lon) / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); };

test('decode reads the compact trace and drops anything malformed', () => {
    const segs = R.decode(doc(10));
    assert.equal(segs.length, 1);
    assert.equal(segs[0].length, 10);
    assert.ok(Math.abs(segs[0][3].lat - (48.85 + 3 * 0.000045)) < 1e-5);
    assert.equal(segs[0][3].t, T0 + 3000);
    assert.equal(segs[0][3].alt, 100.3);
    assert.deepEqual(R.decode(null), []);
    assert.deepEqual(R.decode({ v: 2, segs: [] }), []);
    const bad = { v: 1, t0: T0, segs: [[[1, 1, 0, null], 'x', [99999999, 0, 0, null], [4, 4]], 'nope'] };
    assert.equal(R.decode(bad).flat().length, 1);
});

test('projection fits the box, keeps north up, marks start and end', () => {
    const p = R.project(R.decode(doc(60)), 360, 220);
    const pts = p.lines.flat();
    assert.ok(pts.every(q => q.x >= 0 && q.x <= 360 && q.y >= 0 && q.y <= 220));
    assert.ok(p.start.y > p.end.y, 'heading north: the end is higher on screen');
    assert.deepEqual(R.project([], 360, 220), { lines: [], start: null, end: null });
});

test('GPX has one segment per stretch, escapes the name, and the share variant has no time or altitude', () => {
    const segs = R.decode({ v: 1, t0: T0, segs: [doc(5).segs[0], doc(5).segs[0]] });
    const g = R.gpx(segs, 'Sortie <test> & co');
    assert.equal(g.match(/<trkseg>/g).length, 2);
    assert.match(g, /Sortie &lt;test&gt; &amp; co/);
    assert.match(g, /<time>2026-11-02T08:00:00\.000Z<\/time>/);
    assert.match(g, /<ele>100\.0<\/ele>/);
    const shared = R.gpx(segs, 'x', { time: false, ele: false });
    assert.ok(!shared.includes('<time>') && !shared.includes('<ele>'));
});

test('the sharing trim removes 300 m at both ends, and refuses a route too short to hide them', () => {
    const all = R.decode(doc(400));
    const t = R.trimEnds(all);
    const pts = t.flat(), first = all[0][0], last = all[0][all[0].length - 1];
    assert.ok(pts.length < all[0].length);
    assert.ok(pts.every(p => hav(p, first) >= R.SHARE_TRIM_M - 10 && hav(p, last) >= R.SHARE_TRIM_M - 10));
    assert.equal(R.trimEnds(R.decode(doc(60))), null);
    assert.equal(R.trimEnds(R.decode(doc(3))), null);
});

test('the web never contacts a map server and never publishes: the module only calls the account\'s own route functions', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../js/app/parcours.js', import.meta.url), 'utf8');
    assert.ok(!/https?:\/\/(?!www\.topografix\.com|www\.w3\.org)/.test(src), 'no external address');
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(src), 'no network call of its own');
    const calls = [...src.matchAll(/"(titan_[a-z_]+_v1)"/g)].map(m => m[1]);
    assert.deepEqual([...new Set(calls)].sort(), ['titan_route_delete_v1', 'titan_route_for_event_v1', 'titan_route_get_v1', 'titan_routes_v1']);
});
