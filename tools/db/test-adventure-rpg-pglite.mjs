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
  for (const f of migrations.filter((f) => f >= fix)) await run('supabase/migrations/'+f);
  await run('sql/tests/300_adventure_rpg.sql');
  await run('supabase/migrations/20261102140000_adventure_encounters.sql');
  await run('sql/tests/300_adventure_rpg.sql');
  await run('sql/tests/300_adventure_rpg_simulation.sql');
  console.log('GREEN: 28-day real-RPC simulation: seven disciplines, low/high volume, rest, manual/no-sensor, no double rewards.');
  console.log('GREEN: RPG restricted roles, idempotency, isolation, caps, candidate parity and additive migration reapplication.');
} finally { await db.close(); }
