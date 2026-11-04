-- V11-38 (V11-04 prep, AND17): the daily-activity layer of the unified "sources" model (ADR-003): steps per day, from a source the account
-- allowed. It is NOT a session: it never creates a journal entry, never grants XP, credits, quests or records, and is never presented as a
-- sport session (RPG21). It only feeds a quiet "pas" line where the product shows it. One row per (account, source, day), replaced when the
-- source sends the day's new total (idempotent); several sources for the same day are never added together (the reading takes the highest).
-- Consent is the same per-source consent as the import of sessions (migration 34) and is checked on every write.
-- Also redefines public.export_own_data() (migration 35's definition plus the "dailyActivity" key).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_import_daily_activity_v1(text,date,integer), public.titan_daily_activity_v1(date,date);
-- drop table private.titan_daily_activity; then re-apply the export definition of migration 35 (20261028060000_export_complete.sql).

create table if not exists private.titan_daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('health_connect')),
  day date not null,
  steps integer not null check (steps between 0 and 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, source, day)
);
alter table private.titan_daily_activity enable row level security;
revoke all on private.titan_daily_activity from public, anon, authenticated;

create or replace function public.titan_import_daily_activity_v1(p_source text, p_day date, p_steps integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is distinct from 'health_connect' then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  if p_day is null or p_day > current_date + 1 or p_day < current_date - 400 then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  if p_steps is null or p_steps < 0 or p_steps > 200000 then raise exception 'STEPS_OUT_OF_RANGE' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  if not exists (select 1 from private.titan_source_consents c where c.user_id = v_uid and c.source = p_source and c.revoked_at is null) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  perform private.titan_rate_limit(v_uid, 'daily_import', 600);
  insert into private.titan_daily_activity as d (user_id, source, day, steps)
  values (v_uid, p_source, p_day, p_steps)
  on conflict (user_id, source, day) do update set steps = excluded.steps, updated_at = now();
  return jsonb_build_object('day', p_day, 'steps', p_steps);
end;
$function$;

-- One entry per day, at most 400 days, the highest value among the sources for that day (never a sum), with the sources that reported it
-- and the time of the latest report (the screen says when the number was last refreshed).
create or replace function public.titan_daily_activity_v1(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_to date := coalesce(p_to, current_date);
  v_from date := coalesce(p_from, coalesce(p_to, current_date) - 29);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_from > v_to or v_to - v_from > 400 then raise exception 'RANGE_INVALID' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('day', x.day, 'steps', x.steps, 'sources', x.sources, 'updatedAt', x.updated_at) order by x.day)
      from (select d.day, max(d.steps) as steps, jsonb_agg(d.source order by d.source) as sources, max(d.updated_at) as updated_at
              from private.titan_daily_activity d
             where d.user_id = v_uid and d.day between v_from and v_to
             group by d.day) x), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_import_daily_activity_v1(text, date, integer) from public, anon;
revoke all on function public.titan_daily_activity_v1(date, date) from public, anon;
grant execute on function public.titan_import_daily_activity_v1(text, date, integer) to authenticated;
grant execute on function public.titan_daily_activity_v1(date, date) to authenticated;

create or replace function public.export_own_data()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb := '{}'::jsonb;
  v_friendships jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(to_jsonb(p), '{}'::jsonb) into v_profile from public.profiles p where p.id = v_uid;

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_friendships
      from public.friendships f where f.user_id_1 = v_uid or f.user_id_2 = v_uid;
  end if;

  return jsonb_build_object(
    'exportedAt', now(),
    'userId', v_uid,
    'profile', v_profile,
    'trainingLogs', public.titan_export_rows('training_logs', 'user_id', v_uid),
    'activities', public.titan_export_rows('activities', 'user_id', v_uid),
    'messages', public.titan_export_rows('messages', 'sender_id', v_uid),
    'friendships', v_friendships,
    'shopHistory', public.titan_export_rows('shop_history', 'user_id', v_uid),
    'achievements', public.titan_export_rows('user_achievements', 'user_id', v_uid),
    'inventory', public.titan_export_rows('inventory', 'user_id', v_uid),
    'socialChallengesAsChallenger', public.titan_export_rows('social_challenges', 'challenger_id', v_uid),
    'socialChallengesAsOpponent', public.titan_export_rows('social_challenges', 'opponent_id', v_uid),
    'cacheReconciliationReports', public.titan_export_rows('titan_cache_reconciliation_reports', 'user_id', v_uid),
    'suspiciousActions', public.titan_export_rows('titan_suspicious_actions', 'user_id', v_uid),
    -- Added by V11-18.
    'trainingRevisions', public.titan_export_rows('training_revisions', 'user_id', v_uid),
    'goals', public.titan_export_rows('sport_goals', 'user_id', v_uid),
    'adventureProfile', public.titan_export_rows('adventure_profiles', 'user_id', v_uid),
    'adventureProgress', public.titan_export_rows('adventure_progress', 'user_id', v_uid),
    'adventureRewards', public.titan_export_rows('adventure_rewards', 'user_id', v_uid),
    'adventureQuestRewards', public.titan_export_rows('adventure_quest_rewards', 'user_id', v_uid),
    'campaignState', public.titan_export_rows('campaign_state', 'user_id', v_uid),
    'bestiary', public.titan_export_rows('user_bestiary', 'user_id', v_uid),
    'moments', public.titan_export_rows('titan_moments', 'user_id', v_uid),
    'momentCheers', public.titan_export_rows('titan_moment_cheers', 'user_id', v_uid),
    'publicCard', public.titan_export_rows('titan_public_cards', 'user_id', v_uid),
    'expeditions', public.titan_export_rows('titan_expedition_members', 'user_id', v_uid),
    'challengesJoined', public.titan_export_rows('titan_challenge_members', 'user_id', v_uid),
    'guildMembership', public.titan_export_rows('guild_members', 'user_id', v_uid),
    'titanPlusAccess', public.titan_export_rows('premium_access', 'user_id', v_uid),
    'periodicQuestClaims', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_periodic_quest_claims c where c.user_id = v_uid), '[]'::jsonb),
    'sourceConsents', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_source_consents c where c.user_id = v_uid), '[]'::jsonb),
    'importedActivities', coalesce((select jsonb_agg(to_jsonb(i)) from private.titan_imported_activities i where i.user_id = v_uid), '[]'::jsonb),
    'dailyActivity', coalesce((select jsonb_agg(to_jsonb(d) order by d.day, d.source) from private.titan_daily_activity d where d.user_id = v_uid), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.export_own_data() from public, anon;
grant execute on function public.export_own_data() to authenticated;
