// TITAN sport icons — the parts every glyph is built from.
// One 24 grid, one main stroke (1.65, inherited from the <svg>), one fine stroke for texture (nets, strings, lattice), at most one
// tinted mass per glyph. The athlete is never drawn freehand: `athlete()` places a body of fixed proportions from joint angles,
// so no pose can stretch a limb or shrink a head. See docs/design/SPORT_ICONS.md.

export const r1 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => String(r1(n));

/** Fine stroke: texture that must stay quieter than the outline (strings, nets, seams, lattice). */
export const FINE = ' stroke-width="1.1"';
/** The one tinted mass of a glyph: the surface that carries the discipline (a ball, a plate, water, a board). */
export const TINT = ' fill="currentColor" fill-opacity=".22"';
/** A solid mark: the athlete's head, a ball in flight, a puck. */
export const SOLID = ' fill="currentColor" stroke="none"';

export const path = (d, extra = "") => `<path d="${d}"${extra}/>`;
export const circle = (cx, cy, r, extra = "") => `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}"${extra}/>`;
export const ellipse = (cx, cy, rx, ry, extra = "") => `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}"${extra}/>`;
export const rect = (x, y, w, h, rx = 0, extra = "") =>
  `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"${rx ? ` rx="${fmt(rx)}"` : ""}${extra}/>`;
export const dot = (cx, cy, r = 1.15) => circle(cx, cy, r, SOLID);

/** A direction measured from straight down, turning towards +x: 0 down, 90 right, 180 up, -90 left. */
export const dir = (deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
export const step = ([x, y], deg, len) => {
  const [dx, dy] = dir(deg);
  return [x + dx * len, y + dy * len];
};
const pt = ([x, y]) => `${fmt(x)} ${fmt(y)}`;
export const poly = (...pts) => "M" + pts.map(pt).join("L");

// ---- the athlete -------------------------------------------------------------------------------------------------------------
// Proportions are fixed: torso 6, upper arm 3.3, forearm 3.1, thigh 4.3, shin 4.3, head radius 2.15 set 3 beyond the shoulder.
export const BODY = { torso: 6, upper: 3.3, fore: 3.1, thigh: 4.3, shin: 4.3, head: 2.15, neck: 3 };
/** The athlete is drawn heavier than equipment so a body reads at 16 px. */
export const BODY_STROKE = ' stroke-width="2.1"';

/**
 * @param {object} o hip [x,y]; torso angle (180 = upright); arms/legs as [upper, lower] angles; scale for a smaller athlete;
 *   `noArms` / `noLegs` when the equipment covers them; `head` angle when the head is not on the line of the torso.
 */
export function athlete(o) {
  const k = o.scale ?? 1;
  const L = Object.fromEntries(Object.entries(BODY).map(([n, v]) => [n, v * k]));
  const hip = o.hip;
  const sh = step(hip, o.torso ?? 180, L.torso);
  const head = step(sh, o.head ?? o.torso ?? 180, L.neck);
  const limb = (from, [a, b], l1, l2) => {
    const mid = step(from, a, l1);
    return [mid, step(mid, b, l2)];
  };
  let d = "";
  if (!o.noArms) {
    const [e1, h1] = limb(sh, o.armA, L.upper, L.fore);
    const [e2, h2] = limb(sh, o.armB ?? o.armA, L.upper, L.fore);
    d += poly(h1, e1, sh, e2, h2);
  }
  d += poly(sh, hip);
  if (!o.noLegs) {
    const [k1, f1] = limb(hip, o.legA, L.thigh, L.shin);
    const [k2, f2] = limb(hip, o.legB ?? o.legA, L.thigh, L.shin);
    d += poly(f1, k1, hip, k2, f2);
  }
  return path(d, BODY_STROKE) + circle(head[0], head[1], L.head, SOLID);
}
/** The joints of a pose, for glyphs that attach equipment to a hand or a foot. */
export function joints(o) {
  const k = o.scale ?? 1;
  const L = Object.fromEntries(Object.entries(BODY).map(([n, v]) => [n, v * k]));
  const sh = step(o.hip, o.torso ?? 180, L.torso);
  const out = { hip: o.hip, sh, head: step(sh, o.head ?? o.torso ?? 180, L.neck) };
  if (o.armA) {
    out.elbowA = step(sh, o.armA[0], L.upper);
    out.handA = step(out.elbowA, o.armA[1], L.fore);
    const b = o.armB ?? o.armA;
    out.elbowB = step(sh, b[0], L.upper);
    out.handB = step(out.elbowB, b[1], L.fore);
  }
  if (o.legA) {
    out.kneeA = step(o.hip, o.legA[0], L.thigh);
    out.footA = step(out.kneeA, o.legA[1], L.shin);
    const b = o.legB ?? o.legA;
    out.kneeB = step(o.hip, b[0], L.thigh);
    out.footB = step(out.kneeB, b[1], L.shin);
  }
  return out;
}

// ---- terrain and context (the lower band, y 19.5–22) ---------------------------------------------------------------------
/** Water: humps of 2.5 units. */
export function wave(y = 20.5, x0 = 2, x1 = 22, amp = 1.5, extra = "") {
  const n = Math.max(1, Math.round((x1 - x0) / 2.5));
  const w = (x1 - x0) / n;
  let d = `M${fmt(x0)} ${fmt(y)}q${fmt(w / 2)} ${fmt(-amp)} ${fmt(w)} 0`;
  for (let i = 1; i < n; i++) d += `t${fmt(w)} 0`;
  return path(d, extra);
}
export const ground = (y = 21.5, x0 = 2, x1 = 22) => path(`M${fmt(x0)} ${fmt(y)}H${fmt(x1)}`);
export const dashedGround = (y = 21.5, x0 = 2, x1 = 22) => {
  let d = "";
  for (let x = x0; x < x1 - 0.5; x += 3.4) d += `M${fmt(x)} ${fmt(y)}h${fmt(Math.min(1.6, x1 - x))}`;
  return path(d);
};
export const rockyGround = (y = 21.5) => path(`M2 ${y}l2.6-1.6 1.8 1.1 2.8-2.1 2.3 1.6 1.9-1 2.4 1.7 2.2-1.2 2 1.5`);
export const sand = (y = 21.6) => path(`M2.5 ${y}h.01M6 ${y}h.01M9.5 ${y}h.01M13 ${y}h.01M16.5 ${y}h.01M20 ${y}h.01`, ' stroke-width="1.6"');
/** The beach: sand under the subject and a low sun. */
export const beach = () => sand() + circle(19.6, 4.4, 2, TINT);
export const snowSlope = () => path("M2 13.5 22 21.5");

// ---- equipment shared between glyphs -------------------------------------------------------------------------------------
export function wheel(cx, cy, r = 3.5) {
  return circle(cx, cy, r);
}
/**
 * The TITAN bicycle: wheels r 3.5 at y 16, bottom bracket at 11, a level top tube.
 * kind: "road" (drop bars), "flat" (flat bars), "mtb" (sloping tube, riser bar), "city" (step-through + basket), "track".
 */
export function bicycle({ kind = "road", dx = 0, dy = 0, r = 3.5 } = {}) {
  const X = (x) => fmt(x + dx), Y = (y) => fmt(y + dy);
  const rear = [5.5, 16], front = [18.5, 16];
  let frame;
  if (kind === "mtb") frame = `M${X(5.5)} ${Y(16)}L${X(10.6)} ${Y(16)}L${X(15.9)} ${Y(9.8)}M${X(5.5)} ${Y(16)}L${X(9.2)} ${Y(10.6)}L${X(15.9)} ${Y(9.8)}L${X(18.5)} ${Y(16)}M${X(10.6)} ${Y(16)}L${X(8.8)} ${Y(9.6)}`;
  else if (kind === "city") frame = `M${X(5.5)} ${Y(16)}L${X(10.6)} ${Y(16)}Q${X(12.3)} ${Y(12.4)} ${X(15.9)} ${Y(10.2)}L${X(18.5)} ${Y(16)}M${X(5.5)} ${Y(16)}L${X(9.4)} ${Y(10.4)}M${X(10.6)} ${Y(16)}L${X(9)} ${Y(9.6)}`;
  else frame = `M${X(5.5)} ${Y(16)}L${X(10.6)} ${Y(16)}L${X(15.9)} ${Y(10.2)}M${X(5.5)} ${Y(16)}L${X(9.5)} ${Y(10.2)}H${X(15.9)}L${X(18.5)} ${Y(16)}M${X(10.6)} ${Y(16)}L${X(9)} ${Y(9.2)}`;
  const saddle = `M${X(7.4)} ${Y(9.2)}h3.2`;
  const bars = {
    road: `M${X(15.6)} ${Y(8.6)}h1.6a1.3 1.3 0 0 1 0 2.6h-.5`,
    track: `M${X(15.6)} ${Y(8.6)}h1.6a1.3 1.3 0 0 1 0 2.6h-.5`,
    flat: `M${X(14.8)} ${Y(8.6)}h2.6`,
    mtb: `M${X(14.6)} ${Y(8.3)}l1.3.5h2`,
    city: `M${X(15.2)} ${Y(8.6)}h2.4`,
  }[kind];
  return (
    circle(rear[0] + dx, rear[1] + dy, r) + circle(front[0] + dx, front[1] + dy, r) + path(frame + saddle + bars)
  );
}
/** A sport wheelchair seen from the side, with its athlete: cambered wheel, caster, footrest. Leaves the upper right free. */
export function wheelchair() {
  return circle(8, 16.4, 5) + circle(8, 16.4, 1, SOLID) + circle(18.8, 20.2, 1.3) + path("M8 13.4h6.2l3.4 5.6") +
    path("M8.4 6.6 8.8 12.6h5l1.6 4.6", ' stroke-width="2.1"') + circle(7.8, 4.2, 2.15, SOLID);
}
/** A kayak hull seen from the side, length from x0 to x1 at waterline y. */
export function hull(x0, x1, y, depth = 2) {
  return path(`M${fmt(x0)} ${fmt(y)}Q${fmt((x0 + x1) / 2)} ${fmt(y + depth * 2)} ${fmt(x1)} ${fmt(y)}Z`, TINT);
}
/** A double-bladed paddle crossing at angle; blades are small solid lozenges. */
export function doublePaddle(cx, cy, len = 9, deg = 120) {
  const a = step([cx, cy], deg, len), b = step([cx, cy], deg + 180, len);
  const blade = ([x, y]) => {
    const [ux, uy] = dir(deg);
    const p1 = [x + ux * 1.6, y + uy * 1.6], p2 = [x - ux * 1.6, y - uy * 1.6];
    return `M${pt(p1)}L${pt(p2)}`;
  };
  return path(`M${pt(a)}L${pt(b)}`) + path(blade(a) + blade(b), ' stroke-width="2.8"');
}
export const T = (cx, cy, deg) => ` transform="rotate(${deg} ${cx} ${cy})"`;

/** A strung racket head (ellipse) with its throat and handle, drawn upright then turned by `deg` around the head centre. */
export function racket({ cx = 14.5, cy = 9.5, rx = 4.4, ry = 5.6, deg = 45, handle = 8, strings = true, holes = false, tint = false, throat = 1.4 } = {}) {
  const t = T(cx, cy, deg);
  let s = ellipse(cx, cy, rx, ry, (tint ? TINT : "") + t);
  if (strings) {
    const v = [-rx * 0.45, 0, rx * 0.45].map((x) => { const h = ry * Math.sqrt(1 - (x / rx) ** 2) - 0.5; return `M${cx + x} ${cy - h}V${cy + h}`; });
    const hz = [-ry * 0.42, 0, ry * 0.42].map((y) => { const w = rx * Math.sqrt(1 - (y / ry) ** 2) - 0.5; return `M${cx - w} ${cy + y}H${cx + w}`; });
    s += path([...v, ...hz].join(""), FINE + t);
  }
  if (holes) {
    const pts = [[-1.8, -2.2], [0, -2.2], [1.8, -2.2], [-1.8, 0], [0, 0], [1.8, 0], [-1.8, 2.2], [0, 2.2], [1.8, 2.2]];
    s += path(pts.map(([x, y]) => `M${cx + x} ${cy + y}h.01`).join(""), ' stroke-width="1.5"' + t);
  }
  s += path(`M${cx - throat} ${cy + ry - 0.3}L${cx} ${cy + ry + 1.8}L${cx + throat} ${cy + ry - 0.3}M${cx} ${cy + ry + 1.8}V${cy + ry + 1.8 + handle}`, t);
  return s;
}
/** A ball with the seam of a tennis ball. */
export const tennisBall = (cx, cy, r = 2.5) => circle(cx, cy, r, TINT) + path(`M${cx - r * 0.75} ${cy - r * 0.66}q${r * 0.95} ${r * 0.66} 0 ${r * 1.32}M${cx + r * 0.75} ${cy - r * 0.66}q${-r * 0.95} ${r * 0.66} 0 ${r * 1.32}`, FINE);


/** Apply an SVG transform to every element of a glyph fragment (composing with a transform it already has). */
export function tf(svg, t) {
  return svg.replace(/<(path|circle|rect|ellipse|line|polyline)\b([^>]*?)(\/?)>/g, (m, tag, attrs, slash) => {
    if (/transform="/.test(attrs)) return `<${tag}${attrs.replace(/transform="([^"]*)"/, (_, v) => `transform="${t} ${v}"`)}${slash}>`;
    return `<${tag}${attrs} transform="${t}"${slash}>`;
  });
}
/** A skate boot seen from the side, toe to the right. low: the cut of a speed or inline skate. */
export function skateBoot({ low = false } = {}) {
  return low
    ? path("M6.4 8.6h4.4v3.2l6.4 2.2c1.4.5 2.4 1.5 2.4 2.8v.6H6.4Z", TINT)
    : path("M6.6 3.4h4.6v7.4l5.8 2.3c1.4.5 2.2 1.6 2.2 2.8v1.5H6.6Z", TINT);
}
/** A ball with sound waves: the sports of the visually impaired play by ear. */
export const soundWaves = (x = 18.4, y = 12) => path(`M${x} ${y - 3.6}a5 5 0 0 1 0 7.2M${x + 2.4} ${y - 5.6}a8.4 8.4 0 0 1 0 11.2`, FINE);
