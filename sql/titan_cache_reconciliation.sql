begin;

-- TITAN OS - Cache/Supabase reconciliation
-- Goal: detect first-version local cache that did not fully reach Supabase.
-- Security rule: this script NEVER trusts browser cache as a source of truth for rewards.
-- It stores a comparison report only; recovery must be reviewed/admin-driven or recomputed from trusted logs.

create extension if not exists pgcrypto;

create table if not exists public.titan_cache_reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_summary jsonb not null default '{}'::jsonb,
  cloud_summary jsonb not null default '{}'::jsonb,
  differences jsonb not null default '{}'::jsonb,
  risk_flags text[] not null default '{}'::text[],
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text
);

create index if not exists titan_cache_reconciliation_user_created_idx
on public.titan_cache_reconciliation_reports(user_id, created_at desc);

create index if not exists titan_cache_reconciliation_status_idx
on public.titan_cache_reconciliation_reports(status, created_at desc);

alter table public.titan_cache_reconciliation_reports enable row level security;

grant select on public.titan_cache_reconciliation_reports to authenticated;

create or replace function public.titan_is_admin(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if to_regclass('public.titan_admins') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.titan_admins a
    where a.user_id = p_user_id
      and a.revoked_at is null
  );
end;
$$;

revoke all on function public.titan_is_admin(uuid) from public;
grant execute on function public.titan_is_admin(uuid) to anon, authenticated;

drop policy if exists "cache_reconciliation_select_own_or_admin" on public.titan_cache_reconciliation_reports;
drop policy if exists "cache_reconciliation_insert_own" on public.titan_cache_reconciliation_reports;

create policy "cache_reconciliation_select_own_or_admin"
on public.titan_cache_reconciliation_reports
for select
to authenticated
using (
  user_id = auth.uid()
  or public.titan_is_admin(auth.uid())
);

create or replace function public.titan_jsonb_array_length_safe(p_value jsonb)
returns integer
language sql
immutable
as $$
  select case when jsonb_typeof(p_value) = 'array' then jsonb_array_length(p_value) else 0 end;
$$;

revoke all on function public.titan_jsonb_array_length_safe(jsonb) from public;

create or replace function public.titan_jsonb_object_size_safe(p_value jsonb)
returns integer
language sql
immutable
as $$
  select case when jsonb_typeof(p_value) = 'object' then (select count(*)::integer from jsonb_object_keys(p_value)) else 0 end;
$$;

revoke all on function public.titan_jsonb_object_size_safe(jsonb) from public;

create or replace function public.titan_cache_safe_int(p_value text, p_default integer default 0)
returns integer
language plpgsql
immutable
as $$
declare
  v_numeric numeric;
begin
  if p_value is null or trim(p_value) = '' then
    return p_default;
  end if;

  begin
    v_numeric := p_value::numeric;
  exception when others then
    return p_default;
  end;

  if v_numeric is null or v_numeric < 0 then
    return p_default;
  end if;

  return least(v_numeric, 2147483647)::integer;
end;
$$;

revoke all on function public.titan_cache_safe_int(text, integer) from public;

create or replace function public.titan_cache_safe_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_result timestamptz;
begin
  if p_value is null or trim(p_value) = '' then
    return null;
  end if;

  begin
    v_result := p_value::timestamptz;
  exception when others then
    return null;
  end;

  return v_result;
end;
$$;

revoke all on function public.titan_cache_safe_timestamptz(text) from public;

create or replace function public.titan_submit_cache_reconciliation(p_local_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_training_count integer := 0;
  v_training_last_date timestamptz;
  v_local_user jsonb := coalesce(p_local_state -> 'user', '{}'::jsonb);
  v_local_game jsonb := coalesce(p_local_state -> 'game', '{}'::jsonb);
  v_local_history jsonb := coalesce(p_local_state -> 'history', '[]'::jsonb);
  v_local_meta jsonb := coalesce(p_local_state -> 'meta', '{}'::jsonb);
  v_local_id text;
  v_local_level integer;
  v_local_xp integer;
  v_local_credits integer;
  v_local_avatar text;
  v_local_history_count integer;
  v_local_inventory_count integer;
  v_local_achievements_count integer;
  v_local_talents_count integer;
  v_local_boss_level integer;
  v_local_updated_at timestamptz;
  v_cloud_state jsonb;
  v_cloud_level integer;
  v_cloud_xp integer;
  v_cloud_credits integer;
  v_cloud_avatar text;
  v_cloud_history_count integer;
  v_cloud_inventory_count integer;
  v_cloud_achievements_count integer;
  v_cloud_talents_count integer;
  v_cloud_boss_level integer;
  v_cloud_updated_at timestamptz;
  v_local_summary jsonb;
  v_cloud_summary jsonb;
  v_differences jsonb;
  v_flags text[] := '{}'::text[];
  v_report_id uuid;
  v_payload_size integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_local_state is null or jsonb_typeof(p_local_state) <> 'object' then
    raise exception 'LOCAL_STATE_OBJECT_REQUIRED' using errcode = '22023';
  end if;

  v_payload_size := octet_length(p_local_state::text);
  if v_payload_size > 512000 then
    raise exception 'LOCAL_STATE_TOO_LARGE' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer, max(date)
  into v_training_count, v_training_last_date
  from public.training_logs
  where user_id = v_uid;

  v_cloud_state := coalesce(v_profile.game_state, '{}'::jsonb);

  v_local_id := nullif(v_local_user ->> 'id', '');
  v_local_level := public.titan_cache_safe_int(v_local_user ->> 'level', 1);
  v_local_xp := public.titan_cache_safe_int(v_local_user ->> 'xp', 0);
  v_local_credits := public.titan_cache_safe_int(v_local_user ->> 'credits', 0);
  v_local_avatar := nullif(trim(coalesce(v_local_user ->> 'avatar', '')), '');
  v_local_history_count := public.titan_jsonb_array_length_safe(v_local_history);
  v_local_inventory_count := public.titan_jsonb_object_size_safe(coalesce(v_local_user -> 'inventory', p_local_state -> 'inventory', '{}'::jsonb));
  v_local_achievements_count := public.titan_jsonb_array_length_safe(coalesce(v_local_user -> 'unlockedAchievements', '[]'::jsonb));
  v_local_talents_count := public.titan_jsonb_array_length_safe(coalesce(v_local_user -> 'unlockedTalents', '[]'::jsonb));
  v_local_boss_level := public.titan_cache_safe_int(v_local_game ->> 'bossLevel', 1);
  v_local_updated_at := public.titan_cache_safe_timestamptz(coalesce(v_local_meta ->> 'updatedAt', p_local_state ->> 'updatedAt'));

  v_cloud_level := coalesce(v_profile.level, public.titan_cache_safe_int(v_cloud_state #>> '{user,level}', 1));
  v_cloud_xp := public.titan_cache_safe_int(v_cloud_state #>> '{user,xp}', 0);
  v_cloud_credits := coalesce(v_profile.credits, public.titan_cache_safe_int(v_cloud_state #>> '{user,credits}', 0));
  v_cloud_avatar := nullif(trim(coalesce(v_profile.avatar, v_cloud_state #>> '{user,avatar}', '')), '');
  v_cloud_history_count := greatest(v_training_count, public.titan_jsonb_array_length_safe(coalesce(v_cloud_state -> 'history', '[]'::jsonb)));
  v_cloud_inventory_count := greatest(
    public.titan_jsonb_object_size_safe(coalesce(v_profile.inventory, '{}'::jsonb)),
    public.titan_jsonb_object_size_safe(coalesce(v_cloud_state #> '{user,inventory}', v_cloud_state -> 'inventory', '{}'::jsonb))
  );
  v_cloud_achievements_count := public.titan_jsonb_array_length_safe(coalesce(v_cloud_state #> '{user,unlockedAchievements}', '[]'::jsonb));
  v_cloud_talents_count := public.titan_jsonb_array_length_safe(coalesce(v_cloud_state #> '{user,unlockedTalents}', '[]'::jsonb));
  v_cloud_boss_level := public.titan_cache_safe_int(v_cloud_state #>> '{game,bossLevel}', 1);
  v_cloud_updated_at := coalesce(
    public.titan_cache_safe_timestamptz(v_cloud_state #>> '{meta,updatedAt}'),
    v_profile.updated_at
  );

  if v_local_id is not null and v_local_id <> v_uid::text and v_local_id not like 'guest_%' then
    v_flags := array_append(v_flags, 'LOCAL_USER_ID_MISMATCH');
  end if;

  if v_local_id like 'guest_%' then
    v_flags := array_append(v_flags, 'LOCAL_CACHE_FROM_GUEST_MODE');
  end if;

  if v_local_avatar is not null and v_local_avatar !~ '^[a-zA-Z0-9_-]+_[0-9]+\.(png|jpg|jpeg|webp|gif)$' and v_local_avatar !~ '^avatar_[0-9]+\.png$' then
    v_flags := array_append(v_flags, 'LOCAL_AVATAR_INVALID_FORMAT');
  end if;

  if v_local_level > v_cloud_level + 10 then
    v_flags := array_append(v_flags, 'LEVEL_DELTA_HIGH_REVIEW_REQUIRED');
  end if;

  if v_local_credits > v_cloud_credits + 50000 then
    v_flags := array_append(v_flags, 'CREDITS_DELTA_HIGH_REVIEW_REQUIRED');
  end if;

  if v_local_history_count > v_cloud_history_count + 25 then
    v_flags := array_append(v_flags, 'HISTORY_DELTA_HIGH_REVIEW_REQUIRED');
  end if;

  if v_local_updated_at is not null and v_cloud_updated_at is not null and v_local_updated_at > v_cloud_updated_at + interval '1 minute' then
    v_flags := array_append(v_flags, 'LOCAL_CACHE_NEWER_THAN_CLOUD');
  end if;

  if v_local_avatar is not null and coalesce(v_cloud_avatar, '') <> v_local_avatar then
    v_flags := array_append(v_flags, 'AVATAR_DIFF');
  end if;

  if v_local_history_count > v_cloud_history_count then
    v_flags := array_append(v_flags, 'LOCAL_HISTORY_NOT_FULLY_IN_CLOUD');
  end if;

  v_local_summary := jsonb_build_object(
    'userId', v_local_id,
    'username', nullif(trim(coalesce(v_local_user ->> 'name', v_local_user ->> 'username', '')), ''),
    'level', v_local_level,
    'xp', v_local_xp,
    'credits', v_local_credits,
    'avatar', v_local_avatar,
    'historyCount', v_local_history_count,
    'inventoryItemCount', v_local_inventory_count,
    'achievementsCount', v_local_achievements_count,
    'talentsCount', v_local_talents_count,
    'bossLevel', v_local_boss_level,
    'updatedAt', v_local_updated_at,
    'payloadBytes', v_payload_size
  );

  v_cloud_summary := jsonb_build_object(
    'userId', v_uid,
    'username', v_profile.username,
    'level', v_cloud_level,
    'xp', v_cloud_xp,
    'credits', v_cloud_credits,
    'avatar', v_cloud_avatar,
    'historyCount', v_cloud_history_count,
    'trainingLogsCount', v_training_count,
    'trainingLastDate', v_training_last_date,
    'inventoryItemCount', v_cloud_inventory_count,
    'achievementsCount', v_cloud_achievements_count,
    'talentsCount', v_cloud_talents_count,
    'bossLevel', v_cloud_boss_level,
    'updatedAt', v_cloud_updated_at
  );

  v_differences := jsonb_build_object(
    'levelDelta', v_local_level - v_cloud_level,
    'xpDelta', v_local_xp - v_cloud_xp,
    'creditsDelta', v_local_credits - v_cloud_credits,
    'historyCountDelta', v_local_history_count - v_cloud_history_count,
    'inventoryItemCountDelta', v_local_inventory_count - v_cloud_inventory_count,
    'achievementsCountDelta', v_local_achievements_count - v_cloud_achievements_count,
    'talentsCountDelta', v_local_talents_count - v_cloud_talents_count,
    'bossLevelDelta', v_local_boss_level - v_cloud_boss_level,
    'avatarDiff', coalesce(v_local_avatar, '') <> coalesce(v_cloud_avatar, ''),
    'localNewer', v_local_updated_at is not null and (v_cloud_updated_at is null or v_local_updated_at > v_cloud_updated_at)
  );

  insert into public.titan_cache_reconciliation_reports(
    user_id,
    local_summary,
    cloud_summary,
    differences,
    risk_flags
  )
  values (
    v_uid,
    v_local_summary,
    v_cloud_summary,
    v_differences,
    v_flags
  )
  returning id into v_report_id;

  return jsonb_build_object(
    'ok', true,
    'reportId', v_report_id,
    'localSummary', v_local_summary,
    'cloudSummary', v_cloud_summary,
    'differences', v_differences,
    'riskFlags', v_flags,
    'note', 'Report only. No progression was changed from browser cache.'
  );
end;
$$;

revoke all on function public.titan_submit_cache_reconciliation(jsonb) from public;
grant execute on function public.titan_submit_cache_reconciliation(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
