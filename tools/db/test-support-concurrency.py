#!/usr/bin/env python3
"""Observe support overlap on disposable databases only; all fixtures are removed."""
import json
import subprocess
import sys
import tempfile
import time
import uuid

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit("Usage: test-support-concurrency.py <psql command and disposable DB arguments>")


def query(sql):
    result = subprocess.run(PSQL + ["-At"], input=sql, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


if not query("select current_database();").startswith("titan_test_"):
    sys.exit("Refused: support concurrency tests require a titan_test_ disposable database")

owner, request_id = (str(uuid.uuid4()) for _ in range(2))
tag = "titan_support_" + uuid.uuid4().hex
workers = []
fixtures_created = False


def overlap(label, first_call, second_call):
    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        setup = "begin; set local role service_role; set local statement_timeout='10s'; set local lock_timeout='8s';\n"
        first_name, second_name = tag + label + "_first", tag + label + "_second"
        first_in.write(f"set application_name='{first_name}';\n{setup}{first_call}\nselect pg_sleep(3); commit;\n")
        second_in.write(f"set application_name='{second_name}';\n{setup}{second_call}\ncommit;\n")
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
            raise AssertionError("Expected support concurrency was not observed")

        observe(f"select exists(select 1 from pg_stat_activity where application_name='{first_name}' and wait_event='PgSleep');")
        second_in.seek(0)
        second = subprocess.Popen(PSQL + ["-At"], stdin=second_in, stdout=second_out, stderr=second_out)
        workers.append(second)
        observe(f"select exists(select 1 from pg_stat_activity a,pg_stat_activity b where a.application_name='{second_name}' "
                f"and a.wait_event_type='Lock' and b.application_name='{first_name}' and b.pid=any(pg_blocking_pids(a.pid)));")
        first.wait(timeout=12)
        second.wait(timeout=12)
        first_out.seek(0)
        second_out.seek(0)
        results = [first_out.read().strip(), second_out.read().strip()]
        if first.returncode or second.returncode:
            raise AssertionError("Support worker failed: " + "\n".join(results))
        return [json.loads(result) for result in results]


def accept(id):
    return f"select public.titan_support_accept_v300('{owner}','{id}','bug','Un problème fictif.',false);"


try:
    query(f"insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values('{owner}','test@example.test',now(),false,'{{}}');")
    fixtures_created = True
    first, second = overlap("retry", accept(request_id), accept(request_id))
    assert first == second and first["notification"] == "pending", "one stable receipt"
    assert query(f"select count(*) from private.titan_support_requests where user_id='{owner}';") == "1", "one request"
    print("OK: overlapping support retries returned one ticket and reference.")

    query(f"begin; set local role service_role; {accept(str(uuid.uuid4()))} commit;")
    excess_id = str(uuid.uuid4())
    excess = f"""do $$ begin begin
perform public.titan_support_accept_v300('{owner}','{excess_id}','bug','Un problème fictif.',false);
assert false,'fourth concurrent support request must fail';
exception when sqlstate 'PT429' then assert sqlerrm='SUPPORT_RATE_LIMIT',sqlerrm; end; end $$;
select '{{"refused":"SUPPORT_RATE_LIMIT"}}'::json;"""
    first, second = overlap("quota", accept(str(uuid.uuid4())), excess)
    assert first["notification"] == "pending" and second == {"refused": "SUPPORT_RATE_LIMIT"}, "one final support slot"
    assert query(f"select count(*) from private.titan_support_requests where user_id='{owner}';") == "3", "quota remains three"
    print("OK: overlapping support creations consumed one final quota slot.")

    def claim(lease):
        return f"select public.titan_support_claim_v300('{owner}','{request_id}','{lease}','assistance@example.test');"
    first, second = overlap("claim", claim(str(uuid.uuid4())), claim(str(uuid.uuid4())))
    assert first["notification"] == "claimed" and second == {"notification": "pending"}, "one exclusive notification lease"
    print("OK: overlapping support notifications acquired one exclusive lease.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    if fixtures_created:
        query(f"delete from auth.users where id='{owner}';")
