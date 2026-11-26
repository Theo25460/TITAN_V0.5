#!/usr/bin/env python3
"""V1.5.2 — two devices discover the Vallée access at the same moment, on a disposable database only.

The account resolved the Veilleur on the ruins route (V1.5.1 outcome serment_restitue). The first connection brings the
fragment to the right engraving and keeps its transaction open; the second sends a wrong engraving at the same time and must
wait on the per-account lock, then read back the discovery unchanged (its answer is not counted). A third connection
(another device resuming, or the app reopened) sees the same open access. One row, one discovery, nothing else written."""
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
    sys.exit("Refused: consequence concurrency tests require a titan_test_ disposable database")

owner, tag = str(uuid.uuid4()), "titan_consequence_" + uuid.uuid4().hex
claims = json.dumps({"sub": owner, "role": "authenticated"})
setup = (f"begin; set local role authenticated; set local request.jwt.claims='{claims}'; "
         "set local statement_timeout='10s'; set local lock_timeout='8s';\n")
workers = []
def discover(mark):
    return f"public.titan_adventure_consequence_action_v1('aube','discover',array['{mark}'])"
try:
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
      set session_replication_role=replica;
      insert into public.profiles(id,username,level,xp,credits,is_suspended) values('{owner}','qa_consequence',1,100,10,false)
        on conflict(id) do update set is_suspended=false,xp=100,credits=10;
      insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
        values('{owner}','aube',9,'rhythm','UTC',now()-interval '30 days');
      insert into private.adventure_journeys(user_id,world_id,started_at,timezone,target,baseline_rpe,profile)
        values('{owner}','aube',now()-interval '30 days','UTC',15,5,'{{}}');
      insert into private.adventure_branch_entries(user_id,world_id,pilot,version,entered_at) values('{owner}','aube','aube-arc1',1,now()-interval '21 days');
      insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
        select '{owner}','aube',o,case when o=2 then 1 end,now()-interval '20 days'+o*interval '1 hour' from generate_series(1,6) o;
      insert into private.adventure_guardian_encounters(user_id,world_id,guardian,version,route,attempts,last_sign,prepared_at,outcome,resolved_at)
        values('{owner}','aube','veilleur',1,'ruines',1,'gravure',now()-interval '2 days','serment_restitue',now()-interval '1 day');
      set session_replication_role=origin;""")
    before = json.loads(query(setup + "select public.titan_adventure_consequences_v1(); commit;").splitlines()[0])
    assert before["items"][0]["state"] == "discover" and before["items"][0]["outcome"] == "serment_restitue", before

    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        first_in.write(f"set application_name='{tag}_first';\n" + setup + f"select {discover('cerf')}; select pg_sleep(3); commit;")
        second_in.write(f"set application_name='{tag}_second';\n" + setup + f"select {discover('vague')}; commit;")
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
            raise AssertionError("Expected consequence overlap was not observed")

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
        ia, ib = json.loads(a.splitlines()[0])["items"][0], json.loads(b.splitlines()[0])["items"][0]
        assert ia["state"] == "open" and ia["attempts"] == 1 and ia["lastAnswer"] == ["cerf"], ia
        assert ib == ia, "the waiting device reads the same discovery back, its late answer not counted: " + json.dumps(ib)
    resumed = json.loads(query(setup + "select public.titan_adventure_consequences_v1(); commit;").splitlines()[0])
    assert resumed["items"][0] == ia, resumed
    assert query(f"select count(*)||':'||min(attempts)||':'||bool_and(discovered_at is not null) from private.adventure_consequences where user_id='{owner}';") == "1:1:true"
    assert query(f"select string_agg(kind,',' order by id) from private.adventure_consequence_events where user_id='{owner}';") == "attempt,discover"
    assert query(f"select xp||':'||credits from public.profiles where id='{owner}';") == "100:10", "no economy change"
    assert query(f"select count(*) from private.adventure_encounter_rewards where user_id='{owner}';") == "6", "no reward added"
    print("OK: two simultaneous discoveries observed a real lock; one discovery, the late answer not counted, read back by the waiting and the resuming device.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    query(f"delete from auth.users where id='{owner}';")
