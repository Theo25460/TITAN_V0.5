#!/usr/bin/env python3
"""Real overlapping connections for reward holds and appeals, exclusively against a disposable titan_test_ database.
1. the hourly release job racing an administrator's exclusion: an excluded session never receives its held reward;
2. two administrators deciding the same appeal: exactly one decision;
3. a player filing their fifth and sixth open appeal at once: exactly one succeeds."""
import json
import subprocess
import sys
import tempfile
import time
import uuid

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit('Usage: test-reward-appeal-concurrency.py <psql and disposable DB arguments>')


def query(sql):
    r = subprocess.run(PSQL + ['-At'], input=sql, text=True, capture_output=True, timeout=20)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


if not query('select current_database()').startswith('titan_test_'):
    sys.exit('Refused: reward and appeal concurrency tests require a titan_test_ disposable database')

marker = str(uuid.uuid4())
admin1, admin2, player = [str(uuid.uuid4()) for _ in range(3)]
processes = []


def run(script_first, script_second, sub_first=None, sub_second=None, role_first='authenticated', role_second='authenticated'):
    """Start the first script, wait until it sleeps while holding its locks, start the second, wait until it is blocked."""
    def preamble(sub, role):
        claims = f"set local request.jwt.claims='{{\"sub\":\"{sub}\",\"role\":\"authenticated\"}}';" if sub else ''
        who = f"set local role {role};" if role else ''
        return f"begin;set local statement_timeout='12s';set local lock_timeout='10s';{who}{claims}\n"

    with tempfile.TemporaryFile(mode='w+') as fi, tempfile.TemporaryFile(mode='w+') as si, \
         tempfile.TemporaryFile(mode='w+') as fo, tempfile.TemporaryFile(mode='w+') as so:
        fi.write(f"set application_name='ra_first_{marker}';\n{preamble(sub_first, role_first)}{script_first}\nselect pg_sleep(2);\ncommit;\n")
        si.write(f"set application_name='ra_second_{marker}';\n{preamble(sub_second, role_second)}{script_second}\ncommit;\n")
        fi.seek(0)
        first = subprocess.Popen(PSQL + ['-At'], stdin=fi, stdout=fo, stderr=fo)
        processes.append(first)

        def observe(predicate):
            deadline = time.monotonic() + 9
            while time.monotonic() < deadline:
                if query(predicate) == 't':
                    return
                if first.poll() is not None:
                    fo.seek(0)
                    raise AssertionError('holder ended before overlap: ' + fo.read())
                time.sleep(.03)
            raise AssertionError('expected overlapping wait was not observed')

        observe(f"select exists(select 1 from pg_stat_activity where application_name='ra_first_{marker}' and wait_event='PgSleep')")
        si.seek(0)
        second = subprocess.Popen(PSQL + ['-At'], stdin=si, stdout=so, stderr=so)
        processes.append(second)
        observe(f"""select exists(select 1 from pg_stat_activity a,pg_stat_activity b where
 a.application_name='ra_second_{marker}' and a.wait_event_type in ('Lock')
 and b.application_name='ra_first_{marker}' and b.pid=any(pg_blocking_pids(a.pid)))""")
        first.wait(timeout=15)
        second.wait(timeout=15)
        fo.seek(0)
        so.seek(0)
        outputs = [fo.read().strip(), so.read().strip()]
        if first.returncode or second.returncode:
            raise AssertionError('\n'.join(outputs))
        return outputs


try:
    # Committed fixtures (cleaned up below): two administrators, one player with a high-risk held session.
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{admin1}','{{}}'),('{admin2}','{{}}'),('{player}','{{}}');
update public.profiles set role='admin' where id in ('{admin1}','{admin2}');
update public.profiles set credits=100, xp=0, level=1 where id='{player}';""")

    # 1. release job vs exclusion ------------------------------------------------------------------------------------
    session = str(uuid.uuid4())
    query(f"""set session_replication_role = replica;
insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details)
values ('{session}','{player}','running','cardio',20,'km',600,now()-interval '2 hours','{{"duration":60}}');
insert into private.titan_reward_holds(log_id,user_id,xp,credits,release_at)
values ('{session}','{player}',600,60,now()-interval '1 minute');""")
    before = query(f"select credits||':'||xp||':'||level from public.profiles where id='{player}'")
    # First connection (administrator) excludes the session and keeps its transaction open; the job starts afterwards,
    # reads the still-visible session as not excluded, and must wait on the hold row.
    out = run(f"select public.titan_session_exclusion_v1('{session}',true,'verification concurrente');",
              "select private.titan_release_due_reward_holds();",
              sub_first=admin1, role_first='authenticated', sub_second=None, role_second=None)
    after = query(f"select credits||':'||xp||':'||level from public.profiles where id='{player}'")
    status = query(f"select status from private.titan_reward_holds where log_id='{session}'")
    assert before == after, f'an excluded session received its held reward: {before} -> {after}'
    assert status == 'cancelled', f'hold should be cancelled, is {status}'

    # 2. two administrators decide the same appeal -------------------------------------------------------------------
    session2 = str(uuid.uuid4())
    query(f"""set session_replication_role = replica;
insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious,status)
values ('{session2}','{player}','running','cardio',5,'km',1,now()-interval '1 day','{{"duration":30}}',true,'suspicious');
insert into private.titan_appeals(user_id,kind,session_id,message) values ('{player}','session','{session2}','message de test concurrent');""")
    appeal = query(f"select id from private.titan_appeals where session_id='{session2}'")
    decide = lambda accept: f"""do $$ begin
begin perform public.titan_appeal_decide_v1({appeal},{accept},'decision concurrente');
raise notice 'DECIDED';
exception when others then raise notice 'REFUSED %', sqlerrm; end; end $$;"""
    out = run(decide('true'), decide('false'), sub_first=admin1, sub_second=admin2)
    final = query(f"select status from private.titan_appeals where id={appeal}")
    assert final == 'accepted', f'the first decision wins: {final}'
    assert query(f"select count(*) from public.titan_admin_audit where action='appeal.decision' and target_user_id='{player}' and (payload->>'appeal')::bigint={appeal}") == '1', 'exactly one audited decision'

    # 3. fifth and sixth appeal filed at once -----------------------------------------------------------------------
    sessions = [str(uuid.uuid4()) for _ in range(6)]
    values = ','.join(f"('{s}','{player}','running','cardio',5,'km',1,now()-interval '{i + 3} days','{{\"duration\":30}}',true,'suspicious')" for i, s in enumerate(sessions))
    query(f"""set session_replication_role = replica;
insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious,status) values {values};""")
    for s in sessions[:4]:
        query(f"insert into private.titan_appeals(user_id,kind,session_id,message) values ('{player}','session','{s}','message ouvert numero un')")
    assert query(f"select count(*) from private.titan_appeals where user_id='{player}' and status='open'") == '4'
    file_one = lambda s: f"""do $$ begin
begin perform public.titan_appeal_submit_v1('session','{s}','contestation concurrente motivee');
raise notice 'FILED';
exception when others then raise notice 'REFUSED %', sqlerrm; end; end $$;"""
    out = run(file_one(sessions[4]), file_one(sessions[5]), sub_first=player, sub_second=player)
    open_count = query(f"select count(*) from private.titan_appeals where user_id='{player}' and status='open'")
    assert open_count == '5', f'at most five open appeals under concurrency: {open_count}'
    assert 'APPEAL_LIMIT' in ''.join(out), 'the sixth filing was refused for the limit: ' + ' | '.join(out)
    print('OK: release vs exclusion, double appeal decision and appeal cap hold under overlapping connections.')
finally:
    for p in processes:
        if p.poll() is None:
            p.kill()
            p.wait(timeout=5)
    query(f"delete from auth.users where id in ('{admin1}','{admin2}','{player}')")
