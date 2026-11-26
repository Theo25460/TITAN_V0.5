// SEO guard engine: observes what a site SERVES (the built artifact through the Netlify emulator, a deploy preview, or production),
// checks it against the versioned contract (tools/seo/manifest.json), compares it with the production reference
// (tools/seo/baseline/production.json) and applies traceable approvals (tools/seo/approvals.json).
// Severity: P0 blocks a publication, P1 needs an explicit approval, P2 is a warning. A repeated network failure is never a pass:
// it is reported as INCONCLUSIVE. See docs/seo/SEO_GUARD.md.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractPage, robotsDirectives, NOT_FOUND_TITLE } from "./seo-html.mjs";
import { parseRobots, isAllowed, parseSitemap } from "./seo-robots.mjs";

export const INDEXABLE_GROUPS = new Set(["marketing", "guide", "support", "legal"]);
const NOINDEX_GROUPS = new Set(["conversion", "app"]);
// Drift rules an owner may approve for one exact new value. Contract rules (status, noindex, robots, sitemap, soft 404, leaks) are never
// approvable: an intended change of those is written in the manifest itself, where the pull request shows it.
export const APPROVABLE = new Set(["title-changed", "description-changed", "h1-changed", "canonical-changed", "content-reduced", "content-removed",
  "links-reduced", "critical-link-removed", "faq-reduced", "jsonld-removed", "lang-changed", "scripts-added", "headings-removed", "weight-regression"]);
const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 16);
const pct = (n) => `${Math.round(n * 100)} %`;

/* ------------------------------------------------------------------ fetching */

/** fetch with a bounded timeout, a finite number of retries (network errors and 5xx) and no redirect following. */
export async function boundedFetch(url, { timeoutMs = 15000, retries = 2, headers = {}, fetchImpl = fetch, method = "GET" } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetchImpl(url, { method, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "TITAN-seo-guard/1 (+https://titan-app.fr/)", ...headers } });
      const body = method === "HEAD" ? "" : await response.text();
      const result = { ok: true, status: response.status, headers: Object.fromEntries([...response.headers].map(([k, v]) => [k.toLowerCase(), v])), body, ms: Date.now() - started, attempts: attempt + 1 };
      if (response.status >= 500 && attempt < retries) { lastError = `HTTP ${response.status}`; await new Promise((ok) => setTimeout(ok, 400 * (attempt + 1) ** 2)); continue; }
      return result;
    } catch (error) {
      lastError = error?.name === "TimeoutError" ? `timeout after ${timeoutMs} ms` : String(error?.cause?.code || error?.message || error);
      if (attempt < retries) await new Promise((ok) => setTimeout(ok, 400 * (attempt + 1) ** 2));
    }
  }
  return { ok: false, status: 0, headers: {}, body: "", error: lastError, attempts: retries + 1 };
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/* ------------------------------------------------------------------ manifest */

// A page declared once yields its address variants: "/x.html" and "/x/" must answer 301 to "/x" (variants: ["html", "slash"]).
export function expandRoutes(manifest, { variants = true } = {}) {
  const groups = manifest.groups || {};
  const out = [];
  for (const route of manifest.routes) {
    const group = groups[route.group];
    if (!group) throw new Error(`manifest: route ${route.path} has an unknown group "${route.group}"`);
    const full = { ...group, ...route, criticality: route.criticality || group.criticality || "normal" };
    out.push(full);
    if (!variants || full.pending) continue;
    for (const kind of full.variants || []) {
      const path = kind === "html" ? (full.path === "/" ? "/index.html" : `${full.path}.html`) : full.path === "/" ? null : `${full.path}/`;
      if (path) out.push({ ...groups.redirect, path, group: "redirect", location: full.path, criticality: full.criticality, variantOf: full.path, smoke: full.criticality === "critical" && kind === "html" });
    }
  }
  return out;
}

export function validateManifest(manifest) {
  const problems = [];
  const seen = new Set();
  for (const route of manifest.routes || []) {
    if (!route.path?.startsWith("/")) problems.push(`route without an absolute path: ${JSON.stringify(route)}`);
    if (seen.has(route.path)) problems.push(`route listed twice: ${route.path}`);
    seen.add(route.path);
    if (!manifest.groups?.[route.group]) problems.push(`${route.path}: unknown group ${route.group}`);
    if (route.group === "redirect" && !route.location) problems.push(`${route.path}: a redirect needs its expected location`);
    if (["gone", "blocked"].includes(route.group) && route.location) problems.push(`${route.path}: a ${route.group} route has no location`);
    if (route.exception && !(route.exception.reason && route.exception.ref)) problems.push(`${route.path}: an exception needs a reason and a reference`);
  }
  return problems;
}

/** What only the local artifact can tell: its _headers and _redirects files and the robots meta of every HTML file. */
export function inspectDist(dist) {
  const htmlFiles = readdirSync(dist).filter((f) => f.endsWith(".html")).sort();
  const htmlNoindex = Object.fromEntries(htmlFiles.map((f) => [f, robotsDirectives({ robotsMeta: extractPage(readFileSync(join(dist, f), "utf8")).robotsMeta }).noindex]));
  return { headersFile: existsSync(join(dist, "_headers")) ? readFileSync(join(dist, "_headers"), "utf8") : "", redirectsFile: existsSync(join(dist, "_redirects")), htmlFiles, htmlNoindex };
}

/* ------------------------------------------------------------------ approvals */

export function loadApprovals(file, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  const active = [];
  const expired = [];
  for (const a of file?.approvals || []) {
    const missing = ["id", "path", "rule", "to", "reason", "ref", "approvedBy"].filter((k) => a[k] === undefined || a[k] === "");
    if (missing.length) { problems.push(`approval ${a.id || "?"}: missing ${missing.join(", ")}`); continue; }
    if (/[*?]/.test(a.path)) { problems.push(`approval ${a.id}: a path pattern is not allowed (${a.path}); approve one URL at a time`); continue; }
    if (!APPROVABLE.has(a.rule)) { problems.push(`approval ${a.id}: rule ${a.rule} cannot be approved (fix it or change the manifest)`); continue; }
    if (a.expires && !/^\d{4}-\d{2}-\d{2}$/.test(a.expires)) { problems.push(`approval ${a.id}: expires must be YYYY-MM-DD`); continue; }
    (a.expires && a.expires < today ? expired : active).push(a);
  }
  return { active, expired, problems };
}

/* ------------------------------------------------------------------ observation */

const pathOf = (location, base, origin) => {
  if (!location) return null;
  try {
    const url = new URL(location, `${base}/`);
    if (url.origin === new URL(base).origin || url.origin === new URL(origin).origin) return `${url.pathname}${url.search}${url.hash}`;
    return url.href;
  } catch { return location; }
};

/** Follows a chain of redirects by hand (at most `maxHops`), detecting loops. */
export async function followChain(path, { base, origin, fetchOptions, maxHops = 5 }) {
  const hops = [];
  const seen = new Set();
  let current = path;
  for (let i = 0; i <= maxHops; i += 1) {
    if (seen.has(current)) return { hops, loop: true, final: hops.at(-1) };
    seen.add(current);
    const url = /^https?:/.test(current) ? current : `${base}${current}`;
    const response = await boundedFetch(url, fetchOptions);
    const hop = { path: current, status: response.status, location: pathOf(response.headers.location, base, origin), error: response.error, response };
    hops.push(hop);
    if (!(response.status >= 300 && response.status < 400 && hop.location)) return { hops, loop: false, final: hop };
    if (/^https?:/.test(hop.location) && !hop.location.startsWith(origin)) return { hops, loop: false, final: hop, offsite: true };
    current = hop.location.startsWith(origin) ? hop.location.slice(origin.length) || "/" : hop.location.split("#")[0];
  }
  return { hops, loop: false, final: hops.at(-1), tooLong: true };
}

export function summarizePage(html, origin) {
  const page = extractPage(html, { origin });
  return {
    title: page.title, titleCount: page.titleCount, description: page.description, canonical: page.canonical, robotsMeta: page.robotsMeta,
    lang: page.lang, hreflang: page.hreflang, h1: page.h1, h2: page.headings.filter((h) => h.level === 2 && h.inMain).map((h) => h.text),
    mainWords: page.mainWords, mainDigest: page.mainDigest, blocks: page.mainBlocks, links: page.links, linksDigest: digest(page.links),
    ctas: page.ctas, faqQuestions: page.faqQuestions, jsonLdTypes: page.jsonLdTypes, jsonLdErrors: page.jsonLdErrors, og: page.og,
    scripts: page.scripts, stylesheets: page.stylesheets, refresh: page.refresh, hasMain: page.hasMain, playStoreLinks: page.playStoreLinks,
  };
}

/* ------------------------------------------------------------------ checks */

function finding(list, severity, rule, url, assertion, expected, actual, hint, extra = {}) {
  list.push({ severity, rule, url, assertion, expected, actual, hint, ...extra });
}

// The showcase scripts, plus Netlify's Real User Monitoring snippet that the platform injects into production HTML (field metrics).
const SCRIPT_ALLOW = [/^\/js\/pwa\.js/, /^\/js\/passage\.js/, /^\/js\/ga4-consent\.js/, /^\/js\/play-store\.js/, /^\/\.netlify\/scripts\/rum$/];

/**
 * Runs the whole guard against one target.
 * @param {object} o
 * @param {string} o.base          where to fetch (emulator URL, preview URL or production origin)
 * @param {object} o.manifest      tools/seo/manifest.json
 * @param {object} [o.baseline]    tools/seo/baseline/production.json
 * @param {object} [o.approvals]   tools/seo/approvals.json
 * @param {"production"|"deploy-preview"|"branch-deploy"} [o.context]
 * @param {"full"|"smoke"} [o.scope]
 * @param {string} [o.expectCommit] the SHA validated for this publication
 * @param {object} [o.distInfo]    { headersFile, redirectsFile, htmlFiles } when the target is the local artifact
 * @param {string[]} [o.duplicateHosts] other hosts serving the same site (checked for 301 or noindex)
 */
export async function runGuard(o) {
  const started = Date.now();
  const manifest = o.manifest;
  const origin = manifest.origin.replace(/\/$/, "");
  const context = o.context || "production";
  const isPreview = context !== "production";
  const thresholds = { contentDropReview: 0.25, contentDropBlock: 0.6, linksDropReview: 0.3, minWords: 120, titleMax: 65, descriptionMin: 50, descriptionMax: 170, weightIncreaseReview: 0.3, weightIncreaseMinBytes: 30000, ...(manifest.thresholds || {}) };
  const fetchOptions = { timeoutMs: o.timeoutMs ?? 15000, retries: o.retries ?? 2, fetchImpl: o.fetchImpl };
  const findings = [];
  const add = (...args) => finding(findings, ...args);
  const allRoutes = expandRoutes(manifest);
  const routes = allRoutes.filter((r) => (o.scope === "smoke" ? r.smoke || (r.criticality === "critical" && !r.variantOf) : true));
  const byPath = new Map(allRoutes.map((r) => [r.path, r]));
  const manifestProblems = validateManifest(manifest);
  for (const p of manifestProblems) add("P0", "manifest-invalid", "tools/seo/manifest.json", "le contrat est valide", "valid", p, "Corriger l'entrée du manifeste.");
  const approvalState = loadApprovals(o.approvals, { today: o.today });
  for (const p of approvalState.problems) add("P1", "approval-invalid", "tools/seo/approvals.json", "les approbations sont complètes et précises", "valid", p, "Compléter l'approbation : id, path, rule, to, reason, ref, approvedBy.");
  for (const a of approvalState.expired) add("P2", "approval-expired", a.path, `l'approbation ${a.id} est encore valable`, `jusqu'au ${a.expires}`, "expired", "La renouveler après une nouvelle revue, ou laisser l'alerte revenir.");

  /* 1. Build provenance */
  let build = null;
  const buildInfo = await boundedFetch(`${o.base}/build-info.json`, fetchOptions);
  if (buildInfo.status === 200) { try { build = JSON.parse(buildInfo.body); } catch { build = { invalid: true }; } }
  if (o.expectCommit) {
    if (!build?.commit) add("P0", "build-unknown", "/build-info.json", "le build servi indique son commit", o.expectCommit, buildInfo.error || `HTTP ${buildInfo.status}`, "Publier un build fait par tools/build-public.mjs (il écrit build-info.json).", { inconclusive: !buildInfo.ok });
    else if (build.commit !== o.expectCommit) add("P0", "build-mismatch", "/build-info.json", "le build publié est le commit validé", o.expectCommit, build.commit, "Un autre commit que celui validé est en ligne : arrêter et comparer avant d'aller plus loin.");
  }
  if (build && !isPreview && ["deploy-preview", "branch-deploy", "dev"].includes(build.context)) add("P0", "build-context", "/build-info.json", "la production sert un build de production", "production (ou un build local)", build.context, "Un build de preview (noindex) va être, ou a été, publié sur le domaine de production.");

  /* 2. robots.txt and sitemap.xml */
  const robotsResponse = await boundedFetch(`${o.base}/robots.txt`, fetchOptions);
  const robots = robotsResponse.status === 200 ? parseRobots(robotsResponse.body) : null;
  if (!robotsResponse.ok) add("P0", "robots-unreachable", "/robots.txt", "robots.txt répond", 200, robotsResponse.error, "Échec réseau : relancer ; s'il persiste, le site est en panne.", { inconclusive: true });
  else if (robotsResponse.status !== 200) add("P0", "robots-status", "/robots.txt", "robots.txt répond 200", 200, robotsResponse.status, "Google traite un robots.txt en 5xx comme « ne rien explorer » : restaurer le fichier.");
  else {
    if (!/^text\/plain/.test(robotsResponse.headers["content-type"] || "")) add("P1", "robots-type", "/robots.txt", "robots.txt est en text/plain", "text/plain", robotsResponse.headers["content-type"], "Conserver la règle [[headers]] de /robots.txt.");
    if (!robots.sitemaps.includes(`${origin}/sitemap.xml`)) add("P1", "robots-sitemap", "/robots.txt", "robots.txt déclare le sitemap de production", `${origin}/sitemap.xml`, robots.sitemaps.join(", ") || "aucun", "Restaurer la ligne Sitemap:.");
  }
  const sitemapResponse = await boundedFetch(`${o.base}/sitemap.xml`, fetchOptions);
  const sitemap = sitemapResponse.status === 200 ? parseSitemap(sitemapResponse.body) : { valid: false, locs: [], urls: [] };
  if (!sitemapResponse.ok) add("P0", "sitemap-unreachable", "/sitemap.xml", "sitemap.xml répond", 200, sitemapResponse.error, "Échec réseau : relancer.", { inconclusive: true });
  else if (sitemapResponse.status !== 200) add("P0", "sitemap-status", "/sitemap.xml", "sitemap.xml répond 200", 200, sitemapResponse.status, "Restaurer sitemap.xml dans le build.");
  else if (!sitemap.valid) add("P0", "sitemap-invalid", "/sitemap.xml", "sitemap.xml est un urlset valide", "urlset XML valide", "invalid", "Le régénérer avec tools/build-public-site.mjs.");
  const sitemapPaths = [];
  for (const loc of sitemap.locs) {
    if (!loc.startsWith(`${origin}/`)) { add("P0", "sitemap-foreign-url", "/sitemap.xml", "chaque URL du sitemap est sur l'origine de production", origin, loc, "Une preview ou un autre hôte s'est glissé dans le sitemap."); continue; }
    sitemapPaths.push(loc.slice(origin.length) || "/");
  }
  const dupes = sitemapPaths.filter((p, i) => sitemapPaths.indexOf(p) !== i);
  if (dupes.length) add("P1", "sitemap-duplicate", "/sitemap.xml", "chaque URL n'apparaît qu'une fois", "unique", dupes.join(", "), "Retirer le <url> en double.");
  const lastmods = sitemap.urls.map((u) => u.lastmod).filter(Boolean);
  if (lastmods.some((d) => d.slice(0, 10) > (o.today || new Date().toISOString().slice(0, 10)))) add("P1", "sitemap-lastmod-future", "/sitemap.xml", "pas de lastmod dans le futur", "≤ today", lastmods.filter((d) => d > (o.today || "")).join(", "), "lastmod est la date d'un vrai changement.");
  if (lastmods.length > 3 && new Set(lastmods).size === 1) add("P2", "sitemap-lastmod-uniform", "/sitemap.xml", "lastmod suit les vrais changements", "dates propres à chaque page", `all ${lastmods[0]}`, "Utiliser la date du dernier vrai changement de chaque page, ou omettre lastmod.");
  const indexableRoutes = allRoutes.filter((r) => r.indexable);
  if (sitemapResponse.status === 200 && sitemap.valid) {
    const notIndexable = sitemapPaths.filter((p) => !byPath.get(p)?.indexable);
    const missing = indexableRoutes.filter((r) => !sitemapPaths.includes(r.path)).map((r) => r.path);
    const mismatch = (notIndexable.length + missing.length) / Math.max(1, indexableRoutes.length);
    for (const p of notIndexable) add(mismatch > 0.2 ? "P0" : "P1", "sitemap-non-indexable", p, "le sitemap ne liste que des pages canoniques indexables", "route indexable du manifeste", byPath.get(p) ? `groupe ${byPath.get(p).group}` : "route inconnue", "La retirer du sitemap, ou déclarer la page dans tools/seo/manifest.json.");
    for (const p of missing) add(mismatch > 0.2 ? "P0" : "P1", "sitemap-missing", p, "chaque page indexable est dans le sitemap", "listée", "absent", "La remettre dans sitemap.xml (tools/build-public-site.mjs).");
  }

  /* 3. Routes */
  const observed = await mapLimit(routes, o.concurrency ?? 4, async (route) => {
    const chain = await followChain(route.path, { base: o.base, origin, fetchOptions, maxHops: 5 });
    const first = chain.hops[0];
    const response = first.response;
    const final = chain.final;
    // Redirect variants only need their chain; parsing their final page again would triple the work for nothing.
    const html = route.group !== "redirect" && /text\/html/.test(final.response.headers["content-type"] || "") ? final.response.body : "";
    const page = html ? summarizePage(html, origin) : null;
    const directives = robotsDirectives({ robotsMeta: page?.robotsMeta || [], xRobotsTag: final.response.headers["x-robots-tag"] });
    return { route, chain, response, final, page, directives, firstHeaders: response.headers };
  });
  const statusByPath = new Map(observed.map((ob) => [ob.route.path, ob.response.status]));
  for (const ob of observed) ob._ctaStatus = Object.fromEntries((ob.route.ctas || []).filter((c) => statusByPath.has(c)).map((c) => [c, statusByPath.get(c)]));
  const observations = {};
  for (const ob of observed) {
    const { route, chain, response, final, page, directives } = ob;
    const url = route.path;
    observations[url] = {
      group: route.group, status: response.status, location: chain.hops[0].location, finalPath: final.path, finalStatus: final.status,
      hops: chain.hops.length - 1, contentType: final.response.headers["content-type"] || null, xRobotsTag: final.response.headers["x-robots-tag"] || null,
      cacheControl: final.response.headers["cache-control"] || null, noindex: directives.noindex, ms: response.ms, attempts: response.attempts,
      ...(page ? { title: page.title, description: page.description, canonical: page.canonical, h1: page.h1, mainWords: page.mainWords, mainDigest: page.mainDigest, links: page.links.length, faqQuestions: page.faqQuestions, jsonLdTypes: page.jsonLdTypes, lang: page.lang } : {}),
    };
    const failedHop = chain.hops.find((h) => !h.response.ok);
    if (failedHop) { add(route.criticality === "critical" ? "P0" : "P1", "unreachable", url, "la route répond", route.status ?? "une réponse", `${failedHop.path}: ${failedHop.response.error}`, "Échec réseau ou d'infrastructure après les nouvelles tentatives bornées : relancer ; un échec persistant est une panne.", { inconclusive: true }); continue; }
    if (chain.loop) { add("P0", "redirect-loop", url, "pas de boucle de redirection", "une page finale", chain.hops.map((h) => `${h.status} ${h.path}`).join(" → "), "Corriger les règles [[redirects]] qui se renvoient l'une à l'autre."); continue; }
    if (chain.tooLong) { add("P0", "redirect-chain", url, "une redirection aboutit", "≤ 5 sauts", chain.hops.length, "Pointer l'ancienne URL directement vers sa page finale."); continue; }
    if (response.status >= 500) { add("P0", "server-error", url, "aucune erreur serveur", route.status ?? 200, response.status, "Un 5xx sur une URL publique fait ralentir puis abandonner l'exploration : corriger ou revenir en arrière."); continue; }
    const g = route.group;
    if (INDEXABLE_GROUPS.has(g)) checkIndexable(ob, { add, origin, isPreview, robots, sitemapPaths, thresholds, byPath, sitemapOk: sitemap.valid });
    else if (NOINDEX_GROUPS.has(g)) checkNoindexRoute(ob, { add, robots, sitemapPaths, isPreview });
    else if (g === "redirect") checkRedirect(ob, { add, byPath });
    else if (g === "blocked" || g === "gone" || g === "missing") checkAbsent(ob, { add });
    else if (g === "technical") checkTechnical(ob, { add });
  }

  /* 3b. Assets of the public pages: served, with the right MIME type, versioned by the build digest (rev=) so that a returning visitor
     never mixes two builds, and the page weight (HTML + first-party CSS/JS, uncompressed) for a reproducible performance budget. */
  const assets = new Map();
  for (const ob of observed) {
    if (!ob.route.indexable || !ob.page) continue;
    for (const [list, kind] of [[ob.page.scripts, "js"], [ob.page.stylesheets, "css"]]) {
      for (const src of list) {
        if (!src.startsWith("/") || src.startsWith("//") || src.startsWith("/.netlify/")) continue;
        if (!assets.has(src)) assets.set(src, { kind, pages: [] });
        assets.get(src).pages.push(ob.route.path);
      }
    }
  }
  const assetResults = new Map();
  await mapLimit([...assets.keys()], o.concurrency ?? 4, async (src) => {
    const r = await boundedFetch(`${o.base}${src}`, fetchOptions);
    assetResults.set(src, { status: r.status, type: r.headers["content-type"] || "", bytes: Buffer.byteLength(r.body || ""), cache: r.headers["cache-control"] || "", error: r.error });
  });
  for (const [src, meta] of assets) {
    const r = assetResults.get(src);
    const where = `${src.split("?")[0]} (${meta.pages.length} page${meta.pages.length > 1 ? "s" : ""})`;
    if (!r.status) { add("P1", "asset-unreachable", where, "le fichier répond", 200, r.error, "Échec réseau après les nouvelles tentatives.", { inconclusive: true }); continue; }
    if (r.status !== 200) { add("P0", "asset-missing", where, `un fichier ${meta.kind.toUpperCase()} des pages publiques est servi`, 200, r.status, "Les pages s'afficheraient sans leurs styles ou scripts : un fichier manque au build."); continue; }
    const typeOk = meta.kind === "css" ? /text\/css/.test(r.type) : /javascript/.test(r.type);
    if (!typeOk) add("P1", "asset-type", where, "le type MIME", meta.kind === "css" ? "text/css" : "application/javascript", r.type, "Avec nosniff, un mauvais type fait refuser le fichier par le navigateur.");
    if (!/[?&]rev=[0-9a-f]{12}/.test(src) && !/no-cache|max-age=0\b/.test(r.cache)) add("P2", "asset-unversioned", where, "un fichier mis en cache porte l'empreinte du build", "?rev=<digest>", src, "tools/build-public.mjs marque chaque script et feuille de style nommés par une page.");
  }
  for (const ob of observed) {
    if (!ob.route.indexable || !ob.page) continue;
    const own = [...ob.page.scripts, ...ob.page.stylesheets].filter((src) => assetResults.has(src));
    ob.weight = Buffer.byteLength(ob.final.response.body || "") + own.reduce((sum, src) => sum + (assetResults.get(src)?.bytes || 0), 0);
    ob.assetList = own.map((src) => src.split("?")[0]).sort();
    observations[ob.route.path].weight = ob.weight;
  }

  /* 4. Preview isolation: every HTML answer of a preview carries noindex; canonicals never name the preview host. */
  if (isPreview) {
    for (const ob of observed) {
      if (!ob.page || ob.final.status !== 200) continue;
      if (!robotsDirectives({ xRobotsTag: ob.final.response.headers["x-robots-tag"] }).noindex) add("P0", "preview-indexable", ob.route.path, "une preview répond X-Robots-Tag: noindex", "noindex", ob.final.response.headers["x-robots-tag"] || "absent", "Netlify l'ajoute aux Deploy Previews ; tools/build-public.mjs écrit dist/_headers pour les autres contextes hors production.");
    }
    if (robots && !isAllowed(robots, "/").allowed) add("P1", "preview-robots-block", "/robots.txt", "les previews gardent le robots.txt de production (le noindex doit rester lisible)", "Allow", "Disallow: /", "Ne pas bloquer une preview dans robots.txt : Google ne pourrait plus lire son noindex.");
  }

  /* 5. Local artifact: a noindex file or a stray _redirects can never reach production. */
  if (o.distInfo) {
    const h = o.distInfo.headersFile || "";
    if (!isPreview && /x-robots-tag\s*:\s*[^\n]*noindex/i.test(h)) add("P0", "noindex-propagation", "dist/_headers", "un build de production ne porte aucun noindex global", "pas de _headers noindex", "noindex présent", "Le noindex de preview a fui dans un build de production : vérifier CONTEXT dans tools/build-public.mjs.");
    if (isPreview && !/x-robots-tag\s*:\s*[^\n]*noindex/i.test(h)) add("P1", "preview-headers-missing", "dist/_headers", "un build hors production écrit un _headers noindex", "noindex", "absent", "tools/build-public.mjs écrit dist/_headers quand CONTEXT n'est pas la production.");
    if (o.distInfo.redirectsFile) add("P1", "redirects-file", "dist/_redirects", "le routage vit dans netlify.toml seulement", "absent", "présent", "Le _redirects de la racine est une copie périmée : Netlify l'appliquerait AVANT netlify.toml.");
    const known = new Set(allRoutes.map((r) => r.path));
    for (const f of o.distInfo.htmlFiles || []) {
      const p = f === "index.html" ? "/" : `/${f.replace(/\.html$/, "")}`;
      if (known.has(p) || known.has(`/${f}`)) continue;
      const ob = o.distInfo.htmlNoindex?.[f];
      if (ob === false) add("P1", "route-unclassified", p, "chaque page indexable est déclarée dans le manifeste", "une entrée du manifeste", "page indexable hors contrat", "La déclarer (groupe et attentes) dans tools/seo/manifest.json, et dans le sitemap si elle est publique.");
      else add("P2", "route-unclassified", p, "chaque page est déclarée dans le manifeste", "une entrée du manifeste", "page noindex hors contrat", "L'ajouter à tools/seo/manifest.json (groupe app) pour garder l'inventaire complet.");
    }
  }

  /* 6. Duplicate hosts (production only): 301 to the production origin, or noindex. */
  for (const host of o.duplicateHosts || []) {
    const r = await boundedFetch(`https://${host}/`, fetchOptions);
    if (!r.ok) { add("P2", "duplicate-host-unreachable", `https://${host}/`, "l'hôte en double a été contrôlé", "une réponse", r.error, "Relancer depuis un réseau qui l'atteint.", { inconclusive: true }); continue; }
    const loc = r.headers.location || "";
    if (r.status >= 300 && r.status < 400 && loc.startsWith(origin)) continue;
    const page = r.status === 200 && /text\/html/.test(r.headers["content-type"] || "") ? summarizePage(r.body, origin) : null;
    const noindex = robotsDirectives({ robotsMeta: page?.robotsMeta || [], xRobotsTag: r.headers["x-robots-tag"] }).noindex;
    if (noindex) continue;
    const canonicalOk = page?.canonical?.[0] === `${origin}/`;
    add(canonicalOk ? "P1" : "P0", "duplicate-host-indexable", `https://${host}/`, "un hôte en double redirige vers l'origine de production ou dit noindex", `301 → ${origin}/`, `${r.status}, ${canonicalOk ? "canonique vers la production" : `canonique ${page?.canonical?.[0] || "absente"}`}`, "Ajouter la 301 de domaine dans netlify.toml (voir docs/seo/SEO_GUARD.md).");
  }

  /* 7. Drift against the production reference, then approvals. */
  if (o.baseline) compareBaseline({ observed, baseline: o.baseline, add, thresholds, byPath, origin, scope: o.scope });
  const used = new Set();
  for (const f of findings) {
    if (!APPROVABLE.has(f.rule)) continue;
    const a = approvalState.active.find((x) => x.path === f.url && x.rule === f.rule && String(x.to) === String(f.value));
    if (a) { f.approved = a.id; used.add(a.id); }
  }
  if (o.scope !== "smoke") for (const a of approvalState.active) if (!used.has(a.id)) add("P2", "approval-unused", a.path, `l'approbation ${a.id} correspond encore à un changement`, `${a.rule} = ${a.to}`, "plus de changement correspondant", "Le changement approuvé est en ligne et dans la référence, ou a été annulé : retirer l'approbation.");

  const open = findings.filter((f) => !f.approved);
  const count = (s) => open.filter((f) => f.severity === s && !f.inconclusive).length;
  const inconclusive = open.filter((f) => f.inconclusive && f.severity !== "P2").length;
  const summary = { P0: count("P0"), P1: count("P1"), P2: count("P2"), approved: findings.length - open.length, inconclusive, routes: routes.length };
  const failOn = o.failOn || "p1";
  summary.verdict = summary.P0 || (failOn === "p1" && summary.P1) ? "FAIL" : inconclusive ? "INCONCLUSIVE" : "PASS";
  const severityOrder = { P0: 0, P1: 1, P2: 2 };
  findings.sort((a, b) => (a.approved ? 1 : 0) - (b.approved ? 1 : 0) || severityOrder[a.severity] - severityOrder[b.severity] || a.url.localeCompare(b.url));
  return {
    tool: "seo-guard", version: 1, context, scope: o.scope || "full", target: o.targetLabel || o.base, origin, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started,
    build, baseline: o.baseline ? { capturedAt: o.baseline.capturedAt, commit: o.baseline.commit, deployId: o.baseline.deployId } : null,
    summary, findings, observations, sitemap: { count: sitemapPaths.length }, _observed: observed,
  };
}

function checkIndexable(ob, { add, origin, isPreview, robots, sitemapPaths, thresholds, byPath, sitemapOk }) {
  const { route, response, final, page, directives } = ob;
  const url = route.path;
  const critical = route.criticality === "critical";
  if (response.status !== 200) {
    if (response.status === 404 || response.status === 410) add("P0", "page-unavailable", url, "une page publique répond 200 sans redirection", 200, response.status, "La page a disparu du build : la restaurer, ou la déplacer avec une 301 approuvée dans netlify.toml ET le manifeste.");
    else if (response.status >= 300 && response.status < 400) add("P0", "page-redirected", url, "une page publique répond 200 sans redirection", 200, `${response.status} → ${ob.chain.hops[0].location}`, "Une URL indexable redirige désormais : déclarer la redirection dans le manifeste (groupe redirect) si c'est voulu.");
    else add("P0", "page-status", url, "une page publique répond 200", 200, response.status, "Corriger la route.");
    return;
  }
  if (!/text\/html/.test(final.response.headers["content-type"] || "")) { add("P0", "page-type", url, "une page publique est du HTML", "text/html", final.response.headers["content-type"], "Vérifier les règles [[headers]]."); return; }
  if (!page) return;
  if (!isPreview && directives.noindex) add("P0", "noindex-unexpected", url, "une page publique est indexable", "sans noindex", `meta=${page.robotsMeta.join(" | ") || "—"} header=${final.response.headers["x-robots-tag"] || "—"}`, "Retirer le noindex (meta robots de la page ou X-Robots-Tag de netlify.toml).");
  if (robots && !isAllowed(robots, url).allowed) add("P0", "robots-disallowed", url, "robots.txt laisse Google explorer une page publique", "autorisé", isAllowed(robots, url).rule, "Retirer ou restreindre la règle Disallow.");
  const expectedCanonical = `${origin}${url === "/" ? "/" : url}`;
  if (page.canonical.length !== 1) add(page.canonical.length ? "P1" : "P0", "canonical-count", url, "une seule canonique", 1, page.canonical.length, "Garder une seule <link rel=\"canonical\">.");
  if (page.canonical[0] && page.canonical[0] !== expectedCanonical) {
    const offsite = !page.canonical[0].startsWith(`${origin}/`);
    add(offsite || critical ? "P0" : "P1", "canonical-mismatch", url, "la canonique nomme cette page sur l'origine de production", expectedCanonical, page.canonical[0], offsite ? "La canonique vise un autre hôte (preview ?) : elle doit être une URL absolue de production, jamais construite depuis l'hôte de la requête." : "Pointer la canonique vers la page elle-même.");
  }
  if (sitemapOk && !sitemapPaths.includes(url)) { /* reported by the sitemap section */ }
  if (!page.title) add("P1", "title-missing", url, "un titre", "non vide", "absent", "Restaurer <title>.");
  else if (page.title.length > thresholds.titleMax) add("P2", "title-long", url, `titre ≤ ${thresholds.titleMax} caractères (coupé dans les résultats)`, `≤ ${thresholds.titleMax}`, page.title.length, "Éditorial : placer les mots distinctifs en premier.");
  if (page.titleCount > 1) add("P1", "title-count", url, "un seul titre", 1, page.titleCount, "Retirer le <title> en trop.");
  if (!page.description) add("P2", "description-missing", url, "une meta description", "présent", "absent", "Éditorial.");
  else if (page.description.length < thresholds.descriptionMin || page.description.length > thresholds.descriptionMax) add("P2", "description-length", url, `description ${thresholds.descriptionMin}–${thresholds.descriptionMax} characters`, `${thresholds.descriptionMin}–${thresholds.descriptionMax}`, page.description.length, "Éditorial, jamais bloquant.");
  if (page.h1.length !== 1) add(page.h1.length ? "P2" : "P1", "h1-count", url, "un seul H1", 1, page.h1.length, "Éditorial, sauf si la page n'en a aucun.");
  if (!page.hasMain) add("P1", "main-missing", url, "le contenu est dans <main>", "<main>", "absent", "Le bouclier mesure le contenu dans <main>.");
  const floor = route.minWords ?? thresholds.minWords;
  if (NOT_FOUND_TITLE.test(page.title || "") || page.mainWords < Math.min(40, floor)) add("P0", "soft-404", url, "une page en 200 a un vrai contenu", `≥ ${floor} mots, pas une page 404`, `${page.mainWords} mots, titre « ${page.title} »`, "Une page absente répond 200 (soft 404) : la restaurer ou répondre 404.");
  else if (page.mainWords < floor) add("P1", "content-thin", url, `contenu principal ≥ ${floor} mots`, floor, page.mainWords, "La page a perdu l'essentiel de son texte.");
  if (page.refresh) add("P1", "meta-refresh", url, "pas de meta refresh", "aucun", page.refresh, "Utiliser plutôt une 301 dans netlify.toml.");
  if (page.jsonLdErrors) add("P2", "jsonld-invalid", url, "les données structurées se lisent", 0, page.jsonLdErrors, "Corriger le bloc JSON-LD.");
  if (page.og?.url && page.og.url !== expectedCanonical) add("P2", "og-url", url, "og:url égale la canonique", expectedCanonical, page.og.url, "Métadonnées de partage.");
  if (page.lang !== (route.lang || "fr")) add("P1", "lang", url, "la langue de la page", route.lang || "fr", page.lang || "absent", "Conserver <html lang>.");
  for (const alt of page.hreflang) if (!String(alt.href).startsWith(`${origin}/`)) add("P1", "hreflang-foreign", url, "hreflang vise l'origine de production", origin, alt.href, "Ne jamais pointer hreflang vers une preview.");
  // Compared without the query string: ?v= and the build digest (rev=) change with every edit, the script itself does not.
  const odd = page.scripts.map((src) => src.split("?")[0]).filter((src) => /^\//.test(src) && !SCRIPT_ALLOW.some((re) => re.test(src)) && !(route.allowScripts || []).includes(src));
  if (odd.length) add("P1", "scripts-added", url, "les pages publiques ne chargent que les scripts de la vitrine", "pwa.js, passage.js, ga4-consent.js, play-store.js", odd.join(", "), "Un bundle applicatif, un SDK ou une carte sur une page publique ralentit chaque visite venue de Google : le charger depuis les pages de l'application seulement.", { value: digest(odd) });
  for (const cta of route.ctas || []) {
    const found = page.ctas.some((c) => c.href === cta) || page.links.includes(cta);
    if (!found) add("P1", "cta-missing", url, `le bouton vers ${cta} est présent`, cta, page.ctas.map((c) => c.href).join(", ") || "aucun", "Restaurer le bouton.");
    const target = byPath.get(cta);
    if (target && ob._ctaStatus?.[cta] && ob._ctaStatus[cta] !== 200) add("P0", "cta-broken", url, `${cta} répond`, 200, ob._ctaStatus[cta], "Le parcours principal est cassé.");
  }
  for (const link of page.links) {
    const target = byPath.get(link);
    if (target && ["gone", "missing", "blocked"].includes(target.group)) add("P1", "link-to-dead", url, "les liens internes mènent à des pages vivantes", "une page vivante", `${link} (${target.group})`, "Mettre le lien à jour.");
    if (target?.group === "redirect") add("P2", "link-to-redirect", url, "les liens internes visent les URL finales", target.location, link, "Lier directement l'URL finale (évite une 301).");
  }
}

function checkNoindexRoute(ob, { add, robots, sitemapPaths, isPreview }) {
  const { route, response, directives } = ob;
  if (response.status !== (route.status ?? 200)) { add(route.criticality === "critical" ? "P0" : "P1", "route-status", route.path, "la route répond", route.status ?? 200, response.status, "Vérifier la réécriture dans netlify.toml."); return; }
  if (!directives.noindex && !isPreview) add("P1", "noindex-missing", route.path, "un écran privé ou de compte dit noindex", "noindex", "indexable", "Ajouter <meta name=\"robots\" content=\"noindex\"> ou une règle X-Robots-Tag. noindex n'est pas une protection : l'accès reste contrôlé côté serveur.");
  if (sitemapPaths.includes(route.path)) add("P0", "sitemap-private", route.path, "les écrans privés et de compte restent hors du sitemap", "absent", "listée", "La retirer de sitemap.xml.");
  if (robots && !isAllowed(robots, route.path).allowed) add("P2", "noindex-unreadable", route.path, "Google peut lire le noindex", "autorisé", isAllowed(robots, route.path).rule, "Un Disallow empêche Google de lire le noindex.");
}

function checkRedirect(ob, { add, byPath }) {
  const { route, response, chain } = ob;
  const expected = route.location;
  if (response.status === 404 || response.status === 410) { add("P0", "redirect-missing", route.path, "une URL historique garde sa redirection", `301 → ${expected}`, response.status, "La règle [[redirects]] a disparu : la restaurer."); return; }
  if (![301, 308].includes(response.status)) { add(response.status >= 300 && response.status < 400 ? "P1" : "P0", "redirect-status", route.path, "une redirection permanente", "301", response.status, response.status === 200 ? "L'ancienne URL répond désormais 200 (doublon)." : "Utiliser une 301 pour un déplacement définitif."); return; }
  if (chain.hops[0].location !== expected) add("P1", "redirect-target", route.path, "la cible de la redirection", expected, chain.hops[0].location, "Mettre le manifeste à jour si le déplacement est voulu.");
  if (chain.hops.length - 1 > 1) add("P1", "redirect-hops", route.path, "un seul saut", 1, chain.hops.length - 1, "Pointer l'ancienne URL directement vers la page finale.");
  if (chain.final.status !== 200) add("P0", "redirect-dead-end", route.path, "la redirection aboutit sur une page vivante", 200, `${chain.final.status} ${chain.final.path}`, "Corriger la cible.");
  const target = byPath.get(String(expected).split("#")[0]);
  if (!target && !String(expected).startsWith("http")) add("P2", "redirect-target-unknown", route.path, "la cible est déclarée dans le manifeste", "une route du manifeste", expected, "Déclarer la cible.");
}

function checkAbsent(ob, { add }) {
  const { route, response, page } = ob;
  const allowed = route.group === "gone" ? [404, 410] : [404, 403, 410];
  if (allowed.includes(response.status)) return;
  if (response.status === 200) add("P0", route.group === "blocked" ? "file-exposed" : "soft-404", route.path, route.group === "blocked" ? "un fichier interne n'est jamais publié" : "une URL inconnue répond 404", allowed.join("/"), `200${page?.title ? ` « ${page.title} »` : ""}`, route.group === "blocked" ? "Le retirer de dist/ et garder la règle 404." : "Une règle de repli répond 200 aux URL inconnues (soft 404) : garder la règle finale /* → /404.html 404.");
  else if (response.status >= 300 && response.status < 400) add("P1", "absent-redirected", route.path, "une URL absente n'est pas envoyée vers une autre page", allowed.join("/"), `${response.status} → ${ob.chain.hops[0].location}`, "Ne pas rediriger une page absente vers l'accueil (Google y voit un soft 404).");
  else add("P1", "absent-status", route.path, "une URL absente répond 404/410", allowed.join("/"), response.status, "Vérifier la règle finale /* → /404.html.");
}

function checkTechnical(ob, { add }) {
  const { route, response, final } = ob;
  if (route.pending && response.status === 404) { add("P2", "pending-route", route.path, "un fichier introduit par un changement non publié", route.status ?? 200, 404, `Attendu jusqu'à sa première publication (${route.pending.ref}) ; retirer ensuite « pending » du manifeste.`); return; }
  if (response.status !== (route.status ?? 200)) { add(route.criticality === "critical" ? "P0" : "P1", "technical-status", route.path, "le fichier technique est servi", route.status ?? 200, response.status, "Le restaurer dans tools/build-public.mjs."); return; }
  if (route.contentType && !new RegExp(route.contentType, "i").test(final.response.headers["content-type"] || "")) add("P1", "technical-type", route.path, "le type MIME", route.contentType, final.response.headers["content-type"], "Vérifier les règles [[headers]].");
  if (route.cache === "revalidate" && !/no-cache|max-age=0/.test(final.response.headers["cache-control"] || "")) add("P1", "technical-cache", route.path, "jamais mis en cache longtemps (deux versions pourraient se mélanger)", "no-cache ou max-age=0", final.response.headers["cache-control"], "Conserver la règle Cache-Control.");
}

/* ------------------------------------------------------------------ baseline drift */

function compareBaseline({ observed, baseline, add, thresholds, byPath, origin, scope }) {
  const now = new Map(observed.map((ob) => [ob.route.path, ob]));
  for (const [path, before] of Object.entries(baseline.pages || {})) {
    const route = byPath.get(path);
    if (!route) { add("P0", "route-dropped", path, "une page de la référence reste dans le contrat", "une entrée du manifeste (page, redirection ou supprimée)", "absente du manifeste", "Conserver l'URL, ou déclarer sa 301 ou son 410 dans le manifeste avec un motif."); continue; }
    if (!route.indexable) continue; // its new contract (redirect, gone…) is checked above
    const ob = now.get(path);
    if (!ob || !ob.page) { if (scope !== "smoke" && ob) { /* status findings already raised */ } continue; }
    const p = ob.page;
    const cmp = (rule, sev, field, current, assertion, hint) => {
      if (before[field] === undefined || JSON.stringify(before[field]) === JSON.stringify(current)) return;
      add(sev, rule, path, assertion, before[field], current, hint, { value: typeof current === "string" ? current : digest(current) });
    };
    cmp("title-changed", "P1", "title", p.title, "le titre d'une page stratégique est inchangé", "Voulu ? Approuver ce titre exact dans tools/seo/approvals.json.");
    cmp("canonical-changed", "P1", "canonical", p.canonical[0] ?? null, "la canonique est inchangée", "Approuver si la page a vraiment déménagé.");
    cmp("h1-changed", "P2", "h1", p.h1[0] ?? null, "le H1 est inchangé", "Changement éditorial.");
    cmp("description-changed", "P2", "description", p.description, "la description est inchangée", "Changement éditorial.");
    cmp("lang-changed", "P1", "lang", p.lang, "la langue de la page est inchangée", "N'approuver qu'avec un plan de traduction (hreflang).");
    if (before.mainWords) {
      const drop = (before.mainWords - p.mainWords) / before.mainWords;
      if (drop > thresholds.contentDropBlock) add("P0", "content-removed", path, `le contenu principal garde l'essentiel de son texte (baisse ≤ ${pct(thresholds.contentDropBlock)})`, before.mainWords, `${p.mainWords} mots (−${pct(drop)})`, "L'essentiel du texte qui répondait aux recherches a disparu. Si c'est voulu, approuver ce contenu exact.", { value: p.mainDigest, removedBlocks: removedBlocks(before.blocks, p.blocks) });
      else if (drop > thresholds.contentDropReview) add("P1", "content-reduced", path, `le contenu principal ne diminue pas de plus de ${pct(thresholds.contentDropReview)}`, before.mainWords, `${p.mainWords} mots (−${pct(drop)})`, "Relire les blocs retirés ; approuver ce contenu exact si c'est voulu.", { value: p.mainDigest, removedBlocks: removedBlocks(before.blocks, p.blocks) });
      else if (before.mainDigest !== p.mainDigest) add("P2", "content-edited", path, "les modifications du contenu principal sont visibles", before.mainDigest, p.mainDigest, "Information : texte modifié sans perte significative.", { removedBlocks: removedBlocks(before.blocks, p.blocks).slice(0, 5), addedBlocks: removedBlocks(p.blocks, before.blocks).slice(0, 5) });
    }
    if (before.links?.length) {
      const lost = before.links.filter((l) => !p.links.includes(l));
      const criticalLost = lost.filter((l) => byPath.get(l)?.criticality === "critical" && byPath.get(l)?.indexable);
      if (lost.length / before.links.length > thresholds.linksDropReview) add("P1", "links-reduced", path, `les liens internes ne baissent pas de plus de ${pct(thresholds.linksDropReview)}`, before.links.length, `${p.links.length} (lost: ${lost.join(", ")})`, "Les liens internes répartissent l'exploration : approuver si c'est voulu.", { value: p.linksDigest });
      else if (criticalLost.length) add("P1", "critical-link-removed", path, "les liens vers les pages publiques critiques sont conservés", "kept", criticalLost.join(", "), "Restaurer le lien ou approuver.", { value: p.linksDigest });
    }
    if ((before.faqQuestions || 0) > p.faqQuestions) add("P1", "faq-reduced", path, "les questions de la FAQ sont conservées", before.faqQuestions, p.faqQuestions, "Les questions répondent à des recherches : approuver si c'est voulu.", { value: String(p.faqQuestions) });
    if (before.weight && ob.weight && ob.weight > before.weight * (1 + thresholds.weightIncreaseReview) && ob.weight - before.weight > thresholds.weightIncreaseMinBytes) add("P1", "weight-regression", path, `le poids de la page (HTML + CSS + JS) augmente de ≤ ${pct(thresholds.weightIncreaseReview)}`, `${Math.round(before.weight / 1024)} KB`, `${Math.round(ob.weight / 1024)} KB (${ob.assetList.join(", ")})`, "Une vitrine plus lourde ralentit chaque visite venue de Google : garder le code applicatif hors des pages publiques, ou approuver.", { value: digest(ob.assetList) });
    const lostTypes = (before.jsonLdTypes || []).filter((t) => !p.jsonLdTypes.includes(t));
    if (lostTypes.length) add("P2", "jsonld-removed", path, "les types de données structurées sont conservés", before.jsonLdTypes.join(", "), p.jsonLdTypes.join(", "), "Informative.", { value: p.jsonLdTypes.join(",") });
    const lostH2 = (before.h2 || []).filter((h) => !p.h2.includes(h));
    if (lostH2.length && lostH2.length >= Math.max(2, (before.h2 || []).length / 2)) add("P2", "headings-removed", path, "les intertitres sont conservés", (before.h2 || []).length, `${p.h2.length} (removed: ${lostH2.slice(0, 4).join(" | ")})`, "Informative.", { value: digest(p.h2) });
  }
  for (const ob of observed) if (ob.route.indexable && !baseline.pages?.[ob.route.path] && ob.page) add("P2", "new-route", ob.route.path, "les nouvelles pages publiques sont visibles en revue", "—", `${ob.page.mainWords} mots, « ${ob.page.title} »`, "Information : rafraîchir la référence après sa publication.");
  void origin;
}

export function removedBlocks(before = [], after = []) {
  const now = new Set(after);
  return before.filter((b) => !now.has(b) && b.split(/\s+/).length >= 4).slice(0, 12);
}

/** The reference kept for drift checks: indexable pages only, without anything private or ephemeral. */
export function toBaseline(report, { reason, commit, deployId, capturedAt = new Date().toISOString() }) {
  const pages = {};
  for (const ob of report._observed) {
    if (!ob.route.indexable || !ob.page || ob.response.status !== 200) continue;
    const p = ob.page;
    pages[ob.route.path] = { weight: ob.weight ?? null, title: p.title, description: p.description, canonical: p.canonical[0] ?? null, h1: p.h1[0] ?? null, lang: p.lang, h2: p.h2, mainWords: p.mainWords, mainDigest: p.mainDigest, links: p.links, faqQuestions: p.faqQuestions, jsonLdTypes: p.jsonLdTypes, ctas: p.ctas.map((c) => c.href), blocks: p.blocks };
  }
  const routes = {};
  for (const [path, o] of Object.entries(report.observations)) routes[path] = { group: o.group, status: o.status, location: o.location ?? null, noindex: o.noindex };
  return { tool: "seo-guard", version: 1, origin: report.origin, capturedAt, commit, deployId, reason, sitemapCount: report.sitemap.count, pages, routes };
}

/* ------------------------------------------------------------------ report */

export function toMarkdown(report) {
  const s = report.summary;
  const lines = [];
  lines.push(`## Bouclier SEO — ${s.verdict}`);
  lines.push("");
  lines.push(`Cible : \`${report.target}\` · contexte \`${report.context}\` · périmètre \`${report.scope}\` · ${s.routes} routes · ${Math.round(report.durationMs / 100) / 10} s`);
  if (report.build) lines.push(`Build servi : commit \`${report.build.commit || "?"}\`, contexte \`${report.build.context || "?"}\`${report.build.deployId ? `, déploiement \`${report.build.deployId}\`` : ""}`);
  if (report.baseline) lines.push(`Référence : production du ${report.baseline.capturedAt?.slice(0, 10)} (commit \`${report.baseline.commit?.slice(0, 7)}\`, déploiement \`${report.baseline.deployId}\`)`);
  lines.push("");
  lines.push(`| P0 bloquant | P1 à approuver | P2 avertissement | approuvés | non concluants |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(`| ${s.P0} | ${s.P1} | ${s.P2} | ${s.approved} | ${s.inconclusive} |`);
  const rows = report.findings.filter((f) => f.severity !== "P2" || f.approved);
  const warn = report.findings.filter((f) => f.severity === "P2" && !f.approved);
  const esc = (v) => String(typeof v === "object" ? JSON.stringify(v) : v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160);
  if (rows.length) {
    lines.push("", "| Gravité | Règle | URL | Attendu | Obtenu | Piste |", "|---|---|---|---|---|---|");
    for (const f of rows) lines.push(`| ${f.approved ? `~~${f.severity}~~ approuvé (${f.approved})` : `**${f.severity}**${f.inconclusive ? " non concluant" : ""}`} | ${f.rule} | \`${f.url}\` | ${esc(f.expected)} | ${esc(f.actual)} | ${esc(f.hint)} |`);
    const approvable = rows.filter((f) => !f.approved && f.value !== undefined && APPROVABLE.has(f.rule));
    if (approvable.length) {
      lines.push("", "Changement voulu ? Ajouter une approbation précise dans `tools/seo/approvals.json` :", "", "```json");
      for (const f of approvable.slice(0, 6)) lines.push(JSON.stringify({ id: `AAAA-MM-JJ-${f.rule}`, path: f.url, rule: f.rule, to: f.value, reason: "…", ref: "PR #…", approvedBy: "…", expires: "AAAA-MM-JJ" }));
      lines.push("```");
    }
  }
  if (warn.length) {
    lines.push("", `<details><summary>${warn.length} avertissement(s) P2</summary>`, "", "| Règle | URL | Attendu | Obtenu |", "|---|---|---|---|");
    for (const f of warn) lines.push(`| ${f.rule} | \`${f.url}\` | ${esc(f.expected)} | ${esc(f.actual)} |`);
    lines.push("", "</details>");
  }
  return `${lines.join("\n")}\n`;
}
