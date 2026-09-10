begin;

-- TITAN OS - Training anti-cheat / suspicious action hardening.
-- Run after the RLS/privacy scripts. This does not grant rewards from the browser;
-- it rejects impossible training log rows and keeps an audit trail for moderation.

create extension if not exists pgcrypto;

create table if not exists public.titan_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  active boolean not null default true,
  permissions jsonb not null default '{"profiles":true,"news":true,"reports":true,"audit":true}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.titan_admins add column if not exists active boolean not null default true;
alter table public.titan_admins add column if not exists revoked_at timestamptz;

create table if not exists public.titan_suspicious_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'ignored', 'confirmed')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists titan_suspicious_actions_user_created_idx
on public.titan_suspicious_actions(user_id, created_at desc);

create index if not exists titan_suspicious_actions_status_created_idx
on public.titan_suspicious_actions(status, created_at desc);

alter table public.titan_suspicious_actions enable row level security;

grant select on public.titan_suspicious_actions to authenticated;

create or replace function public.titan_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.titan_admins a
    where a.user_id = p_user_id
      and coalesce((to_jsonb(a) ->> 'active')::boolean, true) is true
      and (to_jsonb(a) ->> 'revoked_at') is null
  );
$$;

revoke all on function public.titan_is_admin(uuid) from public;
grant execute on function public.titan_is_admin(uuid) to anon, authenticated;

drop policy if exists "titan_suspicious_select_own_or_admin" on public.titan_suspicious_actions;
create policy "titan_suspicious_select_own_or_admin"
on public.titan_suspicious_actions
for select
to authenticated
using (user_id = auth.uid() or public.titan_is_admin(auth.uid()));

create or replace function public.titan_log_suspicious_action(
  p_user_id uuid,
  p_action_type text,
  p_severity text,
  p_reason text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.titan_suspicious_actions(user_id, action_type, severity, reason, payload)
  values (
    p_user_id,
    left(coalesce(p_action_type, 'unknown'), 80),
    case when p_severity in ('low', 'medium', 'high', 'critical') then p_severity else 'medium' end,
    left(coalesce(p_reason, 'unknown'), 240),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.titan_log_suspicious_action(uuid, text, text, text, jsonb) from public;
grant execute on function public.titan_log_suspicious_action(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.titan_jsonb_numeric(p_payload jsonb, p_key text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_text text;
begin
  v_text := nullif(p_payload ->> p_key, '');
  if v_text is null then return null; end if;
  return v_text::numeric;
exception when others then
  return null;
end;
$$;

revoke all on function public.titan_jsonb_numeric(jsonb, text) from public;

create or replace function public.titan_guard_training_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    return v_old_or_null;
  end if;

  if new.xp < 0 or new.xp > 25000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'critical', 'TRAINING_XP_OUT_OF_RANGE', v_payload);
    return v_old_or_null;
  end if;

  if new.date > now() + interval '10 minutes' then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DATE_IN_FUTURE', v_payload);
    return v_old_or_null;
  end if;

  if v_details_bytes > 50000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DETAILS_TOO_LARGE', v_payload);
    return v_old_or_null;
  end if;

  if v_gpx_points > 1200 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_GPX_TOO_LARGE', v_payload);
    return v_old_or_null;
  end if;

  if v_duration_min is not null and (v_duration_min <= 0 or v_duration_min > 1440) then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DURATION_OUT_OF_RANGE', v_payload);
    return v_old_or_null;
  end if;

  if v_distance_km is not null and v_distance_km > 300 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DISTANCE_OUT_OF_RANGE', v_payload);
    return v_old_or_null;
  end if;

  if v_elevation_m > 12000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_ELEVATION_OUT_OF_RANGE', v_payload);
    return v_old_or_null;
  end if;

  if TG_OP = 'INSERT' then
    select count(*) into v_hour_count
    from public.training_logs
    where user_id = new.user_id
      and date >= now() - interval '1 hour';

    select count(*) into v_day_count
    from public.training_logs
    where user_id = new.user_id
      and date >= now() - interval '24 hours';

    if v_hour_count >= 12 or v_day_count >= 40 then
      perform public.titan_log_suspicious_action(
        new.user_id,
        'training_log.rejected',
        'critical',
        'TRAINING_FREQUENCY_OUT_OF_RANGE',
        v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count)
      );
      return null;
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
$$;

revoke all on function public.titan_guard_training_log() from public;

drop trigger if exists titan_guard_training_log_trigger on public.training_logs;
create trigger titan_guard_training_log_trigger
before insert or update on public.training_logs
for each row
execute function public.titan_guard_training_log();

comment on table public.titan_suspicious_actions is
'Moderation/security audit trail for impossible or suspicious client-side actions.';

comment on function public.titan_guard_training_log() is
'Rejects impossible training_logs rows and writes titan_suspicious_actions for moderation review.';

create or replace function public.titan_guard_profile_progression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_credit_delta integer;
  v_level_delta integer;
  v_state_bytes integer;
begin
  if auth.uid() is not null and new.id <> auth.uid() then
    raise exception 'PROFILE_USER_MISMATCH' using errcode = '42501';
  end if;

  new.credits := coalesce(new.credits, old.credits, 0);
  new.level := coalesce(new.level, old.level, 1);
  new.game_state := coalesce(new.game_state, old.game_state, '{}'::jsonb);
  new.username := nullif(left(trim(regexp_replace(coalesce(new.username, old.username, 'Agent'), '[[:cntrl:]<>]', '', 'g')), 24), '');
  if new.username is null then
    new.username := 'Agent';
  end if;
  if new.avatar is not null and new.avatar !~* '^avatar_[0-9]+\.png$' then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_AVATAR_INVALID', jsonb_build_object('avatar', new.avatar));
    new.avatar := old.avatar;
  end if;
  v_credit_delta := new.credits - coalesce(old.credits, 0);
  v_level_delta := new.level - coalesce(old.level, 1);
  v_state_bytes := octet_length(new.game_state::text);

  v_payload := jsonb_build_object(
    'profileId', new.id,
    'oldCredits', old.credits,
    'newCredits', new.credits,
    'creditDelta', v_credit_delta,
    'oldLevel', old.level,
    'newLevel', new.level,
    'levelDelta', v_level_delta,
    'gameStateBytes', v_state_bytes
  );

  if new.credits < 0 or new.credits > 100000000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_CREDITS_OUT_OF_RANGE', v_payload);
    return old;
  end if;

  if new.level < 1 or new.level > 500 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_LEVEL_OUT_OF_RANGE', v_payload);
    return old;
  end if;

  if v_state_bytes > 500000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_GAME_STATE_TOO_LARGE', v_payload);
    return old;
  end if;

  if v_credit_delta > 50000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_CREDITS_JUMP', v_payload);
    return old;
  end if;

  if v_level_delta > 10 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_LEVEL_JUMP', v_payload);
    return old;
  end if;

  if v_credit_delta > 15000 or v_level_delta > 3 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_PROGRESS_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$$;

revoke all on function public.titan_guard_profile_progression() from public;

drop trigger if exists titan_guard_profile_progression_trigger on public.profiles;
create trigger titan_guard_profile_progression_trigger
before update on public.profiles
for each row
execute function public.titan_guard_profile_progression();

comment on function public.titan_guard_profile_progression() is
'Rejects impossible profile progression jumps and writes titan_suspicious_actions for review.';

commit;
