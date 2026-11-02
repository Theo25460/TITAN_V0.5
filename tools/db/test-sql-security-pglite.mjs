#!/usr/bin/env node
// Optional, entirely in-memory fallback. No network calls, credentials or production connections.
// Usage: node tools/db/test-sql-security-pglite.mjs /path/to/@electric-sql/pglite
// Verified with PGlite 0.3.14. This is not the native/concurrency release bench.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packagePath = process.argv[2];
assert(packagePath, 'Pass an explicitly installed @electric-sql/pglite package directory');
const moduleAt = (path) => import(pathToFileURL(resolve(packagePath, path)).href);
const { PGlite } = await moduleAt('dist/index.js');
const { uuid_ossp } = await moduleAt('dist/contrib/uuid_ossp.js');
const { pg_trgm } = await moduleAt('dist/contrib/pg_trgm.js');
const db = await PGlite.create({ extensions: { uuid_ossp, pg_trgm } });
const fix = '20261102130000_legacy_social_privacy.sql';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const run = (path) => db.exec(read(path));
try {
  // PGlite does not bundle pgcrypto. Do not stub its functions or claim crypto tests pass.
  await db.exec(read('tools/db/supabase-shim.sql').replace(
    'create extension if not exists pgcrypto with schema extensions;',
    '-- pgcrypto unavailable in embedded fallback; no cryptographic function stubbed.'
  ));
  for (const f of readdirSync(resolve(root, 'tools/db/baseline')).filter((f) => f.endsWith('.sql')).sort()) {
    await run('tools/db/baseline/' + f);
  }
  const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of migrations.filter((f) => f.slice(0, 14) >= '20261005150000' && f < fix)) {
    await run('supabase/migrations/' + f);
  }
  let red;
  try { await run('sql/tests/300_legacy_social_privacy.sql'); }
  catch (error) { red = error; }
  assert.equal(red?.code, 'P0004', 'Historical bodies must fail the privacy ASSERT, not SQL setup');
  for (const evidence of [
    'lookup exposes private profile', 'lookup exposes suspended profile', 'lookup bypasses target block',
    'pending request exposes friend statistics before acceptance',
    'private accepted friend or missing showStats exposes identity/statistics'
  ]) assert(red.message.includes(evidence), evidence);
  console.log('RED confirmed: five historical privacy failures under authenticated role.');
  await db.exec('rollback; reset role;');
  await run('supabase/migrations/' + fix);
  await run('sql/tests/300_legacy_social_privacy.sql');
  await run('supabase/migrations/' + fix);
  await run('sql/tests/300_legacy_social_privacy.sql');
  console.log('GREEN: lookup, acceptance, omitted flags, stats withdrawal, two-way blocks; reapplication passes.');

  const versions = migrations.filter((f) => f.slice(0, 14) > '20261021020000').map((f) => f.slice(0, 14));
  assert(versions.every((v) => /^\d{14}$/.test(v)));
  await db.exec('insert into supabase_migrations.schema_migrations(version) values '
    + versions.map((v) => "('" + v + "')").join(',') + ' on conflict do nothing;');
  const gate = () => db.query(read('tools/db/postflight-v11.sql'));
  assert.deepEqual((await gate()).rows.filter((r) => r.blocking && r.ok !== true), []);
  for (const [mutation, expected] of [
    ['grant select on private.titan_routes to authenticated;', 'private.titan_routes:API grants'],
    ['alter table private.titan_routes disable row level security;', 'private.titan_routes:RLS'],
    ['grant execute on function public.titan_find_profile_by_friend_code(text) to anon;', 'titan_find_profile_by_friend_code'],
    ['grant execute on function public.titan_list_my_friends() to anon;', 'titan_list_my_friends']
  ]) {
    await db.exec('begin;' + mutation);
    assert((await gate()).rows.some((r) => r.blocking && r.ok !== true && r.check.includes(expected)), expected);
    await db.exec('rollback;');
  }
  console.log('GREEN: V1.1 catalog gates; all four added negative probes blocked and rolled back.');
  console.log('LIMIT: native PostgreSQL, pgcrypto, psql include/meta-commands and concurrency still require the normal bench.');
} finally { await db.close(); }
