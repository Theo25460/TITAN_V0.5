// Contact sheet of the TITAN sport icons: every glyph at 48, 22 and 16 px on the night ground, plus 22 px on the chalk ground.
// Usage: node tools/sport-icons/sheet.mjs [--png out.png] [--html out.html] [--only name,name,prefix*] [--cols 10] [--scale 2]
// With --html out.html writes the sheet as a page; with --png out.png renders it with the pre-installed Chromium.
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { GLYPHS } from "./glyphs.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const only = opt("--only", "") ? opt("--only").split(",") : null;
const cols = Number(opt("--cols", 10));
const names = Object.keys(GLYPHS).filter((n) => !only || only.some((o) => n === o || (o.endsWith("*") && n.startsWith(o.slice(0, -1)))));
const svg = (n, s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[n]}</svg>`;
const cell = (n) => `<figure><div class="big">${svg(n, 48)}</div><div class="small">${svg(n, 22)}${svg(n, 16)}<span class="light">${svg(n, 22)}</span></div><figcaption>${n.replace(/^sport-/, "")}</figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><title>TITAN sport icons</title><style>
body{margin:0;background:#090C10;color:#F1F3EF;font:600 11px/1.2 system-ui,sans-serif;padding:16px}
main{display:grid;grid-template-columns:repeat(${cols},116px);gap:10px}
figure{margin:0;background:#131920;border-radius:8px;padding:10px 6px 8px;display:grid;justify-items:center;gap:6px}
.big{color:#F1F3EF}.small{display:flex;gap:7px;align-items:center;color:#3DD9E8}
.light{background:#E9EDE8;color:#0E1216;border-radius:4px;display:grid;padding:2px}
figcaption{color:#AEB7BD;text-align:center;word-break:break-all}
h1{font-size:15px;margin:0 0 12px}
</style><h1>TITAN · icônes de sport · ${names.length} glyphes</h1><main>${names.map(cell).join("")}</main>`;
if (opt("--html", "")) writeFileSync(opt("--html"), html);
const png = opt("--png", "");
if (png) {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
  const page = await browser.newPage({ viewport: { width: 32 + cols * 126, height: 400 }, deviceScaleFactor: Number(opt("--scale", 1)) });
  await page.setContent(html);
  await page.screenshot({ path: png, fullPage: true });
  await browser.close();
}
console.log(`${names.length} glyphs`);
