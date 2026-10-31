#!/usr/bin/env python3
"""Run the V1.1 postflight SELECT against the disposable bench, with rollback-only mutations."""
import json
from pathlib import Path
import subprocess
import sys

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit('Usage: test-v11-gates.py <psql and disposable DB arguments>')


def query(sql):
    result = subprocess.run(PSQL + ['-qAt', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


if not query('select current_database()').startswith('titan_test_'):
    sys.exit('Refused: the V1.1 gate tests require a titan_test_ disposable database')

ROOT = Path(__file__).resolve().parents[2]
versions = sorted(p.name[:14] for p in (ROOT / 'supabase/migrations').glob('*.sql') if p.name[:14] > '20261021020000')
assert len(versions) == 24, 'the V1.1 lot is twenty-four migrations'
SEED = 'insert into supabase_migrations.schema_migrations(version) values ' + ','.join(f"('{v}')" for v in versions) + ' on conflict(version) do nothing;'
SQL = (ROOT / 'tools/db/postflight-v11.sql').read_text().strip()
assert SQL.endswith(';')


def run(mutation=''):
    output = query(f"""begin;
set local lock_timeout='3s';
{SEED}
{mutation}
select row_to_json(r) from (
{SQL[:-1]}
) r;
rollback;""")
    rows = [json.loads(line) for line in output.splitlines()]
    assert rows and all(set(row) == {'check', 'blocking', 'ok', 'detail'} for row in rows), rows
    return [row for row in rows if row['blocking'] and row['ok'] is not True]


# The bench replays the files; its ledger is seeded here, inside the rolled-back transaction, like the V1 gates do.
failures = run()
assert not failures, f'postflight-v11 rejected the migrated bench: {failures}'
print('OK: postflight-v11 accepts the fully migrated bench.')


def negative(mutation, expected):
    failures = run(mutation)
    assert any(expected in row['check'] for row in failures), f'mutation {expected!r} was not caught: {failures}'
    print(f'RED confirmed: postflight-v11 blocks {expected}.')


negative(f"delete from supabase_migrations.schema_migrations where version='{versions[-1]}';", 'ledger:24 migrations')
negative("insert into supabase_migrations.schema_migrations(version) values ('29990101000000');", 'ledger:unexpected migration')
negative('grant select on private.titan_source_consents to authenticated;', 'private.titan_source_consents:API grants')
negative('alter table private.titan_daily_activity disable row level security;', 'private.titan_daily_activity:RLS')
negative('grant execute on function public.titan_import_activity_v1(text,text,text,timestamptz,numeric,numeric) to anon;', 'titan_import_activity_v1')
negative('drop index public.titan_moments_log_id_fk_idx;', 'public.titan_moments(log_id)')
negative('alter function public.titan_showcase_v1() reset search_path;', 'titan_showcase_v1')
negative('drop function public.titan_sources_v1();', 'titan_sources_v1')
negative('grant execute on function public.titan_garmin_ingest_v1(text,jsonb) to authenticated;', 'titan_garmin_ingest_v1')
negative('revoke execute on function public.titan_garmin_ingest_v1(text,jsonb) from service_role;', 'titan_garmin_ingest_v1')
negative('grant select on private.titan_garmin_links to anon;', 'private.titan_garmin_links:API grants')
negative('grant select on private.titan_garmin_tokens to authenticated;', 'private.titan_garmin_tokens:API grants')
negative('grant execute on function public.titan_garmin_tokens_get_v1(uuid) to authenticated;', 'titan_garmin_tokens_get_v1')
negative('drop trigger titan_garmin_links_erase_tokens on private.titan_garmin_links;', 'jetons Garmin effacés')
print('OK: every V1.1 gate probe rolled back.')
