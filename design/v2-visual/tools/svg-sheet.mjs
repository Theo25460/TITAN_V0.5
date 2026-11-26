// Renders the vector family on the real TITAN grounds (bg, bg2) at use size and at 32/24 px, to a PNG proof.
// node design/v2-visual/tools/svg-sheet.mjs <svgRoot> <out.png>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
const [root, out] = process.argv.slice(2);
const sec = (dir, size) => readdirSync(join(root, dir)).filter(f => f.endsWith(".svg")).sort().map(f => {
  const svg = readFileSync(join(root, dir, f), "utf8").replace(/width="\d+" height="\d+"/, `width="${size[0]}" height="${size[1]}"`);
  const acc = (svg.match(/var\(--titan-accent,(#[0-9A-F]+)\)/i) || [])[1];
  return `<figure><div class="cell">${svg}</div><figcaption>${f.replace(".svg", "")}</figcaption></figure>`;
}).join("");
const small = dir => readdirSync(join(root, dir)).filter(f => f.endsWith(".svg")).sort().map(f => readFileSync(join(root, dir, f), "utf8").replace(/width="\d+" height="\d+"/, 'width="24" height="24"')).join("");
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#090C10;color:#AEB7BD;font:13px/1.4 system-ui;padding:24px}
h2{color:#F1F3EF;font-size:16px;margin:18px 0 10px;border-top:2px solid #F1F3EF;padding-top:10px}
.grid{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;background:#131920;padding:12px;border-radius:8px;width:184px}
figcaption{font-size:11px;color:#838E97;margin-top:6px}.cell{color:#AEB7BD}
.row{display:flex;gap:14px;flex-wrap:wrap;color:#F1F3EF;background:#131920;padding:14px;border-radius:8px}
.row.chip svg{color:#02181B;background:#3DD9E8;border-radius:4px;padding:3px}
</style><h2>États vides — 160×120, taille d’usage</h2><div class="grid">${sec("empty-states", [160, 120])}</div>
<h2>États système</h2><div class="grid">${sec("states", [160, 120])}</div>
<h2>Pictogrammes 24 px (grille 24, trait 1,65) — sur panneau</h2><div class="row">${small("icons")}</div>
<h2>Pictogrammes sur aplat d’espace (encre)</h2><div class="row chip">${small("icons")}</div>`;
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" }); const p = await b.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
