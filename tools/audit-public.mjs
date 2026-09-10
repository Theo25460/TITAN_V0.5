import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', '.netlify', 'dist', 'node_modules']);
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    files.push(full);
  }
}

function rel(file) {
  return relative(root, file).replaceAll('\\', '/');
}

function stripQuery(value) {
  return value.split('#')[0].split('?')[0];
}

function resolveInternal(fromFile, href) {
  const clean = stripQuery(href.trim());
  if (!clean || clean.startsWith('mailto:') || clean.startsWith('tel:') || clean.startsWith('javascript:')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//')) return null;
  if (clean.startsWith('/')) return resolve(root, `.${clean}`);
  return resolve(dirname(fromFile), clean);
}

function pageForPrettyUrl(pathname) {
  if (pathname === '/' || pathname === '') return resolve(root, 'index.html');
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return resolve(root, `${trimmed}.html`);
}

function hasAnyTarget(target) {
  if (!target) return true;
  if (existsSync(target)) return true;
  const normalized = normalize(target);
  if (!extname(normalized)) return existsSync(`${normalized}.html`);
  return false;
}

function parseAttrs(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
  }
  return attrs;
}

walk(root);

const htmlFiles = files.filter(file => extname(file).toLowerCase() === '.html');
const cssFiles = files.filter(file => extname(file).toLowerCase() === '.css');
const jsFiles = files.filter(file => extname(file).toLowerCase() === '.js' || extname(file).toLowerCase() === '.mjs');
const publicHtml = htmlFiles.filter(file => ![
  'sys_core_override_99.html',
  'googleb8fedd43e28cf7d4.html',
].includes(basename(file)));
const findings = [];

function add(level, file, message) {
  findings.push({ level, file: rel(file), message });
}

for (const file of publicHtml) {
  const html = readFileSync(file, 'utf8');
  const htmlWithoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const body = htmlWithoutScripts.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || htmlWithoutScripts;
  const title = head.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = head.match(/<meta\s+name=(["'])description\1[^>]*content=(["'])(.*?)\2[^>]*>/i)?.[3]?.trim();
  const robots = head.match(/<meta\s+name=(["'])robots\1[^>]*content=(["'])(.*?)\2[^>]*>/i)?.[3]?.trim();
  const canonical = head.match(/<link\s+rel=(["'])canonical\1[^>]*href=(["'])(.*?)\2[^>]*>/i)?.[3]?.trim();
  const h1Count = (body.match(/<h1\b/gi) || []).length;
  const mainCount = (body.match(/<main\b/gi) || []).length;
  const viewport = head.match(/<meta\s+name=["']viewport["'][^>]*>/i)?.[0] || '';

  if (!title) add('error', file, 'missing <title>');
  if (title && (title.length < 18 || title.length > 70)) add('warn', file, `title length ${title.length}`);
  if (!description) add('error', file, 'missing meta description');
  if (description && (description.length < 70 || description.length > 165)) add('warn', file, `description length ${description.length}`);
  if (!robots) add('warn', file, 'missing robots meta');
  if (!canonical) add('warn', file, 'missing canonical');
  if (h1Count !== 1) add('warn', file, `${h1Count} h1 elements`);
  if (mainCount !== 1) add('warn', file, `${mainCount} main elements`);
  if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(viewport)) add('warn', file, 'viewport disables zoom');
  if (/[ÃÂ]|â€|�/.test(htmlWithoutScripts)) add('warn', file, 'possible mojibake text');

  const ids = new Map();
  for (const match of htmlWithoutScripts.matchAll(/\sid=["']([^"']+)["']/gi)) {
    ids.set(match[1], (ids.get(match[1]) || 0) + 1);
  }
  for (const [id, count] of ids.entries()) {
    if (count > 1) add('warn', file, `duplicate id "${id}" (${count})`);
  }

  for (const img of htmlWithoutScripts.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = parseAttrs(img[0]);
    if (!('alt' in attrs)) add('warn', file, `image without alt: ${img[0].slice(0, 90)}`);
    const src = attrs.src || '';
    const target = resolveInternal(file, src);
    if (target && !hasAnyTarget(target)) add('error', file, `missing image asset: ${src}`);
  }

  for (const source of htmlWithoutScripts.matchAll(/<source\b[^>]*>/gi)) {
    const attrs = parseAttrs(source[0]);
    for (const candidate of String(attrs.srcset || attrs.src || '').split(',')) {
      const src = candidate.trim().split(/\s+/)[0];
      const target = resolveInternal(file, src);
      if (target && !hasAnyTarget(target)) add('error', file, `missing source asset: ${src}`);
    }
  }

  for (const match of htmlWithoutScripts.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const value = match[2].trim();
    if (!value || value.startsWith('data:') || value.startsWith('#')) continue;
    const target = resolveInternal(file, value);
    if (target && !hasAnyTarget(target)) add('error', file, `missing CSS image asset: ${value}`);
  }

  for (const tag of htmlWithoutScripts.matchAll(/<(a|link|script)\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag[0]);
    const value = attrs.href || attrs.src;
    if (!value || value.includes('${')) continue;
    if (tag[1].toLowerCase() === 'a' && value === '#') add('warn', file, 'anchor href="#"');
    let target = resolveInternal(file, value);
    if (!target && value.startsWith('/') && !value.startsWith('//')) target = pageForPrettyUrl(stripQuery(value));
    if (target && !hasAnyTarget(target)) add('error', file, `broken internal reference: ${value}`);
  }

  if (robots?.startsWith('index') && !head.includes('application/ld+json')) {
    add('warn', file, 'indexable page without JSON-LD');
  }

  for (const schema of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(schema[1]);
    } catch (error) {
      add('error', file, `invalid JSON-LD: ${error.message}`);
    }
  }
}

for (const file of [...cssFiles, ...jsFiles].filter(file => !rel(file).startsWith('tools/'))) {
  const source = readFileSync(file, 'utf8');
  if (/[ÃÂ]|â€|�/.test(source)) add('warn', file, 'possible mojibake text');
  if (extname(file).toLowerCase() === '.css') {
    for (const match of source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      const value = match[2].trim();
      if (!value || value.startsWith('data:') || value.startsWith('#')) continue;
      const target = resolveInternal(file, value);
      if (target && !hasAnyTarget(target)) add('error', file, `missing CSS asset: ${value}`);
    }
  }
}

const netlifyConfig = readFileSync(resolve(root, 'netlify.toml'), 'utf8');
const redirectsFile = readFileSync(resolve(root, '_redirects'), 'utf8');
for (const requiredRoute of ['/sports.html']) {
  if (!netlifyConfig.includes(requiredRoute)) add('error', resolve(root, 'netlify.toml'), `missing compatibility route: ${requiredRoute}`);
  if (!redirectsFile.includes(requiredRoute)) add('error', resolve(root, '_redirects'), `missing compatibility route: ${requiredRoute}`);
}
const serviceWorker = readFileSync(resolve(root, 'sw.js'), 'utf8');
if (!serviceWorker.includes('legacyArtwork') || !serviceWorker.includes("'.webp'")) {
  add('error', resolve(root, 'sw.js'), 'missing legacy image fallback to WebP');
}

const byLevel = findings.reduce((acc, item) => {
  acc[item.level] = (acc[item.level] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  scanned: {
    html: publicHtml.length,
    css: cssFiles.length,
    js: jsFiles.length,
  },
  findings: byLevel,
  items: findings,
}, null, 2));
