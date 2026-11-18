// Gymnastics, dance, circus, mind and body, and the five family marks.
import { FINE, TINT, SOLID, path, circle, ellipse, rect, dot, athlete, joints, T, tf } from "../parts.mjs";

export const ART_MIND = {
  "sport-gymnastics": path("M7.4 2.4v9.4M16.6 2.4v9.4") + circle(7.4, 15, 3.2, TINT) + circle(16.6, 15, 3.2, TINT),
  "sport-artistic-gymnastics": path("M3 10.6h18c0 2.2-1.2 3.4-3.2 3.4H6.2c-2 0-3.2-1.2-3.2-3.4Z", TINT) + path("M8.4 10.6V8.2h2.6v2.4M13 10.6V8.2h2.6v2.4M7 14l-1.4 7.4M17 14l1.4 7.4M3.6 21.4h16.8"),
  "sport-rhythmic-gymnastics": path("M3.2 20.8 7.8 15.2") + path("M7.8 15.2c5.6-1.6-3-7.2 3.4-9.6 5.2-2 9.6 1.4 7 5.6-2.4 3.8-7.4 4.2-4.4 8.2 1.4 1.8 4.4 1.8 6.6.4", ""),
  "sport-acrobatic-gymnastics": athlete({ hip: [10, 15.4], torso: 180, scale: 0.8, armA: [-176, -180], armB: [176, 180], legA: [16, 2], legB: [-16, -2] }) + athlete({ hip: [7.6, 3.6], torso: 90, head: 90, scale: 0.72, armA: [0, 0], armB: [10, 10], legA: [-90, -90], legB: [-86, -86] }),
  "sport-aerobic-gymnastics": athlete({ hip: [12, 12.8], torso: 180, armA: [-140, -160], armB: [140, 160], legA: [76, 88], legB: [-76, -88] }),
  "sport-trampoline-gymnastics": ellipse(12, 17, 9, 2, TINT) + path("M4 17.8v3.6M20 17.8v3.6M9 18.8v2.6M15 18.8v2.6") + athlete({ hip: [12, 9.2], torso: 180, scale: 0.64, armA: [-150, -170], armB: [150, 170], legA: [8, 0], legB: [-8, 0] }),
  "sport-cheerleading": path("M12 9.2 12 2.4M12 9.2l4.8-4.8M12 9.2h6.8M12 9.2l4.8 4.8M12 9.2 7.2 4.4M12 9.2H5.2M12 9.2l-4.8 4.8M12 9.2l2.6-6.2M12 9.2 9.4 3M12 9.2l6.2 2.6M12 9.2l-6.2 2.6M12 9.2l6.2-2.6M12 9.2 5.8 6.6", FINE) + circle(12, 9.2, 3, TINT) + path("M12 12.2v9.4"),
  "sport-pole-dance": path("M8 1.8v20.4") + athlete({ hip: [12.6, 12.2], torso: 214, head: 222, armA: [-140, -176], armB: [-120, -90], legA: [-70, 10], legB: [30, 14] }),
  "sport-parkour": rect(9, 15.4, 12.6, 6.2, 0.6, TINT) + athlete({ hip: [10, 9.6], torso: 104, head: 100, armA: [38, 12], armB: [60, 30], legA: [-82, -60], legB: [-64, -110] }),
  "sport-ballet": athlete({ hip: [11.4, 13.2], torso: 168, armA: [-150, -130], armB: [150, 175], legA: [-4, 0], legB: [-96, -96] }) + path("M8.6 22h5.6", FINE),
  "sport-salsa": path("M4.6 5.6c1.6 0 3.2 1.6 4.4 4l2 4.4c1 1.6 3.2 2.2 5.8 2.2h2.4c1.2 0 2.2.8 2.2 2v.8h-9.8c-2.2 0-4-1.4-5.2-3.8L5.6 13", TINT) + path("M4.6 5.6 4.4 21.4M9.6 11.4l4-2.2"),
  "sport-hiphop": rect(2.6, 8.4, 18.8, 11.6, 2) + circle(7.4, 14.4, 2.8, TINT) + circle(16.6, 14.4, 2.8, TINT) + path("M6.6 8.4V5.4h10.8v3M10.6 11h2.8", ""),
  "sport-breakdance": athlete({ hip: [12, 11.4], torso: 0, head: 0, armA: [-40, -10], armB: [40, 10], legA: [-160, -150], legB: [160, 150] }) + path("M4 21.4h16", FINE) + path("M3.2 15.6c-1.6-4 .4-8.4 4.4-10M20.8 15.6c1.6-4-.4-8.4-4.4-10", FINE + ' stroke-dasharray="1.4 1.6"'),
  "sport-zumba": athlete({ hip: [9.4, 13.2], torso: 170, armA: [-150, -168], armB: [120, 150], legA: [18, 0], legB: [-34, -6], scale: 0.92 }) + path("M18.6 12.4V4.2l3 .9") + ellipse(17.4, 12.6, 1.6, 1.25, SOLID),
  "sport-circus": circle(5.6, 13.6, 2.2, SOLID) + circle(12, 4.8, 2.2, TINT) + circle(18.4, 13.6, 2.2) + path("M6.6 10.6C7.8 6.6 9.4 5.4 10.4 5.2M13.6 5.2c1 .2 2.6 1.4 3.8 5.4", FINE + ' stroke-dasharray="1.4 1.6"') + path("M3 19.6q2.6 2 5.2 0M15.8 19.6q2.6 2 5.2 0"),
  // ---------------------------------------------------------------- mind and body
  "sport-qigong": athlete({ hip: [12, 14.6], torso: 180, armA: [-58, 30], armB: [58, -30], legA: [14, 0], legB: [-14, 0] }) + circle(12, 12.6, 2.4, TINT),
  "sport-taichi": path("M12 19.6 3.6 9A10.8 10.8 0 0 1 20.4 9Z", TINT) + path("M12 19.6 6.6 6.8M12 19.6l-1.8-14M12 19.6l1.8-14M12 19.6l5.4-12.8", FINE) + path("M12 19.6v2"),
  // ---------------------------------------------------------------- the five family marks (filters, family tabs, programme legend)
  "family-endurance": path("M2 13h4.6l2.2-6.4 4 11.6 2.6-8 1.6 2.8H22"),
  "family-force": circle(12, 12, 8.6) + circle(12, 12, 2.4) + path("M12 12m-5.4 0a5.4 5.4 0 1 0 10.8 0a5.4 5.4 0 1 0-10.8 0", ' stroke-width="3.6" stroke-opacity=".22"'),
  "family-technique": path("M4 20.4V3.6l16.8 16.8Z", TINT) + path("M4 7.4h2M4 11.2h3M4 15h2M8.2 20.4v-2M12 20.4v-3M15.8 20.4v-2", FINE) + circle(8.6, 15.6, 1.8),
  "family-jeu": path("M3.4 5.4 9.4 12l-6 6.6M20.6 5.4 14.6 12l6 6.6") + circle(12, 12, 1.8, SOLID),
  "family-mobilite": path("M3.6 18.4a8.4 8.4 0 0 1 16.8 0") + path("M12 18.4 17.6 12.2", "") + circle(12, 18.4, 1.6, SOLID) + path("M3.6 18.4a8.4 8.4 0 0 1 2.4-5.9L12 18.4Z", TINT) + dot(3.6, 18.4, 1) + dot(20.4, 18.4, 1),
};
