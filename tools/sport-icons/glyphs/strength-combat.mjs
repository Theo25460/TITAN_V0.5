// Strength, bodyweight, combat.
import { FINE, TINT, SOLID, path, circle, ellipse, rect, dot, athlete, joints, T, tf } from "../parts.mjs";

/** The wrestling singlet: straps, a low neckline, short legs. */
const singlet = path("M8.2 3v3.8c0 1.8 1.6 2.8 3.8 2.8s3.8-1 3.8-2.8V3l1.4.8V17l-1.2 4.4h-3.4L12 17.4l-.6 4H8l-1.2-4.4V3.8Z", TINT) + path("M6.8 13.6h10.4", FINE);

export const STRENGTH_COMBAT = {
  "sport-muscu-home": path("M3 10.4 12 3.4l9 7") + rect(5, 12.4, 2.6, 7.2, 0.8, TINT) + rect(16.4, 12.4, 2.6, 7.2, 0.8, TINT) + path("M7.6 16h8.8M3 16h2M19 16h2"),
  "sport-para-powerlifting": rect(3.6, 14.6, 16.8, 2.6, 1.3, TINT) + path("M6.6 17.2v4.2M17.4 17.2v4.2M2 7.6h20M7 7.6v7M17 7.6v7") + rect(3, 4.4, 2, 6.4, 0.6, SOLID) + rect(19, 4.4, 2, 6.4, 0.6, SOLID),
  "sport-strongman": ellipse(12, 10, 9.4, 4.4, TINT) + ellipse(12, 10, 4.8, 1.8) + path("M2.6 10v4.2c0 2.4 4.2 4.4 9.4 4.4s9.4-2 9.4-4.4V10M5 15.6v-2.4M8.4 16.8v-2.4M12 17.2v-2.4M15.6 16.8v-2.4M19 15.6v-2.4", "") + path("M2 21.6h20", FINE),
  "sport-sandbag": rect(2.6, 9, 18.8, 10.4, 5.2, TINT) + path("M7.4 9V6.4a1.4 1.4 0 0 1 1.4-1.4h1.8a1.4 1.4 0 0 1 1.4 1.4V9M12 9V6.4a1.4 1.4 0 0 1 1.4-1.4h1.8a1.4 1.4 0 0 1 1.4 1.4V9") + path("M8 9v10.4M16 9v10.4", FINE),
  "sport-farmers-walk": path("M6.4 2.8v11.6M17.6 2.8v11.6M4.8 2.8h3.2M16 2.8h3.2") + rect(3.6, 14.4, 5.6, 6.8, 1.2, TINT) + rect(14.8, 14.4, 5.6, 6.8, 1.2, TINT),
  "sport-trx": circle(12, 2.8, 1.2) + path("M12 4v5.2M12 9.2 7 18M12 9.2l5 8.8") + rect(10.6, 9.2, 2.8, 3.2, 0.8, TINT) + path("M4.6 18.4h4.4M15 18.4h4.4", ' stroke-width="2.4"'),
  "sport-grip-sport": rect(4.6, 9.6, 3.6, 11.6, 1.8, TINT + T(6.4, 15.4, 10)) + rect(15.8, 9.6, 3.6, 11.6, 1.8, TINT + T(17.6, 15.4, -10)) + circle(12, 6.2, 2.8) + path("M9.6 7.6 7.4 9.8M14.4 7.6l2.2 2.2"),
  "sport-highland-games": rect(10, 1.8, 4.2, 15.8, 2.1, TINT + T(12, 10, 12)) + path("M10.6 6.4h3.4M10.6 11h3.4", FINE + T(12, 10, 12)) + athlete({ hip: [10.4, 17.4], torso: 176, scale: 0.62, armA: [150, 175], armB: [-170, 172], legA: [14, 0], legB: [-14, 0] }) + path("M3 21.6h18", FINE),
  "sport-tug-of-war": path("M2 11.4h20", ' stroke-width="2.2"') + path("M4 10l1.4 2.8M7.4 10l1.4 2.8M15.4 10l1.4 2.8M18.8 10l1.4 2.8", FINE) + path("M12 11.4v3l3.4 1.8-3.4 1.8", TINT) + path("M6.4 6.6v9.6M17.6 6.6v9.6", FINE),
  "sport-arm-wrestling": path("M2.6 19.8h18.8M6 19.8v1.6M18 19.8v1.6") + path("M5.4 18.6 10 9.8M18.6 18.6 14 9.8", ' stroke-width="2.6"') + circle(12, 8.4, 2.8, TINT) + rect(4, 17.4, 3.2, 1.6, 0.6, SOLID) + rect(16.8, 17.4, 3.2, 1.6, 0.6, SOLID),
  "sport-dips": path("M2.6 12.6h14.8M5 12.6v8.8M15 12.6v8.8M2.6 21.4h14.8") + athlete({ hip: [9.8, 11.8], torso: 172, scale: 0.8, armA: [6, 2], armB: [10, 4], legA: [10, -60], legB: [16, -50] }),
  "sport-tractions": path("M2.4 3.6h19.2") + athlete({ hip: [12, 15.2], torso: 180, armA: [-122, -162], armB: [122, 162], legA: [10, -60], legB: [-10, 60] }),
  "sport-squat": athlete({ hip: [8.6, 13.6], torso: 158, armA: [92, 92], armB: [88, 88], legA: [88, -6], legB: [84, -10] }) + path("M3 18.6h18", FINE),
  "sport-pompes": athlete({ hip: [10.4, 14.2], torso: 112, head: 106, armA: [0, 0], armB: [4, 0], legA: [-68, -68], legB: [-70, -70] }) + path("M1.8 18.8h20.4", FINE),
  "sport-plank": athlete({ hip: [10.4, 13.6], torso: 100, head: 96, armA: [0, 92], armB: [4, 92], legA: [-81, -81], legB: [-82, -82] }) + path("M1.8 16.6h20.4", FINE),
  "sport-abs-session": [3.6, 9.4, 15.2].map((y) => rect(7, y, 4.4, 4.6, 1.6, TINT) + rect(12.6, y, 4.4, 4.6, 1.6, TINT)).join("") + path("M12 2.4v19.6", FINE),
  "sport-street-workout": path("M3.4 21.4V5M16 21.4V5M3.4 5h12.6M16 11.4h5M21 11.4v10M2 21.4h20") + athlete({ hip: [9.7, 15.6], torso: 180, scale: 0.86, armA: [-140, -170], armB: [140, 170], legA: [8, -20], legB: [-8, 20] }),
  "sport-kickboxing": tf(path("M6.6 14.2C5.8 8.2 9.4 4 13.8 4c4.2 0 6.4 3 6.4 7 0 3.6-2 5.8-4.6 6.2v1.2H8.6v-2.2c-1.2-.6-1.9-1.4-2-2Z", TINT) + path("M6.6 12.2C5 10.6 3.4 12 4.4 13.8c.8 1.4 2.4 2.4 4.6 2.4M8.6 18.4h7v3.2h-7Z"), "translate(-1.4 3.4) scale(.76)") + path("M8.6 2.6C14.6 1.8 19.6 5 21 11.4", FINE + ' stroke-dasharray="1.6 1.6"') + path("M21 11.4l-2.6-.6M21 11.4l.8-2.6", FINE),
  "sport-thaiboxing": rect(4, 3.6, 16, 4.4, 1.2, TINT) + path("M4 8 3 19.6c0 .9.7 1.6 1.6 1.6h5.2l2.2-9.4 2.2 9.4h5.2c.9 0 1.6-.7 1.6-1.6L20 8") + path("M7.4 5.8h9.2", FINE) + path("M4.6 14.4l2.4.2M19.4 14.4l-2.4.2", FINE),
  "sport-savate": tf(path("M5 6h4.6l.6 5.6 5.8 1.8c2 .6 3.2 1.6 3.2 3v.8H5Z", TINT) + path("M4.6 17.2h15M7.4 8.6h2.8M7.6 11h2.8", ""), "rotate(-26 12 14)") + path("M19.4 4.2l2-1.4M20.4 7.4l2.2-.4M17.4 2.2l.8-.8", FINE),
  "sport-capoeira": path("M6.8 21.6C2.8 15 2.8 8.4 6.8 2.4") + path("M6.8 2.4v19.2", FINE) + circle(9, 16.4, 3.4, TINT) + path("M10.4 2.6 17.6 8.4", FINE) + ellipse(18.6, 9.2, 1.8, 2.6, SOLID + T(18.6, 9.2, -38)),
  "sport-kendo": rect(6, 2.8, 12, 12.4, 4.2) + path("M6 7.2h12M6 10.6h12M12 2.8v12.4", FINE) + path("M3.6 14.6 6 21.4h12l2.4-6.8", TINT),
  "sport-taekwondo": athlete({ hip: [10, 13], torso: 204, head: 196, armA: [-30, 160], armB: [10, 170], legA: [96, 94], legB: [-8, -2] }) + path("M2.6 21.6h10", FINE),
  "sport-wrestling": ellipse(12, 14.6, 9.6, 5.6) + ellipse(12, 14.6, 6.4, 3.6, TINT) + ellipse(12, 14.6, 1.6, 0.9, SOLID) + path("M12 4.8v3", FINE),
  "sport-wrestling-singlet": singlet,
  "sport-sumo": ellipse(12, 11, 9.4, 4.2, TINT) + path("M2.6 11v4.4c0 2.4 4.2 4.2 9.4 4.2s9.4-1.8 9.4-4.2V11") + ellipse(12, 11, 6, 2.4, ' stroke-dasharray="1.8 1.2"') + path("M10.2 10.2v1.6M13.8 10.2v1.6", ' stroke-width="2"'),
  "sport-sambo": path("M5.4 20.4c-1-3.6-1-7 0-10.4l1.4-4.6c.4-1.4 1.6-2.2 3-2.2h2.4v9.4l5.6 2.2c1.6.6 2.6 1.8 2.6 3.2v2.4Z", TINT) + path("M5 20.4h15.4M7.4 7.6h4.8M7 10.6h5.2M12.2 12.6l1.6 2.8", ""),
  "sport-grappling": path("M9 3.4 4.4 6 2.6 14l2.8.6 1.8-5V21h9.6V9.6l1.8 5 2.8-.6L19.6 6 15 3.4c-.6 1.4-1.6 2.2-3 2.2s-2.4-.8-3-2.2Z", TINT) + path("M4.2 11.2l2.8.6M19.8 11.2l-2.8.6", FINE),
  "sport-aikido": path("M7.4 3.6h9.2L20 21h-6.8L12 12.8 10.8 21H4Z", TINT) + path("M7.2 6.4h9.6M9.6 6.6 8 20.6M14.4 6.6l1.6 14", FINE),
  "sport-kung-fu": rect(9.4, 2.4, 5.2, 19.2, 2.6, TINT) + path("M9.4 6.6 4.2 5M14.6 6.6l5.2-1.6M14.6 11h5.2M14.6 15.4l3.4 2.6v3.4M6 21.6h12"),
  "sport-wushu": path("M4.6 19.4 18.6 5.4l2-.4-.4 2-14 14Z", TINT) + path("M3.2 16.4l4.4 4.4M5 18.8l-2.2 2.2") + path("M2.8 21.2c-.6 1-1 .6-.6-.4", FINE),
  "sport-krav-maga": path("M6.4 11.4c0-1.6 1.2-2.6 2.6-2.6h7c1.8 0 3.2 1.4 3.2 3.2v3.6c0 3.2-2.6 5.8-5.8 5.8h-1.2c-3.2 0-5.8-2.6-5.8-5.8Z", TINT) + path("M6.4 11.4V7.6a1.7 1.7 0 0 1 3.4 0v1.2M9.8 8.8V6.6a1.7 1.7 0 0 1 3.4 0v2.2M13.2 8.8V7a1.7 1.7 0 0 1 3.4 0v1.8M16.6 9.4v-.8a1.6 1.6 0 0 1 3.2 0v3.2M6.4 13.6c2 .6 4 .4 5.6-.6"),
  "sport-hapkido": path("M15.4 21.6V7.4c0-3.4-2-5-4.6-5S6.4 4 6.4 6.6") + path("M15.4 18.6v3", ' stroke-width="2.6"') + path("M15.4 10.4h.01M15.4 14h.01", ' stroke-width="1.6"'),
  "sport-arnis-eskrima": path("M3.6 20.4 20.4 3.6M3.6 3.6l16.8 16.8") + path("M6.4 15.6l2 2M15.6 6.4l2 2M6.4 8.4l2-2M15.6 17.6l2-2", FINE),
  "sport-goalball": circle(9.4, 12, 7.4, TINT) + path("M6.8 9h.01M11.8 8.4h.01M9.4 12h.01M6.4 14.6h.01M12.2 15h.01", ' stroke-width="1.8"') + path("M18.2 8.4a5 5 0 0 1 0 7.2M20.4 6.6a8.2 8.2 0 0 1 0 10.8", FINE),
};
