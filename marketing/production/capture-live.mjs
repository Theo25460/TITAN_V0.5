// Real-time capture of REAL TITAN native screens (RN web preview bench, synthetic demo account) through the Chrome
// DevTools screencast at full phone density (1080x1920), for animations that must run on the real clock.
// Usage: node capture-live.mjs <previewExportDir> <outDir> name=hash[|click=Text][|scroll=px] ...
import { createReadStream, existsSync, mkdirSync, statSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [dist, out, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let f = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(dist, "index.html");
  res.setHeader("content-type", types[extname(f)] || "application/octet-stream");
  createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
for (const spec of specs) {
  const [name, rest] = spec.split("=", 2).length === 2 ? [spec.slice(0, spec.indexOf("=")), spec.slice(spec.indexOf("=") + 1)] : [spec, spec];
  const [hash, ...acts] = rest.split("|");
  const dir = join(out, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  const page = await browser.newPage({ viewport: { width: 412, height: 732 }, deviceScaleFactor: 1080 / 412 });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => { frames.push({ t: f.metadata.timestamp, d: f.data }); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send("Page.startScreencast", { format: "png", maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await page.goto(`http://127.0.0.1:${port}/#${hash}`);
  await page.waitForSelector("body[data-preview-ready]", { timeout: 20000 }).catch(() => {});
  for (const a of acts) {
    const [k, v] = a.split("=");
    if (k === "wait") await page.waitForTimeout(+v);
    if (k === "click") await page.getByText(v, { exact: true }).first().click({ timeout: 5000 }).catch(() => console.log(name, "click failed", v));
    if (k === "scroll") { await page.mouse.move(206, 400); for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, +v / 20); await page.waitForTimeout(35); } }
  }
  await cdp.send("Page.stopScreencast"); await page.close();
  let list = "";
  frames.forEach((f, i) => { const p = join(dir, `f${String(i).padStart(4, "0")}.png`); writeFileSync(p, Buffer.from(f.d, "base64")); const dur = i + 1 < frames.length ? frames[i + 1].t - f.t : 0.5; list += `file '${p}'\nduration ${Math.max(dur, 0.001).toFixed(4)}\n`; });
  writeFileSync(join(dir, "list.txt"), list + `file '${join(dir, `f${String(frames.length - 1).padStart(4, "0")}.png`)}'\n`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "scale=1080:1920:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", join(out, `${name}.mp4`)]);
  console.log("ok", name, frames.length, "frames");
}
await browser.close(); server.close();
