/* TITAN — V1.7.7 route geometry: following a trace, going back to the start, comparing outings on the same route.
   Pure arithmetic shared by the website and the Android app. No network and no routing here: a line that is followed is a line the
   athlete imported, recorded or had computed elsewhere — this module never invents a road. Indications only: it guarantees nothing
   about the safety or the state of a path. Loaded after gps-engine.js. */
(function (root) {
  "use strict";
  const E = root.TitanGpsEngine || (typeof require === "function" ? require("./gps-engine.js") : null);
  const R = 6371008.8, RAD = Math.PI / 180;
  const haversine = E.haversine;
  const MAX_ROUTE_POINTS = 3000; // ceiling of one stored route (server: private.titan_routes)
  const SHARE_TRIM_M = 300;

  /** Local flat coordinates (metres) around a reference: exact enough over the few hundred metres a projection looks at. */
  const flatXY = (ref, p) => ({ x: (p.lon - ref.lon) * RAD * R * Math.cos(ref.lat * RAD), y: (p.lat - ref.lat) * RAD * R });
  /** Distance from p to the edge a→b, and where along the edge (0..1) the nearest point is. */
  function toEdge(p, a, b) {
    const A = flatXY(p, a), B = flatXY(p, b), dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / len2)) : 0;
    return { d: Math.hypot(A.x + t * dx, A.y + t * dy), t };
  }
  /** Initial bearing a→b in degrees (0 = north, clockwise). */
  function bearing(a, b) {
    const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
    const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  const CARDINALS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  const cardinal = (deg) => CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

  /** Douglas–Peucker, iterative: drops points that move the line by less than `tolM`. Ends are always kept. */
  function simplify(points, tolM) {
    if (points.length <= 2) return points.slice();
    const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let worst = 0, at = -1;
      for (let i = a + 1; i < b; i++) { const d = toEdge(points[i], points[a], points[b]).d; if (d > worst) { worst = d; at = i; } }
      if (worst > tolM && at > 0) { keep[at] = 1; stack.push([a, at], [at, b]); }
    }
    return points.filter((_, i) => keep[i]);
  }
  const lengthOf = (points) => { let m = 0; for (let i = 1; i < points.length; i++) m += haversine(points[i - 1], points[i]); return m; };

  /** Climb and descent of a line that carries an altitude on every point (3 m hysteresis), else nulls: never a guessed figure. */
  function climb(segs) {
    let gain = 0, loss = 0, n = 0, withEle = 0;
    for (const s of segs) {
      let ref = null;
      for (const p of s) {
        n++;
        if (p.ele === null || p.ele === undefined || !Number.isFinite(p.ele)) { ref = null; continue; }
        withEle++;
        if (ref === null) ref = p.ele;
        else if (p.ele - ref >= 3) { gain += p.ele - ref; ref = p.ele; }
        else if (ref - p.ele >= 3) { loss += ref - p.ele; ref = p.ele; }
      }
    }
    return n && withEle === n ? { ascentM: Math.round(gain), descentM: Math.round(loss) } : { ascentM: null, descentM: null };
  }

  /** A route: what is followed and kept in the library. Stretches are never joined by an invented line. */
  function makeRoute(segs, meta) {
    const clean = segs.map((s) => s.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
      .map((p) => (Number.isFinite(p.t) && p.t > 0 ? { lat: p.lat, lon: p.lon, ele: Number.isFinite(p.ele) ? p.ele : null, t: p.t } : { lat: p.lat, lon: p.lon, ele: Number.isFinite(p.ele) ? p.ele : null }))).filter((s) => s.length >= 2);
    const points = clean.reduce((n, s) => n + s.length, 0);
    if (points < 2) return null;
    const m = meta || {};
    return { v: 1, name: String(m.name || "").trim().slice(0, 80), sport: m.sport || null, origin: m.origin || "imported", segs: clean,
      distanceM: Math.round(clean.reduce((d, s) => d + lengthOf(s), 0)), ...climb(clean), points };
  }

  const GPX_MAX_BYTES = 15 * 1024 * 1024;
  /** Reads a local GPX file into a route. `gpx` is the TitanGpx module (bounded parser: 15 MB, 100 000 points, no XML entities).
      Returns { ok, error } or { ok, route, facts } — facts say what the file contains so the preview shows nothing that cannot be computed. */
  function importGpx(text, gpx, meta) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Ce fichier est vide." };
    if (text.length > GPX_MAX_BYTES) return { ok: false, error: "Le GPX doit faire moins de 15 Mo." };
    const a = gpx.analyse(text);
    if (!a.ok) return { ok: false, error: a.error || "Ce fichier GPX est incomplet ou non pris en charge." };
    const pts = gpx.points(text);
    const bySeg = new Map();
    for (const p of pts) { if (!bySeg.has(p.segment)) bySeg.set(p.segment, []); bySeg.get(p.segment).push(p); }
    // impossible jumps inside a stretch cut it rather than drawing a line across a country
    const segs = [];
    for (const s of bySeg.values()) {
      let cur = [];
      for (const p of s) {
        const prev = cur[cur.length - 1];
        if (prev && haversine(prev, p) > 5000) { if (cur.length >= 2) segs.push(cur); cur = []; }
        cur.push(p);
      }
      if (cur.length >= 2) segs.push(cur);
    }
    const name = (/<name>\s*([^<]{1,120})\s*<\/name>/.exec(text) || [])[1] || "";
    const route = makeRoute(segs, { origin: "imported", ...(meta || {}), name: (meta && meta.name) || name.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'") });
    if (!route) return { ok: false, error: "Ce fichier ne contient pas de trace exploitable." };
    if (route.distanceM < 50) return { ok: false, error: "Cette trace fait moins de 50 m : rien à suivre." };
    return { ok: true, route, facts: { points: a.points, ignoredPoints: a.ignoredPoints, segments: route.segs.length, kind: a.kind, hasTime: a.timing === "complete", hasAltitude: route.ascentM !== null, cut: route.segs.length - bySeg.size } };
  }

  /** Thins a route to at most `max` points: shape first (Douglas–Peucker with a growing tolerance), never the ends. */
  function fit(route, max) {
    const limit = max || MAX_ROUTE_POINTS;
    let segs = route.segs, tol = 2;
    while (segs.reduce((n, s) => n + s.length, 0) > limit && tol < 200) { segs = route.segs.map((s) => simplify(s, tol)); tol *= 1.6; }
    return { ...route, segs, points: segs.reduce((n, s) => n + s.length, 0) };
  }
  /** The server's compact document: { v:1, t0, segs:[[lat·1e5, lon·1e5, seconds since t0, altitude in dm | null]] } (1 m precision).
      A planned or imported route has no time: the third number is 0. */
  function encode(route, t0) {
    const r = fit(route);
    return { v: 1, t0: Number.isFinite(t0) ? t0 : 0, segs: r.segs.map((s) => s.map((p) => [Math.round(p.lat * 1e5), Math.round(p.lon * 1e5), Number.isFinite(p.t) && Number.isFinite(t0) ? Math.max(0, Math.round((p.t - t0) / 1000)) : 0, p.ele === null || p.ele === undefined ? null : Math.round(p.ele * 10)])) };
  }
  function decode(doc, meta) {
    const segs = ((doc && doc.segs) || []).map((s) => s.map((p) => ({ lat: p[0] / 1e5, lon: p[1] / 1e5, ele: p[3] === null || p[3] === undefined ? null : p[3] / 10, t: doc.t0 && (p[2] || s[0] === p) ? doc.t0 + p[2] * 1000 : null })));
    // a document without time carries 0 everywhere: then no point has a time at all
    const timed = segs.flat().some((p, i) => i > 0 && p.t !== null);
    return makeRoute(timed ? segs.map((s) => s.map((p) => ({ ...p, t: p.t === null ? doc.t0 : p.t }))) : segs.map((s) => s.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele }))), meta);
  }
  /** The recorder's stretches of positions ({lat, lon, alt, t}) as route stretches ({lat, lon, ele, t}). */
  const fromFixes = (segs, meta) => {
    const route = makeRoute(segs.map((s) => s.map((f) => ({ lat: f.lat, lon: f.lon, ele: f.alt === undefined ? f.ele : f.alt, t: f.t }))), { origin: "recorded", ...(meta || {}) });
    return route;
  };

  const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
  /** A standard GPX 1.1 file, one <trkseg> per stretch. `time: false` and `ele: false` leave them out (a shared file carries neither). */
  function toGpx(segs, name, opts) {
    const o = opts || {};
    const body = segs.filter((s) => s.length).map((s) => `<trkseg>${s.map((p) => {
      const ele = p.ele === undefined ? p.alt : p.ele;
      return `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${o.ele !== false && ele !== null && ele !== undefined && Number.isFinite(ele) ? `<ele>${ele.toFixed(1)}</ele>` : ""}${o.time !== false && Number.isFinite(p.t) && p.t > 0 ? `<time>${new Date(p.t).toISOString()}</time>` : ""}</trkpt>`;
    }).join("")}</trkseg>`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TITAN" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${xml(name || "TITAN")}</name>${body}</trk></gpx>\n`;
  }

  /** Removes the first and last `meters` along the path (both ends are often a home). Null when the route is too short to hide both. */
  function trimEnds(segs, meters) {
    const cut = meters === undefined ? SHARE_TRIM_M : meters;
    const total = segs.reduce((d, s) => d + lengthOf(s), 0);
    if (total < cut * 2 + 150) return null;
    let run = 0; const out = [];
    for (const s of segs) {
      const kept = [];
      for (let i = 0; i < s.length; i++) {
        if (i > 0) run += haversine(s[i - 1], s[i]);
        if (run >= cut && run <= total - cut) kept.push(s[i]);
      }
      if (kept.length >= 2) out.push(kept);
    }
    return out.length ? out : null;
  }

  /* ---- Following a route ---- */
  /** Prepares a route for following: one flat list of points with the distance already covered at each, stretches kept apart. */
  function course(route) {
    const pts = []; let cum = 0;
    route.segs.forEach((s, si) => s.forEach((p, i) => {
      if (i > 0) cum += haversine(s[i - 1], p);
      pts.push({ lat: p.lat, lon: p.lon, ele: p.ele === undefined ? null : p.ele, cum, seg: si });
    }));
    return { pts, totalM: cum, start: pts[0] || null, end: pts[pts.length - 1] || null };
  }
  const startFollow = () => ({ edge: 0, alongM: 0, offM: null, joined: false, off: false, offSince: null, offCount: 0, done: false });
  /** Nearest edge in [from, to). With `fromM`, an edge that would move the athlete backwards costs `backM` metres: where two legs of the
      route share the same path (an out-and-back), the one that goes on wins; a real step back still wins when it is clearly closer. */
  function nearest(c, p, from, to, fromM, backM) {
    let best = { d: Infinity, edge: Math.max(0, from), t: 0 }, bestScore = Infinity;
    for (let i = Math.max(0, from); i < Math.min(c.pts.length - 1, to); i++) {
      if (c.pts[i].seg !== c.pts[i + 1].seg) continue;
      const e = toEdge(p, c.pts[i], c.pts[i + 1]);
      const score = e.d + (fromM !== undefined && c.pts[i].cum + e.t * (c.pts[i + 1].cum - c.pts[i].cum) < fromM - 1 ? backM : 0);
      if (score < bestScore) { bestScore = score; best = { d: e.d, edge: i, t: e.t }; }
    }
    return best;
  }
  /** Where the athlete is on the route after this position. The search stays near the last known place (an out-and-back or a loop that
      crosses itself is followed in order) and only looks at the whole route when that fails. « Off the route » is said only when the
      gap is larger than the sport's margin AND than twice the announced accuracy, for 10 s and 3 positions: GPS noise alone never triggers it. */
  function follow(c, state, fix, opts) {
    const o = opts || {};
    const fam = E.FAMILIES[o.family] || E.FAMILIES[E.familyOf(o.sport)] || E.FAMILIES.bike;
    const margin = Math.max(fam.offRouteM, 2 * (Number.isFinite(fix.acc) ? fix.acc : 0));
    const s = state || startFollow();
    if (c.pts.length < 2) return s;
    let ahead = s.edge;
    while (ahead < c.pts.length - 1 && c.pts[ahead].cum - s.alongM < 400) ahead++;
    let hit = s.joined ? nearest(c, fix, s.edge - 2, ahead + 1, s.alongM, Math.min(15, margin / 2)) : { d: Infinity };
    if (hit.d > margin) {
      const all = nearest(c, fix, 0, c.pts.length - 1);
      // re-join elsewhere only when it is clearly better than staying where the athlete was expected
      if (all.d < hit.d * 0.5 || !s.joined) hit = all;
    }
    const a = c.pts[hit.edge], b = c.pts[hit.edge + 1] || a;
    const alongM = a.cum + hit.t * (b.cum - a.cum);
    const on = hit.d <= margin;
    const joined = s.joined || on;
    let offSince = s.offSince, offCount = s.offCount, off = s.off;
    if (!joined) { off = false; offSince = null; offCount = 0; }
    else if (hit.d > margin) { offSince = offSince === null ? fix.t : offSince; offCount += 1; if (fix.t - offSince >= 10000 && offCount >= 3) off = true; }
    else if (hit.d < margin * 0.6) { off = false; offSince = null; offCount = 0; }
    const remainingM = Math.max(0, c.totalM - alongM);
    return { edge: on || !s.joined ? hit.edge : s.edge, alongM: on || !s.joined ? alongM : s.alongM, offM: Math.round(hit.d), marginM: Math.round(margin), joined, off, offSince, offCount,
      remainingM: Math.round(on || !s.joined ? remainingM : Math.max(0, c.totalM - s.alongM)), progress: c.totalM ? Math.min(1, (on || !s.joined ? alongM : s.alongM) / c.totalM) : 0,
      done: joined && on && remainingM < 30, bearingNext: bearing(fix, b) };
  }

  /* ---- Back to the start ---- */
  /** The recorded trace walked backwards from where the athlete is, as a route to follow: the way actually taken, not a computed road.
      Stretches separated by a pause or a lost signal stay separated (`holes`): the path between them is unknown and is not drawn. */
  function backtrack(segs, opts) {
    const o = opts || {};
    const rev = segs.filter((s) => s.length >= 2).map((s) => simplify(s.map((f) => ({ lat: f.lat, lon: f.lon, ele: f.alt === undefined ? f.ele : f.alt })), o.toleranceM || 4).reverse()).reverse();
    const route = makeRoute(rev, { origin: "backtrack", name: "Retour par le même chemin", sport: o.sport });
    if (!route) return null;
    const first = segs.find((s) => s.length);
    let straightHoles = 0;
    for (let i = 1; i < rev.length; i++) straightHoles += haversine(rev[i - 1][rev[i - 1].length - 1], rev[i][0]);
    return { route, start: first ? { lat: first[0].lat, lon: first[0].lon } : null, holes: rev.length - 1, holesStraightM: Math.round(straightHoles) };
  }
  /** Straight line to a point: a direction and a minimum distance, explicitly not a path. */
  const straight = (from, to) => ({ distanceM: Math.round(haversine(from, to)), bearing: Math.round(bearing(from, to)), cardinal: cardinal(bearing(from, to)) });

  /** Time needed for `distanceM` at the pace of this outing, as a range. Null until 5 min and 500 m of movement exist.
      The range comes from the kilometre splits when there are at least 3 (slowest and fastest quarter), else ± 20 %.
      It ignores the relief ahead, future stops and fatigue: the screens say so. */
  function eta(distanceM, a) {
    if (!a || a.movingS < 300 || a.distanceM < 500 || !(distanceM >= 0)) return null;
    const v = a.distanceM / a.movingS;
    let slow = v * 0.8, fast = v * 1.2;
    const full = (a.splits || []).filter((s) => s.distanceM >= 1000 && s.movingS > 0).map((s) => 1000 / s.movingS).sort((x, y) => x - y);
    if (full.length >= 3) { slow = Math.min(v * 0.9, full[Math.floor((full.length - 1) * 0.25)]); fast = Math.max(v * 1.1, full[Math.ceil((full.length - 1) * 0.75)]); } // never narrower than ± 10 %
    return { seconds: Math.round(distanceM / v), lowS: Math.round(distanceM / fast), highS: Math.round(distanceM / slow), speedMs: v,
      basis: "ta vitesse en mouvement sur cette sortie", note: "Estimation hors arrêts ; le relief à venir n’est pas pris en compte." };
  }

  /* ---- Same route? ---- */
  function samples(route, stepM) {
    const out = [];
    for (const s of route.segs) {
      let carry = 0;
      out.push(s[0]);
      for (let i = 1; i < s.length; i++) {
        const d = haversine(s[i - 1], s[i]);
        let at = stepM - carry;
        while (at <= d) { const k = at / d; out.push({ lat: s[i - 1].lat + (s[i].lat - s[i - 1].lat) * k, lon: s[i - 1].lon + (s[i].lon - s[i - 1].lon) * k }); at += stepM; }
        carry = (carry + d) % stepM;
      }
    }
    return out;
  }
  function coverage(a, b, corridorM) {
    const cell = corridorM * 2, key = (x, y) => `${x}:${y}`, grid = new Map();
    const ref = b[0];
    for (const p of b) { const q = flatXY(ref, p), k = key(Math.floor(q.x / cell), Math.floor(q.y / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q); }
    let hit = 0;
    for (const p of a) {
      const q = flatXY(ref, p), cx = Math.floor(q.x / cell), cy = Math.floor(q.y / cell);
      let ok = false;
      for (let dx = -1; dx <= 1 && !ok; dx++) for (let dy = -1; dy <= 1 && !ok; dy++) for (const r of grid.get(key(cx + dx, cy + dy)) || []) if (Math.hypot(r.x - q.x, r.y - q.y) <= corridorM) { ok = true; break; }
      if (ok) hit++;
    }
    return a.length ? hit / a.length : 0;
  }
  const SAME = { corridorM: 40, stepM: 25, coverage: 0.9, length: 0.1, text: "Même parcours : au moins 90 % de chaque trace à moins de 40 m de l’autre, et moins de 10 % d’écart de longueur. Le sens est comparé à part." };
  /** Are two routes the same course? Both ways (A inside B and B inside A), so a short cut of a long loop never matches the loop. */
  function sameRoute(a, b) {
    if (!a || !b || a.distanceM < 300 || b.distanceM < 300) return { match: false, reason: "Trace trop courte pour être comparée (moins de 300 m).", direction: null };
    const sa = samples(a, SAME.stepM), sb = samples(b, SAME.stepM);
    const ab = coverage(sa, sb, SAME.corridorM), ba = coverage(sb, sa, SAME.corridorM);
    const ratio = Math.abs(a.distanceM - b.distanceM) / Math.max(a.distanceM, b.distanceM);
    const match = ab >= SAME.coverage && ba >= SAME.coverage && ratio <= SAME.length;
    const q = (s, k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
    const fwd = haversine(q(sa, 0.25), q(sb, 0.25)) + haversine(q(sa, 0.75), q(sb, 0.75)), bwd = haversine(q(sa, 0.25), q(sb, 0.75)) + haversine(q(sa, 0.75), q(sb, 0.25));
    return { match, direction: match ? (Math.abs(fwd - bwd) < 60 ? "unknown" : fwd < bwd ? "same" : "reverse") : null, coverageAB: Math.round(ab * 100) / 100, coverageBA: Math.round(ba * 100) / 100, lengthGap: Math.round(ratio * 100) / 100,
      reason: match ? "" : ratio > SAME.length ? "Longueurs trop différentes (plus de 10 %)." : "Les deux traces ne se recouvrent pas assez (moins de 90 % à moins de 40 m)." };
  }
  /** Outings on one route, compared on moving time. An outing with more than 3 % of its time without a position, or whose distance is
      more than 10 % away from the route's, is set aside with the reason; a « best time » exists only with two comparable outings. */
  function compareEfforts(routeDistanceM, efforts) {
    const comparable = [], excluded = [];
    for (const e of efforts || []) {
      const reason = !(e.movingS > 0) || !(e.distanceM > 0) ? "Temps en mouvement inconnu."
        : e.elapsedS > 0 && (e.missingS || 0) / e.elapsedS > 0.03 ? "Plus de 3 % du temps sans position fiable."
        : Math.abs(e.distanceM - routeDistanceM) / routeDistanceM > 0.1 ? "Distance mesurée à plus de 10 % de celle du parcours."
        : e.direction === "reverse" ? "Parcouru dans l’autre sens." : "";
      (reason ? excluded : comparable).push(reason ? { ...e, reason } : { ...e, speedKmh: Math.round((e.distanceM / e.movingS) * 36) / 10 });
    }
    comparable.sort((x, y) => x.movingS - y.movingS);
    return { comparable, excluded, best: comparable.length >= 2 ? comparable[0] : null, criteria: SAME.text,
      note: comparable.length < 2 ? "Il faut au moins deux sorties comparables dans le même sens pour parler d’un meilleur temps." : "Comparaison sur le temps en mouvement, même parcours et même sens. Le vent, la charge et l’état du terrain ne sont pas connus." };
  }

  /** Altitude along the route, thinned to `n` points, for the profile under a preview. Empty when an altitude is missing. */
  function profile(route, n) {
    const c = course(route);
    if (!c.pts.length || c.pts.some((p) => p.ele === null)) return [];
    const max = n || 120, step = Math.max(1, Math.floor(c.pts.length / max));
    return c.pts.filter((_, i) => i % step === 0 || i === c.pts.length - 1).map((p) => ({ km: Math.round(p.cum / 10) / 100, ele: Math.round(p.ele) }));
  }
  /** Points of interest within `maxM` of the route, with where they are along it. */
  function nearRoute(pois, route, maxM) {
    const c = course(route), out = [];
    for (const poi of pois || []) {
      const hit = nearest(c, poi, 0, c.pts.length - 1);
      if (hit.d <= maxM) { const a = c.pts[hit.edge], b = c.pts[hit.edge + 1] || a; out.push({ ...poi, offM: Math.round(hit.d), alongM: Math.round(a.cum + hit.t * (b.cum - a.cum)) }); }
    }
    return out.sort((x, y) => x.alongM - y.alongM);
  }

  const api = { MAX_ROUTE_POINTS, SHARE_TRIM_M, SAME, haversine, bearing, cardinal, toEdge, simplify, lengthOf, climb, makeRoute, importGpx, fit, encode, decode, fromFixes, toGpx, trimEnds,
    course, startFollow, follow, backtrack, straight, eta, sameRoute, compareEfforts, profile, nearRoute };
  /** @type {any} */ (root).TitanGpsNav = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
