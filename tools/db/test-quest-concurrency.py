#!/usr/bin/env python3
"""V1.5.4 — two devices choose the manner of a chain at the same moment, on a disposable database only.

The account resolved the Gardienne des courants on the map route (V1.5.3 outcome chenal_ouvert): its clue feu-chenal opens
the chain feux-cote. It is started and its clue linked to the lighthouse beacon. The first connection chooses "lanterne" and
keeps its transaction open; the second chooses "livre" at the same time and must wait on the per-account lock, then read back
the first manner unchanged (its choice is not applied). A third connection (another device resuming, or the app reopened)
sees the same notebook. One chain row, one clue, one manner, nothing else written."""
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
    sys.exit("Refused: quest concurrency tests require a titan_test_ disposable database")

owner, tag = str(uuid.uuid4()), "titan_quest_" + uuid.uuid4().hex
claims = json.dumps({"sub": owner, "role": "authenticated"})
setup = (f"begin; set local role authenticated; set local request.jwt.claims='{claims}'; "
         "set local statement_timeout='10s'; set local lock_timeout='8s';\n")
workers = []
def choose(manner):
    return f"public.titan_adventure_quest_action_v1('feux-cote','choose',null,'{manner}')"
try:
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
      set session_replication_role=replica;
      insert into public.profiles(id,username,level,xp,credits,is_suspended) values('{owner}','qa_quest',1,100,10,false)
        on conflict(id) do update set is_suspended=false,xp=100,credits=10;
      insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
        values('{owner}','marees',9,'rhythm','UTC',now()-interval '30 days');
      insert into private.adventure_journeys(user_id,world_id,started_at,timezone,target,baseline_rpe,profile)
        values('{owner}','marees',now()-interval '30 days','UTC',15,5,'{{}}');
      insert into private.adventure_branch_entries(user_id,world_id,pilot,version,entered_at) values('{owner}','marees','marees-arc1',1,now()-interval '21 days');
      insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
        select '{owner}','marees',o,case when o=2 then 0 end,now()-interval '20 days'+o*interval '1 hour' from generate_series(1,6) o;
      insert into private.adventure_guardian_encounters(user_id,world_id,guardian,version,route,attempts,last_answer,prepared_at,outcome,resolved_at)
        values('{owner}','marees','gardienne',1,'carte',1,array['est','ouest','chenal'],now()-interval '2 days','chenal_ouvert',now()-interval '1 day');
      set session_replication_role=origin;""")
    started = json.loads(query(setup + "select public.titan_adventure_quest_action_v1('feux-cote','start'); "
                               "select public.titan_adventure_quest_action_v1('feux-cote','link',array['phare']); commit;").splitlines()[1])
    before = started["chains"][1]
    assert before["state"] == "choose" and before["clue"] == "feu-chenal" and before["attempts"] == 1, before

    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        first_in.write(f"set application_name='{tag}_first';\n" + setup + f"select {choose('lanterne')}; select pg_sleep(3); commit;")
        second_in.write(f"set application_name='{tag}_second';\n" + setup + f"select {choose('livre')}; commit;")
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
            raise AssertionError("Expected quest overlap was not observed")

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
        na, nb = json.loads(a.splitlines()[0]), json.loads(b.splitlines()[0])
        ia, ib = na["chains"][1], nb["chains"][1]
        assert ia["manner"] == "lanterne" and ia["state"] == "waiting" and ia["chosenAt"], ia
        assert nb == na, "the waiting device reads the same manner back, its late choice not applied: " + json.dumps(ib)
    resumed = json.loads(query(setup + "select public.titan_adventure_quests_v1(); commit;").splitlines()[0])
    assert resumed == na, resumed
    assert len(resumed["clues"]) == 1 and resumed["clues"][0]["state"] == "linked", resumed["clues"]
    assert query(f"select count(*)||':'||min(manner)||':'||min(attempts) from private.adventure_quests where user_id='{owner}';") == "1:lanterne:1"
    assert query(f"select xp||':'||credits from public.profiles where id='{owner}';") == "100:10", "no economy change"
    assert query(f"select count(*) from private.adventure_encounter_rewards where user_id='{owner}';") == "6", "no reward added"
    print("OK: two simultaneous manners observed a real lock; one manner, the late choice not applied, one clue, read back by the waiting and the resuming device.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    query(f"delete from auth.users where id='{owner}';")
