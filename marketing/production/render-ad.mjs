// Renders a time-driven ad page (window.load / window.renderAt / window.TOTAL) to frames, stills or an MP4.
// Usage: node render-ad.mjs <page.html> <outDir> <name> [--variant play|web] [--stills 0.2,1.5,...] [--audio track.wav]
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = resolve(new URL(".", import.meta.url).pathname);
const [page_, outDir, name, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const variant = opt("variant", "play"), stills = opt("stills", ""), audio = opt("audio", "");
mkdirSync(outDir, { recursive: true });
const frames = Object.fromEntries(readdirSync(join(HERE, "clips")).map((c) => [c, readdirSync(join(HERE, "clips", c)).filter((f) => f.endsWith(".jpg")).length]));
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("file://" + resolve(page_));
const { total, cues } = await page.evaluate((o) => window.load(o), { variant, frames });
writeFileSync(join(outDir, `${name}.cues.json`), JSON.stringify(cues));
if (stills) {
  for (const t of stills.split(",").map(Number)) { await page.evaluate((x) => window.renderAt(x), t); await page.screenshot({ path: join(outDir, `${name}-t${t.toFixed(2)}.png`) }); }
  console.log("stills", stills, "total", total);
} else {
  const fdir = join(outDir, `_frames_${name}`); rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir);
  const N = Math.round(total * 30);
  for (let i = 0; i < N; i++) { await page.evaluate((x) => window.renderAt(x), i / 30); await page.screenshot({ path: join(fdir, `${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 96 }); }
  const out = join(outDir, `${name}.mp4`);
  const a = audio && existsSync(audio) ? ["-i", audio] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "30", "-i", join(fdir, "%04d.jpg"), ...a, "-shortest", "-c:v", "libx264", "-profile:v", "high",
    "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", out]);
  rmSync(fdir, { recursive: true, force: true });
  console.log("ok", out, total.toFixed(2) + "s", N, "frames");
}
await browser.close();
