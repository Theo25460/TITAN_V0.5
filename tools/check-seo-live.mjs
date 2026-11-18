// SEO V1.3.1 — compares what a deployed site SERVES with what this checkout contains, page by page.
// Usage: node tools/check-seo-live.mjs https://titan-app.fr            (production)
//        node tools/check-seo-live.mjs https://deploy-preview-162--titano-app.netlify.app   (a deploy preview)
// Read-only: plain GET requests, no form, no account, nothing submitted to Google. A report goes to test-results/seo-live-<host>.json.
// A page that answers 200 is not proof that Google has read it: see docs/SEARCH_CONSOLE_RELEASE_RUNBOOK.md for the Search Console part.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\/(?:titan-app\.fr|[a-z0-9-]+--titano-app\.netlify\.app)$/.test(base)) {
  console.error("Usage: node tools/check-seo-live.mjs https://titan-app.fr | https://<preview>--titano-app.netlify.app");
  process.exit(2);
}
const PROD = "https://titan-app.fr";
const root = new URL("..", import.meta.url).pathname;
const local = (name) => readFileSync(`${root}${name}`, "utf8");
const file = (path) => (path === "/" ? "index.html" : `${path.slice(1)}.html`);
const pick = (html, re) => (html.match(re) || [])[1] ?? null;
const head = (html) => ({
  title: pick(html, /<title>([^<]*)<\/title>/),
  description: pick(html, /<meta name="description" content="([^"]*)"/),
  canonical: pick(html, /<link rel="canonical" href="([^"]*)"/),
  robots: pick(html, /<meta name="robots" content="([^"]*)"/),
  h1: pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null,
});
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
async function get(path, redirect = "manual") {
  const response = await fetch(base + path, { redirect, signal: AbortSignal.timeout(30000), headers: { "user-agent": "titan-seo-live-check" } });
  return { status: response.status, location: response.headers.get("location"), xRobots: response.headers.get("x-robots-tag"), body: await response.text() };
}

const expected = locs(local("sitemap.xml"));
const results = [];
const add = (check, pass, detail = {}) => results.push({ check, pass, ...detail });

// 1. sitemap.xml and robots.txt served = this checkout.
const servedSitemap = await get("/sitemap.xml");
const served = servedSitemap.status === 200 ? locs(servedSitemap.body) : [];
add("sitemap.xml: 200", servedSitemap.status === 200, { status: servedSitemap.status });
add("sitemap.xml: same URLs as the checkout", served.length === expected.length && expected.every((u) => served.includes(u)), {
  served: served.length, expected: expected.length,
  missing: expected.filter((u) => !served.includes(u)), extra: served.filter((u) => !expected.includes(u)),
});
const robots = await get("/robots.txt");
add("robots.txt: same as the checkout", robots.status === 200 && robots.body.trim() === local("robots.txt").trim(), { status: robots.status });

// 2. Every sitemap URL: 200 without redirect, canonical on the production domain, indexable, same title/description/H1 as the checkout.
for (const url of expected) {
  const path = url.slice(PROD.length) || "/";
  const page = await get(path);
  const want = head(local(file(path)));
  const got = page.status === 200 ? head(page.body) : {};
  const differences = ["title", "description", "canonical", "h1"].filter((k) => got[k] !== want[k]);
  const indexable = !/noindex/i.test(got.robots || "") && !/noindex/i.test(page.xRobots || "");
  add(`${path}`, page.status === 200 && differences.length === 0 && (indexable || base !== PROD), {
    status: page.status, location: page.location, indexable, differences,
    ...(differences.includes("title") ? { servedTitle: got.title, expectedTitle: want.title } : {}),
  });
}

// 3. Address variants and exclusions.
for (const [path, status] of [["/suivi-escalade.html", 301], ["/service/", 301], ["/tarifs", 301], ["/page-inconnue-seo-check", 404]]) {
  const r = await get(path);
  add(`${path}: ${status}`, r.status === status, { status: r.status, location: r.location });
}
for (const path of ["/login", "/onboarding", "/aujourdhui", "/profile"]) {
  const r = await get(path);
  const noindex = /noindex/i.test(r.xRobots || "") || /<meta name="robots" content="[^"]*noindex/i.test(r.body);
  add(`${path}: noindex and not in the sitemap`, noindex && !served.includes(PROD + path), { status: r.status });
}
const sw = await get("/sw.js");
const build = pick(sw.body, /(titan-os-[a-z0-9-]+)/);

const report = { base, checkedAt: new Date().toISOString(), servedBuild: build, passed: results.filter((r) => r.pass).length, total: results.length, results };
mkdirSync(`${root}test-results`, { recursive: true });
writeFileSync(`${root}test-results/seo-live-${new URL(base).hostname}.json`, JSON.stringify(report, null, 2));
console.log(`${base} — build servi : ${build ?? "inconnu"} — ${report.passed}/${report.total} contrôles conformes au dépôt`);
for (const r of results.filter((x) => !x.pass)) console.log(` ✗ ${r.check} ${JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !["check", "pass"].includes(k))))}`);
if (report.passed !== report.total) process.exitCode = 1;
