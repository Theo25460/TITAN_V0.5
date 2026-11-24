// Records real TITAN native screens (React Native web preview, synthetic demo account "Camille") as video clips.
// Usage: node record-flows.mjs <previewExportDir> <outDir>
import { createReadStream, existsSync, mkdirSync, statSync, renameSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [dist, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let f = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(dist, "index.html");
  res.setHeader("content-type", types[extname(f)] || "application/octet-stream");
  createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const VIEW = { width: 412, height: 732 }; // 9:16
const FLOWS = [
  { name: "xp-record", hash: "SessionResult?eventId=record", steps: [["wait", 6000]] },
  { name: "levelup", hash: "SessionResult?eventId=levelup", steps: [["wait", 6500]] },
  { name: "balise", hash: "World?id=aube", steps: [["wait", 1500], ["scroll", 500], ["wait", 800], ["click", "Allumer la balise 3"], ["wait", 4500]] },
  { name: "qg-scroll", hash: "QG", steps: [["wait", 1500], ["scroll", 420], ["wait", 1200], ["scroll", 420], ["wait", 1500]] },
  { name: "progres", hash: "Progress", steps: [["wait", 1200], ["click", "Tendances"], ["wait", 1500], ["scroll", 350], ["wait", 1500], ["click", "Maîtrise"], ["wait", 2000]] },
  { name: "aventure", hash: "Adventure", steps: [["wait", 1500], ["scroll", 600], ["wait", 1500], ["scroll", 500], ["wait", 1500]] },
  { name: "record-sport", hash: "Record", steps: [["wait", 1500], ["wait", 2500]] },
];
const browser = await chromium.launch();
for (const fl of FLOWS) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1080 / 412, recordVideo: { dir: out, size: { width: 1080, height: 1920 } } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/#${fl.hash}`);
  await page.waitForSelector("body[data-preview-ready]", { timeout: 20000 }).catch(() => console.log(fl.name, "not ready"));
  for (const [k, v] of fl.steps) {
    if (k === "wait") await page.waitForTimeout(v);
    if (k === "scroll") { await page.mouse.move(206, 400); for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, v / 10); await page.waitForTimeout(40); } }
    if (k === "click") await page.getByText(v, { exact: true }).first().click().catch((e) => console.log(fl.name, e.message.split("\n")[0]));
  }
  const v = page.video(); await ctx.close();
  renameSync(await v.path(), join(out, `${fl.name}.webm`));
  console.log("ok", fl.name);
}
await browser.close(); server.close();
