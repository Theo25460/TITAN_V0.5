import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Q-001 (resolved 19/10/2026): the definitive Android package is fr.titanapp.app. The identifier created in Play
// Console cannot change, so nothing active in the repository may name another one.
const CANONICAL = 'fr.titanapp.app';
const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

test('the Android shell manifest uses the canonical package', () => {
  assert.equal(JSON.parse(read('android/twa-manifest.json')).packageId, CANONICAL);
});

test('the Digital Asset Links default names the canonical package', () => {
  const src = read('tools/build-public.mjs');
  assert.match(src, new RegExp(`process\\.env\\.TWA_PACKAGE_ID \\|\\| '${CANONICAL.replace(/\\./g, '\\\\.')}'`));
});

test('no active file names a historical Android package (history stays in docs/CDC_* and docs/adr)', () => {
  const offenders = tracked
    .filter((f) => !/^(docs\/CDC_|docs\/adr\/)|^(pnpm-lock|dist\/)|\.(png|jpe?g|webp|ico|woff2?|keystore)$/.test(f))
    .filter((f) => f !== 'tests/android-identity.test.mjs')
    .filter((f) => /fr\.titanapp\.(?!app\b)[a-z]+/.test(read(f)));
  assert.deepEqual(offenders, []);
});
