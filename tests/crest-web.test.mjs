import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The web crests must stay the same heraldry as the Android application's (mobile/src/components/Crest.tsx): same seven ranks, same growth.
const src = readFileSync(new URL('../js/app/crest.js', import.meta.url), 'utf8');
const RANKS = [{ level: 1, id: 'eclaireur' }, { level: 3, id: 'explorateur' }, { level: 6, id: 'sentinelle' }, { level: 10, id: 'gardien' }, { level: 15, id: 'champion' }, { level: 25, id: 'titan' }, { level: 40, id: 'legende' }];
const win = { TitanEffort: { RANKS } };
vm.runInNewContext(src, { window: win });
const C = win.TitanCrest;

test('levels map to the seven rank crests, from Éclaireur to Légende', () => {
  assert.deepEqual([1, 2, 3, 6, 10, 15, 25, 40, 99].map(C.rankIdOf), ['eclaireur', 'eclaireur', 'explorateur', 'sentinelle', 'gardien', 'champion', 'titan', 'legende', 'legende']);
  assert.equal(C.RANKS.length, 7);
  assert.equal(C.rankIdOf(undefined), 'eclaireur');
});

test('each vector crest is a labelled SVG that grows richer with the rank (gem, wings, laurel, crown, rays)', () => {
  const svg = Object.fromEntries(C.RANKS.map((r) => [r, C.svg(r, 100, { vector: true })]));
  for (const r of C.RANKS) assert.match(svg[r], new RegExp(`aria-label="Blason ${r}"`));
  const count = (s, re) => (s.match(re) || []).length;
  assert.equal(count(svg.eclaireur, /<circle cx="60" cy="46"/g), 0, 'no gem before Sentinelle');
  assert.equal(count(svg.sentinelle, /<circle cx="60" cy="46"/g), 1);
  assert.ok(!svg.sentinelle.includes('opacity="0.82"'), 'no wings before Gardien');
  assert.ok(svg.gardien.includes('opacity="0.82"'));
  assert.ok(!svg.gardien.includes('M36 104'), 'no laurel before Champion');
  assert.ok(svg.champion.includes('M36 104'));
  assert.ok(!svg.champion.includes('polygon'), 'no crown before Titan');
  assert.ok(svg.titan.includes('polygon'));
  assert.equal(count(svg.titan, /<line /g), 0, 'no rays before Légende');
  assert.equal(count(svg.legende, /<line /g), 16);
});

test('a rank whose sculpted badge is approved shows that image; the others keep the vector crest', () => {
  assert.deepEqual([...C.BADGES], ['eclaireur', 'explorateur', 'sentinelle', 'gardien']);
  for (const r of C.RANKS) {
    const html = C.svg(r, 76);
    if (!C.BADGES.includes(r)) { assert.match(html, /^<svg class="crest"/, `${r} stays vector until its badge is approved`); continue; }
    assert.match(html, new RegExp(`^<img class="crest crest-badge" src="/assets/ranks/${r}-256\\.webp"`));
    assert.match(html, new RegExp(`srcset="/assets/ranks/${r}-256\\.webp 256w, /assets/ranks/${r}-512\\.webp 512w" sizes="76px"`));
    assert.match(html, /width="76" height="76"/, 'the box is reserved before the image loads');
    assert.match(html, new RegExp(`alt="Blason ${r}"`));
    for (const size of [256, 512]) {
      const file = readFileSync(new URL(`../assets/ranks/${r}-${size}.webp`, import.meta.url));
      assert.equal(file.subarray(0, 4).toString(), 'RIFF');
      assert.equal(file.subarray(8, 12).toString(), 'WEBP');
      // VP8X header: bit 0x10 of the flags byte says the file carries transparency; the canvas size follows.
      assert.equal(file.subarray(12, 16).toString(), 'VP8X', `${r}-${size} is an extended WebP`);
      assert.ok(file[20] & 0x10, `${r}-${size} is transparent around the badge`);
      assert.deepEqual([1 + file.readUIntLE(24, 3), 1 + file.readUIntLE(27, 3)], [size, size]);
      assert.ok(file.length <= (size === 256 ? 24 : 60) * 1024, `${r}-${size} stays light (${file.length} bytes)`);
    }
  }
  // The rank name is read when the rules provide it.
  const named = { TitanEffort: { RANKS: [{ level: 1, id: 'eclaireur', name: 'Éclaireur' }] } };
  vm.runInNewContext(src, { window: named });
  assert.match(named.TitanCrest.svg('eclaireur', 48), /alt="Blason Éclaireur"/);
});

test('two crests on one page never share a gradient id, and glow can be left out', () => {
  const ids = (s) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const all = [...ids(C.svg('titan', 80)), ...ids(C.svg('titan', 80)), ...ids(C.svg('gardien', 80, { vector: true })), ...ids(C.svg('gardien', 80, { vector: true }))];
  assert.equal(new Set(all).size, all.length);
  assert.ok(!C.svg('titan', 80, { glow: false }).includes('r="70" fill="url(#g'));
});

test('the beacon is lit or out, in the colour of its world', () => {
  assert.match(C.beacon('#9EE6C8', 90, true), /aria-label="Balise allumée"/);
  assert.match(C.beacon('#9EE6C8', 90, false), /aria-label="Balise éteinte"/);
  assert.ok(C.beacon('#9EE6C8', 90).includes('#9EE6C8'));
});
