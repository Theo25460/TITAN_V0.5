// Renders a TITAN campaign video from a spec in videos.mjs: composer.html (TITAN tokens + real app clips) -> 1080x1920 H.264.
// Usage: node render-video.mjs <outDir> [videoId ...]
import { mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { VIDEOS } from "./videos.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = resolve(new URL(".", import.meta.url).pathname);
const [outDir, ...ids] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
for (const v of VIDEOS.filter((x) => !ids.length || ids.includes(x.id))) {
  const spec = structuredClone(v.spec);
  for (const s of spec.scenes) if (s.kind === "clip") s.frames = readdirSync(join(HERE, "clips", s.clip)).filter((f) => f.endsWith(".jpg")).length;
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto("file://" + join(HERE, "composer.html"));
  await page.evaluate((s) => window.load(s), spec);
  const total = await page.evaluate(() => window.TOTAL);
  const fdir = join(outDir, `_frames_${v.id}`); rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir);
  const N = Math.round(total * 30);
  for (let i = 0; i < N; i++) {
    await page.evaluate((t) => window.renderAt(t), i / 30);
    await page.screenshot({ path: join(fdir, `${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 94 });
  }
  if (v.thumbAt != null) { await page.evaluate((t) => window.renderAt(t), v.thumbAt); await page.screenshot({ path: join(outDir, `${v.id}-miniature.png`) }); }
  await page.close();
  const out = join(outDir, `${v.id}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "30", "-i", join(fdir, "%04d.jpg"), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-shortest", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", out]);
  rmSync(fdir, { recursive: true, force: true });
  console.log("ok", v.id, total.toFixed(1) + "s", out);
}
await browser.close();
