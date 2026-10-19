-- BOT01 / BOT02 / CHEAT18: a periodic server-side analysis of recent sessions.
-- For accounts that recorded sessions in the last p_hours, it runs the explainable per-session risk
-- (private.titan_session_risk, migration 20261019180000) and records ONE signal per session whose state is
-- "review" or "critical" (public.titan_suspicious_actions, reason SESSION_RISK_REVIEW / SESSION_RISK_CRITICAL, with the
-- score and signals as payload). The moderation queue already ranks accounts from those signals, so risky accounts
-- surface by score instead of being banned: this function changes NO account, NO session, NO reward and writes
-- nothing else. A session already signalled at a given state (even if a human has since reviewed or dismissed the
-- signal) is not signalled again; a session that later worsens from review to critical is signalled once more.
-- Accounts are picked by when sessions were RECORDED (created_at); sessions dated more than 120 days back are
-- outside the per-session risk window by design. One run at a time (advisory lock); one failing account is isolated. Unlike a refusal rolled back with its transaction, these signals persist.
-- Scheduling: daily at 04:35 UTC by pg_cron ONLY when the extension exists (production: v1.6.4; absent from the local bench),
-- over the last 50 hours so that a missed day is still covered (de-duplication makes the overlap harmless).
-- Additive; the caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: select cron.unschedule('titan_run_risk_analysis'); drop function private.titan_run_risk_analysis(integer, integer);

create or replace function private.titan_run_risk_analysis(p_hours integer default 24, p_max_accounts integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hours integer := greatest(1, least(coalesce(p_hours, 24), 168));
  v_max integer := greatest(1, least(coalesce(p_max_accounts, 200), 1000));
  v_user uuid;
  v_session jsonb;
  v_accounts integer := 0;
  v_signals integer := 0;
  v_failed integer := 0;
begin
  -- Two overlapping runs (a manual call during the nightly job) must not both insert the same signal.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('titan_run_risk_analysis', 0));
  for v_user in
    select l.user_id from public.training_logs l
    where l.created_at > now() - make_interval(hours => v_hours) and l.archived_at is null and l.user_id is not null
    group by l.user_id
    order by max(l.created_at) desc
    limit v_max
  loop
    v_accounts := v_accounts + 1;
    begin
      for v_session in
        select s from jsonb_array_elements(private.titan_session_risk(v_user, 100)) s
        where s ->> 'state' in ('review', 'critical')
      loop
        if not exists (
          select 1 from public.titan_suspicious_actions a
          where a.user_id = v_user and a.action_type = 'session_risk.review'
            and a.payload ->> 'session' = v_session ->> 'id' and a.payload ->> 'state' = v_session ->> 'state'
        ) then
          perform public.titan_log_suspicious_action(v_user, 'session_risk.review',
            case when v_session ->> 'state' = 'critical' then 'critical' else 'high' end,
            'SESSION_RISK_' || upper(v_session ->> 'state'),
            jsonb_build_object('session', v_session ->> 'id', 'score', (v_session ->> 'score')::integer,
              'state', v_session ->> 'state', 'signals', v_session -> 'signals', 'source', 'periodic_analysis'));
          v_signals := v_signals + 1;
        end if;
      end loop;
    exception when others then
      -- One account that cannot be analysed must not stop the others, nor roll back their signals.
      v_failed := v_failed + 1;
      raise warning 'titan_run_risk_analysis: account skipped (%): %', v_user, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('accounts', v_accounts, 'signals', v_signals, 'failed', v_failed, 'hours', v_hours);
end;
$function$;
revoke all on function private.titan_run_risk_analysis(integer, integer) from public, anon, authenticated;

do $schedule$
declare
  v_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_job from cron.job where jobname = 'titan_run_risk_analysis';
    if v_job is null then
      perform cron.schedule('titan_run_risk_analysis', '35 4 * * *', 'select private.titan_run_risk_analysis(50, 200);');
    else
      perform cron.alter_job(v_job, schedule => '35 4 * * *', command => 'select private.titan_run_risk_analysis(50, 200);');
    end if;
  end if;
end $schedule$;
