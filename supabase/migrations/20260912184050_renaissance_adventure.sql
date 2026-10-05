-- Campaign rewards are cosmetic only. Existing XP, credits and levels are unchanged.
create table public.adventure_worlds (
  id text primary key check (id in ('aube','marees','forge','aurores')),
  tier text not null check (tier in ('free','plus')),
  chapter_count integer not null default 9 check (chapter_count = 9)
);
insert into public.adventure_worlds(id,tier) values ('aube','free'),('marees','free'),('forge','plus'),('aurores','plus');
create table public.adventure_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  avatar text not null default 'scout' check (avatar in ('scout','ranger','keeper','artisan','navigator','sentinel')),
  selected_world text not null default 'aube' references public.adventure_worlds(id),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.adventure_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  world_id text not null references public.adventure_worlds(id),
  chapter integer not null default 1 check (chapter between 1 and 10),
  route text not null default 'rhythm' check (route in ('rhythm','journal')),
  timezone text not null default 'Europe/Paris',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(user_id,world_id)
);
create table public.adventure_rewards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  world_id text not null references public.adventure_worlds(id),
  chapter integer not null check (chapter between 1 and 9),
  earned_at timestamptz not null default now(),
  source_ids uuid[] not null,
  primary key(user_id,world_id,chapter)
);
alter table public.adventure_worlds enable row level security;
alter table public.adventure_profiles enable row level security;
alter table public.adventure_progress enable row level security;
alter table public.adventure_rewards enable row level security;
revoke all on public.adventure_worlds,public.adventure_profiles,public.adventure_progress,public.adventure_rewards from public,anon,authenticated;
grant select on public.adventure_worlds to anon,authenticated;
grant select on public.adventure_profiles,public.adventure_progress,public.adventure_rewards to authenticated;
create policy adventure_worlds_read on public.adventure_worlds for select to anon,authenticated using (true);
create policy adventure_profiles_owner on public.adventure_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy adventure_progress_owner on public.adventure_progress for select to authenticated using ((select auth.uid())=user_id);
create policy adventure_rewards_owner on public.adventure_rewards for select to authenticated using ((select auth.uid())=user_id);

-- Invoker helper: never accepts a caller-selected owner. At most one contribution per day.
create or replace function public.titan_adventure_evidence(p_world text)
returns jsonb language sql stable security invoker set search_path='' set statement_timeout='5s'
as $$
  with candidates as (
    select distinct on ((l.date at time zone a.timezone)::date)
      l.id, (l.date at time zone a.timezone)::date as day
    from public.adventure_progress a join public.training_logs l on l.user_id=a.user_id
    where a.user_id=(select auth.uid()) and a.world_id=p_world and a.chapter<=9
      and l.archived_at is null and l.is_suspicious is not true
      and coalesce(l.status,'valid') not in ('rejected','flagged','pending_review')
      and l.created_at>=a.started_at and l.date<=now()
      and (l.date at time zone a.timezone)::date >= (a.started_at at time zone a.timezone)::date
      and l.val>0 and l.details->>'serverReward'='true'
      and (a.route='rhythm' or length(trim(coalesce(l.details->>'note',l.details->>'notes','')))>=10)
    order by (l.date at time zone a.timezone)::date,l.created_at,l.id
  ) select jsonb_build_object('days',count(*),'source_ids',coalesce(jsonb_agg(id order by day),'[]'::jsonb)) from candidates;
$$;
revoke all on function public.titan_adventure_evidence(text) from public,anon;
grant execute on function public.titan_adventure_evidence(text) to authenticated;

create or replace function public.titan_adventure_snapshot()
returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='5s'
as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and is_suspended is not true) then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
  select jsonb_build_object(
    'version',1,'owner',v_uid,'generated_at',now(),
    'level',p.level,'xp',p.xp,'credits',p.credits,'next_level_xp',public.titan_level_requirement(p.level),
    'plus',p.is_elite is true and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at>now()),
    'avatar',coalesce(a.avatar,'scout'),'selected_world',coalesce(a.selected_world,'aube'),'revision',coalesce(a.revision,0),
    'campaigns', (select jsonb_agg(jsonb_build_object('id',w.id,'tier',w.tier,'chapter',coalesce(ap.chapter,0),
      'route',coalesce(ap.route,'rhythm'),'started_at',ap.started_at,'completed_at',ap.completed_at,
      'target',case when ap.chapter<=9 then (array[1,2,2,2,3,2,3,3,3])[ap.chapter] else 0 end,
      'evidence',public.titan_adventure_evidence(w.id)) order by w.id)
      from public.adventure_worlds w left join public.adventure_progress ap on ap.world_id=w.id and ap.user_id=v_uid),
    'rewards',coalesce((select jsonb_agg(jsonb_build_object('world',r.world_id,'chapter',r.chapter,'earned_at',r.earned_at) order by r.earned_at desc)
      from public.adventure_rewards r where r.user_id=v_uid),'[]'::jsonb)
  ) into v_result from public.profiles p left join public.adventure_profiles a on a.user_id=p.id where p.id=v_uid;
  return v_result;
end;
$$;
revoke all on function public.titan_adventure_snapshot() from public,anon;
grant execute on function public.titan_adventure_snapshot() to authenticated;

-- Privileged mutation is isolated in private. Public wrapper executes with caller rights.
create or replace function private.titan_adventure_action(
 p_action text,p_world text,p_route text,p_avatar text,p_revision integer,p_chapter integer,p_timezone text
) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s'
as $$
declare
 v_uid uuid:=auth.uid(); v_profile public.profiles%rowtype; v_state public.adventure_profiles%rowtype;
 v_progress public.adventure_progress%rowtype; v_world public.adventure_worlds%rowtype;
 v_evidence jsonb; v_target integer; v_required integer; v_plus boolean;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_action is null or p_action not in ('start','select','claim','avatar') then raise exception 'INVALID_ACTION'; end if;
 select * into v_profile from public.profiles where id=v_uid for update;
 if not found or v_profile.is_suspended is true then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 v_plus:=v_profile.is_elite is true and v_profile.elite_refunded_at is null and (v_profile.elite_ends_at is null or v_profile.elite_ends_at>now());
 insert into public.adventure_profiles(user_id) values(v_uid) on conflict do nothing;
 select * into v_state from public.adventure_profiles where user_id=v_uid for update;
 if p_revision is null or (p_revision<>v_state.revision and not(p_revision=0 and v_state.revision=1)) then
   raise exception 'ADVENTURE_CONFLICT' using errcode='40001'; end if;
 if p_action='avatar' then
   v_required:=case p_avatar when 'scout' then 1 when 'ranger' then 1 when 'keeper' then 3 when 'artisan' then 6 when 'navigator' then 10 when 'sentinel' then 15 end;
   if v_required is null or v_profile.level<v_required then raise exception 'AVATAR_LOCKED' using errcode='42501'; end if;
   update public.adventure_profiles set avatar=p_avatar where user_id=v_uid;
 else
   select * into v_world from public.adventure_worlds where id=p_world;
   if not found then raise exception 'INVALID_WORLD'; end if;
   if p_action in ('start','claim') and v_world.tier='plus' and v_plus is not true then raise exception 'TITAN_PLUS_REQUIRED' using errcode='42501'; end if;
   select * into v_progress from public.adventure_progress where user_id=v_uid and world_id=p_world for update;
   if p_action='start' then
     if p_route is null or p_route not in ('rhythm','journal') then raise exception 'INVALID_ROUTE'; end if;
     if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'INVALID_TIMEZONE'; end if;
     -- Starting again resumes the same progress; never resets timestamps or rewards.
     insert into public.adventure_progress(user_id,world_id,route,timezone) values(v_uid,p_world,p_route,p_timezone) on conflict do nothing;
   elsif p_action='claim' then
     if v_progress.user_id is null or p_chapter is null or v_progress.chapter<>p_chapter or p_chapter>9 then raise exception 'ADVENTURE_CONFLICT' using errcode='40001'; end if;
     v_target:=(array[1,2,2,2,3,2,3,3,3])[p_chapter];
     v_evidence:=public.titan_adventure_evidence(p_world);
     if (v_evidence->>'days')::integer<v_target then raise exception 'QUEST_INCOMPLETE'; end if;
     insert into public.adventure_rewards(user_id,world_id,chapter,source_ids)
       values(v_uid,p_world,p_chapter,array(select value::uuid from jsonb_array_elements_text(v_evidence->'source_ids')));
     update public.adventure_progress set chapter=chapter+1,started_at=clock_timestamp(),
       completed_at=case when chapter=9 then now() else null end where user_id=v_uid and world_id=p_world;
   end if;
   update public.adventure_profiles set selected_world=p_world where user_id=v_uid;
 end if;
 update public.adventure_profiles set revision=revision+1,updated_at=now() where user_id=v_uid;
 return public.titan_adventure_snapshot();
end;
$$;
revoke all on function private.titan_adventure_action(text,text,text,text,integer,integer,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.titan_adventure_action(text,text,text,text,integer,integer,text) to authenticated;
create or replace function public.titan_adventure_action(
 p_action text,p_world text default null,p_route text default 'rhythm',p_avatar text default null,
 p_revision integer default null,p_chapter integer default null,p_timezone text default 'Europe/Paris'
) returns jsonb language sql security invoker set search_path='' as $$
 select private.titan_adventure_action(p_action,p_world,p_route,p_avatar,p_revision,p_chapter,p_timezone);
$$;
revoke all on function public.titan_adventure_action(text,text,text,text,integer,integer,text) from public,anon;
grant execute on function public.titan_adventure_action(text,text,text,text,integer,integer,text) to authenticated;

-- No anonymous writes, no direct browser writes, no extra XP or credits for claims.
comment on table public.adventure_rewards is 'Permanent cosmetic milestones, one per chapter. Editing or archiving contributing sessions does not reissue or revoke earned cosmetics. Unclaimed progress reflects current eligible records.';
