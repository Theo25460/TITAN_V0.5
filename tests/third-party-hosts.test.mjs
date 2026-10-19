import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8');
const inventory = JSON.parse(read('docs/third-party-hosts.json')).hosts;
const known = new Map(inventory.map((h) => [h.host, h]));

// What ships: pages, scripts, styles, functions, configuration. Not docs, tests, tools or vendored libraries.
const shipped = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
  .filter((f) => /^(js|css|functions|netlify)\//.test(f) || /^[^/]+\.(html|json|js|mjs|webmanifest|toml)$/.test(f))
  .filter((f) => !/vendor\/|^package|^pnpm|^sitemap/.test(f));

const hostsIn = (text) => [...text.matchAll(/https?:\/\/([a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g)].map((m) => m[1]);

test('every external host named in a shipped file is inventoried, and no inventory entry is stale', () => {
  const found = new Map();
  for (const file of shipped) for (const host of hostsIn(read(file))) if (!found.has(host)) found.set(host, file);
  const missing = [...found].filter(([host]) => !known.has(host)).map(([host, file]) => `${host} (${file})`);
  assert.deepEqual(missing, [], 'add these hosts to docs/third-party-hosts.json and docs/PRIVACY_TECHNICAL_INVENTORY.md');
  const stale = [...known.keys()].filter((host) => !found.has(host));
  assert.deepEqual(stale, [], 'these inventory entries match nothing shipped any more');
});

test('no page contacts a third party on load: no external script, stylesheet, preconnect or prefetch', () => {
  const allowedOnLoad = new Set(inventory.filter((h) => h.kind === 'first-party' || h.kind === 'runtime-always').map((h) => h.host));
  const offenders = [];
  for (const file of shipped.filter((f) => f.endsWith('.html'))) {
    const html = read(file);
    for (const tag of html.matchAll(/<(?:link|script|img|iframe)\b[^>]*>/gi)) {
      const rel = /rel=["']?([a-z-]+)/i.exec(tag[0])?.[1] || '';
      if (/^(canonical|alternate|me|author|license|help)$/.test(rel)) continue; // metadata, never fetched
      for (const url of tag[0].matchAll(/(?:href|src)=["'](?:https?:)?\/\/([a-zA-Z0-9._-]+)/gi)) {
        if (!allowedOnLoad.has(url[1])) offenders.push(`${file}: ${url[1]} (${rel || tag[0].slice(1, 7)})`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('a disabled advertising host stays disabled: ads are off and the CSP does not allow its script', () => {
  const config = read('js/config.js');
  assert.match(config, /adsEnabled:\s*false/, 'adsEnabled must be false while the inventory says the ad host is disabled');
  const toml = read('netlify.toml');
  assert.ok(!toml.includes('acscdn.com'), 'the CSP must not allow the ad script while ads are disabled');
});
