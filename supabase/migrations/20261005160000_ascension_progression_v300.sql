-- TITAN 300 Ascension — progression v300 (sport-effort-v300).
-- XP = normalized effort (time × intensity), identical for every sport and every plan.
-- Sessions older than 30 days are accepted as history: journal only, no XP, credits or campaign evidence.
-- Existing players keep their total XP; levels are recomputed on the new curve and never go down.

-- 1. Effort calculator. Pure and explainable; mirrored by js/core/effort.js.
create or replace function public.titan_effort_v300(p_sport text, p_unit text, p_val numeric, p_details jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_unit text := lower(coalesce(p_unit, ''));
  v_val numeric := greatest(coalesce(p_val, 0), 0);
  v_profile text;
  v_minutes numeric;
  v_estimated boolean := false;
  v_speed numeric;
  v_sets integer := 0;
  v_rpe numeric;
  v_intensity numeric;
  v_counted numeric;
begin
  select s.balance_profile into v_profile from public.sports s where s.id = p_sport;
  v_profile := coalesce(v_profile, '');

  v_minutes := coalesce(
    nullif(greatest(public.titan_numeric_from_json(d -> 'gpxStats', 'movingMinutes'), 0), 0),
    nullif(greatest(public.titan_numeric_from_json(d, 'val2'), 0), 0),
    nullif(greatest(public.titan_numeric_from_json(d, 'duration'), 0), 0),
    case when v_unit = 'min' and v_val > 0 then v_val end,
    case when v_unit = 'h' and v_val > 0 then v_val * 60 end
  );

  if v_minutes is null then
    v_estimated := true;
    if v_unit = 'km' then
      v_speed := case p_sport
        when 'walking' then 5 when 'nordic_walk' then 5.5 when 'hiking' then 4 when 'snowshoeing' then 3.5
        when 'trail' then 8 when 'race_walking' then 7 when 'treadmill' then 10 when 'orienteering' then 7
        when 'mountain_bike' then 14 when 'gravel' then 18 when 'velotaf' then 16 when 'cycling_indoor' then 25
        when 'rowing' then 10 when 'coastal_rowing' then 9 when 'kayak' then 7 when 'paddle' then 5
        when 'cross_country_skiing' then 10 when 'alpine_skiing' then 20 when 'ski_touring' then 4
        when 'ski_mountaineering' then 4 end;
      v_speed := coalesce(v_speed, case v_profile
        when 'running' then 10 when 'trail' then 8 when 'mountain_endurance' then 5 when 'hiking' then 4.5
        when 'cycling' then 22 when 'mtb' then 14 when 'glide' then 14 when 'water' then 7
        when 'mixed' then 11 when 'mixed_conditioning' then 9 end, 10);
      v_minutes := v_val / v_speed * 60;
    elsif v_unit = 'm' then
      v_minutes := case when v_profile = 'swimming' then v_val / 40 when v_profile = 'climbing' then 45 else 20 end;
    elsif v_unit = 'kg' then
      select coalesce(sum(case
          when jsonb_typeof(x -> 'setRows') = 'array' then jsonb_array_length(x -> 'setRows')
          else greatest(0, round(coalesce(public.titan_numeric_from_json(x, 'sets'), 0)))::integer end), 0)
        into v_sets
        from jsonb_array_elements(case when jsonb_typeof(d -> 'exercises') = 'array' then d -> 'exercises' else '[]'::jsonb end) x;
      v_minutes := case when v_sets > 0 then greatest(15, v_sets * 2.5) else 45 end;
    elsif v_unit = 'reps' then
      v_minutes := least(90, greatest(10, v_val * 0.15));
    elsif v_unit = 'saut' then
      v_minutes := v_val * 10;
    else
      v_minutes := 30;
    end if;
  end if;

  v_minutes := least(1440, greatest(0, v_minutes));
  v_counted := least(v_minutes, 90) + 0.5 * least(greatest(v_minutes - 90, 0), 90);
  v_rpe := public.titan_numeric_from_json(d -> 'bio', 'rpe');
  if v_rpe is null then v_rpe := public.titan_numeric_from_json(d, 'rpe'); end if;
  if v_rpe is not null then v_rpe := least(10, greatest(1, v_rpe)); end if;
  v_intensity := 0.6 + 0.08 * coalesce(v_rpe, 5);

  return jsonb_build_object(
    'version', 'sport-effort-v300',
    'profile', v_profile,
    'minutes', round(v_minutes, 1),
    'estimated', v_estimated,
    'rpe', v_rpe,
    'intensity', round(v_intensity, 2),
    'counted', round(v_counted, 1),
    'effort_minutes', round(v_counted * v_intensity, 1),
    'xp', greatest(1, round(v_counted * v_intensity * 10))::integer
  );
end;
$$;
revoke all on function public.titan_effort_v300(text, text, numeric, jsonb) from public;
grant execute on function public.titan_effort_v300(text, text, numeric, jsonb) to anon, authenticated;

-- 2. Level curve: req(L) = round(500 × L^1.3).
create or replace function public.titan_level_requirement(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1, round(500 * power(greatest(1, coalesce(p_level, 1))::numeric, 1.3))::integer);
$$;

-- 3. Same total XP, new curve. The previous curve was floor(2200 × L^1.18); the new one is lower at
--    every level, so recomputed levels are always >= current levels.
alter table public.profiles disable trigger titan_guard_profile_progression_trigger;
do $$
declare r record; v_total numeric; v_level integer; v_req integer;
begin
  for r in select id, greatest(1, coalesce(level, 1)) as lvl, greatest(0, coalesce(xp, 0)) as xp, coalesce(game_state, '{}'::jsonb) as gs
           from public.profiles
  loop
    v_total := r.xp;
    for i in 1 .. r.lvl - 1 loop
      v_total := v_total + floor(2200 * power(i::numeric, 1.18));
    end loop;
    v_level := 1;
    loop
      v_req := public.titan_level_requirement(v_level);
      exit when v_total < v_req or v_level >= 500;
      v_total := v_total - v_req;
      v_level := v_level + 1;
    end loop;
    if v_level >= r.lvl then
      update public.profiles
      set level = v_level,
          xp = v_total::integer,
          game_state = r.gs || jsonb_build_object('user',
            case when jsonb_typeof(r.gs -> 'user') = 'object' then r.gs -> 'user' else '{}'::jsonb end
            || jsonb_build_object('level', v_level, 'xp', v_total::integer, 'progressionVersion', 'v300'))
      where id = r.id;
    end if;
  end loop;
end $$;
alter table public.profiles enable trigger titan_guard_profile_progression_trigger;

-- 4. Economy limits: same for everyone, credits = 10 % of XP, daily cap.
create or replace function public.titan_economy_limits(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_subject uuid := coalesce(auth.uid(), p_user_id);
  v_is_elite boolean := false;
begin
  if v_subject is not null then
    select coalesce(p.is_elite, false) into v_is_elite from public.profiles as p where p.id = v_subject;
  end if;
  return jsonb_build_object(
    'isElite', coalesce(v_is_elite, false),
    'chatGlobalCost', 2,
    'chatGuildCost', 3,
    'guildCreateCost', 3000,
    'messageMaxLength', case when coalesce(v_is_elite, false) then 700 else 280 end,
    'freeMessageMaxLength', 280,
    'eliteMessageMaxLength', 700,
    'globalRetentionHours', 48,
    'guildRetentionHours', 72,
    'dailyXpCap', 1800,
    'weeklyXpCap', 9600,
    'weeklyCreditCap', 1800,
    'eliteCapMultiplier', 1,
    'trainingCreditRatio', 0.1,
    'historyDays', 30,
    'fairPlayVersion', 'v300'
  );
end;
$$;

-- 5. Progression snapshot: caps come from the shared economy limits (no premium multiplier).
create or replace function private.titan_progression_snapshot_v78()
returns table (
  server_user_id uuid, level integer, xp integer, credits integer, is_elite boolean, is_tester boolean,
  is_suspended boolean, training_total integer, training_7d integer, training_30d integer,
  last_training_at timestamptz, week_start date, weekly_xp_used integer, weekly_credits_used integer,
  weekly_xp_cap integer, weekly_credit_cap integer, weekly_xp_remaining integer,
  weekly_credits_remaining integer, authority text, rules_version text, checked_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := public.titan_week_start(now());
  v_limits jsonb;
  v_level integer := 1; v_xp integer := 0; v_credits integer := 0;
  v_is_elite boolean := false; v_is_tester boolean := false; v_is_suspended boolean := false;
  v_training_total integer := 0; v_training_7d integer := 0; v_training_30d integer := 0;
  v_last_training_at timestamptz := null;
  v_weekly_xp_used integer := 0; v_weekly_credits_used integer := 0;
  v_weekly_xp_cap integer; v_weekly_credit_cap integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select greatest(1, coalesce(p.level, 1)), greatest(0, coalesce(p.xp, 0)), greatest(0, coalesce(p.credits, 0)),
         coalesce(p.is_elite, false), coalesce(p.is_tester, false), coalesce(p.is_suspended, false)
    into v_level, v_xp, v_credits, v_is_elite, v_is_tester, v_is_suspended
    from public.profiles as p where p.id = v_uid;
  v_limits := public.titan_economy_limits(v_uid);
  v_weekly_xp_cap := coalesce((v_limits ->> 'weeklyXpCap')::integer, 9600);
  v_weekly_credit_cap := coalesce((v_limits ->> 'weeklyCreditCap')::integer, 1800);
  select count(*)::integer,
         count(*) filter (where coalesce(tl.date, now()) >= now() - interval '7 days')::integer,
         count(*) filter (where coalesce(tl.date, now()) >= now() - interval '30 days')::integer,
         max(tl.date)
    into v_training_total, v_training_7d, v_training_30d, v_last_training_at
    from public.training_logs as tl
   where tl.user_id = v_uid and coalesce(tl.status, 'valid') = 'valid' and tl.archived_at is null;
  select greatest(0, coalesce(u.xp_awarded, 0)), greatest(0, coalesce(u.credits_awarded, 0))
    into v_weekly_xp_used, v_weekly_credits_used
    from public.titan_weekly_reward_usage as u where u.user_id = v_uid and u.week_start = v_week;
  return query select v_uid, v_level, v_xp, v_credits, v_is_elite, v_is_tester, v_is_suspended,
    coalesce(v_training_total, 0), coalesce(v_training_7d, 0), coalesce(v_training_30d, 0), v_last_training_at,
    v_week, coalesce(v_weekly_xp_used, 0), coalesce(v_weekly_credits_used, 0), v_weekly_xp_cap, v_weekly_credit_cap,
    greatest(0, v_weekly_xp_cap - coalesce(v_weekly_xp_used, 0)),
    greatest(0, v_weekly_credit_cap - coalesce(v_weekly_credits_used, 0)),
    'server_authoritative'::text, 'v300-effort'::text, now();
end;
$$;

-- 6. Training guard: history (no XP) is allowed in bulk without tripping the anti-farming rate limit,
--    and is no longer flagged for review.
create or replace function public.titan_guard_training_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_duration_min numeric;
  v_distance_km numeric;
  v_elevation_m numeric;
  v_gpx_points integer;
  v_hour_count integer;
  v_day_count integer;
  v_history_day_count integer;
  v_details_bytes integer;
  v_historical boolean;
begin
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'TRAINING_USER_MISMATCH' using errcode = '42501';
  end if;

  new.sport := left(coalesce(new.sport, 'unknown'), 80);
  new.category := left(coalesce(new.category, 'training'), 80);
  new.unit := left(coalesce(new.unit, ''), 24);
  new.details := coalesce(new.details, '{}'::jsonb);
  new.date := coalesce(new.date, now());
  new.xp := coalesce(new.xp, 0);
  new.val := coalesce(new.val, 0);
  v_historical := coalesce(new.details ->> 'historical', 'false') = 'true' and new.xp = 0;

  v_payload := jsonb_build_object('operation', TG_OP, 'sport', new.sport, 'category', new.category, 'unit', new.unit,
    'val', new.val, 'xp', new.xp, 'date', new.date, 'details', new.details);

  v_details_bytes := octet_length(new.details::text);
  v_duration_min := coalesce(nullif(public.titan_jsonb_numeric(new.details, 'val2'), 0),
                             nullif(public.titan_jsonb_numeric(new.details, 'duration'), 0));
  v_distance_km := case when new.unit = 'km' then new.val else public.titan_jsonb_numeric(new.details, 'distance') end;
  v_elevation_m := coalesce(public.titan_jsonb_numeric(new.details, 'elevation'), 0);
  v_gpx_points := case when jsonb_typeof(new.details -> 'gpxPath') = 'array' then jsonb_array_length(new.details -> 'gpxPath') else 0 end;

  if new.val <= 0 or new.val > 300000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_VALUE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if new.xp < 0 or new.xp > 25000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'critical', 'TRAINING_XP_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if new.date > now() + interval '10 minutes' then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DATE_IN_FUTURE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_details_bytes > 50000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DETAILS_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_gpx_points > 1200 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_GPX_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_duration_min is not null and (v_duration_min <= 0 or v_duration_min > 1440) then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DURATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_distance_km is not null and v_distance_km > 300 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DISTANCE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_elevation_m > 12000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_ELEVATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;

  if TG_OP = 'INSERT' then
    if v_historical then
      select count(*) into v_history_day_count from public.training_logs
       where user_id = new.user_id and created_at >= now() - interval '24 hours'
         and coalesce(details ->> 'historical', 'false') = 'true';
      if v_history_day_count >= 300 then
        perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_HISTORY_IMPORT_LIMIT', v_payload);
        raise exception 'TRAINING_RATE_LIMIT' using errcode = '23514';
      end if;
    else
      select count(*) into v_hour_count from public.training_logs
       where user_id = new.user_id and created_at >= now() - interval '1 hour'
         and coalesce(details ->> 'historical', 'false') <> 'true';
      select count(*) into v_day_count from public.training_logs
       where user_id = new.user_id and created_at >= now() - interval '24 hours'
         and coalesce(details ->> 'historical', 'false') <> 'true';
      if v_hour_count >= 12 or v_day_count >= 40 then
        perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'critical', 'TRAINING_FREQUENCY_OUT_OF_RANGE',
          v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count));
        raise exception 'TRAINING_RATE_LIMIT' using errcode = '23514';
      elsif v_hour_count >= 6 or v_day_count >= 20 then
        perform public.titan_log_suspicious_action(new.user_id, 'training_log.flagged', 'medium', 'TRAINING_FREQUENCY_HIGH',
          v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count));
      end if;
    end if;
  end if;

  if new.xp > 10000 or (new.date < now() - interval '30 days' and not v_historical) then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.flagged', 'medium', 'TRAINING_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$;

-- 7. Session submission v300. Same signature and receipts (idempotent replay, content conflict detection).
create or replace function public.titan_submit_training_session(
  p_sport text, p_category text, p_val numeric, p_unit text default ''::text,
  p_details jsonb default '{}'::jsonb, p_date timestamptz default now()
)
returns table(log_id text, xp integer, credits integer, credits_after integer, xp_after integer, level_after integer,
  level_bonus integer, leveled_up integer, requested_xp integer, requested_credits integer,
  weekly_xp_remaining integer, weekly_credits_remaining integer, server_version text)
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
      server_version text);
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

  select * into v_progress from public.titan_apply_progression_reward(v_user_id, v_xp, v_credits);

  v_response := jsonb_build_object('log_id', v_log_id, 'xp', v_xp, 'credits', v_credits,
    'credits_after', v_progress.credits_after, 'xp_after', v_progress.xp_after, 'level_after', v_progress.level_after,
    'level_bonus', v_progress.level_bonus, 'leveled_up', v_progress.leveled_up,
    'requested_xp', v_raw_xp, 'requested_credits', floor(v_raw_xp * 0.1)::integer,
    'weekly_xp_remaining', greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0)),
    'weekly_credits_remaining', greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0)),
    'server_version', v_version);
  insert into public.training_receipts(user_id, client_event_id, request, response) values (v_user_id, v_event, v_request, v_response);

  return query select v_log_id, v_xp, v_credits, v_progress.credits_after::integer, v_progress.xp_after::integer,
    v_progress.level_after::integer, v_progress.level_bonus::integer, v_progress.leveled_up::integer,
    v_raw_xp, floor(v_raw_xp * 0.1)::integer,
    greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0))::integer,
    greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0))::integer,
    v_version;
end;
$function$;

-- 8. Adventure evidence: one contribution per day, no history, plus capped normalized effort for guardians.
create or replace function public.titan_adventure_evidence(p_world text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
  with eligible as (
    select l.id, (l.date at time zone a.timezone)::date as day, l.created_at,
      coalesce(
        public.titan_numeric_from_json(l.details -> 'effort', 'effort_minutes'),
        public.titan_numeric_from_json(public.titan_effort_v300(l.sport, l.unit, l.val, l.details), 'effort_minutes'),
        0) as effort
    from public.adventure_progress a join public.training_logs l on l.user_id = a.user_id
    where a.user_id = (select auth.uid()) and a.world_id = p_world and a.chapter <= 9
      and l.archived_at is null and l.is_suspicious is not true
      and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review')
      and l.created_at >= a.started_at and l.date <= now()
      and (l.date at time zone a.timezone)::date >= (a.started_at at time zone a.timezone)::date
      and l.val > 0 and l.details ->> 'serverReward' = 'true'
      and coalesce(l.details ->> 'historical', 'false') <> 'true'
      and (a.route = 'rhythm' or length(trim(coalesce(l.details ->> 'note', l.details ->> 'notes', ''))) >= 10)
  ), days as (
    select day, least(90, sum(effort)) as effort, (array_agg(id order by created_at, id))[1] as id
    from eligible group by day
  )
  select jsonb_build_object(
    'days', count(*),
    'effort', coalesce(round(sum(effort)), 0),
    'source_ids', coalesce(jsonb_agg(id order by day), '[]'::jsonb))
  from days;
$$;
revoke all on function public.titan_adventure_evidence(text) from public, anon;
grant execute on function public.titan_adventure_evidence(text) to authenticated;

create or replace function public.titan_adventure_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_suspended is not true) then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'version', 2, 'owner', v_uid, 'generated_at', now(),
    'level', p.level, 'xp', p.xp, 'credits', p.credits, 'next_level_xp', public.titan_level_requirement(p.level),
    'plus', p.is_elite is true and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at > now()),
    'avatar', coalesce(a.avatar, 'scout'), 'selected_world', coalesce(a.selected_world, 'aube'), 'revision', coalesce(a.revision, 0),
    'campaigns', (select jsonb_agg(jsonb_build_object('id', w.id, 'tier', w.tier, 'chapter', coalesce(ap.chapter, 0),
        'route', coalesce(ap.route, 'rhythm'), 'started_at', ap.started_at, 'completed_at', ap.completed_at,
        'target', case when ap.chapter <= 9 then (array[1,2,2,2,3,2,3,3,3])[ap.chapter] else 0 end,
        'effort_target', case when ap.chapter = 9 then 150 else 0 end,
        'evidence', public.titan_adventure_evidence(w.id)) order by w.id)
      from public.adventure_worlds w left join public.adventure_progress ap on ap.world_id = w.id and ap.user_id = v_uid),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('world', r.world_id, 'chapter', r.chapter, 'earned_at', r.earned_at) order by r.earned_at desc)
      from public.adventure_rewards r where r.user_id = v_uid), '[]'::jsonb)
  ) into v_result
  from public.profiles p left join public.adventure_profiles a on a.user_id = p.id where p.id = v_uid;
  return v_result;
end;
$$;

-- Guardian trial: the ninth chapter also needs 150 capped effort minutes.
create or replace function private.titan_adventure_action(
  p_action text, p_world text, p_route text, p_avatar text, p_revision integer, p_chapter integer, p_timezone text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid(); v_profile public.profiles%rowtype; v_state public.adventure_profiles%rowtype;
  v_progress public.adventure_progress%rowtype; v_world public.adventure_worlds%rowtype;
  v_evidence jsonb; v_target integer; v_required integer; v_plus boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('start', 'select', 'claim', 'avatar') then raise exception 'INVALID_ACTION'; end if;
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_suspended is true then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
  v_plus := v_profile.is_elite is true and v_profile.elite_refunded_at is null and (v_profile.elite_ends_at is null or v_profile.elite_ends_at > now());
  insert into public.adventure_profiles(user_id) values (v_uid) on conflict do nothing;
  select * into v_state from public.adventure_profiles where user_id = v_uid for update;
  if p_revision is null or (p_revision <> v_state.revision and not (p_revision = 0 and v_state.revision = 1)) then
    raise exception 'ADVENTURE_CONFLICT' using errcode = '40001';
  end if;
  if p_action = 'avatar' then
    v_required := case p_avatar when 'scout' then 1 when 'ranger' then 1 when 'keeper' then 3 when 'artisan' then 6
      when 'navigator' then 10 when 'sentinel' then 15 end;
    if v_required is null or v_profile.level < v_required then raise exception 'AVATAR_LOCKED' using errcode = '42501'; end if;
    update public.adventure_profiles set avatar = p_avatar where user_id = v_uid;
  else
    select * into v_world from public.adventure_worlds where id = p_world;
    if not found then raise exception 'INVALID_WORLD'; end if;
    if p_action in ('start', 'claim') and v_world.tier = 'plus' and v_plus is not true then
      raise exception 'TITAN_PLUS_REQUIRED' using errcode = '42501';
    end if;
    select * into v_progress from public.adventure_progress where user_id = v_uid and world_id = p_world for update;
    if p_action = 'start' then
      if p_route is null or p_route not in ('rhythm', 'journal') then raise exception 'INVALID_ROUTE'; end if;
      if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
        raise exception 'INVALID_TIMEZONE';
      end if;
      insert into public.adventure_progress(user_id, world_id, route, timezone) values (v_uid, p_world, p_route, p_timezone)
        on conflict do nothing;
    elsif p_action = 'claim' then
      if v_progress.user_id is null or p_chapter is null or v_progress.chapter <> p_chapter or p_chapter > 9 then
        raise exception 'ADVENTURE_CONFLICT' using errcode = '40001';
      end if;
      v_target := (array[1,2,2,2,3,2,3,3,3])[p_chapter];
      v_evidence := public.titan_adventure_evidence(p_world);
      if (v_evidence ->> 'days')::integer < v_target then raise exception 'QUEST_INCOMPLETE'; end if;
      if p_chapter = 9 and coalesce((v_evidence ->> 'effort')::numeric, 0) < 150 then
        raise exception 'GUARDIAN_EFFORT_INCOMPLETE';
      end if;
      insert into public.adventure_rewards(user_id, world_id, chapter, source_ids)
        values (v_uid, p_world, p_chapter, array(select value::uuid from jsonb_array_elements_text(v_evidence -> 'source_ids')));
      update public.adventure_progress set chapter = chapter + 1, started_at = clock_timestamp(),
        completed_at = case when chapter = 9 then now() else null end
      where user_id = v_uid and world_id = p_world;
    end if;
    update public.adventure_profiles set selected_world = p_world where user_id = v_uid;
  end if;
  update public.adventure_profiles set revision = revision + 1, updated_at = now() where user_id = v_uid;
  return public.titan_adventure_snapshot();
end;
$$;
revoke all on function private.titan_adventure_action(text, text, text, text, integer, integer, text) from public, anon;
grant execute on function private.titan_adventure_action(text, text, text, text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
