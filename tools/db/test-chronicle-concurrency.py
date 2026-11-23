#!/usr/bin/env python3
"""V1.5.5 — two devices start a new run of the same arc at the same moment, then choose two different routes at the same
moment, on a disposable database only.

The account achieved the first arc of the Vallée de l'Aube on the ruins (guardian outcome serment_restitue). The first
connection starts a run and keeps its transaction open; the second starts at the same time and must wait on the per-account
lock, then read back the run the first one created (no second run). The same overlap is then played on the route of that run:
"corniche" first, "ruines" second; the second device reads the first route back, its choice not applied. A third connection
(another device, or the app reinstalled) reads the same chronicle. One run, one route, no reward, no XP, no credit."""
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
    sys.exit("Refused: chronicle concurrency tests require a titan_test_ disposable database")

owner = str(uuid.uuid4())
claims = json.dumps({"sub": owner, "role": "authenticated"})
setup = (f"begin; set local role authenticated; set local request.jwt.claims='{claims}'; "
         "set local statement_timeout='10s'; set local lock_timeout='8s';\n")
workers = []

def overlap(tag, first_sql, second_sql):
    """Runs first_sql in a transaction held open 3 s, then second_sql, which must wait on the first one's lock."""
    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        first_in.write(f"set application_name='{tag}_first';\n" + setup + f"select {first_sql}; select pg_sleep(3); commit;")
        second_in.write(f"set application_name='{tag}_second';\n" + setup + f"select {second_sql}; commit;")
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
            raise AssertionError("Expected chronicle overlap was not observed")

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
        return json.loads(a.splitlines()[0]), json.loads(b.splitlines()[0])

try:
    query(f"""insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
      set session_replication_role=replica;
      insert into public.profiles(id,username,level,xp,credits,is_suspended) values('{owner}','qa_chronicle',1,100,10,false)
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
    before = json.loads(query(setup + "select public.titan_adventure_chronicles_v1(); commit;").splitlines()[0])
    arc = before["arcs"][0]
    assert arc["completed"] and arc["replayable"] and arc["activeRun"] is None and len(arc["runs"]) == 1, arc

    sa, sb = overlap("titan_chronicle_start_" + uuid.uuid4().hex,
                     "public.titan_adventure_chronicle_action_v1('aube','start')",
                     "public.titan_adventure_chronicle_action_v1('aube','start')")
    ra = sa["arcs"][0]
    assert ra["activeRun"] == 2 and len(ra["runs"]) == 2 and ra["runs"][1]["state"] == "choose", ra
    assert sb == sa, "the waiting device reads the run the first one created, no second run: " + json.dumps(sb["arcs"][0])
    assert query(f"select count(*) from private.adventure_arc_runs where user_id='{owner}';") == "1", "one run"

    ca, cb = overlap("titan_chronicle_route_" + uuid.uuid4().hex,
                     "public.titan_adventure_chronicle_action_v1('aube','choose',2,'corniche')",
                     "public.titan_adventure_chronicle_action_v1('aube','choose',2,'ruines')")
    run = ca["arcs"][0]["runs"][1]
    assert run["route"] == "corniche" and run["state"] == "scene" and run["chosenAt"], run
    assert cb == ca, "the waiting device reads the first route back, its late choice not applied: " + json.dumps(cb["arcs"][0]["runs"][1])

    resumed = json.loads(query(setup + "select public.titan_adventure_chronicles_v1(); commit;").splitlines()[0])
    assert resumed == ca, resumed
    assert resumed["arcs"][0]["runs"][0]["route"] == "ruines" and resumed["arcs"][0]["activeOutcome"]["outcome"] == "serment_restitue"
    assert query(f"select count(*)||':'||min(route)||':'||count(*) filter (where resolved_at is null and abandoned_at is null) "
                 f"from private.adventure_arc_runs where user_id='{owner}';") == "1:corniche:1"
    assert query(f"select count(*) from private.adventure_chronicle_events where user_id='{owner}' and kind='start';") == "1", "one start"
    assert query(f"select xp||':'||credits from public.profiles where id='{owner}';") == "100:10", "no economy change"
    assert query(f"select count(*) from private.adventure_encounter_rewards where user_id='{owner}';") == "6", "no reward added"
    print("OK: two simultaneous starts observed a real lock; one run, then two simultaneous routes, one route, read back by the "
          "waiting and the resuming device, no reward.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    query(f"delete from auth.users where id='{owner}';")
