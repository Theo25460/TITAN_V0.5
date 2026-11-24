// Feature graphic 1024x500 for Google Play, from the same real captures as the phone visuals.
// Usage (from mobile/): node scripts/play-feature.mjs <shotsDir> <out.png>   (same shots as play-promo.mjs)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const [shots, out] = process.argv.slice(2);
if (!shots || !out) throw new Error("usage: play-feature.mjs <shotsDir> <out.png>");
const root = new URL("../..", import.meta.url).pathname;
const require = createRequire(resolve(root, "package.json"));
const { chromium } = require("playwright");
const data = (p, t) => `data:${t};base64,` + readFileSync(p).toString("base64");
const font = data(resolve(root, "css/fonts/archivo-latin-variable.woff2"), "font/woff2");
const valley = data(resolve(root, "mobile/assets/rpg/valley-small.webp"), "image/webp");
const qg = data(resolve(shots, "dimanche/QG.png"), "image/png");
const xp = data(resolve(shots, "dimanche/SessionResult_eventId_record.png"), "image/png");
const phone = (img, w, left, top, z) => {
  const k = w / 824, h = Math.round(1830 * k), b = Math.round(w * 0.035);
  return `<div class="phone" style="left:${left}px;top:${top}px;width:${w + 2 * b}px;height:${h + 2 * b}px;padding:${b}px;border-radius:${Math.round(w * 0.1)}px;z-index:${z}">
    <div class="screen" style="width:${w}px;height:${h}px;border-radius:${Math.round(w * 0.08)}px"><img src="${img}" style="width:${w}px"></div></div>`;
};
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;src:url(${font}) format("woff2");font-weight:100 900;font-stretch:62% 125%;}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1024px;height:500px;overflow:hidden;background:#05070A}
body{position:relative;font-family:Archivo,sans-serif;color:#F1F3EF}
.art{position:absolute;right:0;top:0;width:760px;height:500px;background:url(${valley}) 60% 40%/cover no-repeat;opacity:.42;filter:saturate(.7)}
.art::after{content:"";position:absolute;inset:0;background:
  linear-gradient(90deg,#05070A 0%,rgba(5,7,10,.85) 28%,rgba(5,7,10,.35) 70%,rgba(5,7,10,.55) 100%),
  linear-gradient(180deg,rgba(5,7,10,.2) 0%,rgba(5,7,10,0) 40%,#05070A 100%)}
.mark{position:absolute;left:60px;top:58px;display:flex;align-items:center;gap:12px}
.mark .tile{width:40px;height:40px;border-radius:10px;background:#0E141A;box-shadow:inset 0 0 0 1px #1B2530;display:grid;place-items:center}
.mark svg{width:26px;height:26px}
.mark b{font-weight:800;font-size:19px;letter-spacing:.22em}
h1{position:absolute;left:60px;top:146px;font-weight:800;font-stretch:75%;font-size:70px;line-height:.98;letter-spacing:-.01em}
h1 span{display:block}
h1 .acc{color:#3DD9E8}
p{position:absolute;left:60px;top:308px;width:500px;font-size:20px;line-height:1.4;color:#AEB7BD}
.phone{position:absolute;background:#121920;box-shadow:0 0 0 1.5px #1B2530, inset 0 0 0 1px rgba(226,234,236,.10), 0 30px 60px rgba(0,0,0,.7)}
.screen{overflow:hidden;position:relative;background:#090C10}
.screen img{position:absolute;left:0;top:0}
</style></head><body>
<div class="art"></div>
<div class="mark"><div class="tile"><svg viewBox="0 0 32 32"><path d="m9 15.5 7-7 7 7" fill="none" stroke="#3dd9e8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="m9 23.5 7-7 7 7" fill="none" stroke="#3dd9e8" stroke-opacity=".5" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><b>TITAN</b></div>
<h1><span>Ton sport.</span><span class="acc">Ton ascension.</span></h1>
<p>Séances, progrès et aventure dans une seule app.</p>
${phone(xp, 206, 790, 36, 1)}
${phone(qg, 230, 586, 70, 2)}
</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
