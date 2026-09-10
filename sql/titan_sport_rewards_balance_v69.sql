-- TITAN OS v69 - Sport reward balance + GPX-aware server authority
-- Purpose:
-- - keep XP paced toward a 52 week endgame target
-- - make credits rarer than XP
-- - calculate sport effort from useful duration, distance, volume, D+ and intensity
-- - keep connected accounts Supabase-first

create or replace function public.titan_economy_limits(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_elite boolean := false;
begin
  if p_user_id is not null then
    select coalesce(is_elite, false)
    into v_is_elite
    from public.profiles
    where id = p_user_id;
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
    'weeklyXpCap', case when coalesce(v_is_elite, false) then 11520 else 9600 end,
    'weeklyCreditCap', case when coalesce(v_is_elite, false) then 2160 else 1800 end,
    'eliteCapMultiplier', 1.2,
    'trainingCreditRatio', 0.16
  );
end;
$$;

drop function if exists public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz);

create function public.titan_submit_training_session(
  p_sport text,
  p_category text,
  p_val numeric,
  p_unit text default '',
  p_details jsonb default '{}'::jsonb,
  p_date timestamptz default now()
)
returns table (
  log_id text,
  xp integer,
  credits integer,
  credits_after integer,
  xp_after integer,
  level_after integer,
  level_bonus integer,
  leveled_up integer,
  requested_xp integer,
  requested_credits integer,
  weekly_xp_remaining integer,
  weekly_credits_remaining integer,
  server_version text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_sport text := left(regexp_replace(trim(coalesce(p_sport, 'unknown')), '[[:cntrl:]]', '', 'g'), 80);
  v_category text := lower(left(regexp_replace(trim(coalesce(p_category, 'training')), '[[:cntrl:]]', '', 'g'), 80));
  v_unit text := lower(left(regexp_replace(trim(coalesce(p_unit, '')), '[[:cntrl:]]', '', 'g'), 24));
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_val numeric := coalesce(p_val, 0);
  v_duration numeric;
  v_elevation numeric;
  v_base numeric;
  v_score numeric;
  v_soft_cap numeric;
  v_hard_cap numeric;
  v_cap_hardness numeric := 10;
  v_rpe numeric := 5;
  v_rpe_text text := coalesce(v_details #>> '{bio,rpe}', '');
  v_gpx_minutes_text text := coalesce(v_details #>> '{gpxStats,movingMinutes}', '');
  v_gpx_ascent_text text := coalesce(v_details #>> '{gpxStats,ascent}', '');
  v_terrain text := lower(coalesce(v_details #>> '{extras,terrain}', v_details #>> '{extras,surface}', v_details #>> '{extras,technicality}', ''));
  v_profile text;
  v_is_elite boolean := false;
  v_intensity numeric;
  v_terrain_mult numeric := 1;
  v_planned_mult numeric := 1;
  v_xp integer;
  v_credits integer;
  v_requested_xp integer;
  v_requested_credits integer;
  v_log_id text;
  v_progress record;
  v_cap record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_val <= 0 or v_val > 300000 then
    raise exception 'TRAINING_VALUE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  if p_date > now() + interval '10 minutes' or p_date < now() - interval '30 days' then
    raise exception 'TRAINING_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  select coalesce(is_elite, false)
  into v_is_elite
  from public.profiles
  where id = v_user_id;

  v_duration := coalesce(
    case when v_gpx_minutes_text ~ '^[0-9]+(\.[0-9]+)?$' then v_gpx_minutes_text::numeric end,
    nullif(public.titan_numeric_from_json(v_details, 'val2'), 0),
    nullif(public.titan_numeric_from_json(v_details, 'duration'), 0),
    case when v_unit = 'min' then v_val else 0 end
  );
  v_elevation := coalesce(
    case when v_gpx_ascent_text ~ '^[0-9]+(\.[0-9]+)?$' then v_gpx_ascent_text::numeric end,
    public.titan_numeric_from_json(v_details, 'elevation'),
    0
  );

  if v_duration < 0 or v_duration > 1440 then
    raise exception 'TRAINING_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;

  v_elevation := least(greatest(coalesce(v_elevation, 0), 0), 12000);
  if v_rpe_text ~ '^[0-9]+(\.[0-9]+)?$' then
    v_rpe := least(10, greatest(1, v_rpe_text::numeric));
  end if;

  v_profile := case
    when v_unit = 'kg' or v_category like '%muscu%' or v_category like '%force%' then 'strength'
    when v_unit = 'km' and (v_sport ilike '%trail%' or v_category like '%outdoor%') then 'trail'
    when v_unit = 'km' and (v_sport ilike '%velo%' or v_sport ilike '%bike%' or v_sport ilike '%cycling%') then 'cycling'
    when v_unit = 'km' and (v_sport ilike '%rando%' or v_sport ilike '%hiking%' or v_sport ilike '%marche%') then 'hiking'
    when v_unit = 'km' then 'running'
    when v_category like '%combat%' then 'combat'
    when v_category like '%team%' or v_category like '%collectif%' then 'team'
    when v_category like '%mobil%' or v_category like '%health%' or v_category like '%recovery%' then 'mobility'
    else 'generic'
  end;

  if v_terrain ~ '(mountain|montagne|snow|neige|mud|boue|rock|tech)' then
    v_terrain_mult := 1.08;
  elsif v_terrain ~ '(trail|sentier|gravel|sable|sand|wind|vent)' then
    v_terrain_mult := 1.05;
  end if;

  if lower(coalesce(v_details ->> 'isPlanned', 'false')) in ('true', '1', 'yes', 'on') then
    v_planned_mult := 1.04;
  end if;

  if v_profile = 'strength' then
    v_base := sqrt(least(v_val, 300000)) * 3.15 + least(v_duration, 120) * 0.75;
    v_soft_cap := 520;
    v_hard_cap := 900;
  elsif v_unit = 'km' then
    v_base := least(v_val, 250)
      * case when v_profile = 'cycling' then 19 when v_profile = 'hiking' then 24 when v_profile = 'trail' then 36 else 32 end
      + least(v_duration, 600) * 0.55
      + least(v_elevation, 6000) * case when v_profile in ('trail', 'hiking') then 0.105 else 0.075 end;
    v_soft_cap := case when v_profile = 'trail' then 620 else 560 end;
    v_hard_cap := case when v_profile = 'trail' then 1050 else 950 end;
  elsif v_unit = 'min' then
    v_base := least(v_val, 720) * case when v_profile = 'mobility' then 3.1 else 4.65 end;
    v_soft_cap := case when v_profile = 'mobility' then 260 else 460 end;
    v_hard_cap := case when v_profile = 'mobility' then 480 else 820 end;
  elsif v_profile in ('combat', 'team') then
    v_base := least(greatest(v_duration, v_val), 240) * 4.2 + least(v_val, 500) * 0.42;
    v_soft_cap := 540;
    v_hard_cap := 920;
  else
    v_base := least(v_val, 10000) * 6 + least(v_duration, 180) * 0.6;
    v_soft_cap := 460;
    v_hard_cap := 820;
  end if;

  v_intensity := least(1.13, 1 + greatest(v_rpe - 5, 0) * 0.025);
  v_score := greatest(0, v_base * v_intensity * v_terrain_mult * v_planned_mult);
  if v_score > v_soft_cap then
    v_score := v_soft_cap + sqrt(v_score - v_soft_cap) * v_cap_hardness;
  end if;

  v_hard_cap := v_hard_cap * case when coalesce(v_is_elite, false) then 1.05 else 1 end;
  v_requested_xp := greatest(1, floor(least(v_score, v_hard_cap))::integer);
  v_requested_credits := least(
    case when coalesce(v_is_elite, false) then 108 else 90 end,
    greatest(0, floor(v_requested_xp * 0.16)::integer)
  );

  select *
  into v_cap
  from public.titan_apply_weekly_reward_cap(v_user_id, v_requested_xp, v_requested_credits);

  v_xp := coalesce(v_cap.xp_awarded, 0);
  v_credits := coalesce(v_cap.credits_awarded, 0);

  insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details)
  values (
    v_user_id,
    v_sport,
    v_category,
    v_val,
    v_unit,
    v_xp,
    coalesce(p_date, now()),
    v_details || jsonb_build_object(
      'serverReward',
      true,
      'serverVersion',
      'sport-balance-v69',
      'balanceProfile',
      v_profile,
      'requestedXp',
      v_requested_xp,
      'requestedCredits',
      v_requested_credits,
      'credits',
      v_credits,
      'creditRatio',
      0.16,
      'weeklyXpCap',
      v_cap.xp_cap,
      'weeklyCreditCap',
      v_cap.credit_cap,
      'weeklyXpRemaining',
      greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, coalesce(v_cap.xp_awarded, 0))),
      'weeklyCreditsRemaining',
      greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, coalesce(v_cap.credits_awarded, 0))),
      'weeklyCapped',
      coalesce(v_cap.is_capped, false)
    )
  )
  returning id::text into v_log_id;

  select *
  into v_progress
  from public.titan_apply_progression_reward(v_user_id, v_xp, v_credits);

  return query
  select
    v_log_id,
    v_xp,
    v_credits,
    v_progress.credits_after::integer,
    v_progress.xp_after::integer,
    v_progress.level_after::integer,
    v_progress.level_bonus::integer,
    v_progress.leveled_up::integer,
    v_requested_xp,
    v_requested_credits,
    greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, coalesce(v_cap.xp_awarded, 0)))::integer,
    greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, coalesce(v_cap.credits_awarded, 0)))::integer,
    'sport-balance-v69'::text;
end;
$$;

revoke all on function public.titan_economy_limits(uuid) from public;
revoke execute on function public.titan_economy_limits(uuid) from anon;
grant execute on function public.titan_economy_limits(uuid) to authenticated;

revoke all on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public;
revoke execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from anon;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;
