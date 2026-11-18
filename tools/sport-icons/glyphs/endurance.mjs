// Endurance on foot, multisport, wheels.
import {
  FINE, TINT, SOLID, path, circle, ellipse, rect, dot, athlete, joints, poly, T, tf,
  wave, rockyGround, bicycle, wheelchair, doublePaddle,
} from "../parts.mjs";

/** A shoe print: forefoot and heel, apart. */
const footprint = (cx, cy, s = 1, deg = 0) =>
  ellipse(cx, cy - 1.3 * s, 1.75 * s, 2.5 * s, TINT + T(cx, cy, deg)) + ellipse(cx, cy + 2.9 * s, 1.35 * s, 1.35 * s, SOLID + T(cx, cy, deg));
/** Two prints, left and right: someone ran here. */
const prints = (cx, cy, s = 1) => footprint(cx - 2.1 * s, cy + 1.2 * s, s, -8) + footprint(cx + 2.1 * s, cy - 1.2 * s, s, 8);
/** A running shoe from the side, toe to the right, about 9 × 5 units from (x, y). */
const runShoe = (x, y) => path(`M${x} ${y}h3.4l1 2.4 3.6 1.2c1 .3 1.6 1 1.6 1.8v.8H${x}Z`, TINT) + path(`M${x - 0.2} ${y + 6.6}h9.8`);
/** A bike wheel with three spokes. */
const spokedWheel = (cx, cy, r) => circle(cx, cy, r) + path(`M${cx} ${cy}V${cy - r}M${cx} ${cy}l${r * 0.866} ${r / 2}M${cx} ${cy}l${-r * 0.866} ${r / 2}`, FINE) + circle(cx, cy, 1, SOLID);
const miniBike = (x, y, k) => tf(bicycle({ kind: "road" }), `translate(${x} ${y}) scale(${k})`);
/** The BMX: a smaller frame, riser bars, wheels r 3.2. */
const bmx = (extra = "") =>
  circle(6, 15.4, 3.2, extra) + circle(16.6, 15.4, 3.2, extra) +
  path("M6 15.4h4.6l4.2-4.6M6 15.4l3.4-4.4h5.4l1.8 4.4M10.6 15.4 9.6 10M8.4 9.8h2.4M14.4 8.2l.4 2.8M13.2 8.2h3", extra);
const flagOrienteering = (x, y, s = 1) =>
  path(`M${x} ${y - 1.4 * s}V${y + 13 * s}`) + rect(x + 1.2 * s, y, 11 * s, 9 * s, 0.6) + path(`M${x + 1.2 * s} ${y}L${x + 12.2 * s} ${y + 9 * s}H${x + 1.2 * s}Z`, TINT);

export const ENDURANCE = {
  "sport-race-walking":
    athlete({ hip: [11.6, 12.3], torso: 174, armA: [36, 128], armB: [-44, 34], legA: [22, 22], legB: [-22, -22] }) + path("M2.4 8.6h3M2 11.8h2.4", FINE),
  "sport-orienteering": flagOrienteering(4.6, 4.2, 1.3),
  "sport-ski-orienteering": flagOrienteering(6, 2.6, 1) + path("M2.4 17.6h16.2c1.6 0 2.8-1 2.8-2.4M2.4 21.2h16.2c1.6 0 2.8-1 2.8-2.4"),
  "sport-rogaining": path("M3 5.6 8.6 3.6l6.8 2 5.6-2v15l-5.6 2-6.8-2-5.6 2Z") + path("M8.6 3.6v15M15.4 5.6v15", FINE) + path("M6 9.4 12 14l6-6", FINE) + circle(6, 9.4, 1.4, SOLID) + circle(12, 14, 1.4, SOLID) + circle(18, 8, 1.4, SOLID),
  "sport-fell-running": path("M2 21 10.6 4.6l4 7.2 2.4-3.2L22 21Z", TINT) + path("M6.4 19.4 9 17l-1.4-2.6 3-2.4-1-2.4 1.8-1.6", FINE + ' stroke-dasharray="1.6 1.6"'),
  "sport-para-athletics": circle(8.2, 15.4, 5.4) + circle(8.2, 15.4, 1.1, SOLID) + circle(20.2, 19.2, 1.4) + path("M8.2 15.4 18.8 18.8M6.2 9.8c1.6 2.4 4.4 3.4 8.2 3.6") + circle(5.4, 6.6, 2.15, SOLID),
  "sport-elliptical": ellipse(12, 17.4, 6.4, 2.6, TINT) + path("M3 21.4h18M7.6 17.4 5.4 4.6M16.4 17.4l2.2-12.8M4.4 4.6h2M17.6 4.6h2M5.6 17.4h-2M18.4 17.4h2"),
  "sport-stair-climbing": path("M2.6 21.4V17.6h4.4v-4h4.4v-4h4.4v-4h4.4V2.6", "") + path("M2.6 21.4h18.8V5.6h-4.4v4h-4.4v4H8.2v4H2.6Z", TINT + ' stroke="none"'),
  "sport-rope-jump": (() => {
    const o = { hip: [12, 12.2], torso: 180, armA: [-95, -40], armB: [95, 40], legA: [12, -8], legB: [-12, 8] };
    const j = joints(o);
    return athlete(o) + path(`M${j.handA[0]} ${j.handA[1]}C${j.handA[0] - 1.6} 23.6 ${j.handB[0] + 1.6} 23.6 ${j.handB[0]} ${j.handB[1]}`, FINE) + path("M3 22h18", FINE);
  })(),
  "sport-obstacle-course": path("M3.4 21.4 12 3.4l8.6 18") + path("M12 3.4 9 9.6 15 9.6 7.6 12.6h8.8M6.2 15.6H17.8M4.8 18.6h14.4M12 3.4v18", FINE) + path("M10.6 9.6l-2.9 6h8.6l-2.9-6Z", TINT + ' stroke="none"'),
  "sport-hyrox": path("M2.4 18.6h15.2c1.4 0 2.4-.6 3.2-1.8l1-1.6M6.6 18.6V7.4M14.6 18.6V7.4M4.8 7.4h3.6M12.8 7.4h3.6") + rect(5.2, 12.6, 10.8, 4.4, 1, TINT),
  "sport-crossfit": path("M4.6 13h10.6v8.4H4.6Z") + path("M4.6 13 8 9.6h10.6L15.2 13Z", TINT) + path("M18.6 9.6v8.4l-3.4 3.4") + path("M2.4 11.4C2.4 5 7 2.6 11.4 5.2", FINE) + path("M10.6 3.2l1.4 2.2-2.4 1", FINE),
  "sport-fitness-class": rect(2.6, 16, 18.8, 2.8, 1.2, TINT) + path("M5 18.8v2.6M19 18.8v2.6M14.2 12.4V3.4l4.4 1.4") + ellipse(12.6, 12.6, 2, 1.5, SOLID),
  "sport-modern-pentathlon": (() => {
    const pts = [0, 72, 144, 216, 288].map((a) => [12 + 8.4 * Math.sin((a * Math.PI) / 180), 12.8 - 8.4 * Math.cos((a * Math.PI) / 180)]);
    return path(poly(...pts) + "Z", TINT) + pts.map(([x, y]) => circle(x, y, 1.5, SOLID)).join("");
  })(),
  "sport-triathlon": wave(20.4, 2, 22, 1.5) + spokedWheel(6.8, 9.4, 4.6) + runShoe(12.6, 6.6),
  "sport-duathlon": spokedWheel(7, 10.6, 5.2) + runShoe(12.8, 9.4) + path("M2 21h20"),
  "sport-aquathlon": wave(17.4, 2, 22, 1.5) + wave(21.4, 2, 22, 1.5) + runShoe(7.2, 5.4),
  "sport-swimrun": wave(20.4, 2, 22, 1.5) + runShoe(2.6, 7) + path("M14.6 4.4a2.2 2.2 0 0 1 4.4 0v1.4a2.2 2.2 0 0 1-4.4 0ZM14.6 10.4a2.2 2.2 0 0 1 4.4 0v1.4a2.2 2.2 0 0 1-4.4 0Z", TINT) + path("M16.8 8v2", FINE),
  "sport-adventure-racing": path("M2 20.6 9.4 8l3.8 6 2.6-3.6 6.2 10.2Z", TINT) + doublePaddle(12.6, 9.6, 8.4, 132),
  // ---------------------------------------------------------------- wheels
  "sport-velotaf": bicycle({ kind: "city", dy: -1.2 }) + rect(17, 9.4, 4.6, 2.8, 0.6, TINT),
  "sport-cycling-track": bicycle({ kind: "track", dy: -2.2 }) + path("M2 17.6c0 2.6 1.6 3.8 4 3.8h12c2.4 0 4-1.2 4-3.8"),
  "sport-bmx": tf(bmx(), "rotate(-14 11 14)") + path("M2 21.6c3.4 0 4.6-2.6 7.6-2.6S14 21.6 17 21.6h5"),
  "sport-bmx-freestyle": tf(bmx(), "translate(-1.4 -2.6) rotate(-30 11 13)") + path("M14.6 21.4H22V9.6c0 6.6-2.4 11.8-7.4 11.8Z", TINT),
  "sport-bmx-racing": bmx() + rect(14.2, 4.6, 4, 3.2, 0.6, TINT) + path("M2 21.2h20"),
  "sport-cyclocross": tf(bicycle({ kind: "road" }), "translate(-.4 -1.6) rotate(-12 5.5 16)") + path("M15.6 21.4v-4.6M21 21.4v-4.6M15.6 17.8H21M2 21.4h20"),
  "sport-handbike": circle(6.4, 15.6, 4.6) + circle(6.4, 15.6, 1, SOLID) + circle(19.4, 18.2, 2.4) + path("M6.4 15.6 19.4 18.2M17.6 12.2 19.4 18.2M3.6 9.4l2.8 6.2M8 9.8l8.6 2.2M15.6 12.2h3.6") + circle(6.4, 7, 2.15, SOLID),
  "sport-para-cycling": circle(4.6, 16, 3.3) + circle(19.4, 16, 3.3) + path("M4.6 16h9.8M7 10.4h9.8l2.6 5.6M4.6 16 7 10.4M9.4 16 8.4 9.2M14.4 16l-1-6.8M6.8 9.2h2.8M11.8 9.2h2.8M16.2 8.4h2.4M10 9.6l1.4 1.4"),
  "sport-artistic-cycling": tf(bicycle({ kind: "flat" }), "translate(1.6 2) rotate(-38 5.5 16)") + path("M2 21.4h20"),
  "sport-cycle-ball": tf(bicycle({ kind: "flat" }), "translate(-.6 -.4) scale(.84)") + circle(20, 18.6, 2.4, TINT) + path("M2 21.6h20"),
  "sport-cycle-polo": tf(bicycle({ kind: "flat" }), "translate(-.6 1.6) scale(.84)") + path("M12.2 2.4 19.2 18") + path("M17.4 19.4l3.6-1.6", ' stroke-width="2.6"') + circle(21, 21, 1.1, SOLID),
  "sport-karting": circle(6, 17.8, 2.8, TINT) + circle(18.2, 17.8, 2.8, TINT) + path("M2.6 15h18.8M8.8 15l1.2-3.4h5.2l2 3.4M13.6 11.6l1.8-3") + circle(10.4, 7.8, 2.4),
  "sport-motocross": circle(5.4, 16.2, 3.8) + circle(18.6, 16.2, 3.8) + path("M5.4 16.2 9.6 12h5.6l3.4 4.2M8.2 10.2h6.6l1.6 1.8M18.6 16.2 15.8 7.6M14.2 7.6h3.4M2 12.6c2-1.6 4.4-1.8 6.2-1.2") + path("M2.6 19.4h.01M8.2 19.4h.01M15.8 19.4h.01M21.4 19.4h.01", ' stroke-width="1.8"'),
};
