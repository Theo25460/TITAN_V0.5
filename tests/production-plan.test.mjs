import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const BASE = '20261005230000';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pending = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > BASE)
  .sort();

test('le plan de production cite chaque migration en attente, dans l\'ordre', () => {
  const plan = read('docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md');
  let last = -1;
  for (const f of pending) {
    const name = f.replace(/\.sql$/, '');
    const at = plan.indexOf('`' + name + '`');
    assert.ok(at > last, `migration absente ou hors ordre dans le plan : ${name}`);
    last = at;
  }
});

test('le contrôle préalable liste toutes les migrations en attente et reste en lecture seule', () => {
  const sql = read('tools/db/preflight-production.sql');
  for (const f of pending) assert.ok(sql.includes(f.slice(0, 14)), `version absente du contrôle : ${f.slice(0, 14)}`);
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\s/i, 'le contrôle ne doit rien écrire');
  assert.equal((code.match(/;/g) || []).length, 1, 'une seule instruction');
});

test('le retour arrière RPG interdit de rétablir v3 après ouverture d’un chapitre v4',()=>{
  const plan=read('docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md');
  const row=plan.split('\n').find(line=>line.startsWith('| 12 |'));
  assert.match(row,/uniquement avant.*chapitre v4/i,'la restauration des fonctions doit avoir une condition explicite');
  assert.match(plan,/après.*chapitre v4.*interdit.*fonctions v3/i,'ne pas déplacer les cibles par une rétrogradation de fonctions');
  assert.match(plan,/migration compensatrice.*main_objective/i,'conserver les contrats actifs pendant le retour arrière');
});
