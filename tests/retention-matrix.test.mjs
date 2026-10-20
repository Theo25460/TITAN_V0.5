// Q-002 / LEG31: what is published must be what the code runs. The durations in the migration are the source;
// the matrix, the privacy policy and the deletion page are compared with them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261020030000_retention_purge.sql');
const insert = migration.slice(migration.indexOf('insert into private.titan_retention_rules'), migration.indexOf('on conflict (id) do update'));
const rules = [...insert.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*'([^']+)',\s*interval '(\d+) (months|days)'/g)]
  .map((m) => ({ id: m[1], relation: m[2], keep: Number(m[4]), unit: m[5] }));
const french = (r) => `${r.keep} ${r.unit === 'months' ? 'mois' : 'jours'}`;
const canon = (t) => t.replace(/ /g, ' ');

test('the migration declares the rules the matrix is about', () => {
  assert.equal(rules.length, 17, 'seventeen rules');
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length, 'unique ids');
});

test('every rule appears in docs/DATA_RETENTION.md with the same duration', () => {
  const doc = canon(read('docs/DATA_RETENTION.md'));
  for (const rule of rules) {
    const row = doc.split('\n').find((line) => line.startsWith(`| \`${rule.id}\``));
    assert.ok(row, `rule ${rule.id} missing from the matrix`);
    assert.ok(row.includes(`| ${french(rule)}`) || row.includes(french(rule)), `duration of ${rule.id}: expected ${french(rule)} in "${row.slice(0, 120)}"`);
  }
});

test('the privacy policy and the deletion page state the executed durations and nothing longer', () => {
  const privacy = canon(read('legal_privacy.html')), page = canon(read('supprimer-mon-compte.html'));
  for (const text of ['6 mois', '13 mois', '12 mois', '24 mois', '3 mois']) assert.ok(privacy.includes(text), `privacy policy states ${text}`);
  for (const text of ['13 mois', '24 mois', '12 mois']) assert.ok(page.includes(text), `deletion page states ${text}`);
  const kept = new Set(rules.map((r) => french(r)));
  for (const found of new Set([...(privacy + page).matchAll(/(\d+) (mois|jours)/g)].map((m) => m[0]))) {
    // "30 jours" (unconfirmed sign-ups) and "un mois" (answer time) belong to older rules and to the rights procedure
    assert.ok(kept.has(found) || ['30 jours', '1 mois'].includes(found), `a published duration is not executed by a rule: ${found}`);
  }
});

test('the deletion page is public, indexable, linked and in the sitemap', () => {
  const page = read('supprimer-mon-compte.html');
  assert.match(page, /<link rel="canonical" href="https:\/\/titan-app\.fr\/supprimer-mon-compte">/);
  assert.match(page, /<meta name="robots" content="index, follow/);
  assert.match(page, /Profil/);
  assert.match(page, /SUPPRIMER/);
  assert.match(page, /mailto:titanteam\.app@gmail\.com/);
  assert.match(page, /ne résilie pas l’abonnement/, 'warns that deleting the account does not cancel TITAN+');
  assert.match(read('sitemap.xml'), /https:\/\/titan-app\.fr\/supprimer-mon-compte</);
  assert.match(read('legal_hub.html'), /href="\/supprimer-mon-compte"/);
  assert.match(read('legal_privacy.html'), /href="\/supprimer-mon-compte"/);
  assert.match(read('netlify.toml'), /from = "\/supprimer-mon-compte"\nto = "\/supprimer-mon-compte\.html"/);
});
