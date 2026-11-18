// TITAN sport icons — the drawings. Each entry is the inner SVG of a 24 × 24 glyph, drawn with the parts of parts.mjs.
// Build: node tools/sport-icons/build.mjs (writes js/app/sport-icons.js). Look: node tools/sport-icons/sheet.mjs --png out.png
import {
  FINE, TINT, SOLID, path, circle, ellipse, rect, dot, athlete, joints, step, poly, T, racket, tennisBall,
  wave, ground, dashedGround, rockyGround, sand, beach, bicycle, wheelchair, hull, doublePaddle,
} from "./parts.mjs";

import { ENDURANCE } from "./glyphs/endurance.mjs";
import { WATER_SNOW } from "./glyphs/water-snow.mjs";
import { STRENGTH_COMBAT } from "./glyphs/strength-combat.mjs";
import { PLAY } from "./glyphs/play.mjs";
import { ART_MIND } from "./glyphs/art-mind.mjs";
import { CLIMBING } from "./glyphs/climbing.mjs";

const LOT1 = {
  // ---------------------------------------------------------------- endurance on foot
  "sport-running": athlete({ hip: [10.4, 12.4], torso: 162, armA: [62, 152], armB: [-62, 18], legA: [48, -8], legB: [-38, -100] }),
  "sport-walking": athlete({ hip: [11.6, 12.3], torso: 176, armA: [28, 12], armB: [-26, -10], legA: [22, 4], legB: [-20, -6] }),
  "sport-nordic-walk": (() => {
    const o = { hip: [11, 12.3], torso: 170, armA: [40, 75], armB: [-30, -5], legA: [24, 4], legB: [-22, -6] };
    const j = joints(o);
    return athlete(o) + path(poly(j.handA, [j.handA[0] - 2.8, 21.6]) + poly(j.handB, [j.handB[0] - 3.6, 21.6]), FINE);
  })(),
  "sport-trail": athlete({ hip: [9.8, 11.4], torso: 152, armA: [60, 150], armB: [-60, 20], legA: [62, 10], legB: [-30, -60] }) + path("M2 21.8 22 13.6"),
  "sport-treadmill": rect(2.5, 17, 15, 2.8, 1.4, TINT) + path("M4.5 19.8v1.8M15.5 19.8v1.8M16.6 17 19.4 7.4h2.2M19.8 10.4h-6.2"),
  "sport-athletics": rect(2.5, 5.5, 19, 13, 6.5) + rect(6.4, 9.4, 11.2, 5.2, 2.6, TINT) + path("M12 5.5v3.9M12 14.6v3.9", FINE),
  "sport-hurdles": rect(4, 6.5, 16, 3.2, 0.6, TINT) + path("M6.5 9.7V20M17.5 9.7V20M4 20h5M15 20h5"),
  "sport-sprint": circle(12, 13.2, 8) + path("M12 13.2V5.2A8 8 0 0 1 20 13.2Z", TINT) + path("M12 13.2V21.2A8 8 0 0 1 4 13.2Z", TINT) + path("M10 2.5h4M12 2.5v2.7"),
  "sport-hiit": circle(12, 13.2, 8) + path("M10 2.5h4M12 2.5v2.7M18.2 5.6l1.4-1.4") + path("M13 7.6 9.4 13.8h3.2l-1.2 4.7 4.2-6.6h-3.2Z", TINT),
  // ---------------------------------------------------------------- mountain on foot
  "sport-hiking": path("M5.6 3.6h5.3l.6 6.6 6.3 2.4a2.6 2.6 0 0 1 1.7 2.4v2.4H5.2Z", TINT) + path("M4.6 17.4h15.2v1.6a1.2 1.2 0 0 1-1.2 1.2H5.8a1.2 1.2 0 0 1-1.2-1.2ZM6.8 20.2v1.4M10.2 20.2v1.4M13.6 20.2v1.4M17 20.2v1.4M8 6.2h3.1M8 8.8h3.3"),
  "sport-trekking": path("M6 9a6 6 0 0 1 12 0v10.6a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 1 6 19.6Z", TINT) + path("M10 3.2V2h4v1.2M6 12.4H4.4v6H6M18 12.4h1.6v6H18") + rect(8.6, 13.2, 6.8, 5.2, 1.2) + path("M8.6 15.2h6.8", FINE),
  "sport-rucking": path("M6 7.4a3.4 3.4 0 0 1 3.4-3.4h5.2A3.4 3.4 0 0 1 18 7.4v10.8a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 1 6 18.2Z") + rect(8.4, 9, 7.2, 4.6, 1, SOLID) + path("M10 4V2.4h4V4M2.6 22h3M10.5 22h3M18.4 22h3"),
  // ---------------------------------------------------------------- wheels
  "sport-cycling": bicycle({ kind: "flat", dy: -1.4 }),
  "sport-cycling-road": bicycle({ kind: "road", dy: -1 }) + path("M2 21.6h4M10 21.6h4M18 21.6h4"),
  "sport-gravel": bicycle({ kind: "road", dy: -1 }) + path("M2.5 21.8h.01M5.2 21.2h.01M8 21.9h.01M11 21.3h.01M14 21.9h.01M17 21.2h.01M19.8 21.8h.01", ' stroke-width="1.8"'),
  "sport-mountain-bike": bicycle({ kind: "mtb", dy: -1.2 }) + rockyGround(21.9),
  "sport-cycling-indoor": bicycle({ kind: "road", dy: -2.4 }) + path("M5.5 13.6v3.6M3 21.4l2.5-4.2 2.5 4.2M2.2 21.4h6.6") + rect(15.4, 17.3, 6.2, 1.8, 0.9, TINT),
  "sport-spinning": circle(16.8, 15.8, 3.6, TINT) + path("M4 21.5h4.6M14 21.5h6M6.3 21.5 9.3 10M17.8 21.5l-1-2.2M9 13.4l6.6-.6.4-5M14.4 7.8h3.4M7.6 9.6h3.4"),
  // ---------------------------------------------------------------- water
  "sport-swimming": circle(7.4, 11, 2, SOLID) + path("M9.8 12.6C11 7.2 16.4 6.6 18.6 11.4") + wave(15.4, 2, 22) + wave(19.9, 2, 22),
  "sport-rowing": path("M2 14.6h20l-2.2 2.4H4.6Z", TINT) + path("M7.4 7.4 13.8 21") + path("M13 19.3l1.8 3.6", ' stroke-width="2.8"') + circle(10.8, 10.8, 1.9, SOLID) + wave(20.6, 2, 9),
  "sport-rowing-machine": path("M2.8 17.6H17M3.6 17.6v3.6M18.2 16.8v4.4M12 17.6l1.6-4.4M14.6 12.8H9.6M9.6 11.2v3.2") + circle(18.2, 12.8, 3.6, TINT) + rect(4.8, 15.2, 4, 2.4, 1),
  "sport-kayak": path("M2 15.4Q12 20.6 22 15.4Q12 12.6 2 15.4Z", TINT) + circle(12, 9.6, 1.9, SOLID) + doublePaddle(12, 12.4, 8.6, 118),
  "sport-surfing": ellipse(9.6, 11, 2.6, 8.6, TINT + T(9.6, 11, 28)) + path("M9.6 3.6V18.4", FINE + T(9.6, 11, 28)) + path("M12.6 21.6c3.4 0 4.4-5.6 8.4-6.6-2.3 1.4-2.4 4.3-.6 5.4"),
  // ---------------------------------------------------------------- snow
  "sport-alpine-skiing": path("M2.6 12.6 17.8 21M5.2 9.6l14.9 8.3M2.6 12.6c-.9-.5-.8-1.5 0-1.7M5.2 9.6c-.9-.5-.8-1.5 0-1.7") + path("M15.6 2.4v9.4") + path("M15.6 3l5 1.9-5 1.9Z", TINT),
  "sport-snowboard": rect(2.6, 9.4, 18.8, 5.2, 2.6, TINT + T(12, 12, -30)) + path("M7.6 9.6v4.8M14.4 9.6v4.8", T(12, 12, -30)),
  // ---------------------------------------------------------------- climbing
  "sport-bouldering": path("M3.6 17.6 5.6 9.2 10 5l6.6 1 4 5.6.4 6Z", TINT) + dot(9, 9.6) + dot(13.4, 8.4) + dot(16.6, 12.4) + dot(11.6, 13.6) + rect(2.4, 18.8, 19.2, 2.8, 1),
  // ---------------------------------------------------------------- strength
  "sport-muscu-builder": [rect(3.4, 7.4, 3.2, 9.2, 1, TINT), rect(17.4, 7.4, 3.2, 9.2, 1, TINT), path("M6.6 9.4H5M6.6 12h10.8M1.8 9.6v4.8M22.2 9.6v4.8")].join("").replace('M6.6 9.4H5', 'M1.8 12h1.6M20.6 12h1.6'),
  "sport-muscu-gym": path("M5.6 2.8v18.6M18.4 2.8v18.6M3.4 21.4h4.4M16.2 21.4h4.4M2 9.6h20M5.6 11.6h1.6M18.4 11.6h-1.6") + rect(2.4, 6.4, 1.8, 6.4, 0.6, TINT) + rect(19.8, 6.4, 1.8, 6.4, 0.6, TINT),
  "sport-weightlifting": rect(3, 5, 3.4, 14, 1, TINT) + rect(17.6, 5, 3.4, 14, 1, TINT) + path("M6.4 12h11.2M1.8 12h1.2M21 12h1.2M7.8 10.4v3.2M16.2 10.4v3.2"),
  "sport-powerlifting": rect(3.4, 7, 2.6, 13, 0.8, TINT) + rect(18, 7, 2.6, 13, 0.8, TINT) + path("M6 8.8v9.4M18 8.8v9.4M7.6 10.6v5.8M16.4 10.6v5.8M7.6 13.5h8.8M1.8 21.4h20.4M2 13.5h1.4M20.6 13.5H22"),
  "sport-kettlebell": path("M8.6 9V7.6a3.4 3.4 0 0 1 6.8 0V9") + path("M6.4 20.6a6.6 6.6 0 1 1 11.2 0Z", TINT),
  "sport-bodyweight": athlete({ hip: [12, 13.6], torso: 180, armA: [-128, -150], armB: [128, 150], legA: [24, 22], legB: [-24, -22] }),
  // ---------------------------------------------------------------- mind and body
  "sport-yoga": athlete({ hip: [12, 15.6], torso: 180, armA: [32, 44], armB: [-32, -44], legA: [78, -84], legB: [-78, 84] }) + path("M3.6 19.6h16.8"),
  "sport-pilates": circle(12, 12, 8) + rect(2.4, 9.4, 3.2, 5.2, 1.3, TINT) + rect(18.4, 9.4, 3.2, 5.2, 1.3, TINT),
  "sport-stretching": athlete({ hip: [13.4, 13.4], torso: 202, head: 210, armA: [-160, -130], armB: [-176, -150], legA: [24, 18], legB: [-24, -18] }),
  "sport-yoga-mobility": ellipse(5.4, 12, 2.2, 5, TINT) + path("M5.4 7h12.6a2.2 5 0 0 1 0 10H5.4") + path("M9.6 9.4v5.2M13.2 9.4v5.2M16.8 9.4v5.2", FINE),
  "sport-dance": athlete({ hip: [11.6, 13], torso: 172, armA: [-150, -170], armB: [110, 140], legA: [6, 0], legB: [-70, -40] }),
  // ---------------------------------------------------------------- ball and team
  "sport-football": circle(12, 12, 9) + path("M12 8.4l3.4 2.5-1.3 4h-4.2l-1.3-4Z", SOLID) + path("M12 8.4V3M15.4 10.9l5.2-1.7M14.1 14.9l3.2 4.4M9.9 14.9l-3.2 4.4M8.6 10.9 3.4 9.2", FINE),
  "sport-basketball": circle(12, 12, 9, TINT) + path("M3 12h18M12 3v18M5.6 5.6c3.4 3.6 3.4 9.2 0 12.8M18.4 5.6c-3.4 3.6-3.4 9.2 0 12.8", FINE),
  "sport-volleyball": circle(12, 12, 9) + path("M12 12c0-4.4 2.2-7.6 5.6-8.6M12 12c-3.8 2.2-7.6 2.2-9-.4M12 12c3.8 2.2 5.4 5.6 4.6 8.4", "") + path("M12 12c-1.3-3.8-.3-7 2-9M12 12c-4 .2-6.6 2.4-7 5.4M12 12c2.6 2.6 6.2 3.4 8.6 2", FINE),
  "sport-handball": path("M3 20V4.6h18V20") + path("M3 8.4h18M3 12.2h18M7.5 4.6V20M12 4.6V12M16.5 4.6V20", FINE) + circle(12, 16.4, 3.6, TINT) + path("M12 12.8v7.2M8.6 15.4c2.2 1 4.6 1 6.8 0", FINE),
  "sport-rugby": ellipse(12, 12, 9, 5.6, TINT + T(12, 12, -38)) + path("M5.6 12c4-1.6 8.8-1.6 12.8 0M10 10.6v2.2M12 10.4v2.2M14 10.6v2.2", FINE + T(12, 12, -38)),
  "sport-golf": path("M8.4 20.6V3") + path("M8.4 3.4 17 6.6l-8.6 3.2Z", TINT) + ellipse(8.4, 20.6, 3.6, 1.1) + circle(16.8, 19.4, 1.9),
  // ---------------------------------------------------------------- racket
  "sport-tennis": racket({ cx: 13.6, cy: 9.6, deg: 45, handle: 7.4 }) + tennisBall(18.4, 18.4, 2.6),
  "sport-padel": racket({ cx: 13.6, cy: 9.4, rx: 5, ry: 5.6, deg: 45, handle: 5.4, strings: false, holes: true, tint: true, throat: 2.2 }) + circle(19.2, 19.2, 1.9),
  "sport-squash": racket({ cx: 14.4, cy: 8.6, rx: 3.4, ry: 5, deg: 40, handle: 7.6, throat: 1 }) + circle(18.6, 18.4, 1.6, SOLID) + path("M21.6 2.6v13", FINE),
  "sport-badminton": path("M9.2 17.4h5.6a2.8 2.8 0 0 1-5.6 0Z", TINT) + path("M9.2 17.4 6 4.6M14.8 17.4 18 4.6M6 4.6q6-1.8 12 0M7.4 10.6h9.2M10.8 17.2 10 4.2M13.2 17.2 14 4.2", ""),
  "sport-table-tennis": circle(10.4, 10, 6.4, TINT) + path("M14.6 14.6l4.6 4.6a1.4 1.4 0 0 1-2 2l-4.6-4.6") + circle(19.2, 5.4, 1.9, SOLID),
  // ---------------------------------------------------------------- combat
  "sport-boxing": path("M6.6 14.2C5.8 8.2 9.4 4 13.8 4c4.2 0 6.4 3 6.4 7 0 3.6-2 5.8-4.6 6.2v1.2H8.6v-2.2c-1.2-.6-1.9-1.4-2-2Z", TINT) + path("M6.6 12.2C5 10.6 3.4 12 4.4 13.8c.8 1.4 2.4 2.4 4.6 2.4M8.6 18.4h7v3.2h-7Z") + path("M11 18.4v3.2", FINE),
  "sport-mma": path("M7 15.4V9.6a3.6 3.6 0 0 1 3.6-3.6h5a3.4 3.4 0 0 1 3.4 3.4v3.4a4.4 4.4 0 0 1-4.4 4.4H9") + rect(7, 6, 13, 4.4, 2, TINT) + path("M10.4 10.4v2.4M13.4 10.4v2.4M16.4 10.4v2.4M7 13.2c-1.8-.2-3-1.6-2.6-3.2M8.4 17.2v4.4h7v-4.4") + path("M8.4 19.4h7", FINE),
  "sport-judo": path("M9 3.6 3.8 6.6l1.6 5 1.8-.8V21h9.6V10.8l1.8.8 1.6-5L15 3.6") + path("M9 3.6 12 10.4 15 3.6M12 10.4 9.6 14.4", "") + rect(7.2, 14.4, 9.6, 2.2, 0, TINT) + path("M11.2 16.6l-1.2 3.6M12.8 16.6l1.2 3.6"),
  "sport-karate": rect(2.4, 8.4, 19.2, 4, 0.8) + rect(9.6, 7.2, 4.8, 6.4, 1.2, TINT) + path("M10.6 13.6 8.2 21l2.6.6 1.6-7.4M13.4 13.6l2.4 7.4-2.6.6-1.6-7.4"),
  "sport-fencing": path("M3.4 20.6 20.8 3.2") + ellipse(7.6, 16.4, 3.6, 1.7, TINT + T(7.6, 16.4, -45)) + path("M4.8 19.2 3 21"),
};

const FAMILIES = [LOT1, ENDURANCE, WATER_SNOW, STRENGTH_COMBAT, PLAY, ART_MIND, CLIMBING];
export const GLYPHS = {};
for (const set of FAMILIES) for (const [k, v] of Object.entries(set)) {
  if (GLYPHS[k]) throw new Error(`duplicate glyph ${k}`);
  GLYPHS[k] = v;
}
