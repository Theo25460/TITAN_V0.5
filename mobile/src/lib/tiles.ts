/* Web-Mercator tile arithmetic for the optional base map under a route. Pure. The base map is OFF unless the build carries a
   tile provider (EXPO_PUBLIC_TITAN_TILES_URL: a template with {z}/{x}/{y}, plus its attribution) AND the athlete turned it on:
   tile requests tell the provider which area is looked at, so it is an explicit choice, never a default. */
export const TILE = 256;
export const MAX_ZOOM = 17;
export const MIN_ZOOM = 2;

export const TILES_URL = process.env.EXPO_PUBLIC_TITAN_TILES_URL || "";
export const TILES_ATTRIBUTION = process.env.EXPO_PUBLIC_TITAN_TILES_ATTRIBUTION || "";
/** A usable provider needs the three placeholders and an attribution to show (every provider's terms require one). */
export const tilesConfigured = (url = TILES_URL, attribution = TILES_ATTRIBUTION) => /\{z\}/.test(url) && /\{x\}/.test(url) && /\{y\}/.test(url) && /^https:\/\//.test(url) && attribution.trim().length > 2;

const clampLat = (lat: number) => Math.max(-85.0511, Math.min(85.0511, lat));
/** World pixel (at zoom z) of a position. */
export const worldPx = (lat: number, lon: number, z: number) => {
  const s = TILE * 2 ** z;
  const x = ((lon + 180) / 360) * s;
  const r = (clampLat(lat) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s;
  return { x, y };
};
export const fromWorldPx = (x: number, y: number, z: number) => {
  const s = TILE * 2 ** z;
  const lon = (x / s) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / s;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon };
};

export type View = { lat: number; lon: number; z: number };
/** The zoom and centre that show the whole trace in the box, with a margin. */
export function fitView(points: { lat: number; lon: number }[], width: number, height: number, pad = 24): View {
  if (points.length === 0) return { lat: 0, lon: 0, z: MIN_ZOOM };
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  let z = MAX_ZOOM;
  for (; z > MIN_ZOOM; z--) {
    const a = worldPx(maxLat, minLon, z), b = worldPx(minLat, maxLon, z);
    if (Math.abs(b.x - a.x) <= width - 2 * pad && Math.abs(b.y - a.y) <= height - 2 * pad) break;
  }
  const c = fromWorldPx((worldPx(maxLat, minLon, z).x + worldPx(minLat, maxLon, z).x) / 2, (worldPx(maxLat, minLon, z).y + worldPx(minLat, maxLon, z).y) / 2, z);
  return { lat: c.lat, lon: c.lon, z };
}

/** Screen position of a coordinate in a viewport of the given size centred on `view`. */
export const toScreen = (p: { lat: number; lon: number }, view: View, width: number, height: number) => {
  const c = worldPx(view.lat, view.lon, view.z), q = worldPx(p.lat, p.lon, view.z);
  return { x: width / 2 + (q.x - c.x), y: height / 2 + (q.y - c.y) };
};

export type TileRef = { key: string; z: number; x: number; y: number; left: number; top: number };
/** The tiles that cover the viewport, with their screen position. At most a few dozen for a phone-sized box. */
export function tilesFor(view: View, width: number, height: number): TileRef[] {
  const c = worldPx(view.lat, view.lon, view.z);
  const n = 2 ** view.z;
  const x0 = Math.floor((c.x - width / 2) / TILE), x1 = Math.floor((c.x + width / 2) / TILE);
  const y0 = Math.max(0, Math.floor((c.y - height / 2) / TILE)), y1 = Math.min(n - 1, Math.floor((c.y + height / 2) / TILE));
  const out: TileRef[] = [];
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const wrapped = ((tx % n) + n) % n;
      out.push({ key: `${view.z}/${wrapped}/${ty}@${tx}`, z: view.z, x: wrapped, y: ty, left: Math.round(width / 2 + tx * TILE - c.x), top: Math.round(height / 2 + ty * TILE - c.y) });
    }
  return out.slice(0, 40);
};
export const tileUrl = (t: Pick<TileRef, "z" | "x" | "y">, template = TILES_URL) => template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));

export const zoomBy = (v: View, dz: number): View => ({ ...v, z: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.z + dz)) });
/** Moves the view by a drag of (dx, dy) screen pixels. */
export function panBy(v: View, dx: number, dy: number): View {
  const c = worldPx(v.lat, v.lon, v.z);
  const n = fromWorldPx(c.x - dx, c.y - dy, v.z);
  return { ...v, lat: Math.max(-85, Math.min(85, n.lat)), lon: n.lon };
}
