#!/usr/bin/env node
// Audit de propreté du banc d'aperçu : pour chaque écran et chaque largeur, défile la page et signale
//   - COUVERT : un texte visible dont le centre est recouvert par un autre élément (hors ancêtre/descendant),
//   - PETIT   : une cible tactile (bouton, onglet, lien, interrupteur) de moins de 44 dp dans une dimension,
//   - COUPÉ   : un texte dont la boîte dépasse l'écran (à droite / à gauche),
//   - SOUS-BARRE : un contenu final masqué par la barre d'onglets une fois en bas de page.
// Usage : node scripts/preview-audit.mjs <exportDir> [largeur ...]. Chromium + données fictives : indicateur de mise en page, pas une preuve Android.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

const [dist, ...widths] = process.argv.slice(2);
if (!dist) throw new Error("usage: preview-audit.mjs <exportDir> [largeur ...]");
const WIDTHS = widths.length ? widths.map(Number) : [320, 360, 412];
let chromium;
try { ({ chromium } = createRequire(resolve(process.cwd(), "../package.json"))("playwright")); } catch { ({ chromium } = createRequire(import.meta.url)("playwright")); }
const SCREENS = ["QG", "QG&state=steps", "QG&state=empty", "Progress", "Record", "SessionForm?sport=running", "SessionForm?sport=muscu_gym", "Journal", "Records", "Goals", "Plan", "Adventure", "World?id=aube", "Profile", "Atelier", "Community", "Settings", "Account", "Sports", "Help", "Notifications", "Sources&state=steps", "Steps&state=steps", "WebHub", "Guide", "Welcome", "Login", "Signup", "TitanPlus", "Privacy"];

const TAB_SCREENS = new Set(["QG", "Progress", "Record", "Adventure", "Profile"]);
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

const inPage = (atTop) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { covered: [], small: [], cut: [], narrow: [] };
  const label = (e) => `${e.tagName.toLowerCase()}“${(e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40)}”`;
  // Text leaves: elements whose own text node is non-empty.
  const leaves = [...document.querySelectorAll("body *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  for (const e of leaves) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh) continue;
    const st = getComputedStyle(e);
    // Screens of the other tabs stay in the page (invisible): only what a person can actually see is audited.
    if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    if (e.closest('[aria-hidden="true"]')) continue;
    // A row meant to scroll sideways (chips) may extend past the edge: not a defect.
    let sideways = false;
    for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "scroll") { sideways = true; break; } }
    if (!sideways && (r.left < -1 || r.right > vw + 1)) out.cut.push(label(e));
    // A text squeezed into a sliver (many very short lines: words cut in the middle) is a layout defect.
    const txt = (e.innerText || "").trim();
    const lh = parseFloat(st.lineHeight) || parseFloat(st.fontSize) * 1.25;
    const lines = Math.round(r.height / lh);
    if (txt.length >= 12 && lines >= 3 && txt.length / lines < 6.5 && !txt.includes("\n")) out.narrow.push(`${label(e)} ${lines} lignes de ~${Math.round(txt.length / lines)} car.`);
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + Math.min(r.height / 2, 12)));
    if (r.top + Math.min(r.height / 2, 12) > vh || r.top < 0) continue;
    // At the top of the page the lowest part of the window is just where the content is cut by the screen edge and the tab bar: judged at the end of the page.
    if (atTop && r.top > vh * 0.72) continue;
    // Scrolled down, the top strip is where content passes under the fixed header (and under sticky month titles): expected.
    if (!atTop && r.top < 80) continue;
    const top = document.elementFromPoint(cx, cy);
    if (top && !(e.contains(top) || top.contains(e))) {
      // A text covered by an element that is not its ancestor/descendant. Ignore overlays meant to cover (modals) is done by screen choice.
      out.covered.push(`${label(e)} ← ${label(top)}`);
    }
  }
  for (const e of document.querySelectorAll('[role="button"],[role="tab"],[role="switch"],button,a[href]')) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh) continue;
    if ((e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) || e.closest('[aria-hidden="true"]')) continue;
    if (r.height < 43.5 || r.width < 43.5) out.small.push(`${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return out;
};

const browser = await chromium.launch();
const problems = [];
for (const width of WIDTHS)
  for (const screen of SCREENS) {
    const page = await browser.newPage({ viewport: { width, height: 740 } });
    page.on("pageerror", (e) => problems.push(`${screen} @${width}: erreur ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/#${screen}`);
    await page.waitForSelector("body[data-preview-ready]", { timeout: 20000 }).catch(() => problems.push(`${screen} @${width}: pas prêt`));
    await page.waitForTimeout(3600); // reveal animations settled
    const scroller = await page.evaluateHandle(() => [...document.querySelectorAll("div")].filter((d) => /(auto|scroll)/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 4 && d.getBoundingClientRect().width > 200 && (!d.checkVisibility || d.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) && !d.closest('[aria-hidden="true"]')).sort((a, b) => b.clientHeight - a.clientHeight)[0] || null);
    const seen = { covered: new Set(), small: new Set(), cut: new Set(), narrow: new Set() };
    const steps = [];
    const hasScroller = await scroller.evaluate((s) => !!s);
    if (hasScroller) {
      const max = await scroller.evaluate((s) => s.scrollHeight - s.clientHeight);
      for (let y = 0; y <= max + 1; y += 480) steps.push(Math.min(y, max));
      if (steps.at(-1) !== max) steps.push(max);
    } else steps.push(0);
    for (const y of steps) {
      if (hasScroller) await scroller.evaluate((s, v) => { s.scrollTop = v; }, y);
      await page.waitForTimeout(120);
      const r = await page.evaluate(inPage, y === 0 || steps.length === 1);
      // Content sliding under a bar while scrolling is normal; only what is hidden AT REST (top of the page, end of the page) is a defect.
      const atRest = y === 0 || y === steps.at(-1);
      for (const k of Object.keys(seen)) if (k !== "covered" || atRest) r[k].forEach((x) => seen[k].add(x));
    }
    // Bottom of the page: the last readable element must clear the tab bar.
    if (hasScroller && TAB_SCREENS.has(screen.split("&")[0])) {
      const under = await page.evaluate(() => {
        const bar = [...document.querySelectorAll('[role="tablist"],div')].find((d) => d.querySelector('[data-testid="tab-record"]') && d.getBoundingClientRect().height < 140);
        if (!bar) return null;
        const top = bar.getBoundingClientRect().top;
        const texts = [...document.querySelectorAll("body *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !bar.contains(e) && (!e.checkVisibility || e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) && !e.closest('[aria-hidden="true"]'));
        const last = texts.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 2 && r.top < window.innerHeight).sort((a, b) => b.bottom - a.bottom)[0];
        return last && last.bottom > top + 1 ? Math.round(last.bottom - top) : 0;
      });
      if (under) problems.push(`${screen} @${width}: SOUS-BARRE contenu final masqué de ${under}px par la barre d'onglets`);
    }
    for (const x of seen.covered) problems.push(`${screen} @${width}: COUVERT ${x}`);
    for (const x of seen.small) if (!/Tabs, back/.test(x)) problems.push(`${screen} @${width}: PETIT ${x}`);
    for (const x of seen.cut) problems.push(`${screen} @${width}: COUPÉ ${x}`);
    for (const x of seen.narrow) problems.push(`${screen} @${width}: ÉTROIT ${x}`);
    await page.close();
  }
console.log(problems.length ? problems.join("\n") : `Rien de masqué, de coupé ou de trop petit : ${SCREENS.length} écrans × ${WIDTHS.join("/")} dp`);
await browser.close();
server.close();
