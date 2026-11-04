#!/usr/bin/env python3
"""Real overlapping API calls, exclusively against a disposable titan_test_ database."""
import json
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit('Usage: test-training-rate-concurrency.py <psql and disposable DB arguments>')


def query(sql):
    r = subprocess.run(PSQL + ['-At'], input=sql, text=True, capture_output=True, timeout=15)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


if not query('select current_database()').startswith('titan_test_'):
    sys.exit('Refused: training rate concurrency tests require a titan_test_ disposable database')

owner, event, other_event, marker = [str(uuid.uuid4()) for _ in range(4)]
stamp = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
processes = []


def call(event_id):
    return f"""select row_to_json(r) from public.titan_submit_training_session('yoga','mobility',1,'min',
'{{"client_event_id":"{event_id}"}}','{stamp}') r;"""


def overlap(first_call, second_call):
    with tempfile.TemporaryFile(mode='w+') as fi, tempfile.TemporaryFile(mode='w+') as si, \
         tempfile.TemporaryFile(mode='w+') as fo, tempfile.TemporaryFile(mode='w+') as so:
        setup = f"""begin;set local statement_timeout='10s';set local lock_timeout='8s';
set local role authenticated;set local request.jwt.claims='{{"sub":"{owner}","role":"authenticated"}}';
"""
        fi.write(f"set application_name='rate_first_{marker}';\n{setup}{first_call}\nselect pg_sleep(2);\ncommit;\n")
        si.write(f"set application_name='rate_second_{marker}';\n{setup}{second_call}\ncommit;\n")
        fi.seek(0)
        first = subprocess.Popen(PSQL + ['-At'], stdin=fi, stdout=fo, stderr=fo)
        processes.append(first)

        def observe(predicate):
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if query(predicate) == 't':
                    return
                if first.poll() is not None:
                    fo.seek(0)
                    raise AssertionError('holder ended before overlap: ' + fo.read())
                time.sleep(.03)
            raise AssertionError('expected overlapping wait was not observed')

        observe(f"select exists(select 1 from pg_stat_activity where application_name='rate_first_{marker}' and wait_event='PgSleep')")
        si.seek(0)
        second = subprocess.Popen(PSQL + ['-At'], stdin=si, stdout=so, stderr=so)
        processes.append(second)
        observe(f"""select exists(select 1 from pg_stat_activity a,pg_stat_activity b where
 a.application_name='rate_second_{marker}' and a.wait_event_type='Lock'
 and b.application_name='rate_first_{marker}' and b.pid=any(pg_blocking_pids(a.pid)))""")
        first.wait(timeout=12)
        second.wait(timeout=12)
        fo.seek(0)
        so.seek(0)
        outputs = [fo.read().strip(), so.read().strip()]
        if first.returncode or second.returncode:
            raise AssertionError('\n'.join(outputs))
        # pg_sleep produces only a blank row; each call deliberately emits exactly one JSON row.
        return [json.loads(output) for output in outputs]


try:
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
insert into private.titan_training_rate_state(user_id,action,times)
values('{owner}','create',array_fill(clock_timestamp(),array[11]));""")
    denied = f"""do $$ begin
begin perform public.titan_submit_training_session('yoga','mobility',1,'min',
'{{"client_event_id":"{other_event}"}}','{stamp}');
raise exception 'ASSERT: concurrent final allowance reused';
exception when check_violation then assert sqlerrm='TRAINING_RATE_LIMIT',sqlerrm;end;
end $$;select '{{"denied":true}}'::json;"""
    first, second = overlap(call(event), denied)
    assert first['log_id'] and second == {'denied': True}
    query(f"""do $$ begin
assert (select count(*)=1 from public.training_logs where user_id='{owner}'),'one activity';
assert (select count(*)=1 from public.training_receipts where user_id='{owner}'),'one receipt';
assert (select cardinality(times)=12 from private.titan_training_rate_state where user_id='{owner}' and action='create'),'one allowance';
end $$;""")
    replay_a, replay_b = overlap(call(event), call(event))
    assert first == replay_a == replay_b, 'overlapping exhausted-quota retries must return identical receipt'
    query(f"""do $$ begin
assert (select count(*)=1 from public.training_logs where user_id='{owner}'),'no replay duplication';
assert (select cardinality(times)=12 from private.titan_training_rate_state where user_id='{owner}' and action='create'),'replay consumes no allowance';
end $$;""")
    print('OK: overlapping final allowance accepted once; exhausted-quota replays unchanged.')
finally:
    for p in processes:
        if p.poll() is None:
            p.kill()
            p.wait(timeout=5)
    query(f"delete from auth.users where id='{owner}'")
