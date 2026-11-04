#!/usr/bin/env python3
"""Two real API-role connections, only inside the disposable migration test DB."""
import json
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit("Usage: test-economy-concurrency.py <psql command and disposable DB arguments>")


def query(sql):
    result = subprocess.run(PSQL + ["-At"], input=sql, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


# Check before any mutation. Never run the fixture script against the production DB.
if not query("select current_database();").startswith("titan_test_"):
    sys.exit("Refused: economy concurrency tests require a titan_test_ disposable database")

training_user, shop_user, event = (str(uuid.uuid4()) for _ in range(3))
stamp = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
workers = []
fixtures_created = False


def overlap(label, owner, first_call, second_call):
    """Hold the profile, observe the second connection blocked by the first, then assert results."""
    with tempfile.TemporaryFile(mode="w+") as first_in, tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as first_out, tempfile.TemporaryFile(mode="w+") as second_out:
        setup = f"""set statement_timeout='10s'; set lock_timeout='8s'; begin;
set local role authenticated;
set local request.jwt.claims='{{"sub":"{owner}","role":"authenticated"}}';
"""
        # The holder is fixture orchestration under postgres; the RPC still runs under authenticated.
        first_in.write(f"""set application_name='titan_qa_{label}_first'; begin;
do $$ begin perform 1 from public.profiles where id='{owner}'::uuid for update; end $$;
set local role authenticated;
set local request.jwt.claims='{{"sub":"{owner}","role":"authenticated"}}';
set local statement_timeout='10s';
select pg_sleep(3);
{first_call}
commit;
""")
        second_in.write(f"set application_name='titan_qa_{label}_second';\n{setup}{second_call}\ncommit;\n")
        first_in.seek(0)
        first = subprocess.Popen(PSQL + ["-At"], stdin=first_in, stdout=first_out, stderr=first_out)
        workers.append(first)

        def observe(predicate):
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if query(predicate) == "t":
                    return
                if first.poll() is not None:
                    first_out.seek(0)
                    raise AssertionError("First worker ended before overlap: " + first_out.read())
                time.sleep(0.05)
            raise AssertionError("Expected concurrency was not observed")

        observe(f"select exists(select 1 from pg_stat_activity where application_name='titan_qa_{label}_first' and wait_event='PgSleep');")
        second_in.seek(0)
        second = subprocess.Popen(PSQL + ["-At"], stdin=second_in, stdout=second_out, stderr=second_out)
        workers.append(second)
        observe(f"""select exists(select 1 from pg_stat_activity a, pg_stat_activity b
where a.application_name='titan_qa_{label}_second' and a.wait_event_type='Lock'
and b.application_name='titan_qa_{label}_first' and b.pid=any(pg_blocking_pids(a.pid)));""")
        first.wait(timeout=12)
        second.wait(timeout=12)
        first_out.seek(0)
        second_out.seek(0)
        results = [first_out.read().strip(), second_out.read().strip()]
        if first.returncode or second.returncode:
            raise AssertionError("Worker failed: " + "\n".join(results))
        return [json.loads(result) for result in results]


try:
    query(f"""begin;
insert into auth.users(id,raw_user_meta_data) values('{training_user}','{{}}'),('{shop_user}','{{}}');
update public.profiles set credits=1000,xp=0,level=1 where id in('{training_user}','{shop_user}');
commit;""")
    fixtures_created = True
    training_call = f"""select row_to_json(r) from public.titan_submit_training_session(
'running','cardio',5,'km','{{"client_event_id":"{event}","duration":30}}','{stamp}') r;"""
    first, second = overlap("training", training_user, training_call, training_call)
    assert first == second and first["xp"] == 300 and first["credits"] == 30 and first["credits_after"] == 1030, "simultaneous retry must return the original receipt"
    query(f"""do $$ begin
assert (select count(*)=1 from public.training_logs where user_id='{training_user}'),'one session';
assert (select count(*)=1 from public.training_receipts where user_id='{training_user}'),'one receipt';
assert (select xp=300 and credits=1030 and level=1 from public.profiles where id='{training_user}'),'one reward';
assert (select xp_awarded=300 and credits_awarded=30 from public.titan_weekly_reward_usage where user_id='{training_user}'),'one allowance consumption';
end $$;""")
    print("OK: overlapping training retries returned one receipt and awarded once.")

    purchase = "select row_to_json(r) from public.titan_purchase_shop_item('cos_frame_neon') r;"
    repeated_purchase = """do $$ begin
begin perform public.titan_purchase_shop_item('cos_frame_neon'); assert false,'second purchase must be refused';
exception when check_violation then assert sqlerrm='PURCHASE_LIMIT_ONCE',sqlerrm; end;
end $$;
select '{"refused":"PURCHASE_LIMIT_ONCE"}'::json;"""
    first, second = overlap("purchase", shop_user, purchase, repeated_purchase)
    assert first["cost"] == 450 and first["credits_after"] == 550 and second == {"refused": "PURCHASE_LIMIT_ONCE"}, "exact once purchase result"
    query(f"""do $$ begin
assert (select count(*)=1 from public.shop_history where user_id='{shop_user}'),'one purchase';
assert (select credits=550 and xp=0 from public.profiles where id='{shop_user}'),'one debit';
end $$;""")
    print("OK: overlapping purchases created one history row and debited once.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
    if fixtures_created:
        query(f"delete from auth.users where id in('{training_user}','{shop_user}');")
