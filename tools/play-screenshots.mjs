// GP03: Google Play visuals generated from the REAL web app with synthetic local data (guest mode, nothing leaves the machine).
// Usage: node tools/play-screenshots.mjs   (builds nothing: run `node tools/build-public.mjs` first; this script does it when dist/ is missing)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { createServer } from "node:net";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = ROOT + "docs/play-store/";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ONLY = process.env.PLAY_ONLY ? process.env.PLAY_ONLY.split(",") : null;

// Synthetic weeks of training across three sports (running, strength, swimming). Dates are relative to "now" so the week always looks alive.
const PLAN = [
  [0, "running", "km", 8.4, 46, 8.4], [1, "muscu_gym", "kg", 5200, 62, null], [3, "swimming", "m", 1500, 38, null], [4, "running", "km", 5.2, 29, 5.2],
  [6, "running", "km", 12.1, 68, 12.1], [8, "muscu_gym", "kg", 4800, 58, null], [9, "swimming", "m", 1200, 33, null], [11, "running", "km", 7.5, 42, 7.5],
  [13, "muscu_gym", "kg", 5400, 64, null], [15, "running", "km", 10.3, 57, 10.3], [17, "swimming", "m", 1800, 44, null], [19, "running", "km", 6.0, 34, 6.0],
  [21, "muscu_gym", "kg", 4600, 55, null], [23, "running", "km", 9.0, 51, 9.0], [25, "swimming", "m", 1000, 28, null], [27, "running", "km", 5.0, 30, 5.0],
  [29, "muscu_gym", "kg", 4500, 56, null], [32, "running", "km", 8.0, 46, 8.0], [35, "swimming", "m", 1100, 30, null], [38, "running", "km", 6.5, 38, 6.5],
  [41, "muscu_gym", "kg", 4300, 54, null], [44, "running", "km", 7.0, 41, 7.0], [48, "swimming", "m", 900, 26, null], [52, "running", "km", 5.0, 31, 5.0],
];

const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });

// `local` pages run as a signed-in-looking local profile (no network: Supabase is never reached); `guest` pages need the guest adventure engine.
const LOCAL_USER = { id: "00000000-0000-4000-8000-000000000042", name: "Athlète", level: 7, xp: 4200 };
const SHOTS = [
  { file: "phone-01-qg.png", path: "/aujourdhui", mode: "local", scroll: 0 },
  { file: "phone-02-seance.png", path: "/training", mode: "local", scroll: 250 },
  { file: "phone-03-stats.png", path: "/stats", mode: "local", scroll: 800 },
  { file: "phone-04-aventure.png", path: "/adventure", mode: "guest", scroll: 0 },
  { file: "phone-05-journal.png", path: "/journal", mode: "local", scroll: 560 },
  { file: "phone-06-records.png", path: "/records", mode: "local", scroll: 820 },
];

async function seed(page) {
  await page.waitForFunction(() => window.state?.user && window.TitanProgress && window.TitanSports);
  await page.evaluate((plan) => {
    const day = 86400000, now = Date.now();
    window.state.user.favoriteSports = ["running", "muscu_gym", "swimming"];
    window.state.history = plan.map(([ago, sport, unit, val, minutes, km], i) => ({
      id: `play-${i}`, client_event_id: `play-${i}`, sport, unit, val, xp: 0, syncStatus: "local",
      date: new Date(now - ago * day - 3600000 * (2 + (i % 5))).toISOString(),
      details: { duration: minutes, ...(km ? { distance: km } : {}) },
    }));
    window.dispatchEvent(new CustomEvent("titan:history-updated"));
  }, PLAN);
  await page.waitForTimeout(500);
}

// Chromium writes RGBA PNGs; Play wants a 24-bit image without alpha. Re-encode as 8-bit RGB (colour type 2), compositing on the opaque page colour.
function crc32(buf) {
  let c, crc = ~0;
  for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function pngToRgb(png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), depth = png[24], type = png[25];
  if (depth !== 8 || (type !== 6 && type !== 2)) throw new Error("unexpected PNG format " + depth + "/" + type);
  const bpp = type === 6 ? 4 : 3, idat = [];
  for (let o = 8; o < png.length;) { const len = png.readUInt32BE(o); if (png.toString("ascii", o + 4, o + 8) === "IDAT") idat.push(png.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, rows = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[y * stride + x - bpp] : 0, b = y ? rows[(y - 1) * stride + x] : 0, c = x >= bpp && y ? rows[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      rows[y * stride + x] = v & 255;
    }
  }
  const out = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * stride + x * bpp, o = y * (w * 3 + 1) + 1 + x * 3, al = bpp === 4 ? rows[i + 3] / 255 : 1;
    for (let k = 0; k < 3; k++) out[o + k] = Math.round(rows[i + k] * al + 11 * (1 - al));
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([png.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Feature graphic: existing brand assets only (og-titan.jpg scenery, logo-512.png, Archivo) and the site tagline, no extra claim.
const GRAPHIC_HTML = `<!doctype html><html lang="fr"><meta charset="utf-8"><style>
@font-face{font-family:Archivo;src:url(/css/fonts/archivo-latin-variable.woff2) format("woff2-variations");font-weight:100 900;font-stretch:62% 125%}
*{box-sizing:border-box;margin:0}
body{width:1024px;height:500px;overflow:hidden;background:#0b1117;font-family:Archivo,system-ui,sans-serif;position:relative}
.bg{position:absolute;inset:0;background:url(/image/og-titan.jpg) -470px -80px/1500px auto no-repeat;filter:brightness(1.35)}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,#0b1117 0%,#0b1117 40%,rgba(11,17,23,.8) 58%,rgba(11,17,23,.2) 100%)}
.brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:16px;color:#f4f7fa;font-weight:800;font-size:30px;letter-spacing:.14em}
.brand img{width:56px;height:56px;border-radius:14px}
h1{position:absolute;left:64px;top:158px;font-size:68px;line-height:1.02;font-weight:800;font-stretch:78%;color:#f4f7fa;letter-spacing:-.01em}
h1 em{font-style:normal;color:#3ddcea;display:block}
</style><div class="bg"></div><div class="shade"></div>
<div class="brand"><img src="/image/logo-512.png" alt="">TITAN</div>
<h1>Ton sport réel.<em>Une progression<br>qui dure.</em></h1></html>`;

async function featureGraphic(browser, BASE) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1, locale: "fr-FR", serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
  const page = await context.newPage();
  await page.goto(BASE + "/404.html", { waitUntil: "load" });
  await page.setContent(GRAPHIC_HTML, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.waitForTimeout(300);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1024, height: 500 } });
  writeFileSync(process.env.PLAY_FULL ? process.env.PLAY_FULL + "feature-graphic-1024x500.png" : OUT + "feature-graphic-1024x500.png", pngToRgb(png));
  await context.close();
  console.log("ok feature-graphic-1024x500.png");
}

async function main() {
  if (!existsSync(ROOT + "dist/index.html")) execFileSync(process.execPath, ["tools/build-public.mjs"], { cwd: ROOT, stdio: "inherit" });
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const BASE = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      if (ONLY && !ONLY.includes(shot.file)) continue;
      const context = await browser.newContext({
        viewport: { width: 360, height: 640 }, deviceScaleFactor: process.env.PLAY_FULL ? 1 : 3, isMobile: true, hasTouch: true,
        userAgent: ANDROID_UA, locale: "fr-FR", timezoneId: "Europe/Paris", serviceWorkers: "block", colorScheme: "dark",
      });
      await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort("internetdisconnected"));
      if (shot.mode === "local") await context.addInitScript((u) => localStorage.setItem("titan_os_v12_save", JSON.stringify({ user: u, history: [] })), LOCAL_USER);
      const page = await context.newPage();
      await page.goto(BASE + shot.path, { waitUntil: "load" });
      await seed(page);
      await page.waitForTimeout(800);
      await page.evaluate((y) => window.scrollTo(0, y), shot.scroll || 0);
      await page.waitForTimeout(500);
      if (process.env.PLAY_FULL) await page.screenshot({ path: process.env.PLAY_FULL + shot.file, fullPage: true });
      else await page.screenshot({ path: OUT + shot.file });
      await context.close();
      console.log("ok", shot.file);
    }
    if (!ONLY || ONLY.includes('feature-graphic-1024x500.png')) await featureGraphic(browser, BASE);
  } finally {
    await browser.close();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
