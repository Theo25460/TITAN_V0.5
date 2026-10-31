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
