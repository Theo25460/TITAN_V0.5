-- V11-64 (COM-B3, COM-D3): seasons of 28 days. A season is a calendar of four whole weeks (Monday to Sunday, Paris time) created by an
-- administrator, without overlap, with a wording of its rules and a rules version. Taking part is voluntary and carries no obligation and no
-- penalty for resting. Only sessions recorded after joining and dated inside the season count, in the same normalized effort minutes as the
-- guild week and the common quest (capped per day, history and held sessions excluded). At the end the season is FROZEN once: each
-- participant's result (effort minutes, active days) and the season's totals are written and never recomputed, so the archive stays the same
-- even if the rules change later; the closing screen and the archive read these frozen values. Only aggregates and one's own result are shown.
-- No XP, credit, record or ranking is granted. Own participation is exported (extras helper) and erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_season_v1(), public.titan_season_join_v1(uuid,boolean), public.titan_season_admin_save_v1(uuid,date,text,text),
-- public.titan_season_admin_list_v1(); drop function private.titan_season_freeze(uuid); drop tables private.titan_season_members, private.titan_seasons;
-- then re-apply the extras helper of migration 46 (20261029130000_buddies.sql).

create table if not exists private.titan_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 80),
  rules text check (rules is null or char_length(rules) <= 600),
  rules_version integer not null default 1 check (rules_version >= 1),
  starts_on date not null unique check (extract(isodow from starts_on) = 1),
  ends_on date generated always as (starts_on + 27) stored,
  closed_at timestamptz,
  result jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists private.titan_season_members (
  season_id uuid not null references private.titan_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  final_minutes integer,
  final_days integer,
  primary key (season_id, user_id)
);
create index if not exists titan_season_members_user_idx on private.titan_season_members (user_id);
alter table private.titan_seasons enable row level security;
alter table private.titan_season_members enable row level security;
revoke all on private.titan_seasons, private.titan_season_members from public, anon, authenticated;

-- Freezes a season that has ended: once, with the members and totals of that moment. Returns true when this call froze it.
create or replace function private.titan_season_freeze(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $function$
declare
  v_s private.titan_seasons%rowtype;
  v_from timestamptz;
  v_to timestamptz;
  v_total integer;
  v_members integer;
begin
  select * into v_s from private.titan_seasons where id = p_id for update;
  if not found or v_s.closed_at is not null then return false; end if;
  v_to := (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris';
  if now() < v_to then return false; end if;
  v_from := v_s.starts_on::timestamp at time zone 'Europe/Paris';
  update private.titan_season_members m set
    final_minutes = coalesce((select round(sum(d.minutes))::integer from private.titan_effort_days(m.user_id, v_from, v_to, m.joined_at, 90) d), 0),
    final_days = coalesce((select count(*)::integer from private.titan_effort_days(m.user_id, v_from, v_to, m.joined_at, 90) d where d.minutes > 0), 0)
   where m.season_id = p_id;
  select coalesce(sum(final_minutes), 0), count(*) into v_total, v_members from private.titan_season_members where season_id = p_id;
  update private.titan_seasons set closed_at = now(),
    result = jsonb_build_object('participants', v_members, 'minutes', v_total, 'rulesVersion', v_s.rules_version, 'frozenAt', now())
   where id = p_id;
  return true;
end;
$function$;
revoke all on function private.titan_season_freeze(uuid) from public, anon, authenticated;

-- The current season (or the next one within a week), the last closed one for the closing screen, and the archive of closed seasons.
create or replace function public.titan_season_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '15s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_s private.titan_seasons%rowtype;
  v_from timestamptz;
  v_to timestamptz;
  v_mine_min integer := 0;
  v_mine_days integer := 0;
  v_current jsonb := null;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Seasons that ended are frozen on first read (idempotent).
  for v_id in select id from private.titan_seasons where closed_at is null and ends_on < v_today loop
    perform private.titan_season_freeze(v_id);
  end loop;
  select * into v_s from private.titan_seasons where ends_on >= v_today and starts_on <= v_today + 7 order by starts_on limit 1;
  if found then
    v_from := v_s.starts_on::timestamp at time zone 'Europe/Paris';
    v_to := (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris';
    select coalesce(round(sum(d.minutes))::integer, 0), coalesce(count(*) filter (where d.minutes > 0)::integer, 0) into v_mine_min, v_mine_days
      from private.titan_season_members m, lateral private.titan_effort_days(m.user_id, v_from, v_to, m.joined_at, 90) d
     where m.season_id = v_s.id and m.user_id = v_uid;
    v_current := jsonb_build_object('id', v_s.id, 'name', v_s.name, 'rules', v_s.rules, 'rulesVersion', v_s.rules_version, 'startsOn', v_s.starts_on, 'endsOn', v_s.ends_on,
      'state', case when v_s.starts_on > v_today then 'upcoming' else 'running' end,
      'participants', (select count(*) from private.titan_season_members m where m.season_id = v_s.id),
      'joined', exists (select 1 from private.titan_season_members m where m.season_id = v_s.id and m.user_id = v_uid),
      'myMinutes', v_mine_min, 'myDays', v_mine_days);
  end if;
  return jsonb_build_object('current', v_current, 'archive', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'startsOn', s.starts_on, 'endsOn', s.ends_on, 'rulesVersion', (s.result ->> 'rulesVersion')::int,
             'participants', (s.result ->> 'participants')::int, 'minutes', (s.result ->> 'minutes')::int, 'closedAt', s.closed_at,
             'mine', (select jsonb_build_object('minutes', m.final_minutes, 'days', m.final_days) from private.titan_season_members m where m.season_id = s.id and m.user_id = v_uid))
           order by s.starts_on desc)
      from (select * from private.titan_seasons where closed_at is not null order by starts_on desc limit 12) s), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_season_join_v1(p_season uuid, p_join boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_s private.titan_seasons%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'season_join', 60);
  select * into v_s from private.titan_seasons where id = p_season;
  if not found then raise exception 'SEASON_NOT_FOUND' using errcode = '22023'; end if;
  if v_s.closed_at is not null or v_s.ends_on < (now() at time zone 'Europe/Paris')::date then raise exception 'SEASON_ENDED' using errcode = '22023'; end if;
  if coalesce(p_join, false) then
    insert into private.titan_season_members (season_id, user_id) values (p_season, v_uid) on conflict do nothing;
  else
    delete from private.titan_season_members where season_id = p_season and user_id = v_uid;
  end if;
  return jsonb_build_object('season', p_season, 'joined', coalesce(p_join, false));
end;
$function$;

create or replace function public.titan_season_admin_save_v1(p_id uuid, p_starts date, p_name text, p_rules text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_old private.titan_seasons%rowtype;
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_starts is null or extract(isodow from p_starts) <> 1 then raise exception 'WEEK_MUST_START_MONDAY' using errcode = '22023'; end if;
  if exists (select 1 from private.titan_seasons s where s.id is distinct from v_id and p_starts <= s.ends_on and p_starts + 27 >= s.starts_on) then
    raise exception 'SEASON_OVERLAP' using errcode = '22023';
  end if;
  if v_id is null then
    if p_starts + 27 < (now() at time zone 'Europe/Paris')::date then raise exception 'SEASON_IN_THE_PAST' using errcode = '22023'; end if;
    insert into private.titan_seasons (name, rules, starts_on, created_by) values (btrim(p_name), nullif(btrim(coalesce(p_rules, '')), ''), p_starts, v_uid) returning id into v_id;
  else
    select * into v_old from private.titan_seasons where id = v_id;
    if not found then raise exception 'SEASON_NOT_FOUND' using errcode = '22023'; end if;
    -- Once it started, the dates are frozen and a change of wording is a new version of the rules.
    if v_old.closed_at is not null then raise exception 'SEASON_FROZEN' using errcode = '22023'; end if;
    if v_old.starts_on <= (now() at time zone 'Europe/Paris')::date and p_starts is distinct from v_old.starts_on then raise exception 'SEASON_STARTED_FROZEN' using errcode = '22023'; end if;
    update private.titan_seasons set name = btrim(p_name), starts_on = p_starts,
           rules_version = rules_version + case when rules is distinct from nullif(btrim(coalesce(p_rules, '')), '') then 1 else 0 end,
           rules = nullif(btrim(coalesce(p_rules, '')), '') where id = v_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.titan_season_admin_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'rules', s.rules, 'rulesVersion', s.rules_version, 'startsOn', s.starts_on, 'endsOn', s.ends_on,
             'closed', s.closed_at is not null, 'participants', (select count(*) from private.titan_season_members m where m.season_id = s.id)) order by s.starts_on desc)
      from (select * from private.titan_seasons order by starts_on desc limit 30) s), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_season_v1(), public.titan_season_join_v1(uuid, boolean), public.titan_season_admin_save_v1(uuid, date, text, text), public.titan_season_admin_list_v1() from public, anon;
grant execute on function public.titan_season_v1(), public.titan_season_join_v1(uuid, boolean), public.titan_season_admin_save_v1(uuid, date, text, text), public.titan_season_admin_list_v1() to authenticated;

-- The export gains the account's own participation and frozen results.
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
                           from private.titan_season_members m join private.titan_seasons s on s.id = m.season_id where m.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
