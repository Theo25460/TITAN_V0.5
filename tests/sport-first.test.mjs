import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the five primary destinations follow the sport workflow', async () => {
  const ui = await read('js/ui.js');
  const primaryBlock = ui.match(/window\.TITAN_NAV_LINKS = \[(.*?)\n\];/s)?.[1] || '';
  const links = [...primaryBlock.matchAll(/href: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(links, ['index.html', 'training.html', 'journal.html', 'stats.html', 'profile.html']);
  assert.doesNotMatch(primaryBlock, /adventure\.html|social\.html/);
});

test('Olympic metadata is not exposed as a primary catalog family', async () => {
  const discovery = await read('js/sport-discovery.js');
  const training = await read('training.html');
  assert.doesNotMatch(discovery.match(/const FAMILIES = \[(.*?)\n    \];/s)?.[1] || '', /olympique|olympic/i);
  assert.doesNotMatch(training.match(/const SPORT_FAMILY_FILTERS = \[(.*?)\n        \];/s)?.[1] || '', /olympique|olympic/i);
});

test('the journal keeps the full personal history and offers list/calendar views', async () => {
  const journal = await read('journal.html');
  const logsFunction = journal.match(/function getActivityLogs\(\) \{(.*?)\n        \}/s)?.[1] || '';
  assert.match(logsFunction, /return history\.sort/);
  assert.doesNotMatch(logsFunction, /is_elite|slice\s*\(\s*0\s*,/i);
  assert.match(journal, /data-activity-view="list"/);
  assert.match(journal, /data-activity-view="calendar"/);
  assert.doesNotMatch(journal, /Elite debloque un historique|historique profond/i);
});

test('legacy activities route is fused into the journal', async () => {
  const redirects = await read('netlify.toml');
  assert.match(redirects, /from = "\/activities"\s+to = "\/journal"\s+status = 301/s);
  assert.match(redirects, /from = "\/activities\.html"\s+to = "\/journal"\s+status = 301/s);
});

test('strength sessions preserve per-set weight, reps and RIR', async () => {
  const features = await read('js/titan_features.js');
  const state = await read('js/state.js');
  assert.match(features, /\n\s+setRows,/);
  assert.match(features, /rir:/);
  assert.match(features, /volume,/);
  assert.match(state, /setRows: Array\.isArray\(ex\?\.setRows\)/);
});

test('release assets use the same v100 version', async () => {
  const config = await read('js/config.js');
  const serviceWorker = await read('sw.js');
  assert.match(config, /version: "100\.0"/);
  assert.match(config, /TITAN_ASSET_VERSION = "100\.0"/);
  assert.match(serviceWorker, /titan-os-v100-grand-public/);
  assert.match(serviceWorker, /\.\/css\/titan-v100\.css/);
  assert.match(serviceWorker, /\.\/js\/titan-v100\.js/);
  assert.doesNotMatch(serviceWorker, /titan-v89\.(?:css|js)/);
});

test('public discovery pages are indexable, canonical and content-rich', async () => {
  const sitemap = await read('sitemap.xml');
  const pages = [
    ['fonctionnalites.html', '/fonctionnalites'],
    ['suivi-sportif.html', '/suivi-sportif'],
    ['journal-entrainement.html', '/journal-entrainement'],
    ['progression-sportive.html', '/progression-sportive'],
    ['motivation-sport.html', '/motivation-sport'],
  ];

  for (const [file, route] of pages) {
    const html = await read(file);
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://titan-app\\.fr${route}"`));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /<section[^>]+class="[^"]*public-faq/);
    assert.match(html, /titan-v100\.css\?v=100\.0/);
    assert.match(html, /titan-v100\.js\?v=100\.0/);
    assert.match(sitemap, new RegExp(`<loc>https://titan-app\\.fr${route}</loc>`));
  }
});

test('the journal no longer embeds the retired narrative terminal', async () => {
  const journal = await read('journal.html');
  assert.doesNotMatch(journal, /LORE_DATA|terminal-layout|openLoreEntry|renderTerminalSidebar/);
});
