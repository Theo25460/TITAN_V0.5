/* V1.7.7 — map arithmetic of the outing page: projection, fit, tiles of a viewport, scale bar, tile estimate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/core/gps-map.js');
const E = require('../js/core/gps-engine.js');

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
const STRASBOURG = { lat: 48.58, lon: 7.75 };

test('projection: a position goes to world pixels and back, at whole and fractional zooms', () => {
  for (const p of [STRASBOURG, { lat: -33.86, lon: 151.21 }, { lat: 0, lon: 0 }, { lat: 64.15, lon: -21.94 }, { lat: 84.9, lon: 179.9 }])
    for (const z of [2, 9, 13.4, 17, 19]) {
      const w = M.worldPx(p.lat, p.lon, z), back = M.fromWorldPx(w.x, w.y, z);
      near(back.lat, p.lat, 1e-9, `lat at z${z}`); near(back.lon, p.lon, 1e-9, `lon at z${z}`);
    }
  // the world is one tile wide at zoom 0, Greenwich and the equator in its middle; the poles are clamped, not infinite
  assert.deepEqual(M.worldPx(0, 0, 0), { x: 128, y: 128 });
  assert.ok(Number.isFinite(M.worldPx(90, 0, 5).y) && M.worldPx(90, 0, 5).y >= 0);
  // north is up and east is right
  assert.ok(M.worldPx(49, 7, 10).y < M.worldPx(48, 7, 10).y); assert.ok(M.worldPx(48, 8, 10).x > M.worldPx(48, 7, 10).x);
});

test('screen: the centre of the view is the centre of the box, and a screen position reads back as its coordinate', () => {
  const view = { ...STRASBOURG, z: 15.3 };
  assert.deepEqual(M.toScreen(STRASBOURG, view, 360, 480), { x: 180, y: 240 });
  const p = { lat: 48.5832, lon: 7.7461 }, s = M.toScreen(p, view, 360, 480), back = M.fromScreen(s.x, s.y, view, 360, 480);
  near(back.lat, p.lat, 1e-9, 'lat'); near(back.lon, p.lon, 1e-9, 'lon');
  // 100 m north is 100 m / (metres per pixel) pixels up
  const north = { lat: STRASBOURG.lat + 100 / 111320, lon: STRASBOURG.lon };
  near(240 - M.toScreen(north, view, 360, 480).y, 100 / M.metersPerPx(STRASBOURG.lat, 15.3), 0.6, 'pixels for 100 m');
});

test('fit: every point of a trace is inside the box with its margin, the zoom is capped, an empty list has a view', () => {
  const pts = Array.from({ length: 200 }, (_, i) => ({ lat: 48.58 + i * 0.0004, lon: 7.75 + Math.sin(i / 20) * 0.02 }));
  for (const [w, h, pad] of [[360, 300, 24], [320, 180, 16], [900, 500, 40]]) {
    const v = M.fitView(pts, w, h, pad);
    for (const p of pts) { const s = M.toScreen(p, v, w, h); assert.ok(s.x >= pad - 0.5 && s.x <= w - pad + 0.5 && s.y >= pad - 0.5 && s.y <= h - pad + 0.5, `(${s.x}, ${s.y}) outside ${w}×${h}`); }
    // tight: one more half zoom level would not fit
    const closer = { ...v, z: v.z + 0.5 };
    assert.ok(pts.some((p) => { const s = M.toScreen(p, closer, w, h); return s.x < pad || s.x > w - pad || s.y < pad || s.y > h - pad; }));
  }
  assert.equal(Number.isInteger(M.fitView(pts, 360, 300, 24, { integer: true }).z), true);
  assert.equal(M.fitView([STRASBOURG], 360, 300).z, 17, 'a single point is not magnified beyond the cap');
  assert.equal(M.fitView([STRASBOURG, { lat: 48.58001, lon: 7.75001 }], 360, 300, 24, { maxZoom: 16 }).z, 16);
  assert.deepEqual(M.fitView([], 360, 300), { lat: 0, lon: 0, z: M.MIN_ZOOM });
  near(M.fitView([{ lat: -80, lon: -170 }, { lat: 80, lon: 170 }], 360, 300).z, M.MIN_ZOOM, 1e-9, 'the whole world stops at the minimum zoom');
});

test('pan and zoom: a drag moves the view by its pixels, a zoom keeps the anchored position under the finger, both stay in range', () => {
  const v = { ...STRASBOURG, z: 15 };
  const moved = M.panBy(v, 40, -25), s = M.toScreen(STRASBOURG, moved, 360, 480);
  near(s.x, 180 + 40, 1e-6, 'x after pan'); near(s.y, 240 - 25, 1e-6, 'y after pan');
  const anchor = { x: 300, y: 100 }, under = M.fromScreen(anchor.x, anchor.y, v, 360, 480);
  const zoomed = M.zoomBy(v, 1.25, anchor, 360, 480), after = M.toScreen(under, zoomed, 360, 480);
  assert.equal(zoomed.z, 16.25); near(after.x, anchor.x, 1e-6, 'anchor x'); near(after.y, anchor.y, 1e-6, 'anchor y');
  assert.equal(M.zoomBy(v, 50).z, M.MAX_ZOOM); assert.equal(M.zoomBy(v, -50).z, M.MIN_ZOOM);
  assert.deepEqual(M.zoomBy(v, 1), { ...v, z: 16 }, 'without an anchor the centre stays');
});

test('tiles: the tiles of a viewport cover it without a hole, wrap around the date line and scale with a fractional zoom', () => {
  const covers = (view, w, h) => {
    const tiles = M.tilesFor(view, w, h);
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w / 2, h / 2]])
      assert.ok(tiles.some((t) => x >= t.left - 1 && x < t.left + t.size + 1 && y >= t.top - 1 && y < t.top + t.size + 1), `(${x}, ${y}) not covered at z${view.z}`);
    return tiles;
  };
  const whole = covers({ ...STRASBOURG, z: 15 }, 360, 480);
  assert.ok(whole.length >= 4 && whole.length <= 9, `${whole.length} tiles for a phone box`);
  assert.ok(whole.every((t) => t.z === 15 && t.size === 256 && t.x >= 0 && t.x < 2 ** 15 && t.y >= 0 && t.y < 2 ** 15));
  // the tile under the centre is the one the standard formula gives
  const c = M.worldPx(STRASBOURG.lat, STRASBOURG.lon, 15);
  assert.ok(whole.some((t) => t.x === Math.floor(c.x / 256) && t.y === Math.floor(c.y / 256)));
  assert.equal(new Set(whole.map((t) => t.key)).size, whole.length);
  const frac = covers({ ...STRASBOURG, z: 15.4 }, 360, 480);
  assert.ok(frac.every((t) => t.z === 15)); near(frac[0].size, 256 * 2 ** 0.4, 1e-9, 'scaled tile');
  assert.ok(covers({ ...STRASBOURG, z: 18.6 }, 360, 480).every((t) => t.z === M.TILE_MAX_ZOOM), 'no tile is asked above the provider maximum');
  const wrap = covers({ lat: 10, lon: 179.99, z: 6 }, 600, 300);
  assert.ok(wrap.some((t) => t.x === 0) && wrap.some((t) => t.x === 63), 'both sides of the date line');
  assert.equal(M.tileUrl({ z: 15, x: 17086, y: 11277 }, 'https://tiles.example/{z}/{x}/{y}.png'), 'https://tiles.example/15/17086/11277.png');
});

test('a base map is configured only with an https template carrying {z}/{x}/{y} and an attribution', () => {
  assert.equal(M.tilesConfigured({ tiles: 'https://tiles.example/{z}/{x}/{y}.png', attribution: '© Contributeurs' }), true);
  for (const bad of [undefined, null, {}, { tiles: 'https://tiles.example/{z}/{x}/{y}.png' }, { tiles: 'http://tiles.example/{z}/{x}/{y}.png', attribution: '© X' }, { tiles: 'https://tiles.example/{z}/{x}.png', attribution: '© X' }, { tiles: 'https://tiles.example/{z}/{x}/{y}.png', attribution: ' ' }])
    assert.equal(M.tilesConfigured(bad), false);
});

test('scale bar: a round distance that fits, whose length in pixels matches the ground at this latitude', () => {
  for (const z of [5, 10, 13.7, 16, 19]) {
    const view = { ...STRASBOURG, z }, bar = M.scaleBar(view, 110);
    assert.ok(bar.px <= 110 && bar.px >= 110 / 2.6, `z${z}: ${bar.px}px`);
    assert.ok([1, 2, 5].includes(Number(String(bar.meters).replace(/0+$/, ''))), `${bar.meters} is 1, 2 or 5 × 10^n`);
    // what the bar covers on the ground, measured with the engine's own distance
    const a = M.fromScreen(100, 240, view, 360, 480), b = M.fromScreen(100 + bar.px, 240, view, 360, 480);
    near(E.haversine(a, b) / bar.meters, 1, 0.03, `ground length at z${z}`);
    assert.match(bar.label, bar.meters >= 1000 ? /^\d+ km$/ : /^\d+ m$/);
  }
  assert.ok(M.metersPerPx(60, 10) < M.metersPerPx(0, 10), 'a pixel covers less ground away from the equator');
  near(M.metersPerPx(0, 0), 156543.03, 0.01, 'the classic figure at the equator, zoom 0');
});

test('tile estimate: counts per zoom multiply by about four, a wider margin never needs fewer tiles, an empty trace needs none', () => {
  const route = Array.from({ length: 300 }, (_, i) => ({ lat: 48.5 + i * 0.001, lon: 7.7 + i * 0.0005 }));
  const b = M.boundsOf(route, 500);
  assert.ok(b.minLat < 48.5 && b.maxLat > 48.799 && b.minLon < 7.7 && b.maxLon > 7.8495);
  near((48.5 - b.minLat) * 111320, 500, 1, 'margin south'); near((7.7 - b.minLon) * 111320 * Math.cos((48.6495 * Math.PI) / 180), 500, 2, 'margin west');
  const count = M.tileCount(b, 12, 16);
  assert.deepEqual(Object.keys(count.byZoom), ['12', '13', '14', '15', '16']);
  assert.equal(count.total, Object.values(count.byZoom).reduce((n, x) => n + x, 0));
  for (let z = 13; z <= 16; z++) assert.ok(count.byZoom[z] >= count.byZoom[z - 1] && count.byZoom[z] <= count.byZoom[z - 1] * 4 + 8, `z${z}: ${count.byZoom[z]} after ${count.byZoom[z - 1]}`);
  // exact on a known case: one tile at every zoom around a single point without a margin
  assert.deepEqual(M.tileCount(M.boundsOf([STRASBOURG]), 10, 12), { total: 3, byZoom: { 10: 1, 11: 1, 12: 1 } });
  assert.equal(M.tileCount(b, 15, 30).byZoom[17] > 0 && M.tileCount(b, 15, 30).byZoom[18], undefined, 'never above the provider maximum');
  const est = M.tileEstimate(route), wide = M.tileEstimate(route, { marginM: 3000 });
  assert.equal(est.tiles, count.total); assert.equal(est.bytes, est.tiles * 20 * 1024); assert.ok(wide.tiles >= est.tiles);
  assert.match(est.label, /^Environ \d+ tuiles, de l’ordre de [\d,]+ Mo$/);
  assert.deepEqual([M.tileEstimate([]).tiles, M.tileEstimate([]).label], [0, 'Aucune tuile']);
  assert.equal(M.boundsOf([{ lat: NaN, lon: 3 }]), null);
});
