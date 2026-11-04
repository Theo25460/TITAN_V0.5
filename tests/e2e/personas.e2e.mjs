// Tester personas, as automated regressions. Each persona is a screen the product must work on; the failures these checks caught were real
// (a 280 px folded-phone cover display widened the page, standalone links were 22 px tall on tablets and phones).
//  - débutant, petit téléphone 320 px          - sportif de haut niveau, tablette 768 et 1024 px (tactile)
//  - coach, Chromebook 1366 px (souris)         - particulier gratuit, très petit téléphone 320x533
//  - premium, téléphone pliant : écran de couverture 280 px et écran déplié 673 px
// For each: the layout viewport never grows (no content wider than the screen), and on a touch screen every control that is not a link
// inside a sentence is at least 24 px (WCAG 2.2 AA 2.5.8). Local server, no external host.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
let server, browser, BASE;
before(async () => {
  const port = await new Promise((ok) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["tools/serve-public.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const PERSONAS = [
  { name: "débutant 320", width: 320, height: 568, dpr: 2, touch: true },
  { name: "gratuit petit téléphone", width: 320, height: 533, dpr: 1.5, touch: true },
  { name: "athlète tablette portrait", width: 768, height: 1024, dpr: 2, touch: true },
  { name: "athlète tablette paysage", width: 1024, height: 768, dpr: 2, touch: true },
  { name: "coach Chromebook", width: 1366, height: 768, dpr: 1, touch: false },
  { name: "pliant couverture", width: 280, height: 653, dpr: 3, touch: true },
  { name: "pliant déplié", width: 673, height: 841, dpr: 2.6, touch: true },
];
const PAGES = ["/aujourdhui", "/training", "/journal", "/stats", "/records", "/objectifs", "/adventure", "/profile", "/social", "/coaching", "/prevoir", "/titan-plus", "/aide", "/atelier"];

for (const persona of PERSONAS) {
  test(`persona ${persona.name}: nothing wider than the screen, no control too small to touch`, async () => {
    const context = await browser.newContext({ viewport: { width: persona.width, height: persona.height }, deviceScaleFactor: persona.dpr, isMobile: persona.touch, hasTouch: persona.touch, serviceWorkers: "block", timezoneId: "Europe/Paris" });
    await context.addInitScript(() => { try { localStorage.setItem("titan_ga4_consent_v1", "denied"); } catch {} });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("internetdisconnected"));
    const problems = [];
    try {
      for (const path of PAGES) {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message.slice(0, 80)));
        try {
          await page.goto(BASE + path, { waitUntil: "load" });
          await page.waitForTimeout(900);
          const r = await page.evaluate((touch) => {
            const grow = document.documentElement.scrollWidth - window.innerWidth;
            const small = [];
            if (touch) {
              document.querySelectorAll("a,button,[role=button],input,select,summary").forEach((e) => {
                const b = e.getBoundingClientRect(), s = getComputedStyle(e);
                if (b.width <= 0 || b.height <= 0 || s.visibility === "hidden") return;
                // A link that sits between words of a sentence or a line of text is exempt.
                const parent = e.parentElement;
                if (e.tagName === "A" && parent && [...parent.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
                if (e.tagName === "A" && s.display === "inline" && e.closest("p,li,small,td")) return;
                if (b.width < 24 || b.height < 24) small.push(`${e.tagName.toLowerCase()} ${Math.round(b.width)}x${Math.round(b.height)} "${(e.textContent || e.type || "").trim().slice(0, 20)}"`);
              });
            }
            return { grow, small: [...new Set(small)].slice(0, 4) };
          }, persona.touch);
          if (r.grow > 1) problems.push(`${path}: page ${r.grow}px wider than the screen`);
          if (r.small.length) problems.push(`${path}: too small to touch: ${r.small.join(" | ")}`);
          if (errors.length) problems.push(`${path}: ${errors[0]}`);
        } finally { await page.close(); }
      }
    } finally { await context.close(); }
    assert.deepEqual(problems, []);
  });
}
