#!/usr/bin/env node
// "Rien ne déborde" : ouvre chaque écran du banc d'aperçu à plusieurs largeurs et signale tout débordement horizontal.
// Usage : node scripts/preview-overflow.mjs <exportDir> [largeur ...]   (export : TITAN_PREVIEW=1 npx expo export --platform web --output-dir <exportDir>)
// Chromium + données fictives : un indicateur de mise en page, pas une preuve Android.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

const [dist, ...widths] = process.argv.slice(2);
if (!dist) throw new Error("usage: preview-overflow.mjs <exportDir> [largeur ...]");
const WIDTHS = widths.length ? widths.map(Number) : [320, 360, 412, 600, 840];
// Playwright lives in the website's dev dependencies (repository root), or is installed globally.
let chromium;
try {
  ({ chromium } = createRequire(resolve(process.cwd(), "../package.json"))("playwright"));
} catch {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
}
const SCREENS = ["QG", "QG&state=steps", "QG&state=empty", "Progress", "Record", "SessionForm?sport=running", "SessionForm?sport=muscu_gym", "SessionResult?eventId=record", "Journal", "Records", "Goals", "Plan", "Adventure", "World?id=aube", "Profile", "Atelier", "Community", "Settings", "Account", "Sports", "Help", "Notifications", "Sources&state=steps", "Steps&state=steps", "WebHub", "Guide", "Welcome", "Login", "Signup", "Onboarding&state=new", "TitanPlus", "Privacy"];

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const problems = [];
for (const width of WIDTHS)
  for (const screen of SCREENS) {
    const page = await browser.newPage({ viewport: { width, height: width >= 600 ? 900 : 740 } });
    page.on("pageerror", (e) => problems.push(`${screen} @${width}: erreur ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/#${screen}`);
    await page.waitForSelector("body[data-preview-ready]", { timeout: 20000 }).catch(() => problems.push(`${screen} @${width}: pas prêt`));
    await page.waitForTimeout(500);
    const wide = await page.evaluate(() => {
      const cw = document.documentElement.clientWidth;
      const out = [];
      document.querySelectorAll("*").forEach((e) => {
        const b = e.getBoundingClientRect();
        // Scrollable rows (chips) are allowed to extend inside their own scroller; anything else past the window is a defect.
        let p = e.parentElement, inScroller = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { inScroller = true; break; } p = p.parentElement; }
        if (!inScroller && b.width > 0 && b.right > cw + 1) out.push(`${e.tagName}.${String(e.className).slice(0, 30)} → ${Math.round(b.right)}px`);
      });
      return { cw, sw: document.documentElement.scrollWidth, out: out.slice(0, 3) };
    });
    if (wide.sw > wide.cw + 1 || wide.out.length) problems.push(`${screen} @${width}: déborde (${wide.sw} > ${wide.cw}) ${wide.out.join("; ")}`);
    await page.close();
  }
console.log(problems.length ? problems.join("\n") : `Aucun débordement : ${SCREENS.length} écrans × ${WIDTHS.join("/")} dp`);
await browser.close();
server.close();
process.exitCode = problems.length ? 1 : 0;
