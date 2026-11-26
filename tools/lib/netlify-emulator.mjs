// Serves a built dist/ the way Netlify serves this site, from the SAME netlify.toml (and an optional dist/_headers), so the SEO guard can
// test the artifact before it is published: statuses, redirects, rewrites and X-Robots-Tag come from the real rules, not from a copy.
// Behaviour measured on titan-app.fr on 26/11/2026 (see docs/seo/SEO_GUARD.md, "Fidélité de l'émulateur"):
// - rules are read top to bottom, the first match wins; a rule without force is skipped when a file answers the path (shadowing);
// - "/x" serves x.html (pretty URLs) and "/x/" answers 301 to "/x" when that page exists;
// - header rules match the REQUESTED path only (/athlete serves athlete.html without the /athlete.html headers);
// - a redirect (3xx) carries none of the header rules, and its Location is the "to" value as written (relative here);
// - rule paths are case-sensitive (/Tarifs → 404). Netlify's own case folding of existing files (/Fonctionnalites → 301) is NOT emulated:
//   it is a platform behaviour, checked on the live site only.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const unquote = (raw) => {
  const value = raw.trim();
  if (value.startsWith('"')) return JSON.parse(value.replace(/^("(?:[^"\\]|\\.)*").*$/, "$1"));
  if (value.startsWith("'")) return value.replace(/^'([^']*)'.*$/, "$1");
  const bare = value.replace(/\s+#.*$/, "");
  if (bare === "true" || bare === "false") return bare === "true";
  if (/^-?\d+$/.test(bare)) return Number(bare);
  return bare;
};

/** The [[redirects]] and [[headers]] tables of a netlify.toml (the only parts that shape responses). */
export function parseNetlifyToml(text) {
  const redirects = [];
  const headers = [];
  let target = null;
  let lineNo = 0;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    lineNo += 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      if (line === "[[redirects]]") { target = { line: lineNo, force: false, status: 301 }; redirects.push(target); continue; }
      if (line === "[[headers]]") { target = { line: lineNo, for: null, values: {}, _section: "headers" }; headers.push(target); continue; }
      if (line === "[headers.values]" && headers.length) { target = headers.at(-1).values; continue; }
      target = null;
      continue;
    }
    if (!target) continue;
    const m = /^("[^"]+"|'[^']+'|[A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const key = unquote(m[1]);
    if (m[2].trim().startsWith("{")) continue; // inline tables (conditions, query) are not used by this site
    target[key] = unquote(m[2]);
  }
  for (const h of headers) delete h._section;
  return { redirects, headers };
}

/** Netlify's plain-text _headers file (written into dist/ for non-production contexts by tools/build-public.mjs). */
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) { current = { for: raw.trim(), values: {} }; rules.push(current); continue; }
    const m = /^\s+([^:]+):\s*(.*)$/.exec(raw);
    if (m && current) current.values[m[1].trim()] = current.values[m[1].trim()] ? `${current.values[m[1].trim()]}, ${m[2].trim()}` : m[2].trim();
  }
  return rules;
}

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const stripSlash = (p) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

/** Matches a Netlify path pattern ("/u/*", "/*.md", "/news/:slug", "https://host/*") against a host and a path. */
export function matchPattern(pattern, path, host) {
  let pat = String(pattern);
  const full = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(pat);
  if (full) {
    if (!host || full[1].toLowerCase() !== String(host).toLowerCase()) return null;
    pat = full[2] || "/";
  }
  const names = [];
  const source = stripSlash(pat).split(/(\*|:[A-Za-z_][A-Za-z0-9_]*)/).map((part) => {
    if (part === "*") { names.push("splat"); return "(.*)"; }
    if (/^:[A-Za-z_]/.test(part)) { names.push(part.slice(1)); return "([^/]+)"; }
    return escapeRe(part);
  }).join("");
  const m = new RegExp(`^${source}$`).exec(stripSlash(path));
  if (!m) return null;
  return Object.fromEntries(names.map((n, i) => [n, m[i + 1] ?? ""]));
}

const TYPES = {
  ".html": "text/html; charset=UTF-8", ".css": "text/css; charset=UTF-8", ".js": "application/javascript; charset=UTF-8", ".mjs": "application/javascript; charset=UTF-8",
  ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=UTF-8", ".ico": "image/x-icon", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
  ".webmanifest": "application/manifest+json", ".gpx": "application/gpx+xml", ".pdf": "application/pdf",
};

export function createSite({ dist, netlifyToml, host = "titan-app.fr" }) {
  const root = resolve(dist);
  const config = parseNetlifyToml(netlifyToml ?? readFileSync(resolve(dist, "..", "netlify.toml"), "utf8"));
  const headersFile = existsSync(join(root, "_headers")) ? parseHeadersFile(readFileSync(join(root, "_headers"), "utf8")) : [];
  const inside = (file) => file === root || file.startsWith(root + sep);
  const isFile = (file) => inside(file) && existsSync(file) && statSync(file).isFile();
  const staticFile = (path) => {
    if (path === "/") return isFile(join(root, "index.html")) ? join(root, "index.html") : null;
    const exact = resolve(root, `.${path}`);
    if (isFile(exact)) return exact;
    if (!path.endsWith("/") && isFile(`${exact}.html`)) return `${exact}.html`;
    if (isFile(join(exact, "index.html"))) return join(exact, "index.html");
    return null;
  };
  const headerValues = (path) => {
    const values = {};
    for (const rule of [...config.headers, ...headersFile]) {
      if (!rule.for || !matchPattern(rule.for, path, null)) continue;
      for (const [k, v] of Object.entries(rule.values)) {
        const key = k.toLowerCase();
        values[key] = values[key] && key === "x-robots-tag" ? `${values[key]}, ${v}` : v;
      }
    }
    return values;
  };
  const respond = (status, file, path, extra = {}) => {
    const type = file ? TYPES[extname(file).toLowerCase()] || "application/octet-stream" : "text/plain; charset=utf-8";
    const rules = status >= 300 && status < 400 ? {} : headerValues(path);
    return { status, file, headers: { "content-type": type, "cache-control": "public,max-age=0,must-revalidate", ...rules, ...extra } };
  };

  /** What Netlify would answer for this request: { status, file, headers, rule }. Functions are reported, never executed. */
  function resolveRequest(rawUrl, requestHost = host) {
    const url = new URL(rawUrl, `https://${requestHost}`);
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return respond(400, null, url.pathname); }
    if (path.startsWith("/.netlify/functions/")) return { ...respond(200, null, path), function: path.slice(20), rule: null };
    // Pretty URLs: "/x/" → 301 "/x" when the page exists (measured: text/html 301, before any rule).
    if (path.length > 1 && path.endsWith("/") && !isFile(join(resolve(root, `.${path}`), "index.html")) && staticFile(stripSlash(path))) {
      return { ...respond(301, null, path, { location: `${stripSlash(path)}${url.search}`, "content-type": "text/html" }), rule: "pretty-urls" };
    }
    for (const rule of config.redirects) {
      const params = matchPattern(rule.from, path, requestHost);
      if (!params) continue;
      if (!rule.force && staticFile(path)) continue;
      const status = Number(rule.status ?? 301);
      const to = String(rule.to).replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (m, name) => (name in params ? params[name] : m));
      const where = `netlify.toml:${rule.line}`;
      if (status >= 300 && status < 400) return { ...respond(status, null, path, { location: to }), rule: where };
      const targetPath = to.split("?")[0];
      if (targetPath.startsWith("/.netlify/functions/")) return { ...respond(200, null, path), function: targetPath.slice(20), rule: where };
      if (/^https?:\/\//.test(targetPath)) return { ...respond(200, null, path), proxy: to, rule: where };
      const file = staticFile(targetPath);
      if (!file) continue; // a rewrite to a missing file falls through, like Netlify
      return { ...respond(status, file, path), rule: where };
    }
    const file = staticFile(path);
    if (file) return { ...respond(200, file, path), rule: null };
    return { ...respond(404, null, path, { "content-type": "text/html; charset=utf-8" }), rule: null, platform404: true };
  }
  return { root, config, headersFile, resolveRequest };
}

/** Starts a local HTTP server for dist/. Returns { url, close, site }. The Host can be overridden per request with X-Emulated-Host. */
export async function startEmulator({ dist = "dist", netlifyToml, host = "titan-app.fr", port = 0 } = {}) {
  const site = createSite({ dist, netlifyToml, host });
  const server = createServer((req, res) => {
    const answer = site.resolveRequest(req.url || "/", String(req.headers["x-emulated-host"] || host));
    if (answer.function || answer.proxy) {
      res.writeHead(501, { "content-type": "text/plain; charset=utf-8", "x-emulator": answer.function ? `function ${answer.function}` : `proxy ${answer.proxy}` });
      res.end("Netlify function or proxy: not emulated");
      return;
    }
    res.writeHead(answer.status, { ...answer.headers, "x-emulator-rule": answer.rule || "static" });
    if (req.method === "HEAD" || !answer.file) { res.end(answer.platform404 ? "Not Found - Request ID: emulated" : ""); return; }
    createReadStream(answer.file).pipe(res);
  });
  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  const { port: actual } = server.address();
  return { url: `http://127.0.0.1:${actual}`, site, close: () => new Promise((ok) => server.close(ok)) };
}
