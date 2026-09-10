import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.git', '.netlify', 'dist']);
const htmlFiles = [];
const jsFiles = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }
    const ext = extname(entry).toLowerCase();
    if (ext === '.html') htmlFiles.push(fullPath);
    if (ext === '.js') jsFiles.push(fullPath);
  }
}

function checkScript(source, filename) {
  new vm.Script(source, { filename });
}

walk(root);

let checked = 0;

for (const file of jsFiles) {
  const source = readFileSync(file, 'utf8');
  checkScript(source, file);
  checked += 1;
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/type\s*=\s*["']application\/ld\+json["']/i.test(match[1] || ''))
    .map(match => match[2])
    .filter(source => source.trim().length > 0);

  scripts.forEach((source, index) => {
    checkScript(source, `${file}:inline-${index}`);
    checked += 1;
  });
}

console.log(`TITAN check OK: ${checked} scripts parsed (${jsFiles.length} JS files, ${htmlFiles.length} HTML files).`);
