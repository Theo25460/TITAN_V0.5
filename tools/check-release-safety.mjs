// Run after the build: node tools/check-release-safety.mjs
// Fails when a server secret, a test or demo value, a risky Android setting or a trackable signing
// artifact would ship. It reads tracked sources and dist/; it never prints the secret it found.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAndroidManifest, checkIgnoredPaths, findPlaceholders, findSecrets } from './lib/release-safety.mjs';

const root = resolve(process.env.TITAN_RELEASE_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const problems = [];
const MAX_BYTES = 20 * 1024 * 1024;
const BINARY = /\.(?:png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg|pdf|zip|gz|br|wasm|mov|heic)$/i;
const unscanned = [];

function tracked() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

// Returns the text, or null for a known binary format. Anything else that cannot be read as text is reported:
// a gate that silently skips a file is not a gate.
function readText(path) {
  if (BINARY.test(path)) return null;
  try {
    if (statSync(path).size > MAX_BYTES) {
      unscanned.push(`${relative(root, path)} (larger than ${MAX_BYTES / 1024 / 1024} MB)`);
      return null;
    }
    const buffer = readFileSync(path);
    if (buffer.includes(0)) {
      unscanned.push(`${relative(root, path)} (binary content)`);
      return null;
    }
    return buffer.toString('utf8');
  } catch {
    unscanned.push(`${relative(root, path)} (unreadable)`);
    return null;
  }
}

const trackedList = tracked();
if (trackedList === null) {
  console.error('Release safety check FAILED: the tracked files cannot be listed (git unavailable or not a checkout).');
  process.exit(1);
}
const trackedFiles = trackedList;
const configText = existsSync(join(root, 'js', 'config.js')) ? readFileSync(join(root, 'js', 'config.js'), 'utf8') : '';
const adsEnabled = /\badsEnabled\s*[:=]\s*true\b/.test(configText);
// Fixtures and documentation legitimately quote fake keys; shipped code and configuration do not.
const SECRET_SKIP = /^(?:tests\/|docs\/|tools\/lib\/release-safety\.mjs$|tools\/check-release-safety\.mjs$|pnpm-lock\.yaml$)/;
const PLACEHOLDER_SCOPE = /^(?:[^/]+\.(?:html|json|js|webmanifest|txt|xml)|js\/|css\/|assets\/|functions\/|netlify\/|android\/|\.github\/)/;
const PLACEHOLDER_SKIP = /^(?:js\/vendor\/|package\.json$|pnpm-lock\.yaml$)/;

for (const file of trackedFiles) {
  const text = readText(join(root, file));
  if (text === null) continue;
  if (!SECRET_SKIP.test(file)) for (const hit of findSecrets(text, file)) problems.push(`secret (${hit.kind}) at ${hit.file}:${hit.line}`);
  if (PLACEHOLDER_SCOPE.test(file) && !PLACEHOLDER_SKIP.test(file)) {
    for (const hit of findPlaceholders(text, file, { adsEnabled })) problems.push(`test or demo value (${hit.kind}) at ${hit.file}:${hit.line}`);
  }
}

const dist = join(root, 'dist');
if (existsSync(dist)) {
  for (const path of walk(dist)) {
    const text = readText(path);
    if (text === null) continue;
    const file = `dist/${relative(dist, path)}`;
    for (const hit of findSecrets(text, file)) problems.push(`secret (${hit.kind}) at ${hit.file}:${hit.line}`);
    if (!/\/js\/vendor\//.test(file)) for (const hit of findPlaceholders(text, file, { adsEnabled })) problems.push(`test or demo value (${hit.kind}) at ${hit.file}:${hit.line}`);
  }
} else {
  console.log('dist/ is absent: only tracked sources were checked.');
}

const gitignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : '';
problems.push(...checkIgnoredPaths(gitignore, trackedFiles));

const androidDir = join(root, 'android');
const manifestPath = join(androidDir, 'twa-manifest.json');
let androidChecked = false;
if (existsSync(androidDir)) {
  if (!existsSync(manifestPath)) {
    problems.push('android/ exists but android/twa-manifest.json is missing: the Android settings cannot be checked');
  } else {
    try {
      for (const problem of checkAndroidManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))) problems.push(`android: ${problem}`);
      androidChecked = true;
    } catch {
      problems.push('android/twa-manifest.json is not valid JSON');
    }
  }
}
for (const entry of unscanned) problems.push(`not scanned: ${entry}`);

if (problems.length) {
  console.error(`Release safety check FAILED (${problems.length}):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log(`Release safety check OK: ${trackedFiles.length} tracked files${existsSync(dist) ? ' and dist/' : ''}, ignore rules${androidChecked ? ', Android manifest' : ''}${adsEnabled ? ' (advertising enabled)' : ''}.`);
