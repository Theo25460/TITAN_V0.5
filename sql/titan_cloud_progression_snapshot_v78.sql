begin;

-- TITAN OS v78 - Cloud progression cockpit and stricter progression writes.
-- Goal: the browser can read/queue/display progress, but Supabase remains the source
-- of truth for XP, credits, levels and training rewards.

create schema if not exists private;

create or replace function private.titan_progression_snapshot_v78()
returns table (
  server_user_id uuid,
  level integer,
  xp integer,
  credits integer,
  is_elite boolean,
  is_tester boolean,
  is_suspended boolean,
  training_total integer,
  training_7d integer,
  training_30d integer,
  last_training_at timestamptz,
  week_start date,
  weekly_xp_used integer,
  weekly_credits_used integer,
  weekly_xp_cap integer,
  weekly_credit_cap integer,
  weekly_xp_remaining integer,
  weekly_credits_remaining integer,
  authority text,
  rules_version text,
  checked_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := date_trunc('week', now())::date;
  v_level integer := 1;
  v_xp integer := 0;
  v_credits integer := 0;
  v_is_elite boolean := false;
  v_is_tester boolean := false;
  v_is_suspended boolean := false;
  v_training_total integer := 0;
  v_training_7d integer := 0;
  v_training_30d integer := 0;
  v_last_training_at timestamptz := null;
  v_weekly_xp_used integer := 0;
  v_weekly_credits_used integer := 0;
  v_weekly_xp_cap integer := 9600;
  v_weekly_credit_cap integer := 4800;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select
    greatest(1, coalesce(p.level, 1)),
    greatest(0, coalesce(p.xp, 0)),
    greatest(0, coalesce(p.credits, 0)),
    coalesce(p.is_elite, false),
    coalesce(p.is_tester, false),
    coalesce(p.is_suspended, false)
  into v_level, v_xp, v_credits, v_is_elite, v_is_tester, v_is_suspended
  from public.profiles as p
  where p.id = v_uid;

  v_weekly_xp_cap := case when v_is_elite then 11520 else 9600 end;
  v_weekly_credit_cap := case when v_is_elite then 5760 else 4800 end;

  select
    count(*)::integer,
    count(*) filter (where coalesce(tl.date, now()) >= now() - interval '7 days')::integer,
    count(*) filter (where coalesce(tl.date, now()) >= now() - interval '30 days')::integer,
    max(tl.date)
  into v_training_total, v_training_7d, v_training_30d, v_last_training_at
  from public.training_logs as tl
  where tl.user_id = v_uid
    and coalesce(tl.status, 'valid') = 'valid';

  select
    greatest(0, coalesce(u.xp_awarded, 0)),
    greatest(0, coalesce(u.credits_awarded, 0))
  into v_weekly_xp_used, v_weekly_credits_used
  from public.titan_weekly_reward_usage as u
  where u.user_id = v_uid
    and u.week_start = v_week;

  weekly_xp_remaining := greatest(0, v_weekly_xp_cap - coalesce(v_weekly_xp_used, 0));
  weekly_credits_remaining := greatest(0, v_weekly_credit_cap - coalesce(v_weekly_credits_used, 0));

  return query select
    v_uid,
    v_level,
    v_xp,
    v_credits,
    v_is_elite,
    v_is_tester,
    v_is_suspended,
    coalesce(v_training_total, 0),
    coalesce(v_training_7d, 0),
    coalesce(v_training_30d, 0),
    v_last_training_at,
    v_week,
    coalesce(v_weekly_xp_used, 0),
    coalesce(v_weekly_credits_used, 0),
    v_weekly_xp_cap,
    v_weekly_credit_cap,
    weekly_xp_remaining,
    weekly_credits_remaining,
    'server_authoritative'::text,
    'v78-cloud-authority'::text,
    now();
end;
$$;

create or replace function public.titan_get_progression_snapshot()
returns table (
  server_user_id uuid,
  level integer,
  xp integer,
  credits integer,
  is_elite boolean,
  is_tester boolean,
  is_suspended boolean,
  training_total integer,
  training_7d integer,
  training_30d integer,
  last_training_at timestamptz,
  week_start date,
  weekly_xp_used integer,
  weekly_credits_used integer,
  weekly_xp_cap integer,
  weekly_credit_cap integer,
  weekly_xp_remaining integer,
  weekly_credits_remaining integer,
  authority text,
  rules_version text,
  checked_at timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.titan_progression_snapshot_v78();
$$;

comment on function public.titan_get_progression_snapshot()
is 'Authenticated read-only snapshot of the current player progression. Sensitive progression writes stay behind server RPCs.';

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on function private.titan_progression_snapshot_v78() from public, anon;
grant execute on function private.titan_progression_snapshot_v78() to authenticated;

revoke all on function public.titan_get_progression_snapshot() from public, anon;
grant execute on function public.titan_get_progression_snapshot() to authenticated;

-- Progression-critical writes: no direct self mutation of profile state or logs.
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_self_or_admin_update_v1" on public.profiles;
drop policy if exists "profiles_admin_update_v78" on public.profiles;

create policy "profiles_admin_update_v78"
on public.profiles
for update
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

revoke insert on table public.profiles from authenticated;

drop policy if exists "training_logs_insert_own" on public.training_logs;
drop policy if exists "training_logs_update_own" on public.training_logs;
drop policy if exists "training_logs_delete_own" on public.training_logs;

revoke insert, delete on table public.training_logs from authenticated;

notify pgrst, 'reload schema';

commit;
