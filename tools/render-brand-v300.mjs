// TITAN 300 — brand assets from the Ascension mark (two stacked chevrons, cyan on near-black).
// Renders with Playwright/Chromium (dev only): app icons (maskable-safe), favicon.ico, apple-touch icon,
// the SVG mark and the 1200×630 social image. Needs the preview server for fonts and art:
//   node tools/serve-public.mjs 4173 &  node tools/render-brand-v300.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
let chromium;
for (const id of ["playwright", "/opt/node-tools/node_modules/playwright"]) {
  try {
    ({ chromium } = require(id));
    break;
  } catch {}
}
if (!chromium) throw new Error("Playwright is required to render brand assets.");

const BASE = process.env.PREVIEW || "http://127.0.0.1:4173";
const BG = "#05070a";
const CY = "#3dd9e8";

// The mark on a 100-unit grid; `pad` keeps it inside the maskable safe zone (80 % circle).
const mark = (size, { pad = 0.2, radius = 0.22, bg = BG } = {}) => {
  const s = 100;
  const inner = s * (1 - pad * 2);
  const o = s * pad;
  const k = inner / 32; // titanMark() is drawn on a 32 grid
  const path = (d) => `<path d="${d}" fill="none" stroke="${CY}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(${o} ${o}) scale(${k})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${s * radius}" fill="${bg}"/>${path("m9 15.5 7-7 7 7")}<g opacity=".5">${path("m9 23.5 7-7 7 7")}</g></svg>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// App icons: full-bleed background (maskable); the chevrons fill half the canvas, inside the 80 % safe circle.
writeFileSync("image/logo-512.png", await png(mark(512, { pad: 0.04, radius: 0 }), 512));
writeFileSync("image/logo-192.png", await png(mark(192, { pad: 0.04, radius: 0 }), 192));
writeFileSync("image/apple-touch-icon.png", await png(mark(180, { pad: 0.04, radius: 0 }), 180));
writeFileSync("image/logo.png", await png(mark(512, { pad: 0, radius: 0.22 }), 512));
writeFileSync("image/titan-mark.svg", mark(512, { pad: 0, radius: 0.22 }).replace(/ width="512" height="512"/, ""));

// favicon.ico: one 48 px PNG inside an ICO container.
const fav = await png(mark(48, { pad: 0, radius: 0.24 }), 48);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(48, 6);
header.writeUInt8(48, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(fav.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync("favicon.ico", Buffer.concat([header, fav]));

// Social image 1200×630, using the real fonts and art served by the preview server.
await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(`${BASE}/404`, { waitUntil: "load" }).catch(() => {});
await page.setContent(
  `<!doctype html><html><head><base href="${BASE}/"><link rel="stylesheet" href="/css/ascension.css"></head>
  <body class="asc" style="margin:0;width:1200px;height:630px;position:relative;overflow:hidden;background:${BG}">
    <img src="/assets/renaissance/valley.webp" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.55) brightness(.42)">
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,7,10,.97) 0%,rgba(5,7,10,.75) 55%,rgba(5,7,10,.35) 100%)"></div>
    <div style="position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:16px;font-family:Archivo;font-weight:800;font-stretch:85%;font-size:40px;letter-spacing:.08em;color:#eef3f7">${mark(56, { pad: 0.14, radius: 0.24, bg: "#0b1117" })}TITAN</div>
    <div style="position:absolute;left:72px;top:208px;font-family:Archivo;font-weight:800;font-stretch:76%;font-size:92px;line-height:.95;color:#eef3f7">Ton sport réel.<br><span style="color:${CY}">Une progression<br>qui dure.</span></div>
    <div style="position:absolute;left:72px;bottom:56px;font-family:Manrope;font-weight:700;font-size:24px;color:#a8b6c3">Journal multisport · progression · aventure — gratuit, sans publicité</div>
  </body></html>`,
  { waitUntil: "load" },
);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
writeFileSync("image/og-titan.jpg", await page.screenshot({ type: "jpeg", quality: 86 }));
await browser.close();
console.log("Brand v300: logo-192/512, apple-touch-icon, logo.png, titan-mark.svg, favicon.ico, og-titan.jpg");
