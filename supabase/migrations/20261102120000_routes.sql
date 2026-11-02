-- V11-83 (REC / GPS library): the athlete's private library of recorded routes. A route is the GPS trace of a session recorded with the native app, kept so it
-- can be seen again (map, distance, duration, climb) and exported as GPX on any device. PRIVATE BY CONSTRUCTION: the table has no API grant, every function reads
-- and writes only the caller's own rows, and NO function shares a route with anyone (no friend, club, coach or public access exists; a later sharing feature would
-- need its own explicit consent and start/end blurring). A route never creates XP, a credit or a reward: the session itself does, through the usual function.
-- IDEMPOTENT: the app picks a client route id; sending the same route twice (a lost answer, a retry) returns the first row and writes nothing. LIMITS: 200 routes per
-- account, 3,000 points and 256 KB per trace, 60 saves an hour. The trace is a compact JSON document {v, t0, segs:[[lat*1e5, lon*1e5, seconds since t0, altitude in dm|null]...]},
-- one segment per recording stretch (a pause is never bridged). Exported with the account, deleted with it, and deletable one by one.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_route_save_v1(text,text,timestamptz,integer,integer,integer,jsonb), public.titan_routes_v1(integer,timestamptz), public.titan_route_get_v1(uuid),
-- public.titan_route_delete_v1(uuid); drop table private.titan_routes; then re-apply the extras helper of migration 57 (20261102100000_coach_tools.sql).

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
  created_at timestamptz not null default now(),
  unique (user_id, client_route_id)
);
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
                                                       'ascentM', r.ascent_m, 'points', r.points) order by r.started_at desc)
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
  select jsonb_build_object('id', r.id, 'sport', r.sport, 'startedAt', r.started_at, 'distanceM', r.distance_m, 'durationS', r.duration_s, 'ascentM', r.ascent_m, 'points', r.points, 'track', r.track)
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

revoke all on function public.titan_route_save_v1(text, text, timestamptz, integer, integer, integer, jsonb), public.titan_routes_v1(integer, timestamptz),
  public.titan_route_get_v1(uuid), public.titan_route_delete_v1(uuid) from public, anon;
grant execute on function public.titan_route_save_v1(text, text, timestamptz, integer, integer, integer, jsonb), public.titan_routes_v1(integer, timestamptz),
  public.titan_route_get_v1(uuid), public.titan_route_delete_v1(uuid) to authenticated;

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
                          'ascent_m', r.ascent_m, 'points', r.points, 'track', r.track, 'created_at', r.created_at) order by r.started_at)
                          from private.titan_routes r where r.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
