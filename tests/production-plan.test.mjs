import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const BASE = '20261005230000';
const LAST_V1 = '20261021020000';
const LAST_V11 = '20261104085851';
const LAST_V13 = '20261105213712';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pending = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > BASE && f.slice(0, 14) <= LAST_V1)
  .sort();
// Closed release ranges keep later releases out of historical plans.
const v11 = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > LAST_V1 && f.slice(0, 14) <= LAST_V11)
  .sort();
const v13 = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > LAST_V11 && f.slice(0, 14) <= LAST_V13)
  .sort();

test('chaque migration V1.1 est citée dans son plan, dans l\'ordre, avec son retour arrière et sans BEGIN/COMMIT', () => {
  const plan = read('docs/V11_RELEASE_PLAN.md');
  assert.equal(v11.length, 34, 'le lot historique conserve ses 34 migrations');
  let last = -1;
  for (const f of v11) {
    const name = f.replace(/\.sql$/, '');
    const at = plan.indexOf('`' + name + '`');
    assert.ok(at > last, `migration V1.1 absente ou hors ordre dans le plan : ${name}`);
    last = at;
    assert.doesNotMatch(read('supabase/migrations/' + f).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'), /^\s*(begin|commit)\s*;/im, `${name} laisse la transaction à l'appelant`);
  }
});

test('le plan V1.3 cite le lot exact et protège les acquis au retour arrière', () => {
  assert.deepEqual(v13, ['20261105213712_journey_v13.sql']);
  const plan = read('docs/V13_RELEASE_PLAN.md');
  let last = -1;
  for (const file of v13) {
    const name = file.replace(/\.sql$/, '');
    const at = plan.indexOf('`' + name + '`');
    assert.ok(at > last, `migration V1.3 absente ou hors ordre : ${name}`);
    last = at;
    const sql = read('supabase/migrations/' + file).split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    assert.doesNotMatch(sql, /^\s*(begin|commit)\s*;/im);
    assert.ok(!read('docs/V11_RELEASE_PLAN.md').includes(name));
  }
  assert.match(plan, /aucune application.*autorisée/i);
  assert.match(plan, /snapshot.*restaur/i);
  assert.match(plan, /titan_journey_snapshot_v1/);
  assert.match(plan, /titan_journey_sync_v1/);
  assert.match(plan, /migration compensatrice/i);
  assert.match(plan, /conserver.*titan_journey_acquisitions/i);
});

test('le postflight V1.3 est un seul SELECT de structure en lecture seule', () => {
  const code = read('tools/db/postflight-v13.sql').split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\s/i);
  assert.equal((code.match(/;/g) || []).length, 1);
  for (const name of ['20261105213712', 'titan_journey_acquisitions', 'titan_journey_snapshot_v1', 'titan_journey_sync_v1']) assert.ok(code.includes(name));
});

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
