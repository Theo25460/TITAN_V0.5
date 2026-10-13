import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const file = new URL('../js/core/support-diagnostics.js', import.meta.url);
const sandbox = { window: {} };
if (existsSync(file)) vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
const api = sandbox.window.TitanSupportDiagnostics;
const env = { version: '3.0.0', build: '300.4', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36', mobile: false, now: '2026-10-13T06:30:00.000Z', online: true };
test('diagnostics: API is pure and available', () => { assert.equal(typeof api?.capture, 'function'); assert.equal(typeof api?.format, 'function'); });
test('diagnostics: whitelist, immutable snapshot and no raw user agent', () => {
  const d = api.capture({ ...env, email: 'PRIVATE', token: 'PRIVATE', url: 'PRIVATE', health: 'PRIVATE' }, 'COMMUNITY_LOAD_FAILED');
  assert.deepEqual(Object.keys(d), ['version', 'build', 'platform', 'browser', 'device', 'screen', 'timestamp', 'network', 'code']);
  assert.equal(Object.isFrozen(d), true); assert.equal(d.platform, 'Windows'); assert.equal(d.browser, 'Chrome'); assert.equal(d.device, 'ordinateur');
  assert.equal(JSON.stringify(d).includes('PRIVATE'), false); assert.equal(JSON.stringify(d).includes('Mozilla'), false);
});
for (const [ua, platform, browser, device] of [
  ['Android SamsungBrowser/25.0 Mobile', 'Android', 'Samsung Internet', 'mobile'],
  ['Android Chrome/131.0', 'Android', 'Chrome', 'tablette'],
  ['iPad CPU OS Safari/605.1', 'iOS', 'Safari', 'tablette'],
  ['iPhone Mobile Safari/605.1', 'iOS', 'Safari', 'mobile'],
  ['Windows Edg/131.0 Chrome/131.0', 'Windows', 'Edge', 'ordinateur'],
  ['Linux Firefox/131.0', 'Linux', 'Firefox', 'ordinateur'],
  ['Macintosh Chrome/131 OPR/100', 'macOS', 'Opera', 'ordinateur'],
]) test(`diagnostics: coarse classification ${platform}/${browser}/${device}`, () => {
  const d = api.capture({ ...env, userAgent: ua }, 'COMMUNITY_RESPONSE_INVALID');
  assert.equal(d.platform, platform); assert.equal(d.browser, browser); assert.equal(d.device, device);
});
test('diagnostics: unknown/malformed fields do not coerce or leak', () => {
  const d = api.capture({ version: ['PRIVATE'], build: 'PRIVATE\n300.4', userAgent: ['PRIVATE'], now: 'PRIVATE', online: 'true' }, { toString() { throw Error('coerced'); } });
  assert.equal(d.code, 'COMMUNITY_LOAD_FAILED'); assert.equal(d.version, 'inconnue'); assert.equal(d.build, 'inconnue');
  assert.equal(d.timestamp, 'inconnu'); assert.equal(d.network, 'inconnu'); assert.equal(api.format(d).includes('PRIVATE'), false);
});
test('diagnostics: format revalidates arbitrary input and never includes extra properties', () => {
  const s = api.format({ version: 'PRIVATE', build: ['300.4'], browser: '<img src=x>', platform: 'PRIVATE', device: 'PRIVATE', screen: 'PRIVATE', code: 'PRIVATE', timestamp: '2026-99-99T25:00:00.000Z', network: 'PRIVATE', rawError: 'PRIVATE' });
  assert.equal(s.includes('PRIVATE'), false); assert.equal(s.includes('<img'), false); assert.match(s, /Écran : Communauté/); assert.match(s, /Code : COMMUNITY_LOAD_FAILED/);
});
test('diagnostics: absent consent formats no block; offline snapshot is fixed', () => {
  assert.equal(api.format(null), ''); const d = api.capture({ ...env, online: false }, 'COMMUNITY_LOAD_FAILED');
  env.online = true; assert.equal(d.network, 'hors ligne'); assert.match(api.format(d), /Réseau : hors ligne/);
});
