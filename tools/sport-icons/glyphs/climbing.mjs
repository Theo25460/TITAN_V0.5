// Rock, ice and mountain.
import { FINE, TINT, SOLID, path, circle, ellipse, rect, dot, athlete, joints, T, wave } from "../parts.mjs";

const carabiner = (x, y, h = 7, w = 4.6) => rect(x, y, w, h, w / 2) + path(`M${x + w - 1.1} ${y + h * 0.28}v${h * 0.42}`, FINE);

export const CLIMBING = {
  "sport-climbing": path("M4.4 21.6 7.6 2.4h12v19.2Z", TINT) + dot(10.4, 6.4, 1.3) + dot(15.4, 8.2, 1.3) + dot(11.6, 12.6, 1.3) + dot(16.4, 15.2, 1.3) + dot(9.6, 17.8, 1.3),
  "sport-climbing-route": (() => {
    const o = { hip: [11.4, 13.2], torso: 176, armA: [-158, -172], armB: [150, 176], legA: [-60, 4], legB: [44, 6] };
    return path("M20.4 2v19.6", FINE + ' stroke-dasharray="1.4 1.6"') + athlete(o) + dot(8.6, 4.2, 1.2) + dot(15.2, 4.6, 1.2);
  })(),
  "sport-sport-climbing": carabiner(8.4, 2.2, 7.4, 4.8) + rect(9.8, 8.8, 4.4, 6.6, 1.4, TINT) + carabiner(10.6, 14.6, 7.4, 4.8),
  "sport-ice-climbing": path("M2.6 11.6h12.6M3.8 11.6l1.2 4.4 1.2-4.4M8.6 11.6l1 6.4 1-6.4M12.6 11.6l.8 3.4.8-3.4", "") + path("M2.6 2.4h12.6v9.2H2.6Z", TINT + ' stroke="none"') + path("M19.6 21.6c-.6-5.4-.6-10.6.6-16") + path("M20.2 5.6l-4.2-2.2M20.2 5.6l1.8-1.4", ' stroke-width="2"'),
  "sport-alpinism": path("M2 21.4 9.6 7.6l3.4 5.4 2.6-3.4 6.4 11.8Z", TINT) + path("M9.6 7.6V2.4l4 1.4-4 1.4") + path("M7.6 11.4l2 1.2 1.6-1.6", FINE),
  "sport-via-ferrata": path("M2.6 21.6 21.4 4.4", FINE) + path("M4.6 16.4h4.6M4.6 16.4v-2M9.2 16.4v-2M9.6 11.2h4.6M9.6 11.2v-2M14.2 11.2v-2M14.6 6h4.6M14.6 6V4M19.2 6V4") + carabiner(9.6, 13.4, 5, 3.4),
  "sport-canyoning": path("M2 2.6h4.4L5 9.6l2.4 6-1.6 5.8H2Z", TINT) + path("M22 2.6h-4.4l1.6 6-2.2 6 1.6 6.2H22Z", TINT) + path("M11.6 2.6v9.4", FINE) + circle(11.6, 14, 2.15, SOLID) + wave(20.8, 6.4, 17.6, 1.2),
  "sport-snowshoeing": path("M12 2.4c4.4 0 5.8 4 5.6 8.6-.2 3.6-2.6 7.4-5.6 10.6-3-3.2-5.4-7-5.6-10.6C6.2 6.4 7.6 2.4 12 2.4Z", TINT) + path("M8.2 6.4l8 8M15.8 6.4l-8 8M7.4 12.6l5.8 5.8M16.6 12.6l-5.8 5.8", FINE) + rect(9.6, 7.6, 4.8, 3.6, 1.2),
  "sport-bjj": rect(2.4, 9.4, 19.2, 5.2, 1) + rect(14.4, 9.4, 5.8, 5.2, 0, TINT) + path("M16.4 9.4v5.2M18.2 9.4v5.2", FINE) + path("M5 14.6 3.6 19.4M8.4 14.6l1 4.8", ""),
  "sport-cross-country-skiing": (() => {
    const o = { hip: [10.6, 12.2], torso: 168, armA: [44, 92], armB: [-40, -20], legA: [34, -2], legB: [-30, -40] };
    const j = joints(o);
    return athlete(o) + path("M2.4 21.2h17.4c1.4 0 2.2-.8 2.2-1.8") + path(`M${j.handA[0]} ${j.handA[1]}L${j.handA[0] + 2.6} 20.8M${j.handB[0]} ${j.handB[1]}L${j.handB[0] - 2.6} 20.8`, FINE);
  })(),
};
