#!/usr/bin/env python3
"""Exercise the real release SELECTs, with rollback-only disposable DB fixtures."""
import json
from pathlib import Path
import subprocess
import sys

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit('Usage: test-release-gates.py <psql and disposable DB arguments>')


def query(sql):
    result = subprocess.run(PSQL + ['-qAt', '-v', 'ON_ERROR_STOP=1'], input=sql,
                            text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


# First DB operation: no synthetic ledger, DDL or privilege probe before this guard.
if not query('select current_database()').startswith('titan_test_'):
    sys.exit('Refused: release gate tests require a titan_test_ disposable database')

ROOT = Path(__file__).resolve().parents[2]
BASE = '20261005230000'
versions = sorted(path.name[:14] for path in (ROOT / 'supabase/migrations').glob('*.sql')
                  if path.name[:14] > BASE)
assert len(versions) == 29, 'this release gate is scoped to the 29 pending migrations'
values = ','.join(f"('{version}')" for version in [BASE] + versions)
seed_ledger = f"""delete from supabase_migrations.schema_migrations where version > '{BASE}';
insert into supabase_migrations.schema_migrations(version) values {values}
on conflict(version) do nothing;"""


def gate(filename, setup, mutation=''):
    sql = (ROOT / 'tools/db' / filename).read_text().strip()
    assert sql.endswith(';'), 'gate must end with its SELECT terminator'
    # Execute the file's actual SELECT, not a test reimplementation of its checks.
    output = query(f"""begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
{setup}
{mutation}
select row_to_json(release_check) from (
{sql[:-1]}
) release_check;
rollback;""")
    rows = [json.loads(line) for line in output.splitlines()]
    assert rows and all(set(row) == {'check', 'blocking', 'ok', 'detail'} for row in rows), rows
    return rows


def blocking(rows):
    return [row for row in rows if row['blocking'] and row['ok'] is not True]


def positive(filename, setup):
    failures = blocking(gate(filename, setup))
    assert not failures, f'{filename} rejected its valid fixture: {failures}'


def negative(filename, setup, mutation, expected):
    failures = blocking(gate(filename, setup, mutation))
    assert any(expected in row['check'] for row in failures), \
        f'{filename} accepted mutation {expected!r}, or failed a different check: {failures}'
    print(f'RED confirmed: {filename} blocks {expected}.')


# Snapshot every piece the probes can change, to verify their transaction rollback.
snapshot_sql = """select jsonb_build_object(
  'ledger', (select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m),
  'tables', (select jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relrowsecurity,c.relacl) order by c.oid)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'),
  'functions', (select jsonb_agg(jsonb_build_array(p.oid,p.proname,p.proacl,p.proconfig) order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public'))
);"""
before = query(snapshot_sql)

positive('postflight-production.sql', seed_ledger)
print('OK: actual postflight accepts the fully migrated fixture with all 29 ledger entries.')
negative('postflight-production.sql', seed_ledger,
         f"delete from supabase_migrations.schema_migrations where version='{versions[-1]}';",
         'ledger:29 migrations')
negative('postflight-production.sql', seed_ledger,
         "insert into supabase_migrations.schema_migrations(version) values ('29990101000000');",
         'ledger:unexpected migration')
negative('postflight-production.sql', seed_ledger,
         'grant select on private.titan_feature_flags to authenticated;',
         'table:private.titan_feature_flags:API grants')
negative('postflight-production.sql', seed_ledger,
         'grant select(key) on private.titan_feature_flags to anon;',
         'table:private.titan_feature_flags:API grants')
negative('postflight-production.sql', seed_ledger,
         'alter table private.titan_feature_flags disable row level security;',
         'table:private.titan_feature_flags:RLS')
negative('postflight-production.sql', seed_ledger,
         'drop table private.titan_feature_flags;',
         'table:private.titan_feature_flags:RLS')
negative('postflight-production.sql', seed_ledger,
         'drop function public.titan_feature_flags_v1();',
         'rpc:public.titan_feature_flags_v1():grants')
negative('postflight-production.sql', seed_ledger,
         "drop function public.titan_feature_flags_v1();"
         "create function public.titan_feature_flags_v1() returns text language sql set search_path='' "
         "as $$select 'wrong return type'::text$$;"
         "revoke all on function public.titan_feature_flags_v1() from public;"
         "grant execute on function public.titan_feature_flags_v1() to anon,authenticated;",
         'rpc:public.titan_feature_flags_v1():signature')
negative('postflight-production.sql', seed_ledger,
         'revoke execute on function public.titan_entitlement_owner_v1(text,text) from service_role;',
         'rpc:public.titan_entitlement_owner_v1(text,text):grants')
negative('postflight-production.sql', seed_ledger,
         'grant execute on function public.titan_entitlement_owner_v1(text,text) to public;',
         'rpc:public.titan_entitlement_owner_v1(text,text):grants')
negative('postflight-production.sql', seed_ledger,
         'alter function private.titan_card_settings_json(public.titan_public_cards) reset search_path;',
         'serializer:search_path')

# Simulate the BEFORE state without committing or invoking a business RPC: hide only
# the four new table names and remove the synthetic pending versions from the ledger.
pre_setup = seed_ledger + f"\ndelete from supabase_migrations.schema_migrations where version > '{BASE}';\n"
for name in ['titan_entitlements', 'titan_retention_rules', 'titan_verification_requests', 'titan_feature_flags']:
    pre_setup += f'alter table private.{name} rename to release_gate_hidden_{name};\n'
positive('preflight-production.sql', pre_setup)
print('OK: actual preflight accepts the before-release fixture.')
negative('preflight-production.sql', pre_setup,
         f"delete from supabase_migrations.schema_migrations where version='{BASE}';"
         "insert into supabase_migrations.schema_migrations(version) values ('29990101000000');",
         'migration de base appliquée')
negative('preflight-production.sql', pre_setup,
         "insert into supabase_migrations.schema_migrations(version) values ('29990101000000');",
         'aucune migration ultérieure hors du lot 29')
negative('preflight-production.sql', pre_setup,
         f"insert into supabase_migrations.schema_migrations(version) values ('{versions[0]}');",
         'aucune des 29 migrations')
negative('preflight-production.sql', pre_setup,
         'alter table private.release_gate_hidden_titan_feature_flags rename to titan_feature_flags;',
         'aucun objet 24-27')

assert query(snapshot_sql) == before, 'release gate fixtures escaped their ROLLBACK'
print('OK: all ledger, catalog, grant and search_path probes rolled back; no fixture remains.')
