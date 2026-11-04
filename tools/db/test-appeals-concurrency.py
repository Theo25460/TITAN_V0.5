#!/usr/bin/env python3
"""Appeal RPC races on real connections, only inside a disposable titan_test_ database."""
import json
import subprocess
import sys
import tempfile
import time
import uuid

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit('Usage: test-appeals-concurrency.py <psql and disposable DB arguments>')


def query(sql):
    result = subprocess.run(PSQL + ['-qAt', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


# This is intentionally the first database operation, before fixtures or mutation probes.
if not query('select current_database()').startswith('titan_test_'):
    sys.exit('Refused: appeals concurrency tests require a titan_test_ disposable database')

admin, second_admin = str(uuid.uuid4()), str(uuid.uuid4())
owners, processes = [], []


def api(actor, expression):
    return f"""set local role authenticated;
set local request.jwt.claims='{{"sub":"{actor}","role":"authenticated"}}';
select {expression};"""


def submit(session):
    return f"public.titan_appeal_submit_v1('session','{session}','Je conteste cette exclusion avec son contexte.')"


def refused(actor, expression, state, message):
    return f"""set local role authenticated;
set local request.jwt.claims='{{"sub":"{actor}","role":"authenticated"}}';
do $test$ begin
  begin perform {expression};
  exception when sqlstate '{state}' then
    if sqlerrm <> '{message}' then raise; end if;
    return;
  end;
  raise exception 'ASSERT_EXPECTED_{message}';
end $test$;
select '{{"error":"{message}"}}'::json;"""


def overlap(first_sql, second_sql, commit=True):
    """Observe an actual blocking edge; timing alone is never accepted as overlap."""
    marker = uuid.uuid4().hex
    with tempfile.TemporaryFile(mode='w+') as fi, tempfile.TemporaryFile(mode='w+') as si, \
         tempfile.TemporaryFile(mode='w+') as fo, tempfile.TemporaryFile(mode='w+') as so:
        prefix = "begin;set local statement_timeout='10s';set local lock_timeout='8s';\n"
        fi.write(f"set application_name='appeal_first_{marker}';\n{prefix}{first_sql}\n"
                 f"select pg_sleep(2);\n{'commit' if commit else 'rollback'};\n")
        si.write(f"set application_name='appeal_second_{marker}';\n{prefix}{second_sql}\ncommit;\n")
        fi.seek(0)
        first = subprocess.Popen(PSQL + ['-qAt', '-v', 'ON_ERROR_STOP=1'], stdin=fi, stdout=fo, stderr=fo)
        processes.append(first)
        second = None

        def observe(predicate):
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if query(predicate) == 't':
                    return
                if first.poll() is not None or (second is not None and second.poll() is not None):
                    fo.seek(0)
                    so.seek(0)
                    raise AssertionError('connection ended before observed blocking: ' + fo.read() + so.read())
                time.sleep(.03)
            raise AssertionError('expected blocking edge was not observed')

        try:
            observe(f"select exists(select 1 from pg_stat_activity where application_name='appeal_first_{marker}' and wait_event='PgSleep')")
            si.seek(0)
            second = subprocess.Popen(PSQL + ['-qAt', '-v', 'ON_ERROR_STOP=1'], stdin=si, stdout=so, stderr=so)
            processes.append(second)
            observe(f"""select exists(select 1 from pg_stat_activity a,pg_stat_activity b where
 a.application_name='appeal_second_{marker}' and a.wait_event_type='Lock'
 and b.application_name='appeal_first_{marker}' and b.pid=any(pg_blocking_pids(a.pid)))""")
            first.wait(timeout=12)
            second.wait(timeout=12)
            fo.seek(0)
            so.seek(0)
            outputs = [fo.read().strip(), so.read().strip()]
            if first.returncode or second.returncode:
                raise AssertionError('\n'.join(outputs))
            return [json.loads(output) for output in outputs]
        finally:
            # A failed probe must release its locks before cleanup or another scenario.
            for process in [first, second]:
                if process is not None and process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)


def seed():
    owner = str(uuid.uuid4())
    owners.append(owner)
    sessions = [str(uuid.uuid4()) for _ in range(6)]
    rows = ','.join(f"('{s}','{owner}','running','cardio',5,'km',10,now()-interval '{i+1} days',"
                    "'{\"duration\":30}',true,'suspicious')" for i, s in enumerate(sessions))
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious,status) values {rows};""")
    return owner, sessions


def count_open(owner):
    return int(query(f"select count(*) from private.titan_appeals where user_id='{owner}' and status='open'"))


def last_slot():
    owner, sessions = seed()
    for session in sessions[:4]:
        query(f'begin;{api(owner, submit(session))}commit;')
    results = overlap(api(owner, submit(sessions[4])),
                      refused(owner, submit(sessions[5]), '23514', 'APPEAL_LIMIT'))
    assert results[0]['status'] == 'open' and results[1] == {'error': 'APPEAL_LIMIT'}
    assert count_open(owner) == 5, 'one last place, never six open appeals'
    return owner, sessions


original_submit = None
try:
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{admin}','{{}}'),('{second_admin}','{{}}');
update public.profiles set role='admin' where id in ('{admin}','{second_admin}');""")

    # Sensitivity: deliberately weaken only the disposable copy, then restore its exact definition.
    original_submit = json.loads(query("select to_json(pg_get_functiondef('public.titan_appeal_submit_v1(text,uuid,text)'::regprocedure))"))
    weakened = original_submit.replace("status = 'open') >= 5", "status = 'open') >= 6")
    assert weakened != original_submit, 'cap mutation must find the intended guard'
    try:
        query(weakened)
        try:
            last_slot()
        except AssertionError as error:
            assert 'ASSERT_EXPECTED_APPEAL_LIMIT' in str(error), str(error)
            print('RED confirmed: concurrent last-slot test rejects a weakened six-appeal cap.')
        else:
            raise AssertionError('cap mutation escaped the concurrency contract')
    finally:
        query(original_submit)

    owner, sessions = seed()
    first, second = overlap(api(owner, submit(sessions[0])),
                            refused(owner, submit(sessions[0]), '23505', 'APPEAL_ALREADY_OPEN'))
    assert first['status'] == 'open' and second == {'error': 'APPEAL_ALREADY_OPEN'}
    assert count_open(owner) == 1, 'double filing creates exactly one appeal'
    print('OK: same-object filings overlap, one appeal survives, duplicate explicitly refused.')

    owner, sessions = last_slot()
    # An actual refused transaction has ended; close one appeal and retry the previously refused object.
    appeal = query(f"select id from private.titan_appeals where user_id='{owner}' order by id limit 1")
    decline = f"public.titan_appeal_decide_v1({appeal},false,'Contexte insuffisant.')"
    query(f'begin;{api(admin, decline)}commit;')
    retried = json.loads(query(f'begin;{api(owner, submit(sessions[5]))}commit;'))
    assert retried['status'] == 'open' and count_open(owner) == 5
    print('OK: the fifth place is accepted once; a refused transaction can retry after a place is freed.')

    owner, sessions = seed()
    rolled_back, committed = overlap(api(owner, submit(sessions[0])), api(owner, submit(sessions[0])), commit=False)
    assert rolled_back['id'] != committed['id'] and count_open(owner) == 1
    assert query(f"select id from private.titan_appeals where user_id='{owner}'") == str(committed['id'])
    print('OK: a rolled-back filing releases its lock and leaves only the waiting request committed.')

    for accepted, rollback in [(True, False), (False, False), (True, True)]:
        owner, sessions = seed()
        appeal = json.loads(query(f'begin;{api(owner, submit(sessions[0]))}commit;'))['id']
        profile_before = query(f"select to_jsonb(p) from public.profiles p where id='{owner}'")
        untouched_before = query(f"select jsonb_agg(to_jsonb(l) order by id) from public.training_logs l where user_id='{owner}' and id<>'{sessions[0]}'")
        decide = f"public.titan_appeal_decide_v1({appeal},{str(accepted).lower()},'Première décision vérifiée.')"
        other = f"public.titan_appeal_decide_v1({appeal},{str(not accepted).lower()},'Seconde décision vérifiée.')"
        results = overlap(api(admin, decide), api(second_admin, other) if rollback else
                          refused(second_admin, other, '23514', 'APPEAL_CLOSED'), commit=not rollback)
        final_accepted = not accepted if rollback else accepted
        expected = 'accepted' if final_accepted else 'declined'
        assert results[0]['status'] == ('accepted' if accepted else 'declined')
        assert results[1] == ({'version': 1, 'id': appeal, 'status': expected} if rollback else {'error': 'APPEAL_CLOSED'})
        expected_admin = second_admin if rollback else admin
        record = json.loads(query(f"select jsonb_build_object('status',status,'admin',decided_by) from private.titan_appeals where id={appeal}"))
        assert record == {'status': expected, 'admin': expected_admin}
        assert query(f"select count(*) from public.titan_admin_audit where target_user_id='{owner}' and action='appeal.decision'") == '1'
        assert query(f"select count(*) from public.titan_admin_audit where target_user_id='{owner}' and action='session.exclusion'") == ('1' if final_accepted else '0')
        assert query(f"select is_suspicious from public.training_logs where id='{sessions[0]}'") == ('f' if final_accepted else 't')
        assert query(f"select to_jsonb(p) from public.profiles p where id='{owner}'") == profile_before, 'no XP/coins/profile mutation'
        assert query(f"select jsonb_agg(to_jsonb(l) order by id) from public.training_logs l where user_id='{owner}' and id<>'{sessions[0]}'") == untouched_before
        visible = json.loads(query(f'begin;{api(owner, "public.titan_my_appeals_v1()")}commit;'))['appeals'][0]
        assert visible['status'] == expected and visible['decisionNote'] == ('Seconde décision vérifiée.' if rollback else 'Première décision vérifiée.')
        print(f'OK: decision overlap accepted={accepted} rollback={rollback}; one audit, correct effect and player-visible note.')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
    if original_submit is not None:
        query(original_submit)
    # Delete synthetic audits explicitly before FK SET NULL would anonymise their fixture owner.
    ids = ','.join(f"'{value}'" for value in owners + [admin, second_admin])
    query(f"delete from public.titan_admin_audit where target_user_id in ({ids}) or admin_id in ({ids});delete from auth.users where id in ({ids});")
