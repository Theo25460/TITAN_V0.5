#!/usr/bin/env node
// Disposable real SQL engine. No credentials, production connections or fake SQL parser.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const packagePath = process.argv[2];
assert(packagePath, 'Pass an installed @electric-sql/pglite package directory (tested: 0.3.14)');
const moduleAt = (path) => import(pathToFileURL(resolve(packagePath, path)).href);
const { PGlite } = await moduleAt('dist/index.js');
const { uuid_ossp } = await moduleAt('dist/contrib/uuid_ossp.js');
const { pg_trgm } = await moduleAt('dist/contrib/pg_trgm.js');
const db = await PGlite.create({ extensions: { uuid_ossp, pg_trgm } });
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const run = async (path) => {
  try { return await db.exec(read(path)); }
  catch (error) { throw new Error(`${path}: ${error.code || 'SQL'} ${error.message}\n${error.where || ''}`); }
};
try {
  await db.exec(read('tools/db/supabase-shim.sql').replace('create extension if not exists pgcrypto with schema extensions;', '-- pgcrypto absent; no cryptographic function stubbed or tested.'));
  for (const file of readdirSync(resolve(root, 'tools/db/baseline')).filter((f) => f.endsWith('.sql')).sort()) await run('tools/db/baseline/' + file);
  const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations.filter((f) => f.slice(0, 14) >= '20261005150000')) await run('supabase/migrations/' + file);
  await run('sql/tests/300_journey.sql');
  const migration = migrations.find((f) => f.endsWith('_journey_v13.sql'));
  assert(migration, 'Journey belongs to the ordinary migration replay');
  await run('supabase/migrations/' + migration);
  await run('sql/tests/300_journey.sql');
  await db.exec(`insert into auth.users(id,raw_user_meta_data) values('91300000-0000-0000-0000-000000000001','{}');
    begin; set local session_replication_role=replica;
    insert into public.profiles(id,username,level,xp,credits,is_suspended) values('91300000-0000-0000-0000-000000000001','qa_readonly_journey',1,0,0,false)
    on conflict(id) do update set is_suspended=false; commit;
    begin read only; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"91300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
    do $$declare s jsonb;begin s:=public.titan_journey_snapshot_v1(); assert s->>'owner'='91300000-0000-0000-0000-000000000001';
      begin perform public.titan_journey_sync_v1(); raise exception 'sync writable in read-only transaction'; exception when read_only_sql_transaction then null; end;
    end $$; rollback;`);
  if (process.argv.includes('--regression')) {
    const passed = [], unsupported = [], failed = [];
    for (const file of readdirSync(resolve(root, 'sql/tests')).filter((f) => /^300_.*\.sql$/.test(f) && f !== '300_journey.sql').sort()) {
      const path = 'sql/tests/' + file;
      if (/^\\/m.test(read(path))) { unsupported.push(file); continue; }
      try { await run(path); passed.push(file); }
      catch (error) { failed.push({ file, message: error.message }); await db.exec('rollback; reset role;'); }
    }
    console.log(JSON.stringify({ passedSQL: passed.length, unsupportedPsqlScripts: unsupported, failedSQL: failed }, null, 2));
    assert.equal(failed.length, 0, 'Broad SQL failures are listed above; psql-only scripts are explicitly unsupported');
  }
  console.log('GREEN: SQL replay/reapplication; read-only snapshot, ten-sync idempotency, MAX/caps/dates/consent, isolation, immutable acquisitions, 30M horizon, career backfill, export, account deletion, unchanged XP/credits.');
  console.log('LIMIT: embedded SQL does not prove concurrent connections or physical-device ingestion.');
} finally { await db.close(); }
