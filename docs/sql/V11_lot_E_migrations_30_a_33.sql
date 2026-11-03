-- TITAN V1.1 — lot E : migrations 30 à 33 sur 33. Lots à exécuter DANS L'ORDRE A, B, C, D, E (Supabase > SQL Editor, un lot par exécution).
-- Détectées absentes en production le 3 novembre 2026. Additif ; une erreur annule tout le lot : corriger puis relancer ce lot.

-- ======== 30/33 : 20261102120000_routes.sql ========
-- V11-83 (REC / GPS library): the athlete's private library of recorded routes. A route is the GPS trace of a session recorded with the native app, kept so it
-- can be seen again (map, distance, duration, climb) and exported as GPX on any device. PRIVATE BY CONSTRUCTION: the table has no API grant, every function reads
-- and writes only the caller's own rows, and NO function shares a route with anyone (no friend, club, coach or public access exists; a later sharing feature would
-- need its own explicit consent and start/end blurring). A route never creates XP, a credit or a reward: the session itself does, through the usual function.
-- IDEMPOTENT: the app picks a client route id; sending the same route twice (a lost answer, a retry) returns the first row and writes nothing. LIMITS: 200 routes per
-- account, 3,000 points and 256 KB per trace, 60 saves an hour. The trace is a compact JSON document {v, t0, segs:[[lat*1e5, lon*1e5, seconds since t0, altitude in dm|null]...]},
-- one segment per recording stretch (a pause is never bridged). Exported with the account, deleted with it, and deletable one by one.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_route_save_v1(text,text,timestamptz,integer,integer,integer,jsonb), public.titan_routes_v1(integer,timestamptz), public.titan_route_get_v1(uuid),
-- public.titan_route_delete_v1(uuid), public.titan_route_link_v1(text,text), public.titan_route_for_event_v1(text); drop table private.titan_routes; then re-apply the extras helper of migration 57 (20261102100000_coach_tools.sql).

create table if not exists private.titan_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_route_id text not null check (client_route_id ~ '^[A-Za-z0-9_.:-]{8,64}$'),
  sport text not null,
  started_at timestamptz not null,
  distance_m integer not null check (distance_m between 0 and 2000000),
  duration_s integer not null check (duration_s between 0 and 172800),
  ascent_m integer check (ascent_m between 0 and 20000),
  points integer not null check (points between 2 and 3000),
  track jsonb not null,
  event_id text check (event_id is null or event_id ~ '^[A-Za-z0-9_.:-]{8,80}$'), -- client_event_id of the session saved from this recording (set once, by its owner)
  created_at timestamptz not null default now(),
  unique (user_id, client_route_id)
);
create index if not exists titan_routes_user_event_idx on private.titan_routes (user_id, event_id) where event_id is not null;
create index if not exists titan_routes_user_started_idx on private.titan_routes (user_id, started_at desc);
alter table private.titan_routes enable row level security;
revoke all on private.titan_routes from public, anon, authenticated;

create or replace function public.titan_route_save_v1(p_client_route_id text, p_sport text, p_started_at timestamptz, p_distance_m integer, p_duration_s integer, p_ascent_m integer, p_track jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_points integer := 0;
  v_seg jsonb;
  v_pt jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_client_route_id is null or p_client_route_id !~ '^[A-Za-z0-9_.:-]{8,64}$' then raise exception 'BAD_ROUTE_ID' using errcode = '22023'; end if;
  -- The same route sent again is answered from the first write, before any other check.
  select id into v_id from private.titan_routes where user_id = v_uid and client_route_id = p_client_route_id;
  if found then return jsonb_build_object('id', v_id, 'created', false); end if;
  perform private.titan_rate_limit(v_uid, 'route_save', 60);
  if not exists (select 1 from public.sports s where s.id = p_sport and coalesce(s.is_active, true)) then raise exception 'SPORT_UNKNOWN' using errcode = '22023'; end if;
  if p_started_at is null or p_started_at > now() + interval '1 day' or p_started_at < now() - interval '400 days' then raise exception 'BAD_START' using errcode = '22023'; end if;
  if jsonb_typeof(p_track) is distinct from 'object' or p_track -> 'v' is distinct from '1'::jsonb or jsonb_typeof(p_track -> 'segs') is distinct from 'array' then raise exception 'BAD_TRACK' using errcode = '22023'; end if;
  if octet_length(p_track::text) > 262144 then raise exception 'TRACK_TOO_LARGE' using errcode = '22023'; end if;
  if jsonb_array_length(p_track -> 'segs') not between 1 and 200 then raise exception 'BAD_TRACK' using errcode = '22023'; end if;
  for v_seg in select * from jsonb_array_elements(p_track -> 'segs') loop
    if jsonb_typeof(v_seg) is distinct from 'array' then raise exception 'BAD_TRACK' using errcode = '22023'; end if;
    for v_pt in select * from jsonb_array_elements(v_seg) loop
      if jsonb_typeof(v_pt) is distinct from 'array' or jsonb_array_length(v_pt) <> 4
         or jsonb_typeof(v_pt -> 0) is distinct from 'number' or jsonb_typeof(v_pt -> 1) is distinct from 'number' or jsonb_typeof(v_pt -> 2) is distinct from 'number'
         or abs((v_pt ->> 0)::numeric) > 9000000 or abs((v_pt ->> 1)::numeric) > 18000000 then raise exception 'BAD_TRACK' using errcode = '22023'; end if;
      v_points := v_points + 1;
      if v_points > 3000 then raise exception 'TRACK_TOO_LARGE' using errcode = '22023'; end if;
    end loop;
  end loop;
  if v_points < 2 then raise exception 'BAD_TRACK' using errcode = '22023'; end if;
  if (select count(*) from private.titan_routes where user_id = v_uid) >= 200 then raise exception 'ROUTE_LIMIT' using errcode = '22023'; end if;
  insert into private.titan_routes (user_id, client_route_id, sport, started_at, distance_m, duration_s, ascent_m, points, track)
  values (v_uid, p_client_route_id, p_sport, p_started_at, greatest(0, least(coalesce(p_distance_m, 0), 2000000)), greatest(0, least(coalesce(p_duration_s, 0), 172800)),
          case when p_ascent_m is null then null else greatest(0, least(p_ascent_m, 20000)) end, v_points, p_track)
  on conflict (user_id, client_route_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from private.titan_routes where user_id = v_uid and client_route_id = p_client_route_id;
    return jsonb_build_object('id', v_id, 'created', false);
  end if;
  return jsonb_build_object('id', v_id, 'created', true);
end;
$function$;

create or replace function public.titan_routes_v1(p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'sport', r.sport, 'startedAt', r.started_at, 'distanceM', r.distance_m, 'durationS', r.duration_s,
                                                       'ascentM', r.ascent_m, 'points', r.points, 'eventId', r.event_id) order by r.started_at desc)
                     from (select * from private.titan_routes where user_id = auth.uid() and (p_before is null or started_at < p_before)
                            order by started_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) r), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_route_get_v1(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select jsonb_build_object('id', r.id, 'sport', r.sport, 'startedAt', r.started_at, 'distanceM', r.distance_m, 'durationS', r.duration_s, 'ascentM', r.ascent_m, 'points', r.points, 'eventId', r.event_id, 'track', r.track)
    into v from private.titan_routes r where r.id = p_id and r.user_id = auth.uid();
  if v is null then raise exception 'ROUTE_NOT_FOUND' using errcode = '22023'; end if;
  return v;
end;
$function$;

create or replace function public.titan_route_delete_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_routes where id = p_id and user_id = auth.uid();
  return found;
end;
$function$;

-- AUTOMATIC LINK route <-> session: the app knows both ids once the session is saved. Linking is idempotent, owner-only, and can only point a route at ONE session
-- (a second, different link is refused, so a route can never be re-attached to inflate anything: it earns nothing anyway). A session can have one route.
create or replace function public.titan_route_link_v1(p_client_route_id text, p_event_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_current text; v_other uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_event_id is null or p_event_id !~ '^[A-Za-z0-9_.:-]{8,80}$' then raise exception 'BAD_EVENT_ID' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'route_link', 120);
  select event_id into v_current from private.titan_routes where user_id = v_uid and client_route_id = p_client_route_id for update;
  if not found then return false; end if;
  if v_current is not null then
    if v_current = p_event_id then return true; end if;
    raise exception 'ROUTE_ALREADY_LINKED' using errcode = '22023';
  end if;
  select id into v_other from private.titan_routes where user_id = v_uid and event_id = p_event_id;
  if found then raise exception 'SESSION_ALREADY_HAS_ROUTE' using errcode = '22023'; end if;
  update private.titan_routes set event_id = p_event_id where user_id = v_uid and client_route_id = p_client_route_id;
  return true;
end;
$function$;

create or replace function public.titan_route_for_event_v1(p_event_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select jsonb_build_object('id', r.id, 'sport', r.sport, 'startedAt', r.started_at, 'distanceM', r.distance_m, 'durationS', r.duration_s, 'ascentM', r.ascent_m, 'points', r.points, 'eventId', r.event_id)
    into v from private.titan_routes r where r.user_id = auth.uid() and r.event_id = p_event_id;
  return v; -- null when the session has no route
end;
$function$;

revoke all on function public.titan_route_save_v1(text, text, timestamptz, integer, integer, integer, jsonb), public.titan_routes_v1(integer, timestamptz),
  public.titan_route_get_v1(uuid), public.titan_route_delete_v1(uuid), public.titan_route_link_v1(text, text), public.titan_route_for_event_v1(text) from public, anon;
grant execute on function public.titan_route_save_v1(text, text, timestamptz, integer, integer, integer, jsonb), public.titan_routes_v1(integer, timestamptz),
  public.titan_route_get_v1(uuid), public.titan_route_delete_v1(uuid), public.titan_route_link_v1(text, text), public.titan_route_for_event_v1(text) to authenticated;

-- The export of the account carries the routes (cumulative redefinition: every earlier section is kept).
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
    'pantheon', coalesce((select jsonb_build_object('since', o.since) from private.titan_pantheon_optin o where o.user_id = p_uid), 'null'::jsonb),
    'coachTemplates', coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'sport', t.sport, 'instructions', t.instructions, 'updated_at', t.updated_at) order by t.updated_at)
                                 from private.titan_coach_templates t where t.coach_id = p_uid), '[]'::jsonb),
    'coachMessages', coalesce((select jsonb_agg(jsonb_build_object('link_id', m.link_id, 'sent', m.sender_id = p_uid, 'body', m.body, 'at', m.created_at) order by m.created_at)
                                 from private.titan_coach_messages m join public.coach_links l on l.id = m.link_id where p_uid in (l.coach_id, l.athlete_id)), '[]'::jsonb),
    'coachCheckins', coalesce((select jsonb_agg(jsonb_build_object('link_id', c.link_id, 'week', c.week_start, 'scores', c.scores, 'note', c.note, 'shared', c.shared) order by c.week_start)
                                 from private.titan_coach_checkins c join public.coach_links l on l.id = c.link_id where l.athlete_id = p_uid), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(jsonb_build_object('client_route_id', r.client_route_id, 'sport', r.sport, 'started_at', r.started_at, 'distance_m', r.distance_m, 'duration_s', r.duration_s,
                          'ascent_m', r.ascent_m, 'points', r.points, 'event_id', r.event_id, 'track', r.track, 'created_at', r.created_at) order by r.started_at)
                          from private.titan_routes r where r.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 31/33 : 20261102130000_legacy_social_privacy.sql ========
-- V1.1 FIN-SEC: close two legacy social RPC privacy bypasses.
-- Same signatures and API grants; no account/session rewrite. Caller owns transaction.
-- Search must respect the discovery consent already enforced by titan_social_request.
-- Lists must wait for friendship acceptance and fail closed for missing privacy flags.
-- No Supabase CLI is installed here; next unused UTC version follows routes at 20261102120000.
-- Rollback containment: revoke execute on function public.titan_find_profile_by_friend_code(text),
-- public.titan_list_my_friends() from authenticated; restoring old bodies reopens privacy leaks.

CREATE OR REPLACE FUNCTION public.titan_find_profile_by_friend_code(p_friend_code text)
 RETURNS TABLE(id uuid, username text, friend_code text, level integer, avatar text, is_elite boolean, is_suspended boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select p.id, p.username, p.friend_code,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then p.level else 1 end,
    p.avatar, p.is_elite, p.is_suspended
  from public.profiles p
  where p.friend_code = upper(trim(p_friend_code))
    and coalesce((p.privacy->>'publicProfile')::boolean, false)
    and not coalesce(p.is_suspended, false)
    and not exists (
      select 1 from public.titan_user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  limit 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.titan_list_my_friends()
 RETURNS TABLE(id uuid, username text, friend_code text, level integer, avatar text, is_elite boolean, is_suspended boolean, total_sessions integer, fav_sport text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  with friend_ids as (
    select case when f.user_id_1 = auth.uid() then f.user_id_2 else f.user_id_1 end as friend_id
    from public.friendships f
    where (f.user_id_1 = auth.uid() or f.user_id_2 = auth.uid())
      and coalesce(f.status, 'accepted') = 'accepted'
  ),
  sport_counts as (
    select tl.user_id, tl.sport, count(*) as n
    from public.training_logs tl
    join friend_ids fi on fi.friend_id = tl.user_id
    group by tl.user_id, tl.sport
  ),
  fav as (
    select distinct on (user_id) user_id, sport
    from sport_counts
    order by user_id, n desc, sport asc
  )
  select
    p.id,
    case when coalesce((p.privacy->>'publicProfile')::boolean, false) then p.username else 'Agent prive' end as username,
    case when coalesce((p.privacy->>'publicProfile')::boolean, false) then p.friend_code else null end as friend_code,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then p.level else 1 end as level,
    case when coalesce((p.privacy->>'publicProfile')::boolean, false) then p.avatar else null end as avatar,
    p.is_elite,
    p.is_suspended,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then count(tl.id)::integer else 0 end as total_sessions,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then fav.sport else null end as fav_sport
  from friend_ids f
  join public.profiles p on p.id = f.friend_id
  left join public.training_logs tl on tl.user_id = p.id
  left join fav on fav.user_id = p.id
  where private.titan_are_friends(auth.uid(), p.id)
    and coalesce(p.is_suspended, false) is false
    and not exists (
      select 1 from public.titan_user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and coalesce((p.privacy->>'socialPresence')::boolean, false) is true
  group by p.id, p.username, p.friend_code, p.level, p.avatar, p.is_elite, p.is_suspended, p.privacy, fav.sport
  order by p.level desc nulls last, p.username asc nulls last;
end;
$function$
;

-- ======== 32/33 : 20261102140000_adventure_encounters.sql ========
-- RPG-NEW-01..09. Additive adventure only: NEVER changes XP, credits or v300 effort.
-- Live budget = existing confirmed effort, capped90/day across all worlds. Candidate v2 is recorded only.
-- Six optional milestones/arc, three arcs/world; four existing worlds and nine chapters stay intact.
create table if not exists private.adventure_journeys (
 user_id uuid not null references auth.users(id) on delete cascade,
 world_id text not null references public.adventure_worlds(id), started_at timestamptz not null default clock_timestamp(),
 timezone text not null, target integer not null check(target between 15 and 45), baseline_rpe numeric not null,
 profile jsonb not null, primary key(user_id,world_id)
);
create table if not exists private.adventure_sensor_proofs (
 source_id uuid primary key references public.training_logs(id) on delete cascade,
 active_minutes numeric not null check(active_minutes between 0 and 1440),
 heart_rate_relative numeric check(heart_rate_relative between 0 and 1),
 provenance text not null check(provenance in ('garmin_verified','native_verified')),
 verified_at timestamptz not null default now()
);
-- Only a trusted ingestion backend may attest a sensor, never a details JSON flag.
grant select,insert,update,delete on private.adventure_sensor_proofs to service_role;
create table if not exists private.adventure_effort_ledger (
 user_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null references public.training_logs(id) on delete cascade,
 world_id text not null, day date not null, effort numeric not null check(effort between 0 and 90),
 candidate_v2 jsonb not null, family text not null, created_at timestamptz not null default now(),
 primary key(user_id,source_id), foreign key(user_id,world_id) references private.adventure_journeys(user_id,world_id) on delete cascade
);
create index if not exists adventure_effort_owner_day on private.adventure_effort_ledger(user_id,day);
create table if not exists private.adventure_encounter_rewards (
 user_id uuid not null, world_id text not null, ordinal integer not null check(ordinal between 1 and 18),
 choice integer check(choice in (0,1)), earned_at timestamptz not null default now(),
 primary key(user_id,world_id,ordinal),
 foreign key(user_id,world_id) references private.adventure_journeys(user_id,world_id) on delete cascade
);
create table if not exists private.adventure_family_rewards (
 user_id uuid not null references auth.users(id) on delete cascade, family text not null,
 earned_at timestamptz not null default now(), primary key(user_id,family)
);
alter table private.adventure_journeys enable row level security;
alter table private.adventure_sensor_proofs enable row level security;
alter table private.adventure_effort_ledger enable row level security;
alter table private.adventure_encounter_rewards enable row level security;
alter table private.adventure_family_rewards enable row level security;
revoke all on private.adventure_journeys,private.adventure_sensor_proofs,private.adventure_effort_ledger,
 private.adventure_encounter_rewards,private.adventure_family_rewards from public,anon,authenticated;

create or replace function private.titan_adventure_candidate_v2(p_minutes numeric,p_rpe numeric,p_baseline numeric,p_hr numeric,p_verified boolean)
returns jsonb language sql immutable security invoker set search_path='' as $$
 with factor as(select case when p_rpe between 1 and 10 then least(10,greatest(1,5+p_rpe-coalesce(p_baseline,5))) else 5 end as relative),
 score as(select 0.6+0.08*relative as rpe_factor from factor)
 select jsonb_build_object('version',2,'candidate',true,'active',false,
 'score',round(least(90,least(90,greatest(0,coalesce(p_minutes,0)))*case when p_verified and p_hr between 0 and 1
   then (rpe_factor+0.6+0.8*p_hr)/2 else rpe_factor end),1),
 'minutes',least(90,greatest(0,coalesce(p_minutes,0))),
 'provenance',case when p_verified then 'verified_sensor' when p_rpe between 1 and 10 then 'declared_rpe' else 'declared_duration' end) from score;
$$;
revoke all on function private.titan_adventure_candidate_v2(numeric,numeric,numeric,numeric,boolean) from public,anon,authenticated;

create or replace function public.titan_adventure_rpg_snapshot_v1(p_world text)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare u uuid:=auth.uid(); j private.adventure_journeys%rowtype; chapter integer; effort numeric; days integer; rewards jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=u and is_suspended is not true) then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 if not exists(select 1 from public.adventure_worlds where id=p_world) then raise exception 'INVALID_WORLD'; end if;
 select * into j from private.adventure_journeys where user_id=u and world_id=p_world;
 select coalesce(a.chapter,0) into chapter from public.adventure_progress a where a.user_id=u and a.world_id=p_world;
 select coalesce(sum(e.effort),0),count(distinct e.day) filter(where e.effort>0) into effort,days
 from private.adventure_effort_ledger e join public.training_logs l on l.id=e.source_id and l.user_id=e.user_id
 where e.user_id=u and e.world_id=p_world and l.archived_at is null and l.is_suspicious is not true
 and l.status not in ('rejected','flagged','pending_review') and l.details->>'serverReward'='true'
 and coalesce(l.details->>'historical','false')<>'true';
 select coalesce(jsonb_agg(jsonb_build_object('ordinal',r.ordinal,'choice',r.choice,'earnedAt',r.earned_at) order by r.ordinal),'[]')
 into rewards from private.adventure_encounter_rewards r where r.user_id=u and r.world_id=p_world;
 return jsonb_build_object('version',1,'owner',u,'world',p_world,'active',j.user_id is not null,
 'chapter',coalesce(chapter,0),'target',j.target,'profile',j.profile,'effort',effort,'days',days,'rewards',rewards,
 'curve',jsonb_build_object('live',1,'candidate',2,'candidateActive',false),
 'milestones',(select jsonb_agg(jsonb_build_object('ordinal',n,'arc',(n-1)/6+1,'chapter',(n+1)/2,
   'kind',(array['discovery','choice','monster','lore','treasure','miniboss'])[(n-1)%6+1],
   'effortTarget',n*j.target,'daysTarget',(n+1)/2,
   'ready',j.user_id is not null and coalesce(chapter,0)>=(n+1)/2 and effort>=n*j.target and days>=(n+1)/2
      and (n=1 or exists(select 1 from private.adventure_encounter_rewards r where r.user_id=u and r.world_id=p_world and r.ordinal=n-1)),
   'earned',exists(select 1 from private.adventure_encounter_rewards r where r.user_id=u and r.world_id=p_world and r.ordinal=n)) order by n) from generate_series(1,18)n),
 'familyTitles',coalesce((select jsonb_agg(jsonb_build_object('family',family,'earnedAt',earned_at) order by family)
 from private.adventure_family_rewards where user_id=u),'[]'));
end $$;
revoke all on function public.titan_adventure_rpg_snapshot_v1(text) from public,anon;
grant execute on function public.titan_adventure_rpg_snapshot_v1(text) to authenticated;

create or replace function public.titan_adventure_rpg_action_v1(p_world text,p_action text,p_ordinal integer default null,p_choice integer default null)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare u uuid:=auth.uid(); a public.adventure_progress%rowtype; j private.adventure_journeys%rowtype;
 l record; profile jsonb; baseline numeric; budget numeric; candidate jsonb; snapshot jsonb; target jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 -- Serialize per account: prevents duplicate rewards and double allocation across worlds/devices.
 perform 1 from public.profiles where id=u and is_suspended is not true for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 if p_action is null or p_action not in ('start','sync','claim') then raise exception 'INVALID_ACTION'; end if;
 select * into a from public.adventure_progress where user_id=u and world_id=p_world;
 if not found then raise exception 'CAMPAIGN_NOT_STARTED'; end if;
 if p_action='start' then
   profile:=private.titan_adventure_quest_profile(now(),a.timezone);
   -- At most one RPE observation per eligible day in the28-day profile.
   select percentile_cont(0.5) within group(order by rpe) into baseline from (
    select (date at time zone a.timezone)::date as day,avg(public.titan_numeric_from_json(coalesce(details->'bio',details),'rpe')) as rpe
    from public.training_logs where user_id=u and date>=now()-interval '28 days' and date<=now() and created_at<=now()
      and archived_at is null and is_suspicious is not true and status not in ('rejected','flagged','pending_review')
      and details->>'serverReward'='true' and coalesce(details->>'historical','false')<>'true'
    group by 1) daily where rpe between 1 and 10;
   insert into private.adventure_journeys(user_id,world_id,timezone,target,baseline_rpe,profile)
   values(u,p_world,a.timezone,(profile->>'effortTarget')::integer,coalesce(baseline,5),profile) on conflict do nothing;
 end if;
 select * into j from private.adventure_journeys where user_id=u and world_id=p_world;
 if not found then raise exception 'JOURNEY_NOT_STARTED'; end if;
 -- Import only confirmed, nonhistorical sessions created AFTER opt-in. Client cannot supply a score/source/owner.
 for l in select t.*,coalesce(s.category,'autre') as family,
    proof.active_minutes as verified_minutes,proof.heart_rate_relative as verified_hr,proof.source_id as proof_id
   from public.training_logs t left join public.sports s on s.id=t.sport
   left join private.adventure_sensor_proofs proof on proof.source_id=t.id
   where t.user_id=u and t.created_at>=j.started_at and t.date>=j.started_at and t.date<=now() and t.val>0
    and t.archived_at is null and t.is_suspicious is not true and t.status not in ('rejected','flagged','pending_review')
    and t.details->>'serverReward'='true' and coalesce(t.details->>'historical','false')<>'true'
    and not exists(select 1 from private.adventure_effort_ledger e where e.user_id=u and e.source_id=t.id)
   order by t.date,t.created_at,t.id
 loop
   select greatest(0,90-coalesce(sum(e.effort),0)) into budget from private.adventure_effort_ledger e
   where e.user_id=u and e.day=(l.date at time zone 'UTC')::date;
   candidate:=private.titan_adventure_candidate_v2(
     coalesce(l.verified_minutes,public.titan_numeric_from_json(l.details->'effort','minutes'),
       public.titan_numeric_from_json(public.titan_effort_v300(l.sport,l.unit,l.val,l.details),'minutes'),0),
     public.titan_numeric_from_json(coalesce(l.details->'bio',l.details),'rpe'),j.baseline_rpe,l.verified_hr,l.proof_id is not null);
   insert into private.adventure_effort_ledger(user_id,source_id,world_id,day,effort,candidate_v2,family)
   values(u,l.id,p_world,(l.date at time zone 'UTC')::date,
     least(budget,greatest(0,coalesce(public.titan_numeric_from_json(l.details->'effort','effort_minutes'),
       public.titan_numeric_from_json(public.titan_effort_v300(l.sport,l.unit,l.val,l.details),'effort_minutes'),0))),candidate,l.family)
   on conflict do nothing;
 end loop;
 insert into private.adventure_family_rewards(user_id,family)
 select u,e.family from private.adventure_effort_ledger e join public.training_logs t on t.id=e.source_id
 where e.user_id=u and e.effort>0 and t.archived_at is null and t.is_suspicious is not true
 and t.status not in ('rejected','flagged','pending_review') and t.details->>'serverReward'='true'
 group by e.family having count(distinct e.day)>=3 on conflict do nothing;
 if p_action='claim' then
   if p_ordinal is null or p_ordinal not between 1 and 18 then raise exception 'INVALID_MILESTONE'; end if;
   if exists(select 1 from private.adventure_encounter_rewards where user_id=u and world_id=p_world and ordinal=p_ordinal) then
     return public.titan_adventure_rpg_snapshot_v1(p_world); -- same ordinal retry never grants twice or changes choice
   end if;
   snapshot:=public.titan_adventure_rpg_snapshot_v1(p_world);
   select n into target from jsonb_array_elements(snapshot->'milestones')n where (n->>'ordinal')::integer=p_ordinal;
   if coalesce((target->>'ready')::boolean,false) is not true then raise exception 'ENCOUNTER_INCOMPLETE'; end if;
   if p_ordinal%6=2 and (p_choice is null or p_choice not in (0,1)) then raise exception 'INVALID_CHOICE'; end if;
   if p_ordinal%6<>2 and p_choice is not null then raise exception 'INVALID_CHOICE'; end if;
   insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice) values(u,p_world,p_ordinal,p_choice);
 end if;
 return public.titan_adventure_rpg_snapshot_v1(p_world);
end $$;
revoke all on function public.titan_adventure_rpg_action_v1(text,text,integer,integer) from public,anon;
grant execute on function public.titan_adventure_rpg_action_v1(text,text,integer,integer) to authenticated;

-- Trusted ingestion integration only. A client cannot attest its own HR/duration or spoof provenance in details.
create or replace function public.titan_adventure_attest_sensor_v1(p_source_id uuid,p_active_minutes numeric,p_hr_relative numeric,p_provenance text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_source_id is null or p_active_minutes is null or p_active_minutes not between 0 and 1440
 or (p_hr_relative is not null and p_hr_relative not between 0 and 1)
 or p_provenance is null or p_provenance not in ('garmin_verified','native_verified') then raise exception 'INVALID_SENSOR_PROOF'; end if;
 if not exists(select 1 from public.training_logs where id=p_source_id and details->>'serverReward'='true') then raise exception 'CONFIRMED_SOURCE_REQUIRED'; end if;
 insert into private.adventure_sensor_proofs(source_id,active_minutes,heart_rate_relative,provenance)
 values(p_source_id,p_active_minutes,p_hr_relative,p_provenance)
 on conflict(source_id) do update set active_minutes=excluded.active_minutes,heart_rate_relative=excluded.heart_rate_relative,
 provenance=excluded.provenance,verified_at=now();
end $$;
revoke all on function public.titan_adventure_attest_sensor_v1(uuid,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.titan_adventure_attest_sensor_v1(uuid,numeric,numeric,text) to service_role;

-- Preserve every previous account-export section; append the optional RPG journal.
do $$begin
 if to_regprocedure('private.titan_export_extras_before_rpg_v1(uuid)') is null then
  alter function private.titan_export_extras_v1(uuid) rename to titan_export_extras_before_rpg_v1;
 end if;
end $$;
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select private.titan_export_extras_before_rpg_v1(p_uid)||jsonb_build_object('adventureRpg',jsonb_build_object(
 'journeys',coalesce((select jsonb_agg(to_jsonb(j)-'user_id') from private.adventure_journeys j where user_id=p_uid),'[]'),
 'effort',coalesce((select jsonb_agg(to_jsonb(e)-'user_id') from private.adventure_effort_ledger e where user_id=p_uid),'[]'),
 'encounters',coalesce((select jsonb_agg(to_jsonb(r)-'user_id') from private.adventure_encounter_rewards r where user_id=p_uid),'[]'),
 'familyTitles',coalesce((select jsonb_agg(to_jsonb(f)-'user_id') from private.adventure_family_rewards f where user_id=p_uid),'[]')));
$$;
revoke all on function private.titan_export_extras_before_rpg_v1(uuid),private.titan_export_extras_v1(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';

-- ======== 33/33 : 20261102150000_session_hold_edits.sql ========
-- Timed-set corrections: replace latest body, preserving owner/revision/reward and metric contracts.
create or replace function private.titan_update_training_session(p_id uuid,p_revision integer,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
 u uuid:=auth.uid();l public.training_logs%rowtype;v public.training_logs%rowtype;
 ex jsonb;s jsonb;all_ex jsonb:='[]';rows jsonb;clean_rows jsonb;
 weight numeric;reps numeric;rir numeric;volume numeric;total_reps numeric;max_weight numeric;total_volume numeric:=0;all_reps numeric:=0;
 extra record;clean_extras jsonb;
 kind text;seconds numeric;hold_seconds numeric;all_hold_seconds numeric:=0;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into l from public.training_logs where id=p_id and user_id=u for update;
 if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
 if p_revision is null or l.revision<>p_revision then raise exception 'SESSION_VERSION_CONFLICT' using errcode='40001'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>100000 then raise exception 'PATCH_INVALID' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('val','date','note','duration','archived','exercises','extras')) then raise exception 'PATCH_INVALID' using errcode='22023';end if;
 v:=l;
 if p_patch ? 'val' then
  if jsonb_typeof(p_patch->'val')<>'number' then raise exception 'SESSION_INVALID' using errcode='22023'; end if;
  v.val:=(p_patch->>'val')::numeric;
  if jsonb_typeof(l.details->'exercises')='array' and jsonb_array_length(l.details->'exercises')>0 and v.val<>l.val then
   raise exception 'EXERCISE_VOLUME_READ_ONLY' using errcode='22023';end if;
  v.details:=jsonb_set(coalesce(v.details,'{}'),'{val1}',to_jsonb(v.val));
 end if;
 if p_patch ? 'exercises' then
  if jsonb_typeof(l.details->'exercises') is distinct from 'array' or jsonb_array_length(l.details->'exercises')=0 then raise exception 'EXERCISE_SESSION_REQUIRED';end if;
  if jsonb_typeof(p_patch->'exercises') is distinct from 'array' or jsonb_array_length(p_patch->'exercises') not between 1 and 30 then raise exception 'EXERCISES_INVALID';end if;
  for ex in select value from jsonb_array_elements(p_patch->'exercises') loop
   if jsonb_typeof(ex)<>'object' or jsonb_typeof(ex->'name') is distinct from 'string' or length(trim(ex->>'name')) not between 1 and 120 then raise exception 'EXERCISE_NAME_INVALID';end if;
   kind:=coalesce(ex->>'kind','weighted');
   if kind not in ('weighted','bodyweight','hold') then raise exception 'EXERCISE_KIND_INVALID';end if;
   rows:=ex->'setRows';
   if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 30 then raise exception 'SETS_INVALID';end if;
   clean_rows:='[]';volume:=0;total_reps:=0;max_weight:=0;hold_seconds:=0;
   for s in select value from jsonb_array_elements(rows) loop
    if jsonb_typeof(s->'weight') is distinct from 'number' then raise exception 'SET_INVALID';end if;
    weight:=(s->>'weight')::numeric;rir:=null;
    if weight<0 or weight>1000 then raise exception 'SET_INVALID';end if;
    if kind='hold' then
     if jsonb_typeof(s->'seconds') is distinct from 'number' then raise exception 'SET_INVALID';end if;
     seconds:=(s->>'seconds')::numeric;
     if seconds<1 or seconds>3600 or seconds<>trunc(seconds) then raise exception 'SET_INVALID';end if;
     if s ? 'reps' and s->'reps'<>'null'::jsonb and s->'reps'<>'1'::jsonb then raise exception 'SET_INVALID';end if;
     clean_rows:=clean_rows||jsonb_build_array(jsonb_build_object('weight',weight,'seconds',seconds,'rir',null));
     hold_seconds:=hold_seconds+seconds;
    else
     if jsonb_typeof(s->'reps') is distinct from 'number' or (s ? 'seconds' and s->'seconds'<>'null'::jsonb) then raise exception 'SET_INVALID';end if;
     reps:=(s->>'reps')::numeric;
     if reps<1 or reps>500 or reps<>trunc(reps) then raise exception 'SET_INVALID';end if;
     if s ? 'rir' and s->'rir'<>'null'::jsonb then
       if jsonb_typeof(s->'rir') is distinct from 'number' then raise exception 'RIR_INVALID';end if;
       rir:=(s->>'rir')::numeric;if rir<0 or rir>10 then raise exception 'RIR_INVALID';end if;
     end if;
     clean_rows:=clean_rows||jsonb_build_array(jsonb_build_object('weight',weight,'reps',reps,'rir',rir));
     volume:=volume+weight*reps;total_reps:=total_reps+reps;
    end if;
    max_weight:=greatest(max_weight,weight);
   end loop;
   all_ex:=all_ex||jsonb_build_array(jsonb_build_object('name',left(trim(ex->>'name'),120),'variant',left(coalesce(ex->>'variant',''),100),
     'equipment',left(coalesce(ex->>'equipment',''),100),'kind',kind,'holdSeconds',hold_seconds,'setRows',clean_rows,'sets',jsonb_array_length(clean_rows),'volume',volume,'totalReps',total_reps,
     'weight',max_weight,'reps',round(total_reps/jsonb_array_length(clean_rows)),'rir',null));
   total_volume:=total_volume+volume;all_reps:=all_reps+total_reps;all_hold_seconds:=all_hold_seconds+hold_seconds;
  end loop;
  v.val:=case when total_volume>0 then total_volume when all_reps>0 then all_reps else round(all_hold_seconds/60,2) end;
  v.unit:=case when total_volume>0 then 'kg' when all_reps>0 then 'reps' else 'min' end;
  v.details:=jsonb_set(jsonb_set(jsonb_set(v.details,'{exercises}',all_ex),'{val1}',to_jsonb(v.val)),'{unitOverride}',to_jsonb(v.unit));
 end if;
 if p_patch ? 'extras' then
  v.details:=jsonb_set(v.details,'{extras}',private.titan_merge_session_metrics_v1(l.sport,coalesce(v.details->'extras','{}'::jsonb),p_patch->'extras'));
 end if;
 if p_patch ? 'date' then v.date:=(p_patch->>'date')::timestamptz;v.details:=jsonb_set(v.details,'{performedAt}',coalesce(to_jsonb(v.date),'null'::jsonb));end if;
 if p_patch ? 'note' then
  if jsonb_typeof(p_patch->'note')<>'string' then raise exception 'NOTE_INVALID' using errcode='22023';end if;
  v.details:=jsonb_set(v.details,'{note}',to_jsonb(left(p_patch->>'note',2000)));
 end if;
 if p_patch ? 'duration' then
  if p_patch->'duration'='null'::jsonb and v.unit not in ('min','h') then
   v.details:=v.details-'duration'-'val2';
   if jsonb_typeof(v.details->'gpxStats')='object' then v.details:=jsonb_set(v.details,'{gpxStats}',(v.details->'gpxStats')-'movingMinutes');end if;
  else
   if jsonb_typeof(p_patch->'duration')<>'number' then raise exception 'DURATION_INVALID' using errcode='22023';end if;
   if (p_patch->>'duration')::numeric<=0 or (p_patch->>'duration')::numeric>1440 then raise exception 'DURATION_INVALID' using errcode='22023';end if;
   v.details:=jsonb_set(jsonb_set(v.details,'{val2}',p_patch->'duration'),'{duration}',p_patch->'duration');
  end if;
 end if;
 if v.unit in ('min','h') and (p_patch ? 'val' or p_patch ? 'duration') then
  v.details:=jsonb_set(jsonb_set(v.details,'{duration}',to_jsonb(v.val*case when v.unit='h' then 60 else 1 end)),'{val2}',to_jsonb(v.val*case when v.unit='h' then 60 else 1 end));end if;
 if p_patch ?| array['val','duration','exercises','extras'] then v.details:=v.details-'summary';end if;
 if p_patch ? 'archived' then
  if jsonb_typeof(p_patch->'archived')<>'boolean' then raise exception 'ARCHIVE_INVALID' using errcode='22023';end if;
  v.archived_at:=case when (p_patch->>'archived')::boolean then now() else null end;
 end if;
 if v.val is null or v.val<=0 or v.val>300000 or v.date is null or v.date>now()+interval '10 minutes' then raise exception 'SESSION_INVALID' using errcode='22023';end if;
 insert into public.training_revisions(user_id,log_id,snapshot) values(u,l.id,to_jsonb(l));
 update public.training_logs set val=v.val,unit=v.unit,date=v.date,details=v.details,archived_at=v.archived_at,revision=l.revision+1 where id=l.id returning * into v;
 if v.revision<>l.revision+1 then raise exception 'SESSION_REJECTED' using errcode='23514';end if;
 return to_jsonb(v);
end $$;
revoke all on function private.titan_update_training_session(uuid,integer,jsonb) from public,anon;
grant execute on function private.titan_update_training_session(uuid,integer,jsonb) to authenticated;
