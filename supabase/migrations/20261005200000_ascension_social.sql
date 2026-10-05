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
