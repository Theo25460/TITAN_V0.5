/* TITAN LIVE — « l'Expédition »: the geometry of the adventure view of a live session, shared by the website and Android.
   Pure and deterministic: the same session gives the same scene on both platforms and in tests. It only DRAWS what the engine
   already decided (beats lit, plan, echo, goal, élan): nothing here grants or measures anything.

   The scene is an ascent, TITAN's motif: a trail climbs from the bottom left to a summit on the right, across three ridgelines
   whose shape comes from the sport (its seed), so every sport has its own relief. Each beat of the Voie lights a waypoint; the
   traveller stands on the last one lit; the day's élan raises a disc in the sky. Renderers map the result to SVG (web) or
   react-native-svg (Android) and choose colours from their own tokens. */
(function (root) {
  "use strict";

  const W = 360;
  const H = 220;

  /* Small deterministic generator (mulberry32) seeded from a string: stable across engines, never Math.random. */
  function seeded(text) {
    let h = 2166136261;
    const s = String(text == null ? "" : text);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const n1 = (x) => Math.round(x * 10) / 10;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /* One ridgeline: a closed silhouette from a sum of three sines. `base` is its mean height, `amp` its relief. */
  function ridge(rand, base, amp) {
    const waves = [0, 1, 2].map((k) => ({ f: (1.1 + rand() * 1.4) * (k + 1), p: rand() * Math.PI * 2, a: amp / (k + 1.25) }));
    const steps = 24;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let y = base;
      for (const w of waves) y += Math.sin(t * Math.PI * w.f + w.p) * w.a;
      d += `${i ? "L" : "M"}${n1(t * W)} ${n1(clamp(y, 18, H - 8))} `;
    }
    return `${d}L${W} ${H} L0 ${H} Z`;
  }

  /* Catmull-Rom through the waypoints, as cubic Béziers: the trail is smooth and passes exactly on every waypoint. */
  function segments(points) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      out.push({
        c1: [p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6],
        c2: [p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6],
        to: [p2.x, p2.y],
      });
    }
    return out;
  }
  const pathOf = (start, segs) => segs.reduce((d, s) => `${d} C${n1(s.c1[0])} ${n1(s.c1[1])} ${n1(s.c2[0])} ${n1(s.c2[1])} ${n1(s.to[0])} ${n1(s.to[1])}`, `M${n1(start.x)} ${n1(start.y)}`);

  /** The scene of a live session.
      beats: waypoints lit so far · planCount: planned waypoints or null · echoBeats: where the Écho stands, or null ·
      goalRatio: 0..1 or null · elan: { value, max } · seed: the sport id (relief) · ended: the session is over. */
  function scene(input) {
    const o = input || {};
    const beats = Math.max(0, Math.floor(Number(o.beats) || 0));
    const planned = Number(o.planCount) > 0 ? Math.floor(Number(o.planCount)) : null;
    const rand = seeded(o.seed || "titan");

    // The window of waypoints: the whole plan when there is one (its last waypoint IS the summit), otherwise the next round number
    // above what is lit (it slides when full).
    const total = planned ? clamp(planned, 1, 24) : clamp(Math.ceil((beats + 1) / 6) * 6, 6, 24);
    const first = planned ? Math.max(0, Math.min(beats, planned) - total) : Math.max(0, beats - total + 3);

    // Far to near. Fixed mean heights keep the sky readable; the seed gives each sport its own silhouette.
    const ridges = [ridge(rand, 96, 26), ridge(rand, 128, 20), ridge(rand, 162, 14)];
    const stars = Array.from({ length: 14 }, () => ({ x: n1(8 + rand() * (W - 16)), y: n1(8 + rand() * 62), r: n1(0.5 + rand() * 0.8) }));

    // The ascent: from the base camp at the bottom left to the summit on the right, with switchbacks whose phase belongs to the
    // sport. The camp is where the session starts: it is not a waypoint, so the very first beat already draws a stretch of trail.
    const phase = rand() * Math.PI * 2;
    const at = (t) => ({ x: 26 + t * (W - 62), y: (H - 34) - t * (H - 104) + Math.sin(t * Math.PI * 2.6 + phase) * 15 * (1 - t * 0.45) * Math.min(1, t * 6) });
    const points = [at(0), ...Array.from({ length: total }, (_, i) => at((i + 1) / total))];
    const segs = segments(points);
    const litIn = clamp(beats - first, 0, total);
    const nodes = points.slice(1).map((p, i) => ({ x: n1(p.x), y: n1(p.y), index: first + i, lit: i < litIn, next: i === litIn && !o.ended }));
    const here = points[litIn];

    const echoIndex = o.echoBeats == null ? null : Math.floor(Number(o.echoBeats)) - first;
    const echo = echoIndex != null && echoIndex >= 1 && echoIndex <= total ? { x: n1(points[echoIndex].x), y: n1(points[echoIndex].y) } : null;

    const elanMax = Math.max(1, Number(o.elan && o.elan.max) || 90);
    const elanRatio = clamp((Number(o.elan && o.elan.value) || 0) / elanMax, 0, 1);
    const goalRatio = o.goalRatio == null ? null : clamp(Number(o.goalRatio) || 0, 0, 1);
    const summit = points[total];

    return {
      width: W, height: H, ridges, stars,
      camp: { x: n1(points[0].x), y: n1(points[0].y) },
      trail: pathOf(points[0], segs),
      done: litIn > 0 ? pathOf(points[0], segs.slice(0, litIn)) : "",
      nodes,
      traveller: { x: n1(here.x), y: n1(here.y), atCamp: litIn === 0 },
      echo,
      // The disc rises with the day's élan, on the side of the sky away from the summit: from the horizon (0) to high up (max).
      sky: { x: 58, y: n1(92 - elanRatio * 58), r: 13, ratio: elanRatio },
      summit: { x: n1(summit.x), y: n1(summit.y), reached: (planned != null && beats >= planned) || goalRatio === 1 },
      window: { first, total, lit: litIn, planned },
    };
  }

  const api = { W, H, scene, seeded };
  root.TitanLiveScene = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
