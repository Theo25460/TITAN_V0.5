import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const job = (name) => {
  const start = ci.indexOf(`\n  ${name}:`);
  assert.ok(start >= 0, `job ${name} exists`);
  const rest = ci.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][a-z0-9_-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};

test('every delivered browser suite is included once in the CI command',()=>{
 const command=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts['test:e2e'];
 const registered=command.match(/tests\/e2e\/[\w.-]+\.e2e\.mjs/g)||[];
 const delivered=readdirSync(new URL('./e2e/',import.meta.url)).filter(name=>name.endsWith('.e2e.mjs')).map(name=>'tests/e2e/'+name);
 assert.deepEqual(registered.slice().sort(),delivered.sort(),'no delivered suite may silently be absent or duplicated');
});

test('CI checks the whole git history for secrets: full clone, then pnpm run history-scan', () => {
  const verify = job('verify');
  assert.match(verify, /actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth:\s*0/, 'a shallow clone would make the scan refuse (and prove nothing)');
  assert.match(verify, /run:\s*pnpm run history-scan/, 'the scan runs in the verify job');
});

test('the browser job has room for the whole suite', () => {
  const minutes = Number(/timeout-minutes:\s*(\d+)/.exec(job('e2e'))?.[1]);
  assert.ok(minutes >= 25, `timeout is ${minutes} minutes`);
});

test('database CI uses the immutable production PostgreSQL17.6 image and verifies the server version',()=>{
 const database=job('database');
 assert.match(database,/postgres:17\.6-bookworm@sha256:[a-f0-9]{64}/,'an immutable exact production image, not runner default');
 assert.match(database,/TITAN_EXPECT_PG_VERSION_NUM:\s*["']?170006["']?/,'the bench must reject another server version');
 assert.match(database,/PGBIN:\s*\/usr\/lib\/postgresql\/17\/bin/,'use binaries from the pinned image');
});

// Exercise the actual checker configuration on a disposable damaged copy.
test('static sport gate rejects a wrong XP return from the JavaScript implementation', () => {
  const root = new URL('../', import.meta.url);
  const temp = mkdtempSync(join(tmpdir(), 'titan-sport-typecheck-'));
  try {
    const config = JSON.parse(readFileSync(new URL('tsconfig.sport-core.json', root), 'utf8'));
    writeFileSync(join(temp, 'tsconfig.sport-core.json'), JSON.stringify(config));
    for (const path of config.files) {
      let content = readFileSync(new URL(path, root), 'utf8');
      if (path === 'js/core/effort.js') {
        const damaged = content.replace(/(\n\s+xp:\s+)[^\n]+/, '$1"invalid XP type",');
        assert.notEqual(damaged, content, 'the mutation must target the real XP return');
        content = damaged;
      }
      mkdirSync(dirname(join(temp, path)), {recursive:true});
      writeFileSync(join(temp, path), content);
    }
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)), '--project', join(temp, 'tsconfig.sport-core.json')], {encoding:'utf8', timeout:15000});
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, 'a wrong runtime implementation must fail, even if declarations look valid');
    assert.match(result.stdout + result.stderr, /effort\.js.*TS2322.*string.*number/);
  } finally { rmSync(temp, {recursive:true, force:true}); }
});


test('all player pages use the same version of the shared shell', () => {
  const root = new URL('../', import.meta.url);
  const entries = readdirSync(root).filter(name => name.endsWith('.html')).flatMap(name => {
    const html = readFileSync(new URL(name, root), 'utf8');
    const token = /src="\/js\/app\/shell\.js\?v=([^" ]+)"/.exec(html);
    return token ? [[name, token[1]]] : [];
  });
  assert.ok(entries.length >= 15, 'check every player entry point');
  assert.equal(new Set(entries.map(([, version]) => version)).size, 1,
    'a stale shell token can replay the old cached shell on one page: ' + JSON.stringify(entries));
});
