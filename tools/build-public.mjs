import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');

const publicDirs = ['css', 'js', 'licenses', 'assets'];
const publicFiles = [
  '404.html',
  'ads.txt',
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

// Offline shell: every local asset the app pages load, plus the pages themselves.
const APP_PAGES = ['aujourdhui', 'training', 'journal', 'stats', 'records', 'objectifs', 'prevoir', 'adventure', 'profile', 'social', 'coaching', 'boutique', 'onboarding', 'login'];
const precache = new Set(['/', '/network-error.html', '/manifest.json', '/favicon.ico', '/image/logo-192.png', '/css/fonts/archivo-latin-variable.woff2', '/css/fonts/manrope-latin-0.woff2', '/css/fonts/manrope-latin-1.woff2', '/js/vendor/qrcode-generator-1.4.4.js']);
for (const page of APP_PAGES) {
  precache.add(`/${page}`);
  const html = readFileSync(join(dist, `${page}.html`), 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="(\/(?:css|js)\/[^"]+)"/g)) precache.add(url);
}
for (const img of ['scout-s', 'ranger-s', 'keeper-s', 'artisan-s', 'navigator-s', 'sentinel-s', 'guardian-aube-s', 'guardian-marees-s', 'guardian-forge-s', 'guardian-aurores-s', 'valley-small', 'valley-xs', 'archipelago-xs', 'forge-xs', 'aurora-xs']) precache.add(`/assets/renaissance/${img}.webp`);
for (const url of precache) {
  const file = join(dist, url.split('?')[0].replace(/^\//, '') || 'index.html');
  const page = url.startsWith('/') && !url.includes('.') && url !== '/' ? join(dist, `${url.slice(1)}.html`) : file;
  if (!existsSync(url === '/' ? join(dist, 'index.html') : page)) throw new Error(`Precache entry missing from dist: ${url}`);
}
const swPath = join(dist, 'sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('[/* PRECACHE */]', JSON.stringify([...precache].sort(), null, 2)));

failIfBlocked();

console.log(`TITAN public build ready: ${dist} (${precache.size} fichiers hors ligne)`);
