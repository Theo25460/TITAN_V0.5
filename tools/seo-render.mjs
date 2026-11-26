#!/usr/bin/env node
// SEO guard, rendered side (docs/seo/SEO_GUARD.md): what a visitor coming from Google gets once JavaScript has run, on a phone and on a
// desktop. Compares the rendered DOM with the raw HTML, watches script errors and failed first-party requests, checks that the H1 and the
// call to action are visible and not covered (first visit: the consent banner is shown), that nothing stays "loading", and replays the
// journeys Google → public page → internal navigation → web sign-in / sign-up. Third parties (Supabase, Google) are cut: a public page must
// not need them. Optional lab performance (--perf): LCP, CLS, bytes, with a fixed mobile profile, median of N runs, never a blocking score.
//
//   node tools/seo-render.mjs --dist dist [--perf] [--runs 3]
//   node tools/seo-render.mjs --base https://titan-app.fr [--perf]
// Exit codes as tools/seo-guard.mjs: 0 PASS · 1 FAIL · 3 INCONCLUSIVE · 2 usage. Report: test-results/seo-guard/render-<label>.json/.md
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startEmulator } from "./lib/netlify-emulator.mjs";
import { expandRoutes, toMarkdown, summarizePage, boundedFetch } from "./lib/seo-guard.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const PLAY_LISTING = "https://play.google.com/store/apps/details?id=fr.titanapp.app";
export const VIEWPORTS = [{ name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, { name: "desktop", width: 1280, height: 800, deviceScaleFactor: 1 }];
// Lab profile for --perf (comparable runs, not field data): a mid-range phone on a good 4G link.
const PERF_PROFILE = { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, cpuRate: 4 };

async function loadPlaywright() {
  try { return (await import("playwright")).chromium; } catch { return (await import(pathToFileURL(join(root, "node_modules/playwright/index.mjs")).href)).chromium; }
}

const inPage = () => {
  const h1 = document.querySelector("h1");
  const coveredAt = (el) => {
    if (!el) return "absent";
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return "invisible";
    const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 60), 1), innerWidth - 1);
    const y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight) return "off-screen";
    const hit = document.elementFromPoint(x, y);
    return hit && (hit === el || el.contains(hit) || hit.contains(el)) ? null : `${hit?.tagName?.toLowerCase() || "?"}.${String(hit?.className || "").split(" ")[0]}`;
  };
  return {
    title: document.title, h1Covered: coveredAt(h1),
    busy: Boolean(document.querySelector('main[aria-busy="true"],[data-loading="true"],.is-loading main')),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    playLinks: [...document.querySelectorAll('a[href*="play.google.com"]')].filter((a) => a.offsetParent !== null).map((a) => a.href),
  };
};

/**
 * @param {object} o
 * @param {string} o.base  site to render (emulator URL, preview, production)
 * @param {object} o.manifest tools/seo/manifest.json
 * @param {string[]} [o.paths] public routes to render (default: critical indexable routes)
 */
export async function renderCheck(o) {
  const started = Date.now();
  const chromium = o.chromium || (await loadPlaywright());
  const manifest = o.manifest;
  const origin = manifest.origin;
  const routes = expandRoutes(manifest, { variants: false });
  const byPath = new Map(routes.map((r) => [r.path, r]));
  const paths = o.paths || routes.filter((r) => r.indexable && r.criticality === "critical").map((r) => r.path);
  const findings = [];
  const add = (severity, rule, url, assertion, expected, actual, hint, extra = {}) => findings.push({ severity, rule, url, assertion, expected, actual, hint, ...extra });
  // Behind an HTTPS proxy (some sandboxes), Chromium is told about it; GitHub runners have none, so this is a no-op in CI.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), ...(proxy && !/^http:\/\/127\./.test(o.base) ? { proxy: { server: proxy, bypass: "127.0.0.1,localhost" } } : {}), ...(o.launch || {}) });
  const firstParty = new URL(o.base).origin;
  const observations = {};
  const thirdParty = new Set();
  async function open(viewport, { firstVisit = true } = {}) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, deviceScaleFactor: viewport.deviceScaleFactor, serviceWorkers: "block", locale: "fr-FR" });
    // A first visit, as from a search result: no consent choice yet, so the consent banner shows (tests/e2e pre-decide it otherwise).
    if (firstVisit) await context.addInitScript(() => { try { localStorage.removeItem("titan_ga4_consent_v1"); } catch {} });
    await context.route((url) => !String(url).startsWith(firstParty), (r) => { thirdParty.add(new URL(r.request().url()).host); return r.abort("blockedbyclient"); });
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 160)));
    page.on("response", (r) => { const u = r.url(); if (u.startsWith(firstParty) && r.status() >= 400 && !/favicon|apple-touch|\/\.netlify\/scripts\/rum/.test(u)) failed.push(`${r.status()} ${u.slice(firstParty.length)}`); });
    return { context, page, errors, failed };
  }
  try {
    for (const path of paths) {
      const route = byPath.get(path) || {};
      const raw = await boundedFetch(`${o.base}${path}`, { timeoutMs: 15000, retries: 2 });
      const rawPage = raw.status === 200 ? summarizePage(raw.body, origin) : null;
      for (const vp of VIEWPORTS) {
        const label = `${path} @${vp.name}`;
        const { context, page, errors, failed } = await open(vp);
        try {
          const response = await page.goto(`${o.base}${path}`, { waitUntil: "load", timeout: 30000, referer: "https://www.google.com/" }).catch((e) => ({ error: e }));
          if (response?.error || !response) { add(route.criticality === "critical" ? "P0" : "P1", "render-unreachable", label, "la page s'ouvre dans un navigateur", "chargé", String(response?.error?.message || "aucune réponse").slice(0, 120), "Échec réseau : relancer.", { inconclusive: true }); continue; }
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(300);
          const finalPath = new URL(page.url()).pathname;
          // The rendered DOM goes through the SAME extractor as the raw HTML, so both sides are counted identically.
          const dom = { ...(await page.evaluate(inPage)) };
          const rendered = summarizePage(await page.content(), origin);
          Object.assign(dom, { words: rendered.mainWords, h1: rendered.h1[0] ?? null, canonical: rendered.canonical[0] ?? null, robots: rendered.robotsMeta });
          observations[label] = { status: response.status(), finalPath, ...dom, rawWords: rawPage?.mainWords ?? null, errors: errors.length, failed: failed.length };
          if (finalPath !== path) add("P0", "render-redirected", label, "un visiteur venu de Google reste sur la page (ni mur de connexion, ni boucle)", path, finalPath, "Une page publique ne doit jamais dépendre d'une session.");
          if (errors.length) add("P1", "render-script-error", label, "aucune erreur de script", 0, errors.slice(0, 2).join(" | "), "Une erreur non interceptée peut arrêter le script de la page.");
          if (failed.length) add("P1", "render-request-failed", label, "chaque requête vers le site réussit", 0, failed.slice(0, 3).join(", "), "Un fichier manquant casse l'affichage.");
          if (rawPage && dom.words < rawPage.mainWords * 0.5) add("P0", "render-content-lost", label, "le contenu affiché garde le contenu du HTML brut", `≥ ${Math.round(rawPage.mainWords * 0.9)} mots`, `${dom.words} sur ${rawPage.mainWords}`, "Un script retire ou masque le contenu principal après le chargement.");
          else if (rawPage && dom.words < rawPage.mainWords * 0.9) add("P1", "render-content-reduced", label, "le contenu affiché garde le contenu du HTML brut", `≥ ${Math.round(rawPage.mainWords * 0.9)} mots`, `${dom.words} sur ${rawPage.mainWords}`, "Chercher le script qui retire du texte.");
          if (!dom.h1) add("P0", "render-h1-missing", label, "un H1 après rendu", "présent", "absent", "Le titre a disparu de la page affichée.");
          else if (dom.h1Covered && dom.h1Covered !== "off-screen") add("P1", "render-h1-covered", label, "le H1 est visible, non recouvert", "visible", dom.h1Covered, "Une surcouche (bannière, fenêtre, chargement) masque le début de la page.");
          if (dom.canonical && rawPage?.canonical?.[0] && dom.canonical !== rawPage.canonical[0]) add("P0", "render-canonical-changed", label, "aucun script ne réécrit la canonique", rawPage.canonical[0], dom.canonical, "Ne jamais construire une canonique depuis location.host.");
          if (dom.robots.some((r) => /noindex/.test(r)) && !rawPage?.robotsMeta?.some((r) => /noindex/.test(r))) add("P0", "render-noindex-added", label, "aucun script n'ajoute noindex à une page publique", "indexable", dom.robots.join(" | "), "Un script a ajouté une balise robots.");
          if (dom.busy) add("P1", "render-loading", label, "rien ne reste en chargement", "chargé", "aria-busy/data-loading toujours présent", "Écran de chargement permanent.");
          if (dom.overflow > 1) add("P1", "render-overflow", label, "pas de défilement horizontal", "≤ 1 px", `${dom.overflow} px`, "Un élément trop large casse la mise en page sur téléphone.");
          for (const href of dom.playLinks) if (href !== PLAY_LISTING) add("P1", "render-play-link", label, "un lien Google Play visible mène à la fiche publique", PLAY_LISTING, href, "tools/lib/public-template.mjs playStoreUrl().");
          for (const cta of route.ctas || []) {
            const link = page.locator(`main a[href="${cta}"]`).first();
            if (!(await link.count())) { add("P1", "render-cta-missing", label, `le bouton vers ${cta} est affiché`, "présent", "absent", "Restaurer le bouton."); continue; }
            await link.scrollIntoViewIfNeeded().catch(() => {});
            const covered = await link.evaluate((el) => { const r = el.getBoundingClientRect(); if (!r.width) return "invisible"; const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit && (hit === el || el.contains(hit)) ? null : `${hit?.tagName?.toLowerCase()}.${String(hit?.className || "").split(" ")[0]}`; });
            if (covered) add("P1", "render-cta-covered", label, `le bouton vers ${cta} est atteignable`, "atteignable", covered, "La bannière de consentement ou une autre surcouche recouvre le bouton.");
          }
        } finally { await context.close(); }
      }
    }

    /* Journeys: Google → guide → internal link → sign-in, and the sign-up target, with no session and Supabase cut. */
    const { context, page, errors } = await open(VIEWPORTS[0], { firstVisit: false });
    page.setDefaultTimeout(10000);
    try {
      const journey = async (name, fn) => { try { await fn(); } catch (e) { add("P0", "journey-broken", name, "le parcours aboutit", "terminé", String(e.message || e).split("\n")[0].slice(0, 160), "Le rejouer à la main sur un téléphone."); } };
      await journey("google → /suivi-escalade → /fonctionnalites", async () => {
        await page.goto(`${o.base}/suivi-escalade`, { waitUntil: "load", referer: "https://www.google.com/" });
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 10000 });
        const link = page.locator('a[href="/fonctionnalites"]:visible').first();
        await link.scrollIntoViewIfNeeded();
        await Promise.all([page.waitForURL((u) => u.pathname === "/fonctionnalites", { timeout: 10000 }), link.click()]);
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 10000 });
      });
      await journey("/ → « J’ai un compte » → /login (formulaire, sans boucle)", async () => {
        await page.goto(`${o.base}/`, { waitUntil: "load" });
        const link = page.locator('main a[href="/login"]:visible').first();
        await link.scrollIntoViewIfNeeded();
        await Promise.all([page.waitForURL((u) => u.pathname === "/login", { timeout: 10000 }), link.click()]);
        await page.locator('input[type="email"], input[name="email"]').first().waitFor({ state: "visible", timeout: 10000 });
        await page.locator('input[type="password"]').first().waitFor({ state: "visible", timeout: 10000 });
        await page.waitForTimeout(1500);
        if (new URL(page.url()).pathname !== "/login") throw new Error(`left /login for ${page.url()}`);
      });
      await journey("/debuter-titan → « Commencer » → /onboarding", async () => {
        await page.goto(`${o.base}/debuter-titan`, { waitUntil: "load" });
        const link = page.locator('main a.asc-btn-primary[href="/onboarding"]:visible').first();
        await link.scrollIntoViewIfNeeded();
        await Promise.all([page.waitForURL((u) => u.pathname === "/onboarding", { timeout: 10000 }), link.click()]);
        await page.waitForLoadState("load");
        const text = await page.evaluate(() => (document.querySelector("main") || document.body).innerText.trim().length);
        if (text < 40) throw new Error(`the sign-up screen rendered ${text} characters`);
      });
      if (errors.length) add("P1", "journey-script-error", "parcours", "aucune erreur de script pendant les parcours", 0, errors.slice(0, 2).join(" | "), "Voir la console du navigateur.");
    } finally { await context.close(); }

    /* Lab performance, informative: fixed mobile profile, median of N runs (field Core Web Vitals live in Search Console / Netlify RUM). */
    const perf = {};
    if (o.perf) {
      for (const path of paths) {
        const runs = [];
        for (let i = 0; i < (o.runs || 3); i += 1) {
          const { context: c, page: p } = await open(VIEWPORTS[0], { firstVisit: false });
          const cdp = await c.newCDPSession(p);
          await cdp.send("Network.enable");
          await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: PERF_PROFILE.latency, downloadThroughput: PERF_PROFILE.downloadThroughput, uploadThroughput: PERF_PROFILE.uploadThroughput });
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: PERF_PROFILE.cpuRate });
          await p.addInitScript(() => {
            window.__lcp = 0; window.__cls = 0;
            new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
            new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
          });
          let bytes = 0, requests = 0;
          p.on("response", async (r) => { requests += 1; try { bytes += Number(r.headers()["content-length"] || 0) || (await r.body()).length; } catch {} });
          const t0 = Date.now();
          await p.goto(`${o.base}${path}`, { waitUntil: "load", timeout: 60000 });
          const load = Date.now() - t0;
          await p.waitForTimeout(1500);
          const m = await p.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Math.round(window.__cls * 1000) / 1000, fcp: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0) }));
          runs.push({ ...m, load, bytes, requests });
          await c.close();
        }
        const median = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
        perf[path] = { runs: runs.length, lcp: median("lcp"), fcp: median("fcp"), cls: median("cls"), load: median("load"), bytes: median("bytes"), requests: median("requests"), spreadLcp: [Math.min(...runs.map((r) => r.lcp)), Math.max(...runs.map((r) => r.lcp))] };
      }
    }
    const open_ = findings;
    const count = (s) => open_.filter((f) => f.severity === s && !f.inconclusive).length;
    const inconclusive = open_.filter((f) => f.inconclusive).length;
    const summary = { P0: count("P0"), P1: count("P1"), P2: count("P2"), approved: 0, inconclusive, routes: paths.length };
    summary.verdict = summary.P0 || summary.P1 ? "FAIL" : inconclusive ? "INCONCLUSIVE" : "PASS";
    return { tool: "seo-render", version: 1, context: "render", scope: `${paths.length} pages × ${VIEWPORTS.length} écrans + 3 parcours`, target: o.targetLabel || o.base, origin, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, build: null, baseline: null, summary, findings, observations, perf, thirdPartyBlocked: [...thirdParty].sort(), perfProfile: o.perf ? PERF_PROFILE : null };
  } finally { await browser.close(); }
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true"; };
  const manifest = JSON.parse(readFileSync(join(root, "tools/seo/manifest.json"), "utf8"));
  let base = opt("base", ""), emulator = null, label;
  if (opt("dist")) {
    const dist = resolve(root, opt("dist"));
    if (!existsSync(join(dist, "index.html"))) { console.error("Build first: node tools/build-public.mjs"); process.exit(2); }
    emulator = await startEmulator({ dist, netlifyToml: readFileSync(join(root, "netlify.toml"), "utf8") });
    base = emulator.url; label = "render-dist";
  } else if (!/^https:\/\/(titan-app\.fr|[a-z0-9-]+--titano-app\.netlify\.app)$/.test(base)) { console.error("--dist dist or --base https://titan-app.fr|<deploy>--titano-app.netlify.app"); process.exit(2); }
  label ||= base === "https://titan-app.fr" ? "render-production" : `render-${new URL(base).hostname.split("--")[0]}`;
  const report = await renderCheck({ base, manifest, perf: opt("perf") === "true", runs: Number(opt("runs", 3)), targetLabel: emulator ? `dist/ via netlify.toml` : base });
  await emulator?.close();
  const out = resolve(root, opt("out", "test-results/seo-guard"));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${label}.json`), `${JSON.stringify(report, null, 2)}\n`);
  let md = toMarkdown(report);
  if (Object.keys(report.perf).length) {
    md += `\n### Performance de laboratoire (profil mobile fixe : 4G ${PERF_PROFILE.latency} ms, processeur ×${PERF_PROFILE.cpuRate}, médiane de ${report.perf[Object.keys(report.perf)[0]].runs} passages — indicatif, jamais bloquant)\n\n| Page | LCP | FCP | CLS | Chargement | Octets | Requêtes | LCP min–max |\n|---|---|---|---|---|---|---|---|\n`;
    for (const [p, m] of Object.entries(report.perf)) md += `| \`${p}\` | ${m.lcp} ms | ${m.fcp} ms | ${m.cls} | ${m.load} ms | ${Math.round(m.bytes / 1024)} Ko | ${m.requests} | ${m.spreadLcp.join("–")} ms |\n`;
  }
  writeFileSync(join(out, `${label}.md`), md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  const s = report.summary;
  console.log(`Rendu SEO ${s.verdict} — ${report.target} — P0 ${s.P0} · P1 ${s.P1} · non concluants ${s.inconclusive} — ${(report.durationMs / 1000).toFixed(1)} s`);
  for (const f of report.findings) console.log(` ${f.severity} ${f.rule} ${f.url} — attendu ${JSON.stringify(f.expected)}, obtenu ${JSON.stringify(f.actual)}`);
  if (Object.keys(report.perf).length) console.log(md.slice(md.indexOf("### Performance")));
  process.exitCode = s.verdict === "FAIL" ? 1 : s.verdict === "INCONCLUSIVE" ? 3 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((e) => { console.error(e?.stack || e); process.exit(2); });
