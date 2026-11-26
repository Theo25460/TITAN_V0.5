// Records each micro-animation of motion/lab.html at real speed (Chromium, 2x) and writes, per piece:
//  - <id>.webm (real-time capture, cropped to the piece) and <id>.gif (for quick viewing),
//  - <id>-strip.png: the piece at 0, 120, 240, 400, 700 and 1300 ms after the event (deterministic proof of the timeline),
//  - reduced.png: every piece triggered under prefers-reduced-motion (must show final states at once).
// node design/v2-visual/tools/record-motion.mjs <out_dir>
import { mkdirSync, existsSync, renameSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
const out = resolve(process.argv[2]); mkdirSync(out, { recursive: true });
const lab = "file://" + resolve(new URL("../motion/lab.html", import.meta.url).pathname);
const ids = ["m01", "m02", "m03", "m04", "m05", "m06", "m07", "m08"];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
// 1) strips (time-sampled screenshots)
{
  const page = await browser.newPage({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(lab); await page.evaluate(() => document.fonts.ready);
  for (const id of ids) {
    const el = page.locator("#" + id + " .stage");
    const shots = [];
    for (const t of [0, 120, 240, 400, 700, 1300]) {
      await page.evaluate(i => window.__play(i), id);
      if (t) await page.waitForTimeout(t);
      const p = join(out, `${id}-t${t}.png`); await el.screenshot({ path: p, animations: "allow" }); shots.push(p);
    }
    execFileSync("montage", [...shots, "-tile", "6x1", "-geometry", "+6+0", "-background", "#131920", join(out, `${id}-strip.png`)]);
    for (const p of shots) execFileSync("rm", [p]);
  }
  await page.close();
}
// 2) real-time video per piece
for (const id of ids) {
  const ctx = await browser.newContext({ viewport: { width: 1240, height: 1000 }, recordVideo: { dir: out, size: { width: 1240, height: 1000 } } });
  const page = await ctx.newPage(); await page.goto(lab); await page.evaluate(() => document.fonts.ready);
  const box = await page.locator("#" + id).boundingBox();
  await page.waitForTimeout(400);
  const t0 = Date.now();
  await page.locator(`#${id} .replay`).click();
  await page.waitForTimeout(1600);
  const video = page.video(); await ctx.close();
  const raw = await video.path();
  const crop = `crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)}`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-sseof", "-2.2", "-i", raw, "-vf", crop, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", join(out, `${id}.webm`)]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-sseof", "-2.2", "-i", raw, "-vf", `${crop},fps=20,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse`, join(out, `${id}.gif`)]);
  execFileSync("rm", [raw]);
}
// 3) reduced motion: final states at once
{
  const ctx = await browser.newContext({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage(); await page.goto(lab); await page.evaluate(() => document.fonts.ready);
  for (const id of ids) await page.evaluate(i => window.__play(i), id);
  await page.waitForTimeout(30);
  await page.screenshot({ path: join(out, "reduced-motion-30ms.png"), fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(readdirSync(out).join(" "));
