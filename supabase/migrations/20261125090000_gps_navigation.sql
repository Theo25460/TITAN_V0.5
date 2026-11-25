-- V1.7.7 — GPS et navigation sportive (25 November 2026). NOT APPLIED IN PRODUCTION — needs the owner's approval (bundle supabase/release-v25, after v24).
-- 1. ROUTE LIBRARY v2. private.titan_routes gains three columns: « name » (the athlete's own title, 80 characters at most), « origin »
--    ('recorded' with the GPS, 'imported' from a file, 'planned' on a map; every existing row is 'recorded') and « summary » (the digest of
--    the GPS engine, js/core/gps-engine.js: {v, rules, family, autoPause, elapsedS, movingS, stoppedS, pausedS, missingS, distanceM,
--    gapDistanceM, ascentM, descentM, altitude, points, rejected}; a flat object of 2 kB at most). titan_route_save_v2 saves through
--    titan_route_save_v1 (same validation, same idempotency by client id, same 200 routes, 3,000 points, 256 KB and 60 saves an hour) and
--    writes the three columns only when the row was created; titan_routes_v2 and titan_route_get_v2 read them; titan_route_rename_v1
--    renames (an empty name clears it). The v1 functions are NOT touched: the published clients call them, and a route they save reads
--    through v2 with origin 'recorded'. A route still never creates XP, a credit or a reward.
-- 2. PERSONAL POINTS. private.titan_places: a water point, a shelter, a bike workshop the athlete wants to find again (name, kind,
--    position, a note of 200 characters). 300 points per account, 600 saves an hour. PRIVATE BY CONSTRUCTION, like the routes: the table
--    has no API grant, every function reads and writes only the caller's own rows, and NO function shares a point with anyone. A point
--    is saved under a client id: the same id sent again updates the point (a phone that was offline replays safely).
-- 3. QUOTAS of the two Netlify functions that call an outside service (functions/route-plan.mjs, functions/poi-nearby.mjs): 30 route
--    computations an hour and 150 a day, 60 point searches an hour and 300 a day, per account. The function asks with the athlete's own
--    token and gets true or false; a refusal records nothing. Counted in private.titan_rate_events (emptied after a day, erased with the
--    account); no signal is sent to moderation, a quota reached here is not a suspicion.
-- 4. ACCOUNT EXPORT. « Exporter toutes mes données » carries the points ('places') and the three new columns inside 'routes'.
-- PRIVACY: names, notes and positions are the athlete's own text and places; they are returned as text (the clients escape them),
-- exported with the account, erased with it (on delete cascade) and deletable one by one. Nothing here is sent to an outside service.
-- No feature flag is created by a migration (docs/FEATURE_FLAGS.md): the owner creates « screens.gps » when the screens may open.
-- Additive and idempotent. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_route_save_v2(text,text,timestamptz,integer,integer,integer,jsonb,text,text,jsonb), public.titan_routes_v2(integer,timestamptz),
-- public.titan_route_get_v2(uuid), public.titan_route_rename_v1(uuid,text), public.titan_place_save_v1(text,text,text,double precision,double precision,text),
-- public.titan_places_v1(), public.titan_place_delete_v1(uuid), public.titan_route_plan_quota_v1(), public.titan_poi_quota_v1(),
-- private.titan_quota_take_v1(uuid,text,integer,integer), private.titan_clean_label_v1(text,integer); re-create private.titan_export_extras_v1 as in
-- 20261117160000_life_chapters.sql; drop table private.titan_places; alter table private.titan_routes drop column summary, drop column origin, drop column name.

alter table private.titan_routes add column if not exists name text check (name is null or char_length(name) between 1 and 80);
alter table private.titan_routes add column if not exists origin text not null default 'recorded' check (origin in ('recorded', 'imported', 'planned'));
alter table private.titan_routes add column if not exists summary jsonb check (summary is null or (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 2048));

create table if not exists private.titan_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_place_id text not null check (client_place_id ~ '^[A-Za-z0-9_.:-]{8,64}$'),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('water', 'toilets', 'shelter', 'bike_repair', 'food', 'viewpoint', 'parking', 'other')),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_place_id)
);
alter table private.titan_places enable row level security;
revoke all on private.titan_places from public, anon, authenticated;

-- A name or a note as it is kept: control characters become spaces, runs of white space become one, both ends trimmed, cut to p_max.
create or replace function private.titan_clean_label_v1(p_text text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.btrim(pg_catalog.substr(pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 1, p_max));
$function$;
revoke all on function private.titan_clean_label_v1(text, integer) from public, anon, authenticated;

-- One use of a quota, or false when the hour or the day is full. A refusal writes nothing. p_day null: no daily ceiling.
create or replace function private.titan_quota_take_v1(p_user uuid, p_bucket text, p_hour integer, p_day integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_hour integer; v_day integer;
begin
  if p_user is null then return false; end if;
  -- Serialise the attempts of one account on one bucket: two parallel calls cannot both take the last place.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text || ':' || p_bucket, 0));
  delete from private.titan_rate_events where user_id = p_user and at < now() - interval '1 day';
  select count(*) filter (where at > now() - interval '1 hour'), count(*) into v_hour, v_day
    from private.titan_rate_events where user_id = p_user and bucket = p_bucket and at > now() - interval '1 day';
  if v_hour >= p_hour or (p_day is not null and v_day >= p_day) then return false; end if;
  insert into private.titan_rate_events(user_id, bucket) values (p_user, p_bucket);
  return true;
end;
$function$;
revoke all on function private.titan_quota_take_v1(uuid, text, integer, integer) from public, anon, authenticated;

create or replace function public.titan_route_plan_quota_v1()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return private.titan_quota_take_v1(auth.uid(), 'route_plan', 30, 150);
end;
$function$;

create or replace function public.titan_poi_quota_v1()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return private.titan_quota_take_v1(auth.uid(), 'poi_nearby', 60, 300);
end;
$function$;

-- Saved through v1: one validation, one idempotency rule and one set of limits for both versions. The name, the origin and the summary
-- are checked BEFORE v1 writes, and written only on the row this call created: a replay never changes a route already kept.
create or replace function public.titan_route_save_v2(p_client_route_id text, p_sport text, p_started_at timestamptz, p_distance_m integer, p_duration_s integer, p_ascent_m integer,
  p_track jsonb, p_name text default null, p_origin text default 'recorded', p_summary jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_origin text := coalesce(p_origin, 'recorded');
  v_name text;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_origin not in ('recorded', 'imported', 'planned') then raise exception 'BAD_ORIGIN' using errcode = '22023'; end if;
  -- A title is trimmed and cut to 80; a text far beyond a title is not a title and is refused rather than silently cut.
  if char_length(coalesce(p_name, '')) > 200 then raise exception 'BAD_NAME' using errcode = '22023'; end if;
  v_name := nullif(private.titan_clean_label_v1(p_name, 80), '');
  if p_summary is not null and (jsonb_typeof(p_summary) is distinct from 'object' or octet_length(p_summary::text) > 2048
     or jsonb_typeof(p_summary -> 'v') is distinct from 'number'
     or exists (select 1 from jsonb_each(p_summary) e where jsonb_typeof(e.value) in ('object', 'array'))) then
    raise exception 'BAD_SUMMARY' using errcode = '22023';
  end if;
  v_result := public.titan_route_save_v1(p_client_route_id, p_sport, p_started_at, p_distance_m, p_duration_s, p_ascent_m, p_track);
  if (v_result ->> 'created')::boolean then
    update private.titan_routes set name = v_name, origin = v_origin, summary = p_summary where id = (v_result ->> 'id')::uuid and user_id = v_uid;
  end if;
  return v_result;
end;
$function$;

create or replace function public.titan_routes_v2(p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'sport', r.sport, 'startedAt', r.started_at, 'distanceM', r.distance_m, 'durationS', r.duration_s,
                                                       'ascentM', r.ascent_m, 'points', r.points, 'eventId', r.event_id,
                                                       'name', r.name, 'origin', r.origin, 'summary', r.summary) order by r.started_at desc)
                     from (select * from private.titan_routes where user_id = auth.uid() and (p_before is null or started_at < p_before)
                            order by started_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) r), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_route_get_v2(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select jsonb_build_object('id', r.id, 'sport', r.sport, 'startedAt', r.started_at, 'distanceM', r.distance_m, 'durationS', r.duration_s, 'ascentM', r.ascent_m, 'points', r.points, 'eventId', r.event_id,
                            'name', r.name, 'origin', r.origin, 'summary', r.summary, 'track', r.track)
    into v from private.titan_routes r where r.id = p_id and r.user_id = auth.uid();
  if v is null then raise exception 'ROUTE_NOT_FOUND' using errcode = '22023'; end if;
  return v;
end;
$function$;

create or replace function public.titan_route_rename_v1(p_id uuid, p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if char_length(coalesce(p_name, '')) > 200 then raise exception 'BAD_NAME' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'route_rename', 120);
  update private.titan_routes set name = nullif(private.titan_clean_label_v1(p_name, 80), '') where id = p_id and user_id = v_uid;
  return found;
end;
$function$;

create or replace function public.titan_place_save_v1(p_client_place_id text, p_name text, p_kind text, p_lat double precision, p_lon double precision, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_note text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_client_place_id is null or p_client_place_id !~ '^[A-Za-z0-9_.:-]{8,64}$' then raise exception 'BAD_PLACE_ID' using errcode = '22023'; end if;
  if p_kind is null or p_kind not in ('water', 'toilets', 'shelter', 'bike_repair', 'food', 'viewpoint', 'parking', 'other') then raise exception 'BAD_KIND' using errcode = '22023'; end if;
  -- NaN and the infinities compare above every number: « between » refuses them with the rest.
  if p_lat is null or p_lon is null or not (p_lat between -90 and 90) or not (p_lon between -180 and 180) then raise exception 'BAD_POSITION' using errcode = '22023'; end if;
  if char_length(coalesce(p_name, '')) > 200 or char_length(coalesce(p_note, '')) > 1000 then raise exception 'BAD_NAME' using errcode = '22023'; end if;
  v_name := private.titan_clean_label_v1(p_name, 60);
  v_note := private.titan_clean_label_v1(p_note, 200);
  if v_name = '' then raise exception 'BAD_NAME' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'place_save', 600);
  -- One account at a time: the ceiling is counted and the point written without another save in between.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('titan_place:' || v_uid::text, 0));
  update private.titan_places set name = v_name, kind = p_kind, lat = p_lat, lon = p_lon, note = v_note, updated_at = now()
   where user_id = v_uid and client_place_id = p_client_place_id returning id into v_id;
  if found then return jsonb_build_object('id', v_id, 'created', false); end if;
  if (select count(*) from private.titan_places where user_id = v_uid) >= 300 then raise exception 'PLACE_LIMIT' using errcode = '22023'; end if;
  insert into private.titan_places (user_id, client_place_id, name, kind, lat, lon, note) values (v_uid, p_client_place_id, v_name, p_kind, p_lat, p_lon, v_note)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'created', true);
end;
$function$;

create or replace function public.titan_places_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'clientPlaceId', p.client_place_id, 'name', p.name, 'kind', p.kind, 'lat', p.lat, 'lon', p.lon,
                                                       'note', p.note, 'updatedAt', p.updated_at) order by p.updated_at desc, p.id)
                     from private.titan_places p where p.user_id = auth.uid()), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_place_delete_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_places where id = p_id and user_id = auth.uid();
  return found;
end;
$function$;

revoke all on function public.titan_route_save_v2(text, text, timestamptz, integer, integer, integer, jsonb, text, text, jsonb), public.titan_routes_v2(integer, timestamptz),
  public.titan_route_get_v2(uuid), public.titan_route_rename_v1(uuid, text), public.titan_place_save_v1(text, text, text, double precision, double precision, text),
  public.titan_places_v1(), public.titan_place_delete_v1(uuid), public.titan_route_plan_quota_v1(), public.titan_poi_quota_v1() from public, anon;
grant execute on function public.titan_route_save_v2(text, text, timestamptz, integer, integer, integer, jsonb, text, text, jsonb), public.titan_routes_v2(integer, timestamptz),
  public.titan_route_get_v2(uuid), public.titan_route_rename_v1(uuid, text), public.titan_place_save_v1(text, text, text, double precision, double precision, text),
  public.titan_places_v1(), public.titan_place_delete_v1(uuid), public.titan_route_plan_quota_v1(), public.titan_poi_quota_v1() to authenticated;

-- The export of the account carries the points and the new columns of the routes (cumulative redefinition: every earlier section is
-- kept; « routes » is written again here with its earlier keys and the three new ones, and replaces the one of the inner layer).
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.titan_export_extras_before_cadence_v1(p_uid) || jsonb_build_object(
    'cadenceWeekClaims', coalesce((
      select jsonb_agg(jsonb_build_object('week', c.week_start, 'days', c.days, 'target', c.target, 'credits', c.credits, 'claimed_at', c.claimed_at) order by c.week_start)
      from private.titan_cadence_claims c where c.user_id = p_uid), '[]'::jsonb),
    'timeCapsules', coalesce((
      select jsonb_agg(jsonb_build_object('message', t.message, 'months', t.months, 'deliver_on', t.deliver_on, 'written_minutes', t.written_minutes,
        'written_days', t.written_days, 'created_at', t.created_at, 'opened_at', t.opened_at) order by t.created_at)
      from private.titan_time_capsules t where t.user_id = p_uid), '[]'::jsonb),
    'lifeChapters', coalesce((
      select jsonb_agg(jsonb_build_object('title', l.title, 'starts_on', l.starts_on, 'ends_on', l.ends_on, 'created_at', l.created_at) order by l.starts_on)
      from private.titan_life_chapters l where l.user_id = p_uid), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object('client_route_id', r.client_route_id, 'sport', r.sport, 'started_at', r.started_at, 'distance_m', r.distance_m, 'duration_s', r.duration_s,
        'ascent_m', r.ascent_m, 'points', r.points, 'event_id', r.event_id, 'track', r.track, 'created_at', r.created_at,
        'name', r.name, 'origin', r.origin, 'summary', r.summary) order by r.started_at)
      from private.titan_routes r where r.user_id = p_uid), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object('client_place_id', p.client_place_id, 'name', p.name, 'kind', p.kind, 'lat', p.lat, 'lon', p.lon, 'note', p.note,
        'created_at', p.created_at, 'updated_at', p.updated_at) order by p.created_at)
      from private.titan_places p where p.user_id = p_uid), '[]'::jsonb));
$$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
