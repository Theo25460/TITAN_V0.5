/* TITAN — V1.7.7 map arithmetic for the outing page: a Web-Mercator viewport, the view that fits a trace, the tiles that cover a
   viewport, a scale bar and an estimate of how many tiles an area needs. Pure: no canvas, no network, no clock.
   Same arithmetic and names as the Android app (mobile/src/lib/tiles.ts); the zoom may be fractional here because the website draws
   the trace itself on a neutral ground. A base map exists only when a tile provider is configured AND the athlete turned it on:
   tile requests tell the provider which area is looked at, so it is an explicit choice, never a default. */
(function (root) {
  "use strict";
  const TILE = 256;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 19; // the trace alone can be looked at closer than any tile is served
  const TILE_MAX_ZOOM = 17;
  const EARTH_M = 40075016.686; // length of the equator, the width of the world at zoom 0

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const clampLat = (lat) => clamp(lat, -85.0511, 85.0511);
  const clampZoom = (z) => clamp(Number.isFinite(z) ? z : MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);

  /** World pixel (at zoom z) of a position. */
  function worldPx(lat, lon, z) {
    const s = TILE * 2 ** z;
    const r = (clampLat(lat) * Math.PI) / 180;
    return { x: ((lon + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s };
  }
  function fromWorldPx(x, y, z) {
    const s = TILE * 2 ** z;
    const n = Math.PI - (2 * Math.PI * y) / s;
    return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon: (x / s) * 360 - 180 };
  }

  /** A usable provider needs the three placeholders, https and an attribution to show (every provider's terms require one). */
  function tilesConfigured(config) {
    const c = config || {};
    const url = String(c.tiles || ""), attribution = String(c.attribution || "");
    return /\{z\}/.test(url) && /\{x\}/.test(url) && /\{y\}/.test(url) && /^https:\/\//.test(url) && attribution.trim().length > 2;
  }

  /** South-west and north-east corners of a list of positions, widened by `marginM` metres. Null when the list is empty. */
  function boundsOf(points, marginM) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points || []) {
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
    }
    if (minLat === Infinity) return null;
    const m = Math.max(0, marginM || 0);
    const dLat = m / 111320, dLon = m / (111320 * Math.max(0.01, Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)));
    return { minLat: clampLat(minLat - dLat), maxLat: clampLat(maxLat + dLat), minLon: minLon - dLon, maxLon: maxLon + dLon };
  }

  /** The zoom and centre that show every position in the box, with a margin. `opts.maxZoom` caps the zoom (a single point or a short
      trace is not magnified to a blur); `opts.integer` keeps whole zoom levels (tiles look sharp only there). */
  function fitView(points, width, height, pad, opts) {
    const o = opts || {};
    const b = boundsOf(points);
    if (!b) return { lat: 0, lon: 0, z: MIN_ZOOM };
    const p = pad === undefined ? 24 : pad;
    const a = worldPx(b.maxLat, b.minLon, 0), c = worldPx(b.minLat, b.maxLon, 0);
    const spanX = Math.abs(c.x - a.x), spanY = Math.abs(c.y - a.y);
    const roomX = Math.max(1, width - 2 * p), roomY = Math.max(1, height - 2 * p);
    const cap = clampZoom(o.maxZoom === undefined ? 17 : o.maxZoom);
    let z = Math.min(spanX > 0 ? Math.log2(roomX / spanX) : Infinity, spanY > 0 ? Math.log2(roomY / spanY) : Infinity);
    z = clamp(Number.isFinite(z) ? z : cap, MIN_ZOOM, cap);
    if (o.integer) z = Math.floor(z);
    const centre = fromWorldPx((a.x + c.x) / 2, (a.y + c.y) / 2, 0);
    return { lat: centre.lat, lon: centre.lon, z };
  }

  /** Screen position of a coordinate in a viewport of the given size centred on `view`. */
  function toScreen(p, view, width, height) {
    const c = worldPx(view.lat, view.lon, view.z), q = worldPx(p.lat, p.lon, view.z);
    return { x: width / 2 + (q.x - c.x), y: height / 2 + (q.y - c.y) };
  }
  /** The coordinate under a screen position. */
  function fromScreen(x, y, view, width, height) {
    const c = worldPx(view.lat, view.lon, view.z);
    return fromWorldPx(c.x + (x - width / 2), c.y + (y - height / 2), view.z);
  }

  /** The tiles that cover the viewport, with their screen position and drawn size. With a fractional zoom the tiles of the nearest whole
      level are scaled. At most a few dozen for a phone-sized box. */
  function tilesFor(view, width, height) {
    const tz = clamp(Math.round(view.z), MIN_ZOOM, TILE_MAX_ZOOM);
    const size = TILE * 2 ** (view.z - tz);
    const c = worldPx(view.lat, view.lon, tz); // in tile-level pixels
    const k = size / TILE;
    const n = 2 ** tz;
    const x0 = Math.floor((c.x - width / 2 / k) / TILE), x1 = Math.floor((c.x + width / 2 / k) / TILE);
    const y0 = Math.max(0, Math.floor((c.y - height / 2 / k) / TILE)), y1 = Math.min(n - 1, Math.floor((c.y + height / 2 / k) / TILE));
    const out = [];
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const wrapped = ((tx % n) + n) % n;
        out.push({ key: `${tz}/${wrapped}/${ty}@${tx}`, z: tz, x: wrapped, y: ty, left: Math.round(width / 2 + (tx * TILE - c.x) * k), top: Math.round(height / 2 + (ty * TILE - c.y) * k), size });
      }
    return out.slice(0, 60);
  }
  const tileUrl = (t, template) => String(template || "").replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));

  /** Changes the zoom by `dz`. With an anchor ({x, y} on a screen of width × height) the position under it stays under it. */
  function zoomBy(v, dz, anchor, width, height) {
    const z = clampZoom(v.z + dz);
    if (!anchor || !width || !height || z === v.z) return { ...v, z };
    const at = fromScreen(anchor.x, anchor.y, v, width, height);
    const q = worldPx(at.lat, at.lon, z);
    const c = fromWorldPx(q.x - (anchor.x - width / 2), q.y - (anchor.y - height / 2), z);
    return { lat: clamp(c.lat, -85, 85), lon: c.lon, z };
  }
  /** Moves the view by a drag of (dx, dy) screen pixels. */
  function panBy(v, dx, dy) {
    const c = worldPx(v.lat, v.lon, v.z);
    const n = fromWorldPx(c.x - dx, c.y - dy, v.z);
    return { ...v, lat: clamp(n.lat, -85, 85), lon: n.lon };
  }

  /** Metres covered by one screen pixel at this latitude and zoom. */
  const metersPerPx = (lat, z) => (EARTH_M * Math.cos((clampLat(lat) * Math.PI) / 180)) / (TILE * 2 ** z);
  const SCALE_STEPS = [1, 2, 5];
  /** A round distance whose bar fits in `maxPx`: { meters, px, label }. 1, 2 or 5 times a power of ten, in m then km. */
  function scaleBar(view, maxPx) {
    const mpp = metersPerPx(view.lat, view.z), room = Math.max(1, maxPx || 100) * mpp;
    let meters = 1;
    for (let pow = 0; pow <= 7; pow++) for (const s of SCALE_STEPS) { const m = s * 10 ** pow; if (m <= room) meters = m; }
    return { meters, px: Math.round(meters / mpp), label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m` };
  }

  /** How many tiles cover the bounds at each zoom from `minZoom` to `maxZoom` (both whole, kept inside what tiles exist). */
  function tileCount(bounds, minZoom, maxZoom) {
    const byZoom = {};
    let total = 0;
    if (!bounds) return { total, byZoom };
    const lo = clamp(Math.round(minZoom), 0, TILE_MAX_ZOOM), hi = clamp(Math.round(maxZoom), lo, TILE_MAX_ZOOM);
    for (let z = lo; z <= hi; z++) {
      const a = worldPx(bounds.maxLat, bounds.minLon, z), b = worldPx(bounds.minLat, bounds.maxLon, z);
      const nx = Math.floor(b.x / TILE) - Math.floor(a.x / TILE) + 1, ny = Math.floor(b.y / TILE) - Math.floor(a.y / TILE) + 1;
      byZoom[z] = Math.max(1, nx) * Math.max(1, ny);
      total += byZoom[z];
    }
    return { total, byZoom };
  }
  /** Tiles and weight an area would need, said as an order of magnitude: a raster tile weighs about 20 kB (`kbPerTile` to change it).
      { tiles, bytes, label } — the label never pretends to be exact. */
  function tileEstimate(points, opts) {
    const o = opts || {};
    const count = tileCount(boundsOf(points, o.marginM === undefined ? 500 : o.marginM), o.minZoom === undefined ? 12 : o.minZoom, o.maxZoom === undefined ? 16 : o.maxZoom);
    const bytes = count.total * (o.kbPerTile || 20) * 1024;
    const mb = bytes / 1048576;
    return { tiles: count.total, byZoom: count.byZoom, bytes, label: count.total ? `Environ ${count.total} tuiles, de l’ordre de ${mb >= 10 ? Math.round(mb) : String(Math.round(mb * 10) / 10).replace(".", ",")} Mo` : "Aucune tuile" };
  }

  const api = { TILE, MIN_ZOOM, MAX_ZOOM, TILE_MAX_ZOOM, worldPx, fromWorldPx, tilesConfigured, boundsOf, fitView, toScreen, fromScreen, tilesFor, tileUrl, zoomBy, panBy, metersPerPx, scaleBar, tileCount, tileEstimate };
  /** @type {any} */ (root).TitanGpsMap = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
