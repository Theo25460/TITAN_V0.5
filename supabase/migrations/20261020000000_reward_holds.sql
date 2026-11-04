-- CHEAT15 / CHEAT14 (decision Q-004): hold the reward of high-risk sessions, for 24 hours at most.
-- A session whose risk at recording reaches "review" (explainable score >= 8, private.titan_session_risk) is saved
-- as usual, counts toward the daily and weekly allowances, but its XP and credits are not credited yet: they wait in
-- private.titan_reward_holds. Then exactly one of: (1) 24 hours pass with no decision and the hourly job
-- private.titan_release_due_reward_holds() credits them; (2) an administrator excludes the session
-- (titan_session_exclusion_v1) and the hold is cancelled; (3) an administrator restores the session (or accepts the
-- player's appeal) and the held reward is credited at once. Nothing already credited is ever taken back, no balance can
-- go negative, a suspended account keeps its holds, and a reward is credited at most once. The player is told in the
-- RPC answer (reward_held, held_xp, held_credits, release_at).
-- Interface change: titan_submit_training_session gains four trailing columns, so it is dropped and recreated with the
-- same grants (existing clients ignore unknown columns). The caller owns the transaction.
-- Rollback must preserve the 17-column contract and every unsettled hold once exposed.
-- Do not replay the old 13-column CREATE OR REPLACE (Postgres rejects its changed return type).
-- Keep the hold table until ALL status='held' rows are resolved, including suspended users;
-- one release-job call (limit 500, suspended users skipped) cannot establish this.
-- A compensating migration must be rehearsed on a restored copy; see release plan row 22.

create table if not exists private.titan_reward_holds (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  log_id uuid not null unique references public.training_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  xp integer not null check (xp >= 0),
  credits integer not null check (credits >= 0),
  release_at timestamptz not null,
  status text not null default 'held' check (status in ('held', 'released', 'cancelled')),
  settled_at timestamptz,
  check ((status = 'held') = (settled_at is null))
);
create index if not exists titan_reward_holds_due_idx on private.titan_reward_holds (release_at) where status = 'held';
create index if not exists titan_reward_holds_user_idx on private.titan_reward_holds (user_id);
alter table private.titan_reward_holds enable row level security;
revoke all on table private.titan_reward_holds from public, anon, authenticated;

-- grant = true: credit a held (or previously cancelled) reward once; grant = false: cancel a held reward.
-- p_only_held = true (the hourly job): credit ONLY a still-held reward, so an exclusion that committed after the job
-- read the session can never be overridden; only an administrator's restoration may turn cancelled into released.
create or replace function private.titan_reward_hold_settle(p_log uuid, p_grant boolean, p_only_held boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hold record;
begin
  select * into v_hold from private.titan_reward_holds where log_id = p_log for update;
  if not found then
    return;
  end if;
  if p_grant then
    if v_hold.status = 'held' or (v_hold.status = 'cancelled' and not p_only_held) then
      -- When an administrator's restoration triggers the grant, the profile guard needs its documented admin marker
      -- (transaction-local, honoured only for an administrator caller); the job runs without a JWT and needs none.
      perform set_config('titan.admin_profile_write', 'on', true);
      perform public.titan_apply_progression_reward(v_hold.user_id, v_hold.xp, v_hold.credits);
      perform set_config('titan.admin_profile_write', '', true);
      update private.titan_reward_holds set status = 'released', settled_at = now() where id = v_hold.id;
    end if;
  elsif v_hold.status = 'held' then
    update private.titan_reward_holds set status = 'cancelled', settled_at = now() where id = v_hold.id;
  end if;
end;
$function$;
revoke all on function private.titan_reward_hold_settle(uuid, boolean, boolean) from public, anon, authenticated;

-- Credits every due hold of an account in good standing; returns how many were credited. One failing hold is isolated.
create or replace function private.titan_release_due_reward_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_done integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('titan_release_reward_holds', 0)) then
    return 0;
  end if;
  for v_row in
    select h.log_id, l.is_suspicious
      from private.titan_reward_holds h
      join public.training_logs l on l.id = h.log_id
      join public.profiles p on p.id = h.user_id
     where h.status = 'held' and h.release_at <= now()
       and not coalesce(p.is_suspended, false) and coalesce(p.status, 'active') not in ('suspended', 'banned')
     order by h.release_at
     limit 500
  loop
    begin
      if coalesce(v_row.is_suspicious, false) then
        perform private.titan_reward_hold_settle(v_row.log_id, false);
      else
        perform private.titan_reward_hold_settle(v_row.log_id, true, true);
        v_done := v_done + 1;
      end if;
    exception when others then
      raise warning 'titan_release_due_reward_holds: hold for session % skipped (%)', v_row.log_id, sqlerrm;
    end;
  end loop;
  return v_done;
end;
$function$;
revoke all on function private.titan_release_due_reward_holds() from public, anon, authenticated;

drop function if exists public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz);

create or replace function public.titan_submit_training_session(
  p_sport text, p_category text, p_val numeric, p_unit text default ''::text,
  p_details jsonb default '{}'::jsonb, p_date timestamptz default now()
)
returns table(log_id text, xp integer, credits integer, credits_after integer, xp_after integer, level_after integer,
  level_bonus integer, leveled_up integer, requested_xp integer, requested_credits integer,
  weekly_xp_remaining integer, weekly_credits_remaining integer, server_version text,
  reward_held boolean, held_xp integer, held_credits integer, release_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_sport text := left(regexp_replace(trim(coalesce(p_sport, 'unknown')), '[[:cntrl:]]', '', 'g'), 80);
  v_category text := lower(left(regexp_replace(trim(coalesce(p_category, 'training')), '[[:cntrl:]]', '', 'g'), 80));
  v_unit text := lower(left(regexp_replace(trim(coalesce(p_unit, '')), '[[:cntrl:]]', '', 'g'), 24));
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_val numeric := coalesce(p_val, 0);
  v_effort jsonb;
  v_historical boolean;
  v_raw_xp integer := 0;
  v_daily_xp integer := 0;
  v_day_used integer := 0;
  v_xp integer := 0;
  v_credits integer := 0;
  v_log_id text;
  v_progress record;
  v_cap record;
  v_event uuid := coalesce(nullif(v_details ->> 'client_event_id', '')::uuid, gen_random_uuid());
  v_request jsonb := jsonb_build_object('sport', p_sport, 'category', p_category, 'val', p_val, 'unit', p_unit, 'details', p_details, 'date', p_date);
  v_receipt public.training_receipts%rowtype;
  v_response jsonb;
  v_version constant text := 'sport-effort-v300';
  v_held boolean := false;
  v_release_at timestamptz;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = v_user_id and not coalesce(is_suspended, false) for update;
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode = '42501'; end if;

  select * into v_receipt from public.training_receipts where user_id = v_user_id and client_event_id = v_event;
  if found then
    if v_receipt.request <> v_request then raise exception 'EVENT_CONTENT_CONFLICT' using errcode = '23505'; end if;
    return query select r.* from jsonb_to_record(v_receipt.response) as r(log_id text, xp integer, credits integer,
      credits_after integer, xp_after integer, level_after integer, level_bonus integer, leveled_up integer,
      requested_xp integer, requested_credits integer, weekly_xp_remaining integer, weekly_credits_remaining integer,
      server_version text, reward_held boolean, held_xp integer, held_credits integer, release_at timestamptz);
    return;
  end if;

  if jsonb_typeof(v_details) <> 'object' or octet_length(v_details::text) > 100000 then
    raise exception 'TRAINING_DETAILS_INVALID' using errcode = '22023';
  end if;
  if p_date is null then raise exception 'TRAINING_DATE_REQUIRED' using errcode = '22023'; end if;
  if v_val <= 0 or v_val > 300000 then raise exception 'TRAINING_VALUE_OUT_OF_RANGE' using errcode = '22023'; end if;
  if p_date > now() + interval '10 minutes' or p_date < timestamptz '1990-01-01' then
    raise exception 'TRAINING_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if coalesce(public.titan_numeric_from_json(v_details, 'duration'), 0) > 1440
     or coalesce(public.titan_numeric_from_json(v_details, 'val2'), 0) > 1440
     or (v_unit = 'min' and v_val > 1440) then
    raise exception 'TRAINING_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;

  v_historical := p_date < now() - interval '30 days';
  v_effort := public.titan_effort_v300(v_sport, v_unit, v_val, v_details);
  v_raw_xp := case when v_historical then 0 else (v_effort ->> 'xp')::integer end;

  if not v_historical then
    select coalesce(sum(l.xp), 0)::integer into v_day_used
      from public.training_logs l
     where l.user_id = v_user_id
       and l.created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
    v_daily_xp := least(v_raw_xp, greatest(0, 1800 - v_day_used));
  end if;

  select * into v_cap from public.titan_apply_weekly_reward_cap(v_user_id, v_daily_xp, floor(v_daily_xp * 0.1)::integer);
  v_xp := coalesce(v_cap.xp_awarded, 0);
  v_credits := coalesce(v_cap.credits_awarded, 0);

  insert into public.training_logs(client_event_id, user_id, sport, category, val, unit, xp, date, details)
  values (v_event, v_user_id, v_sport, v_category, v_val, v_unit, v_xp, p_date,
    v_details || jsonb_build_object(
      'serverReward', not v_historical,
      'serverVersion', v_version,
      'historical', v_historical,
      'rewardEligible', not v_historical,
      'balanceProfile', v_effort ->> 'profile',
      'effort', v_effort,
      'requestedXp', v_raw_xp,
      'requestedCredits', floor(v_raw_xp * 0.1)::integer,
      'credits', v_credits,
      'creditRatio', 0.1,
      'dailyXpCap', 1800,
      'dailyCapped', v_daily_xp < v_raw_xp,
      'weeklyXpCap', v_cap.xp_cap,
      'weeklyCreditCap', v_cap.credit_cap,
      'weeklyXpRemaining', greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0)),
      'weeklyCreditsRemaining', greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0)),
      'weeklyCapped', coalesce(v_cap.is_capped, false)))
  returning id::text into v_log_id;
  if v_log_id is null then raise exception 'TRAINING_REJECTED' using errcode = '23514'; end if;

  -- CHEAT15: a session whose risk at recording reaches "review" (score >= 8) has its reward held for at most 24 hours
  -- (released by private.titan_release_due_reward_holds, cancelled by an exclusion, granted by a restoration).
  -- Nothing already granted is ever taken back; the weekly allowance stays consumed.
  if not v_historical and (v_xp > 0 or v_credits > 0) then
    -- A session missing from the 100 most recent scored ones (a back-dated entry among many newer sessions) cannot be
    -- scored: it is held out of caution rather than rewarded unchecked.
    v_held := coalesce((select max(case when e ->> 'id' = v_log_id then (e ->> 'score')::integer end) >= 8
                          from jsonb_array_elements(private.titan_session_risk(v_user_id, 100)) e), true);
  end if;
  if v_held then
    v_release_at := now() + interval '24 hours';
    insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at)
    values (v_log_id::uuid, v_user_id, v_xp, v_credits, v_release_at);
    select greatest(0, coalesce(p.credits, 0)) as credits_after, greatest(0, coalesce(p.xp, 0)) as xp_after,
           greatest(1, coalesce(p.level, 1)) as level_after, 0 as level_bonus, 0 as leveled_up
      into v_progress from public.profiles p where p.id = v_user_id;
  else
    select * into v_progress from public.titan_apply_progression_reward(v_user_id, v_xp, v_credits);
  end if;

  v_response := jsonb_build_object('log_id', v_log_id, 'xp', case when v_held then 0 else v_xp end,
    'credits', case when v_held then 0 else v_credits end,
    'credits_after', v_progress.credits_after, 'xp_after', v_progress.xp_after, 'level_after', v_progress.level_after,
    'level_bonus', v_progress.level_bonus, 'leveled_up', v_progress.leveled_up,
    'requested_xp', v_raw_xp, 'requested_credits', floor(v_raw_xp * 0.1)::integer,
    'weekly_xp_remaining', greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0)),
    'weekly_credits_remaining', greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0)),
    'server_version', v_version,
    'reward_held', v_held, 'held_xp', case when v_held then v_xp else 0 end,
    'held_credits', case when v_held then v_credits else 0 end, 'release_at', v_release_at);
  insert into public.training_receipts(user_id, client_event_id, request, response) values (v_user_id, v_event, v_request, v_response);

  return query select v_log_id, case when v_held then 0 else v_xp end, case when v_held then 0 else v_credits end,
    v_progress.credits_after::integer, v_progress.xp_after::integer,
    v_progress.level_after::integer, v_progress.level_bonus::integer, v_progress.leveled_up::integer,
    v_raw_xp, floor(v_raw_xp * 0.1)::integer,
    greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0))::integer,
    greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0))::integer,
    v_version, v_held, case when v_held then v_xp else 0 end, case when v_held then v_credits else 0 end, v_release_at;
end;
$function$;

revoke all on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public, anon;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to service_role;

create or replace function public.titan_session_exclusion_v1(p_session uuid, p_excluded boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_log record;
begin
  if p_excluded is null then
    raise exception 'EXCLUSION_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select id, user_id, is_suspicious, status into v_log from public.training_logs where id = p_session for update;
  if not found or v_log.user_id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_log.user_id = v_admin then
    raise exception 'CANNOT_MODERATE_SELF' using errcode = '42501';
  end if;
  if private.titan_is_admin(v_log.user_id) then
    raise exception 'CANNOT_MODERATE_ADMIN' using errcode = '42501';
  end if;
  if coalesce(v_log.is_suspicious, false) = p_excluded
     and (v_log.status not in ('valid', 'suspicious') or (v_log.status = 'suspicious') = p_excluded) then
    return jsonb_build_object('session', p_session, 'excluded', p_excluded, 'changed', false);
  end if;

  perform public.titan_admin_audit_write('session.exclusion', v_log.user_id,
    jsonb_build_object('session', p_session, 'excluded', p_excluded, 'reason', v_reason, 'previous', coalesce(v_log.is_suspicious, false)));

  perform set_config('titan.admin_session_review', 'on', true);
  update public.training_logs
     set is_suspicious = p_excluded,
         status = case when status in ('valid', 'suspicious') then (case when p_excluded then 'suspicious' else 'valid' end) else status end,
         admin_note = v_reason, reviewed_at = now(), reviewed_by = v_admin
   where id = p_session;
  perform set_config('titan.admin_session_review', '', true);
  -- CHEAT15: an exclusion cancels a pending reward hold; a restoration grants it (once).
  perform private.titan_reward_hold_settle(p_session, not p_excluded);

  return jsonb_build_object('session', p_session, 'excluded', p_excluded, 'changed', true);
end;
$function$;

revoke all on function public.titan_session_exclusion_v1(uuid, boolean, text) from public, anon;
grant execute on function public.titan_session_exclusion_v1(uuid, boolean, text) to authenticated;

-- Hourly release, only where pg_cron exists (production: yes; the local bench: no).
do $cron$
declare
  v_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_job from cron.job where jobname = 'titan_release_reward_holds';
    if v_job is null then
      perform cron.schedule('titan_release_reward_holds', '17 * * * *', 'select private.titan_release_due_reward_holds();');
    else
      perform cron.alter_job(v_job, schedule => '17 * * * *', command => 'select private.titan_release_due_reward_holds();');
    end if;
  end if;
end;
$cron$;
