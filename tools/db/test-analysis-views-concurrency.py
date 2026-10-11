#!/usr/bin/env python3
"""Observe real overlap for preset quota and revisions, only on disposable DBs."""
import json
import subprocess
import sys
import tempfile
import time
import uuid

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit("Usage: test-analysis-views-concurrency.py <psql command and disposable DB arguments>")


def query(sql):
    result = subprocess.run(PSQL + ["-At"], input=sql, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


if not query("select current_database();").startswith("titan_test_"):
    sys.exit("Refused: analysis views concurrency tests require a titan_test_ disposable database")

owner, last_id, excess_id = (str(uuid.uuid4()) for _ in range(3))
workers = []
fixtures_created = False


def overlap(label, first_call, second_call):
    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        setup = f"""begin; set local role authenticated;
set local request.jwt.claims='{{"sub":"{owner}","role":"authenticated"}}';
set local statement_timeout='10s'; set local lock_timeout='8s';
"""
        # Hold the RPC's own lock until commit, rather than assuming its locking implementation.
        first_in.write(f"set application_name='titan_views_{label}_first';\n{setup}{first_call}\nselect pg_sleep(3); commit;\n")
        second_in.write(f"set application_name='titan_views_{label}_second';\n{setup}{second_call}\ncommit;\n")
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
            raise AssertionError("Expected concurrency was not observed")

        observe(f"select exists(select 1 from pg_stat_activity where application_name='titan_views_{label}_first' and wait_event='PgSleep');")
        second_in.seek(0)
        second = subprocess.Popen(PSQL + ["-At"], stdin=second_in, stdout=second_out, stderr=second_out)
        workers.append(second)
        observe(f"""select exists(select 1 from pg_stat_activity a, pg_stat_activity b
where a.application_name='titan_views_{label}_second' and a.wait_event_type='Lock'
and b.application_name='titan_views_{label}_first' and b.pid=any(pg_blocking_pids(a.pid)));""")
        first.wait(timeout=12)
        second.wait(timeout=12)
        first_out.seek(0)
        second_out.seek(0)
        results = [first_out.read().strip(), second_out.read().strip()]
        if first.returncode or second.returncode:
            raise AssertionError("Worker failed: " + "\n".join(results))
        return [json.loads(result) for result in results]


def save(id, revision, name):
    return f"select public.titan_mutate_analysis_view('save','{id}',{revision},'{name}','report','{{\"period\":\"month\",\"offset\":0}}');"


try:
    query(f"""begin; set local request.jwt.claims='{{"role":"service_role"}}';
insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
update public.profiles set is_elite=true,elite_ends_at=null,elite_refunded_at=null where id='{owner}'; commit;""")
    fixtures_created = True
    seeds = "\n".join(save(str(uuid.uuid4()), 0, "Seed " + str(n)) for n in range(9))
    query(f"""begin; set local role authenticated;
set local request.jwt.claims='{{"sub":"{owner}","role":"authenticated"}}'; {seeds} commit;""")
    excess = f"""do $$ begin begin
perform public.titan_mutate_analysis_view('save','{excess_id}',0,'Excess','report','{{"period":"month","offset":0}}');
assert false,'eleventh concurrent create must fail';
exception when check_violation then assert sqlerrm='VIEW_LIMIT',sqlerrm; end; end $$;
select '{{"refused":"VIEW_LIMIT"}}'::json;"""
    first, second = overlap("quota", save(last_id, 0, "Last place"), excess)
    assert first["view"]["revision"] == 1 and second == {"refused": "VIEW_LIMIT"}, "one final slot"
    assert query(f"select count(*) from private.titan_analysis_views where user_id='{owner}';") == "10", "quota remains ten"
    print("OK: overlapping analysis-view creations consumed one final slot.")

    stale = f"""do $$ begin begin
perform public.titan_mutate_analysis_view('save','{last_id}',1,'Stale rename','report','{{"period":"month","offset":0}}');
assert false,'stale concurrent rename must fail';
exception when serialization_failure then assert sqlerrm='VIEW_VERSION_CONFLICT',sqlerrm; end; end $$;
select '{{"refused":"VIEW_VERSION_CONFLICT"}}'::json;"""
    first, second = overlap("revision", save(last_id, 1, "First rename"), stale)
    assert first["view"]["revision"] == 2 and second == {"refused": "VIEW_VERSION_CONFLICT"}, "one accepted revision"
    assert query(f"select name||':'||revision from private.titan_analysis_views where id='{last_id}';") == "First rename:2", "no lost update"
    print("OK: overlapping analysis-view updates refused the stale revision.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    if fixtures_created:
        query(f"delete from auth.users where id='{owner}';")
