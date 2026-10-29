// Renders the Android launcher, adaptive, monochrome, splash and notification images from the TITAN mark
// (image/titan-mark.svg on the website: two cyan chevrons, the second at 50 % opacity, on #05070a).
// Run: node scripts/render-brand.mjs — the PNG files are committed, so the build never depends on this script.
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";

const CYAN = "#3dd9e8";
const BG = "#05070a";
const out = new URL("../assets/brand/", import.meta.url);
mkdirSync(out, { recursive: true });

// The mark in its own 32-unit space: the chevron path "m9 15.5 7-7 7 7" and the same one 8 units lower.
function chevrons({ color = CYAN, second = 0.5, scale = 1, cx = 50, cy = 50 }) {
  // Glyph bounding box in 32-space: x 9..23, y 8.5..23.5 → centre (16, 16).
  const k = 3.125 * scale;
  const tx = cx - 16 * k;
  const ty = cy - 16 * k;
  const path = (dy, opacity) =>
    `<path d="m9 ${15.5 + dy} 7-7 7 7" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(${tx} ${ty}) scale(${k})"/>`;
  return path(0, 1) + path(8, second);
}
function svg(body, { bg = null, radius = 0 } = {}) {
  const rect = bg ? `<rect width="100" height="100" rx="${radius}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${rect}${body}</svg>`;
}
function png(name, source, size) {
  const data = new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(name, out), data);
  console.log(name, size, data.length);
}

// Legacy/full icon: square background, the launcher applies its own mask.
png("icon.png", svg(chevrons({ scale: 1 }), { bg: BG }), 1024);
// Adaptive foreground: the glyph must stay inside the 66/108 safe circle → about 52 % of the canvas.
png("adaptive-foreground.png", svg(chevrons({ scale: 0.82 })), 1024);
// Android 13 themed icon: one colour, the system tints it.
png("adaptive-monochrome.png", svg(chevrons({ color: "#ffffff", second: 0.55, scale: 0.82 })), 1024);
// Splash: the mark alone, the background colour comes from the splash configuration.
png("splash-mark.png", svg(chevrons({ scale: 1.1 })), 1024);
// Status bar notification icon: white silhouette only.
png("notification.png", svg(chevrons({ color: "#ffffff", second: 0.6, scale: 1.25 })), 96);
// In-app brand mark (rounded square, like the website favicon).
png("mark.png", svg(chevrons({ scale: 1 }), { bg: BG, radius: 22 }), 256);
