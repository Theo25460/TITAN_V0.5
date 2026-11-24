// Play Store promo visuals (1080x1920) composed from captures of the real native screens.
// Usage (from mobile/): node scripts/play-promo.mjs <shotsDir> <outDir>   — spec: docs/play-store/promo/spec.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const [shots, out] = process.argv.slice(2);
if (!shots || !out) throw new Error("usage: play-promo.mjs <shotsDir> <outDir>");
const specFile = new URL("../docs/play-store/promo/spec.json", import.meta.url).pathname;
const specs = JSON.parse(readFileSync(specFile, "utf8"));
const here = dirname(new URL(import.meta.url).pathname);
mkdirSync(out, { recursive: true });
const b64 = (p) => "data:image/png;base64," + readFileSync(resolve(shots, p)).toString("base64");
const font = "data:font/woff2;base64," + readFileSync(resolve(here, "../../css/fonts/archivo-latin-variable.woff2")).toString("base64");
const SCREEN_W = 744, SRC_W = 824, K = SCREEN_W / SRC_W;

function html(s) {
  const title = s.title.map((l) => `<span class="${l.accent ? "acc" : ""}">${l.text}</span>`).join("");
  const callouts = (s.callouts || []).map((c) => {
    // c.crop: [x, y, w, h] in source px; c.at: [left, top] on canvas; c.scale
    const [x, y, w, h] = c.crop, sc = c.scale || 1.3, pad = c.pad || 0;
    return `<div class="callout" style="left:${c.at[0]}px;top:${c.at[1]}px;width:${w * sc + 2 * pad}px;height:${h * sc + 2 * pad}px;padding:${pad}px;border-radius:${c.radius || 26}px;background:${c.bg || "#131920"}">
      <div style="width:${w}px;height:${h}px;transform:scale(${sc});transform-origin:0 0;background:url(${b64(c.src || s.shot)}) -${x}px -${y}px no-repeat;"></div></div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;src:url(${font}) format("woff2");font-weight:100 900;font-stretch:62% 125%;}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#05070A}
body{position:relative;font-family:Archivo,sans-serif;color:#F1F3EF;
  background:
    radial-gradient(900px 700px at 50% 92%, #0E141A 0%, rgba(14,20,26,0) 70%),
    linear-gradient(180deg,#05070A 0%,#070A0E 45%,#0B1015 100%);}
.mark{position:absolute;left:84px;top:92px;display:flex;align-items:center;gap:18px}
.mark svg{width:44px;height:44px}
.mark b{font-weight:800;font-stretch:100%;font-size:30px;letter-spacing:.22em;color:#F1F3EF}
.contour{position:absolute;left:0;right:0;bottom:0;height:1300px;opacity:.5}
h1{position:absolute;left:84px;right:84px;top:${s.titleTop || 196}px;font-weight:800;font-stretch:75%;font-size:${s.size || 118}px;line-height:.98;letter-spacing:-.01em}
h1 span{display:block}
h1 .acc{color:#3DD9E8}
p.sub{position:absolute;left:84px;right:120px;top:${(s.titleTop || 196) + (s.size || 118) * 0.98 * s.title.length + 34}px;font-size:36px;line-height:1.35;color:#AEB7BD;font-weight:400}
.phone{position:absolute;left:${(1080 - SCREEN_W - 28) / 2}px;top:${s.phoneTop || 640}px;width:${SCREEN_W + 28}px;height:${Math.round(1830 * K) + 28}px;
  border-radius:74px;background:#121920;padding:14px;
  box-shadow:0 0 0 2px #1B2530, inset 0 0 0 1px rgba(226,234,236,.10), 0 60px 120px rgba(0,0,0,.65), 0 20px 40px rgba(0,0,0,.5)}
.screen{width:${SCREEN_W}px;height:${Math.round(1830 * K)}px;border-radius:60px;overflow:hidden;position:relative;background:#090C10}
.screen img{position:absolute;left:0;top:${-Math.round((s.offset || 0) * K)}px;width:${SCREEN_W}px}
.screen .nav{position:absolute;left:0;bottom:0;width:${SCREEN_W}px}
.callout{position:absolute;border-radius:20px;overflow:hidden;background:#090C10;
  box-shadow:0 0 0 2px #1B2530, 0 40px 80px rgba(0,0,0,.6)}
.fade{position:absolute;left:0;right:0;bottom:0;height:${s.fade ?? 220}px;background:linear-gradient(180deg,rgba(11,16,21,0),rgba(11,16,21,.92) 85%,#0B1015)}
</style></head><body>
<svg class="contour" viewBox="0 0 1080 1300" preserveAspectRatio="none" fill="none" stroke="#3DD9E8" stroke-opacity=".07" stroke-width="2">
${Array.from({ length: 9 }, (_, i) => `<path d="M-40 ${1300 - i * 26} L${300 - i * 8} ${980 - i * 60} L${540} ${1120 - i * 64} L${820 + i * 6} ${760 - i * 66} L1120 ${1000 - i * 40}"/>`).join("")}
</svg>
${s.mark ? "" : ""}
<h1>${title}</h1>
${s.sub ? `<p class="sub">${s.sub}</p>` : ""}
<div class="phone"><div class="screen"><img src="${b64(s.shot)}">${s.nav ? `<img class="nav" style="top:auto;bottom:0" src="${b64(s.nav)}">` : ""}</div></div>
<div class="fade"></div>
${callouts}
</body></html>`;
}

const browser = await chromium.launch();
for (const s of specs) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent(html(s), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, s.file), omitBackground: false });
  await page.close();
}
await browser.close();
