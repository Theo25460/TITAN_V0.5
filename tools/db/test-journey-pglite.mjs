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
  await db.exec("insert into supabase_migrations.schema_migrations(version) values ('20261105213712') on conflict do nothing;");
  const postflight = async () => (await db.query(read('tools/db/postflight-v13.sql'))).rows.filter((row) => row.blocking && row.ok !== true);
  assert.deepEqual(await postflight(), [], 'V1.3 postflight must accept the migrated structure');
  for (const [mutation, expected] of [
    ["delete from supabase_migrations.schema_migrations where version='20261105213712';", 'ledger:V1.3'],
    ["insert into supabase_migrations.schema_migrations(version) values ('20261105000001');", 'ledger:unexpected V1.3'],
    ['grant update on private.titan_journey_acquisitions to authenticated;', 'titan_journey_acquisitions:API privileges'],
    ['alter table private.titan_journey_configs disable row level security;', 'titan_journey_configs:RLS'],
    ['alter function public.titan_journey_snapshot_v1() volatile;', 'public.titan_journey_snapshot_v1():contract'],
    ['grant execute on function public.titan_journey_sync_v1() to anon;', 'public.titan_journey_sync_v1():API privileges'],
    ['grant execute on function private.titan_journey_days_v1() to authenticated;', 'private.titan_journey_days_v1():API privileges'],
    ['grant insert on private.titan_journey_verified_days to authenticated;', 'titan_journey_verified_days:API privileges'],
    ['grant execute on function public.titan_journey_attest_day_v1(text,text,date,integer) to authenticated;', 'public.titan_journey_attest_day_v1(text,text,date,integer):API privileges'],
    ['revoke execute on function private.titan_journey_attest_day_v1(text,text,date,integer) from service_role;', 'private.titan_journey_attest_day_v1(text,text,date,integer):API privileges'],
    ['alter table private.titan_journey_acquisitions drop constraint titan_journey_acquisitions_pkey;', 'acquisitions:unique owner track id'],
    ["create or replace function private.titan_export_extras_v1(p_uid uuid) returns jsonb language sql stable security definer set search_path='' as $$select '{}'::jsonb;$$;", 'export:journey and predecessor'],
  ]) {
    await db.exec('begin;' + mutation);
    assert((await postflight()).some((row) => row.check.includes(expected)), 'postflight missed ' + expected);
    await db.exec('rollback;');
  }
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
  console.log('GREEN: V1.3 postflight and twelve negative probes for migration history, RLS, privileges, snapshot volatility, journal uniqueness and export.');
  console.log('LIMIT: embedded SQL does not prove concurrent connections or physical-device ingestion.');
} finally { await db.close(); }
