#!/usr/bin/env python3
"""V1.5.0 — two devices confirm different routes at the same moment, on a disposable database only.

The first connection confirms « la corniche » and keeps its transaction open; the second confirms « les ruines » and must
wait on the per-account lock, then read back the canonical route. A third connection (another device resuming) sees the
same route. One decision row, choice 0, nothing else written."""
import json
import subprocess
import sys
import tempfile
import time
import uuid

PSQL = sys.argv[1:]

def query(sql):
    r = subprocess.run(PSQL + ["-At"], input=sql, text=True, capture_output=True, timeout=20)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

if not PSQL or not query("select current_database();").startswith("titan_test_"):
    sys.exit("Refused: branch concurrency tests require a titan_test_ disposable database")

owner, tag = str(uuid.uuid4()), "titan_branch_" + uuid.uuid4().hex
claims = json.dumps({"sub": owner, "role": "authenticated"})
setup = (f"begin; set local role authenticated; set local request.jwt.claims='{claims}'; "
         "set local statement_timeout='10s'; set local lock_timeout='8s';\n")
workers = []
def branch(action, route="null"):
    return f"public.titan_adventure_branch_action_v1('aube','{action}',null,null,{route})"
try:
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
      set session_replication_role=replica;
      insert into public.profiles(id,username,level,xp,credits,is_suspended) values('{owner}','qa_branch',1,100,10,false)
        on conflict(id) do update set is_suspended=false,xp=100,credits=10;
      insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
        values('{owner}','aube',9,'rhythm','UTC',now()-interval '30 days');
      set session_replication_role=origin;""")
    query(setup + f"select {branch('start')}; commit;")
    query(f"""update private.adventure_journeys set started_at=now()-interval '30 days',target=15 where user_id='{owner}';
      set session_replication_role=replica;
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
        values('{owner}','running','training',40,'min',0,now()-interval '2 days',now()-interval '2 days',
               '{{"serverReward":true,"effort":{{"minutes":40,"effort_minutes":40}}}}');
      set session_replication_role=origin;""")
    query(setup + "select public.titan_adventure_branch_action_v1('aube','claim',1); commit;")
    entered = json.loads(query(setup + f"select {branch('enter')}; commit;").splitlines()[0])
    assert entered["branch"]["state"] == "entered", entered["branch"]

    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        first_in.write(f"set application_name='{tag}_first';\n" + setup +
                       f"select {branch('confirm', chr(39) + 'corniche' + chr(39))}; select pg_sleep(3); commit;")
        second_in.write(f"set application_name='{tag}_second';\n" + setup +
                        f"select {branch('confirm', chr(39) + 'ruines' + chr(39))}; commit;")
        first_in.seek(0)
        first = subprocess.Popen(PSQL + ["-At"], stdin=first_in, stdout=first_out, stderr=first_out)
        workers.append(first)

        def observe(sql):
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if query(sql) == "t":
                    return
                if first.poll() is not None:
                    first_out.seek(0)
                    raise AssertionError("First worker ended before overlap: " + first_out.read())
                time.sleep(0.05)
            raise AssertionError("Expected branch overlap was not observed")

        observe(f"select exists(select 1 from pg_stat_activity where application_name='{tag}_first' and wait_event='PgSleep');")
        second_in.seek(0)
        second = subprocess.Popen(PSQL + ["-At"], stdin=second_in, stdout=second_out, stderr=second_out)
        workers.append(second)
        observe(f"select exists(select 1 from pg_stat_activity a,pg_stat_activity b where a.application_name='{tag}_second' "
                f"and a.wait_event_type='Lock' and b.application_name='{tag}_first' and b.pid=any(pg_blocking_pids(a.pid)));")
        first.wait(timeout=15)
        second.wait(timeout=15)
        first_out.seek(0)
        second_out.seek(0)
        a, b = first_out.read().strip(), second_out.read().strip()
        assert first.returncode == 0 and second.returncode == 0, a + b
        a, b = json.loads(a.splitlines()[0]), json.loads(b.splitlines()[0])
        assert a["branch"]["route"] == "corniche", a["branch"]
        assert b["branch"]["route"] == "corniche", "the waiting device reads the canonical route back: " + json.dumps(b["branch"])
    resumed = json.loads(query(setup + "select public.titan_adventure_branch_snapshot_v1('aube'); commit;").splitlines()[0])
    assert resumed["branch"]["state"] == "confirmed" and resumed["branch"]["route"] == "corniche", resumed["branch"]
    assert query(f"select count(*)||':'||min(choice) from private.adventure_encounter_rewards where user_id='{owner}' and ordinal=2;") == "1:0"
    assert query(f"select xp||':'||credits from public.profiles where id='{owner}';") == "100:10", "no economy change"
    print("OK: two simultaneous confirmations observed a real lock; one canonical route, read back by the waiting and the resuming device.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    query(f"delete from auth.users where id='{owner}';")
