// Water and snow: what floats, what glides.
import {
  FINE, TINT, SOLID, path, circle, ellipse, rect, dot, athlete, joints, poly, T, tf,
  wave, sand, beach, doublePaddle, skateBoot,
} from "../parts.mjs";

const swimmerHead = (x, y) => circle(x, y, 2.15, SOLID);
const lens = (x0, x1, y, d = 2.6) => `M${x0} ${y}Q${(x0 + x1) / 2} ${y + d * 2} ${x1} ${y}Q${(x0 + x1) / 2} ${y - d * 0.9} ${x0} ${y}Z`;
const singlePaddle = (x1, y1, x2, y2) => path(`M${x1} ${y1}L${x2} ${y2}`) + path(`M${x2 + (x2 - x1) * 0.02} ${y2 + 0.1}l${(x2 - x1) * 0.16} ${(y2 - y1) * 0.16}`, ' stroke-width="3"');
const ski = (x0, x1, y, curl = 2.4) => `M${x0} ${y}H${x1 - curl}c${curl * 0.7} 0 ${curl} -.8 ${curl} -${curl * 0.9}`;

export const WATER_SNOW = {
  "sport-open-water-swimming": swimmerHead(5.6, 11.4) + path("M7.8 13C8.8 8.4 12.8 8 14.4 12") + path("M16.6 15.4 19 6.6l2.6 8.8Z", TINT) + wave(16, 2, 22) + wave(20.4, 2, 22),
  "sport-para-swimming": swimmerHead(7.4, 10.6) + path("M9.8 12.2C11 6.8 16.4 6.2 18.6 11") + wave(15, 2, 22) + path("M2 20.2h20", FINE) + [4, 8, 12, 16, 20].map((x) => circle(x, 20.2, 1.2, SOLID)).join(""),
  "sport-artistic-swimming": path("M10.4 16.2V7.8c0-1.2.4-2.2 1.2-3l2.6-2.4c.5-.4 1.2 0 1 .6l-.9 3.2c-.3 1-.5 2-.5 3v7", TINT) + wave(16.4, 2, 22) + wave(20.6, 2, 22),
  "sport-finswimming": circle(19.4, 9.6, 2.15, SOLID) + path("M17 10.6 7.4 12.6", ' stroke-width="2.1"') + path("M7.4 12.6 2.4 8.4v8.8Z", TINT) + wave(17.4, 2, 22) + wave(21.2, 2, 22),
  "sport-freediving": wave(3.4, 2, 22, 1.2) + path("M19.6 7v13.6M17.2 18.2l2.4 2.4 2.4-2.4", FINE) + path("M13.6 8.6 7.8 15.8 4.4 19.6", ' stroke-width="2.1"') + circle(7, 14.4, 2.15, SOLID) + path("M13.6 8.6 12 4.4l5.4 2.2Z", TINT),
  "sport-diving": rect(6.4, 5.8, 6.6, 15.6, 3.3, TINT) + path("M9.7 5.8V3.6h3.4M13.1 3.6c4.2 0 5.8 2.4 5.6 6.6") + circle(18.6, 11.8, 1.6) + path("M6.4 11h6.6", FINE),
  "sport-snorkeling": rect(2.6, 8.4, 13.4, 7.6, 3.2, TINT) + path("M9.3 16v-2.2", "") + path("M18.8 15.6V5.4a2.2 2.2 0 0 1 2.2-2.2M16 12.2h2.8") + path("M2.6 11.2H1.8M16 11.2h.8", FINE),
  "sport-lifesaving-sport": circle(12, 12, 8.6) + circle(12, 12, 4.2) + path("M12 3.4v4.4M12 16.2v4.4M3.4 12h4.4M16.2 12h4.4", ' stroke-width="2.8"') + path("M12 12m-6.4 0a6.4 6.4 0 1 0 12.8 0a6.4 6.4 0 1 0-12.8 0", ' stroke-width="4.2" stroke-opacity=".2"'),
  "sport-aquagym": ellipse(5.8, 8.4, 2.4, 4, TINT) + ellipse(18.2, 8.4, 2.4, 4, TINT) + path("M8.2 8.4h7.6") + wave(15.6, 2, 22) + wave(20, 2, 22),
  "sport-water-polo": circle(12, 9.6, 6.4, TINT) + path("M6.4 6.8c3.6 2 7.6 2 11.2 0M7 13.2c3.2-1.8 6.8-1.8 10 0M12 3.2v12.8", FINE) + wave(16.6, 2, 22) + wave(20.8, 2, 22),
  "sport-underwater-hockey": wave(3.4, 2, 22, 1.2) + path("M5 8.6l5.4 8.4c.6 1 1.8 1.4 2.8.8") + path("M14.4 19.2a3.2 1.2 0 0 1 6.4 0v1a3.2 1.2 0 0 1-6.4 0Z", SOLID) + path("M7.4 13.2h.01M9.6 9.6h.01", ' stroke-width="1.6"'),
  "sport-underwater-rugby": wave(3.4, 2, 22, 1.2) + circle(12, 14.4, 5.6, TINT) + path("M7.8 11.6c2.6 1.4 5.8 1.4 8.4 0", FINE) + path("M18.6 8.6h.01M20 6.6h.01M4.8 8h.01", ' stroke-width="1.8"'),
  "sport-canoe-polo": path(lens(2.4, 21.6, 16.4, 2.4), TINT) + swimmerHead(9.6, 11) + circle(17.4, 6.6, 3, TINT) + path("M14.6 5.6c1.8 1 3.8 1 5.6 0M17.4 3.6v6", FINE) + path("M3.6 6.4 14 16", ""),
  "sport-coastal-rowing": path("M2.4 12.4h19.2Q20 18 12 18T2.4 12.4Z", TINT) + path("M8.2 6 14.4 21") + circle(10.6, 9.4, 2.15, SOLID) + wave(21, 15, 22, 1.5) + wave(21, 2, 8, 1.5),
  "sport-canoe-sprint": path(lens(2.4, 21.6, 15.6, 2.6), TINT) + swimmerHead(11, 8.4) + singlePaddle(15.6, 3, 13.2, 17.6) + path("M11 10.6v3.6", ' stroke-width="2.1"'),
  "sport-canoe-slalom": path("M2.4 3.2h19.2", FINE) + path("M7 3.2v9.4M17 3.2v9.4", ' stroke-width="2.2" stroke-dasharray="2 1.6"') + path(lens(4, 20, 18.2, 2), TINT) + swimmerHead(12, 14.4) + wave(21.8, 2, 22, 1),
  "sport-outrigger-canoe": path(lens(2, 17.6, 15.4, 2.2), TINT) + swimmerHead(8.4, 9) + singlePaddle(12.6, 4.4, 10.6, 17.4) + path(lens(15.6, 22, 13.2, 0.7)) + path("M13.4 13.8c1.4-3.4 3.4-4 5.4-.8", "") + wave(21, 2, 22, 1.2),
  "sport-dragon-boat": path("M2.4 13.4H18l2-4.2c.4-.8 1.6-.6 1.6.4v2.2l-2 4H4.6c-1.2 0-1.8-.8-2.2-2.4Z", TINT) + path("M7 13.4l-1.4 4.8M11 13.4l-1.4 4.8M15 13.4l-1.4 4.8") + wave(21, 2, 22, 1.2),
  "sport-surfski": path(lens(2, 22, 15.6, 1.4), TINT) + swimmerHead(12, 9.4) + doublePaddle(12, 11.8, 8.2, 112) + wave(20.6, 2, 22, 1.4),
  "sport-rafting": rect(3, 12, 18, 5, 2.5, TINT) + swimmerHead(8.4, 8.4) + swimmerHead(15.6, 8.4) + path("M6 6.8 10.6 15.8M13.2 6.8l4.6 9", "") + wave(20.8, 2, 22, 1.6),
  "sport-paddle": path(lens(2.4, 21.6, 18.2, 1.4), TINT) + path("M17.2 2.6 11.6 16.4") + path("M11.4 16.4l-.8 2", ' stroke-width="3"') + path("M15.8 2.6h2.8") + athlete({ hip: [8.6, 12.4], torso: 176, scale: 0.68, armA: [80, 120], armB: [70, 130], legA: [10, -2], legB: [-10, 2] }),
  "sport-surf-bodyboard": "",
  "sport-bodyboarding": rect(6.8, 3, 9.6, 14, 3.4, TINT + T(11.6, 10, 18)) + path("M11.6 4.4v11.2", FINE + T(11.6, 10, 18)) + path("M2 21c3.4 0 4.6-3.6 8.6-3.6 3 0 4 2 7.4 2 2.2 0 3-.8 4-1.6"),
  "sport-skimboarding": ellipse(11.2, 13.4, 8.4, 2.6, TINT) + path("M2.4 18.4c3 0 3.6-1.6 6.6-1.6s3.6 1.6 6.6 1.6 3.6-1.6 6.4-1.6", FINE) + sand(21.4) + path("M3 9.6h3.4M2.4 12h2.2", FINE),
  "sport-kitesurf": path("M3.4 8.4C6 2.6 18 2.6 20.6 8.4 17 7 7 7 3.4 8.4Z", TINT) + path("M3.8 8.4 10.8 15.8M20.2 8.4l-7 7.4", FINE) + path("M10.2 15.8h3.6") + rect(5.4, 19.2, 13.2, 2.4, 1.2),
  "sport-windsurf": path("M10.6 2.6V17h8.8C18.2 10.8 15 5.6 10.6 2.6Z", TINT) + path("M10.6 9.8l6.6 1.2", FINE) + path("M2.6 19.6h17.2c1.2 0 2-.6 2-1.6"),
  "sport-sailing": path("M12.4 2.6V16h7.8Z", TINT) + path("M10.8 4.6V16H4.6Z") + path("M2.6 18h18.8l-2.4 3.2H5Z"),
  "sport-wakeboard": rect(4.2, 15.4, 13.6, 3.2, 1.6, TINT + T(11, 17, -14)) + path("M8 15.4v2.8M13 14.4v2.8", T(11, 17, -14)) + path("M2.4 3 15.6 10.4", FINE) + path("M14.6 8.6l1.8 3.4") + path("M2 21.6c4 0 6-1.4 9-1.4s4.4 1.4 6.6 1.4c2 0 3.4-1 4.4-2.4"),
  "sport-water-skiing": path(ski(2.6, 21.4, 16.4)) + path("M8 16.4v-2M13.4 16.4v-2") + path("M2.4 4.6 15.4 10.6", FINE) + path("M14.6 8.8l1.6 3.4") + wave(20.6, 2, 22, 1.2),
  "sport-springboard-diving": path("M2 19.4h10.4", ' stroke-width="2.4"') + path("M6.6 19.4l1.4 2.2H5.2Z") + path("M11.6 16.2C14 5.6 19.4 4.6 21 13", FINE + ' stroke-dasharray="1.6 1.6"') + circle(16.8, 6.6, 2.15, SOLID) + wave(20.8, 15.4, 22, 1.2),
  // ---------------------------------------------------------------- snow
  "sport-ski-touring": (() => {
    const o = { hip: [10.4, 11], torso: 164, scale: 0.92, armA: [40, 70], armB: [-24, 6], legA: [40, -4], legB: [-14, -30] };
    const j = joints(o);
    return athlete(o) + path("M2.4 21.4 21.6 12.4c.8-.4 1.2-1.2.8-1.8") + path(`M${j.handA[0]} ${j.handA[1]}L${j.handA[0] + 1.2} 16.6M${j.handB[0]} ${j.handB[1]}L${j.handB[0] - 1} 20`, FINE);
  })(),
  "sport-ski-mountaineering": path("M2 21.4 9.6 9.2l3.2 4.8 2.2-3L22 21.4Z", TINT) + path("M14.2 2.6 20.8 12.8M20.8 2.6 14.2 12.8M14.2 2.6c-.6-.4-1.4 0-1.4.8M20.8 2.6c.6-.4 1.4 0 1.4.8"),
  "sport-freestyle-skiing": path("M4.4 6.4 18 17.6M18 6.4 4.4 17.6M4.4 6.4c-1-.8-2.2 0-1.8 1.2M18 17.6c1 .8 2.2 0 1.8-1.2M18 6.4c1-.8 2.2 0 1.8 1.2M4.4 17.6c-1 .8-2.2 0-1.8-1.2") + path("M4.6 20.6A11 11 0 0 0 21.4 14", FINE + ' stroke-dasharray="1.6 1.6"'),
  "sport-telemark-skiing": (() => {
    const o = { hip: [11.6, 12], torso: 174, armA: [-40, -70], armB: [44, 70], legA: [52, -4], legB: [-26, -64] };
    return athlete(o) + path(ski(3, 21.6, 20.2, 2.2));
  })(),
  "sport-ski-jumping": path("M12 20.6 4 3.6M12 20.6 20 3.6") + circle(12, 8.4, 2.15, SOLID) + path("M12 10.6v6", ' stroke-width="2.1"') + path("M9.4 12.6 12 11.4l2.6 1.2", ' stroke-width="2.1"'),
  "sport-speed-skiing": path("M2 6.6 22 20.6") + ellipse(12.6, 10.6, 4.4, 2.4, TINT + T(12.6, 10.6, 35)) + circle(16.2, 10, 2.15, SOLID) + path("M2.4 13.6h4M2.4 16.6h6.4", FINE),
  "sport-biathlon": path(ski(2.4, 21.6, 19.6, 2.2)) + path("M3 14.6 18 5.4M18 5.4l2.6-1.6") + path("M3 14.6l1.6 2.8 3.4-2-1-2.6", TINT) + circle(19.4, 13.4, 2.6) + dot(19.4, 13.4, 0.9),
  "sport-nordic-combined": path("M12 12.4 6.4 2.6M12 12.4l5.6-9.8") + circle(12, 6.2, 1.8, SOLID) + path("M2.4 16.8h16.4c1.6 0 2.8-1 2.8-2.4M2.4 20.8h16.4c1.6 0 2.8-1 2.8-2.4"),
  "sport-roller-ski": path("M2.6 13.2h18.8") + circle(5, 15.6, 2, TINT) + circle(19, 15.6, 2, TINT) + rect(9.6, 10.6, 4.8, 2.6, 1) + path("M15.6 2.6 12.6 21", FINE),
  "sport-bobsleigh": path("M2.6 15.4C2.6 10.6 6.4 8.6 11.4 8.6H18c2 0 3.4 1.6 3.4 3.4v3.4Z", TINT) + path("M3.6 18.6H20.4M6.6 15.4v3.2M17.6 15.4v3.2M10 8.6c.6-1.6 1.8-2.4 3.4-2.4") + path("M2 21.4h20", FINE),
  "sport-luge": path("M3 17.6c0 1.6.8 2.4 2.4 2.4H20.6") + path("M7 17.6v2.4M16.6 17.6v2.4") + path("M17 14.6 5.6 15.2", ' stroke-width="2.1"') + circle(19.4, 13.6, 2.15, SOLID) + path("M5.6 15.2 3.6 13", ' stroke-width="2.1"'),
  "sport-skeleton": path("M5 17.6h15.4") + path("M7 15 19.4 15.4", ' stroke-width="2.1"') + circle(4.8, 14.2, 2.15, SOLID) + path("M2 21h20", FINE),
  "sport-curling": path("M4.4 19.6v-3.8C4.4 13.2 7.8 11.2 12 11.2s7.6 2 7.6 4.6v3.8Z", TINT) + path("M4.4 16.2h15.2", FINE) + path("M9.4 11.2V8.6h7.2c1.4 0 2.2.8 2.2 2") + path("M2 21.6h20", FINE),
  "sport-ice-hockey": path("M15.6 2.6 9.4 17.6") + path("M9.4 17.6c-.5 1.6-1.6 2.6-3.6 2.6H2.6", ' stroke-width="2.4"') + path("M14.2 18.4a3.2 1.2 0 0 1 6.4 0v1.4a3.2 1.2 0 0 1-6.4 0Z", SOLID),
  "sport-inline-hockey": skateBoot({ low: true }) + path("M5.6 17.6h14") + [7.4, 11, 14.6, 18.2].map((x) => circle(x, 19.8, 1.5)).join("") + path("M21.6 2.6 15.6 9.6M15.6 9.6h-3.4", ""),
  "sport-bandy": path("M17.4 2.6C14.6 9.4 12.4 15.4 6.8 19.6c-1 .8-2.6.6-3.4-.4") + circle(17.4, 18.4, 2.4, TINT),
  "sport-field-hockey": path("M14.6 2.6 10.2 16.2c-.8 2.6-3.6 3.4-5 1.4-.6-.8-.4-1.8.4-2.2") + circle(17, 18.8, 2.4, TINT),
  "sport-floorball": path("M14.6 2.6 9 17.2") + path("M9 17.2c-.4 1-1.2 1.6-2.4 1.6H3.4", ' stroke-width="2.4"') + circle(17, 16.4, 3.6) + path("M15.6 15.2h.01M18.4 15.2h.01M17 17.8h.01", ' stroke-width="1.6"'),
  "sport-ringette": path("M18.6 2.6 10.6 17.6") + ellipse(11.6, 18.6, 5, 2.2, TINT) + ellipse(11.6, 18.6, 2.2, 0.9, FINE),
  "sport-speed-skating": skateBoot({ low: true }) + path("M2 19.6h20M8.2 17.6v2M17.4 17.6v2"),
  "sport-short-track-speed-skating": tf(skateBoot({ low: true }) + path("M3 19.6h17.6M8.2 17.6v2M17.4 17.6v2"), "translate(0 -3)") + path("M2.4 21.6C6 19 18 19 21.6 21.6", FINE) + rect(5.2, 19.2, 1.4, 1.4, 0.3, SOLID) + rect(11.3, 18.5, 1.4, 1.4, 0.3, SOLID) + rect(17.4, 19.2, 1.4, 1.4, 0.3, SOLID),
  "sport-figure-skating": skateBoot() + path("M5.6 20.2h12c1.8 0 3-1.2 3-2.8M8.6 17.4v2.8M16.4 17.4v2.8M20.6 17.6l1.2 1M20 19.2l1 .9"),
  "sport-ice-skating": skateBoot() + path("M5.2 20h13.2c1.4 0 2.4-.8 2.4-2M8.6 17.4V20M16.4 17.4V20") + path("M2 22c2-1 4-1 6 0", FINE),
  "sport-inline-speed-skating": skateBoot({ low: true }) + path("M5 17.6h15.4") + [6.6, 10.4, 14.2, 18].map((x) => circle(x, 20, 1.7, TINT)).join("") + path("M2 11h2.6M2 14h1.6", FINE),
  "sport-roller": skateBoot() + path("M5.6 17.4h13.6") + circle(8.4, 19.8, 2, TINT) + circle(16.6, 19.8, 2, TINT) + path("M19.4 17.4l1.6 2.2", ' stroke-width="2.2"'),
  "sport-roller-derby": path("M3.6 15.6C3.6 9.2 7.4 5 12.4 5S21 8.6 21 13.8v1.8Z", TINT) + path("M12.4 7.6l1 2.2 2.4.2-1.8 1.6.6 2.4-2.2-1.3-2.2 1.3.6-2.4L9 10l2.4-.2Z", SOLID) + path("M7.4 15.6v2.6c0 1.6 1.4 2.8 3.4 2.8") + path("M2 15.6h21"),
  "sport-skateboarding": path("M2.4 12.6c.6 1.6 1.6 2.4 3.2 2.4h12.8c1.6 0 2.6-.8 3.2-2.4") + path("M7 15v1.6M17 15v1.6") + circle(7, 18.8, 1.8, TINT) + circle(17, 18.8, 1.8, TINT),
};
delete WATER_SNOW["sport-surf-bodyboard"];
