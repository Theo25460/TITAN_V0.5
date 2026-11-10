#!/usr/bin/env python3
"""Pin consent withdrawal and cross-source deduplication on disposable PostgreSQL."""
import json
import subprocess
import sys
import time
import uuid


PSQL = sys.argv[1:] + ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]


def query(sql):
    result = subprocess.run(PSQL, input=sql, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


# Check the target before opening other sessions or writing fixtures.
if len(sys.argv) < 2 or not query("select current_database();").startswith("titan_test_"):
    sys.exit("Refused: import concurrency tests require a titan_test_ disposable database")


def overlap(holder_sql, *calls):
    """Hold one real transaction open until every contender waits or completes."""
    marker = uuid.uuid4().hex
    holder_name = f"qa_import_holder_{marker}"
    workers = []

    def start(name, body, wait_for_commit=False):
        worker = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True)
        workers.append(worker)
        worker.stdin.write(f"set application_name='{name}';\nset statement_timeout='12s';\nbegin;\n{body}\n")
        if wait_for_commit:
            worker.stdin.flush()
        else:
            worker.stdin.write("commit;\n")
            worker.stdin.close()
            worker.stdin = None
        return worker

    def wait_until(condition):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if condition():
                return
            time.sleep(0.05)
        raise AssertionError("Expected the import transactions to overlap")

    try:
        holder = start(holder_name, holder_sql, wait_for_commit=True)
        wait_until(lambda: query(f"""select exists(select 1 from pg_stat_activity
where application_name='{holder_name}' and state='idle in transaction');""") == "t")
        clients = []
        for i, body in enumerate(calls):
            name = f"qa_import_{i}_{marker}"
            client = start(name, body)
            clients.append(client)
            wait_until(lambda: client.poll() is not None or query(f"""select exists(select 1 from pg_stat_activity
where application_name='{name}' and wait_event_type='Lock');""") == "t")
        _, err = holder.communicate("commit;\n", timeout=15)
        if holder.returncode:
            raise RuntimeError(err)
        results = []
        for client in clients:
            out, err = client.communicate(timeout=15)
            if client.returncode:
                raise RuntimeError(err)
            results.append(json.loads(out))
        return results
    finally:
        for worker in workers:
            if worker.poll() is None:
                worker.kill()
                worker.wait(timeout=5)
            for stream in (worker.stdin, worker.stdout, worker.stderr):
                if stream is not None and not stream.closed:
                    stream.close()


def fixture():
    owner = str(uuid.uuid4())
    provider = "qa-" + uuid.uuid4().hex
    query(f"""begin;
insert into auth.users(id,raw_user_meta_data) values('{owner}','{{}}');
insert into private.titan_source_consents(user_id,source) values ('{owner}','garmin'), ('{owner}','health_connect');
select public.titan_garmin_link_v1('{owner}','{provider}');
commit;""")
    return owner, provider


def as_user(owner):
    claims = json.dumps({"sub": owner, "role": "authenticated"})
    return f"set local role authenticated;\nset local request.jwt.claims='{claims}';\n"


def garmin_activity(provider):
    return f"""public.titan_garmin_ingest_v1('{provider}',jsonb_build_object('summaryId','qa-running',
  'activityType','RUNNING','startTimeInSeconds',extract(epoch from now()-interval '1 hour')::bigint,
  'durationInSeconds',1800,'distanceInMeters',5000))"""


def garmin_ingest(provider):
    return f"set local role service_role;\nselect {garmin_activity(provider)};"


def health_activity():
    return "public.titan_import_activity_v1('health_connect','qa-running','running',now()-interval '1 hour',30,5)"


def state(owner):
    return json.loads(query(f"""select json_build_object(
  'logs',(select count(*) from public.training_logs where user_id='{owner}'),
  'imported',(select count(*) from private.titan_imported_activities where user_id='{owner}' and status='imported'),
  'linked',(select count(*) from private.titan_imported_activities where user_id='{owner}' and status='linked'),
  'days',(select count(*) from private.titan_daily_activity where user_id='{owner}'),
  'xp',(select xp from public.profiles where id='{owner}'));"""))


def check_withdrawals():
    for source, action in (("garmin", "activity"), ("health_connect", "activity"), ("health_connect", "daily")):
        owner, provider = fixture()
        try:
            if source == "garmin":
                revoke = f"select public.titan_garmin_unlink_for_v1('{owner}');"
                contender = garmin_ingest(provider)
                expected = {"status": "ignored", "reason": "not_linked"}
            else:
                revoke = as_user(owner) + "select public.titan_set_source_consent_v1('health_connect',false);"
                call = (health_activity() if action == "activity" else
                        "public.titan_import_daily_activity_v1('health_connect',current_date,2500)")
                contender = as_user(owner) + f"""do $$ begin
  perform {call};
  perform set_config('qa_import.result','{{"status":"written"}}',true);
exception when insufficient_privilege then
  perform set_config('qa_import.result',json_build_object('error',sqlerrm)::text,true);
end $$;
select current_setting('qa_import.result');"""
                expected = {"error": "CONSENT_REQUIRED"}
            [result] = overlap(revoke, contender)
            after = state(owner)
            assert result == expected and after == {"logs": 0, "imported": 0, "linked": 0, "days": 0, "xp": 0}, (source, action, result, after)
            print(f"OK: {source} {action} cannot write once a concurrent withdrawal wins.")
        finally:
            query(f"delete from auth.users where id='{owner}';")


def check_duplicates():
    owner, provider = fixture()
    try:
        results = overlap(f"select 1 from public.profiles where id='{owner}' for update;",
                          garmin_ingest(provider), as_user(owner) + f"select {health_activity()};")
        after = state(owner)
        assert sorted(result["status"] for result in results) == ["imported", "linked"], (results, after)
        assert results[0]["log_id"] == results[1]["log_id"], results
        assert after == {"logs": 1, "imported": 1, "linked": 1, "days": 0, "xp": 300}, (results, after)
        print("OK: concurrent Garmin and Health Connect imports share one workout and one reward.")
    finally:
        query(f"delete from auth.users where id='{owner}';")


def check_account_deletion():
    owner, provider = fixture()
    try:
        query("begin;\n" + as_user(owner) + f"select {health_activity()};\ncommit;")
        # Hold a table the real deletion RPC visits after deleting training rows, but before deleting the profile.
        deletion, result = overlap("lock table public.messages in share mode;",
                                  as_user(owner) + "select public.delete_own_account();",
                                  f"""set local role service_role;
do $$ begin
  perform set_config('qa_import.result',({garmin_activity(provider)})::text,true);
exception when lock_not_available then
  perform set_config('qa_import.result',json_build_object('error',sqlstate)::text,true);
end $$;
select current_setting('qa_import.result');""")
        assert deletion["deleted"]["auth_users"] == 1, deletion
        assert result == {"error": "55P03"}, result
        retry = json.loads(query("begin;\n" + garmin_ingest(provider) + "\ncommit;"))
        assert retry == {"status": "ignored", "reason": "not_linked"}, retry
        print("OK: account deletion completes and a concurrent duplicate import retries without a lock cycle.")
    finally:
        query(f"delete from auth.users where id='{owner}';")


check_withdrawals()
check_duplicates()
check_account_deletion()
