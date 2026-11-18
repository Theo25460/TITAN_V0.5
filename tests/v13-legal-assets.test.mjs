import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const registry = JSON.parse(read('docs/V13_ASSET_REGISTRY.json'));
const legalPages = ['legal_cgu', 'legal_privacy', 'legal_mentions', 'legal_hub'];

function filesBelow(path) {
  return readdirSync(new URL(`${path}/`, root), { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.')) return [];
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

test('legal documents expose public canonical routes, reciprocal links, deletion and contact', () => {
  const routing = read('netlify.toml');
  const sitemap = read('sitemap.xml');
  for (const page of legalPages) {
    const html = read(`${page}.html`);
    assert.ok(html.includes(`rel="canonical" href="https://titan-app.fr/${page}"`));
    assert.ok(routing.includes(`from = "/${page}"`));
    assert.ok(sitemap.includes(`https://titan-app.fr/${page}</loc>`));
    for (const target of [...legalPages, 'supprimer-mon-compte']) {
      assert.ok(html.includes(`href="/${target}"`), `${page} links to ${target}`);
    }
    assert.ok(html.includes('mailto:titanteam.app@gmail.com'));
  }
});

// A legal text whose wording changes must say so: its version line (« Version N · mise à jour le … ») changes with it. Each versioned
// document keeps, in tools/data/legal-versions.json, the fingerprint of the body each published version had; editing the body of
// tools/build-public-docs.mjs without raising the version and the date fails here (the shared navigation, header and footer do not count).
const legalVersions = JSON.parse(read('tools/data/legal-versions.json'));
const versionLine = html => html.match(/<p class="pub-fine">([^<]+) · mise à jour le ([^<]+)<\/p>/);
function legalFingerprint(html) {
  const body = html.match(/<div class="pub-doc">([\s\S]*)<\/div><\/div><\/main>/)?.[1];
  assert.ok(body, 'the document body is no longer found');
  const content = body.replace(/<nav class="pub-toc"[\s\S]*?<\/nav>/, '');
  const text = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  const links = [...content.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  return createHash('sha256').update(`${text}\n${links.join('\n')}`).digest('hex');
}

test('a legal document never changes its wording under the same version and date', () => {
  const versioned = readdirSync(new URL('.', root)).filter(f => f.endsWith('.html') && versionLine(read(f))).map(f => f.slice(0, -5)).sort();
  assert.deepEqual(Object.keys(legalVersions).filter(k => k !== '_').sort(), versioned, 'every versioned document, and only those, has a history');
  for (const page of versioned) {
    const html = read(`${page}.html`);
    const [, ref, updated] = versionLine(html);
    const history = legalVersions[page];
    const current = history.at(-1);
    const sha256 = legalFingerprint(html);
    assert.equal(`${ref} · ${updated}`, `${current.ref} · ${current.updated}`, `${page}: the page shows another version than the last one of tools/data/legal-versions.json`);
    assert.equal(sha256, current.sha256, `${page}: its text changed but it still says « ${ref} · mise à jour le ${updated} ». Raise ref and updated in tools/build-public-docs.mjs, regenerate, then APPEND { "ref", "updated", "sha256": "${sha256}" } to tools/data/legal-versions.json (never rewrite a published entry).`);
    assert.equal(new Set(history.map(v => `${v.ref} · ${v.updated}`)).size, history.length, `${page}: two versions share a version line`);
    assert.equal(new Set(history.map(v => v.sha256)).size, history.length, `${page}: two versions share the same text`);
    const numbers = history.map(v => Number(v.ref.match(/^Version (\d+)$/)?.[1])).filter(Number.isFinite);
    assert.ok(numbers.every((n, i) => i === 0 || n > numbers[i - 1]), `${page}: version numbers only go up`);
  }
});

test('terms distinguish verification, test access, refunds and retained ownership', () => {
  const terms = read('legal_cgu.html');
  for (const text of [
    'TITAN+ n’est pas encore en vente', 'test, offerts', 'essai gratuit',
    'ne résilie pas l’abonnement', 'pièces acquises avec tes crédits restent à toi',
    'fournisseur de paiement historique',
  ]) assert.ok(terms.includes(text), text);
  assert.doesNotMatch(terms, /pièces TITAN\+ reviennent au style d’origine|TITAN\+ 4,99|Paddle/);
  for (const id of ['7018481', '2479637', '15576634']) {
    assert.ok(terms.includes(`https://support.google.com/googleplay/answer/${id}`));
  }
  assert.match(read('legal_privacy.html'), /jeton d’achat/);
  assert.match(read('docs/V13_LEGAL_REVIEW.md'), /Revue juridique humaine en attente/);
});

test('inventory covers physical sources and every offline sport has a catalogue glyph', () => {
  const actual = registry.scope.filter(path => path !== 'favicon.ico').flatMap(filesBelow).concat('favicon.ico').sort();
  assert.deepEqual(registry.assets.map(asset => asset.path), actual);
  for (const asset of registry.assets) {
    assert.ok(asset.bytes > 0, asset.path);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    for (const key of ['source', 'visualOwner', 'safeArea', 'background', 'colorMode', 'density', 'accessibleAlternative', 'crop', 'decision']) {
      assert.ok(asset[key], `${asset.path} ${key}`);
    }
    if (/\.(png|webp|jpe?g|svg|ico)$/.test(asset.path)) assert.ok(asset.width > 0 && asset.height > 0, asset.path);
    assert.equal(asset.visualValidation, 'pending-human-review');
    assert.equal(asset.capture, null);
  }
  const glyphs = new Set(registry.icons.map(icon => icon.name));
  const catalog = vm.createContext({});
  for (const path of ['js/core/sports-catalog.js', 'js/core/sports.js']) vm.runInContext(read(path), catalog);
  assert.equal(registry.sports.length, catalog.TitanSports.all().length);
  for (const sport of registry.sports) {
    assert.ok(glyphs.has(sport.icon), sport.id);
    assert.equal(sport.icon, catalog.TitanSports.iconOf(sport.id));
  }
  assert.equal(registry.rankComparison.levels.length, 7);
  assert.equal(registry.rankComparison.sizes.length, 7);
  const surfaces = new Set(registry.codeNative.flatMap(entry => entry.families));
  for (const family of ['public', 'auth', 'menu', 'tutorial', 'notifications', 'badges', 'sports', 'statistics', 'routines', 'records', 'social', 'gpx', 'empty', 'dialogues', 'subscription', 'legal']) {
    assert.ok(surfaces.has(family), family);
  }
});

test('bundled RPG images match the source Web artwork including the editorial hero', () => {
  assert.equal(registry.comparisons.length, 15);
  for (const entry of registry.comparisons) {
    assert.deepEqual(readFileSync(new URL(entry.native, root)), readFileSync(new URL(entry.web, root)), entry.native);
    assert.equal(entry.byteIdentical, true);
  }
});

test('world bible preserves four worlds, all 36 beacons, avatars and seven ranks', () => {
  const catalog = vm.createContext({});
  vm.runInContext(read('js/renaissance-catalog.js'), catalog);
  const { worlds, avatars, ranks } = catalog.TitanCodex;
  const bible = read('docs/V13_WORLD_BIBLE.md');
  assert.equal(worlds.length, 4);
  for (const world of worlds) {
    assert.ok(bible.includes(world.name));
    assert.ok(bible.includes(world.guardian));
    assert.equal(world.chapters.length, 9);
    for (const chapter of world.chapters) assert.ok(bible.includes(chapter.name), chapter.name);
  }
  for (const avatar of avatars) assert.ok(bible.includes(avatar.name));
  for (const rank of ranks) assert.ok(bible.includes(`| ${rank.level} | ${rank.name} |`));
});
