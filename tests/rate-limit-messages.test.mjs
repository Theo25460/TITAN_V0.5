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

test('guild and Atelier screens map RATE_LIMITED to a readable sentence, in their message tables', () => {
  assert.match(read('js/app/communaute.js'), /^\s{4}RATE_LIMITED: "(?:Beaucoup|Trop)[^"]*[Rr]éessaie[^"]*",$/m, 'communaute.js MESSAGES entry');
  assert.match(read('js/app/atelier.js'), /^\s*if \(m\.includes\("RATE_LIMITED"\)\) return "(?:Beaucoup|Trop)[^"]*[Rr]éessaie[^"]*";$/m, 'atelier.js messageOf branch');
});

test('shop purchase: RATE_LIMITED is thrown as TROP_RAPIDE before the generic LIMIT branch (which says "stock épuisé")', () => {
  const src = read('js/main.js');
  const rate = src.search(/^\s*if \(msg\.includes\('RATE_LIMITED'\) \|\| error\.code === 'PT429'\) throw new Error\('TROP_RAPIDE'\);$/m);
  const stock = src.indexOf("msg.includes('LIMIT') || msg.includes('ONCE')");
  assert.ok(rate > 0 && stock > 0 && rate < stock, 'the rate-limit branch comes first');
  assert.match(src, /^\s*else if \(err\.message === "TROP_RAPIDE"\) \{ title = '[^']+'; msg = '(?:Beaucoup|Trop)[^']*'; \}$/m, 'the purchase dialog has a text for it');
  assert.match(src, /\['NO_FUNDS'[^\]]*'TROP_RAPIDE'[^\]]*\]\.includes\(err\.message\)/, 'the error is passed through, not swallowed as "server unavailable"');
});
