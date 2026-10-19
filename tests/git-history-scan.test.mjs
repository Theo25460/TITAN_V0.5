import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../tools/scan-git-history.mjs', import.meta.url).pathname;
// Assembled at runtime so no secret-shaped literal exists in this file.
const FAKE = ['sb', 'secret', 'Zq8'.repeat(10)].join('_');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@example.test', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' });
const repo = () => { const d = mkdtempSync(join(tmpdir(), 'titan-hist-')); git(d, 'init', '-q'); return d; };
const commit = (d, msg) => { git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', msg); };
const scan = (d) => spawnSync(process.execPath, [CLI, d], { encoding: 'utf8' });

test('history scan: a secret removed from the tree is still found, with its commit, never its value', () => {
  const d = repo();
  try {
    writeFileSync(join(d, 'config.js'), `const key = "${FAKE}";\n`);
    commit(d, 'add key');
    writeFileSync(join(d, 'config.js'), 'const key = process.env.KEY;\n');
    commit(d, 'remove key');
    const r = scan(d);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /LEAK\s+config\.js:1 \(Supabase secret key\) first seen in commit [0-9a-f]{7,}/);
    assert.ok(!(r.stdout + r.stderr).includes(FAKE), 'the value is never printed');
    assert.ok(!(r.stdout + r.stderr).includes(FAKE.slice(0, 25)), 'no part of the value is printed');
    assert.match(r.stderr, /docs\/SECRETS_ROTATION_PLAN\.md/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('history scan: a clean history passes; a secret quoted only in docs/ or tests/ is reported, not failed', () => {
  const d = repo();
  try {
    writeFileSync(join(d, 'app.js'), 'export const ok = 1;\n');
    commit(d, 'clean');
    let r = scan(d);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /History scan OK/);
    mkdirSync(join(d, 'docs'));
    writeFileSync(join(d, 'docs', 'example.md'), `Example: ${FAKE}\n`);
    commit(d, 'doc example');
    r = scan(d);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /quote\s+docs\/example\.md:1/);
    assert.ok(!r.stdout.includes(FAKE));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('history scan: fails closed outside a git repository', () => {
  const d = mkdtempSync(join(tmpdir(), 'titan-nohist-'));
  try {
    const r = scan(d);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Cannot scan the git history/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('history scan: a secret on another branch or a deleted file is still found', () => {
  const d = repo();
  try {
    writeFileSync(join(d, 'a.txt'), 'x\n');
    commit(d, 'base');
    git(d, 'checkout', '-q', '-b', 'side');
    writeFileSync(join(d, 'leak.env'), `SUPABASE_SECRET_KEY=${FAKE}\n`);
    commit(d, 'leak on side branch');
    git(d, 'checkout', '-q', '-');
    const r = scan(d);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /LEAK\s+leak\.env:1/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
