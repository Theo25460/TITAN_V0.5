import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a rate-limited session edit reaches the player as a readable French sentence', () => {
  const window = { state: { user: { id: 'u' }, history: [], archivedHistory: [] }, dispatchEvent() {} };
  vm.runInNewContext(read('js/app/sessions.js'), { window, navigator: { onLine: true }, CustomEvent: class {} });
  const message = window.TitanSessions.humanize({ code: 'PT429', message: 'RATE_LIMITED' }).message;
  assert.doesNotMatch(message, /RATE_LIMITED|PT429/);
  assert.match(message, /trop|beaucoup/i);
  assert.match(message, /réessaie/i);
});

test('guild and Atelier screens map RATE_LIMITED to a readable sentence', () => {
  for (const file of ['js/app/communaute.js', 'js/app/atelier.js']) {
    const src = read(file);
    assert.match(src, /RATE_LIMITED[^\n]*(?:Beaucoup|Trop)[^\n]*(?:Réessaie|réessaie)/, `${file} explains a rate-limited request`);
  }
});

test('shop purchase: RATE_LIMITED is handled before the generic LIMIT branch (which says "stock épuisé")', () => {
  const src = read('js/main.js');
  const rate = src.indexOf("msg.includes('RATE_LIMITED')");
  const stock = src.indexOf("msg.includes('LIMIT') || msg.includes('ONCE')");
  assert.ok(rate > 0 && stock > 0 && rate < stock, 'RATE_LIMITED is checked first');
  assert.match(src, /TROP_RAPIDE[^\n]*Beaucoup|Beaucoup[^\n]*TROP_RAPIDE/, 'the purchase dialog has a text for it');
  assert.ok(src.includes("'TROP_RAPIDE'") && /\['NO_FUNDS'[^\]]*'TROP_RAPIDE'/.test(src), 'the error is passed through to the dialog, not swallowed as "server unavailable"');
});
