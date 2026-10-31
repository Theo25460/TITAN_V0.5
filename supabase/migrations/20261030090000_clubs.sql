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
