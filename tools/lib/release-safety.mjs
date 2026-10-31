// Release safety checks: no server secret in what ships, no test or demo value in production,
// and an Android shell that asks for nothing it does not need. Findings never repeat the secret itself.

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}/g],
  ['Paddle API key', /\bpdl_(?:live|sdbx)_apikey_[A-Za-z0-9_]{20,}/g],
  ['Paddle webhook secret', /\bpdl_ntfset_[A-Za-z0-9_]{20,}/g],
  ['Stripe live key', /\bsk_live_[0-9A-Za-z]{16,}/g],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/g],
  ['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}/g],
  ['database URL with password', /\bpostgres(?:ql)?:\/\/[^:\s'"]+:([^@\s'"]{3,})@/g],
  ['server secret assigned a literal', /\b(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|PADDLE_WEBHOOK_SECRET|PADDLE_API_KEY|SUPABASE_DB_URL|BUBBLEWRAP_KEYSTORE_PASSWORD|BUBBLEWRAP_KEY_PASSWORD)\b["']?[ \t]*[:=][ \t]*(?:(['"])(?!\$\{|\$\(|\{\{)(?![^'"]*(?:[\[<]|\.\.\.))[^'"\s][^'"]{15,}\1|(?![$<\[{])(?!process\b|Deno\b|import\b|env\b)[A-Za-z0-9_+/=-]{20,}(?![\w.(]))/g],
  ['keystore password assigned a literal', /(?:\b(?:storepass|keypass|store_password|key_password)\b["']?[ \t]*[:= ][ \t]*|--?(?:storepass|keypass)[ \t]+)(['"]?)(?![$<\[{])[^\s'"]{4,}\1/gi],
];

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role;
  } catch {
    return null;
  }
}

export function findSecrets(text, file) {
  const found = [];
  for (const [kind, pattern] of SECRET_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      // A password that is entirely a placeholder or a template variable is documentation, not a leak.
      if (kind === 'database URL with password' && /^(?:\[[A-Za-z _-]+\]|<[A-Za-z _-]+>|\$\{[^}]*\}|\$[A-Za-z_]\w*|%s|\{\{[^}]*\}\}|\.{3})$/.test(match[1])) continue;
      found.push({ file, line: lineOf(text, match.index), kind });
    }
  }
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    const role = jwtRole(match[0]);
    if (role === 'service_role' || role === 'supabase_admin') found.push({ file, line: lineOf(text, match.index), kind: `${role} JWT` });
  }
  return found;
}

export function findPlaceholders(text, file, { adsEnabled = false } = {}) {
  const found = [];
  const rules = [
    ['Google test ad id', /ca-app-pub-3940256099942544/g],
    ['sandbox payment token', /\btest_[a-f0-9]{24,}\b/g],
    ['lorem ipsum', /lorem ipsum/gi],
    ['unfilled placeholder', /\b(?:REPLACE_ME|CHANGE_ME|YOUR_API_KEY|YOUR_KEY_HERE)\b/g],
  ];
  if (!adsEnabled) rules.push(['advertising publisher id while ads are off', /\bca-pub-\d{10,}\b/g]);
  for (const [kind, pattern] of rules) {
    for (const match of text.matchAll(pattern)) found.push({ file, line: lineOf(text, match.index), kind });
  }
  return found;
}

export function checkAndroidManifest(manifest) {
  const problems = [];
  const m = manifest || {};
  // Decision of 21/10/2026 (issue #112): native Google Play Billing is approved, and ONLY together with what Bubblewrap requires for it
  // (notifications delegation and the alpha dependencies). Any of the three on its own, or any other feature, still needs a decision.
  const billing = Boolean(m.features && m.features.playBilling && m.features.playBilling.enabled === true);
  if (m.enableNotifications === true && !billing) problems.push('notifications are enabled (adds a runtime permission)');
  for (const [name, feature] of Object.entries(m.features || {})) {
    if (name === 'playBilling') continue;
    if (feature && feature.enabled !== false) problems.push(`feature "${name}" is enabled (location and similar need an explicit decision)`);
  }
  if (billing && m.enableNotifications !== true) problems.push('Play Billing is enabled without the notifications delegation Bubblewrap requires for it');
  if (billing && !(m.alphaDependencies && m.alphaDependencies.enabled === true)) problems.push('Play Billing is enabled without the alpha dependencies Bubblewrap requires for it');
  if (!billing && m.alphaDependencies && m.alphaDependencies.enabled === true) problems.push('alpha dependencies are enabled');
  const key = m.signingKey || {};
  if (/^(?:\/|[A-Za-z]:[\\/])/.test(String(key.path || ''))) problems.push('the signing key path is absolute');
  for (const field of ['password', 'storePassword', 'keyPassword', 'store_password', 'key_password']) {
    if (field in key) problems.push(`the manifest carries a signing secret ("${field}")`);
  }
  if (!/^[a-z0-9.-]+$/i.test(String(m.host || ''))) problems.push('the host must be a bare domain without scheme');
  for (const origin of m.additionalTrustedOrigins || []) {
    let host = null;
    try {
      host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(String(origin)) ? String(origin) : `https://${origin}`).hostname.toLowerCase();
    } catch {
      host = null;
    }
    const product = String(m.host || '').toLowerCase();
    if (!host || (host !== product && !host.endsWith(`.${product}`))) problems.push(`trusted origin outside the product domain: ${origin}`);
  }
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(String(m.packageId || ''))) problems.push('the package id is missing or malformed');
  return problems;
}

function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
        out += '(?:.*/)?';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}

// Minimal .gitignore evaluation (last matching rule wins, negation supported), enough to judge a few paths.
export function isIgnored(gitignoreText, path) {
  let ignored = false;
  for (const raw of String(gitignoreText).split('\n')) {
    let rule = raw.trim();
    if (!rule || rule.startsWith('#')) continue;
    const negated = rule.startsWith('!');
    if (negated) rule = rule.slice(1);
    const dirOnly = rule.endsWith('/');
    if (dirOnly) rule = rule.slice(0, -1);
    const anchored = rule.includes('/');
    rule = rule.replace(/^\//, '');
    const body = globToRegExp(rule);
    const regex = new RegExp(anchored ? `^${body}(?:/.*)?$` : `(?:^|/)${body}(?:/.*)?$`);
    if (dirOnly ? path.split('/').slice(0, -1).some((_, i, parts) => regex.test(parts.slice(0, i + 1).join('/'))) : regex.test(path)) ignored = !negated;
  }
  return ignored;
}

const ARTIFACT = /\.(?:keystore|jks|aab|apk|p12|pfx|p8|pem|key)(?:\.(?:bak|old|orig|save|tmp))?$/i;
const ENV_FILE = /^\.env(?:rc|\..+)?$/i;
const ENV_SAFE = /\.(?:example|sample|template)$/i;

export function checkIgnoredPaths(gitignoreText, trackedFiles) {
  const problems = [];
  for (const sample of ['android/release.keystore', 'android/app.aab', 'android/app.apk', '.env']) {
    if (!isIgnored(gitignoreText, sample)) problems.push(`.gitignore would not ignore ${sample}`);
  }
  for (const file of trackedFiles) {
    const name = file.split('/').pop();
    if (ARTIFACT.test(file)) problems.push(`a signing or build artifact is tracked: ${file}`);
    if (ENV_FILE.test(name) && !ENV_SAFE.test(name)) problems.push(`an environment file is tracked: ${file}`);
  }
  return problems;
}
