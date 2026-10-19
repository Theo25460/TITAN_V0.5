import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSecrets, findPlaceholders, checkAndroidManifest, checkIgnoredPaths } from '../tools/lib/release-safety.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role, iat: 1, exp: 2 })}.${'s'.repeat(43)}`;

test('secrets: server keys and private material are found, public keys are not', () => {
  const positives = {
    'service role JWT': `const k = "${jwt('service_role')}";`,
    'Supabase secret key': 'SUPABASE = "sb_secret_abcdefghijklmnopqrstuvwxyz012345"',
    'private key block': '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
    'RSA private key block': '-----BEGIN RSA PRIVATE KEY-----',
    'live Paddle API key': 'token: pdl_live_apikey_01abcdefghijklmnopqrstuvwx_AbCdEfGhIjKlMnOpQrStUvWxYz0123',
    // Assembled at run time so that no real-looking key sits in the repository (GitHub push protection).
    'Stripe live key': ['sk', 'live', '51HabcdefghijklmnopqrstUV'].join('_'),
    'AWS key id': 'id=AKIAIOSFODNN7EXAMPLE',
    'GitHub token': 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'webhook secret assignment': "PADDLE_WEBHOOK_SECRET = 'pdl_ntfset_01abcdefghijklmnopqrstuvwx_abcdefghijklmnop'",
    'secret key assignment': 'SUPABASE_SECRET_KEY: "abcdefghijklmnopqrstuvwxyz0123456789"',
    'keystore password': 'storepass: "hunter2hunter2"',
  };
  for (const [label, text] of Object.entries(positives)) assert.ok(findSecrets(text, 'x.js').length > 0, `found: ${label}`);
  const negatives = {
    'anon JWT': `window.TITAN_SUPABASE_ANON_KEY = "${jwt('anon')}";`,
    'publishable key': 'key = "sb_publishable_abcdefghijklmnopqrstuvwxyz012345"',
    'empty env example': 'SUPABASE_SECRET_KEY=\nPADDLE_WEBHOOK_SECRET=',
    'secret mentioned in prose': 'Ne jamais committer SUPABASE_SECRET_KEY ni PADDLE_WEBHOOK_SECRET.',
    'env reference': 'const key = process.env.SUPABASE_SECRET_KEY;',
    'workflow secret reference': 'storepass: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
    'documented example with a bracketed placeholder': 'Write-Error "Exemple: SUPABASE_DB_URL=\\"postgresql://postgres:[PASSWORD]@db.example.supabase.co:5432/postgres\\""',
    'documented example with an ellipsis': "Exemple: $env:SUPABASE_DB_URL='postgresql://...'",
    'public Paddle client token': 'token: "live_0123456789abcdef0123456789a"',
  };
  for (const [label, text] of Object.entries(negatives)) assert.deepEqual(findSecrets(text, 'x.js'), [], `ignored: ${label}`);
  const hit = findSecrets('a\nb\nSUPABASE_SECRET_KEY: "abcdefghijklmnopqrstuvwxyz0123456789"', 'f.js')[0];
  assert.equal(hit.file, 'f.js'); assert.equal(hit.line, 3);
  assert.ok(!JSON.stringify(hit).includes('abcdefghijklmnopqrstuvwxyz0123456789'), 'a finding never repeats the secret');
});

test('placeholders: test ad units, sandbox tokens and demo content are found, real content is not', () => {
  const positives = {
    'Google test ad app id': 'ca-app-pub-3940256099942544~3347511713',
    'Google test ad unit': 'ca-app-pub-3940256099942544/6300978111',
    'AdSense publisher while ads are off': '<script data-ad-client="ca-pub-1234567890123456"></script>',
    'Paddle sandbox token': 'token: "test_0123456789abcdef0123456789a"',
    'lorem ipsum': '<p>Lorem ipsum dolor sit amet</p>',
    'replace me': 'url = "REPLACE_ME"',
    'your key here': 'apiKey: "YOUR_API_KEY"',
  };
  for (const [label, text] of Object.entries(positives)) assert.ok(findPlaceholders(text, 'x.html').length > 0, `found: ${label}`);
  const negatives = {
    'ordinary copy': '<p>5 € par mois, résiliable à tout moment.</p>',
    'the word test in prose': 'Un test unitaire vérifie le calcul.',
    'real looking id': 'user_id: "00000000-0000-4000-8000-000000000123"',
  };
  for (const [label, text] of Object.entries(negatives)) assert.deepEqual(findPlaceholders(text, 'x.html'), [], `ignored: ${label}`);
});

const manifest = () => ({
  packageId: 'fr.titanapp.app', host: 'titan-app.fr', enableNotifications: false, features: {},
  signingKey: { path: './android.keystore', alias: 'titan' }, alphaDependencies: { enabled: false },
  additionalTrustedOrigins: [], fallbackType: 'customtabs',
});

test('android: the TWA keeps the minimum permissions and no secret', () => {
  assert.deepEqual(checkAndroidManifest(manifest()), []);
  const bad = {
    notifications: { enableNotifications: true },
    location: { features: { locationDelegation: { enabled: true } } },
    billing: { features: { playBilling: { enabled: true } } },
    alpha: { alphaDependencies: { enabled: true } },
    'absolute key path': { signingKey: { path: '/home/me/android.keystore', alias: 'titan' } },
    'password in manifest': { signingKey: { path: './android.keystore', alias: 'titan', password: 'x' } },
    'foreign origin': { additionalTrustedOrigins: ['evil.example'] },
    'plain http host': { host: 'http://titan-app.fr' },
  };
  for (const [label, patch] of Object.entries(bad)) assert.ok(checkAndroidManifest({ ...manifest(), ...patch }).length > 0, `refused: ${label}`);
});

test('ignored paths: keystores and build outputs can never be tracked', () => {
  const ignore = 'android/*.keystore\nandroid/*.aab\nandroid/*.apk\n.env\n.env.*\n!.env.example\n';
  assert.deepEqual(checkIgnoredPaths(ignore, ['android/twa-manifest.json', 'js/app/a.js', '.env.example']), []);
  assert.ok(checkIgnoredPaths(ignore, ['android/android.keystore']).length > 0, 'a tracked keystore is refused');
  assert.ok(checkIgnoredPaths(ignore, ['android/app.aab']).length > 0, 'a tracked bundle is refused');
  assert.ok(checkIgnoredPaths(ignore, ['.env.production']).length > 0, 'a tracked env file is refused');
  assert.ok(checkIgnoredPaths('node_modules/\n', []).length > 0, 'a gitignore missing the keystore rule is refused');
});

test('secrets: quoted names, unquoted values and command-line passwords are found; code and templates are not', () => {
  const positives = {
    'JSON quoted name': '{"SUPABASE_SECRET_KEY":"abcdefghijklmnopqrstuvwxyz0123456789"}',
    'YAML unquoted value': 'SUPABASE_SERVICE_ROLE_KEY: abcdefghijklmnopqrstuvwxyz0123456789',
    'dotenv unquoted value': 'SUPABASE_SECRET_KEY=abcdefghijklmnopqrstuvwxyz0123456789',
    'bubblewrap password': "BUBBLEWRAP_KEYSTORE_PASSWORD='hunter2hunter2hunter2'",
    'keytool flag': 'keytool -list -storepass hunter2hunter2 -keystore a.keystore',
    'key password option': 'apksigner --key_password=abc12345',
    'database URL with a real password': 'postgres://admin:s3cr3tP4ss@db.example.com:5432/postgres',
    'real password that starts with a bracket': 'postgres://admin:[realpass123]@db.example.com:5432/postgres',
  };
  for (const [label, text] of Object.entries(positives)) assert.ok(findSecrets(text, 'x').length > 0, `found: ${label}`);
  const negatives = {
    'environment read with a fallback': "const key = process.env.SUPABASE_SECRET_KEY || '';",
    'shell variable': 'SUPABASE_SECRET_KEY=$KEY_FROM_VAULT',
    'template variable in a database URL': 'postgres://user:${DB_PASS}@host/db',
    'placeholder word in a database URL': 'postgres://user:[YOUR-PASSWORD]@host/db',
    'workflow reference': 'BUBBLEWRAP_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}',
    'keytool with a variable': 'keytool -storepass "$KS_PASS" -list',
  };
  for (const [label, text] of Object.entries(negatives)) assert.deepEqual(findSecrets(text, 'x'), [], `ignored: ${label}`);
});

test('ignore rules: equivalent patterns are accepted, other secret file types are refused', () => {
  for (const ignore of ['/android/*.keystore\n*.aab\n*.apk\n/.env\n', '*.keystore\n*.aab\n*.apk\n.env*\n!.env.example\n', 'android/\n.env\n']) {
    assert.deepEqual(checkIgnoredPaths(ignore, ['js/a.js']), [], ignore);
  }
  const ignore = '*.keystore\n*.aab\n*.apk\n.env\n';
  for (const file of ['android/release.jks.bak', 'keys/AuthKey.p8', 'keys/cert.pfx', 'deploy/.envrc', 'a/.env.production']) {
    assert.ok(checkIgnoredPaths(ignore, [file]).length > 0, `refused: ${file}`);
  }
  assert.deepEqual(checkIgnoredPaths(ignore, ['a/.env.local.example', 'a/.env.sample']), [], 'documented templates are fine');
  assert.ok(checkIgnoredPaths('android/*.keystore\n', []).length > 0, 'a missing rule is still reported');
});

test('android: trusted origins are compared by parsed hostname', () => {
  const ok = (origin) => checkAndroidManifest({ ...manifest(), additionalTrustedOrigins: [origin] });
  assert.deepEqual(ok('https://TITAN-APP.fr'), []);
  assert.deepEqual(ok('https://www.titan-app.fr/path?x=1'), []);
  assert.deepEqual(ok('titan-app.fr'), []);
  assert.ok(ok('https://evil.com?x=.titan-app.fr').length > 0);
  assert.ok(ok('https://titan-app.fr.evil.com').length > 0);
});

function sandbox(files, { git = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'titan-release-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  if (git) {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['add', '-A'], { cwd: dir });
  }
  return dir;
}
const gate = (dir) => spawnSync(process.execPath, [new URL('../tools/check-release-safety.mjs', import.meta.url).pathname], { env: { ...process.env, TITAN_RELEASE_ROOT: dir }, encoding: 'utf8' });
const base = { '.gitignore': 'android/*.keystore\nandroid/*.aab\nandroid/*.apk\n.env\n', 'js/config.js': 'window.x = { adsEnabled: false };', 'index.html': '<p>TITAN</p>' };

test('release gate: passes a clean checkout and fails closed on anything it cannot judge', () => {
  const clean = sandbox({ ...base, 'android/twa-manifest.json': JSON.stringify(manifest()) });
  assert.equal(gate(clean).status, 0, gate(clean).stderr);
  const leak = sandbox({ ...base, 'js/a.js': 'const k = "sb_secret_abcdefghijklmnopqrstuvwxyz012345";' });
  const leaked = gate(leak);
  assert.equal(leaked.status, 1); assert.match(leaked.stderr, /js\/a\.js:1/);
  assert.ok(!leaked.stderr.includes('abcdefghijklmnopqrstuvwxyz012345'), 'the output never repeats the secret');
  const noGit = sandbox(base, { git: false });
  assert.equal(gate(noGit).status, 1, 'no checkout, no pass'); assert.match(gate(noGit).stderr, /cannot be listed/);
  const missing = sandbox({ ...base, 'android/README.md': 'x' });
  assert.equal(gate(missing).status, 1); assert.match(gate(missing).stderr, /twa-manifest\.json is missing/);
  const opaque = sandbox({ ...base, 'data/blob.dat': 'a\0b' });
  assert.equal(gate(opaque).status, 1); assert.match(gate(opaque).stderr, /not scanned: data\/blob\.dat/);
  const image = sandbox({ ...base, 'image/p.png': 'a\0b' });
  assert.equal(gate(image).status, 0, 'known image formats are not text');
  const adsOff = sandbox({ ...base, 'index.html': '<ins data-ad-client="ca-pub-1234567890123456"></ins>' });
  assert.equal(gate(adsOff).status, 1);
  const adsOn = sandbox({ ...base, 'js/config.js': 'window.x = { adsEnabled: true };', 'index.html': '<ins data-ad-client="ca-pub-1234567890123456"></ins>' });
  assert.equal(gate(adsOn).status, 0, 'real publisher ids are allowed once ads are enabled');
  const testAd = sandbox({ ...base, 'js/config.js': 'window.x = { adsEnabled: true, unit: "ca-app-pub-3940256099942544/6300978111" };' });
  assert.equal(gate(testAd).status, 1, 'Google test units are never allowed');
  for (const dir of [clean, leak, noGit, missing, opaque, image, adsOff, adsOn, testAd]) rmSync(dir, { recursive: true, force: true });
});
