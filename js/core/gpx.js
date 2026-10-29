/* TITAN 300 — GPX reader. Pure (no DOM), works in Node tests and browsers.
   Returns distance, moving and elapsed time, ascent/descent with a 3 m hysteresis. */
/** @typedef {{ lat: number, lon: number, ele: number | null, time: number | null }} GpxPoint */
(function (root) {
  "use strict";
  const R = 6371008.8;
  /** @param {number} d */
  const rad = (d) => (d * Math.PI) / 180;

  /** @param {{ lat: number, lon: number }} a @param {{ lat: number, lon: number }} b */
  function haversine(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** @param {unknown} text */
  function points(text) {
    /** @type {GpxPoint[]} */
    const out = [];
    const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/gi;
    let m;
    while ((m = re.exec(String(text || ""))) && out.length < 100000) {
      const attrs = m[1] || m[3] || "";
      const body = m[2] || "";
      const lat = Number(/\blat\s*=\s*["']([-\d.eE+]+)["']/.exec(attrs)?.[1]);
      const lon = Number(/\blon\s*=\s*["']([-\d.eE+]+)["']/.exec(attrs)?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      const ele = Number(/<ele>\s*([-\d.eE+]+)\s*<\/ele>/i.exec(body)?.[1]);
      const time = Date.parse(/<time>\s*([^<]+?)\s*<\/time>/i.exec(body)?.[1] || "");
      out.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null, time: Number.isFinite(time) ? time : null });
    }
    return out;
  }

  /** @param {unknown} text */
  function analyse(text) {
    const pts = points(text);
    if (pts.length < 2) return { ok: false, error: "Ce fichier ne contient pas de trace exploitable.", points: pts.length };
    let dist = 0, moving = 0, ascent = 0, descent = 0, ignored = 0;
    let refEle = pts.find((p) => p.ele !== null)?.ele ?? null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (!a || !b) continue;
      const d = haversine(a, b);
      const dt = a.time !== null && b.time !== null ? (b.time - a.time) / 1000 : null;
      if (dt !== null && dt > 0 && d / dt > 60) { ignored++; continue; } // > 216 km/h: GPS glitch
      dist += d;
      if (dt !== null && dt > 0 && dt < 300 && d / dt >= 0.4) moving += dt;
      if (b.ele !== null && refEle !== null) {
        const diff = b.ele - refEle;
        if (diff >= 3) { ascent += diff; refEle = b.ele; }
        else if (diff <= -3) { descent -= diff; refEle = b.ele; }
      }
    }
    /** @type {number[]} */
    const times = [];
    for (const p of pts) if (p.time !== null) times.push(p.time);
    const first = times[0], last = times[times.length - 1];
    const elapsed = first !== undefined && last !== undefined && times.length > 1 ? (last - first) / 1000 : null;
    return {
      ok: true,
      points: pts.length,
      ignoredPoints: ignored,
      distanceKm: Math.round(dist / 10) / 100,
      movingMinutes: moving ? Math.round((moving / 60) * 10) / 10 : null,
      elapsedMinutes: elapsed ? Math.round((elapsed / 60) * 10) / 10 : null,
      ascent: Math.round(ascent),
      descent: Math.round(descent),
      start: first !== undefined ? new Date(first).toISOString() : null,
    };
  }

  const api = { haversine, points, analyse };
  /** @type {any} */ (root).TitanGpx = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
