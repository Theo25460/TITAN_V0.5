import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const job = (name) => {
  const start = ci.indexOf(`\n  ${name}:`);
  assert.ok(start >= 0, `job ${name} exists`);
  const rest = ci.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][a-z0-9_-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};

test('CI checks the whole git history for secrets: full clone, then pnpm run history-scan', () => {
  const verify = job('verify');
  assert.match(verify, /actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth:\s*0/, 'a shallow clone would make the scan refuse (and prove nothing)');
  assert.match(verify, /run:\s*pnpm run history-scan/, 'the scan runs in the verify job');
});

test('the browser job has room for the whole suite', () => {
  const minutes = Number(/timeout-minutes:\s*(\d+)/.exec(job('e2e'))?.[1]);
  assert.ok(minutes >= 25, `timeout is ${minutes} minutes`);
});
