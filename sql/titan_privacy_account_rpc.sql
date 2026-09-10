-- TITAN OS - GDPR/privacy account RPCs.
-- Run this whole file in Supabase SQL editor.
-- No explicit transaction: Supabase handles statement execution better this way.

drop function if exists public.delete_own_account() cascade;
drop function if exists public.export_own_data() cascade;
drop function if exists public.titan_export_rows(text, text, uuid) cascade;
drop function if exists public.titan_delete_rows(text, text, uuid) cascade;
drop function if exists public.titan_table_has_column(text, text) cascade;

create or replace function public.titan_table_has_column(p_table text, p_column text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$fn$;

revoke all on function public.titan_table_has_column(text, text) from public;

create or replace function public.titan_export_rows(p_table text, p_column text, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return '[]'::jsonb;
  end if;

  if not public.titan_table_has_column(p_table, p_column) then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where %I = $1',
    p_table,
    p_column
  )
  using p_user_id
  into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$fn$;

revoke all on function public.titan_export_rows(text, text, uuid) from public;

create or replace function public.titan_delete_rows(p_table text, p_column text, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer := 0;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return 0;
  end if;

  if not public.titan_table_has_column(p_table, p_column) then
    return 0;
  end if;

  execute format('delete from public.%I where %I = $1', p_table, p_column)
  using p_user_id;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$fn$;

revoke all on function public.titan_delete_rows(text, text, uuid) from public;

create or replace function public.export_own_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb := '{}'::jsonb;
  v_friendships jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(to_jsonb(p), '{}'::jsonb)
  into v_profile
  from public.profiles p
  where p.id = v_uid;

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
    into v_friendships
    from public.friendships f
    where f.user_id_1 = v_uid or f.user_id_2 = v_uid;
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
    'suspiciousActions', public.titan_export_rows('titan_suspicious_actions', 'user_id', v_uid)
  );
end;
$fn$;

revoke all on function public.export_own_data() from public;
grant execute on function public.export_own_data() to authenticated;

create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_deleted := public.titan_delete_rows('training_logs', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('training_logs', v_deleted);

  v_deleted := public.titan_delete_rows('activities', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('activities', v_deleted);

  v_deleted := public.titan_delete_rows('messages', 'sender_id', v_uid);
  v_counts := v_counts || jsonb_build_object('messages', v_deleted);

  v_deleted := public.titan_delete_rows('shop_history', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('shop_history', v_deleted);

  v_deleted := public.titan_delete_rows('user_achievements', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('user_achievements', v_deleted);

  v_deleted := public.titan_delete_rows('inventory', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('inventory', v_deleted);

  v_deleted := public.titan_delete_rows('titan_cache_reconciliation_reports', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('cache_reconciliation_reports', v_deleted);

  v_deleted := public.titan_delete_rows('titan_suspicious_actions', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('suspicious_actions', v_deleted);

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    delete from public.friendships
    where user_id_1 = v_uid or user_id_2 = v_uid;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('friendships', v_deleted);
  end if;

  if to_regclass('public.social_challenges') is not null
     and public.titan_table_has_column('social_challenges', 'challenger_id')
     and public.titan_table_has_column('social_challenges', 'opponent_id') then
    delete from public.social_challenges
    where challenger_id = v_uid or opponent_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('social_challenges', v_deleted);
  end if;

  delete from public.profiles where id = v_uid;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('profiles', v_deleted);

  delete from auth.users where id = v_uid;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('auth_users', v_deleted);

  return jsonb_build_object(
    'deletedAt', now(),
    'userId', v_uid,
    'deleted', v_counts
  );
end;
$fn$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
