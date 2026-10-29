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
