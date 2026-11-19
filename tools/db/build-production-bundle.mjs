#!/usr/bin/env node
// Builds the production application bundle for pending migrations, straight from supabase/migrations/ (never retyped: retyping a
// body by hand is what caused drift D1 on production, see docs/v131/lot1-securite.md).
//
//   node tools/db/build-production-bundle.mjs [--after 20261110130137] [--out supabase/release-v131]
//
// For every migration newer than --after (the last version already in production's registry) it writes one file:
//   begin;  guard (the previous version is registered, this one is not)  ·  the repository file, byte for byte  ·
//   insert into the registry with the file's own version and name  ·  commit;
// A failed guard or statement aborts that transaction only: nothing of that migration is kept and the same file can be replayed.
// It also writes 00-check-before.sql and 99-check-after.sql (read-only) with the function fingerprints expected before and after,
// measured on a replica built from this repository (tools/db/test-migrations.sh). Running the files in name order is the procedure.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
// One entry per production bundle. `after` is the last version already in production's registry when the bundle starts,
// `until` its last migration. `before` and `expected` are function fingerprints (FINGERPRINT_SQL) measured on a replica built from
// this repository: production must show `before` when the bundle starts and `expected` once it has run.
export const BUNDLES = {
  // Applied to production on 16 November 2026: frozen. Production started with drift D1 (one body retyped by hand, repaired by
  // 20261114170000), hence a `before` that differs from a clean replica (private bodies 37dc682f45a7 there).
  v131: {
    out: "supabase/release-v131", after: "20261110130137", until: "20261116110000",
    before: { private: [86, "cc64c1801f5b", "a8ec1799e8ca"], public: [284, "c2b8fedba4b1", "264867cf5abc"] },
    expected: { private: [91, "bae05c10ca57", "d52d12beba17"], public: [293, "db4eeb91a3d2", "8f112d92ff21"] },
    beforeLabel: "Before the bundle (production with drift D1, or a clean replica: one of the two)",
    beforeNote: "On a replica built from the repository the private bodies read 37dc682f45a7 instead (no D1).",
    afterNote: "Then run tools/db/postflight-v13.sql and tools/db/postflight-v131.sql: every row true.",
  },
  // TITAN LIVE and the Android features of 15 and 16 November. Applied in production on 17 Nov 2026 (registry 130, head 20261117170000); additive, rehearsed on a replica.
  v14: {
    out: "supabase/release-v14", after: "20261116110000", until: "20261117170000",
    before: { private: [91, "bae05c10ca57", "d52d12beba17"], public: [293, "db4eeb91a3d2", "8f112d92ff21"] },
    expected: { private: [103, "78dde17392e0", "4f6481c4b912"], public: [309, "5eb4c4873e06", "95c0de5e6ce0"] },
    beforeNote: "This is the state production reached on 16 November 2026 (end of the V1.3.1 bundle).",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // Sport excellence (lot C, 18 November 2026): imports linked across neighbouring sport ids, watch swims in metres, the Strava
  // history archivable. APPLIED in production on 18 Nov 2026 (registry 141, head 20261122090000); additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_sport_excellence_imports.sql).
  v15: {
    out: "supabase/release-v15", after: "20261117170000", until: "20261118090000",
    before: { private: [103, "78dde17392e0", "4f6481c4b912"], public: [309, "5eb4c4873e06", "95c0de5e6ce0"] },
    expected: { private: [104, "7772609c3673", "ccca14f98fa2"], public: [309, "5eb4c4873e06", "b4dbcb08ceb1"] },
    beforeNote: "This is the state production reaches at the end of the v14 bundle.",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // TITAN LIVE seed v2 (19 November 2026): the report missions follow the sport measure contracts; eleven missions that
  // targeted a statistic no entry form asks for any more are removed from the seeded table. APPLIED in production on 18 Nov 2026. Data only: no
  // function is created or changed, so the fingerprint is the one the v15 bundle leaves.
  v16: {
    out: "supabase/release-v16", after: "20261118090000", until: "20261119090000",
    before: { private: [104, "7772609c3673", "ccca14f98fa2"], public: [309, "5eb4c4873e06", "b4dbcb08ceb1"] },
    expected: { private: [104, "7772609c3673", "ccca14f98fa2"], public: [309, "5eb4c4873e06", "b4dbcb08ceb1"] },
    beforeNote: "This is the state production reaches at the end of the v15 bundle.",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // Social excellence (« Opération Connexion », 20 November 2026): personal friend links, request expiry, blocks list, the social
  // limits that never applied, confirmed sessions only in every collective count, Duo outcome, club goal, the Grande Cordée and the
  // « Depuis ta dernière visite » digest. APPLIED in production on 18 Nov 2026 (registry 141, head 20261122090000); additive, rehearsed on a replica (tools/db/test-migrations.sh).
  v17: {
    out: "supabase/release-v17", after: "20261119090000", until: "20261120120000",
    before: { private: [104, "7772609c3673", "ccca14f98fa2"], public: [309, "5eb4c4873e06", "b4dbcb08ceb1"] },
    expected: { private: [116, "365bcfe300a2", "644cad28a912"], public: [320, "28448708715e", "bc974d683fad"] },
    beforeNote: "This is the state production reaches at the end of the v16 bundle.",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // Monetisation (21 November 2026): access summary refreshed without events, pending/held purchases re-read, product mapping seeded,
  // coach places enforced on every coach action (links beyond them paused), routine library cap, no achievement credits from unconfirmed
  // sessions, hold release that never pays an archived or excluded session. APPLIED in production on 18 Nov 2026 (registry 141, head 20261122090000); additive, rehearsed on a replica
  // (tools/db/test-migrations.sh, sql/tests/300_monetisation_*.sql). None of its functions is touched by v15 to v17: the chain order is kept
  // only so that each bundle's fingerprint check stays exact.
  v18: {
    out: "supabase/release-v18", after: "20261120120000", until: "20261121130000",
    before: { private: [116, "365bcfe300a2", "644cad28a912"], public: [320, "28448708715e", "bc974d683fad"] },
    expected: { private: [120, "0c180d72fbc0", "d8ef8377869f"], public: [321, "32c8b51edcd3", "eba6a58d9dff"] },
    beforeNote: "This is the state production reaches at the end of the v17 bundle.",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // Incident of 18 November 2026 (play-notifications answered 503 to every Google push while billing was off, ~40 000 calls a day):
  // a private inbox keeps each notification so the function can acknowledge it and play-reconcile processes it once billing is on.
  // Additive, service role only, rehearsed on a replica (sql/tests/300_play_notification_inbox.sql).
  v20: {
    out: "supabase/release-v20", after: "20261121130000", until: "20261122090000",
    before: { private: [120, "0c180d72fbc0", "d8ef8377869f"], public: [321, "32c8b51edcd3", "eba6a58d9dff"] },
    expected: { private: [120, "0c180d72fbc0", "d8ef8377869f"], public: [324, "39442f678587", "81ad6534245e"] },
    beforeNote: "This is the state production reaches at the end of the v18 bundle (v19, the coach-places decision of PR #155, is not part of this chain).",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  v21: {
    out: "supabase/release-v21", after: "20261122090000", until: "20261123090000",
    before: { private: [120, "0c180d72fbc0", "d8ef8377869f"], public: [324, "39442f678587", "81ad6534245e"] },
    expected: { private: [125, "0b105d34fc7e", "809e0bdfcde5"], public: [326, "9f567056c13c", "e0dde86d6cd9"] },
    beforeNote: "This is the state production reached on 18 November 2026 (end of the v20 bundle).",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // V1.5.1 Gardiens (19 November 2026): the Veilleur de pierre observed, prepared and resolved at the end of the V1.5.0 pilot arc.
  // NOT applied in production; needs v21 first. Additive, rehearsed on a replica (sql/tests/300_adventure_guardian.sql,
  // tools/db/test-guardian-concurrency.py).
  v22: {
    out: "supabase/release-v22", after: "20261123090000", until: "20261124090000",
    before: { private: [125, "0b105d34fc7e", "809e0bdfcde5"], public: [326, "9f567056c13c", "e0dde86d6cd9"] },
    expected: { private: [130, "ebc46a7040a1", "7f53e75106be"], public: [328, "f44ab17c4f6a", "34d2553fef69"] },
    beforeNote: "This is the state production reaches at the end of the v21 bundle (V1.5.0 Bifurcations).",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // V1.5.2 Camp et conséquences (19 November 2026): the Veilleur's canonical outcome becomes a lasting access in the Vallée, linked
  // from the Camp de base. NOT applied in production; needs v21 and v22 first. Additive, rehearsed on a replica
  // (sql/tests/300_adventure_consequence.sql, tools/db/test-consequence-concurrency.py).
  v23: {
    out: "supabase/release-v23", after: "20261124090000", until: "20261125090000",
    before: { private: [130, "ebc46a7040a1", "7f53e75106be"], public: [328, "f44ab17c4f6a", "34d2553fef69"] },
    expected: { private: [135, "9417a75d67f2", "cf67364e872e"], public: [330, "0efd66f97b73", "0b22635807ac"] },
    beforeNote: "This is the state production reaches at the end of the v22 bundle (V1.5.1 Gardiens).",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
  // V1.5.3 Quatre mondes, quatre mécaniques (19 November 2026): the common campaign configuration gives the Marées, the Forge and
  // the Aurores a first arc on the V1.5.0/V1.5.1 engine, each with its own mechanic. NOT applied in production; needs v21, v22 and
  // v23 first. Additive, rehearsed on a replica (sql/tests/300_adventure_campaigns.sql, tools/db/test-campaign-concurrency.py).
  v24: {
    out: "supabase/release-v24", after: "20261125090000", until: "20261126090000",
    before: { private: [135, "9417a75d67f2", "cf67364e872e"], public: [330, "0efd66f97b73", "0b22635807ac"] },
    expected: { private: [142, "0da9bf507878", "cc96ce5701e7"], public: [332, "4492e54bef34", "21b4c505589d"] },
    beforeNote: "This is the state production reaches at the end of the v23 bundle (V1.5.2 Camp et conséquences).",
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  },
};
const NAME = opt("--bundle", "v131");
if (!BUNDLES[NAME]) throw new Error(`unknown bundle ${NAME}: ${Object.keys(BUNDLES).join(", ")}`);

export const FINGERPRINT_SQL = `select n.nspname as schema, count(*) as fonctions,
  substr(md5(string_agg(p.oid::regprocedure::text || '|' || p.prosecdef || has_function_privilege('anon', p.oid, 'EXECUTE') || has_function_privilege('authenticated', p.oid, 'EXECUTE')
    || coalesce(array_to_string(p.proconfig, ','), ''), ';' order by p.oid::regprocedure::text collate "C")), 1, 12) as droits,
  substr(md5(string_agg(p.oid::regprocedure::text || '|' || md5(lower(regexp_replace(regexp_replace(p.prosrc, '--[^\\n\\r]*', '', 'g'), '\\s+', '', 'g'))), ';'
    order by p.oid::regprocedure::text collate "C") filter (where p.proname not in ('handle_audit_log', 'titan_session_exclusion_v1'))), 1, 12) as corps
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') group by 1 order by 1`;

export function pendingMigrations(name = NAME) {
  const { after, until } = BUNDLES[name];
  return readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f) && f.slice(0, 14) > after && f.slice(0, 14) <= until)
    .sort()
    .map((file) => ({ file, version: file.slice(0, 14), name: file.slice(15, -4), sql: readFileSync(join(ROOT, "supabase/migrations", file), "utf8") }));
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function wrap(m, previous) {
  if (/^\s*(begin|commit|rollback)\s*;/im.test(m.sql)) throw new Error(`${m.file} manages its own transaction: it cannot be bundled`);
  return [
    `-- ${m.file}: generated by tools/db/build-production-bundle.mjs from the repository file, do not edit.`,
    "begin;",
    "do $titan_guard$ begin",
    `  if exists (select 1 from supabase_migrations.schema_migrations where version = ${lit(m.version)}) then`,
    `    raise exception 'migration ${m.version} is already registered: nothing to do';`,
    "  end if;",
    `  if not exists (select 1 from supabase_migrations.schema_migrations where version = ${lit(previous)}) then`,
    `    raise exception 'migration ${previous} must be registered before ${m.version}';`,
    "  end if;",
    "end $titan_guard$;",
    "-- >>> repository file, byte for byte",
    m.sql.replace(/\s*$/, ""),
    "-- <<< repository file",
    `insert into supabase_migrations.schema_migrations (version, name) values (${lit(m.version)}, ${lit(m.name)});`,
    "commit;",
    "",
  ].join("\n");
}

function check(label, expected) {
  const rows = Object.entries(expected)
    .map(([schema, [n, rights, bodies]]) => `(${lit(schema)}, ${n}, ${lit(rights)}, ${lit(bodies)})`)
    .join(", ");
  return [
    `-- Read-only. ${label}: every row must show ok = true.`,
    `with expected(schema, fonctions, droits, corps) as (values ${rows}), actual as (`,
    FINGERPRINT_SQL,
    ")",
    "select e.schema, a.fonctions, a.droits, a.corps,",
    "  (a.fonctions = e.fonctions and a.droits = e.droits and a.corps = e.corps) as ok",
    "from expected e left join actual a on a.schema = e.schema order by 1;",
    "",
  ].join("\n");
}

export function build(name = NAME) {
  const bundle = BUNDLES[name];
  const list = pendingMigrations(name);
  const files = { "00-check-before.sql": check(bundle.beforeLabel ?? "Before the bundle", bundle.before) + `\n-- ${bundle.beforeNote}\n` };
  list.forEach((m, i) => {
    files[`${String(i + 1).padStart(2, "0")}-${m.file}`] = wrap(m, i === 0 ? bundle.after : list[i - 1].version);
  });
  files["99-check-after.sql"] = check("After the bundle", bundle.expected) + `\n-- ${bundle.afterNote}\n`;
  return { list, files, out: bundle.out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { list, files, out } = build();
  const OUT = join(ROOT, out);
  mkdirSync(OUT, { recursive: true });
  // Only the generated SQL is replaced: the README beside it is written by hand.
  for (const f of readdirSync(OUT)) if (f.endsWith(".sql")) rmSync(join(OUT, f));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(OUT, name), text);
  console.log(`${list.length} migrations after ${BUNDLES[NAME].after} → ${OUT}`);
  for (const name of Object.keys(files)) console.log("  " + name);
}
