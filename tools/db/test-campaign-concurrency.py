#!/usr/bin/env python3
"""V1.5.3 — two devices answer the Forge mechanic at the same moment, on a disposable database only.

The account reached the Artisan de braise on the soufflet route (forge-arc1 v1) and observed it. The first connection sends the
right order of pieces and keeps its transaction open; the second sends a wrong order and must wait on the per-account lock, then
read back the solved mechanic: its late answer is not counted. A third connection (another device resuming) reads the same
state. One encounter row, one attempt, nothing else written."""
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
    sys.exit("Refused: campaign concurrency tests require a titan_test_ disposable database")

owner, tag = str(uuid.uuid4()), "titan_campaign_" + uuid.uuid4().hex
claims = json.dumps({"sub": owner, "role": "authenticated"})
setup = (f"begin; set local role authenticated; set local request.jwt.claims='{claims}'; "
         "set local statement_timeout='10s'; set local lock_timeout='8s';\n")
workers = []
def campaign(action, ordinal="null", answer="null"):
    return f"public.titan_adventure_campaign_action_v1('forge','{action}',{ordinal},null,null,{answer})"
RIGHT, WRONG = "array['charniere','cuir','buse']", "array['buse','cuir','charniere']"
try:
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
      set session_replication_role=replica;
      insert into public.profiles(id,username,level,xp,credits,is_suspended) values('{owner}','qa_campaign',1,100,10,false)
        on conflict(id) do update set is_suspended=false,xp=100,credits=10;
      insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
        values('{owner}','forge',9,'rhythm','UTC',now()-interval '30 days');
      set session_replication_role=origin;""")
    query(setup + f"select {campaign('start')}; commit;")
    query(f"""update private.adventure_journeys set started_at=now()-interval '30 days',target=15 where user_id='{owner}';
      set session_replication_role=replica;
      insert into private.adventure_branch_entries(user_id,world_id,pilot,version,entered_at) values('{owner}','forge','forge-arc1',1,now()-interval '21 days');
      insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
        select '{owner}','forge',o,case when o=2 then 0 end,now()-interval '20 days'+o*interval '1 hour' from generate_series(1,4) o;
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
        select '{owner}',s,'training',30,'min',0,now()-n*interval '1 day',now()-n*interval '1 day',
               '{{"serverReward":true,"effort":{{"minutes":30,"effort_minutes":30}}}}'
        from (values('running',4),('bouldering',3),('badminton',2)) v(s,n);
      set session_replication_role=origin;""")
    observed = json.loads(query(setup + f"select {campaign('sync')}; select {campaign('claim', '5')}; commit;").splitlines()[-1])
    assert observed["guardian"]["state"] == "prepare" and observed["mechanic"]["primitive"] == "sequence", observed["guardian"]

    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        first_in.write(f"set application_name='{tag}_first';\n" + setup +
                       f"select {campaign('solve', answer=RIGHT)}; select pg_sleep(3); commit;")
        second_in.write(f"set application_name='{tag}_second';\n" + setup +
                        f"select {campaign('solve', answer=WRONG)}; commit;")
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
            raise AssertionError("Expected campaign overlap was not observed")

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
        ma, mb = a["mechanic"], b["mechanic"]
        assert ma["solved"] and ma["lastCorrect"] and ma["attempts"] == 1, ma
        assert mb["solved"] and mb["lastCorrect"] and mb["attempts"] == 1 and mb["lastAnswer"] == ma["lastAnswer"], \
            "the waiting device reads the solved board back, its late answer not counted: " + json.dumps(mb)
        assert b["guardian"]["state"] == "ready", b["guardian"]
    resumed = json.loads(query(setup + "select public.titan_adventure_campaign_snapshot_v1('forge'); commit;").splitlines()[0])
    assert resumed["mechanic"] == ma and resumed["guardian"]["state"] == "ready", resumed["mechanic"]
    assert query(f"select count(*)||':'||min(attempts)||':'||array_to_string(min(last_answer),',') from private.adventure_guardian_encounters where user_id='{owner}';") \
        == "1:1:charniere,cuir,buse"
    assert query(f"select xp||':'||credits from public.profiles where id='{owner}';") == "100:10", "no economy change"
    print("OK: two simultaneous answers observed a real lock; one solved mechanic, the late answer not counted, read back by the waiting and the resuming device.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    query(f"delete from auth.users where id='{owner}';")
