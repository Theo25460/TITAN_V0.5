#!/usr/bin/env python3
"""Race two service-role owners for one new entitlement, only on a disposable DB."""
import json
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone

PSQL = sys.argv[1:]
if not PSQL:
    sys.exit("Usage: test-entitlement-concurrency.py <psql command and disposable DB arguments>")
PSQL += ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]


def query(sql):
    result = subprocess.run(PSQL, input=sql, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


# This must be the first database operation, before fixtures or worker sessions.
if not query("select current_database();").startswith("titan_test_"):
    sys.exit("Refused: entitlement concurrency tests require a titan_test_ disposable database")

winner, loser = (str(uuid.uuid4()) for _ in range(2))
marker = uuid.uuid4().hex
external_id = "qa-entitlement-" + marker
first_app = "titan_entitlement_first_" + marker
second_app = "titan_entitlement_second_" + marker
event_at = datetime.now(timezone.utc) - timedelta(hours=1)
workers = []


def snapshot_sql():
    return f"""select json_build_object(
  'entitlement', (select to_jsonb(e) from private.titan_entitlements e
    where source='paddle' and external_id='{external_id}'),
  'winner_profile', (select to_jsonb(p) from public.profiles p where id='{winner}'),
  'loser_profile', (select to_jsonb(p) from public.profiles p where id='{loser}'),
  'loser_entitlements', (select count(*) from private.titan_entitlements where user_id='{loser}')
);"""


def overlap(first_call, second_call):
    """Keep A's new row uncommitted until B is observed waiting on A's transaction."""
    with tempfile.TemporaryFile(mode="w+") as first_out, \
         tempfile.TemporaryFile(mode="w+") as second_in, \
         tempfile.TemporaryFile(mode="w+") as second_out:
        setup = """set statement_timeout='12s'; set lock_timeout='10s';
set idle_in_transaction_session_timeout='15s';
begin;
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
"""
        first = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=first_out,
                                 stderr=first_out, text=True)
        workers.append(first)
        # stdin stays open: COMMIT is sent only after observing B's actual lock wait.
        # The uncommitted INSERT is invisible to B's SELECT ... FOR UPDATE, so B
        # reaches the conflicting UPSERT after its own owner check found no row.
        first.stdin.write(f"""set application_name='{first_app}';
{setup}
select json_build_object('applied', {first_call});
reset role;
{snapshot_sql()}
select 'titan_entitlement_winner_ready';
""")
        first.stdin.flush()

        def observe(predicate, participants):
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if query(predicate) == "t":
                    return
                for process, output in participants:
                    if process.poll() is not None:
                        output.seek(0)
                        raise AssertionError("Worker ended before observed overlap: " + output.read())
                time.sleep(0.05)
            raise AssertionError("Expected entitlement concurrency was not observed")

        observe(f"""select exists(select 1 from pg_stat_activity
where application_name='{first_app}' and state='idle in transaction'
and query='select ''titan_entitlement_winner_ready'';');""", [(first, first_out)])

        # Capture both success and refusal, then COMMIT. On the vulnerable function
        # B's illicit update must remain visible to the final state assertion.
        second_in.write(f"""set application_name='{second_app}';
{setup}
do $worker$
declare applied boolean;
begin
  begin
    applied := {second_call};
    perform set_config('titan_test.entitlement_result',
      json_build_object('outcome','applied','applied',applied)::text,true);
  exception when others then
    perform set_config('titan_test.entitlement_result',
      json_build_object('outcome','error','sqlstate',sqlstate,'message',sqlerrm)::text,true);
  end;
end $worker$;
select current_setting('titan_test.entitlement_result');
commit;
""")
        second_in.seek(0)
        second = subprocess.Popen(PSQL, stdin=second_in, stdout=second_out, stderr=second_out)
        workers.append(second)
        observe(f"""select exists(select 1 from pg_stat_activity a, pg_stat_activity b
where a.application_name='{second_app}' and a.wait_event_type='Lock'
and b.application_name='{first_app}' and b.state='idle in transaction'
and b.pid=any(pg_blocking_pids(a.pid)));""", [(first, first_out), (second, second_out)])

        first.stdin.write("commit;\n")
        first.stdin.close()
        first.wait(timeout=15)
        second.wait(timeout=15)
        first_out.seek(0)
        second_out.seek(0)
        outputs = [first_out.read().strip(), second_out.read().strip()]
        if first.returncode or second.returncode:
            raise AssertionError("Worker failed: " + "\n".join(outputs))
        first_results = [json.loads(line) for line in outputs[0].splitlines()
                         if line != "titan_entitlement_winner_ready"]
        assert len(first_results) == 2, "winner must report its result and original state: " + outputs[0]
        return first_results[0], first_results[1], json.loads(outputs[1])


try:
    query(f"""begin;
insert into auth.users(id,raw_user_meta_data) values('{winner}','{{}}'),('{loser}','{{}}');
commit;""")
    first_call = f"""public.titan_apply_entitlement_v1(
'{winner}','paddle','{external_id}',true,'active','qa.winner.activated','{event_at.isoformat()}',
'qa-winner-order','qa-winner-product','qa-winner-variant',
'{(event_at + timedelta(days=30)).isoformat()}',null,null,null)"""
    later_event = (event_at + timedelta(minutes=1)).isoformat()
    second_call = f"""public.titan_apply_entitlement_v1(
'{loser}','paddle','{external_id}',false,'canceled','qa.loser.canceled','{later_event}',
'qa-loser-order','qa-loser-product','qa-loser-variant',null,'{later_event}',null,null)"""
    result, before, refused = overlap(first_call, second_call)
    assert result == {"applied": True}, "winner must create the new entitlement: " + json.dumps(result)
    assert before["entitlement"]["user_id"] == winner and before["entitlement"]["is_active"], "winner fixture must own active access"
    assert before["winner_profile"]["is_elite"], "winner access must be mirrored to its profile"

    after = json.loads(query(snapshot_sql()))
    assert after["entitlement"] == before["entitlement"], (
        "Concurrent non-owner modified the winner's entitlement: "
        + json.dumps({"before": before["entitlement"], "after": after["entitlement"], "loser_result": refused}, sort_keys=True)
    )
    assert refused == {"outcome": "error", "sqlstate": "42501", "message": "ENTITLEMENT_OWNED_BY_OTHER"}, (
        "Concurrent non-owner must receive the explicit ownership refusal: " + json.dumps(refused)
    )
    assert after["winner_profile"] == before["winner_profile"], "winner profile must remain consistent and unchanged"
    assert after["loser_profile"] == before["loser_profile"], "refused call must not recalculate the other profile"
    assert after["loser_entitlements"] == before["loser_entitlements"] == 0, "loser must gain no entitlement"
    print("OK: overlapping owners refused the second claim and preserved the winner's complete entitlement and profiles.")
finally:
    for worker in workers:
        if worker.poll() is None:
            worker.kill()
            worker.wait(timeout=5)
        if worker.stdin is not None and not worker.stdin.closed:
            worker.stdin.close()
    # Auth cascades remove the synthetic profiles and entitlement even after RED.
    query(f"set lock_timeout='5s'; delete from auth.users where id in('{winner}','{loser}');")
