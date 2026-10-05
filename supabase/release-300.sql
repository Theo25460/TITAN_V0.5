-- =====================================================================
-- TITAN 300 · Ascension — mise en production de la base en une seule fois
-- =====================================================================
-- À coller tel quel dans Supabase › SQL Editor › New query, puis « Run ».
--
-- • Applique 9 migrations de supabase/migrations/ dans l'ordre
--   (20261005150000 → 20261005230000), dans UNE transaction : si une seule
--   instruction échoue, rien n'est modifié.
-- • Inscrit chaque migration dans supabase_migrations.schema_migrations.
-- • N'efface aucune donnée. Testé sur une réplique vide de la production.
-- • S'arrête sans rien faire s'il a déjà été appliqué.
--
-- Généré par tools/build-release-sql.mjs — ne pas modifier à la main.
-- =====================================================================

begin;

do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261005150000') then
    raise exception 'TITAN 300 déjà appliquée : rien à faire.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 20261005150000_ascension_security_lockdown.sql
-- ---------------------------------------------------------------------
-- TITAN 300 Ascension — P0 security lockdown.
-- Compatible with the deployed v200 front: guild, challenge and achievement writes already go through RPCs,
-- the admin console keeps its authenticated + admin-RLS path, anonymous intake tables keep INSERT only.

-- 1. Guilds: writes only through the SECURITY DEFINER RPCs (create / join / leave / target / messages).
--    Before: an owner could rewrite xp, level, boss_hp, code or chat_history, anyone could create a guild
--    without paying, and join any guild with any role.
drop policy if exists guilds_owner_write on public.guilds;
drop policy if exists guild_members_insert_self on public.guild_members;
drop policy if exists guild_members_delete_self_or_owner on public.guild_members;
revoke insert, update, delete on public.guilds, public.guild_members, public.guild_raid from anon, authenticated;

-- 1b. Guild read policies referenced guild_members from inside guild_members' own policy: any direct
--     read raised "infinite recursion detected in policy". Membership now comes from a definer helper.
create or replace function private.titan_my_guild_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gm.guild_id from public.guild_members gm where gm.user_id = (select auth.uid()) limit 1;
$$;
drop policy if exists guild_members_select_same_guild on public.guild_members;
create policy guild_members_select_same_guild on public.guild_members for select to authenticated
  using (user_id = (select auth.uid()) or guild_id = (select private.titan_my_guild_id()));
drop policy if exists guilds_member_select on public.guilds;
create policy guilds_member_select on public.guilds for select to authenticated
  using (owner_id = (select auth.uid()) or id = (select private.titan_my_guild_id()));
drop policy if exists guild_messages_member_select on public.guild_messages;
create policy guild_messages_member_select on public.guild_messages for select to authenticated
  using (hidden is false and guild_id = (select private.titan_my_guild_id()));

-- 2. Legacy permissive policies that were only neutralised by missing grants.
drop policy if exists user_achievements_own_all on public.user_achievements;
drop policy if exists inventory_own_all on public.inventory;
drop policy if exists inventory_own_select on public.inventory;
create policy inventory_own_select on public.inventory for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists social_challenges_involved_all on public.social_challenges;
drop policy if exists social_challenges_update_involved on public.social_challenges;
drop policy if exists social_challenges_insert_own on public.social_challenges;
drop policy if exists "Users can add friends" on public.friends;
drop policy if exists "Users can update friendship status" on public.friends;
drop policy if exists "Users can see their own friends" on public.friends;
drop policy if exists friends_involved_select on public.friends;
create policy friends_involved_select on public.friends for select to authenticated
  using ((select auth.uid()) = user_id or (select auth.uid()) = friend_id);
revoke insert, update, delete on public.user_achievements, public.inventory, public.social_challenges, public.friends
  from anon, authenticated;

-- 3. Dead admin policies pinned to a user id that does not exist; admin access stays on private.titan_is_admin().
drop policy if exists "Super Admin Quests" on public.dynamic_quests;
drop policy if exists "Super Admin Config" on public.global_config;

-- 4. One read policy per catalog table (same semantics: readable by everyone).
do $$
declare t text; p record;
begin
  foreach t in array array['achievements_config','bosses','fun_stats','global_config','items','mobs','talents','system_news','dynamic_quests']
  loop
    for p in select policyname from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT'
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy catalog_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- 5. Least privilege. RLS does not apply to TRUNCATE; nobody but the owner needs it.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
-- Anonymous visitors never update or delete; they may only insert into the three intake tables.
revoke insert, update, delete on all tables in schema public from anon;
grant insert on public.analytics_events, public.bug_reports, public.contact_messages to anon;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- 6. Private schema: no implicit PUBLIC execute. Policy helpers stay callable; admin and product
--    functions stay limited to signed-in users (each admin function asserts the admin role itself).
revoke execute on all functions in schema private from public, anon;
alter default privileges for role postgres in schema private revoke execute on functions from public;
grant execute on function private.titan_is_admin(uuid), private.titan_is_moderator_or_admin(uuid), private.titan_admin_role_for(uuid)
  to anon, authenticated;
grant execute on function private.titan_my_guild_id() to authenticated;
grant execute on function
  private.titan_admin_assert(),
  private.titan_admin_dashboard_v1(),
  private.titan_admin_get_context_v1(),
  private.titan_admin_grant_premium_v1(uuid, text, text, timestamptz, boolean, text),
  private.titan_admin_list_profiles_v1(text, text, text, text, integer, integer),
  private.titan_admin_log_v1(text, text, text, jsonb, jsonb, text),
  private.titan_admin_revoke_premium_v1(uuid, text),
  private.titan_admin_run_contest_draw_v1(text, text),
  private.titan_admin_update_profile_v1(uuid, jsonb, text),
  private.titan_admin_upsert_row_v1(text, text, jsonb, text),
  private.titan_adventure_action(text, text, text, text, integer, integer, text),
  private.titan_coach_portal(text, jsonb),
  private.titan_progression_snapshot_v78(),
  private.titan_update_training_session(uuid, integer, jsonb)
  to authenticated;

-- 7. SECURITY DEFINER functions resolving through `public`: pin pg_temp last so a temporary
--    object can never shadow an unqualified name.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and 'search_path=public' = any(coalesce(p.proconfig, '{}'))
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005150000', 'ascension_security_lockdown', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005160000_ascension_progression_v300.sql
-- ---------------------------------------------------------------------
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
    -- Talking to your team and founding a guild are free: credits buy cosmetics, not belonging.
    'chatGlobalCost', 2,
    'chatGuildCost', 0,
    'guildCreateCost', 0,
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
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005160000', 'ascension_progression_v300', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005170000_ascension_sport_labels.sql
-- ---------------------------------------------------------------------
-- TITAN 300 Ascension — clean French sport labels (generated by tools/build-sports-catalog.mjs --sql).
-- Display labels only: ids, units, rules and existing sessions are unchanged.
update public.sports s set label = v.label, updated_at = now()
from (values
  ('bmx', 'BMX dirt'),
  ('fitness_class', 'Cours collectif'),
  ('running', 'Course à pied'),
  ('orienteering', 'Course d’orientation'),
  ('hurdles', 'Course de haies'),
  ('climbing', 'Escalade (mètres grimpés)'),
  ('american_football', 'Football américain'),
  ('powerlifting', 'Force athlétique'),
  ('bjj', 'Jiu-jitsu brésilien'),
  ('krav_maga', 'Krav-maga'),
  ('kung_fu', 'Kung-fu'),
  ('walking', 'Marche'),
  ('farmers_walk', 'Marche du fermier'),
  ('nordic_walk', 'Marche nordique'),
  ('thaiboxing', 'Boxe thaï'),
  ('muscu_home', 'Musculation à la maison'),
  ('muscu_builder', 'Musculation'),
  ('parkour', 'Parkour'),
  ('bodyweight', 'Poids du corps'),
  ('pole_dance', 'Pole dance'),
  ('roller', 'Roller'),
  ('sandbag', 'Sac de sable'),
  ('muscu_gym', 'Musculation en salle'),
  ('savate', 'Savate boxe française'),
  ('abs_session', 'Abdos'),
  ('spinning', 'Spinning'),
  ('sprint', 'Fractionné'),
  ('squat', 'Squats au poids du corps'),
  ('street_workout', 'Street workout'),
  ('treadmill', 'Tapis de course'),
  ('trail', 'Trail'),
  ('trx', 'TRX'),
  ('ultimate', 'Ultimate'),
  ('cycling_indoor', 'Vélo d’intérieur'),
  ('cycling', 'Vélo'),
  ('elliptical', 'Vélo elliptique'),
  ('velotaf', 'Vélotaf'),
  ('via_ferrata', 'Via ferrata'),
  ('ski_touring', 'Ski de randonnée'),
  ('trekking', 'Trek'),
  ('yoga_mobility', 'Mobilité'),
  ('archery', 'Tir à l’arc'),
  ('athletics', 'Athlétisme'),
  ('boxing', 'Boxe anglaise'),
  ('canoe_slalom', 'Canoë slalom'),
  ('canoe_sprint', 'Canoë sprint'),
  ('cycling_road', 'Cyclisme sur route'),
  ('cycling_track', 'Cyclisme sur piste'),
  ('equestrian', 'Équitation'),
  ('open_water_swimming', 'Nage en eau libre'),
  ('coastal_rowing', 'Aviron de mer'),
  ('rugby_sevens', 'Rugby à 7'),
  ('swimming', 'Natation'),
  ('table_tennis', 'Tennis de table'),
  ('water_polo', 'Water-polo'),
  ('weightlifting', 'Haltérophilie'),
  ('nordic_combined', 'Combiné nordique'),
  ('ski_jumping', 'Saut à ski'),
  ('obstacle_course', 'Course à obstacles'),
  ('stair_climbing', 'Montée d’escaliers'),
  ('para_swimming', 'Para-natation'),
  ('para_athletics', 'Para-athlétisme'),
  ('dragon_boat', 'Bateau-dragon'),
  ('freediving', 'Apnée'),
  ('ballet', 'Danse classique'),
  ('circus', 'Arts du cirque'),
  ('hiphop', 'Hip-hop'),
  ('ice_skating', 'Patinage sur glace'),
  ('salsa', 'Danses latines'),
  ('windsurf', 'Planche à voile'),
  ('yoga', 'Yoga'),
  ('aerobic_gymnastics', 'Gym aérobic'),
  ('blind_football', 'Cécifoot'),
  ('canoe_polo', 'Canoë-polo'),
  ('gaelic_football', 'Football gaélique'),
  ('greco_roman_wrestling', 'Lutte gréco-romaine'),
  ('inline_speed_skating', 'Roller de vitesse'),
  ('outrigger_canoe', 'Pirogue va’a'),
  ('para_cycling', 'Para-cyclisme'),
  ('petanque', 'Pétanque'),
  ('race_walking', 'Marche athlétique'),
  ('show_jumping', 'Saut d’obstacles'),
  ('ski_orienteering', 'Orientation à ski'),
  ('speed_skiing', 'Kilomètre lancé'),
  ('telemark_skiing', 'Ski télémark'),
  ('tug_of_war', 'Tir à la corde')
) as v(id, label)
where s.id = v.id and s.label is distinct from v.label;

notify pgrst, 'reload schema';
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005170000', 'ascension_sport_labels', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005180000_ascension_private_by_default.sql
-- ---------------------------------------------------------------------
-- TITAN 300 Ascension — profiles are private by default.
-- Only the default for new rows changes: existing accounts keep the privacy they already have
-- (no rewrite of real data). The athlete opens visibility from Profil › Confidentialité.
alter table public.profiles
  alter column privacy set default '{"publicProfile": false, "showStats": false, "socialPresence": false, "friendRankings": false}'::jsonb;
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005180000', 'ascension_private_by_default', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005190000_ascension_profile_preferences.sql
-- ---------------------------------------------------------------------
-- TITAN 300 Ascension — two new athlete preferences survive cloud sync.
-- Same function as before; only the whitelist of user preferences gains 'cadencePauses' (weeks the
-- athlete paused) and 'onboardedAt' (first-run flow done). XP, level, credits and inventory keep
-- coming from the server row, never from the client.
create or replace function public.titan_save_profile_state(p_state jsonb, p_username text default null::text, p_avatar text default null::text, p_inventory jsonb default null::jsonb, p_privacy jsonb default null::jsonb, p_streak_count integer default null::integer, p_last_week_id text default null::text, p_last_seen_news_version text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to public, pg_temp
as $function$
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
    ('name','avatar','weeklyGoalSessions','favoriteSports','favorites','schedule','gymRoutines','goals','sportGoals','onboardingComplete','preferredSports','units','theme','notifications','lastSessionSummary','cadencePauses','onboardedAt');
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
$function$;
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005190000', 'ascension_profile_preferences', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005200000_ascension_social.sql
-- ---------------------------------------------------------------------
-- TITAN 300 Ascension — social layer.
-- Principles: consent before friendship, private by default, no stakes, effort normalized across sports
-- and capped per day (anti-farm), server computes every contribution. Tables are written through
-- SECURITY DEFINER RPCs only; nothing here grants XP or credits.

-- ---------------------------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.friendships f
      where coalesce(f.status, 'accepted') = 'accepted'
        and ((f.user_id_1 = p_a and f.user_id_2 = p_b) or (f.user_id_1 = p_b and f.user_id_2 = p_a)))
    and not exists (
      select 1 from public.titan_user_blocks k
      where (k.blocker_id = p_a and k.blocked_id = p_b) or (k.blocker_id = p_b and k.blocked_id = p_a));
$$;
revoke all on function private.titan_are_friends(uuid, uuid) from public, anon, authenticated;

-- Normalized effort per day for one athlete: server-computed effort minutes, history and flagged
-- sessions excluded, each day capped. Sessions must have been recorded after p_created_after.
create or replace function private.titan_effort_days(p_user uuid, p_from timestamptz, p_to timestamptz, p_created_after timestamptz, p_cap numeric default 90)
returns table (day date, minutes numeric, sessions integer, distance_km numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select (l.date at time zone 'Europe/Paris')::date as day,
         least(p_cap, sum(coalesce(public.titan_numeric_from_json(l.details -> 'effort', 'effort_minutes'), 0))) as minutes,
         least(2, count(*))::integer as sessions,
         sum(case when l.unit = 'km' then least(l.val, 300) else 0 end) as distance_km
  from public.training_logs l
  where l.user_id = p_user
    and l.archived_at is null
    and l.is_suspicious is not true
    and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review')
    and coalesce(l.details ->> 'historical', 'false') <> 'true'
    and l.date >= p_from and l.date < p_to and l.date <= now()
    and l.created_at >= p_created_after
  group by 1;
$$;
revoke all on function private.titan_effort_days(uuid, timestamptz, timestamptz, timestamptz, numeric) from public, anon, authenticated;

-- The social action log also rate-limits the new actions.
alter table public.titan_social_action_log drop constraint if exists titan_social_action_log_action_check;
alter table public.titan_social_action_log add constraint titan_social_action_log_action_check
  check (action = any (array['friend_add', 'friend_remove', 'block_user', 'unblock_user', 'moment_share', 'moment_cheer', 'challenge_create']));

-- ---------------------------------------------------------------------------------------------
-- 1. Friendships need the other person's consent.
--    The code only lets you *ask*; the friendship exists once accepted. Being findable by code is
--    the athlete's choice (privacy.publicProfile, false by default for new accounts).
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_guard_friendship_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if new.user_id_1 <> auth.uid() then
    raise exception 'FRIENDSHIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.titan_user_blocks b
    where (b.blocker_id = new.user_id_1 and b.blocked_id = new.user_id_2)
       or (b.blocker_id = new.user_id_2 and b.blocked_id = new.user_id_1)
  ) then
    raise exception 'USER_BLOCKED' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = new.user_id_2
      and (coalesce(p.is_suspended, false) or coalesce((p.privacy ->> 'publicProfile')::boolean, false) is false)
  ) then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = '42501';
  end if;
  perform public.titan_social_rate_limit(auth.uid(), 'friend_add', interval '1 day', 25);
  insert into public.titan_social_action_log(actor_id, action, target_id) values (auth.uid(), 'friend_add', new.user_id_2);
  return new;
end;
$$;

create or replace function public.titan_social_request(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_target public.profiles%rowtype;
  v_row public.friendships%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_code !~ '^TN-[A-Z2-9]{4,8}$' then raise exception 'INVALID_FRIEND_CODE' using errcode = '22023'; end if;
  select * into v_target from public.profiles where friend_code = v_code limit 1;
  -- Unknown, private, suspended or blocked all answer the same way: nothing leaks about the person.
  if v_target.id is null or v_target.id = v_uid or coalesce(v_target.is_suspended, false)
     or coalesce((v_target.privacy ->> 'publicProfile')::boolean, false) is false
     or exists (select 1 from public.titan_user_blocks b where (b.blocker_id = v_uid and b.blocked_id = v_target.id) or (b.blocker_id = v_target.id and b.blocked_id = v_uid)) then
    if v_target.id = v_uid then raise exception 'CANNOT_ADD_SELF' using errcode = '22023'; end if;
    raise exception 'FRIEND_CODE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_row from public.friendships f
   where (f.user_id_1 = v_uid and f.user_id_2 = v_target.id) or (f.user_id_1 = v_target.id and f.user_id_2 = v_uid)
   order by f.created_at limit 1;
  if v_row.id is not null then
    if coalesce(v_row.status, 'accepted') = 'accepted' then
      return jsonb_build_object('status', 'friends', 'id', v_target.id);
    end if;
    if v_row.user_id_1 = v_target.id then
      -- They asked first: asking back is accepting.
      update public.friendships set status = 'accepted' where id = v_row.id;
      return jsonb_build_object('status', 'friends', 'id', v_target.id);
    end if;
    return jsonb_build_object('status', 'pending', 'id', v_target.id);
  end if;
  insert into public.friendships(user_id_1, user_id_2, status) values (v_uid, v_target.id, 'pending');
  return jsonb_build_object('status', 'pending', 'id', v_target.id);
end;
$$;

create or replace function public.titan_social_respond(p_user uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select id into v_id from public.friendships where user_id_1 = p_user and user_id_2 = v_uid and status = 'pending';
  if v_id is null then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if coalesce(p_accept, false) then
    update public.friendships set status = 'accepted' where id = v_id;
    return jsonb_build_object('status', 'friends');
  end if;
  delete from public.friendships where id = v_id;
  return jsonb_build_object('status', 'declined');
end;
$$;

create or replace function public.titan_social_remove(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from public.friendships
   where (user_id_1 = v_uid and user_id_2 = p_user) or (user_id_1 = p_user and user_id_2 = v_uid);
  delete from public.titan_challenge_members m
   using public.titan_challenges c
   where m.challenge_id = c.id and m.user_id = p_user and c.creator_id = v_uid and m.status = 'invited';
  return jsonb_build_object('status', 'removed');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Moments: a few meaningful events, shared on purpose, visible to accepted friends only.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.titan_moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('record', 'goal', 'chapter', 'milestone', 'session', 'challenge', 'expedition', 'week')),
  title text not null check (length(title) between 1 and 90),
  detail text check (detail is null or length(detail) <= 140),
  sport text check (sport is null or length(sport) <= 80),
  log_id uuid references public.training_logs(id) on delete set null,
  visibility text not null default 'friends' check (visibility in ('friends', 'private')),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists titan_moments_user_created on public.titan_moments(user_id, created_at desc);
alter table public.titan_moments enable row level security;
revoke all on public.titan_moments from anon, authenticated;
drop policy if exists titan_moments_owner_read on public.titan_moments;
create policy titan_moments_owner_read on public.titan_moments for select to authenticated using (user_id = (select auth.uid()));
grant select on public.titan_moments to authenticated;

create table if not exists public.titan_moment_cheers (
  moment_id uuid not null references public.titan_moments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);
alter table public.titan_moment_cheers enable row level security;
revoke all on public.titan_moment_cheers from anon, authenticated;

create or replace function public.titan_moment_share(p_kind text, p_title text, p_detail text default null, p_sport text default null, p_log_id uuid default null, p_visibility text default 'friends')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.titan_moments%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and coalesce(is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if p_kind not in ('record', 'goal', 'chapter', 'milestone', 'session', 'challenge', 'expedition', 'week') then raise exception 'MOMENT_INVALID' using errcode = '22023'; end if;
  if p_log_id is not null and not exists (select 1 from public.training_logs where id = p_log_id and user_id = v_uid and archived_at is null) then
    raise exception 'MOMENT_INVALID' using errcode = '22023';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'moment_share', interval '1 day', 12);
  insert into public.titan_moments(user_id, kind, title, detail, sport, log_id, visibility)
  values (v_uid, p_kind,
    public.titan_clean_social_text(p_title, 'Moment', 90),
    nullif(public.titan_clean_social_text(p_detail, '', 140), ''),
    nullif(left(regexp_replace(coalesce(p_sport, ''), '[^a-z0-9_]', '', 'g'), 80), ''),
    p_log_id,
    case when p_visibility = 'private' then 'private' else 'friends' end)
  returning * into v_row;
  insert into public.titan_social_action_log(actor_id, action) values (v_uid, 'moment_share');
  return to_jsonb(v_row);
end;
$$;

create or replace function public.titan_moment_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from public.titan_moments where id = p_id and user_id = auth.uid();
end;
$$;

create or replace function public.titan_moment_cheer(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_on boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select user_id into v_owner from public.titan_moments where id = p_id and not hidden and visibility = 'friends';
  if v_owner is null or v_owner = v_uid or not private.titan_are_friends(v_uid, v_owner) then
    raise exception 'MOMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.titan_moment_cheers where moment_id = p_id and user_id = v_uid) then
    delete from public.titan_moment_cheers where moment_id = p_id and user_id = v_uid;
    v_on := false;
  else
    perform public.titan_social_rate_limit(v_uid, 'moment_cheer', interval '1 hour', 120);
    insert into public.titan_moment_cheers(moment_id, user_id) values (p_id, v_uid);
    insert into public.titan_social_action_log(actor_id, action, target_id) values (v_uid, 'moment_cheer', v_owner);
    v_on := true;
  end if;
  return jsonb_build_object('cheered', v_on, 'count', (select count(*) from public.titan_moment_cheers where moment_id = p_id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Challenges between friends: no stake, a period, one normalized measure.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.titan_challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 60),
  metric text not null check (metric in ('effort_minutes', 'active_days', 'distance_km', 'sessions')),
  sport text check (sport is null or length(sport) <= 80),
  target numeric not null check (target > 0 and target <= 100000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '31 days'),
  check (metric <> 'distance_km' or sport is not null)
);
create table if not exists public.titan_challenge_members (
  challenge_id uuid not null references public.titan_challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined', 'left')),
  joined_at timestamptz,
  primary key (challenge_id, user_id)
);
create index if not exists titan_challenge_members_user on public.titan_challenge_members(user_id, status);
alter table public.titan_challenges enable row level security;
alter table public.titan_challenge_members enable row level security;
revoke all on public.titan_challenges, public.titan_challenge_members from anon, authenticated;

-- Progress of one athlete in one challenge, computed from server-side session data only.
create or replace function private.titan_challenge_progress(p_challenge uuid, p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.titan_challenges where id = p_challenge),
  d as (
    select e.* from c, private.titan_effort_days(p_user, c.starts_at, c.ends_at, c.starts_at, 90) e
  ),
  dist as (
    select coalesce(sum(least(l.val, 300)), 0) as km
    from c join public.training_logs l on l.user_id = p_user and l.sport = c.sport and l.unit = 'km'
    where l.archived_at is null and l.is_suspicious is not true
      and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review')
      and coalesce(l.details ->> 'historical', 'false') <> 'true'
      and l.date >= c.starts_at and l.date < c.ends_at and l.date <= now() and l.created_at >= c.starts_at
  )
  select round(case c.metric
    when 'effort_minutes' then coalesce((select sum(minutes) from d), 0)
    when 'active_days' then coalesce((select count(*) from d), 0)
    when 'sessions' then coalesce((select sum(sessions) from d), 0)
    else (select km from dist) end, 1)
  from c;
$$;
revoke all on function private.titan_challenge_progress(uuid, uuid) from public, anon, authenticated;

create or replace function public.titan_challenge_create(p_title text, p_metric text, p_sport text, p_target numeric, p_days integer, p_invitees uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_friend uuid;
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and coalesce(is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if p_metric not in ('effort_minutes', 'active_days', 'distance_km', 'sessions') or coalesce(p_days, 0) not between 1 and 31
     or coalesce(p_target, 0) <= 0 or p_target > 100000 or (p_metric = 'distance_km' and coalesce(p_sport, '') = '') then
    raise exception 'CHALLENGE_INVALID' using errcode = '22023';
  end if;
  if coalesce(array_length(p_invitees, 1), 0) not between 1 and 10 then raise exception 'CHALLENGE_INVITEES' using errcode = '22023'; end if;
  perform public.titan_social_rate_limit(v_uid, 'challenge_create', interval '1 day', 5);
  insert into public.titan_challenges(creator_id, title, metric, sport, target, starts_at, ends_at)
  values (v_uid, public.titan_clean_social_text(p_title, 'Défi', 60), p_metric,
          nullif(left(regexp_replace(coalesce(p_sport, ''), '[^a-z0-9_]', '', 'g'), 80), ''),
          case when p_metric in ('active_days', 'sessions') then ceil(p_target) else p_target end,
          now(), now() + make_interval(days => p_days))
  returning id into v_id;
  insert into public.titan_challenge_members(challenge_id, user_id, status, joined_at) values (v_id, v_uid, 'joined', now());
  foreach v_friend in array p_invitees loop
    if v_friend <> v_uid and private.titan_are_friends(v_uid, v_friend) then
      insert into public.titan_challenge_members(challenge_id, user_id, status) values (v_id, v_friend, 'invited') on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count = 0 then raise exception 'CHALLENGE_INVITEES' using errcode = '22023'; end if;
  insert into public.titan_social_action_log(actor_id, action) values (v_uid, 'challenge_create');
  return jsonb_build_object('id', v_id, 'invited', v_count);
end;
$$;

create or replace function public.titan_challenge_respond(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select status into v_status from public.titan_challenge_members where challenge_id = p_id and user_id = v_uid;
  if v_status is null then raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_action = 'join' and v_status = 'invited' and exists (select 1 from public.titan_challenges where id = p_id and ends_at > now()) then
    update public.titan_challenge_members set status = 'joined', joined_at = now() where challenge_id = p_id and user_id = v_uid;
  elsif p_action = 'decline' and v_status = 'invited' then
    update public.titan_challenge_members set status = 'declined' where challenge_id = p_id and user_id = v_uid;
  elsif p_action = 'leave' and v_status = 'joined' then
    update public.titan_challenge_members set status = 'left' where challenge_id = p_id and user_id = v_uid;
  else
    raise exception 'CHALLENGE_TRANSITION_INVALID' using errcode = '22023';
  end if;
  return jsonb_build_object('status', (select status from public.titan_challenge_members where challenge_id = p_id and user_id = v_uid));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Expeditions: TITAN's bosses. Everyone who joins pushes the same guardian back with normalized
--    effort minutes (all sports equal, 90 counted per day). Personal milestone so nobody depends on
--    the crowd; cosmetic title only; no FOMO penalty.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.titan_expeditions (
  id text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  title text not null check (length(title) between 3 and 80),
  story text not null check (length(story) between 10 and 600),
  guardian text not null check (length(guardian) between 3 and 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  collective_goal integer not null check (collective_goal between 60 and 100000000),
  personal_days integer not null default 3 check (personal_days between 1 and 31),
  personal_minutes integer not null default 240 check (personal_minutes between 30 and 5000),
  daily_cap integer not null default 90 check (daily_cap between 30 and 240),
  reward_title text not null check (length(reward_title) between 2 and 40),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists public.titan_expedition_members (
  expedition_id text not null references public.titan_expeditions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (expedition_id, user_id)
);
alter table public.titan_expeditions enable row level security;
alter table public.titan_expedition_members enable row level security;
revoke all on public.titan_expeditions, public.titan_expedition_members from anon, authenticated;
grant select on public.titan_expeditions to anon, authenticated;
drop policy if exists titan_expeditions_read on public.titan_expeditions;
create policy titan_expeditions_read on public.titan_expeditions for select to anon, authenticated using (published);
drop policy if exists titan_expeditions_admin on public.titan_expeditions;
create policy titan_expeditions_admin on public.titan_expeditions for all to authenticated
  using (private.titan_is_admin((select auth.uid()))) with check (private.titan_is_admin((select auth.uid())));
grant insert, update, delete on public.titan_expeditions to authenticated;

create or replace function public.titan_expedition_board(p_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $$
declare
  v_uid uuid := auth.uid();
  v_e public.titan_expeditions%rowtype;
  v_total numeric := 0;
  v_members integer := 0;
  v_my_minutes numeric := 0;
  v_my_days integer := 0;
  v_joined timestamptz;
begin
  if p_id is not null then
    select * into v_e from public.titan_expeditions where id = p_id and published;
  else
    select * into v_e from public.titan_expeditions where published
     order by (now() between starts_at and ends_at) desc, (starts_at > now()) desc, abs(extract(epoch from (starts_at - now()))) asc limit 1;
  end if;
  if v_e.id is null then return null; end if;
  select count(*)::integer into v_members from public.titan_expedition_members where expedition_id = v_e.id;
  select coalesce(sum(d.minutes), 0) into v_total
    from public.titan_expedition_members m
    cross join lateral private.titan_effort_days(m.user_id, v_e.starts_at, v_e.ends_at, greatest(m.joined_at, v_e.starts_at), v_e.daily_cap) d
   where m.expedition_id = v_e.id;
  if v_uid is not null then
    select joined_at into v_joined from public.titan_expedition_members where expedition_id = v_e.id and user_id = v_uid;
    if v_joined is not null then
      select coalesce(sum(minutes), 0), count(*)::integer into v_my_minutes, v_my_days
        from private.titan_effort_days(v_uid, v_e.starts_at, v_e.ends_at, greatest(v_joined, v_e.starts_at), v_e.daily_cap);
    end if;
  end if;
  return jsonb_build_object(
    'id', v_e.id, 'title', v_e.title, 'story', v_e.story, 'guardian', v_e.guardian,
    'starts_at', v_e.starts_at, 'ends_at', v_e.ends_at,
    'status', case when now() < v_e.starts_at then 'upcoming' when now() > v_e.ends_at then 'ended' else 'active' end,
    'collective_goal', v_e.collective_goal, 'collective_minutes', round(v_total),
    'participants', v_members, 'daily_cap', v_e.daily_cap,
    'personal_days', v_e.personal_days, 'personal_minutes', v_e.personal_minutes, 'reward_title', v_e.reward_title,
    'me', case when v_joined is null then jsonb_build_object('joined', false)
      else jsonb_build_object('joined', true, 'joined_at', v_joined, 'minutes', round(v_my_minutes), 'days', v_my_days,
        'personal_done', v_my_days >= v_e.personal_days and v_my_minutes >= v_e.personal_minutes) end);
end;
$$;

create or replace function public.titan_expedition_join(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.titan_expeditions where id = p_id and published and ends_at > now()) then
    raise exception 'EXPEDITION_CLOSED' using errcode = '22023';
  end if;
  insert into public.titan_expedition_members(expedition_id, user_id) values (p_id, v_uid) on conflict do nothing;
  return public.titan_expedition_board(p_id);
end;
$$;

-- Earned expedition titles for the collection (ended, personal milestone reached).
create or replace function public.titan_expedition_titles()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.reward_title, 'expedition', e.title, 'ended_at', e.ends_at) order by e.ends_at desc), '[]'::jsonb)
  from public.titan_expeditions e
  join public.titan_expedition_members m on m.expedition_id = e.id and m.user_id = auth.uid()
  cross join lateral (
    select count(*) as days, coalesce(sum(minutes), 0) as minutes
    from private.titan_effort_days(auth.uid(), e.starts_at, e.ends_at, greatest(m.joined_at, e.starts_at), e.daily_cap)
  ) d
  where e.ends_at < now() and d.days >= e.personal_days and d.minutes >= e.personal_minutes;
$$;

insert into public.titan_expeditions(id, title, story, guardian, starts_at, ends_at, collective_goal, personal_days, personal_minutes, reward_title)
values ('automne-2026', 'La traversée des brumes',
  'Chaque automne, le Colosse des brumes descend des crêtes et ferme les passages. On ne le combat pas : on le fait reculer, minute après minute, chacun avec son sport. 90 minutes comptent au plus par jour : la constance passe avant l’exploit.',
  'Le Colosse des brumes', '2026-10-12 00:00:00+02', '2026-11-16 00:00:00+01', 6000, 4, 300, 'Passe-brume')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 5. Guild week in effort minutes (all sports equal, 90/day per member), target set by the owner.
-- ---------------------------------------------------------------------------------------------
alter table public.guilds add column if not exists weekly_effort_target integer not null default 600
  check (weekly_effort_target between 60 and 100000);

create or replace function public.titan_guild_week()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $$
declare
  v_uid uuid := auth.uid();
  v_guild public.guilds%rowtype;
  v_from timestamptz := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_members jsonb;
  v_total numeric;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select g.* into v_guild from public.guild_members gm join public.guilds g on g.id = gm.guild_id where gm.user_id = v_uid limit 1;
  if v_guild.id is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.user_id, 'name', x.name, 'role', x.role, 'minutes', round(x.minutes), 'days', x.days) order by x.minutes desc), '[]'::jsonb),
         coalesce(sum(x.minutes), 0)
    into v_members, v_total
    from (
      select gm.user_id, gm.role, coalesce(p.username, 'Athlète') as name,
             coalesce(sum(d.minutes), 0) as minutes, count(d.day)::integer as days
      from public.guild_members gm
      left join public.profiles p on p.id = gm.user_id
      left join lateral private.titan_effort_days(gm.user_id, v_from, v_from + interval '7 days', v_from, 90) d on true
      where gm.guild_id = v_guild.id
      group by gm.user_id, gm.role, p.username
    ) x;
  return jsonb_build_object('guild_id', v_guild.id, 'week_start', v_from, 'target', v_guild.weekly_effort_target,
    'minutes', round(v_total), 'members', v_members);
end;
$$;

create or replace function public.titan_guild_set_effort_target(p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.guilds set weekly_effort_target = least(100000, greatest(60, coalesce(p_minutes, 600))), updated_at = now()
   where owner_id = v_uid;
  if not found then raise exception 'GUILD_OWNER_REQUIRED' using errcode = '42501'; end if;
  return public.titan_guild_week();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. One overview call for the Communauté page. Friends see only what each person allowed.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_social_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles%rowtype;
  v_code text;
  v_week timestamptz := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_me from public.profiles where id = v_uid;
  v_code := v_me.friend_code;
  if v_code is null or v_code !~ '^TN-[A-Z2-9]{4,8}$' then
    v_code := public.titan_generate_friend_code();
    update public.profiles set friend_code = v_code where id = v_uid;
  end if;
  return jsonb_build_object(
    'me', jsonb_build_object('id', v_uid, 'friend_code', v_code, 'findable', coalesce((v_me.privacy ->> 'publicProfile')::boolean, false)),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.username, 'Athlète'),
        'avatar', coalesce(ap.avatar, 'scout'),
        'level', case when coalesce((p.privacy ->> 'showStats')::boolean, false) then p.level end,
        'week_days', case when coalesce((p.privacy ->> 'showStats')::boolean, false) then (
          select count(distinct (l.date at time zone 'Europe/Paris')::date) from public.training_logs l
          where l.user_id = p.id and l.archived_at is null and l.date >= v_week and l.date <= now()) end,
        'last_active', case when coalesce((p.privacy ->> 'socialPresence')::boolean, false) then (
          select max((l.date at time zone 'Europe/Paris')::date) from public.training_logs l
          where l.user_id = p.id and l.archived_at is null and l.date <= now()) end
      ) order by p.username)
      from public.friendships f
      join public.profiles p on p.id = case when f.user_id_1 = v_uid then f.user_id_2 else f.user_id_1 end
      left join public.adventure_profiles ap on ap.user_id = p.id
      where (f.user_id_1 = v_uid or f.user_id_2 = v_uid) and coalesce(f.status, 'accepted') = 'accepted'
        and not coalesce(p.is_suspended, false)
        and private.titan_are_friends(v_uid, p.id)), '[]'::jsonb),
    'requests_in', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'avatar', coalesce(ap.avatar, 'scout'), 'at', f.created_at) order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = f.user_id_1
      left join public.adventure_profiles ap on ap.user_id = p.id
      where f.user_id_2 = v_uid and f.status = 'pending' and not coalesce(p.is_suspended, false)), '[]'::jsonb),
    'requests_out', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'at', f.created_at) order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = f.user_id_2
      where f.user_id_1 = v_uid and f.status = 'pending'), '[]'::jsonb),
    'moments', coalesce((
      select jsonb_agg(m.j order by m.created_at desc) from (
        select mo.created_at, jsonb_build_object(
          'id', mo.id, 'kind', mo.kind, 'title', mo.title, 'detail', mo.detail, 'sport', mo.sport,
          'created_at', mo.created_at, 'mine', mo.user_id = v_uid, 'visibility', mo.visibility,
          'author', jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'avatar', coalesce(ap.avatar, 'scout')),
          'cheers', (select count(*) from public.titan_moment_cheers c where c.moment_id = mo.id),
          'cheered', exists (select 1 from public.titan_moment_cheers c where c.moment_id = mo.id and c.user_id = v_uid)) as j
        from public.titan_moments mo
        join public.profiles p on p.id = mo.user_id
        left join public.adventure_profiles ap on ap.user_id = p.id
        where not mo.hidden and mo.created_at > now() - interval '30 days'
          and (mo.user_id = v_uid or (mo.visibility = 'friends' and private.titan_are_friends(v_uid, mo.user_id)))
        order by mo.created_at desc limit 40) m), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'metric', c.metric, 'sport', c.sport, 'target', c.target,
        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'mine', c.creator_id = v_uid, 'my_status', me.status,
        'status', case when now() > c.ends_at then 'ended' else 'active' end,
        'members', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'status', mm.status,
            'progress', case when mm.status = 'joined' then private.titan_challenge_progress(c.id, mm.user_id) end) order by p.username), '[]'::jsonb)
          from public.titan_challenge_members mm join public.profiles p on p.id = mm.user_id
          where mm.challenge_id = c.id and mm.status in ('joined', 'invited'))
      ) order by c.ends_at desc)
      from public.titan_challenges c
      join public.titan_challenge_members me on me.challenge_id = c.id and me.user_id = v_uid and me.status in ('joined', 'invited')
      where c.ends_at > now() - interval '14 days'), '[]'::jsonb),
    'expedition', public.titan_expedition_board(null),
    'guild', public.titan_guild_week()
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Grants: callable by signed-in athletes only; stakes stay retired.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.titan_social_request(text), public.titan_social_respond(uuid, boolean), public.titan_social_remove(uuid),
  public.titan_moment_share(text, text, text, text, uuid, text), public.titan_moment_delete(uuid), public.titan_moment_cheer(uuid),
  public.titan_challenge_create(text, text, text, numeric, integer, uuid[]), public.titan_challenge_respond(uuid, text),
  public.titan_expedition_board(text), public.titan_expedition_join(text), public.titan_expedition_titles(),
  public.titan_guild_week(), public.titan_guild_set_effort_target(integer), public.titan_social_overview()
  from public, anon;
grant execute on function public.titan_social_request(text), public.titan_social_respond(uuid, boolean), public.titan_social_remove(uuid),
  public.titan_moment_share(text, text, text, text, uuid, text), public.titan_moment_delete(uuid), public.titan_moment_cheer(uuid),
  public.titan_challenge_create(text, text, text, numeric, integer, uuid[]), public.titan_challenge_respond(uuid, text),
  public.titan_expedition_board(text), public.titan_expedition_join(text), public.titan_expedition_titles(),
  public.titan_guild_week(), public.titan_guild_set_effort_target(integer), public.titan_social_overview()
  to authenticated;
-- Credit wagers are retired: real effort is never bet.
revoke execute on function public.titan_create_wager_challenge(uuid, text, integer) from public, anon, authenticated;
-- Instant friendships without consent are retired in favour of titan_social_request.
revoke execute on function public.titan_add_friend_by_code(text), public.add_friend_by_code(text), public.add_friend_by_id(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005200000', 'ascension_social', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005210000_ascension_atelier.sql
-- ---------------------------------------------------------------------
-- TITAN 300 — Atelier: one currency (credits earned by effort), cosmetics only, ownership decided by the server.
-- Non-destructive: legacy combat cosmetics are deactivated, not deleted; purchase history is untouched.

-- 1. Purchases go through titan_purchase_shop_item only. A direct insert into shop_history would have
--    granted any cosmetic for free once ownership is read from the history.
drop policy if exists shop_history_insert_own_v89 on public.shop_history;
revoke insert on public.shop_history from authenticated, anon;

-- 2. The equipped look lives in its own column, written only by titan_set_appearance (profiles has no
--    self-update policy). game_state never carries it, so a client cannot forge it.
alter table public.profiles add column if not exists appearance jsonb not null default '{}'::jsonb;

-- 3. Catalogue v300. metadata.slot = frame | map | card; metadata.unlock = default | credits | rank | plus.
--    Rank pieces read profiles.level (required_level); plus pieces follow the live TITAN+ status.
update public.shop_items set is_active = false, updated_at = now()
where id in ('cos_grenade_glitch', 'cos_grenade_frost', 'cos_victory_ion', 'cos_grenade_plasma', 'cos_grenade_gold', 'cos_victory_orbital');

insert into public.shop_items (id, name, description, price, type, icon, is_active, requires_elite, cosmetic_id, rarity, required_level, metadata)
values
  ('cos_frame_standard', 'Portrait nu', 'Le portrait tel quel, sans cadre.', 0, 'cosmetic', 'user', true, false, 'frame-standard', 'default', 1, '{"slot":"frame","unlock":"default","order":0}'),
  ('cos_frame_neon', 'Cadre Néon', 'Un liseré cyan, net et discret.', 450, 'cosmetic', 'sparkle', true, false, 'frame-neon', 'earned', 1, '{"slot":"frame","unlock":"credits","order":10}'),
  ('cos_frame_crimson', 'Cadre Braise', 'Un anneau cuivré qui rougeoit doucement.', 700, 'cosmetic', 'sparkle', true, false, 'frame-crimson', 'earned', 1, '{"slot":"frame","unlock":"credits","order":20}'),
  ('cos_frame_tide', 'Cadre Marée', 'Deux bleus qui se croisent comme une ligne d’eau.', 900, 'cosmetic', 'wave', true, false, 'frame-tide', 'earned', 1, '{"slot":"frame","unlock":"credits","order":30}'),
  ('cos_frame_summit', 'Cadre Cime', 'Un trait de neige sur fond d’ardoise, pour les longues saisons.', 1400, 'cosmetic', 'mountain', true, false, 'frame-summit', 'earned', 1, '{"slot":"frame","unlock":"credits","order":40}'),
  ('cos_frame_sentinel', 'Cadre Sentinelle', 'Remis au rang Sentinelle. Ne s’achète pas.', 0, 'cosmetic', 'shield', true, false, 'frame-sentinel', 'rank', 6, '{"slot":"frame","unlock":"rank","order":50}'),
  ('cos_frame_guardian', 'Cadre Gardien', 'Remis au rang Gardien. Ne s’achète pas.', 0, 'cosmetic', 'shield', true, false, 'frame-guardian', 'rank', 10, '{"slot":"frame","unlock":"rank","order":51}'),
  ('cos_frame_champion', 'Cadre Champion', 'Remis au rang Champion. Ne s’achète pas.', 0, 'cosmetic', 'medal', true, false, 'frame-champion', 'rank', 15, '{"slot":"frame","unlock":"rank","order":52}'),
  ('cos_frame_titan', 'Cadre Titan', 'Remis au rang Titan. Ne s’achète pas.', 0, 'cosmetic', 'crown', true, false, 'frame-titan', 'rank', 25, '{"slot":"frame","unlock":"rank","order":53}'),
  ('cos_frame_legend', 'Cadre Légende', 'Remis au rang Légende. Ne s’achète pas.', 0, 'cosmetic', 'crown', true, false, 'frame-legend', 'rank', 40, '{"slot":"frame","unlock":"rank","order":54}'),
  ('cos_frame_aegis', 'Cadre Aegis', 'Or mat et double filet. Inclus avec TITAN+.', 0, 'cosmetic', 'crown', true, true, 'frame-aegis', 'plus', 1, '{"slot":"frame","unlock":"plus","order":60}'),
  ('cos_frame_frost', 'Cadre Givre', 'Un cristal pâle autour du portrait. Inclus avec TITAN+.', 0, 'cosmetic', 'crown', true, true, 'frame-frost', 'plus', 1, '{"slot":"frame","unlock":"plus","order":61}'),
  ('cos_map_default', 'Carte d’origine', 'Les couleurs de chaque monde, telles que dessinées.', 0, 'cosmetic', 'compass', true, false, 'map-default', 'default', 1, '{"slot":"map","unlock":"default","order":0}'),
  ('cos_map_mist', 'Brume', 'Une lumière basse et laiteuse sur la carte d’aventure.', 600, 'cosmetic', 'cloud', true, false, 'map-mist', 'earned', 1, '{"slot":"map","unlock":"credits","order":10}'),
  ('cos_map_night', 'Nuit polaire', 'La carte sous un ciel froid, balises plus vives.', 1000, 'cosmetic', 'moon', true, false, 'map-night', 'earned', 1, '{"slot":"map","unlock":"credits","order":20}'),
  ('cos_map_aurora', 'Aurores', 'Un voile vert et violet venu de la citadelle. Inclus avec TITAN+.', 0, 'cosmetic', 'sparkle', true, true, 'map-aurora', 'plus', 1, '{"slot":"map","unlock":"plus","order":60}'),
  ('cos_card_default', 'Carte TITAN', 'La carte partageable sobre, noir et cyan.', 0, 'cosmetic', 'share', true, false, 'card-default', 'default', 1, '{"slot":"card","unlock":"default","order":0}'),
  ('cos_card_chalk', 'Craie', 'Fond clair et trait de craie, comme un tableau de salle.', 400, 'cosmetic', 'edit', true, false, 'card-chalk', 'earned', 1, '{"slot":"card","unlock":"credits","order":10}'),
  ('cos_card_ember', 'Braise', 'Dégradé cuivre pour les records qui comptent.', 800, 'cosmetic', 'bolt', true, false, 'card-ember', 'earned', 1, '{"slot":"card","unlock":"credits","order":20}'),
  ('cos_card_obsidian', 'Obsidienne', 'Noir profond et reflet violet des forges. Inclus avec TITAN+.', 0, 'cosmetic', 'layers', true, true, 'card-obsidian', 'plus', 1, '{"slot":"card","unlock":"plus","order":60}')
on conflict (id) do update set
  name = excluded.name, description = excluded.description, price = excluded.price, type = excluded.type, icon = excluded.icon,
  is_active = excluded.is_active, requires_elite = excluded.requires_elite, cosmetic_id = excluded.cosmetic_id, rarity = excluded.rarity,
  required_level = excluded.required_level, metadata = coalesce(public.shop_items.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

-- 4. Ownership, one rule for every screen.
create or replace function private.titan_cosmetic_owned(p_uid uuid, p_item text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case coalesce(si.metadata ->> 'unlock', 'credits')
      when 'default' then true
      when 'rank' then coalesce(p.level, 1) >= coalesce(si.required_level, 1)
      when 'plus' then coalesce(p.is_elite, false)
      when 'credits' then exists (select 1 from public.shop_history h where h.user_id = p_uid and h.item_id = si.id)
      else false end
    from public.shop_items si
    join public.profiles p on p.id = p_uid
    where si.id = p_item and si.type = 'cosmetic'
  ), false);
$$;

-- The look actually shown: an equipped piece that is no longer owned (TITAN+ ended) falls back to default.
create or replace function private.titan_appearance(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(a.key, a.value #>> '{}'), '{}'::jsonb)
  from public.profiles p
  cross join lateral jsonb_each(coalesce(p.appearance, '{}'::jsonb)) a
  where p.id = p_uid
    and a.key in ('frame', 'map', 'card')
    and exists (
      select 1 from public.shop_items si
      where si.cosmetic_id = a.value #>> '{}' and si.metadata ->> 'slot' = a.key
        and private.titan_cosmetic_owned(p_uid, si.id)
    );
$$;

-- 5. Purchase: credits only, once per piece, cosmetics only. Rank, TITAN+ and default pieces are not for sale.
create or replace function public.titan_purchase_shop_item(p_item_id text)
returns table(item_id text, cost integer, reward_credits integer, credits_after integer, purchased_at timestamp with time zone, mode text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.shop_items%rowtype;
  v_credits integer;
  v_suspended boolean;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_item from public.shop_items si
  where si.id = left(trim(coalesce(p_item_id, '')), 80) and coalesce(si.is_active, true)
    and (si.starts_at is null or si.starts_at <= v_now) and (si.ends_at is null or si.ends_at >= v_now);
  if not found then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
  if v_item.type <> 'cosmetic' then
    raise exception 'COSMETICS_ONLY' using errcode = '22023';
  end if;
  if coalesce(v_item.requires_elite, false) or coalesce(v_item.metadata ->> 'unlock', 'credits') <> 'credits' or coalesce(v_item.price, 0) < 1 then
    raise exception 'NOT_FOR_SALE' using errcode = '22023';
  end if;

  select coalesce(p.credits, 0)::integer, coalesce(p.is_suspended, false) into v_credits, v_suspended
  from public.profiles p where p.id = v_uid for update;
  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;
  if v_suspended then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  if exists (select 1 from public.shop_history h where h.user_id = v_uid and h.item_id = v_item.id) then
    raise exception 'PURCHASE_LIMIT_ONCE' using errcode = '23514';
  end if;
  if v_credits < v_item.price then
    raise exception 'NO_FUNDS' using errcode = '23514';
  end if;

  update public.profiles p set credits = v_credits - v_item.price where p.id = v_uid
  returning p.credits::integer into v_credits;
  insert into public.shop_history (user_id, item_id, purchased_at, cost_credits, reward_credits, economy_meta)
  values (v_uid, v_item.id, v_now, v_item.price, 0,
    jsonb_build_object('type', 'cosmetic', 'slot', v_item.metadata ->> 'slot', 'cosmeticId', v_item.cosmetic_id, 'version', 300));

  return query select v_item.id, v_item.price::integer, 0, v_credits, v_now, 'server_v300_atelier'::text;
end;
$$;

-- 6. Equip a piece the server agrees you own. p_item null puts the slot back to default.
create or replace function public.titan_set_appearance(p_slot text, p_item text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cosmetic text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_slot is null or p_slot not in ('frame', 'map', 'card') then
    raise exception 'INVALID_SLOT' using errcode = '22023';
  end if;
  if p_item is null then
    update public.profiles set appearance = coalesce(appearance, '{}'::jsonb) - p_slot where id = v_uid;
    return private.titan_appearance(v_uid);
  end if;
  select si.cosmetic_id into v_cosmetic from public.shop_items si
  where si.id = p_item and si.type = 'cosmetic' and si.metadata ->> 'slot' = p_slot;
  if v_cosmetic is null then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
  if not private.titan_cosmetic_owned(v_uid, p_item) then
    raise exception 'NOT_OWNED' using errcode = '42501';
  end if;
  update public.profiles set appearance = coalesce(appearance, '{}'::jsonb) || jsonb_build_object(p_slot, v_cosmetic) where id = v_uid;
  return private.titan_appearance(v_uid);
end;
$$;

-- 7. Everything the Atelier needs in one call. No payment data: only the entitlement the webhook wrote.
create or replace function public.titan_atelier()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_items jsonb;
  v_week integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', si.id, 'cosmetic', si.cosmetic_id, 'slot', si.metadata ->> 'slot', 'unlock', coalesce(si.metadata ->> 'unlock', 'credits'),
      'name', si.name, 'description', si.description, 'price', si.price, 'min_level', si.required_level,
      'owned', private.titan_cosmetic_owned(v_uid, si.id))
    order by si.metadata ->> 'slot', coalesce((si.metadata ->> 'order')::integer, 999), si.price), '[]'::jsonb)
  into v_items
  from public.shop_items si
  where si.type = 'cosmetic' and si.metadata ? 'slot'
    and ((coalesce(si.is_active, true) and (si.starts_at is null or si.starts_at <= now()) and (si.ends_at is null or si.ends_at >= now()))
      or exists (select 1 from public.shop_history h where h.user_id = v_uid and h.item_id = si.id));

  select greatest(0, coalesce(u.credits_awarded, 0))::integer into v_week
  from public.titan_weekly_reward_usage u
  where u.user_id = v_uid and u.week_start = public.titan_week_start(now());

  return jsonb_build_object(
    'credits', coalesce(v_p.credits, 0),
    'level', coalesce(v_p.level, 1),
    'week_credits', coalesce(v_week, 0),
    'week_credit_cap', coalesce((public.titan_economy_limits(v_uid) ->> 'weeklyCreditCap')::integer, 960),
    'plus', jsonb_build_object('active', coalesce(v_p.is_elite, false), 'status', v_p.elite_status,
      'renews_at', v_p.elite_renews_at, 'ends_at', v_p.elite_ends_at),
    'appearance', private.titan_appearance(v_uid),
    'items', v_items);
end;
$$;

revoke all on function private.titan_cosmetic_owned(uuid, text) from public, anon;
revoke all on function private.titan_appearance(uuid) from public, anon;
revoke all on function public.titan_set_appearance(text, text) from public, anon;
revoke all on function public.titan_atelier() from public, anon;
revoke all on function public.titan_purchase_shop_item(text) from public, anon;
grant execute on function private.titan_cosmetic_owned(uuid, text) to authenticated;
grant execute on function private.titan_appearance(uuid) to authenticated;
grant execute on function public.titan_set_appearance(text, text) to authenticated;
grant execute on function public.titan_atelier() to authenticated;
grant execute on function public.titan_purchase_shop_item(text) to authenticated;
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005210000', 'ascension_atelier', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005220000_ascension_public_card.sql
-- ---------------------------------------------------------------------
-- TITAN 300 — Public athlete card: opt-in, off by default, behind an unguessable link (QR friendly).
-- The athlete chooses each block. Never shown: health, weight, GPS, notes, exact dates or times of sessions,
-- friends, guild, email. The card reads only server-validated data (sessions, effort minutes, level, titles).

create table if not exists public.titan_public_cards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]{10}$'),
  enabled boolean not null default false,
  show_name boolean not null default true,
  show_level boolean not null default true,
  show_totals boolean not null default true,
  show_sports boolean not null default true,
  show_titles boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.titan_public_cards enable row level security;
-- No policy on purpose: the table is only reached through the functions below.
revoke all on public.titan_public_cards from anon, authenticated;

create or replace function private.titan_new_card_slug()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select left(md5(gen_random_uuid()::text || clock_timestamp()::text), 10);
$$;
revoke all on function private.titan_new_card_slug() from public, anon, authenticated;

create or replace function private.titan_card_settings_json(r public.titan_public_cards)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('enabled', coalesce(r.enabled, false), 'slug', r.slug,
    'show', jsonb_build_object('name', coalesce(r.show_name, true), 'level', coalesce(r.show_level, true),
      'totals', coalesce(r.show_totals, true), 'sports', coalesce(r.show_sports, true), 'titles', coalesce(r.show_titles, true)));
$$;
revoke all on function private.titan_card_settings_json(public.titan_public_cards) from public, anon;
grant execute on function private.titan_card_settings_json(public.titan_public_cards) to authenticated;

create or replace function public.titan_public_card_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r public.titan_public_cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into r from public.titan_public_cards where user_id = auth.uid();
  return private.titan_card_settings_json(r);
end;
$$;

-- p_show keys: name, level, totals, sports, titles (booleans). p_new_link replaces the link: old QR codes stop working.
create or replace function public.titan_public_card_save(p_enabled boolean, p_show jsonb default '{}'::jsonb, p_new_link boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s jsonb := coalesce(p_show, '{}'::jsonb);
  r public.titan_public_cards%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  insert into public.titan_public_cards as c (user_id, slug, enabled, show_name, show_level, show_totals, show_sports, show_titles)
  values (v_uid, private.titan_new_card_slug(), coalesce(p_enabled, false),
    coalesce((s ->> 'name')::boolean, true), coalesce((s ->> 'level')::boolean, true), coalesce((s ->> 'totals')::boolean, true),
    coalesce((s ->> 'sports')::boolean, true), coalesce((s ->> 'titles')::boolean, true))
  on conflict (user_id) do update set
    enabled = coalesce(p_enabled, c.enabled),
    show_name = coalesce((s ->> 'name')::boolean, c.show_name),
    show_level = coalesce((s ->> 'level')::boolean, c.show_level),
    show_totals = coalesce((s ->> 'totals')::boolean, c.show_totals),
    show_sports = coalesce((s ->> 'sports')::boolean, c.show_sports),
    show_titles = coalesce((s ->> 'titles')::boolean, c.show_titles),
    slug = case when p_new_link then private.titan_new_card_slug() else c.slug end,
    updated_at = now()
  returning * into r;
  return private.titan_card_settings_json(r);
end;
$$;

-- Readable without an account. A disabled, unknown or suspended card answers the same way.
create or replace function public.titan_public_card(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.titan_public_cards%rowtype;
  p public.profiles%rowtype;
  v_out jsonb;
  v_sports jsonb;
  v_totals jsonb;
  v_titles jsonb;
  v_insignia integer;
begin
  select * into c from public.titan_public_cards where slug = lower(left(coalesce(p_slug, ''), 10)) and enabled;
  if not found then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into p from public.profiles where id = c.user_id;
  if not found or coalesce(p.is_suspended, false) then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_out := jsonb_build_object(
    'name', case when c.show_name then coalesce(nullif(p.username, ''), 'Athlète TITAN') else 'Athlète TITAN' end,
    'avatar', coalesce((select a.avatar from public.adventure_profiles a where a.user_id = c.user_id), 'scout'),
    'appearance', private.titan_appearance(c.user_id),
    'member_since', to_char(coalesce(p.created_at, now()), 'YYYY-MM'));

  if c.show_level then
    v_out := v_out || jsonb_build_object('level', greatest(1, coalesce(p.level, 1)));
  end if;

  if c.show_totals or c.show_sports then
    with logs as (
      select l.sport,
             coalesce(public.titan_numeric_from_json(l.details -> 'effort', 'minutes'),
                      (public.titan_effort_v300(l.sport, l.unit, l.val, l.details) ->> 'minutes')::numeric, 0) as minutes,
             date_trunc('week', l.date at time zone 'Europe/Paris') as week
      from public.training_logs l
      where l.user_id = c.user_id and l.archived_at is null and l.is_suspicious is not true
        and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review') and l.date <= now()
    )
    select
      jsonb_build_object('sessions', count(*), 'minutes', round(coalesce(sum(minutes), 0)), 'weeks', count(distinct week)),
      (select coalesce(jsonb_agg(x order by (x ->> 'minutes')::numeric desc), '[]'::jsonb) from (
         select jsonb_build_object('sport', sport, 'sessions', count(*), 'minutes', round(sum(minutes)), 'weeks', count(distinct week)) as x
         from logs group by sport order by sum(minutes) desc limit 6) t)
    into v_totals, v_sports
    from logs;
    if c.show_totals then v_out := v_out || jsonb_build_object('totals', v_totals); end if;
    if c.show_sports then v_out := v_out || jsonb_build_object('sports', v_sports); end if;
  end if;

  if c.show_titles then
    select coalesce(jsonb_agg(jsonb_build_object('title', e.reward_title, 'expedition', e.title) order by e.ends_at desc), '[]'::jsonb)
    into v_titles
    from public.titan_expeditions e
    join public.titan_expedition_members m on m.expedition_id = e.id and m.user_id = c.user_id
    cross join lateral (
      select count(*) as days, coalesce(sum(minutes), 0) as minutes
      from private.titan_effort_days(c.user_id, e.starts_at, e.ends_at, greatest(m.joined_at, e.starts_at), e.daily_cap)
    ) d
    where e.ends_at < now() and d.days >= e.personal_days and d.minutes >= e.personal_minutes;
    select count(*)::integer into v_insignia from public.adventure_rewards r where r.user_id = c.user_id;
    v_out := v_out || jsonb_build_object('titles', v_titles, 'insignia', v_insignia);
  end if;

  return v_out;
end;
$$;

revoke all on function public.titan_public_card_settings() from public, anon;
revoke all on function public.titan_public_card_save(boolean, jsonb, boolean) from public, anon;
revoke all on function public.titan_public_card(text) from public;
grant execute on function public.titan_public_card_settings() to authenticated;
grant execute on function public.titan_public_card_save(boolean, jsonb, boolean) to authenticated;
grant execute on function public.titan_public_card(text) to anon, authenticated;
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005220000', 'ascension_public_card', 'titan-300-release');

-- ---------------------------------------------------------------------
-- 20261005230000_ascension_retention.sql
-- ---------------------------------------------------------------------
-- TITAN 300 — retention that never deletes an active member.
-- The previous daily job deleted every account whose auth.users.last_sign_in_at was older than two months.
-- last_sign_in_at only moves on an explicit sign-in, not while a session stays open: members who use the app
-- every day (paying ones included) were scheduled for deletion. The job was disabled in production on
-- 2026-10-05 (cron.alter_job(1, active := false)) before this migration; this file replaces the rule.

-- Real last activity: sign-in, session refresh, profile save, last session logged.
create or replace function private.titan_last_activity(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    u.created_at,
    u.last_sign_in_at,
    (select max(greatest(s.updated_at, s.refreshed_at::timestamptz)) from auth.sessions s where s.user_id = u.id),
    (select max(greatest(p.updated_at, p.last_seen_at)) from public.profiles p where p.id = u.id),
    (select max(l.created_at) from public.training_logs l where l.user_id = u.id)
  )
  from auth.users u where u.id = p_user;
$$;
revoke all on function private.titan_last_activity(uuid) from public, anon, authenticated;

-- 1. Abandoned sign-ups: e-mail never confirmed, nothing recorded, older than 30 days.
-- 2. Dormant accounts: no activity of any kind for three years, and no TITAN+ in progress.
drop function if exists public.delete_inactive_users();
create function public.delete_inactive_users()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  with candidates as (
    select u.id
    from auth.users u
    left join public.profiles p on p.id = u.id
    where coalesce(p.is_elite, false) = false
      and (
        (u.email_confirmed_at is null
          and u.created_at < now() - interval '30 days'
          and not exists (select 1 from public.training_logs l where l.user_id = u.id))
        or private.titan_last_activity(u.id) < now() - interval '3 years'
      )
  )
  delete from auth.users u using candidates c where u.id = c.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.delete_inactive_users() from public, anon, authenticated;

-- Product analytics are kept 13 months at most.
create or replace function public.titan_purge_old_analytics()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.analytics_events where created_at < now() - interval '13 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.titan_purge_old_analytics() from public, anon, authenticated;

-- Schedules (pg_cron exists in production, not on the local bench).
do $$
declare
  v_job bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  select jobid into v_job from cron.job where jobname = 'nettoyage-inactifs';
  if v_job is not null then
    perform cron.alter_job(job_id := v_job, schedule := '30 4 * * 0', command := 'select public.delete_inactive_users();', active := true);
  else
    perform cron.schedule('nettoyage-inactifs', '30 4 * * 0', 'select public.delete_inactive_users();');
  end if;
  if not exists (select 1 from cron.job where jobname = 'titan_purge_old_analytics') then
    perform cron.schedule('titan_purge_old_analytics', '45 4 1 * *', 'select public.titan_purge_old_analytics();');
  end if;
end $$;
insert into supabase_migrations.schema_migrations(version, name, created_by) values ('20261005230000', 'ascension_retention', 'titan-300-release');

commit;

select version, name from supabase_migrations.schema_migrations where version >= '20261005150000' order by version;
