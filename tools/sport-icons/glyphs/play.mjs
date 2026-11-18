// Ball and team games, rackets, precision, horses and the air.
import { FINE, TINT, SOLID, path, circle, ellipse, rect, dot, athlete, T, tf, racket, tennisBall, beach, sand, wheelchair, soundWaves } from "../parts.mjs";

const soccer = (cx, cy, r) => {
  const k = r / 9;
  return circle(cx, cy, r) + path(`M${cx} ${cy - 3.6 * k}l${3.4 * k} ${2.5 * k}-${1.3 * k} ${4 * k}h-${4.2 * k}l-${1.3 * k}-${4 * k}Z`, SOLID) +
    path(`M${cx} ${cy - 3.6 * k}V${cy - 9 * k}M${cx + 3.4 * k} ${cy - 1.1 * k}l${5.2 * k}-${1.7 * k}M${cx + 2.1 * k} ${cy + 2.9 * k}l${3.2 * k} ${4.4 * k}M${cx - 2.1 * k} ${cy + 2.9 * k}l-${3.2 * k} ${4.4 * k}M${cx - 3.4 * k} ${cy - 1.1 * k}l-${5.2 * k}-${1.7 * k}`, FINE);
};
const volley = (cx, cy, r) => {
  const k = r / 9;
  return circle(cx, cy, r) + tf(path("M12 12c0-4.4 2.2-7.6 5.6-8.6M12 12c-3.8 2.2-7.6 2.2-9-.4M12 12c3.8 2.2 5.4 5.6 4.6 8.4"), `translate(${cx - 12 * k} ${cy - 12 * k}) scale(${k})`);
};
const basket = (cx, cy, r) => {
  const k = r / 9;
  return circle(cx, cy, r, TINT) + tf(path("M3 12h18M12 3v18M5.6 5.6c3.4 3.6 3.4 9.2 0 12.8M18.4 5.6c-3.4 3.6-3.4 9.2 0 12.8", FINE), `translate(${cx - 12 * k} ${cy - 12 * k}) scale(${k})`);
};
const handballBall = (cx, cy, r) => circle(cx, cy, r, TINT) + path(`M${cx} ${cy - r}v${2 * r}M${cx - r * 0.94} ${cy - r * 0.3}c${r * 0.6} ${r * 0.4} ${r * 1.28} ${r * 0.4} ${r * 1.88} 0`, FINE);
const rugbyBall = (cx, cy, rx, ry, deg) => ellipse(cx, cy, rx, ry, TINT + T(cx, cy, deg)) + path(`M${cx - rx * 0.7} ${cy}c${rx * 0.46} -${ry * 0.3} ${rx * 0.94} -${ry * 0.3} ${rx * 1.4} 0`, FINE + T(cx, cy, deg));
const posts = path("M5.6 21.6V2.6M18.4 21.6V2.6M5.6 12.6h12.8");
const shuttle = path("M9.2 17.4h5.6a2.8 2.8 0 0 1-5.6 0Z", TINT) + path("M9.2 17.4 6 4.6M14.8 17.4 18 4.6M6 4.6q6-1.8 12 0M7.4 10.6h9.2M10.8 17.2 10 4.2M13.2 17.2 14 4.2");

export const PLAY = {
  // ---------------------------------------------------------------- football family
  "sport-futsal": rect(2.6, 5, 18.8, 14, 1) + path("M12 5v14") + circle(12, 12, 2.8) + path("M2.6 9.4c2.2 0 3.4 1.2 3.4 2.6s-1.2 2.6-3.4 2.6M21.4 9.4c-2.2 0-3.4 1.2-3.4 2.6s1.2 2.6 3.4 2.6", FINE) + dot(12, 12, 0.9),
  "sport-beach-soccer": soccer(10, 12.4, 7.4) + beach(),
  "sport-blind-football": soccer(9.6, 12, 7.4) + soundWaves(18.6, 12),
  "sport-futnet": soccer(12, 6.6, 4.4) + path("M2.6 21.4v-8.2h18.8v8.2") + path("M2.6 16h18.8M6.4 13.2v4.6M10.2 13.2v4.6M13.8 13.2v4.6M17.6 13.2v4.6", FINE),
  "sport-american-football": path("M3.6 20.4C3 13 7 5.6 20.4 3.6 21 11 17 18.4 3.6 20.4Z", TINT) + path("M9.4 14.6 14.6 9.4") + path("M10 12.4l1.6 1.6M11.4 11l1.6 1.6M12.8 9.6l1.6 1.6M5.4 16.2l2.4 2.4M16.2 5.4l2.4 2.4", FINE),
  "sport-flag-football": path("M2.6 7.6h18.8") + rect(10, 6, 4, 3.2, 0.8) + path("M5.4 7.6v12.6l1.8-1.6 1.8 1.6V7.6M15 7.6v12.6l1.8-1.6 1.8 1.6V7.6", TINT),
  "sport-australian-rules-football": path("M4.6 21.6V7.6M9.4 21.6V3M14.6 21.6V3M19.4 21.6V7.6") + rugbyBall(12, 9.4, 3.4, 2.2, -30),
  "sport-gaelic-football": posts + path("M5.6 15.6h12.8M5.6 18.6h12.8M9 12.6v9M12 12.6v9M15 12.6v9", FINE) + circle(12, 6.6, 2.6, TINT),
  "sport-rugby-sevens": posts + rugbyBall(12, 6.6, 3.8, 2.4, -30),
  "sport-wheelchair-rugby": wheelchair() + path("M15.2 15.5h3.6", ' stroke-width="2.4"') + circle(17.4, 5.6, 3, TINT) + path("M14.8 4.4c1.6 1 3.6 1 5.2 0", FINE),
  "sport-wheelchair-basketball": wheelchair() + basket(17.4, 5.8, 3.4),
  "sport-wheelchair-tennis": wheelchair() + racket({ cx: 17.6, cy: 5.2, rx: 2.4, ry: 3, deg: 40, handle: 2.6, strings: false, throat: 0.8 }),
  // ---------------------------------------------------------------- baskets and goals
  "sport-basketball-3x3": rect(4.6, 2.6, 14.8, 9, 1) + rect(9.4, 6, 5.2, 3.6, 0.4, FINE) + ellipse(12, 12.4, 3.8, 1.1) + path("M8.2 12.4l1.4 6.4h4.8l1.4-6.4", TINT) + path("M9.6 18.8l4.6-5.2M14.4 18.8 9.8 13.6", FINE),
  "sport-netball": path("M10 21.6V5.6M7 21.6h6") + ellipse(14.6, 5.6, 4, 1.1) + path("M10.8 5.6l1.2 5h5.2l1.2-5", TINT) + path("M12 10.6l4.6-4.4M17.2 10.6l-4.4-4.2", FINE),
  "sport-korfball": path("M8.6 21.6V2.6M5.6 21.6h6") + rect(9.8, 3.2, 8.6, 6.4, 1.2, TINT) + path("M12.6 3.2v6.4M15.6 3.2v6.4", FINE),
  "sport-beach-volleyball": volley(10, 12.4, 7.4) + beach(),
  "sport-sitting-volleyball": volley(12, 6.4, 4) + path("M2.6 13.4h18.8M3.4 13.4v8M20.6 13.4v8") + path("M3.4 15.6h17.2M3.4 17.6h17.2M7 13.4v4.2M10.6 13.4v4.2M14.2 13.4v4.2M17.8 13.4v4.2", FINE),
  "sport-beach-handball": handballBall(10, 12.4, 7.2) + beach(),
  "sport-tchoukball": rect(5, 3, 14, 12, 2) + path("M5 7h14M5 11h14M9.6 3v12M14.4 3v12", FINE) + path("M7.4 15 5.6 21.4M16.6 15l1.8 6.4") + circle(3.6, 18.4, 1.9, TINT),
  "sport-dodgeball": circle(9, 13.4, 6.4, TINT) + path("M5 9c2.6 1.4 5.4 1.4 8 0", FINE) + circle(18.4, 6, 2.6) + path("M14.4 2.6l-2 1.2M15 5.6h-2.4", FINE),
  "sport-kabaddi": rect(2.6, 4, 18.8, 16, 1) + path("M12 4v16", ' stroke-width="2.2"') + path("M6.4 4v16M17.6 4v16", FINE) + ellipse(15, 12, 1.6, 2.4, TINT) + circle(15, 15.6, 1.1, SOLID),
  "sport-kho-kho": path("M3.4 5.6v12.8M20.6 5.6v12.8") + path("M3.4 12h17.2", FINE) + [6.6, 9.8, 13, 16.2].map((x) => rect(x - 0.8, 11.2, 1.6, 1.6, 0.4, SOLID)).join("") + path("M2 21.4h20", FINE),
  "sport-sepak-takraw": circle(12, 9.6, 6.8, TINT) + path("M6.4 6c3.4 2.4 7.6 2.4 11.2 0M6.4 13.2c3.4-2.4 7.6-2.4 11.2 0M8.6 3.6c2 3.6 2 8.4 0 12M15.4 3.6c-2 3.6-2 8.4 0 12", FINE) + path("M2.4 19.4h19.2", "") + path("M2.4 21.4h19.2", FINE),
  "sport-ultimate": ellipse(12, 12.4, 9.4, 3.6, TINT) + ellipse(12, 11.8, 5.6, 1.8, FINE) + path("M2.4 6.6h3.4M3.4 9h2", FINE),
  "sport-disc-golf": path("M12 21.6V5.2M7.6 21.6h8.8") + ellipse(12, 4.4, 5, 1.2) + path("M8 5.2l2.6 7.4M16 5.2l-2.6 7.4M12 5.6v7", FINE) + path("M6.6 12.6h10.8L16 17H8Z", TINT),
  "sport-lacrosse": path("M3.6 21 14.6 7.6") + path("M14.6 7.6C13 4.4 14.6 2 17.4 2.6c2.8.6 4.2 3.2 2.6 6-1.4 1.6-3.6 1-5.4-1Z", TINT) + path("M15.4 4.2l3.8 3.4M17.4 3l1 4.6", FINE),
  "sport-field-lacrosse-ball": "",
  "sport-polo": path("M4.6 2.8 15.4 17.6") + path("M12.4 19.6l7.4-3.6", ' stroke-width="2.6"') + circle(19.6, 21, 1.3, SOLID) + path("M2.6 21.6h12", FINE),
  "sport-hurling": path("M15 2.4 11.6 13.4c-.6 2-.2 4 1 5.4 1.6 2 4.4 2 5.2-.2.6-1.6-.6-3.2-2-3.8l-2.6-1.2", TINT) + circle(6.4, 18, 2.4) + path("M4.6 16.6c1.2.8 2.4.8 3.6 0", FINE),
  // ---------------------------------------------------------------- bat and ball
  "sport-baseball": path("M4.4 21 16.4 6.6c1.2-1.4 3.2-2 4.2-1s.4 3-1 4.2L5.4 21.8Z", TINT) + circle(17.4, 17.6, 2.8) + path("M15.6 15.6c1 .8 1.2 2.6.4 3.8M19.2 15.6c-1 .8-1.2 2.6-.4 3.8", FINE),
  "sport-softball": path("M6.4 21.2C3.6 18.2 3 13.6 4.6 9.8l1.8-4.2c.6-1.4 2.6-1.2 2.6.4v3.2l1-5.4c.3-1.6 2.6-1.6 2.7 0l.3 5 1-4.4c.4-1.6 2.6-1.3 2.6.3l-.2 5.4 2-3.2c.8-1.2 2.6-.6 2.3.9l-1.6 7.8c-1 3.4-4 6-7.6 6Z", TINT) + circle(12.6, 15, 3.4) + path("M10.6 12.6c1 1.4 1 3.4 0 4.8M14.6 12.6c-1 1.4-1 3.4 0 4.8", FINE),
  "sport-cricket": path("M7.6 6.6v14.8M12 6.6v14.8M16.4 6.6v14.8") + path("M7.6 5.2h4.2M12.2 5.2h4.2", ' stroke-width="2"') + circle(20, 17.4, 1.9, SOLID) + path("M2.6 21.6h16.4", FINE),
  // ---------------------------------------------------------------- rackets
  "sport-pickleball": racket({ cx: 13.4, cy: 9, rx: 4.6, ry: 5.4, deg: 40, handle: 5, strings: false, tint: true, throat: 1.8 }) + circle(5.4, 18.6, 2.8) + path("M4.4 17.8h.01M6.4 17.8h.01M5.4 19.8h.01", ' stroke-width="1.5"'),
  "sport-beach-tennis": racket({ cx: 11.6, cy: 9.2, rx: 4.6, ry: 5.2, deg: 40, handle: 4.4, strings: false, holes: true, tint: true, throat: 2 }) + sand(21.6) + circle(19.6, 4.4, 2, TINT),
  "sport-platform-tennis": racket({ cx: 10.6, cy: 10, rx: 4.6, ry: 5.4, deg: 40, handle: 4.6, strings: false, holes: true, tint: true, throat: 2 }) + path("M16 2.4 21.6 8M16 8l5.6-5.6M16 13.6 21.6 8M16 8l5.6 5.6M16 19.2l5.6-5.6M16 13.6l5.6 5.6", FINE),
  "sport-racquetball": racket({ cx: 12, cy: 8.8, rx: 4.6, ry: 5.6, deg: 32, handle: 4.4, throat: 1.2 }) + circle(18.8, 18.6, 2, SOLID) + path("M18.8 15.4c0-3.4-1-6-3-7.6", FINE + ' stroke-dasharray="1.2 1.6"'),
  "sport-racketlon": racket({ cx: 9.6, cy: 8.6, rx: 3.6, ry: 4.6, deg: -32, handle: 7, throat: 1 }) + racket({ cx: 14.4, cy: 8.6, rx: 3.6, ry: 4.6, deg: 32, handle: 7, throat: 1, strings: false, tint: true }),
  "sport-real-tennis": tf(path("M9.4 2.8c4.8-.6 8.6 2.2 9 6.4.2 3-1.6 5.2-4.4 5.6L7 16.2c-1.6-3.4-1.6-8.4 2.4-13.4Z", TINT + T(12, 9.6, 30)) + path("M9.6 4.4 14 13.6M13.4 3.8 16.4 12M7.6 8.6l9.6-1.6M7.6 12.4l9-1.6", FINE + T(12, 9.6, 30)) + path("M10.8 15.8 5.6 21.6") + circle(18.6, 18.8, 2.2, TINT), "translate(0 .7)"),
  "sport-squash-wall": "",
  // ---------------------------------------------------------------- precision
  "sport-archery": path("M8 2.6C14.6 7 14.6 17 8 21.4") + path("M8 2.6v18.8", FINE) + path("M2.6 12h18.4M18.4 9.6l2.8 2.4-2.8 2.4M2.6 12 1.6 10.2M2.6 12l-1 1.8M4.6 12l-1-1.8M4.6 12l-1 1.8"),
  "sport-shooting": circle(12, 12, 7.6) + circle(12, 12, 3.2, TINT) + path("M12 1.8v4.4M12 17.8v4.4M1.8 12h4.4M17.8 12h4.4"),
  "sport-darts": circle(9.6, 14.4, 7.4) + circle(9.6, 14.4, 3.8, TINT) + dot(9.6, 14.4, 0.9) + path("M9.6 14.4 20 4") + path("M18.4 3.2l1.4-1.4 .4 2 2 .4-1.4 1.4", TINT),
  "sport-boccia": path("M2.6 4.6 15 15.8M5 3 17.4 14.2M4.6 7.6v13.8M15.6 15.4v6") + circle(19.6, 19.4, 2.2, TINT) + dot(21.6, 14.6, 0.9),
  "sport-bocce": path("M2 18.6V21.4h20v-2.8", FINE) + circle(7.4, 14.4, 4.2, TINT) + circle(16, 15.6, 3.2) + dot(20.6, 17.4, 0.9),
  "sport-petanque": circle(8, 13.6, 5) + path("M3.4 11.8c3 1.2 6.2 1.2 9.2 0M3.2 14.6c3.2 1.2 6.4 1.2 9.6 0", FINE) + circle(17, 15.6, 3.6, TINT) + path("M13.6 14.6c2.2.8 4.6.8 6.8 0", FINE) + dot(19.8, 8.6, 1.2) + path("M2 21.4h20", FINE),
  "sport-bowling": path("M16 2.6c1.4 0 2 1.2 2 2.4 0 1.4-.8 2.2-.8 3.4 0 1.4 2 3.4 2 6.8 0 3.2-1.4 5.6-3.2 6.4-1.8-.8-3.2-3.2-3.2-6.4 0-3.4 2-5.4 2-6.8 0-1.2-.8-2-.8-3.4 0-1.2.6-2.4 2-2.4Z") + path("M14.6 8.6h2.8", FINE) + circle(7.4, 16.4, 5, TINT) + path("M6 14.4h.01M8.4 14h.01M7.4 16.2h.01", ' stroke-width="1.6"'),
  "sport-billiards-pool": circle(9, 14.6, 6.4, TINT) + circle(10, 13.4, 2.2) + path("M14.6 9.6 21.6 2.6", ' stroke-width="2"'),
  "sport-snooker": path("M12 3.4 21 19.6H3Z") + [[12, 8.6], [10.2, 11.8], [13.8, 11.8], [8.4, 15.6], [12, 15.6], [15.6, 15.6]].map(([x, y]) => circle(x, y, 1.5, TINT)).join(""),
  "sport-croquet": path("M14 21.4V12a3 3 0 0 1 6 0v9.4") + circle(8.4, 19.2, 2.2, TINT) + path("M3.2 3 9.8 14.4") + path("M1.8 5 6.4 2.4", ' stroke-width="2.8"') + path("M2 21.6h20", FINE),
  // ---------------------------------------------------------------- horses and the air
  "sport-equestrian": path("M8.4 21.4 9 14.4c-1.6-.8-3.6-.6-5-1.2-1-.4-1.2-1.8-.4-2.8l5.2-5.4.4-2.4 2.2 1.6c4.4 0 7.8 3.6 8.2 8.6l.6 8.6Z", TINT) + dot(9.8, 7.8, 0.9) + path("M11.4 4.2c3.2 1 5 4 5.4 8.2", FINE),
  "sport-dressage": path("M7.6 3.4h8.8v10H7.6Z", TINT) + path("M3.6 13.4h16.8M7.6 10.4h8.8") + path("M6 17.4c3.6 1.6 8.4 1.6 12 0", FINE) + path("M4 21.4h16", FINE),
  "sport-show-jumping": path("M4.4 21.6V6.6M19.6 21.6V6.6M2.4 21.6h4M17.6 21.6h4") + path("M4.4 9.4h15.2M4.4 13.4h15.2M4.4 17.4h15.2", ' stroke-width="2.2" stroke-dasharray="3 1.8" stroke-linecap="butt"'),
  "sport-eventing": rect(3, 13, 18, 5.4, 2.7, TINT) + path("M6.4 13v5.4M12 13v5.4M17.6 13v5.4", FINE) + path("M3.6 13V3.6M20.4 13V3.6") + path("M3.6 3.8l4 1.4-4 1.4M20.4 3.8l-4 1.4 4 1.4", TINT) + path("M2 21.4h20", FINE),
  "sport-horse-racing": path("M6.4 4C3.4 11 4.8 20 12 20s8.6-9 5.6-16") + path("M9.4 4.6c-2 6-1 12.4 2.6 12.4s4.6-6.4 2.6-12.4", FINE) + path("M5.8 10.4h.01M6.8 15.4h.01M18.2 10.4h.01M17.2 15.4h.01", ' stroke-width="1.6"') + path("M1.8 7h2M1.6 10.6h1.8", FINE),
  "sport-skydiving": path("M3 10C3 4.6 7 2.6 12 2.6S21 4.6 21 10c-1.6-1-3-1-4.4 0-1.6-1-3-1-4.6 0-1.6-1-3-1-4.6 0-1.4-1-2.8-1-4.4 0Z", TINT) + path("M3 10l9 7.4M7.4 10l4.6 7.4M16.6 10 12 17.4M21 10l-9 7.4", FINE) + circle(12, 19.4, 2.15, SOLID),
  "sport-paragliding": path("M2.4 8.4C4.8 3.4 19.2 3.4 21.6 8.4 19.2 7.2 4.8 7.2 2.4 8.4Z", TINT) + path("M2.8 8.4 11 17.2M8 7.4l3.4 9.8M16 7.4l-3.4 9.8M21.2 8.4 13 17.2", FINE) + rect(10, 16.8, 4, 3.4, 1.4) + circle(12, 21.2, 1.2, SOLID),
};
delete PLAY["sport-field-lacrosse-ball"];
delete PLAY["sport-squash-wall"];
