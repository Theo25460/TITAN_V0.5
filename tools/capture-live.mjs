import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const root = process.cwd();
const base = 'https://6aa3455ab615274a0861061b--titano-app.netlify.app/';
const output = resolve(root, '.netlify/live-source');
const paths = new Set(readdirSync(root).filter(p => p.endsWith('.html') && p !== 'sys_core_override_99.html'));
for (const dir of ['js', 'css']) for (const f of readdirSync(resolve(root, dir))) paths.add(`${dir}/${f}`);
for (const p of ['sw.js', 'manifest.json', 'sitemap.xml', 'robots.txt']) paths.add(p);
const changes = [];
while (paths.size) {
  const batch = [...paths]; paths.clear();
  await Promise.all(batch.map(async p => {
    const target = resolve(output, p);
    if (!target.startsWith(output + '\\') && !target.startsWith(output + '/')) throw Error('Invalid path');
    if (existsSync(target)) return;
    const response = await fetch(new URL(p, base));
    if (!response.ok) { console.log(`Skipped ${p}: ${response.status}`); return; }
    const body = await response.text();
    mkdirSync(dirname(target), {recursive:true}); writeFileSync(target, body);
    const old = existsSync(resolve(root,p)) ? readFileSync(resolve(root,p),'utf8') : '';
    if (old.replace(/\r\n/g,'\n') !== body.replace(/\r\n/g,'\n')) changes.push(p);
    if(p.endsWith('.html')) for (const m of body.matchAll(/(?:src|href)=["'](?:\.\/|\/)?((?:js|css)\/[^"'?]+)[^"']*["']/g)) paths.add(m[1]);
  }));
}
writeFileSync(resolve(output,'changes.json'),JSON.stringify(changes,null,2));
console.log(JSON.stringify({source:base,changed:changes},null,2));
