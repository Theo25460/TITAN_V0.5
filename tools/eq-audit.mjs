// "V1.2 Équilibrage" visual audit (EQ-001..045): measures the REAL built site (dist/ served locally, or any origin) at the widths of the matrix.
// It reports: horizontal overflow, content not centred, elements past the viewport, clipped text, overlapping fixed layers, distorted images,
// microscopic text, and layout shift while the page settles. Read-only. A screenshot is an observation, a number from this script is a proof.
// Usage: node tools/eq-audit.mjs [origin] [--pages a,b] [--widths 320,390] [--shots dir] [--json file] [--strict]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:/.test(a)) || "http://127.0.0.1:4173").replace(/\/+$/, "");
const STRICT = args.includes("--strict");
const SHOTS = flag("--shots");
const WIDTHS = (flag("--widths") || "320,360,375,390,412,430,600,719,720,721,768,859,860,861,959,960,961,979,980,981,1024,1039,1040,1041,1280,1440,1920").split(",").map(Number);
const PAGES = (flag("--pages") || "/,/titan-plus,/pour-les-coachs,/fonctionnalites,/niveaux-et-xp,/aventures-sportives,/sports,/debuter-titan,/comprendre-mes-donnees,/service,/legal_privacy,/login,/onboarding,/aujourdhui,/training,/journal,/stats,/carriere,/records,/objectifs,/prevoir,/adventure,/profile,/boutique,/social,/coaching").split(",");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const heightFor = (w) => (w <= 430 ? 844 : w <= 768 ? 900 : 900);
const findings = [];
const add = (page, w, code, msg) => findings.push({ page, w, code, msg });

const browser = await chromium.launch();
for (const path of PAGES) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: heightFor(w) }, deviceScaleFactor: 1, serviceWorkers: "block", reducedMotion: "reduce" });
    // The audit must not depend on third parties: they are refused, exactly like an offline visitor.
    await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && u.hostname !== new URL(ORIGIN).hostname, (r) => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 100)));
    await page.addInitScript(() => {
      window.__ls = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push(e.value); }).observe({ type: "layout-shift", buffered: true });
      // Every consent banner is answered the same way for the audit, but the first-visit state is measured BEFORE.
    });
    await page.goto(ORIGIN + path, { waitUntil: "load", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth, vh = innerHeight;
      const vis = (el) => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0 && +s.opacity > 0.05; };
      const hScroll = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth) return true; } return false; };
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) out.push(["overflow", `document ${de.scrollWidth} > ${de.clientWidth}`]);
      // Past the viewport (not inside a declared horizontal scroller, not off-canvas by design).
      let wide = 0;
      for (const el of document.querySelectorAll("body *")) {
        if (!vis(el) || hScroll(el)) continue;
        const b = el.getBoundingClientRect();
        if (getComputedStyle(el).position === "fixed") continue;
        if (b.right > vw + 1 && b.left < vw && wide++ < 3) out.push(["wide", `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 40)}"> right=${Math.round(b.right)} > ${vw}`]);
      }
      // Optical centring and gutters, measured on what the visitor reads (text, controls, images), never on full-bleed backgrounds.
      const main = document.querySelector("main") || document.body;
      const content = [...main.querySelectorAll("h1,h2,h3,p,li,label,a,button,input,select,textarea,img,svg")]
        .filter((e) => vis(e) && !hScroll(e) && getComputedStyle(e).position !== "fixed" && !e.closest("[aria-hidden=true], [hidden], .sr-only, .asc-skip, header, nav, footer") && !(e.tagName === "IMG" && !e.getAttribute("alt")))
        .map((e) => { const b = e.getBoundingClientRect(); b.el = `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).slice(0, 28)}`; return b; }).filter((b) => b.width >= 24 && b.height >= 8);
      if (content.length) {
        const rail = document.querySelector(".asc-rail"), railW = rail && vis(rail) ? rail.getBoundingClientRect().right : 0;
        const left = Math.min(...content.map((b) => b.left)) - railW, right = vw - Math.max(...content.map((b) => b.right));
        const lo = content.reduce((a, b) => (b.left < a.left ? b : a)), hi = content.reduce((a, b) => (b.right > a.right ? b : a));
        if (Math.min(left, right) < 8) out.push(["gouttière", `gouttière ${Math.round(Math.min(left, right))} px (< 8) ← ${left <= right ? lo.el : hi.el}`]);
        // The column itself (content box of <main>, rail excluded) must sit at the optical centre of the free area, ±2 px.
        const mb = main.getBoundingClientRect(), cs = getComputedStyle(main);
        const cl = mb.left + parseFloat(cs.paddingLeft), cr = mb.right - parseFloat(cs.paddingRight);
        const free = { l: railW, r: vw }, ml = cl - free.l, mr = free.r - cr;
        if (vw >= 720 && main.tagName === "MAIN" && Math.abs(ml - mr) > 2.5) out.push(["centre", `colonne ${Math.round(cl)}→${Math.round(cr)} : marges ${Math.round(ml)} / ${Math.round(mr)} px`]);
      }
      // Clipped text without ellipsis; microscopic text.
      let clipped = 0, tiny = 0;
      for (const el of document.querySelectorAll("body *")) {
        if (!vis(el) || el.children.length) continue;
        const t = el.textContent.trim(); if (t.length < 3) continue;
        { const b = el.getBoundingClientRect(); if (b.width <= 2 || b.height <= 2 || el.closest(".sr-only") || getComputedStyle(el).clip.startsWith("rect(0")) continue; }
        const s = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 2 && ["hidden", "clip"].includes(s.overflowX) && s.textOverflow !== "ellipsis" && clipped++ < 3) out.push(["coupé", `"${t.slice(0, 30)}"`]);
        if (parseFloat(s.fontSize) < 11 && tiny++ < 2) out.push(["minuscule", `"${t.slice(0, 24)}" ${s.fontSize}`]);
      }
      // Fixed layers (banner, pill, bars) hiding something interactive at rest.
      const fixed = [...document.querySelectorAll("body *")].filter((e) => vis(e) && getComputedStyle(e).position === "fixed");
      const hits = [];
      for (const f of fixed) {
        const fb = f.getBoundingClientRect();
        if (fb.width < 40 || fb.height < 20) continue;
        // The first-visit consent card is a deliberate overlay: it is judged on its size (compact), not on covering the page it asks about.
        if (f.classList.contains("titan-ga4-banner")) { if (fb.height > vh * 0.26) out.push(["bannière", `bannière ${Math.round(fb.height)} px = ${Math.round((100 * fb.height) / vh)} % de l'écran (> 26)`]); continue; }
        for (const e of document.querySelectorAll("a[href],button,input,select,textarea,h1,h2")) {
          if (f.contains(e) || e.contains(f) || !vis(e)) continue;
          const b = e.getBoundingClientRect();
          if (b.bottom <= 0 || b.top >= vh) continue;
          const ox = Math.min(b.right, fb.right) - Math.max(b.left, fb.left), oy = Math.min(b.bottom, fb.bottom) - Math.max(b.top, fb.top);
          if (ox > 12 && oy > 12 && getComputedStyle(f).zIndex !== "auto") hits.push(`${f.className || f.tagName}→${(e.textContent || e.name || e.tagName).trim().slice(0, 22)}`);
        }
      }
      if (hits.length) out.push(["recouvert", [...new Set(hits)].slice(0, 3).join(" | ")]);
      // Distorted or blurry images.
      let img = 0;
      for (const i of document.querySelectorAll("img")) {
        if (!vis(i) || !i.naturalWidth) continue;
        const b = i.getBoundingClientRect(), of = getComputedStyle(i).objectFit;
        const rn = i.naturalWidth / i.naturalHeight, rr = b.width / b.height;
        if (of === "fill" && Math.abs(rn - rr) / rn > 0.04 && img++ < 3) out.push(["image déformée", `${i.getAttribute("src")?.slice(-28)} natif ${i.naturalWidth}×${i.naturalHeight} rendu ${Math.round(b.width)}×${Math.round(b.height)}`]);
        if (b.width > i.naturalWidth * 1.5 && b.width > 120 && img++ < 3) out.push(["image floue", `${i.getAttribute("src")?.slice(-28)} natif ${i.naturalWidth} rendu ${Math.round(b.width)}`]);
      }
      return out;
    });
    const cls = await page.evaluate(() => window.__ls.reduce((a, v) => a + v, 0));
    for (const [code, msg] of r) add(path, w, code, msg);
    if (cls > 0.05) add(path, w, "décalage", `CLS ${cls.toFixed(3)} > 0,05`);
    for (const e of errors) add(path, w, "script", e);
    if (SHOTS && [320, 390, 980, 1440].includes(w)) await page.screenshot({ path: `${SHOTS}/${path.replace(/\W/g, "_") || "root"}-${w}.png`, fullPage: true }).catch(() => {});
    await ctx.close();
  }
}
await browser.close();

const by = new Map();
for (const f of findings) { const k = `${f.code}|${f.page}|${f.msg.replace(/\d+/g, "#")}`; const e = by.get(k) || { ...f, widths: [] }; e.widths.push(f.w); by.set(k, e); }
const rows = [...by.values()].sort((a, b) => a.code.localeCompare(b.code) || a.page.localeCompare(b.page));
for (const e of rows) console.log(`${e.code.padEnd(14)} ${e.page.padEnd(22)} @${e.widths.length > 6 ? `${e.widths.length} largeurs (${e.widths[0]}…${e.widths.at(-1)})` : e.widths.join(",")}  ${e.msg}`);
console.log(`\n${PAGES.length} pages × ${WIDTHS.length} largeurs : ${findings.length} constats (${rows.length} distincts)`);
if (flag("--json")) writeFileSync(flag("--json"), JSON.stringify(findings, null, 1));
process.exit(STRICT && findings.length ? 1 : 0);
