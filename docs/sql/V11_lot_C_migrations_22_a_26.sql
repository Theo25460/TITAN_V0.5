-- TITAN V1.1 — lot C : migrations 22 à 26 sur 33. Lots à exécuter DANS L'ORDRE A, B, C, D, E (Supabase > SQL Editor, un lot par exécution).
-- Détectées absentes en production le 3 novembre 2026. Additif ; une erreur annule tout le lot : corriger puis relancer ce lot.

-- ======== 22/33 : 20261029170000_world_goal.sql ========
-- V11-70 (COM-B5): the world goal. A long collective goal (one to thirteen weeks) created by an administrator, with three levels so that
-- every size of community has something realistic to reach. It counts "minutes d'effort" (the normalized effort that makes sports comparable;
-- nothing is added in km, repetitions or kg). A player joins on purpose; only sessions recorded after joining and dated inside the period
-- count, each day capped like the guild week (private.titan_effort_days), history and held or flagged sessions excluded, so an excluded
-- session stops counting at the next read. Nobody sees another player's contribution: a player reads its own share, the total, the three
-- levels and the number of participants (anonymous by construction). Two goals never overlap. No XP, credit, record or ranking is granted
-- and nothing pushes towards over-training: the cap per day is the same as everywhere else.
-- Own participation is exported (extras helper, kept cumulative) and erased with the account (foreign keys on delete cascade).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_world_goal_v1(), public.titan_world_goal_join_v1(uuid,boolean),
-- public.titan_world_goal_admin_save_v1(uuid,date,date,text,text,integer,integer,integer), public.titan_world_goal_admin_list_v1();
-- drop tables private.titan_world_goal_members, private.titan_world_goals; then re-apply the extras helper of migration 49 (20261029160000_duel_links.sql).

create table if not exists private.titan_world_goals (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  title text not null check (char_length(title) between 3 and 100),
  detail text check (detail is null or char_length(detail) <= 400),
  level1 integer not null check (level1 between 100 and 10000000),
  level2 integer not null,
  level3 integer not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on and ends_on - starts_on <= 91),
  check (level2 > level1 and level3 > level2 and level3 <= 10000000)
);
create table if not exists private.titan_world_goal_members (
  goal_id uuid not null references private.titan_world_goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);
create index if not exists titan_world_goal_members_user_idx on private.titan_world_goal_members (user_id);
alter table private.titan_world_goals enable row level security;
alter table private.titan_world_goal_members enable row level security;
revoke all on private.titan_world_goals, private.titan_world_goal_members from public, anon, authenticated;

-- The goal in progress (Paris days), else the one that ended in the last seven days so its result stays readable. Aggregates only.
create or replace function public.titan_world_goal_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_g private.titan_world_goals%rowtype;
  v_from timestamptz;
  v_to timestamptz;
  v_total numeric := 0;
  v_mine numeric := 0;
  v_members integer;
  v_joined boolean;
  v_level integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_g from private.titan_world_goals where starts_on <= v_today and ends_on + 7 >= v_today order by starts_on desc limit 1;
  if not found then return null; end if;
  v_from := v_g.starts_on::timestamp at time zone 'Europe/Paris';
  v_to := (v_g.ends_on + 1)::timestamp at time zone 'Europe/Paris';
  select count(*)::integer into v_members from private.titan_world_goal_members m where m.goal_id = v_g.id;
  select exists (select 1 from private.titan_world_goal_members m where m.goal_id = v_g.id and m.user_id = v_uid) into v_joined;
  select coalesce(sum(c.minutes), 0), coalesce(sum(c.minutes) filter (where c.user_id = v_uid), 0) into v_total, v_mine
    from (select m.user_id, (select coalesce(sum(d.minutes), 0) from private.titan_effort_days(m.user_id, v_from, v_to, m.joined_at, 90) d) as minutes
            from (select * from private.titan_world_goal_members where goal_id = v_g.id order by joined_at limit 5000) m) c;
  v_level := case when v_total >= v_g.level3 then 3 when v_total >= v_g.level2 then 2 when v_total >= v_g.level1 then 1 else 0 end;
  return jsonb_build_object('id', v_g.id, 'title', v_g.title, 'detail', v_g.detail, 'startsOn', v_g.starts_on, 'endsOn', v_g.ends_on,
    'levels', jsonb_build_array(v_g.level1, v_g.level2, v_g.level3), 'minutes', round(v_total), 'members', v_members, 'joined', v_joined, 'mine', round(v_mine),
    'level', v_level, 'state', case when now() >= v_to then 'closed' when v_today < v_g.starts_on then 'upcoming' else 'open' end);
end;
$function$;

create or replace function public.titan_world_goal_join_v1(p_goal uuid, p_join boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_g private.titan_world_goals%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'world_goal', 60);
  select * into v_g from private.titan_world_goals where id = p_goal;
  if not found then raise exception 'GOAL_NOT_FOUND' using errcode = '22023'; end if;
  if now() >= (v_g.ends_on + 1)::timestamp at time zone 'Europe/Paris' then raise exception 'GOAL_ENDED' using errcode = '22023'; end if;
  if coalesce(p_join, false) then
    insert into private.titan_world_goal_members (goal_id, user_id) values (p_goal, v_uid) on conflict do nothing;
  else
    delete from private.titan_world_goal_members where goal_id = p_goal and user_id = v_uid;
  end if;
  return jsonb_build_object('goal', p_goal, 'joined', coalesce(p_join, false));
end;
$function$;

create or replace function public.titan_world_goal_admin_save_v1(p_id uuid, p_starts date, p_ends date, p_title text, p_detail text, p_level1 integer, p_level2 integer, p_level3 integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_old private.titan_world_goals%rowtype;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts or p_ends - p_starts > 91 then raise exception 'BAD_PERIOD' using errcode = '22023'; end if;
  if p_level1 is null or p_level2 is null or p_level3 is null or not (p_level1 < p_level2 and p_level2 < p_level3) then raise exception 'BAD_LEVELS' using errcode = '22023'; end if;
  if exists (select 1 from private.titan_world_goals g where g.id is distinct from v_id and g.starts_on <= p_ends and g.ends_on >= p_starts) then
    raise exception 'GOAL_OVERLAP' using errcode = '22023';
  end if;
  if v_id is null then
    if p_ends < v_today then raise exception 'PERIOD_IN_THE_PAST' using errcode = '22023'; end if;
    insert into private.titan_world_goals (starts_on, ends_on, title, detail, level1, level2, level3, created_by)
    values (p_starts, p_ends, btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_level1, p_level2, p_level3, v_uid) returning id into v_id;
  else
    select * into v_old from private.titan_world_goals where id = v_id;
    if not found then raise exception 'GOAL_NOT_FOUND' using errcode = '22023'; end if;
    -- Once the goal has begun the rules are frozen: only the wording may change.
    if v_today >= v_old.starts_on and (p_starts, p_ends, p_level1, p_level2, p_level3) is distinct from (v_old.starts_on, v_old.ends_on, v_old.level1, v_old.level2, v_old.level3) then
      raise exception 'GOAL_STARTED_FROZEN' using errcode = '22023';
    end if;
    update private.titan_world_goals set starts_on = p_starts, ends_on = p_ends, title = btrim(p_title), detail = nullif(btrim(coalesce(p_detail, '')), ''),
      level1 = p_level1, level2 = p_level2, level3 = p_level3 where id = v_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.titan_world_goal_admin_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'startsOn', g.starts_on, 'endsOn', g.ends_on, 'title', g.title, 'detail', g.detail,
             'levels', jsonb_build_array(g.level1, g.level2, g.level3),
             'members', (select count(*) from private.titan_world_goal_members m where m.goal_id = g.id)) order by g.starts_on desc)
      from (select * from private.titan_world_goals order by starts_on desc limit 30) g), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_world_goal_v1(), public.titan_world_goal_join_v1(uuid, boolean),
  public.titan_world_goal_admin_save_v1(uuid, date, date, text, text, integer, integer, integer), public.titan_world_goal_admin_list_v1() from public, anon;
grant execute on function public.titan_world_goal_v1(), public.titan_world_goal_join_v1(uuid, boolean),
  public.titan_world_goal_admin_save_v1(uuid, date, date, text, text, integer, integer, integer), public.titan_world_goal_admin_list_v1() to authenticated;

-- The export gains the account's own participations (the helper stays cumulative: Garmin link, votes, badge, intentions, quests, buddies, seasons, ranking, duels).
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
    'pioneer', coalesce((select jsonb_build_object('cohort', b.cohort, 'granted_at', b.granted_at) from private.titan_pioneers b where b.user_id = p_uid), 'null'::jsonb),
    'dailyIntents', coalesce((select jsonb_agg(jsonb_build_object('day', i.day, 'intent', i.intent, 'visibility', i.visibility, 'done_at', i.done_at) order by i.day)
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb),
    'commonQuests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', m.quest_id, 'week_start', q.week_start, 'joined_at', m.joined_at) order by m.joined_at)
                                from private.titan_common_quest_members m join private.titan_common_quests q on q.id = m.quest_id where m.user_id = p_uid), '[]'::jsonb),
    'buddies', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'role', case when b.inviter_id = p_uid then 'inviter' else 'invitee' end, 'status', b.status,
                           'starts_on', b.starts_on, 'ends_on', b.ends_on, 'ended_at', b.ended_at) order by b.created_at)
                           from private.titan_buddies b where p_uid in (b.inviter_id, b.invitee_id)), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('season_id', m.season_id, 'name', s.name, 'starts_on', s.starts_on, 'joined_at', m.joined_at,
                           'final_minutes', m.final_minutes, 'final_days', m.final_days) order by s.starts_on)
                           from private.titan_season_members m join private.titan_seasons s on s.id = m.season_id where m.user_id = p_uid), '[]'::jsonb),
    'rankingOptIn', coalesce((select jsonb_build_object('since', o.since) from private.titan_ranking_optin o where o.user_id = p_uid), 'null'::jsonb),
    'challengeResults', coalesce((select jsonb_agg(jsonb_build_object('challenge_id', r.challenge_id, 'final_progress', r.final_progress, 'reached', r.reached, 'frozen_at', r.frozen_at) order by r.frozen_at)
                                    from private.titan_challenge_results r where r.user_id = p_uid), '[]'::jsonb),
    'worldGoals', coalesce((select jsonb_agg(jsonb_build_object('goal_id', m.goal_id, 'starts_on', g.starts_on, 'ends_on', g.ends_on, 'joined_at', m.joined_at) order by m.joined_at)
                              from private.titan_world_goal_members m join private.titan_world_goals g on g.id = m.goal_id where m.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 23/33 : 20261030090000_clubs.sql ========
-- V11-71 (COM-C8): club spaces. A club is a private group a sports club (or any group of friends) opens for itself, distinct from the personal guild
-- and from the three factions to come. Protective defaults: private, joined by a code that only the administrators see, discoverable in the list
-- only if an administrator chooses so. Roles: administrator and member. Administrators write announcements (500 characters, no links or
-- markup stored as active content: the client escapes text), remove an announcement, remove a member (who cannot come back with the code) and edit
-- the club. Members only see the name, the description, the number of members and the announcements: never another member's name, session or
-- result. Only administrators see the member names (the public username) to moderate. Limits: 200 members per club, 5 clubs per account, 3 clubs
-- created per account, 20 announcements kept visible. A club with no administrator left hands the role to its oldest member, else is archived.
-- No XP, credit, ranking or reward. Own memberships and announcements are exported (extras helper, kept cumulative) and erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_club_create_v1(text,text,boolean), public.titan_club_my_v1(), public.titan_club_discover_v1(),
-- public.titan_club_join_v1(text,uuid), public.titan_club_leave_v1(uuid), public.titan_club_set_v1(uuid,text,text,boolean,boolean),
-- public.titan_club_announce_v1(uuid,text), public.titan_club_announce_remove_v1(uuid), public.titan_club_member_remove_v1(uuid,uuid);
-- drop tables private.titan_club_bans, private.titan_club_announcements, private.titan_club_members, private.titan_clubs;
-- then re-apply the extras helper of migration 51 (20261029170000_world_goal.sql).

create table if not exists private.titan_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 60),
  description text check (description is null or char_length(description) <= 300),
  discoverable boolean not null default false,
  join_code text not null unique check (join_code ~ '^[A-Z2-9]{8}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists private.titan_club_members (
  club_id uuid not null references private.titan_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists titan_club_members_user_idx on private.titan_club_members (user_id);
create table if not exists private.titan_club_announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references private.titan_clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists titan_club_announcements_club_idx on private.titan_club_announcements (club_id, created_at desc);
create table if not exists private.titan_club_bans (
  club_id uuid not null references private.titan_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
alter table private.titan_clubs enable row level security;
alter table private.titan_club_members enable row level security;
alter table private.titan_club_announcements enable row level security;
alter table private.titan_club_bans enable row level security;
revoke all on private.titan_clubs, private.titan_club_members, private.titan_club_announcements, private.titan_club_bans from public, anon, authenticated;

create or replace function private.titan_club_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $function$
declare v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_code text; i integer;
begin
  loop
    v_code := '';
    for i in 1..8 loop v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1); end loop;
    exit when not exists (select 1 from private.titan_clubs where join_code = v_code);
  end loop;
  return v_code;
end;
$function$;
revoke all on function private.titan_club_code() from public, anon, authenticated;

create or replace function private.titan_club_text(p_value text, p_max integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select nullif(btrim(regexp_replace(regexp_replace(coalesce(p_value, ''), '[[:cntrl:]<>]', '', 'g'), '\s+', ' ', 'g')), '');
$function$;
revoke all on function private.titan_club_text(text, integer) from public, anon, authenticated;

create or replace function public.titan_club_create_v1(p_name text, p_description text default null, p_discoverable boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := private.titan_club_text(p_name, 60);
  v_desc text := private.titan_club_text(p_description, 300);
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_create', 10);
  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 60 then raise exception 'BAD_NAME' using errcode = '22023'; end if;
  if v_desc is not null and char_length(v_desc) > 300 then raise exception 'BAD_DESCRIPTION' using errcode = '22023'; end if;
  if (select count(*) from private.titan_clubs c where c.created_by = v_uid and c.archived_at is null) >= 3 then raise exception 'TOO_MANY_CREATED' using errcode = '22023'; end if;
  if (select count(*) from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id where m.user_id = v_uid and c.archived_at is null) >= 5 then raise exception 'TOO_MANY_CLUBS' using errcode = '22023'; end if;
  insert into private.titan_clubs (name, description, discoverable, join_code, created_by)
  values (v_name, v_desc, coalesce(p_discoverable, false), private.titan_club_code(), v_uid) returning id into v_id;
  insert into private.titan_club_members (club_id, user_id, role) values (v_id, v_uid, 'admin');
  return v_id;
end;
$function$;

-- My clubs. The code and the member names are only given to administrators. Announcements: the 20 most recent not removed.
create or replace function public.titan_club_my_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'description', c.description, 'discoverable', c.discoverable, 'role', m.role, 'joinedAt', m.joined_at,
      'members', (select count(*) from private.titan_club_members x where x.club_id = c.id),
      'code', case when m.role = 'admin' then c.join_code else null end,
      'roster', case when m.role = 'admin' then coalesce((
          select jsonb_agg(jsonb_build_object('userId', x.user_id, 'name', coalesce(nullif(p.username, ''), 'Athlète'), 'role', x.role) order by x.joined_at)
            from (select * from private.titan_club_members where club_id = c.id order by joined_at limit 200) x left join public.profiles p on p.id = x.user_id), '[]'::jsonb) else null end,
      'announcements', coalesce((
          select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'at', a.created_at, 'mine', a.author_id = v_uid) order by a.created_at desc)
            from (select * from private.titan_club_announcements where club_id = c.id and removed_at is null order by created_at desc limit 20) a), '[]'::jsonb))
      order by m.joined_at)
      from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id
     where m.user_id = v_uid and c.archived_at is null), '[]'::jsonb);
end;
$function$;

-- Clubs an administrator chose to make discoverable: name, description, size. Nothing about the members.
create or replace function public.titan_club_discover_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description,
             'members', (select count(*) from private.titan_club_members x where x.club_id = c.id)) order by c.created_at desc)
      from (select * from private.titan_clubs c0
             where c0.discoverable and c0.archived_at is null
               and not exists (select 1 from private.titan_club_members m where m.club_id = c0.id and m.user_id = v_uid)
               and not exists (select 1 from private.titan_club_bans b where b.club_id = c0.id and b.user_id = v_uid)
             order by c0.created_at desc limit 30) c), '[]'::jsonb);
end;
$function$;

-- Join with the code (any club), or by identifier when the club is discoverable. One identical refusal for a wrong code, an archived club,
-- a banned player: nothing says which one it was.
create or replace function public.titan_club_join_v1(p_code text default null, p_club uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_c private.titan_clubs%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_join', 30);
  if v_code <> '' then
    select * into v_c from private.titan_clubs where join_code = v_code and archived_at is null;
  elsif p_club is not null then
    select * into v_c from private.titan_clubs where id = p_club and discoverable and archived_at is null;
  end if;
  if v_c.id is null or exists (select 1 from private.titan_club_bans b where b.club_id = v_c.id and b.user_id = v_uid) then
    raise exception 'CLUB_NOT_FOUND' using errcode = '22023';
  end if;
  if exists (select 1 from private.titan_club_members m where m.club_id = v_c.id and m.user_id = v_uid) then return v_c.id; end if;
  if (select count(*) from private.titan_club_members x where x.club_id = v_c.id) >= 200 then raise exception 'CLUB_FULL' using errcode = '22023'; end if;
  if (select count(*) from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id where m.user_id = v_uid and c.archived_at is null) >= 5 then raise exception 'TOO_MANY_CLUBS' using errcode = '22023'; end if;
  insert into private.titan_club_members (club_id, user_id, role) values (v_c.id, v_uid, 'member');
  return v_c.id;
end;
$function$;

create or replace function public.titan_club_leave_v1(p_club uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_next uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select role into v_role from private.titan_club_members where club_id = p_club and user_id = v_uid;
  if v_role is null then return false; end if;
  delete from private.titan_club_members where club_id = p_club and user_id = v_uid;
  if v_role = 'admin' and not exists (select 1 from private.titan_club_members where club_id = p_club and role = 'admin') then
    select user_id into v_next from private.titan_club_members where club_id = p_club order by joined_at limit 1;
    if v_next is null then update private.titan_clubs set archived_at = now() where id = p_club;
    else update private.titan_club_members set role = 'admin' where club_id = p_club and user_id = v_next; end if;
  end if;
  return true;
end;
$function$;

create or replace function public.titan_club_set_v1(p_club uuid, p_name text, p_description text, p_discoverable boolean, p_new_code boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := private.titan_club_text(p_name, 60);
  v_desc text := private.titan_club_text(p_description, 300);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id
                  where m.club_id = p_club and m.user_id = v_uid and m.role = 'admin' and c.archived_at is null) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_edit', 60);
  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 60 then raise exception 'BAD_NAME' using errcode = '22023'; end if;
  if v_desc is not null and char_length(v_desc) > 300 then raise exception 'BAD_DESCRIPTION' using errcode = '22023'; end if;
  update private.titan_clubs set name = v_name, description = v_desc, discoverable = coalesce(p_discoverable, false),
    join_code = case when coalesce(p_new_code, false) then private.titan_club_code() else join_code end where id = p_club;
  return true;
end;
$function$;

create or replace function public.titan_club_announce_v1(p_club uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_body text := private.titan_club_text(p_body, 500);
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id
                  where m.club_id = p_club and m.user_id = v_uid and m.role = 'admin' and c.archived_at is null) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_announce', 30);
  if v_body is null or char_length(v_body) > 500 then raise exception 'BAD_ANNOUNCEMENT' using errcode = '22023'; end if;
  insert into private.titan_club_announcements (club_id, author_id, body) values (p_club, v_uid, v_body) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.titan_club_announce_remove_v1(p_announcement uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid(); v_club uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select club_id into v_club from private.titan_club_announcements where id = p_announcement;
  if v_club is null or not exists (select 1 from private.titan_club_members m where m.club_id = v_club and m.user_id = v_uid and m.role = 'admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  update private.titan_club_announcements set removed_at = now() where id = p_announcement and removed_at is null;
  return true;
end;
$function$;

-- Remove a member: they leave the club and cannot come back with the code. An administrator cannot remove themselves (they leave) nor another administrator.
create or replace function public.titan_club_member_remove_v1(p_club uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_club_members m where m.club_id = p_club and m.user_id = v_uid and m.role = 'admin') then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_moderate', 60);
  select role into v_role from private.titan_club_members where club_id = p_club and user_id = p_user;
  if v_role is null then return false; end if;
  if p_user = v_uid or v_role = 'admin' then raise exception 'CANNOT_REMOVE_ADMIN' using errcode = '22023'; end if;
  delete from private.titan_club_members where club_id = p_club and user_id = p_user;
  insert into private.titan_club_bans (club_id, user_id) values (p_club, p_user) on conflict do nothing;
  return true;
end;
$function$;

revoke all on function public.titan_club_create_v1(text, text, boolean), public.titan_club_my_v1(), public.titan_club_discover_v1(), public.titan_club_join_v1(text, uuid),
  public.titan_club_leave_v1(uuid), public.titan_club_set_v1(uuid, text, text, boolean, boolean), public.titan_club_announce_v1(uuid, text),
  public.titan_club_announce_remove_v1(uuid), public.titan_club_member_remove_v1(uuid, uuid) from public, anon;
grant execute on function public.titan_club_create_v1(text, text, boolean), public.titan_club_my_v1(), public.titan_club_discover_v1(), public.titan_club_join_v1(text, uuid),
  public.titan_club_leave_v1(uuid), public.titan_club_set_v1(uuid, text, text, boolean, boolean), public.titan_club_announce_v1(uuid, text),
  public.titan_club_announce_remove_v1(uuid), public.titan_club_member_remove_v1(uuid, uuid) to authenticated;

-- The export gains the account's own club memberships and announcements (the helper stays cumulative).
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
    'pioneer', coalesce((select jsonb_build_object('cohort', b.cohort, 'granted_at', b.granted_at) from private.titan_pioneers b where b.user_id = p_uid), 'null'::jsonb),
    'dailyIntents', coalesce((select jsonb_agg(jsonb_build_object('day', i.day, 'intent', i.intent, 'visibility', i.visibility, 'done_at', i.done_at) order by i.day)
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb),
    'commonQuests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', m.quest_id, 'week_start', q.week_start, 'joined_at', m.joined_at) order by m.joined_at)
                                from private.titan_common_quest_members m join private.titan_common_quests q on q.id = m.quest_id where m.user_id = p_uid), '[]'::jsonb),
    'buddies', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'role', case when b.inviter_id = p_uid then 'inviter' else 'invitee' end, 'status', b.status,
                           'starts_on', b.starts_on, 'ends_on', b.ends_on, 'ended_at', b.ended_at) order by b.created_at)
                           from private.titan_buddies b where p_uid in (b.inviter_id, b.invitee_id)), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('season_id', m.season_id, 'name', s.name, 'starts_on', s.starts_on, 'joined_at', m.joined_at,
                           'final_minutes', m.final_minutes, 'final_days', m.final_days) order by s.starts_on)
                           from private.titan_season_members m join private.titan_seasons s on s.id = m.season_id where m.user_id = p_uid), '[]'::jsonb),
    'rankingOptIn', coalesce((select jsonb_build_object('since', o.since) from private.titan_ranking_optin o where o.user_id = p_uid), 'null'::jsonb),
    'challengeResults', coalesce((select jsonb_agg(jsonb_build_object('challenge_id', r.challenge_id, 'final_progress', r.final_progress, 'reached', r.reached, 'frozen_at', r.frozen_at) order by r.frozen_at)
                                    from private.titan_challenge_results r where r.user_id = p_uid), '[]'::jsonb),
    'worldGoals', coalesce((select jsonb_agg(jsonb_build_object('goal_id', m.goal_id, 'starts_on', g.starts_on, 'ends_on', g.ends_on, 'joined_at', m.joined_at) order by m.joined_at)
                              from private.titan_world_goal_members m join private.titan_world_goals g on g.id = m.goal_id where m.user_id = p_uid), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('club_id', m.club_id, 'name', c.name, 'role', m.role, 'joined_at', m.joined_at) order by m.joined_at)
                         from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id where m.user_id = p_uid), '[]'::jsonb),
    'clubAnnouncements', coalesce((select jsonb_agg(jsonb_build_object('club_id', a.club_id, 'body', a.body, 'created_at', a.created_at, 'removed_at', a.removed_at) order by a.created_at)
                                     from private.titan_club_announcements a where a.author_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 24/33 : 20261030100000_club_reports.sql ========
-- V11-73 (COM-C8, moderation): a member reports an announcement or a club, the TITAN team reviews the report. Text written by other people
-- needs a way to be reported and a human decision (store policies on user-generated content ask for both). A report names the club, optionally one
-- announcement, a reason from a short list and at most 300 characters of explanation. Only a member of the club (or anyone, for a club that is open
-- to discovery) can report; one open report per account and target; 20 reports per hour. The team (profiles.role admin) lists the open reports with the
-- text concerned and decides: dismiss, remove the announcement, or archive the club. Reports are never shown to the club's administrators, nor to
-- the reported people. A reporter's identity is kept for the team only and removed (not the report) when the reporter erases their account.
-- Own reports are exported (extras helper, kept cumulative). Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_club_report_v1(uuid,uuid,text,text), public.titan_club_reports_admin_list_v1(), public.titan_club_report_resolve_v1(uuid,text,text);
-- drop table private.titan_club_reports; then re-apply the extras helper of migration 52 (20261030090000_clubs.sql).

create table if not exists private.titan_club_reports (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references private.titan_clubs(id) on delete cascade,
  announcement_id uuid references private.titan_club_announcements(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  details text check (details is null or char_length(details) <= 300),
  status text not null default 'open' check (status in ('open', 'dismissed', 'announcement_removed', 'club_archived')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  note text check (note is null or char_length(note) <= 300)
);
create unique index if not exists titan_club_reports_open_uniq on private.titan_club_reports (reporter_id, club_id, coalesce(announcement_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open' and reporter_id is not null;
create index if not exists titan_club_reports_status_idx on private.titan_club_reports (status, created_at);
alter table private.titan_club_reports enable row level security;
revoke all on private.titan_club_reports from public, anon, authenticated;

create or replace function public.titan_club_report_v1(p_club uuid, p_announcement uuid, p_reason text, p_details text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_details text := private.titan_club_text(p_details, 300);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_report', 20);
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'other') then raise exception 'BAD_REASON' using errcode = '22023'; end if;
  if v_details is not null and char_length(v_details) > 300 then raise exception 'BAD_DETAILS' using errcode = '22023'; end if;
  if not exists (select 1 from private.titan_clubs c where c.id = p_club and c.archived_at is null
                  and (c.discoverable or exists (select 1 from private.titan_club_members m where m.club_id = c.id and m.user_id = v_uid))) then
    raise exception 'CLUB_NOT_FOUND' using errcode = '22023';
  end if;
  if p_announcement is not null and not exists (select 1 from private.titan_club_announcements a where a.id = p_announcement and a.club_id = p_club and a.removed_at is null) then
    raise exception 'CLUB_NOT_FOUND' using errcode = '22023';
  end if;
  insert into private.titan_club_reports (club_id, announcement_id, reporter_id, reason, details)
  values (p_club, p_announcement, v_uid, p_reason, v_details) on conflict do nothing;
  return true;
end;
$function$;

create or replace function public.titan_club_reports_admin_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'clubId', r.club_id, 'club', c.name, 'announcementId', r.announcement_id, 'announcement', a.body,
             'reason', r.reason, 'details', r.details, 'at', r.created_at,
             'sameTarget', (select count(*) from private.titan_club_reports o where o.status = 'open' and o.club_id = r.club_id and o.announcement_id is not distinct from r.announcement_id)) order by r.created_at)
      from (select * from private.titan_club_reports where status = 'open' order by created_at limit 100) r
      join private.titan_clubs c on c.id = r.club_id left join private.titan_club_announcements a on a.id = r.announcement_id), '[]'::jsonb);
end;
$function$;

-- Decisions: dismiss | remove_announcement | archive_club. The decision closes every open report on the same target.
create or replace function public.titan_club_report_resolve_v1(p_report uuid, p_action text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_r private.titan_club_reports%rowtype;
  v_status text;
  v_note text := private.titan_club_text(p_note, 300);
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_action not in ('dismiss', 'remove_announcement', 'archive_club') then raise exception 'BAD_ACTION' using errcode = '22023'; end if;
  select * into v_r from private.titan_club_reports where id = p_report and status = 'open';
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode = '22023'; end if;
  if p_action = 'remove_announcement' and v_r.announcement_id is null then raise exception 'NO_ANNOUNCEMENT' using errcode = '22023'; end if;
  v_status := case p_action when 'dismiss' then 'dismissed' when 'remove_announcement' then 'announcement_removed' else 'club_archived' end;
  if p_action = 'remove_announcement' then update private.titan_club_announcements set removed_at = coalesce(removed_at, now()) where id = v_r.announcement_id; end if;
  if p_action = 'archive_club' then update private.titan_clubs set archived_at = coalesce(archived_at, now()) where id = v_r.club_id; end if;
  update private.titan_club_reports set status = v_status, handled_by = v_uid, handled_at = now(), note = v_note
   where status = 'open' and club_id = v_r.club_id and (id = v_r.id or (p_action <> 'dismiss' and announcement_id is not distinct from v_r.announcement_id) or p_action = 'archive_club');
  return true;
end;
$function$;

revoke all on function public.titan_club_report_v1(uuid, uuid, text, text), public.titan_club_reports_admin_list_v1(), public.titan_club_report_resolve_v1(uuid, text, text) from public, anon;
grant execute on function public.titan_club_report_v1(uuid, uuid, text, text), public.titan_club_reports_admin_list_v1(), public.titan_club_report_resolve_v1(uuid, text, text) to authenticated;

-- The export gains the reports the account filed (the helper stays cumulative).
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
    'pioneer', coalesce((select jsonb_build_object('cohort', b.cohort, 'granted_at', b.granted_at) from private.titan_pioneers b where b.user_id = p_uid), 'null'::jsonb),
    'dailyIntents', coalesce((select jsonb_agg(jsonb_build_object('day', i.day, 'intent', i.intent, 'visibility', i.visibility, 'done_at', i.done_at) order by i.day)
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb),
    'commonQuests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', m.quest_id, 'week_start', q.week_start, 'joined_at', m.joined_at) order by m.joined_at)
                                from private.titan_common_quest_members m join private.titan_common_quests q on q.id = m.quest_id where m.user_id = p_uid), '[]'::jsonb),
    'buddies', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'role', case when b.inviter_id = p_uid then 'inviter' else 'invitee' end, 'status', b.status,
                           'starts_on', b.starts_on, 'ends_on', b.ends_on, 'ended_at', b.ended_at) order by b.created_at)
                           from private.titan_buddies b where p_uid in (b.inviter_id, b.invitee_id)), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('season_id', m.season_id, 'name', s.name, 'starts_on', s.starts_on, 'joined_at', m.joined_at,
                           'final_minutes', m.final_minutes, 'final_days', m.final_days) order by s.starts_on)
                           from private.titan_season_members m join private.titan_seasons s on s.id = m.season_id where m.user_id = p_uid), '[]'::jsonb),
    'rankingOptIn', coalesce((select jsonb_build_object('since', o.since) from private.titan_ranking_optin o where o.user_id = p_uid), 'null'::jsonb),
    'challengeResults', coalesce((select jsonb_agg(jsonb_build_object('challenge_id', r.challenge_id, 'final_progress', r.final_progress, 'reached', r.reached, 'frozen_at', r.frozen_at) order by r.frozen_at)
                                    from private.titan_challenge_results r where r.user_id = p_uid), '[]'::jsonb),
    'worldGoals', coalesce((select jsonb_agg(jsonb_build_object('goal_id', m.goal_id, 'starts_on', g.starts_on, 'ends_on', g.ends_on, 'joined_at', m.joined_at) order by m.joined_at)
                              from private.titan_world_goal_members m join private.titan_world_goals g on g.id = m.goal_id where m.user_id = p_uid), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('club_id', m.club_id, 'name', c.name, 'role', m.role, 'joined_at', m.joined_at) order by m.joined_at)
                         from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id where m.user_id = p_uid), '[]'::jsonb),
    'clubAnnouncements', coalesce((select jsonb_agg(jsonb_build_object('club_id', a.club_id, 'body', a.body, 'created_at', a.created_at, 'removed_at', a.removed_at) order by a.created_at)
                                     from private.titan_club_announcements a where a.author_id = p_uid), '[]'::jsonb),
    'clubReports', coalesce((select jsonb_agg(jsonb_build_object('club_id', r.club_id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at) order by r.created_at)
                               from private.titan_club_reports r where r.reporter_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 25/33 : 20261030110000_factions_pantheon_trophies.sql ========
-- V11-74 (COM-D2, COM-D4, COM-D7): the three factions, the Pantheon of the Titans and the club trophies, with protective defaults.
-- FACTIONS: three identities (emblem, motto) that a player may join on purpose; distinct from the personal guild and from clubs. Rights before code:
--   one faction at a time, the first choice can be corrected once for free, then any further change (or a leave) waits 30 days so nobody hops to follow a score;
--   the contribution of a member counts only from the day they joined their current faction (normalized effort minutes, 90 a day at most), so a
--   switch never counts twice; a faction shows its number of members and its effort of the week only from five members, never a name or a share.
--   Names and mottos are placeholders for the lore, to be confirmed by the owner: they live in a table, not in the code.
-- PANTHEON: a gallery of dated distinctions that come from rules, never from a ranking: pioneer of TITAN, a season taken part in until its close,
--   a friendly challenge taken up and reached. Published only for an account that opted in, whose profile is public and not suspended; leaving
--   removes it at once; the team can hide an entry. No global ranking, no order by score: most recent first.
-- CLUB TROPHIES: cosmetic marks the team awards to a club (never bought, never transferred: one per club and key), visible to the members in the
--   club space with their date; they stay after a season closes and disappear with an archived club.
-- No XP, credit or advantage anywhere. Own faction and opt-in are exported (extras helper, kept cumulative) and erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_faction_v1(), public.titan_faction_choose_v1(text), public.titan_pantheon_v1(), public.titan_pantheon_set_v1(boolean),
-- public.titan_pantheon_moderate_v1(uuid,boolean), public.titan_club_admin_list_v1(), public.titan_club_trophy_award_v1(uuid,text,text,text),
-- public.titan_club_trophy_revoke_v1(uuid); drop tables private.titan_club_trophies, private.titan_pantheon_optin, private.titan_faction_members,
-- private.titan_factions; then re-apply titan_club_my_v1 of migration 52 and the extras helper of migration 53 (20261030100000_club_reports.sql).

create table if not exists private.titan_factions (
  key text primary key check (key ~ '^[a-z]{3,12}$'),
  name text not null check (char_length(name) between 3 and 60),
  motto text not null check (char_length(motto) between 3 and 120),
  emblem text not null check (emblem ~ '^[a-z]{3,20}$'),
  sort_order integer not null
);
insert into private.titan_factions (key, name, motto, emblem, sort_order) values
  ('aube', 'Les Veilleurs de l’Aube', 'Tenir la lumière, jour après jour.', 'sunrise', 1),
  ('forge', 'Les Forgerons', 'Bâtir l’effort, séance après séance.', 'anvil', 2),
  ('sentier', 'Les Arpenteurs du Sentier', 'Aller plus loin, à ton rythme.', 'path', 3)
on conflict (key) do nothing;
create table if not exists private.titan_faction_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  faction_key text references private.titan_factions(key),
  joined_at timestamptz not null default now(),
  changed_at timestamptz
);
create table if not exists private.titan_pantheon_optin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  since timestamptz not null default now(),
  hidden_by_team boolean not null default false
);
create table if not exists private.titan_club_trophies (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references private.titan_clubs(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9-]{3,40}$'),
  title text not null check (char_length(title) between 3 and 60),
  note text check (note is null or char_length(note) <= 200),
  awarded_on date not null default (now() at time zone 'Europe/Paris')::date,
  awarded_by uuid references auth.users(id) on delete set null,
  unique (club_id, key)
);
alter table private.titan_factions enable row level security;
alter table private.titan_faction_members enable row level security;
alter table private.titan_pantheon_optin enable row level security;
alter table private.titan_club_trophies enable row level security;
revoke all on private.titan_factions, private.titan_faction_members, private.titan_pantheon_optin, private.titan_club_trophies from public, anon, authenticated;

-- ---- FACTIONS
create or replace function public.titan_faction_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_from timestamptz := (date_trunc('week', now() at time zone 'Europe/Paris'))::timestamp at time zone 'Europe/Paris';
  v_to timestamptz := v_from + interval '7 days';
  v_me private.titan_faction_members%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_me from private.titan_faction_members where user_id = v_uid;
  return jsonb_build_object(
    'mine', v_me.faction_key,
    'joinedAt', case when v_me.faction_key is null then null else v_me.joined_at end,
    'canChangeAt', case when v_me.user_id is null or v_me.changed_at is null then null else greatest(v_me.changed_at + interval '30 days', now()) end,
    'factions', (select jsonb_agg(jsonb_build_object('key', f.key, 'name', f.name, 'motto', f.motto, 'emblem', f.emblem,
        'members', case when s.n >= 5 then s.n else null end,
        'minutes', case when s.n >= 5 then s.minutes else null end) order by f.sort_order)
      from private.titan_factions f
      cross join lateral (
        select (select count(*) from private.titan_faction_members m where m.faction_key = f.key)::integer as n,
               (select coalesce(sum(c.minutes), 0)::integer
                  from (select m.user_id, m.joined_at from private.titan_faction_members m where m.faction_key = f.key order by m.joined_at limit 5000) m
                  cross join lateral (select coalesce(sum(d.minutes), 0) as minutes from private.titan_effort_days(m.user_id, v_from, v_to, greatest(m.joined_at, v_from), 90) d) c) as minutes) s));
end;
$function$;

create or replace function public.titan_faction_choose_v1(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_me private.titan_faction_members%rowtype;
  v_unlock timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'faction', 20);
  if p_key is not null and not exists (select 1 from private.titan_factions where key = p_key) then raise exception 'FACTION_NOT_FOUND' using errcode = '22023'; end if;
  select * into v_me from private.titan_faction_members where user_id = v_uid for update;
  if not found then
    if p_key is null then return true; end if;
    insert into private.titan_faction_members (user_id, faction_key) values (v_uid, p_key);
    return true;
  end if;
  if v_me.faction_key is not distinct from p_key then return true; end if;
  v_unlock := case when v_me.changed_at is null then now() else v_me.changed_at + interval '30 days' end;
  if now() < v_unlock then
    raise exception 'FACTION_CHANGE_LOCKED' using errcode = '22023';
  end if;
  update private.titan_faction_members set faction_key = p_key, joined_at = now(), changed_at = now() where user_id = v_uid;
  return true;
end;
$function$;

-- ---- PANTHEON
create or replace function public.titan_pantheon_set_v1(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'pantheon', 30);
  if coalesce(p_on, false) then
    if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
    insert into private.titan_pantheon_optin (user_id) values (v_uid) on conflict do nothing;
  else
    delete from private.titan_pantheon_optin where user_id = v_uid;
  end if;
  return coalesce(p_on, false);
end;
$function$;

create or replace function public.titan_pantheon_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_mine private.titan_pantheon_optin%rowtype;
  v_public boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_admin := private.titan_is_admin(v_uid);
  select * into v_mine from private.titan_pantheon_optin where user_id = v_uid;
  select coalesce((p.privacy ->> 'publicProfile')::boolean, false) into v_public from public.profiles p where p.id = v_uid;
  return jsonb_build_object(
    'mine', v_mine.user_id is not null, 'hiddenByTeam', coalesce(v_mine.hidden_by_team, false), 'profilePublic', coalesce(v_public, false),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.name, 'kind', e.kind, 'label', e.label, 'at', e.at, 'me', e.user_id = v_uid,
               'userId', case when v_admin then e.user_id else null end) order by e.at desc, e.name, e.kind)
        from (
          select u.user_id, coalesce(nullif(p.username, ''), 'Athlète') as name, d.kind, d.label, d.at
            from private.titan_pantheon_optin u
            join public.profiles p on p.id = u.user_id and not coalesce(p.is_suspended, false) and coalesce((p.privacy ->> 'publicProfile')::boolean, false)
            cross join lateral (
              select 'pioneer'::text as kind, 'Pionnier de TITAN'::text as label, b.granted_at as at from private.titan_pioneers b where b.user_id = u.user_id
              union all
              select 'season', 'A mené ' || s.name || ' jusqu’au bout', (s.ends_on + 1)::timestamp at time zone 'Europe/Paris'
                from private.titan_season_members m join private.titan_seasons s on s.id = m.season_id where m.user_id = u.user_id and s.closed_at is not null and m.final_minutes is not null
              union all
              select 'challenge', 'A relevé un défi entre amis', r.frozen_at from private.titan_challenge_results r where r.user_id = u.user_id and r.reached
            ) d
           where not u.hidden_by_team or u.user_id = v_uid
           order by d.at desc limit 60) e), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_pantheon_moderate_v1(p_user uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  update private.titan_pantheon_optin set hidden_by_team = coalesce(p_hidden, false) where user_id = p_user;
  return found;
end;
$function$;

-- ---- CLUB TROPHIES
create or replace function public.titan_club_admin_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'members', (select count(*) from private.titan_club_members m where m.club_id = c.id),
             'trophies', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'on', t.awarded_on) order by t.awarded_on) from private.titan_club_trophies t where t.club_id = c.id), '[]'::jsonb)) order by c.created_at desc)
      from (select * from private.titan_clubs where archived_at is null order by created_at desc limit 100) c), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_club_trophy_award_v1(p_club uuid, p_key text, p_title text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_title text := private.titan_club_text(p_title, 60);
  v_id uuid;
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[a-z0-9-]{3,40}$' or v_title is null or char_length(v_title) < 3 or char_length(v_title) > 60 then raise exception 'BAD_TROPHY' using errcode = '22023'; end if;
  if not exists (select 1 from private.titan_clubs where id = p_club and archived_at is null) then raise exception 'CLUB_NOT_FOUND' using errcode = '22023'; end if;
  insert into private.titan_club_trophies (club_id, key, title, note, awarded_by)
  values (p_club, p_key, v_title, nullif(left(private.titan_club_text(p_note, 200), 200), ''), v_uid)
  on conflict (club_id, key) do nothing returning id into v_id;
  if v_id is null then raise exception 'TROPHY_ALREADY_AWARDED' using errcode = '22023'; end if;
  return v_id;
end;
$function$;

create or replace function public.titan_club_trophy_revoke_v1(p_trophy uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_club_trophies where id = p_trophy;
  return found;
end;
$function$;

-- The club space gains its trophies (same function as migration 52, one key more).
create or replace function public.titan_club_my_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'description', c.description, 'discoverable', c.discoverable, 'role', m.role, 'joinedAt', m.joined_at,
      'members', (select count(*) from private.titan_club_members x where x.club_id = c.id),
      'code', case when m.role = 'admin' then c.join_code else null end,
      'roster', case when m.role = 'admin' then coalesce((
          select jsonb_agg(jsonb_build_object('userId', x.user_id, 'name', coalesce(nullif(p.username, ''), 'Athlète'), 'role', x.role) order by x.joined_at)
            from (select * from private.titan_club_members where club_id = c.id order by joined_at limit 200) x left join public.profiles p on p.id = x.user_id), '[]'::jsonb) else null end,
      'trophies', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'note', t.note, 'on', t.awarded_on) order by t.awarded_on desc, t.title)
                              from private.titan_club_trophies t where t.club_id = c.id), '[]'::jsonb),
      'announcements', coalesce((
          select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'at', a.created_at, 'mine', a.author_id = v_uid) order by a.created_at desc)
            from (select * from private.titan_club_announcements where club_id = c.id and removed_at is null order by created_at desc limit 20) a), '[]'::jsonb))
      order by m.joined_at)
      from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id
     where m.user_id = v_uid and c.archived_at is null), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_faction_v1(), public.titan_faction_choose_v1(text), public.titan_pantheon_v1(), public.titan_pantheon_set_v1(boolean),
  public.titan_pantheon_moderate_v1(uuid, boolean), public.titan_club_admin_list_v1(), public.titan_club_trophy_award_v1(uuid, text, text, text),
  public.titan_club_trophy_revoke_v1(uuid) from public, anon;
grant execute on function public.titan_faction_v1(), public.titan_faction_choose_v1(text), public.titan_pantheon_v1(), public.titan_pantheon_set_v1(boolean),
  public.titan_pantheon_moderate_v1(uuid, boolean), public.titan_club_admin_list_v1(), public.titan_club_trophy_award_v1(uuid, text, text, text),
  public.titan_club_trophy_revoke_v1(uuid) to authenticated;

-- The export gains the faction and the Pantheon opt-in (the helper stays cumulative).
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
    'pioneer', coalesce((select jsonb_build_object('cohort', b.cohort, 'granted_at', b.granted_at) from private.titan_pioneers b where b.user_id = p_uid), 'null'::jsonb),
    'dailyIntents', coalesce((select jsonb_agg(jsonb_build_object('day', i.day, 'intent', i.intent, 'visibility', i.visibility, 'done_at', i.done_at) order by i.day)
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb),
    'commonQuests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', m.quest_id, 'week_start', q.week_start, 'joined_at', m.joined_at) order by m.joined_at)
                                from private.titan_common_quest_members m join private.titan_common_quests q on q.id = m.quest_id where m.user_id = p_uid), '[]'::jsonb),
    'buddies', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'role', case when b.inviter_id = p_uid then 'inviter' else 'invitee' end, 'status', b.status,
                           'starts_on', b.starts_on, 'ends_on', b.ends_on, 'ended_at', b.ended_at) order by b.created_at)
                           from private.titan_buddies b where p_uid in (b.inviter_id, b.invitee_id)), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('season_id', m.season_id, 'name', s.name, 'starts_on', s.starts_on, 'joined_at', m.joined_at,
                           'final_minutes', m.final_minutes, 'final_days', m.final_days) order by s.starts_on)
                           from private.titan_season_members m join private.titan_seasons s on s.id = m.season_id where m.user_id = p_uid), '[]'::jsonb),
    'rankingOptIn', coalesce((select jsonb_build_object('since', o.since) from private.titan_ranking_optin o where o.user_id = p_uid), 'null'::jsonb),
    'challengeResults', coalesce((select jsonb_agg(jsonb_build_object('challenge_id', r.challenge_id, 'final_progress', r.final_progress, 'reached', r.reached, 'frozen_at', r.frozen_at) order by r.frozen_at)
                                    from private.titan_challenge_results r where r.user_id = p_uid), '[]'::jsonb),
    'worldGoals', coalesce((select jsonb_agg(jsonb_build_object('goal_id', m.goal_id, 'starts_on', g.starts_on, 'ends_on', g.ends_on, 'joined_at', m.joined_at) order by m.joined_at)
                              from private.titan_world_goal_members m join private.titan_world_goals g on g.id = m.goal_id where m.user_id = p_uid), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('club_id', m.club_id, 'name', c.name, 'role', m.role, 'joined_at', m.joined_at) order by m.joined_at)
                         from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id where m.user_id = p_uid), '[]'::jsonb),
    'clubAnnouncements', coalesce((select jsonb_agg(jsonb_build_object('club_id', a.club_id, 'body', a.body, 'created_at', a.created_at, 'removed_at', a.removed_at) order by a.created_at)
                                     from private.titan_club_announcements a where a.author_id = p_uid), '[]'::jsonb),
    'clubReports', coalesce((select jsonb_agg(jsonb_build_object('club_id', r.club_id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at) order by r.created_at)
                               from private.titan_club_reports r where r.reporter_id = p_uid), '[]'::jsonb),
    'faction', coalesce((select jsonb_build_object('faction', f.faction_key, 'joined_at', f.joined_at, 'changed_at', f.changed_at) from private.titan_faction_members f where f.user_id = p_uid), 'null'::jsonb),
    'pantheon', coalesce((select jsonb_build_object('since', o.since) from private.titan_pantheon_optin o where o.user_id = p_uid), 'null'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 26/33 : 20261030120000_club_season_trophies.sql ========
-- V11-76 (COM-D7, automatic part): a club earns the trophy "A traversé <saison> ensemble" when a season has closed and enough of its members took
-- part in it. The rule is decided by the server from frozen season results and never from a claim: the club must have had at least three members who
-- joined the CLUB before the season ended and who took part in the season (final result frozen), and they must be at least half of the club's members
-- of that time (a club cannot recruit season participants afterwards to win it). One trophy per club and season (key "saison-<first Monday>"), awarded
-- once (the table's unique key), attributed to no person (awarded_by stays empty), cosmetic, never bought or transferred, hidden with an archived club.
-- The function is called by a member when their clubs load; it only looks at the clubs of the caller and at the last twelve closed seasons, and is
-- idempotent. No XP, credit or advantage. Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_club_trophy_sync_v1(); delete from private.titan_club_trophies where key like 'saison-%' and awarded_by is null.

create or replace function public.titan_club_trophy_sync_v1()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n integer := 0;
  v_s record;
  v_c record;
  v_added uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_trophy_sync', 60);
  for v_s in select s.id, s.name, s.starts_on, s.ends_on from private.titan_seasons s where s.closed_at is not null order by s.starts_on desc limit 12 loop
    for v_c in
      select c.id from private.titan_clubs c
       where c.archived_at is null
         and exists (select 1 from private.titan_club_members me where me.club_id = c.id and me.user_id = v_uid)
    loop
      if (select count(*) from private.titan_club_members m
            join private.titan_season_members sm on sm.user_id = m.user_id and sm.season_id = v_s.id and sm.final_minutes is not null
           where m.club_id = v_c.id and m.joined_at < (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris') >= 3
         and (select count(*) from private.titan_club_members m
                join private.titan_season_members sm on sm.user_id = m.user_id and sm.season_id = v_s.id and sm.final_minutes is not null
               where m.club_id = v_c.id and m.joined_at < (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris') * 2
             >= (select count(*) from private.titan_club_members m where m.club_id = v_c.id and m.joined_at < (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris')
      then
        insert into private.titan_club_trophies (club_id, key, title, note, awarded_on)
        values (v_c.id, 'saison-' || to_char(v_s.starts_on, 'YYYY-MM-DD'), left('A traversé ' || v_s.name || ' ensemble', 60), 'Attribué automatiquement.', v_s.ends_on)
        on conflict (club_id, key) do nothing returning id into v_added;
        if v_added is not null then v_n := v_n + 1; v_added := null; end if;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.titan_club_trophy_sync_v1() from public, anon;
grant execute on function public.titan_club_trophy_sync_v1() to authenticated;
