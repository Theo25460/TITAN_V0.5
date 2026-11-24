// Frame-exact capture of REAL TITAN native screens (React Native web preview bench, synthetic demo account "Camille").
// A virtual clock drives timers and requestAnimationFrame, so every animation is captured at 30 fps, 1080x1920.
// Usage: node capture-frames.mjs <previewExportDir> <outDir> [flowName ...]
import { createReadStream, existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [dist, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let f = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(dist, "index.html");
  res.setHeader("content-type", types[extname(f)] || "application/octet-stream");
  createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const FPS = 30, DT = 1000 / FPS;
// steps: ["hold", ms] advance virtual time while recording; ["scroll", px, ms] smooth scroll; ["click", text]
export const FLOWS = {
  "xp-record": { fromStart: true, hash: "SessionResult?eventId=record", steps: [["hold", 5000]] },
  "levelup": { fromStart: true, hash: "SessionResult?eventId=levelup", steps: [["hold", 5500]] },
  "balise": { hash: "World?id=aube", steps: [["hold", 600], ["scroll", 520, 900], ["hold", 500], ["click", "Allumer la balise 3"], ["hold", 3800]] },
  "qg": { hash: "QG", steps: [["hold", 900], ["scroll", 700, 1600], ["hold", 900]] },
  "progres": { hash: "Progress", steps: [["hold", 500], ["click", "Tendances"], ["hold", 900], ["scroll", 420, 1000], ["hold", 1200]] },
  "maitrise": { hash: "Progress", steps: [["hold", 300], ["click", "Maîtrise"], ["hold", 900], ["scroll", 500, 1200], ["hold", 1000]] },
  "aventure": { hash: "Adventure", steps: [["hold", 700], ["scroll", 900, 2200], ["hold", 900]] },
  "record": { hash: "Record", steps: [["hold", 1200], ["scroll", 400, 1000], ["hold", 800]] },
  "form-course": { hash: "SessionForm?sport=running", steps: [["hold", 1200], ["scroll", 500, 1200], ["hold", 800]] },
  "journal": { hash: "Journal", steps: [["hold", 700], ["scroll", 800, 2000], ["hold", 600]] },
  "carriere": { hash: "Career", steps: [["hold", 700], ["scroll", 700, 1800], ["hold", 600]] },
  "sports": { hash: "Sports", steps: [["hold", 700], ["scroll", 600, 1500], ["hold", 600]] },
  "communaute": { hash: "Community", steps: [["hold", 700], ["scroll", 600, 1500], ["hold", 600]] },
  "welcome": { hash: "Welcome", steps: [["hold", 2500]] },
  "plan": { hash: "Plan", steps: [["hold", 700], ["scroll", 450, 1200], ["hold", 900]] },
  "monde-forge": { hash: "World?id=forge", steps: [["hold", 700], ["scroll", 600, 1600], ["hold", 600]] },
  "monde-marees": { hash: "World?id=marees", steps: [["hold", 700], ["scroll", 700, 1800], ["hold", 600]] },
};
const browser = await chromium.launch();
for (const name of only.length ? only : Object.keys(FLOWS)) {
  const fl = FLOWS[name]; const dir = join(out, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  const page = await browser.newPage({ viewport: { width: 412, height: 732 }, deviceScaleFactor: 1080 / 412 });
  await page.clock.install({ time: new Date("2026-11-24T18:30:00+01:00") });
  await page.goto(`http://127.0.0.1:${port}/#${fl.hash}`);
  let n = 0;
  const shot = async () => { await page.screenshot({ path: join(dir, `f${String(n++).padStart(4, "0")}.png`) }); };
  // Wait for the bench in small virtual steps so that a cinematic starting on mount is not skipped.
  for (let i = 0; i < 400; i++) { if (await page.$("body[data-preview-ready]")) break; await page.clock.runFor(DT); if (fl.fromStart) await shot(); }
  for (const [k, a, b] of fl.steps) {
    if (k === "hold") for (let t = 0; t < a; t += DT) { await shot(); await page.clock.runFor(DT); }
    if (k === "scroll") {
      const frames = Math.round(b / DT); let done = 0;
      await page.mouse.move(206, 400);
      for (let i = 1; i <= frames; i++) {
        const e = 0.5 - Math.cos(Math.PI * i / frames) / 2, target = Math.round(a * e);
        await page.mouse.wheel(0, target - done); done = target;
        await page.clock.runFor(DT); await shot();
      }
    }
    if (k === "click") { await page.getByText(a, { exact: true }).first().click({ timeout: 5000 }).catch((e) => console.log(name, "click failed", a)); }
  }
  await page.close();
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "f%04d.png"), "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", join(out, `${name}.mp4`)]);
  console.log("ok", name, n, "frames");
}
await browser.close(); server.close();
