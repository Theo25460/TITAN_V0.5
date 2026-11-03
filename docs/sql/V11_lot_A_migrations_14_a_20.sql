-- TITAN V1.1 — lot A : migrations 14 à 20 sur 33. Lots à exécuter DANS L'ORDRE A, B, C, D, E (Supabase > SQL Editor, un lot par exécution).
-- Détectées absentes en production le 3 novembre 2026. Additif ; une erreur annule tout le lot : corriger puis relancer ce lot.

-- ======== 14/33 : 20261029100000_pioneer_badge.sql ========
-- V11-60 (COM-D1): the Pionnier badge. A founding cohort with transparent criteria, a permanent badge that cannot be bought and gives no
-- advantage: no XP, no credit, no quest, no ranking weight. Attribution is the administrator's, never automatic: the candidate list applies
-- the announced rule (account created before a date, at least N confirmed sessions, not suspended) and the administrator grants from it,
-- so a fraudulent or empty account is never swept in. One badge per account (granting twice changes nothing), revocable.
-- The player reads its own badge; the export carries it; it is erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_pioneer_v1(), public.titan_pioneer_candidates_v1(timestamptz,integer), public.titan_pioneer_grant_v1(uuid,text),
-- public.titan_pioneer_revoke_v1(uuid), public.titan_pioneer_list_v1(); drop table private.titan_pioneers; then re-apply the extras helper of migration 42 (20261029090000_community_consultations.sql).

create table if not exists private.titan_pioneers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cohort text not null check (char_length(cohort) between 3 and 40),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);
alter table private.titan_pioneers enable row level security;
revoke all on private.titan_pioneers from public, anon, authenticated;

create or replace function public.titan_pioneer_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_row private.titan_pioneers%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_row from private.titan_pioneers where user_id = v_uid;
  if not found then return jsonb_build_object('granted', false); end if;
  return jsonb_build_object('granted', true, 'cohort', v_row.cohort, 'grantedAt', v_row.granted_at);
end;
$function$;

-- The announced rule, applied to the accounts that do not hold the badge yet. At most 200 candidates, oldest accounts first.
create or replace function public.titan_pioneer_candidates_v1(p_before timestamptz, p_min_sessions integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_before is null or coalesce(p_min_sessions, 0) < 1 or p_min_sessions > 1000 then raise exception 'CRITERIA_INVALID' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'username', x.username, 'createdAt', x.created_at, 'sessions', x.sessions) order by x.created_at)
      from (select p.id, p.username, p.created_at,
                   (select count(*) from public.training_logs l
                     where l.user_id = p.id and l.archived_at is null and not l.is_suspicious and l.status not in ('flagged', 'pending_review', 'rejected')) as sessions
              from public.profiles p
             where p.created_at < p_before and not coalesce(p.is_suspended, false)
               and not exists (select 1 from private.titan_pioneers b where b.user_id = p.id)
             order by p.created_at limit 2000) x
     where x.sessions >= p_min_sessions
     limit 200), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_pioneer_grant_v1(p_user uuid, p_cohort text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_added integer;
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and not coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_NOT_ELIGIBLE' using errcode = '22023';
  end if;
  insert into private.titan_pioneers (user_id, cohort, granted_by) values (p_user, btrim(p_cohort), auth.uid()) on conflict (user_id) do nothing;
  get diagnostics v_added = row_count;
  return v_added = 1;
end;
$function$;

create or replace function public.titan_pioneer_revoke_v1(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_removed integer;
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_pioneers where user_id = p_user;
  get diagnostics v_removed = row_count;
  return v_removed = 1;
end;
$function$;


create or replace function public.titan_pioneer_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', b.user_id, 'username', p.username, 'cohort', b.cohort, 'grantedAt', b.granted_at) order by b.granted_at desc)
      from (select * from private.titan_pioneers order by granted_at desc limit 500) b left join public.profiles p on p.id = b.user_id), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_pioneer_v1(), public.titan_pioneer_candidates_v1(timestamptz, integer), public.titan_pioneer_grant_v1(uuid, text), public.titan_pioneer_revoke_v1(uuid), public.titan_pioneer_list_v1() from public, anon;
grant execute on function public.titan_pioneer_v1(), public.titan_pioneer_candidates_v1(timestamptz, integer), public.titan_pioneer_grant_v1(uuid, text), public.titan_pioneer_revoke_v1(uuid), public.titan_pioneer_list_v1() to authenticated;

-- The export gains the badge (migration 42's helper keeps the Garmin link and the votes).
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
    'pioneer', coalesce((select jsonb_build_object('cohort', b.cohort, 'granted_at', b.granted_at) from private.titan_pioneers b where b.user_id = p_uid), 'null'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 15/33 : 20261029110000_daily_intents.sql ========
-- V11-61 (COM-B7): the daily rendezvous. "Quel est ton objectif aujourd'hui ?" : a player may state, for one day, an intention of a session
-- (a short sentence), say afterwards that it was kept, and let friends see it and encourage. Optional by design: no streak, no counter of
-- missed days, nothing for a rest day, nothing is published automatically, no location and no health data. An intention is private
-- unless the player chooses "friends" for that day; only accepted, unblocked friends read it and cheer it; the owner only sees how many
-- friends encouraged, not who. No XP, credit, quest, record or ranking is touched.
-- Own intentions are exported (through the extras helper) and erased with the account (foreign keys on delete cascade).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_intent_set_v1(date,text,text), public.titan_intent_done_v1(date,boolean), public.titan_intent_clear_v1(date),
-- public.titan_intents_v1(date), public.titan_intent_cheer_v1(uuid,date,boolean); drop table private.titan_intent_cheers, private.titan_daily_intents;
-- then re-apply the extras helper of migration 43 (20261029100000_pioneer_badge.sql).

create table if not exists private.titan_daily_intents (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  intent text not null check (char_length(intent) between 3 and 80),
  visibility text not null default 'private' check (visibility in ('private', 'friends')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create table if not exists private.titan_intent_cheers (
  owner_id uuid not null,
  day date not null,
  cheerer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, day, cheerer_id),
  foreign key (owner_id, day) references private.titan_daily_intents(user_id, day) on delete cascade
);
create index if not exists titan_intent_cheers_cheerer_idx on private.titan_intent_cheers (cheerer_id);
alter table private.titan_daily_intents enable row level security;
alter table private.titan_intent_cheers enable row level security;
revoke all on private.titan_daily_intents, private.titan_intent_cheers from public, anon, authenticated;

-- A day is accepted within one day of the server date (the player's own calendar day, whatever the time zone).
create or replace function private.titan_intent_day_ok(p_day date)
returns boolean
language sql
immutable
as $$ select p_day is not null and p_day between current_date - 1 and current_date + 1 $$;
revoke all on function private.titan_intent_day_ok(date) from public, anon, authenticated;

create or replace function public.titan_intent_set_v1(p_day date, p_text text, p_visibility text default 'private')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_text text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  v_text := public.titan_clean_social_text(p_text, '', 80);
  if char_length(v_text) < 3 then raise exception 'INTENT_TOO_SHORT' using errcode = '22023'; end if;
  perform public.titan_social_rate_limit(v_uid, 'intent_set', interval '1 day', 30);
  insert into private.titan_daily_intents as i (user_id, day, intent, visibility)
  values (v_uid, p_day, v_text, case when p_visibility = 'friends' then 'friends' else 'private' end)
  on conflict (user_id, day) do update set intent = excluded.intent, visibility = excluded.visibility, updated_at = now();
  return jsonb_build_object('day', p_day, 'intent', v_text, 'visibility', case when p_visibility = 'friends' then 'friends' else 'private' end);
end;
$function$;

create or replace function public.titan_intent_done_v1(p_day date, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  update private.titan_daily_intents set done_at = case when coalesce(p_done, false) then now() else null end, updated_at = now()
   where user_id = v_uid and day = p_day;
  if not found then raise exception 'INTENT_NOT_FOUND' using errcode = '22023'; end if;
  return jsonb_build_object('day', p_day, 'done', coalesce(p_done, false));
end;
$function$;

create or replace function public.titan_intent_clear_v1(p_day date)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_removed integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_daily_intents where user_id = auth.uid() and day = p_day;
  get diagnostics v_removed = row_count;
  return v_removed = 1;
end;
$function$;

-- Mine for the day (with the number of friends who encouraged), and the friends' intentions shared for that day (at most 30).
create or replace function public.titan_intents_v1(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  return jsonb_build_object(
    'mine', (select jsonb_build_object('intent', i.intent, 'visibility', i.visibility, 'done', i.done_at is not null,
                      'cheers', (select count(*) from private.titan_intent_cheers c where c.owner_id = i.user_id and c.day = i.day))
               from private.titan_daily_intents i where i.user_id = v_uid and i.day = p_day),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('userId', i.user_id, 'name', coalesce(p.username, 'Ami'), 'intent', i.intent, 'done', i.done_at is not null,
                        'cheered', exists (select 1 from private.titan_intent_cheers c where c.owner_id = i.user_id and c.day = i.day and c.cheerer_id = v_uid))
                       order by i.updated_at desc)
        from (select * from private.titan_daily_intents d
               where d.day = p_day and d.visibility = 'friends' and d.user_id <> v_uid and private.titan_are_friends(v_uid, d.user_id)
               order by d.updated_at desc limit 30) i
        join public.profiles p on p.id = i.user_id and not coalesce(p.is_suspended, false)), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_intent_cheer_v1(p_owner uuid, p_day date, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  if p_owner is null or p_owner = v_uid then raise exception 'CHEER_NOT_ALLOWED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_daily_intents d where d.user_id = p_owner and d.day = p_day and d.visibility = 'friends')
     or not private.titan_are_friends(v_uid, p_owner) then
    raise exception 'CHEER_NOT_ALLOWED' using errcode = '42501';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'intent_cheer', interval '1 day', 60);
  if coalesce(p_on, false) then
    insert into private.titan_intent_cheers (owner_id, day, cheerer_id) values (p_owner, p_day, v_uid) on conflict do nothing;
  else
    delete from private.titan_intent_cheers where owner_id = p_owner and day = p_day and cheerer_id = v_uid;
  end if;
  return jsonb_build_object('owner', p_owner, 'day', p_day, 'cheered', coalesce(p_on, false));
end;
$function$;

revoke all on function public.titan_intent_set_v1(date, text, text), public.titan_intent_done_v1(date, boolean), public.titan_intent_clear_v1(date),
  public.titan_intents_v1(date), public.titan_intent_cheer_v1(uuid, date, boolean) from public, anon;
grant execute on function public.titan_intent_set_v1(date, text, text), public.titan_intent_done_v1(date, boolean), public.titan_intent_clear_v1(date),
  public.titan_intents_v1(date), public.titan_intent_cheer_v1(uuid, date, boolean) to authenticated;

-- The export gains the account's own intentions (the helper keeps the Garmin link, the votes and the badge).
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
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 16/33 : 20261029120000_common_quest.sql ========
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

-- ======== 17/33 : 20261029130000_buddies.sql ========
-- V11-63 (COM-C2): progress buddies. Two accepted, unblocked friends may agree to support each other for 14 days. Strictly voluntary: the
-- invited friend accepts or declines, and either side may stop at any time (consent withdrawn = access ends at once). A player has at most one
-- buddy at a time. The shared goal is a number of ACTIVE DAYS together (12 over the 14 days); each side sees the other's count of active days
-- and nothing else (no sport, no minutes, no place). A day of encouragement may be sent once a day per side; the receiver sees a count.
-- No partner is ever assigned, no XP, credit, quest, record or ranking is granted. After the end (or if the friendship stops or one of them is
-- blocked or suspended) the other side's data is no longer readable.
-- Own pairings are exported (extras helper) and erased with the account (foreign keys on delete cascade).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid), public.titan_buddy_respond_v1(uuid,boolean),
-- public.titan_buddy_end_v1(uuid), public.titan_buddy_nudge_v1(uuid); drop tables private.titan_buddy_nudges, private.titan_buddies;
-- then re-apply the extras helper of migration 45 (20261029120000_common_quest.sql).

create table if not exists private.titan_buddies (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  target_days smallint not null default 12 check (target_days between 4 and 28),
  starts_on date,
  ends_on date,
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (inviter_id <> invitee_id),
  check ((status = 'pending' and starts_on is null) or (status <> 'pending' and starts_on is not null) or status = 'ended')
);
-- At most one pending or active pairing per player, on either side.
create unique index if not exists titan_buddies_one_open_inviter on private.titan_buddies (inviter_id) where status in ('pending', 'active');
create unique index if not exists titan_buddies_one_open_invitee on private.titan_buddies (invitee_id) where status in ('pending', 'active');
create index if not exists titan_buddies_invitee_idx on private.titan_buddies (invitee_id);
create table if not exists private.titan_buddy_nudges (
  buddy_id uuid not null references private.titan_buddies(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (buddy_id, from_user, day)
);
create index if not exists titan_buddy_nudges_from_idx on private.titan_buddy_nudges (from_user);
alter table private.titan_buddies enable row level security;
alter table private.titan_buddy_nudges enable row level security;
revoke all on private.titan_buddies, private.titan_buddy_nudges from public, anon, authenticated;

-- A pairing is "live" while it is pending or active, the friendship holds (accepted, unblocked) and the period has not ended.
create or replace function private.titan_buddy_live(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from private.titan_buddies b
     where b.id = p_id and b.status in ('pending', 'active')
       and (b.ends_on is null or b.ends_on >= (now() at time zone 'Europe/Paris')::date)
       and private.titan_are_friends(b.inviter_id, b.invitee_id)
       and not exists (select 1 from public.profiles p where p.id in (b.inviter_id, b.invitee_id) and coalesce(p.is_suspended, false)));
$function$;
revoke all on function private.titan_buddy_live(uuid) from public, anon, authenticated;

-- Active days of one player inside the period: sessions recorded after the pairing started, dated inside the period, history and held sessions excluded.
create or replace function private.titan_buddy_days(p_user uuid, p_from date, p_to date, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(*)::integer from private.titan_effort_days(p_user, p_from::timestamp at time zone 'Europe/Paris', (p_to + 1)::timestamp at time zone 'Europe/Paris', p_since, 90) d where d.minutes > 0;
$function$;
revoke all on function private.titan_buddy_days(uuid, date, date, timestamptz) from public, anon, authenticated;

create or replace function public.titan_buddy_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b private.titan_buddies%rowtype;
  v_partner uuid;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_mine integer := 0;
  v_theirs integer := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_b from private.titan_buddies b where (b.inviter_id = v_uid or b.invitee_id = v_uid) and b.status in ('pending', 'active') limit 1;
  if not found then
    return jsonb_build_object('status', 'none', 'friends', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Ami')) order by p.username)
        from public.friendships f join public.profiles p on p.id = case when f.user_id_1 = v_uid then f.user_id_2 else f.user_id_1 end
       where (f.user_id_1 = v_uid or f.user_id_2 = v_uid) and coalesce(f.status, 'accepted') = 'accepted' and not coalesce(p.is_suspended, false)
         and private.titan_are_friends(v_uid, p.id)
         and not exists (select 1 from private.titan_buddies x where x.status in ('pending', 'active') and p.id in (x.inviter_id, x.invitee_id))), '[]'::jsonb));
  end if;
  v_partner := case when v_b.inviter_id = v_uid then v_b.invitee_id else v_b.inviter_id end;
  -- The relationship has lapsed (period over, friendship gone, a block, a suspension): it ends here and nothing of the other side is read.
  if not private.titan_buddy_live(v_b.id) then
    update private.titan_buddies set status = 'ended', ended_at = coalesce(ended_at, now()) where id = v_b.id;
    return jsonb_build_object('status', 'none', 'friends', '[]'::jsonb);
  end if;
  if v_b.status = 'pending' then
    return jsonb_build_object('status', 'pending', 'id', v_b.id, 'role', case when v_b.inviter_id = v_uid then 'inviter' else 'invitee' end,
      'partner', jsonb_build_object('id', v_partner, 'name', coalesce((select p.username from public.profiles p where p.id = v_partner), 'Ami')));
  end if;
  v_mine := private.titan_buddy_days(v_uid, v_b.starts_on, least(v_today, v_b.ends_on), v_b.accepted_at);
  v_theirs := private.titan_buddy_days(v_partner, v_b.starts_on, least(v_today, v_b.ends_on), v_b.accepted_at);
  return jsonb_build_object('status', 'active', 'id', v_b.id, 'role', case when v_b.inviter_id = v_uid then 'inviter' else 'invitee' end,
    'partner', jsonb_build_object('id', v_partner, 'name', coalesce((select p.username from public.profiles p where p.id = v_partner), 'Ami')),
    'startsOn', v_b.starts_on, 'endsOn', v_b.ends_on, 'daysLeft', greatest(0, v_b.ends_on - v_today + 1), 'target', v_b.target_days,
    'myDays', v_mine, 'partnerDays', v_theirs, 'together', v_mine + v_theirs,
    'nudgedToday', exists (select 1 from private.titan_buddy_nudges n where n.buddy_id = v_b.id and n.from_user = v_uid and n.day = v_today),
    'nudgesReceived', (select count(*) from private.titan_buddy_nudges n where n.buddy_id = v_b.id and n.from_user = v_partner));
end;
$function$;

create or replace function public.titan_buddy_invite_v1(p_friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_friend is null or p_friend = v_uid then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id in (v_uid, p_friend) and coalesce(p.is_suspended, false)) then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  if not private.titan_are_friends(v_uid, p_friend) then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  -- Lapsed pairings are closed before the one-at-a-time rule applies.
  update private.titan_buddies b set status = 'ended', ended_at = coalesce(b.ended_at, now())
   where b.status in ('pending', 'active') and (v_uid in (b.inviter_id, b.invitee_id) or p_friend in (b.inviter_id, b.invitee_id)) and not private.titan_buddy_live(b.id);
  if exists (select 1 from private.titan_buddies b where b.status in ('pending', 'active') and (v_uid in (b.inviter_id, b.invitee_id) or p_friend in (b.inviter_id, b.invitee_id))) then
    raise exception 'BUDDY_ALREADY_PAIRED' using errcode = '22023';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'buddy_invite', interval '1 day', 10);
  insert into private.titan_buddies (inviter_id, invitee_id) values (v_uid, p_friend) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$function$;

create or replace function public.titan_buddy_respond_v1(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_b private.titan_buddies%rowtype;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_b from private.titan_buddies where id = p_id and invitee_id = v_uid and status = 'pending';
  if not found then raise exception 'BUDDY_NOT_FOUND' using errcode = '22023'; end if;
  if not private.titan_buddy_live(p_id) then
    update private.titan_buddies set status = 'ended', ended_at = now() where id = p_id;
    raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501';
  end if;
  if coalesce(p_accept, false) then
    update private.titan_buddies set status = 'active', starts_on = v_today, ends_on = v_today + 13, accepted_at = now() where id = p_id;
    return jsonb_build_object('id', p_id, 'status', 'active', 'startsOn', v_today, 'endsOn', v_today + 13);
  end if;
  update private.titan_buddies set status = 'ended', ended_at = now(), ended_by = v_uid where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'ended');
end;
$function$;

-- Either side, any time, pending or active: consent withdrawn.
create or replace function public.titan_buddy_end_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update private.titan_buddies set status = 'ended', ended_at = now(), ended_by = auth.uid()
   where id = p_id and status in ('pending', 'active') and auth.uid() in (inviter_id, invitee_id);
  return found;
end;
$function$;

create or replace function public.titan_buddy_nudge_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_buddies b where b.id = p_id and b.status = 'active' and v_uid in (b.inviter_id, b.invitee_id)) or not private.titan_buddy_live(p_id) then
    raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'buddy_nudge', interval '1 day', 20);
  insert into private.titan_buddy_nudges (buddy_id, from_user, day) values (p_id, v_uid, v_today) on conflict do nothing;
  return jsonb_build_object('id', p_id, 'nudgedToday', true);
end;
$function$;

revoke all on function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid), public.titan_buddy_respond_v1(uuid, boolean), public.titan_buddy_end_v1(uuid), public.titan_buddy_nudge_v1(uuid) from public, anon;
grant execute on function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid), public.titan_buddy_respond_v1(uuid, boolean), public.titan_buddy_end_v1(uuid), public.titan_buddy_nudge_v1(uuid) to authenticated;

-- The export gains the account's own pairings (dates and status only; the partner's data is never exported).
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
                           from private.titan_buddies b where p_uid in (b.inviter_id, b.invitee_id)), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 18/33 : 20261029140000_seasons.sql ========
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

-- ======== 19/33 : 20261029150000_fair_ranking.sql ========
-- V11-65 (COM-C4): a fair ranking among friends. It rewards REGULARITY and PROGRESS, not volume, so that a very trained athlete cannot crush a
-- beginner. It is opt-in (nobody appears, and nobody sees the others, unless they chose to take part), it lists only the player's accepted,
-- unblocked friends who also opted in, and there is no global public ranking. The formula is deterministic and shown to the players:
--   regularity R = min(1, active days in the last 28 days / 12)                       (12 active days = 3 a week = full marks; more earns nothing)
--   progress   P = clip((minutes of the last 14 days - minutes of the 14 days before) / max(minutes of the 14 days before, 60), 0, 1)
--                  (a quieter fortnight scores 0, never negative; a tiny past cannot inflate the figure because the base is at least 60 minutes)
--   score      = round(100 * (0.6 * R + 0.4 * P))
-- Minutes are the normalized effort minutes of the guild week (capped at 90 a day), counted from sessions that are not archived, suspicious,
-- held or flagged, not history imports, and dated up to now: nothing bought and no duplicate import can raise it. A player with no counted
-- session in the 28 days has no score and is not listed. Equal scores are ordered by active days then by name; equal scores share a rank.
-- An optional sport filters the same formula to one discipline. No XP, credit, record or reward is attached to the ranking.
-- The opt-in is exported (extras helper) and erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_ranking_v1(text), public.titan_ranking_set_v1(boolean); drop function private.titan_fair_score(uuid,text);
-- drop table private.titan_ranking_optin; then re-apply the extras helper of migration 47 (20261029140000_seasons.sql).

create table if not exists private.titan_ranking_optin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  since timestamptz not null default now()
);
alter table private.titan_ranking_optin enable row level security;
revoke all on private.titan_ranking_optin from public, anon, authenticated;

-- One player's fair score over the 28 days ending now (Paris calendar days). Returns no row when no counted session exists.
create or replace function private.titan_fair_score(p_user uuid, p_sport text default null)
returns table (score integer, active_days integer, recent_minutes integer, previous_minutes integer, progress_pct integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with per_day as (
    select (l.date at time zone 'Europe/Paris')::date as day,
           least(90, sum(coalesce(public.titan_numeric_from_json(l.details -> 'effort', 'effort_minutes'), 0))) as minutes
      from public.training_logs l
     where l.user_id = p_user
       and l.archived_at is null
       and l.is_suspicious is not true
       and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review')
       and coalesce(l.details ->> 'historical', 'false') <> 'true'
       and l.date <= now()
       and (l.date at time zone 'Europe/Paris')::date > (now() at time zone 'Europe/Paris')::date - 28
       and (p_sport is null or l.sport = p_sport)
     group by 1
  ), agg as (
    select count(*) filter (where minutes > 0)::integer as days,
           coalesce(sum(minutes) filter (where day > (now() at time zone 'Europe/Paris')::date - 14), 0) as recent,
           coalesce(sum(minutes) filter (where day <= (now() at time zone 'Europe/Paris')::date - 14), 0) as previous
      from per_day
  )
  select round(100 * (0.6 * least(1, a.days / 12.0) + 0.4 * greatest(0, least(1, (a.recent - a.previous) / greatest(a.previous, 60)))))::integer,
         a.days, round(a.recent)::integer, round(a.previous)::integer,
         round(100 * greatest(0, least(1, (a.recent - a.previous) / greatest(a.previous, 60))))::integer
    from agg a where a.days > 0;
$function$;
revoke all on function private.titan_fair_score(uuid, text) from public, anon, authenticated;

create or replace function public.titan_ranking_set_v1(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if coalesce(p_on, false) then
    if exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
    insert into private.titan_ranking_optin (user_id) values (auth.uid()) on conflict do nothing;
  else
    delete from private.titan_ranking_optin where user_id = auth.uid();
  end if;
  return coalesce(p_on, false);
end;
$function$;

create or replace function public.titan_ranking_v1(p_sport text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '10s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_sport text := nullif(btrim(coalesce(p_sport, '')), '');
  v_in boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_sport is not null and v_sport !~ '^[a-z0-9_]{1,40}$' then raise exception 'SPORT_INVALID' using errcode = '22023'; end if;
  select exists (select 1 from private.titan_ranking_optin o where o.user_id = v_uid) into v_in;
  if not v_in then return jsonb_build_object('optedIn', false, 'formula', 1); end if;
  return jsonb_build_object('optedIn', true, 'formula', 1, 'sport', v_sport, 'entries', coalesce((
    select jsonb_agg(jsonb_build_object('rank', x.rnk, 'name', x.name, 'score', x.score, 'activeDays', x.active_days, 'progressPct', x.progress_pct, 'me', x.is_me) order by x.rnk, x.active_days desc, x.name)
      from (select r.*, rank() over (order by r.score desc) as rnk
              from (select p.id, coalesce(p.username, 'Ami') as name, (p.id = v_uid) as is_me, s.score, s.active_days, s.progress_pct
                      from public.profiles p
                      join private.titan_ranking_optin o on o.user_id = p.id
                      cross join lateral private.titan_fair_score(p.id, v_sport) s
                     where not coalesce(p.is_suspended, false)
                       and (p.id = v_uid or private.titan_are_friends(v_uid, p.id))
                     limit 100) r) x), '[]'::jsonb),
    'me', (select jsonb_build_object('score', s.score, 'activeDays', s.active_days, 'recentMinutes', s.recent_minutes, 'previousMinutes', s.previous_minutes, 'progressPct', s.progress_pct)
             from private.titan_fair_score(v_uid, v_sport) s));
end;
$function$;

revoke all on function public.titan_ranking_v1(text), public.titan_ranking_set_v1(boolean) from public, anon;
grant execute on function public.titan_ranking_v1(text), public.titan_ranking_set_v1(boolean) to authenticated;

-- The export gains the opt-in (the helper keeps everything migrations 40 to 47 added).
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
    'rankingOptIn', coalesce((select jsonb_build_object('since', o.since) from private.titan_ranking_optin o where o.user_id = p_uid), 'null'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

-- ======== 20/33 : 20261029160000_duel_links.sql ========
-- V11-66 (COM-C1, COM-E2): duels between friends, and the invitation link. The friends' challenges of the social layer already carry the rules
-- (metric, sport, target, duration, up to 10 invited friends, accept/decline) and an honest server-side progress; this migration adds what was
-- missing for a duel:
--   * a one-use invitation LINK: a long random token (two random UUIDs, 244 bits) of which only the SHA-256 is stored, shown once to its creator,
--     valid at most 7 days and never after the challenge ends, revocable, at most 5 live links per challenge. It carries no personal data: its
--     public preview shows the rules (title, metric, sport, target, end date, number of participants) and never a name. Whoever opens it
--     signs in or signs up, then accepts: joining makes the player a participant (not a friend) and the link is spent. Any invalid, spent,
--     expired or revoked link answers the same "invalid", so nothing leaks;
--   * a FROZEN result: once the challenge has ended, the first participant who asks freezes everyone's final progress and whether the target
--     was reached, so the result never changes if a session is archived later. Only participants read it. No XP, credit or prize is attached.
-- Own links are never exported with their token (it is not stored); own results are exported (extras helper) and erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_challenge_link_create_v1(uuid), public.titan_challenge_links_v1(), public.titan_challenge_link_revoke_v1(uuid),
-- public.titan_challenge_link_preview_v1(text), public.titan_challenge_link_accept_v1(text), public.titan_challenge_result_v1(uuid);
-- drop tables private.titan_challenge_results, private.titan_challenge_invites; then re-apply the extras helper of migration 48 (20261029150000_fair_ranking.sql).

create table if not exists private.titan_challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.titan_challenges(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists titan_challenge_invites_challenge_idx on private.titan_challenge_invites (challenge_id);
create index if not exists titan_challenge_invites_creator_idx on private.titan_challenge_invites (created_by);
create index if not exists titan_challenge_invites_used_by_idx on private.titan_challenge_invites (used_by);
create table if not exists private.titan_challenge_results (
  challenge_id uuid not null references public.titan_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  final_progress numeric not null,
  reached boolean not null,
  frozen_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists titan_challenge_results_user_idx on private.titan_challenge_results (user_id);
alter table private.titan_challenge_invites enable row level security;
alter table private.titan_challenge_results enable row level security;
revoke all on private.titan_challenge_invites, private.titan_challenge_results from public, anon, authenticated;

create or replace function public.titan_challenge_link_create_v1(p_challenge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.titan_challenges%rowtype;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  select * into v_c from public.titan_challenges where id = p_challenge and creator_id = v_uid;
  if not found then raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_c.ends_at <= now() then raise exception 'CHALLENGE_ENDED' using errcode = '22023'; end if;
  if (select count(*) from private.titan_challenge_invites i where i.challenge_id = p_challenge and i.revoked_at is null and i.used_at is null and i.expires_at > now()) >= 5 then
    raise exception 'LINK_LIMIT_5' using errcode = '22023';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'challenge_link', interval '1 day', 20);
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := least(v_c.ends_at, now() + interval '7 days');
  insert into private.titan_challenge_invites (challenge_id, token_hash, created_by, expires_at)
  values (p_challenge, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_uid, v_expires) returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expiresAt', v_expires);
end;
$function$;

-- The creator's running challenges with their live links (no token), and the recent finished ones the player took part in.
create or replace function public.titan_challenge_links_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return jsonb_build_object(
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'endsAt', c.ends_at,
               'links', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'expiresAt', i.expires_at, 'used', i.used_at is not null) order by i.created_at)
                                    from private.titan_challenge_invites i where i.challenge_id = c.id and i.revoked_at is null and (i.used_at is not null or i.expires_at > now())), '[]'::jsonb))
               order by c.ends_at)
        from public.titan_challenges c where c.creator_id = v_uid and c.ends_at > now()), '[]'::jsonb),
    'ended', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'endedAt', c.ends_at) order by c.ends_at desc)
        from public.titan_challenges c join public.titan_challenge_members m on m.challenge_id = c.id and m.user_id = v_uid and m.status = 'joined'
       where c.ends_at <= now() and c.ends_at > now() - interval '14 days'), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_challenge_link_revoke_v1(p_invite uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update private.titan_challenge_invites set revoked_at = now() where id = p_invite and created_by = auth.uid() and revoked_at is null and used_at is null;
  return found;
end;
$function$;

-- Public preview: rules only, never a name, the same answer for every kind of invalid link.
create or replace function public.titan_challenge_link_preview_v1(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_i private.titan_challenge_invites%rowtype;
  v_c public.titan_challenges%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valid', false); end if;
  select * into v_i from private.titan_challenge_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found or v_i.revoked_at is not null or v_i.used_at is not null or v_i.expires_at <= now() then return jsonb_build_object('valid', false); end if;
  select * into v_c from public.titan_challenges where id = v_i.challenge_id and ends_at > now();
  if not found then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'title', v_c.title, 'metric', v_c.metric, 'sport', v_c.sport, 'target', v_c.target, 'endsAt', v_c.ends_at,
    'participants', (select count(*) from public.titan_challenge_members m where m.challenge_id = v_c.id and m.status = 'joined'));
end;
$function$;

create or replace function public.titan_challenge_link_accept_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_i private.titan_challenge_invites%rowtype;
  v_c public.titan_challenges%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  perform public.titan_social_rate_limit(v_uid, 'challenge_link_accept', interval '1 day', 30);
  select * into v_i from private.titan_challenge_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or v_i.revoked_at is not null or v_i.used_at is not null or v_i.expires_at <= now() then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  select * into v_c from public.titan_challenges where id = v_i.challenge_id and ends_at > now();
  if not found then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if v_c.creator_id = v_uid then raise exception 'LINK_OWN_CHALLENGE' using errcode = '22023'; end if;
  if exists (select 1 from public.titan_user_blocks k where (k.blocker_id = v_c.creator_id and k.blocked_id = v_uid) or (k.blocker_id = v_uid and k.blocked_id = v_c.creator_id)) then
    raise exception 'LINK_INVALID' using errcode = '22023';
  end if;
  if (select count(*) from public.titan_challenge_members m where m.challenge_id = v_c.id and m.status = 'joined') >= 10 then raise exception 'CHALLENGE_FULL' using errcode = '22023'; end if;
  insert into public.titan_challenge_members (challenge_id, user_id, status, joined_at) values (v_c.id, v_uid, 'joined', now())
  on conflict (challenge_id, user_id) do update set status = 'joined', joined_at = now() where public.titan_challenge_members.status in ('invited', 'declined', 'left');
  update private.titan_challenge_invites set used_by = v_uid, used_at = now() where id = v_i.id;
  return jsonb_build_object('challenge', v_c.id, 'title', v_c.title);
end;
$function$;

-- The frozen result of a finished challenge, for its participants only.
create or replace function public.titan_challenge_result_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '15s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.titan_challenges%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_c from public.titan_challenges where id = p_id;
  if not found or not exists (select 1 from public.titan_challenge_members m where m.challenge_id = p_id and m.user_id = v_uid and m.status = 'joined') then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_c.ends_at > now() then raise exception 'CHALLENGE_RUNNING' using errcode = '22023'; end if;
  insert into private.titan_challenge_results (challenge_id, user_id, final_progress, reached)
  select p_id, m.user_id, private.titan_challenge_progress(p_id, m.user_id), private.titan_challenge_progress(p_id, m.user_id) >= v_c.target
    from public.titan_challenge_members m where m.challenge_id = p_id and m.status = 'joined'
  on conflict do nothing;
  return jsonb_build_object('title', v_c.title, 'metric', v_c.metric, 'target', v_c.target, 'endedAt', v_c.ends_at, 'results', coalesce((
    select jsonb_agg(jsonb_build_object('name', coalesce(p.username, 'Athlète'), 'progress', r.final_progress, 'reached', r.reached, 'me', r.user_id = v_uid) order by r.final_progress desc, p.username)
      from private.titan_challenge_results r left join public.profiles p on p.id = r.user_id where r.challenge_id = p_id), '[]'::jsonb));
end;
$function$;

revoke all on function public.titan_challenge_link_create_v1(uuid), public.titan_challenge_links_v1(), public.titan_challenge_link_revoke_v1(uuid),
  public.titan_challenge_link_preview_v1(text), public.titan_challenge_link_accept_v1(text), public.titan_challenge_result_v1(uuid) from public, anon;
grant execute on function public.titan_challenge_link_create_v1(uuid), public.titan_challenge_links_v1(), public.titan_challenge_link_revoke_v1(uuid),
  public.titan_challenge_link_accept_v1(text), public.titan_challenge_result_v1(uuid) to authenticated;
grant execute on function public.titan_challenge_link_preview_v1(text) to anon, authenticated;

-- The export gains the account's own challenge results (links are not exported: only their hash is kept, and it is not personal data).
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
                                    from private.titan_challenge_results r where r.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
