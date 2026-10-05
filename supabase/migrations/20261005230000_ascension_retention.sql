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
