import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');

const publicDirs = ['css', 'js'];
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
const excludedHtml = new Set(['sys_core_override_99.html']);
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

failIfBlocked();

console.log(`TITAN public build ready: ${dist}`);
