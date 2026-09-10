import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceFiles = [
  ...readdirSync(root).filter(name => name.endsWith('.html')),
  ...readdirSync(resolve(root, 'css')).filter(name => name.endsWith('.css')).map(name => `css/${name}`),
  'manifest.json',
  'sw.js',
];
const failures = [];

function localPath(rawValue) {
  const value = String(rawValue || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .split(/[?#]/)[0];
  if (
    !value
    || value.startsWith('data:')
    || value.startsWith('blob:')
    || value.startsWith('http:')
    || value.startsWith('https:')
    || value.startsWith('//')
    || value.includes('${')
    || value.includes('{{')
  ) return null;
  return value;
}

for (const sourceFile of sourceFiles) {
  const absoluteSource = resolve(root, sourceFile);
  const source = readFileSync(absoluteSource, 'utf8');
  const values = [];

  if (extname(sourceFile) === '.html') {
    for (const match of source.matchAll(/\b(?:src|poster)=["']([^"']+)["']/gi)) values.push(match[1]);
    for (const match of source.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) values.push(match[1]);
  }

  if (extname(sourceFile) === '.css') {
    for (const match of source.matchAll(/url\(\s*([^)]*?)\s*\)/gi)) values.push(match[1]);
  }
  if (sourceFile === 'manifest.json') {
    const manifest = JSON.parse(source);
    for (const icon of manifest.icons || []) values.push(icon.src);
    for (const screenshot of manifest.screenshots || []) values.push(screenshot.src);
  }
  if (sourceFile === 'sw.js') {
    for (const match of source.matchAll(/^\s*['"](\.\/[^'"]+\.[a-z0-9]{2,5})['"],?\s*$/gim)) values.push(match[1]);
  }

  for (const rawValue of values) {
    const value = localPath(rawValue);
    if (!value) continue;
    const fromRoot = value.startsWith('/');
    const target = fromRoot
      ? resolve(root, value.slice(1))
      : resolve(absoluteSource, '..', value);
    if (!existsSync(target)) failures.push(`${sourceFile}: ${rawValue}`);
  }
}

if (failures.length) {
  console.error(`Missing public assets (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Public asset references verified across ${sourceFiles.length} files.`);
}
