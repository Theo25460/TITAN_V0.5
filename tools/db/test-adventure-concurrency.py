#!/usr/bin/env python3
"""Confirm overlapping chapter claims on disposable databases, never a real database."""
import json
import subprocess
import sys
import tempfile
import time
import uuid

PSQL = sys.argv[1:]

def query(sql):
    r = subprocess.run(PSQL + ["-At"], input=sql, text=True, capture_output=True, timeout=15)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

if not PSQL or not query("select current_database();").startswith("titan_test_"):
    sys.exit("Refused: adventure concurrency tests require a titan_test_ disposable database")

owner, tag = str(uuid.uuid4()), "titan_quest_" + uuid.uuid4().hex
workers = []
claims = json.dumps({"sub": owner, "role": "authenticated"})
setup = f"begin; set local role authenticated; set local request.jwt.claims='{claims}'; set local statement_timeout='10s'; set local lock_timeout='8s';\n"
call = "public.titan_adventure_action('claim','aube','rhythm',null,2,1,'UTC')"
try:
    query(f"insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');")
    query(setup + "select public.titan_adventure_action('start','aube','rhythm',null,0,null,'UTC'); commit;")
    query(f"""set request.jwt.claims='{{"role":"service_role"}}';
      insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
      values('{owner}','swimming','training',30,'min',now(),'{{"serverReward":true,"duration":30,"note":"Une trace personnelle"}}',clock_timestamp());""")
    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        first_in.write(f"set application_name='{tag}_first';\n" + setup + f"select {call}; select pg_sleep(3); commit;")
        second_in.write(f"set application_name='{tag}_second';\n" + setup + f"""do $$ begin
          begin perform {call}; assert false,'stale claim must fail';
          exception when serialization_failure then assert sqlerrm='ADVENTURE_CONFLICT',sqlerrm; end;
        end $$; select '{{"conflict":true}}'::json; commit;""")
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
            raise AssertionError("Expected adventure overlap was not observed")

        observe(f"select exists(select 1 from pg_stat_activity where application_name='{tag}_first' and wait_event='PgSleep');")
        second_in.seek(0)
        second = subprocess.Popen(PSQL + ["-At"], stdin=second_in, stdout=second_out, stderr=second_out)
        workers.append(second)
        observe(f"select exists(select 1 from pg_stat_activity a,pg_stat_activity b where a.application_name='{tag}_second' "
                f"and a.wait_event_type='Lock' and b.application_name='{tag}_first' and b.pid=any(pg_blocking_pids(a.pid)));")
        first.wait(timeout=12)
        second.wait(timeout=12)
        first_out.seek(0)
        second_out.seek(0)
        result, conflict = first_out.read().strip(), second_out.read().strip()
        assert first.returncode == 0 and second.returncode == 0, result + conflict
        snapshot = json.loads(result.splitlines()[0])
        assert len(snapshot["quest_rewards"]) == 3, "one atomic set of optional souvenirs"
        assert json.loads(conflict) == {"conflict": True}, conflict
    assert query(f"select chapter from public.adventure_progress where user_id='{owner}' and world_id='aube';") == "2"
    assert query(f"select count(*) from public.adventure_quest_rewards where user_id='{owner}';") == "3"
    assert query(f"select count(*) from public.adventure_rewards where user_id='{owner}';") == "1"
    print("OK: overlapping adventure claims observed a real lock, one advancement, one badge and three unique souvenirs.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    query(f"delete from auth.users where id='{owner}';")
