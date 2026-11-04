-- V11-60 (COM-D1): the Pionnier badge. A founding cohort with transparent criteria, a permanent badge that cannot be bought and gives no
-- advantage: no XP, no credit, no quest, no ranking weight. Attribution is the administrator's, never automatic: the candidate list applies
-- the announced rule (account created before a date, at least N confirmed sessions, not suspended) and the administrator grants from it,
-- so a fraudulent or empty account is never swept in. One badge per account (granting twice changes nothing), revocable.
-- The player reads its own badge; the export carries it; it is erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_pioneer_v1(), public.titan_pioneer_candidates_v1(timestamptz,integer), public.titan_pioneer_grant_v1(uuid,text),
-- public.titan_pioneer_revoke_v1(uuid), public.titan_pioneer_list_v1(); drop table private.titan_pioneers; then re-apply the extras helper of migration 42 (20261029090000_community_consultations.sql).

create table if not exists private.titan_pioneers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cohort text not null check (char_length(cohort) between 3 and 40),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);
alter table private.titan_pioneers enable row level security;
revoke all on private.titan_pioneers from public, anon, authenticated;

create or replace function public.titan_pioneer_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_row private.titan_pioneers%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_row from private.titan_pioneers where user_id = v_uid;
  if not found then return jsonb_build_object('granted', false); end if;
  return jsonb_build_object('granted', true, 'cohort', v_row.cohort, 'grantedAt', v_row.granted_at);
end;
$function$;

-- The announced rule, applied to the accounts that do not hold the badge yet. At most 200 candidates, oldest accounts first.
create or replace function public.titan_pioneer_candidates_v1(p_before timestamptz, p_min_sessions integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_before is null or coalesce(p_min_sessions, 0) < 1 or p_min_sessions > 1000 then raise exception 'CRITERIA_INVALID' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'username', x.username, 'createdAt', x.created_at, 'sessions', x.sessions) order by x.created_at)
      from (select p.id, p.username, p.created_at,
                   (select count(*) from public.training_logs l
                     where l.user_id = p.id and l.archived_at is null and not l.is_suspicious and l.status not in ('flagged', 'pending_review', 'rejected')) as sessions
              from public.profiles p
             where p.created_at < p_before and not coalesce(p.is_suspended, false)
               and not exists (select 1 from private.titan_pioneers b where b.user_id = p.id)
             order by p.created_at limit 2000) x
     where x.sessions >= p_min_sessions
     limit 200), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_pioneer_grant_v1(p_user uuid, p_cohort text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_added integer;
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and not coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_NOT_ELIGIBLE' using errcode = '22023';
  end if;
  insert into private.titan_pioneers (user_id, cohort, granted_by) values (p_user, btrim(p_cohort), auth.uid()) on conflict (user_id) do nothing;
  get diagnostics v_added = row_count;
  return v_added = 1;
end;
$function$;

create or replace function public.titan_pioneer_revoke_v1(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_removed integer;
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_pioneers where user_id = p_user;
  get diagnostics v_removed = row_count;
  return v_removed = 1;
end;
$function$;


create or replace function public.titan_pioneer_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', b.user_id, 'username', p.username, 'cohort', b.cohort, 'grantedAt', b.granted_at) order by b.granted_at desc)
      from (select * from private.titan_pioneers order by granted_at desc limit 500) b left join public.profiles p on p.id = b.user_id), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_pioneer_v1(), public.titan_pioneer_candidates_v1(timestamptz, integer), public.titan_pioneer_grant_v1(uuid, text), public.titan_pioneer_revoke_v1(uuid), public.titan_pioneer_list_v1() from public, anon;
grant execute on function public.titan_pioneer_v1(), public.titan_pioneer_candidates_v1(timestamptz, integer), public.titan_pioneer_grant_v1(uuid, text), public.titan_pioneer_revoke_v1(uuid), public.titan_pioneer_list_v1() to authenticated;

-- The export gains the badge (migration 42's helper keeps the Garmin link and the votes).
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'garminLink', coalesce((select jsonb_agg(jsonb_build_object('garmin_user_id', g.garmin_user_id, 'linked_at', g.linked_at, 'revoked_at', g.revoked_at, 'last_event_at', g.last_event_at))
                              from private.titan_garmin_links g where g.user_id = p_uid), '[]'::jsonb),
    'pollVotes', coalesce((select jsonb_agg(jsonb_build_object('poll_id', v.poll_id, 'option_position', v.option_position, 'voted_at', v.voted_at) order by v.voted_at)
                             from private.titan_poll_votes v where v.user_id = p_uid), '[]'::jsonb),
    'roadmapVotes', coalesce((select jsonb_agg(jsonb_build_object('item_id', v.item_id, 'voted_at', v.voted_at) order by v.voted_at)
                                from private.titan_roadmap_votes v where v.user_id = p_uid), '[]'::jsonb),
    'pioneer', coalesce((select jsonb_build_object('cohort', b.cohort, 'granted_at', b.granted_at) from private.titan_pioneers b where b.user_id = p_uid), 'null'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
