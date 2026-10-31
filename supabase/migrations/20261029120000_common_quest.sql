-- V11-62 (COM-B1): the common quest of the week. One collective quest per week (Monday to Sunday, Paris time), created by an administrator,
-- with a target in "minutes d'effort" (the normalized effort that already makes sports comparable; nothing is added in km, repetitions or kg).
-- A player joins on purpose; only sessions recorded after joining and dated inside the week count, each day capped like the guild week
-- (private.titan_effort_days), history and held or flagged sessions excluded. Nobody sees another player's contribution: a player reads its own,
-- the total, the target and the number of participants. It is distinct from the personal weekly quest (V11-13). No XP, credit, record or
-- ranking is granted by this quest, so there is nothing to count twice; it can coexist with every other quest.
-- Own participation is exported (extras helper) and erased with the account (foreign keys on delete cascade).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_common_quest_v1(), public.titan_common_quest_join_v1(uuid,boolean), public.titan_common_quest_admin_save_v1(uuid,date,text,text,integer),
-- public.titan_common_quest_admin_list_v1(); drop tables private.titan_common_quest_members, private.titan_common_quests;
-- then re-apply the extras helper of migration 44 (20261029110000_daily_intents.sql).

create table if not exists private.titan_common_quests (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique check (extract(isodow from week_start) = 1),
  title text not null check (char_length(title) between 3 and 100),
  detail text check (detail is null or char_length(detail) <= 400),
  target_minutes integer not null check (target_minutes between 100 and 1000000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists private.titan_common_quest_members (
  quest_id uuid not null references private.titan_common_quests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (quest_id, user_id)
);
create index if not exists titan_common_quest_members_user_idx on private.titan_common_quest_members (user_id);
alter table private.titan_common_quests enable row level security;
alter table private.titan_common_quest_members enable row level security;
revoke all on private.titan_common_quests, private.titan_common_quest_members from public, anon, authenticated;

-- The quest of the current Paris week, else the one that ended last (so the result stays readable for a week). Aggregates only.
create or replace function public.titan_common_quest_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_week date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date;
  v_q private.titan_common_quests%rowtype;
  v_from timestamptz;
  v_to timestamptz;
  v_total numeric := 0;
  v_mine numeric := 0;
  v_members integer;
  v_joined boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_q from private.titan_common_quests where week_start between v_week - 7 and v_week order by week_start desc limit 1;
  if not found then return null; end if;
  v_from := v_q.week_start::timestamp at time zone 'Europe/Paris';
  v_to := (v_q.week_start + 7)::timestamp at time zone 'Europe/Paris';
  select count(*)::integer into v_members from private.titan_common_quest_members m where m.quest_id = v_q.id;
  select exists (select 1 from private.titan_common_quest_members m where m.quest_id = v_q.id and m.user_id = v_uid) into v_joined;
  select coalesce(sum(c.minutes), 0), coalesce(sum(c.minutes) filter (where c.user_id = v_uid), 0) into v_total, v_mine
    from (select m.user_id, (select coalesce(sum(d.minutes), 0) from private.titan_effort_days(m.user_id, v_from, v_to, m.joined_at, 90) d) as minutes
            from (select * from private.titan_common_quest_members where quest_id = v_q.id order by joined_at limit 5000) m) c;
  return jsonb_build_object('id', v_q.id, 'title', v_q.title, 'detail', v_q.detail, 'weekStart', v_q.week_start, 'endsAt', v_to,
    'target', v_q.target_minutes, 'minutes', round(v_total), 'members', v_members, 'joined', v_joined, 'mine', round(v_mine),
    'state', case when v_total >= v_q.target_minutes then 'done' when now() >= v_to then 'closed' else 'open' end);
end;
$function$;

create or replace function public.titan_common_quest_join_v1(p_quest uuid, p_join boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_q private.titan_common_quests%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'common_quest', 60);
  select * into v_q from private.titan_common_quests where id = p_quest;
  if not found then raise exception 'QUEST_NOT_FOUND' using errcode = '22023'; end if;
  if now() >= (v_q.week_start + 7)::timestamp at time zone 'Europe/Paris' then raise exception 'QUEST_ENDED' using errcode = '22023'; end if;
  if coalesce(p_join, false) then
    insert into private.titan_common_quest_members (quest_id, user_id) values (p_quest, v_uid) on conflict do nothing;
  else
    delete from private.titan_common_quest_members where quest_id = p_quest and user_id = v_uid;
  end if;
  return jsonb_build_object('quest', p_quest, 'joined', coalesce(p_join, false));
end;
$function$;

create or replace function public.titan_common_quest_admin_save_v1(p_id uuid, p_week date, p_title text, p_detail text, p_target integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_old private.titan_common_quests%rowtype;
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_week is null or extract(isodow from p_week) <> 1 then raise exception 'WEEK_MUST_START_MONDAY' using errcode = '22023'; end if;
  if v_id is null then
    if p_week + 7 <= (date_trunc('week', now() at time zone 'Europe/Paris'))::date then raise exception 'WEEK_IN_THE_PAST' using errcode = '22023'; end if;
    insert into private.titan_common_quests (week_start, title, detail, target_minutes, created_by)
    values (p_week, btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_target, v_uid) returning id into v_id;
  else
    select * into v_old from private.titan_common_quests where id = v_id;
    if not found then raise exception 'QUEST_NOT_FOUND' using errcode = '22023'; end if;
    -- Once the week has begun the rules are frozen: only the wording may change.
    if now() >= v_old.week_start::timestamp at time zone 'Europe/Paris' and (p_week is distinct from v_old.week_start or p_target is distinct from v_old.target_minutes) then
      raise exception 'QUEST_STARTED_FROZEN' using errcode = '22023';
    end if;
    update private.titan_common_quests set week_start = p_week, title = btrim(p_title), detail = nullif(btrim(coalesce(p_detail, '')), ''), target_minutes = p_target where id = v_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.titan_common_quest_admin_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'weekStart', q.week_start, 'title', q.title, 'detail', q.detail, 'target', q.target_minutes,
             'members', (select count(*) from private.titan_common_quest_members m where m.quest_id = q.id)) order by q.week_start desc)
      from (select * from private.titan_common_quests order by week_start desc limit 30) q), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_common_quest_v1(), public.titan_common_quest_join_v1(uuid, boolean), public.titan_common_quest_admin_save_v1(uuid, date, text, text, integer),
  public.titan_common_quest_admin_list_v1() from public, anon;
grant execute on function public.titan_common_quest_v1(), public.titan_common_quest_join_v1(uuid, boolean), public.titan_common_quest_admin_save_v1(uuid, date, text, text, integer),
  public.titan_common_quest_admin_list_v1() to authenticated;

-- The export gains the account's own participations (the helper keeps the Garmin link, the votes, the badge and the intentions).
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
                                from private.titan_common_quest_members m join private.titan_common_quests q on q.id = m.quest_id where m.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
