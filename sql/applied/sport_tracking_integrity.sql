-- Export of migration 20260911000358, already deployed before this refactor.
-- Historical source recovered from Supabase on 2026-09-11; do not run again blindly.
-- Additive upgrade from the inspected production schema. No user data is removed.
-- All RPC operations below commit or roll back as one transaction.
alter table public.training_logs add column if not exists client_event_id uuid;
alter table public.training_logs add column if not exists created_at timestamptz;
update public.training_logs set created_at=coalesce(date,now()) where created_at is null;
alter table public.training_logs alter column created_at set default now();
alter table public.training_logs alter column created_at set not null;
alter table public.training_logs add column if not exists archived_at timestamptz;
alter table public.training_logs add column if not exists revision integer not null default 1;
create unique index if not exists training_event_unique on public.training_logs(user_id,client_event_id);
create index if not exists training_history_page on public.training_logs(user_id,date desc,id desc);
alter table public.profiles add column if not exists state_version integer not null default 1;
create table if not exists public.training_receipts (
 user_id uuid not null references public.profiles(id) on delete cascade,
 client_event_id uuid not null, request jsonb not null, response jsonb not null,
 created_at timestamptz not null default now(), primary key(user_id,client_event_id)
);
alter table public.training_receipts enable row level security;
revoke all on public.training_receipts from public,anon,authenticated;
create table if not exists public.training_revisions (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 log_id uuid not null references public.training_logs(id) on delete cascade,
 snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table public.training_revisions enable row level security;
revoke all on public.training_revisions from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.titan_submit_training_session(p_sport text, p_category text, p_val numeric, p_unit text DEFAULT ''::text, p_details jsonb DEFAULT '{}'::jsonb, p_date timestamp with time zone DEFAULT now())
 RETURNS TABLE(log_id text, xp integer, credits integer, credits_after integer, xp_after integer, level_after integer, level_bonus integer, leveled_up integer, requested_xp integer, requested_credits integer, weekly_xp_remaining integer, weekly_credits_remaining integer, server_version text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_event uuid := coalesce(nullif(v_details->>'client_event_id','')::uuid,gen_random_uuid());
  v_request jsonb := jsonb_build_object('sport',p_sport,'category',p_category,'val',p_val,'unit',p_unit,'details',p_details,'date',p_date);
  v_receipt public.training_receipts%rowtype;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform 1 from public.profiles where id=v_user_id and not coalesce(is_suspended,false) for update;
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
  select * into v_receipt from public.training_receipts where user_id=v_user_id and client_event_id=v_event;
  if found then
    if v_receipt.request <> v_request then raise exception 'EVENT_CONTENT_CONFLICT' using errcode='23505'; end if;
    return query select r.* from jsonb_to_record(v_receipt.response) as r(log_id text,xp integer,credits integer,credits_after integer,xp_after integer,level_after integer,level_bonus integer,leveled_up integer,requested_xp integer,requested_credits integer,weekly_xp_remaining integer,weekly_credits_remaining integer,server_version text);
    return;
  end if;
  if jsonb_typeof(v_details) <> 'object' or octet_length(v_details::text)>100000 then
    raise exception 'TRAINING_DETAILS_INVALID' using errcode='22023';
  end if;
  if p_date is null then raise exception 'TRAINING_DATE_REQUIRED' using errcode='22023'; end if;
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

  v_hard_cap := v_hard_cap;
  v_requested_xp := greatest(1, floor(least(v_score, v_hard_cap))::integer);
  v_requested_credits := least(
    90,
    greatest(0, floor(v_requested_xp * 0.16)::integer)
  );

  select *
  into v_cap
  from public.titan_apply_weekly_reward_cap(v_user_id, v_requested_xp, v_requested_credits);

  v_xp := coalesce(v_cap.xp_awarded, 0);
  v_credits := coalesce(v_cap.credits_awarded, 0);

  insert into public.training_logs(client_event_id, user_id, sport, category, val, unit, xp, date, details)
  values (
    v_event,
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
      'sport-integrity-v101',
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
  if v_log_id is null then raise exception 'TRAINING_REJECTED' using errcode='23514'; end if;

  select *
  into v_progress
  from public.titan_apply_progression_reward(v_user_id, v_xp, v_credits);

  v_response := jsonb_build_object('log_id',v_log_id,'xp',v_xp,'credits',v_credits,
    'credits_after',v_progress.credits_after,'xp_after',v_progress.xp_after,'level_after',v_progress.level_after,
    'level_bonus',v_progress.level_bonus,'leveled_up',v_progress.leveled_up,
    'requested_xp',v_requested_xp,'requested_credits',v_requested_credits,
    'weekly_xp_remaining',greatest(0,coalesce(v_cap.xp_cap,0)-coalesce(v_cap.xp_used,0)),
    'weekly_credits_remaining',greatest(0,coalesce(v_cap.credit_cap,0)-coalesce(v_cap.credits_used,0)),
    'server_version','sport-integrity-v101');
  insert into public.training_receipts(user_id,client_event_id,request,response) values(v_user_id,v_event,v_request,v_response);
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
    'sport-integrity-v101'::text;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_guard_training_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb;
  v_duration_min numeric;
  v_distance_km numeric;
  v_elevation_m numeric;
  v_gpx_points integer;
  v_hour_count integer;
  v_day_count integer;
  v_details_bytes integer;
  v_old_or_null public.training_logs%rowtype;
begin
  if TG_OP = 'UPDATE' then
    v_old_or_null := old;
  end if;

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

  v_payload := jsonb_build_object(
    'operation', TG_OP,
    'sport', new.sport,
    'category', new.category,
    'unit', new.unit,
    'val', new.val,
    'xp', new.xp,
    'date', new.date,
    'details', new.details
  );

  v_details_bytes := octet_length(new.details::text);
  v_duration_min := coalesce(
    nullif(public.titan_jsonb_numeric(new.details, 'val2'), 0),
    nullif(public.titan_jsonb_numeric(new.details, 'duration'), 0)
  );
  v_distance_km := case
    when new.unit = 'km' then new.val
    else public.titan_jsonb_numeric(new.details, 'distance')
  end;
  v_elevation_m := coalesce(public.titan_jsonb_numeric(new.details, 'elevation'), 0);
  v_gpx_points := case
    when jsonb_typeof(new.details -> 'gpxPath') = 'array' then jsonb_array_length(new.details -> 'gpxPath')
    else 0
  end;

  if new.val <= 0 or new.val > 300000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_VALUE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if new.xp < 0 or new.xp > 25000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'critical', 'TRAINING_XP_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if new.date > now() + interval '10 minutes' then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DATE_IN_FUTURE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_details_bytes > 50000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DETAILS_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_gpx_points > 1200 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_GPX_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_duration_min is not null and (v_duration_min <= 0 or v_duration_min > 1440) then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DURATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_distance_km is not null and v_distance_km > 300 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DISTANCE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_elevation_m > 12000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_ELEVATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if TG_OP = 'INSERT' then
    select count(*) into v_hour_count
    from public.training_logs
    where user_id = new.user_id
      and created_at >= now() - interval '1 hour';

    select count(*) into v_day_count
    from public.training_logs
    where user_id = new.user_id
      and created_at >= now() - interval '24 hours';

    if v_hour_count >= 12 or v_day_count >= 40 then
      perform public.titan_log_suspicious_action(
        new.user_id,
        'training_log.rejected',
        'critical',
        'TRAINING_FREQUENCY_OUT_OF_RANGE',
        v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count)
      );
      raise exception 'TRAINING_RATE_LIMIT' using errcode='23514';
    elsif v_hour_count >= 6 or v_day_count >= 20 then
      perform public.titan_log_suspicious_action(
        new.user_id,
        'training_log.flagged',
        'medium',
        'TRAINING_FREQUENCY_HIGH',
        v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count)
      );
    end if;
  end if;

  if new.xp > 10000 or new.date < now() - interval '30 days' then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.flagged', 'medium', 'TRAINING_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_save_profile_state(p_state jsonb, p_username text DEFAULT NULL::text, p_avatar text DEFAULT NULL::text, p_inventory jsonb DEFAULT NULL::jsonb, p_privacy jsonb DEFAULT NULL::jsonb, p_streak_count integer DEFAULT NULL::integer, p_last_week_id text DEFAULT NULL::text, p_last_seen_news_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.profiles%rowtype;
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_username text := coalesce(public.titan_clean_state_username(p_username), 'Agent');
  v_avatar text := null;
  v_inventory jsonb := coalesce(p_inventory, '{}'::jsonb);
  v_privacy jsonb := coalesce(p_privacy, '{}'::jsonb);
  v_streak integer := greatest(0, coalesce(p_streak_count, 0));
  v_last_week_id text := left(coalesce(p_last_week_id, ''), 32);
  v_news text := nullif(left(coalesce(p_last_seen_news_version, ''), 64), '');
  v_result public.profiles%rowtype;
  v_user jsonb;
  v_preferences jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if jsonb_typeof(v_state) <> 'object' then
    raise exception 'STATE_MUST_BE_OBJECT' using errcode = '22023';
  end if;

  if octet_length(v_state::text) > 350000 then
    raise exception 'STATE_TOO_LARGE' using errcode = '54000';
  end if;

  if p_avatar ~* '^(avatar_[0-9]+\.(png|jpe?g|webp|gif)|[a-z0-9_-]+_[0-9]+\.(png|jpe?g|webp|gif))$' then
    v_avatar := p_avatar;
  end if;

  select *
  into v_existing
  from public.profiles
  where id = v_uid for update;

  if not found or coalesce(v_existing.is_suspended,false) then
    raise exception 'PROFILE_UNAVAILABLE' using errcode='42501';
  end if;
  if v_state #>> '{meta,profileVersion}' is not null and (v_state #>> '{meta,profileVersion}')::integer <> v_existing.state_version then
    raise exception 'PROFILE_VERSION_CONFLICT' using errcode='40001';
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_preferences
  from jsonb_each(coalesce(v_state->'user','{}'::jsonb)) where key in
    ('name','avatar','weeklyGoalSessions','favoriteSports','favorites','schedule','gymRoutines','goals','sportGoals','onboardingComplete','preferredSports','units','theme','notifications','lastSessionSummary');
  v_user := coalesce(v_existing.game_state->'user','{}'::jsonb) || v_preferences || jsonb_build_object(
    'id',v_uid,'isGuest',false,'xp',v_existing.xp,'credits',v_existing.credits,'level',v_existing.level,
    'is_elite',v_existing.is_elite,'is_tester',v_existing.is_tester,'is_suspended',v_existing.is_suspended,
    'inventory',v_existing.inventory,'unlockedTalents',to_jsonb(v_existing.unlocked_talents));
  v_state := coalesce(v_existing.game_state,'{}'::jsonb) || jsonb_build_object('user',v_user,
    'meta',jsonb_build_object('profileVersion',v_existing.state_version+1));
  v_inventory := coalesce(v_existing.inventory,'{}'::jsonb);
  v_streak := coalesce(v_existing.streak_count,0);
  v_privacy := coalesce(p_privacy,v_existing.privacy,'{}'::jsonb);
  insert into public.profiles (
    id,
    username,
    avatar,
    game_state,
    inventory,
    privacy,
    streak_count,
    last_week_id,
    last_seen_news_version,
    updated_at
  )
  values (
    v_uid,
    v_username,
    v_avatar,
    v_state,
    v_inventory,
    v_privacy,
    v_streak,
    v_last_week_id,
    v_news,
    now()
  )
  on conflict (id) do update set
    state_version = public.profiles.state_version + 1,
    username = excluded.username,
    avatar = coalesce(excluded.avatar, public.profiles.avatar),
    game_state = excluded.game_state,
    inventory = excluded.inventory,
    privacy = excluded.privacy,
    streak_count = excluded.streak_count,
    last_week_id = excluded.last_week_id,
    last_seen_news_version = coalesce(excluded.last_seen_news_version, public.profiles.last_seen_news_version),
    updated_at = now()
  returning *
  into v_result;

  return jsonb_build_object(
    'state_version', v_result.state_version,
    'id', v_result.id,
    'username', v_result.username,
    'avatar', v_result.avatar,
    'game_state', v_result.game_state,
    'inventory', v_result.inventory,
    'privacy', v_result.privacy,
    'streak_count', v_result.streak_count,
    'last_week_id', v_result.last_week_id,
    'last_seen_news_version', v_result.last_seen_news_version,
    'friend_code', v_result.friend_code,
    'credits', v_result.credits,
    'level', v_result.level,
    'xp', v_result.xp,
    'is_elite', coalesce(v_result.is_elite, false),
    'is_tester', coalesce(v_result.is_tester, false),
    'is_suspended', coalesce(v_result.is_suspended, false),
    'updated_at', v_result.updated_at
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_submit_combat_victory(p_enemy_key text, p_enemy_type text, p_enemy_id text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_level integer DEFAULT 1, p_reward_mult numeric DEFAULT 1, p_damage integer DEFAULT 0, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(combat_log_id uuid, reward_xp integer, reward_credits integer, credits_after integer, xp_after integer, level_after integer, level_bonus integer, leveled_up integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_enemy_key text := left(regexp_replace(trim(coalesce(p_enemy_key, '')), '[[:cntrl:]]', '', 'g'), 120);
  v_enemy_type text := upper(left(trim(coalesce(p_enemy_type, 'MOB')), 12));
  v_enemy_id text := nullif(left(regexp_replace(trim(coalesce(p_enemy_id, '')), '[[:cntrl:]]', '', 'g'), 80), '');
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_name, '')), '[[:cntrl:]]', '', 'g'), 120), '');
  v_level integer := least(500, greatest(1, coalesce(p_level, 1)));
  v_reward_mult numeric := least(10, greatest(0.1, coalesce(p_reward_mult, 1)));
  v_damage integer := least(10000000, greatest(0, coalesce(p_damage, 0)));
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_recent_count integer;
  v_base_credits integer;
  v_requested_credits integer;
  v_requested_xp integer;
  v_credits integer;
  v_xp integer;
  v_log_id uuid;
  v_progress record;
  v_cap record;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_enemy_key = '' then
    raise exception 'ENEMY_KEY_REQUIRED' using errcode = '22023';
  end if;

  if v_enemy_type not in ('MOB', 'BOSS') then
    raise exception 'ENEMY_TYPE_INVALID' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent_count
  from public.combat_logs
  where user_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent_count >= 40 then
    raise exception 'COMBAT_RATE_LIMIT' using errcode = '23514';
  end if;

  perform 1 from public.profiles where id=v_uid and not coalesce(is_suspended,false) for update;
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
  v_xp := 0; v_credits := 0; v_requested_xp := 0; v_requested_credits := 0;
  select coalesce(credits,0) credits_after,coalesce(xp,0) xp_after,coalesce(level,1) level_after,0 level_bonus,0 leveled_up
  into v_progress from public.profiles where id=v_uid;
  select 0 xp_cap,0 credit_cap,false is_capped into v_cap;
  insert into public.combat_logs(
    user_id,
    enemy_key,
    enemy_type,
    enemy_id,
    name,
    result,
    damage,
    reward_xp,
    reward_credits,
    details
  )
  values (
    v_uid,
    v_enemy_key,
    v_enemy_type,
    v_enemy_id,
    v_name,
    'victory',
    v_damage,
    v_xp,
    v_credits,
    v_details || jsonb_build_object(
      'serverReward',
      true,
      'serverVersion',
      'adventure-cosmetic-v101',
      'requestedXp',
      v_requested_xp,
      'requestedCredits',
      v_requested_credits,
      'weeklyXpCap',
      v_cap.xp_cap,
      'weeklyCreditCap',
      v_cap.credit_cap,
      'weeklyCapped',
      coalesce(v_cap.is_capped, false),
      'rewardMult',
      v_reward_mult,
      'level',
      v_level
    )
  )
  returning id into v_log_id;

  insert into public.user_bestiary(
    user_id,
    enemy_key,
    enemy_type,
    enemy_id,
    name,
    defeats,
    last_defeated_at
  )
  values (
    v_uid,
    v_enemy_key,
    v_enemy_type,
    v_enemy_id,
    v_name,
    1,
    now()
  )
  on conflict (user_id, enemy_key) do update
  set defeats = public.user_bestiary.defeats + 1,
      enemy_type = excluded.enemy_type,
      enemy_id = coalesce(excluded.enemy_id, public.user_bestiary.enemy_id),
      name = coalesce(excluded.name, public.user_bestiary.name),
      last_defeated_at = now();

  return query
  select
    v_log_id,
    v_xp,
    v_credits,
    v_progress.credits_after::integer,
    v_progress.xp_after::integer,
    v_progress.level_after::integer,
    v_progress.level_bonus::integer,
    v_progress.leveled_up::integer;
end;
$function$
;

-- Authoritative achievement criteria v1. Unverifiable legacy criteria fail closed.
create or replace function public.titan_claim_achievement(p_achievement_id text)
returns table(achievement_id text,unlocked boolean,reward_credits integer,credits_after integer)
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); a public.achievements_config%rowtype; p public.profiles%rowtype;
 progress numeric:=0; reward integer:=0; inserted boolean:=false;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into p from public.profiles where id=u for update;
 if not found or p.is_suspended then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into a from public.achievements_config where id=p_achievement_id;
 if not found then raise exception 'ACHIEVEMENT_NOT_FOUND' using errcode='22023'; end if;
 if exists(select 1 from public.user_achievements ua where ua.user_id=u and ua.achievement_id=a.id) then
  return query select a.id,false,0,coalesce(p.credits,0); return;
 end if;
 case
 when a.id like 'lvl_%' then progress:=p.level;
 when a.id like 'sess_%' or a.id like 'sessions_%' then
   select count(*) into progress from public.training_logs where user_id=u and archived_at is null;
 when a.id like 'str_%' then
   select coalesce(sum(val),0) into progress from public.training_logs where user_id=u and archived_at is null and unit='kg';
 when a.id like 'run_%' then
   select coalesce(sum(val),0) into progress from public.training_logs where user_id=u and archived_at is null and unit='km';
 when a.id like 'xp_%' then
   select coalesce(sum(xp),0) into progress from public.training_logs where user_id=u and archived_at is null;
 when a.id like 'rich_%' then
   select coalesce(sum((response->>'credits')::integer),0) into progress from public.training_receipts where user_id=u;
 when a.id like 'multi_sport_%' then
   select count(distinct sport) into progress from public.training_logs where user_id=u and archived_at is null;
 when a.id='profile_set' then progress:=case when p.avatar is not null and p.avatar<>'avatar_1.png' then 1 else 0 end;
 when a.id='support_elite' then progress:=case when p.is_elite then 1 else 0 end;
 when a.id in ('night_owl','early_bird','weekend_warrior') then
   select count(*) into progress from public.training_logs l where user_id=u and archived_at is null
   and case a.id when 'night_owl' then extract(hour from l.date at time zone 'Europe/Paris')>=23
    when 'early_bird' then extract(hour from l.date at time zone 'Europe/Paris')<7
    else extract(isodow from l.date at time zone 'Europe/Paris')=7 end;
 when a.id like 'streak_%' then
   select coalesce(max(n),0) into progress from (
    select count(*) n from (
      select d,d-(row_number() over(order by d))::integer grp from (
       select distinct (date at time zone 'Europe/Paris')::date d from public.training_logs where user_id=u and archived_at is null
      ) days
    ) islands group by grp
   ) runs;
 else raise exception 'ACHIEVEMENT_CRITERION_UNVERIFIED' using errcode='22023';
 end case;
 if progress<coalesce(a.target_value,1) then raise exception 'ACHIEVEMENT_NOT_EARNED' using errcode='23514'; end if;
 -- Paying for TITAN+ never yields progression currency.
 reward:=case when a.id='support_elite' then 0 else least(5000,greatest(0,coalesce(a.reward_credits,0))) end;
 insert into public.user_achievements(user_id,achievement_id,unlocked_at) values(u,a.id,now())
 on conflict do nothing returning true into inserted;
 if coalesce(inserted,false) then
  update public.profiles set credits=coalesce(credits,0)+reward where id=u returning * into p;
 else reward:=0;
 end if;
 return query select a.id,coalesce(inserted,false),reward,coalesce(p.credits,0);
end $$;

-- Corrections affect sports measurements; historical rewards remain earned once.
-- Archiving hides a session; restoring never re-awards it. Revisions preserve the prior values.
create or replace function public.titan_update_training_session(p_id uuid,p_revision integer,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); l public.training_logs%rowtype; v public.training_logs%rowtype;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into l from public.training_logs where id=p_id and user_id=u for update;
 if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
 if l.revision<>p_revision then raise exception 'SESSION_VERSION_CONFLICT' using errcode='40001'; end if;
 if jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>100000 then raise exception 'PATCH_INVALID' using errcode='22023'; end if;
 v:=l;
 if p_patch ? 'val' then v.val:=(p_patch->>'val')::numeric; end if;
 if p_patch ? 'date' then v.date:=(p_patch->>'date')::timestamptz; end if;
 if p_patch ? 'note' then v.details:=jsonb_set(coalesce(v.details,'{}'),'{note}',to_jsonb(left(p_patch->>'note',2000))); end if;
 if p_patch ? 'duration' then
  if jsonb_typeof(p_patch->'duration')<>'number' then raise exception 'DURATION_INVALID' using errcode='22023'; end if;
  if (p_patch->>'duration')::numeric <=0 or (p_patch->>'duration')::numeric>1440 then raise exception 'DURATION_INVALID' using errcode='22023'; end if;
  v.details:=jsonb_set(jsonb_set(coalesce(v.details,'{}'),'{val2}',p_patch->'duration'),'{duration}',p_patch->'duration');
 end if;
 if v.unit in ('min','h') and p_patch ? 'val' then
  v.details:=jsonb_set(jsonb_set(coalesce(v.details,'{}'),'{duration}',to_jsonb(v.val * case when v.unit='h' then 60 else 1 end)),'{val2}',to_jsonb(v.val * case when v.unit='h' then 60 else 1 end));
 end if;
 if p_patch ? 'archived' then v.archived_at:=case when (p_patch->>'archived')::boolean then now() else null end; end if;
 if v.val is null or v.val<=0 or v.val>300000 or v.date is null or v.date>now()+interval '10 minutes' then
  raise exception 'SESSION_INVALID' using errcode='22023';
 end if;
 insert into public.training_revisions(user_id,log_id,snapshot) values(u,l.id,to_jsonb(l));
 update public.training_logs set val=v.val,date=v.date,details=v.details,archived_at=v.archived_at,revision=l.revision+1
 where id=l.id returning * into v;
 if v.revision<>l.revision+1 then raise exception 'SESSION_REJECTED' using errcode='23514'; end if;
 return to_jsonb(v);
end $$;
revoke all on function public.titan_update_training_session(uuid,integer,jsonb) from public,anon;
grant execute on function public.titan_update_training_session(uuid,integer,jsonb) to authenticated;

-- Social challenge requests have zero stake until a fully audited settlement exists.
-- Existing wagers and balances are preserved, no automatic settlement by the browser.
revoke insert,update,delete on public.social_challenges from authenticated;
create or replace function public.titan_create_social_challenge(p_opponent uuid,p_sport text,p_target numeric default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.social_challenges%rowtype;
begin
 if u is null or p_opponent is null or p_sport is null or length(trim(p_sport))=0 or p_target is null or p_opponent=u or p_target<=0 or p_target>300000 then raise exception 'CHALLENGE_INVALID' using errcode='22023'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_opponent and not coalesce(is_suspended,false)) then raise exception 'OPPONENT_UNAVAILABLE' using errcode='22023'; end if;
 if (select count(*) from public.social_challenges where challenger_id=u and created_at>now()-interval '1 day')>=10 then raise exception 'CHALLENGE_RATE_LIMIT' using errcode='23514'; end if;
 insert into public.social_challenges(challenger_id,opponent_id,type,sport,target_val,stake,status,expires_at)
 values(u,p_opponent,'duel',left(p_sport,80),p_target,0,'pending',now()+interval '7 days') returning * into c;
 return to_jsonb(c);
end $$;
create or replace function public.titan_transition_social_challenge(p_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.social_challenges%rowtype;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into c from public.social_challenges where id=p_id and (challenger_id=u or opponent_id=u) for update;
 if not found then raise exception 'CHALLENGE_NOT_FOUND' using errcode='42501'; end if;
 if c.stake<>0 then raise exception 'LEGACY_WAGER_REQUIRES_SUPPORT' using errcode='22023'; end if;
 if c.status<>'pending' or c.expires_at<now() then raise exception 'CHALLENGE_STATE_CONFLICT' using errcode='40001'; end if;
 if p_action in ('accept','decline') and c.opponent_id=u then
  update public.social_challenges set status=case p_action when 'accept' then 'active' else 'declined' end where id=c.id returning * into c;
 elsif p_action='cancel' and c.challenger_id=u then
  update public.social_challenges set status='cancelled' where id=c.id returning * into c;
 else raise exception 'CHALLENGE_ACTION_FORBIDDEN' using errcode='42501'; end if;
 return to_jsonb(c);
end $$;
revoke all on function public.titan_create_social_challenge(uuid,text,numeric),public.titan_transition_social_challenge(uuid,text) from public,anon;
grant execute on function public.titan_create_social_challenge(uuid,text,numeric),public.titan_transition_social_challenge(uuid,text) to authenticated;
revoke execute on function public.titan_create_wager_challenge(uuid,text,integer) from public,anon,authenticated;

-- Consolidate only verified redundant catalog policies, preserve administrator policy.
drop policy if exists "Public Read Sports" on public.sports;
drop policy if exists game_data_public_read_sports on public.sports;
drop policy if exists titan_catalog_public_read on public.sports;
drop policy if exists "Tout le monde peut lire les news actives" on public.news_updates;
drop policy if exists game_data_public_read_news on public.news_updates;
drop policy if exists titan_catalog_public_read on public.news_updates;


