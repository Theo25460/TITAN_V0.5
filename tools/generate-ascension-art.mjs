// Generates the Ascension graphic language: topographic contour lines (deterministic).
// Usage: node tools/generate-ascension-art.mjs
import { mkdirSync, writeFileSync } from "node:fs";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth closed curve through points (Catmull-Rom converted to cubic Bézier).
function closedPath(points) {
  const n = points.length;
  const f = (v) => v.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

function contours({ seed, cx, cy, rings, step, base, wobble, lobes }) {
  const r = rng(seed);
  const phases = Array.from({ length: lobes }, () => r() * Math.PI * 2);
  const amps = Array.from({ length: lobes }, (_, i) => (0.5 + r() * 0.5) / (i + 1));
  const paths = [];
  for (let k = 0; k < rings; k++) {
    const radius = base + k * step;
    const pts = [];
    const count = 36;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      let m = 0;
      for (let l = 0; l < lobes; l++) m += amps[l] * Math.sin((l + 2) * a + phases[l] + k * 0.18);
      const rr = radius * (1 + wobble * m);
      pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr]);
    }
    paths.push(closedPath(pts));
  }
  return paths;
}

const W = 800, H = 600;
const summit = contours({ seed: 300, cx: 560, cy: 210, rings: 14, step: 26, base: 18, wobble: 0.22, lobes: 4 });
const spur = contours({ seed: 77, cx: 170, cy: 480, rings: 7, step: 24, base: 14, wobble: 0.26, lobes: 3 });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linejoin="round">
<g stroke="#3dd9e8">${summit
  .map((d, i) => `<path d="${d}" stroke-opacity="${(0.34 - i * 0.02).toFixed(2)}" stroke-width="${i % 4 === 0 ? 1.4 : 0.9}"/>`)
  .join("")}</g>
<g stroke="#8ea2b3">${spur.map((d, i) => `<path d="${d}" stroke-opacity="${(0.16 - i * 0.015).toFixed(3)}" stroke-width="0.9"/>`).join("")}</g>
</svg>
`;
mkdirSync("assets/ascension", { recursive: true });
writeFileSync("assets/ascension/contours.svg", svg);
console.log(`assets/ascension/contours.svg (${svg.length} bytes)`);
