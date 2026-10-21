#!/usr/bin/env node
// Visual review of the native screens: serves a TITAN_PREVIEW web export and captures each screen at
// Android phone size (412×915 dp, density 2). Usage: node scripts/preview-shots.mjs <exportDir> <outDir> [Screen ...]
// The export is built with: TITAN_PREVIEW=1 npx expo export --platform web --output-dir <exportDir>
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

const [dist, out, ...only] = process.argv.slice(2);
if (!dist || !out) throw new Error("usage: preview-shots.mjs <exportDir> <outDir> [Screen ...]");
// Playwright lives in the website's dev dependencies (repository root).
const require = createRequire(resolve(process.cwd(), "../package.json"));
const { chromium } = require("playwright");

export const SCREENS = [
  "Welcome", "Login", "Signup", "Onboarding",
  "QG", "QG&state=empty", "Progress", "Progress&state=empty", "Record", "SessionForm?sport=running", "SessionForm?sport=muscu_gym",
  "SessionResult?eventId=record", "SessionResult?eventId=levelup", "SessionDetail?id=p0000000-0000-4000-8000-000000000001",
  "Journal", "Records", "Goals", "Plan",
  "Adventure", "Adventure&state=empty", "World?id=aube", "World?id=aube|click=Valider le chapitre 3", "World?id=marees", "World?id=forge",
  "Profile", "Atelier", "Community", "PublicCard", "Settings", "Account", "Privacy", "Notifications", "Sports", "Help", "TitanPlus", "DeleteAccount",
];

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const spec of only.length ? only : SCREENS) {
  // "Screen|click=Visible text" taps that text first (e.g. to show a confirmation or a reward).
  const [screen, click] = spec.split("|click=");
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(`${screen}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/#${screen}`);
  await page.waitForSelector("body[data-preview-ready]", { timeout: 20000 }).catch(() => errors.push(`${screen}: not ready`));
  await page.waitForTimeout(700);
  if (click) {
    await page.getByText(click, { exact: true }).first().click().catch((e) => errors.push(`${spec}: ${e.message.split("\n")[0]}`));
    await page.waitForTimeout(1600);
  }
  const name = (screen + (click ? "-clic" : "")).replace(/[?&=]/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
  await page.screenshot({ path: join(out, `${name}.png`) });
  // The whole screen too (tall viewport), so below-the-fold content is reviewed.
  await page.setViewportSize({ width: 412, height: 2400 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `${name}-long.png`) });
  await page.close();
}
await browser.close();
server.close();
if (errors.length) console.log(errors.join("\n"));
console.log(`captures: ${out}`);
