import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext, previewHeaders } from './lib/build-context.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');

const publicDirs = ['css', 'js', 'licenses', 'assets'];
const publicFiles = [
  '404.html',
  'ads.txt',
  'app-ads.txt',
  'favicon.ico',
  'googleb8fedd43e28cf7d4.html',
  'manifest.json',
  'network-error.html',
  'robots.txt',
  'sitemap.xml',
  'sw.js'
];
// Pages replaced by the Ascension app (301 in netlify.toml); kept in the repository for reference only.
// Retired v200 pages were deleted in v300 (301 redirects in netlify.toml); the list guards against a stray copy.
const retiredHtml = ['personnage.html', 'trophies.html', 'talents.html', 'bilan.html', 'health.html', 'notifications.html', 'disciplines.html', 'sport_details.html', 'chat.html', 'activities.html', 'guide.html', 'algorithme.html'];
const excludedHtml = new Set(['sys_core_override_99.html', ...retiredHtml]);
const blockedDistEntries = [
  'sql',
  'tools',
  'functions',
  'node_modules',
  '.git',
  '.netlify',
  'package.json',
  'package-lock.json',
  'netlify.toml',
  'TODO_PUBLIC_RELEASE.md',
  'TITAN_REPRISE_CONTEXTE.md',
  'PUBLIC_RELEASE_RUNBOOK.md',
  'PUBLIC_RELEASE_QA_CHECKLIST.md',
  'PUBLIC_RELEASE_SQL_ORDER.md',
  'PUBLIC_RELEASE_INTEGRATIONS_BACKLOG.md',
  'sys_core_override_99.html'
];

function assertInsideRoot(target) {
  const resolved = resolve(target);
  if (resolved !== root && !resolved.startsWith(`${root}\\`) && !resolved.startsWith(`${root}/`)) {
    throw new Error(`Refusing to operate outside project root: ${resolved}`);
  }
  return resolved;
}

function copyFileOrDirectory(name) {
  const from = assertInsideRoot(join(root, name));
  const to = assertInsideRoot(join(dist, name));
  if (!existsSync(from)) return;
  cpSync(from, to, { recursive: statSync(from).isDirectory() });
}

function copyPublicImages(source = join(root, 'image'), destination = join(dist, 'image'), relativeDir = '') {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    // Editor drafts and temporary image writes never belong in the published site.
    if (entry.name.startsWith('.')) continue;
    const from = assertInsideRoot(join(source, entry.name));
    const to = assertInsideRoot(join(destination, entry.name));
    const nextRelative = join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      copyPublicImages(from, to, nextRelative);
      continue;
    }

    const isOptimizedCollection = /^(avatar|boss|mob)([\\/]|$)/i.test(nextRelative);
    const isLegacyRaster = /\.(png|jpe?g)$/i.test(entry.name);
    const webpSibling = join(source, entry.name.replace(/\.(png|jpe?g)$/i, '.webp'));
    if (isOptimizedCollection && isLegacyRaster && existsSync(webpSibling)) continue;
    cpSync(from, to);
  }
}

function failIfBlocked() {
  const leaks = blockedDistEntries.filter((entry) => existsSync(join(dist, entry)));
  if (leaks.length > 0) {
    throw new Error(`Public build contains blocked entries: ${leaks.join(', ')}`);
  }
}

if (existsSync(dist)) {
  assertInsideRoot(dist);
  rmSync(dist, { recursive: true, force: true });
}
mkdirSync(dist, { recursive: true });

for (const file of publicFiles) copyFileOrDirectory(file);
for (const dir of publicDirs) copyFileOrDirectory(dir);
copyPublicImages();

for (const entry of readdirSync(root)) {
  if (!entry.endsWith('.html') || excludedHtml.has(basename(entry))) continue;
  copyFileOrDirectory(entry);
}

// Old workers and the HTTP cache can survive a deployment: /css and /js are served with a seven-day browser cache, and the hand-written
// ?v= keys were not always changed with the file (nine deployments of the Programme redesign kept the same two stylesheet keys, so a
// returning visitor saw the new pages with the old styles). Every first-party script AND stylesheet a page loads therefore carries a digest
// of its own bytes: a changed file is a new address, an unchanged one stays cached, whatever ?v= says.
// Code and stylesheets also request first-party files by themselves (a script added at runtime, a worker, its importScripts, a CSS @import):
// those addresses are stamped the same way, inside dist/js and dist/css. A file's references are stamped BEFORE its own digest is taken, and
// a file is never written after that, so every rev= names the final bytes of its file, the stamped references included.
const assetDigests = new Map();
const stampedAssets = new Set();
const runtimeReferences = new Map();
// In scripts: a quoted first-party address ('/js/<file>.js' outside vendor/, '/css/<file>.css'). In stylesheets: the target of an @import.
const RUNTIME_ASSET = /(['"])(\.?\/(?:js\/(?!vendor\/)[^'"#]+\.js|css\/[^'"#]+\.css)(?:\?[^'"#]*)?)\1/g;
const CSS_IMPORT = /(@import\s+(?:url\(\s*)?)(['"]?)([^'"()#?\s]+\.css)(\?[^'"()#\s]*)?\2/g;
const OWN_SCRIPT = /^\/js\/(?!vendor\/)[^?#]+\.js$/;
const OWN_SHEET = /^\/css\/[^?#]+\.css$/;
const ASSET_ORIGIN = 'https://dist.invalid';
const assetPath = (url) => `/${url.split('?')[0].replace(/^\.?\//, '')}`;
function stampReferences(path, chain) {
  if (stampedAssets.has(path)) return;
  if (chain.includes(path)) throw new Error(`Assets that reference each other cannot be addressed by a digest: ${[...chain, path].join(' -> ')}`);
  const file = assertInsideRoot(join(dist, path));
  if (!existsSync(file)) throw new Error(`Referenced asset missing from dist: ${path}${chain.length ? ` (from ${chain.at(-1)})` : ''}`);
  const next = [...chain, path];
  const references = [];
  // `url` as written in the file, `target` the file it designates; the reference is recorded as an absolute address (for the precache).
  const stamp = (url, target) => {
    const versioned = versionScriptUrl(url, next, target);
    references.push(`${target}${versioned.slice(url.split('?')[0].length)}`);
    return versioned;
  };
  if (OWN_SCRIPT.test(path) || OWN_SHEET.test(path)) {
    const source = readFileSync(file, 'utf8');
    const text = OWN_SCRIPT.test(path)
      ? source.replace(RUNTIME_ASSET, (_, quote, url) => `${quote}${stamp(url, assetPath(url))}${quote}`)
      : source.replace(CSS_IMPORT, (match, prefix, quote, href, query = '') => {
        const target = new URL(href, `${ASSET_ORIGIN}${path}`);
        if (target.origin !== ASSET_ORIGIN || !OWN_SHEET.test(target.pathname)) return match;
        return `${prefix}${quote}${stamp(`${href}${query}`, target.pathname)}${quote}`;
      });
    if (text !== source) writeFileSync(file, text);
  }
  runtimeReferences.set(path, references);
  stampedAssets.add(path);
}
function versionScriptUrl(url, chain = [], path = assetPath(url)) {
  if (!assetDigests.has(path)) {
    stampReferences(path, chain);
    assetDigests.set(path, createHash('sha256').update(readFileSync(assertInsideRoot(join(dist, path)))).digest('hex').slice(0, 12));
  }
  return `${url}${url.includes('?') ? '&' : '?'}rev=${assetDigests.get(path)}`;
}
const versionScripts = (html) => html
  .replace(/(<script\b[^>]*\ssrc=")(\.?\/js\/(?!vendor\/)[^"#]+)"/g, (_, prefix, url) => `${prefix}${versionScriptUrl(url)}"`)
  .replace(/(<link\b[^>]*\shref=")(\.?\/css\/[^"#]+\.css(?:\?[^"#]*)?)"/g, (_, prefix, url) => `${prefix}${versionScriptUrl(url)}"`);
// Every first-party script and stylesheet, whether a page names it or not (a file loaded only by code is stamped here too).
const listFiles = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }) : [])
  .filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath ?? entry.path, entry.name));
for (const file of [...listFiles(join(dist, 'js')), ...listFiles(join(dist, 'css'))].sort()) {
  const path = `/${file.slice(dist.length + 1).split('\\').join('/')}`;
  if (OWN_SCRIPT.test(path) || OWN_SHEET.test(path)) versionScriptUrl(path);
}

for (const entry of readdirSync(root)) {
  if (!entry.endsWith('.html') || excludedHtml.has(basename(entry))) continue;
  const target = join(dist, entry);
  let html = readFileSync(target, 'utf8');
  // The deferred manager only contacts Google after explicit consent.
  if (html.includes('</head>') && !html.includes('/js/ga4-consent.js')) {
    html = html.replace('</head>', '  <script src="/js/ga4-consent.js?v=300.9" defer></script>\n</head>');
  }
  writeFileSync(target, versionScripts(html));
}

// Offline shell: every local asset the app pages load, plus the pages themselves.
// Public help and its assets are available offline even before the first help visit.
const APP_PAGES = ['aujourdhui', 'training', 'journal', 'stats', 'records', 'carriere', 'objectifs', 'prevoir', 'sortie', 'adventure', 'profile', 'social', 'coaching', 'boutique', 'onboarding', 'login', 'service'];
const precache = new Set(['/', '/network-error.html', '/manifest.json', '/favicon.ico', '/image/logo-192.png', '/css/fonts/archivo-latin-variable.woff2', '/js/vendor/qrcode-generator-1.4.4.js']);
// The GPX worker is started by code (js/app/seance.js), so no page names it. It is precached under the stamped address that code now
// requests, together with what it loads itself (its importScripts, stamped above), so a GPX import also works offline.
const withReferences = (url, into = new Set()) => {
  if (into.has(url)) return into;
  into.add(url);
  for (const reference of runtimeReferences.get(assetPath(url)) || []) withReferences(reference, into);
  return into;
};
for (const url of withReferences(versionScriptUrl('/js/core/gpx-worker.js'))) precache.add(url);
for (const page of APP_PAGES) {
  precache.add(`/${page}`);
  const html = readFileSync(join(dist, `${page}.html`), 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="(\/(?:css|js)\/[^"]+)"/g)) precache.add(url);
}
for (const img of ['scout-s', 'ranger-s', 'keeper-s', 'artisan-s', 'navigator-s', 'sentinel-s', 'guardian-aube-s', 'guardian-marees-s', 'guardian-forge-s', 'guardian-aurores-s', 'valley-small', 'valley-xs', 'archipelago-xs', 'forge-xs', 'aurora-xs']) precache.add(`/assets/renaissance/${img}.webp`);
// The approved rank badges (js/app/crest.js): the small file is enough offline, whatever the rank the sportsman holds.
for (const rank of ['eclaireur', 'explorateur', 'sentinelle', 'gardien', 'champion', 'titan', 'legende']) precache.add(`/assets/ranks/${rank}-256.webp`);
for (const url of precache) {
  const file = join(dist, url.split('?')[0].replace(/^\//, '') || 'index.html');
  const page = url.startsWith('/') && !url.includes('.') && url !== '/' ? join(dist, `${url.slice(1)}.html`) : file;
  if (!existsSync(url === '/' ? join(dist, 'index.html') : page)) throw new Error(`Precache entry missing from dist: ${url}`);
}
// The cache generation is stamped with a digest of every byte the offline shell holds: any shipped change opens a new generation by itself
// (EQ-007), the previous one is deleted on activation, so two builds can never be mixed in one cache, whatever ?v= was (or was not) bumped.
const digest = createHash('sha256');
for (const url of [...precache].sort()) {
  const clean = url.split('?')[0];
  const html = !clean.includes('.') && clean !== '/';
  const file = clean === '/' ? join(dist, 'index.html') : html ? join(dist, `${clean.slice(1)}.html`) : join(dist, clean.slice(1));
  digest.update(url).update(readFileSync(file));
}
const generation = digest.digest('hex').slice(0, 10);
const swPath = join(dist, 'sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8')
  .replace('[/* PRECACHE */]', JSON.stringify([...precache].sort(), null, 2))
  .replace(/const CACHE_NAME = '([^']+)';/, (_, name) => `const CACHE_NAME = '${name}-${generation}';`));

// Android (Trusted Web Activity): Digital Asset Links, only when the real signing fingerprints are provided
// (Netlify environment TWA_SHA256_FINGERPRINTS, comma separated: upload key and Play App Signing key).
const twaCandidates = String(process.env.TWA_SHA256_FINGERPRINTS || '').split(',').map((f) => f.trim().toUpperCase()).filter(Boolean);
const twaFingerprints = twaCandidates.filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
// Warnings only (the build output is unchanged): a missing or mistyped fingerprint used to fail silently, and Android then
// refused to verify https://titan-app.fr/social (Play Console, version 1401: assetlinks.json answered 404).
if (twaCandidates.length !== twaFingerprints.length) console.warn(`TWA_SHA256_FINGERPRINTS : ${twaCandidates.length - twaFingerprints.length} empreinte(s) ignorée(s), format attendu AA:BB:… (32 octets)`);
if (!twaFingerprints.length && process.env.CONTEXT === 'production') console.warn('TWA_SHA256_FINGERPRINTS absent : /.well-known/assetlinks.json ne sera pas publié, les liens https://titan-app.fr/social ne seront pas vérifiés par Android');
if (twaFingerprints.length) {
  mkdirSync(join(dist, '.well-known'), { recursive: true });
  writeFileSync(join(dist, '.well-known', 'assetlinks.json'), JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: process.env.TWA_PACKAGE_ID || 'fr.titanapp.app', sha256_cert_fingerprints: twaFingerprints } }], null, 2));
}

// Provenance (/build-info.json) and the noindex of non-production Netlify contexts: see tools/lib/build-context.mjs.
const build = buildContext(process.env, { cwd: root });
writeFileSync(join(dist, 'build-info.json'), `${JSON.stringify(build, null, 2)}\n`);
const noindexHeaders = previewHeaders(build);
if (noindexHeaders) writeFileSync(join(dist, '_headers'), noindexHeaders);

failIfBlocked();

console.log(`TITAN public build ready: ${dist} (${precache.size} fichiers hors ligne, contexte ${build.context}${noindexHeaders ? ', noindex' : ''})`);
