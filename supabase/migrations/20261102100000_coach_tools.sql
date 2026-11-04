-- V11-81 (COACH-04, COACH-05): the working tools between a coach and an athlete who already share a link: reusable session templates, a private message thread per
-- link, and an optional weekly check-in that the athlete may share. Everything hangs on the existing sharing link (public.coach_links): nothing is reachable without an
-- accepted, unrevoked link, and ending the link ends access at once for both sides (the history stays, unreadable, and goes with the account).
-- TEMPLATES: owned by the coach alone, 100 at most, a title, a sport of the catalogue, instructions (2,000 characters); proposing a session stays the existing portal action,
--   a template only fills its form.
-- MESSAGES: text only, 1,000 characters, 60 an hour, 500 per thread; each side reads, marks as read and may report a message (a report is read by the team only, never by the
--   other person); the thread is exported with the account.
-- CHECK-INS: the athlete's own record of fatigue, energy, sleep and motivation (1 to 5) and a short note, once a week (Paris week); it reaches the coach ONLY when the
--   athlete ticks "share with my coach" for that very check-in, and the athlete can withdraw the sharing; no medical wording, no alert, no score.
-- No XP, no credit, no push or lock-screen content. Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_coach_template_save_v1(uuid,text,text,text), public.titan_coach_templates_v1(), public.titan_coach_template_delete_v1(uuid),
-- public.titan_coach_message_send_v1(uuid,text), public.titan_coach_messages_v1(uuid,timestamptz), public.titan_coach_messages_read_v1(uuid), public.titan_coach_unread_v1(),
-- public.titan_coach_message_report_v1(uuid,text), public.titan_coach_message_reports_admin_list_v1(), public.titan_coach_checkin_v1(uuid,jsonb,text,boolean),
-- public.titan_coach_checkins_v1(uuid), public.titan_coach_checkin_share_v1(uuid,date,boolean); drop tables private.titan_coach_message_reports, private.titan_coach_checkins,
-- private.titan_coach_messages, private.titan_coach_templates; then re-apply the extras helper of migration 56 (20261030110000_factions_pantheon_trophies.sql).

create table if not exists private.titan_coach_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  sport text not null check (char_length(sport) between 1 and 80),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists titan_coach_templates_coach_idx on private.titan_coach_templates (coach_id, updated_at desc);
create table if not exists private.titan_coach_messages (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.coach_links(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists titan_coach_messages_link_idx on private.titan_coach_messages (link_id, created_at desc);
create table if not exists private.titan_coach_checkins (
  link_id uuid not null references public.coach_links(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  scores jsonb not null,
  note text check (note is null or char_length(note) <= 500),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (link_id, week_start)
);
create table if not exists private.titan_coach_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references private.titan_coach_messages(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  status text not null default 'open' check (status in ('open', 'handled')),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
alter table private.titan_coach_templates enable row level security;
alter table private.titan_coach_messages enable row level security;
alter table private.titan_coach_checkins enable row level security;
alter table private.titan_coach_message_reports enable row level security;
revoke all on private.titan_coach_templates, private.titan_coach_messages, private.titan_coach_checkins, private.titan_coach_message_reports from public, anon, authenticated;

-- The link the caller may use right now: accepted, unrevoked, caller on one side. Returns the role.
create or replace function private.titan_coach_link_role(p_link uuid, p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case when l.coach_id = p_uid then 'coach' when l.athlete_id = p_uid then 'athlete' else null end
    from public.coach_links l where l.id = p_link and l.revoked_at is null
     and exists (select 1 from public.profiles p where p.id = p_uid and p.is_suspended is not true);
$function$;
revoke all on function private.titan_coach_link_role(uuid, uuid) from public, anon, authenticated;

-- ---- Templates (coach only)
create or replace function public.titan_coach_template_save_v1(p_id uuid, p_title text, p_sport text, p_instructions text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_title text := left(regexp_replace(btrim(coalesce(p_title, '')), '[[:cntrl:]<>]', '', 'g'), 100);
  v_text text := left(regexp_replace(coalesce(p_instructions, ''), '[\x01-\x09\x0b-\x1f\x7f<>]', '', 'g'), 2000);
  v_id uuid := p_id;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'coach_template', 120);
  if v_title = '' then raise exception 'BAD_TITLE' using errcode = '22023'; end if;
  if not exists (select 1 from public.sports s where s.id = p_sport and coalesce(s.is_active, true)) then raise exception 'SPORT_UNKNOWN' using errcode = '22023'; end if;
  if v_id is null then
    if (select count(*) from private.titan_coach_templates where coach_id = v_uid) >= 100 then raise exception 'TEMPLATE_LIMIT' using errcode = '22023'; end if;
    insert into private.titan_coach_templates (coach_id, title, sport, instructions) values (v_uid, v_title, p_sport, v_text) returning id into v_id;
  else
    update private.titan_coach_templates set title = v_title, sport = p_sport, instructions = v_text, updated_at = now() where id = v_id and coach_id = v_uid;
    if not found then raise exception 'TEMPLATE_NOT_FOUND' using errcode = '22023'; end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.titan_coach_templates_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'sport', t.sport, 'instructions', t.instructions, 'updatedAt', t.updated_at) order by t.updated_at desc)
                     from (select * from private.titan_coach_templates where coach_id = auth.uid() order by updated_at desc limit 100) t), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_coach_template_delete_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_coach_templates where id = p_id and coach_id = auth.uid();
  return found;
end;
$function$;

-- ---- Messages
create or replace function public.titan_coach_message_send_v1(p_link uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[\x01-\x09\x0b-\x1f\x7f]', '', 'g'));
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.titan_coach_link_role(p_link, v_uid) is null then raise exception 'SHARING_UNAVAILABLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'coach_message', 60);
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then raise exception 'BAD_MESSAGE' using errcode = '22023'; end if;
  if (select count(*) from private.titan_coach_messages where link_id = p_link) >= 500 then raise exception 'THREAD_FULL' using errcode = '22023'; end if;
  insert into private.titan_coach_messages (link_id, sender_id, body) values (p_link, v_uid, v_body) returning id into v_id;
  return v_id;
end;
$function$;

-- The most recent 50 messages (older ones with p_before), oldest first inside the page.
create or replace function public.titan_coach_messages_v1(p_link uuid, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.titan_coach_link_role(p_link, v_uid) is null then raise exception 'SHARING_UNAVAILABLE' using errcode = '42501'; end if;
  return jsonb_build_object('link', p_link, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'mine', m.sender_id = v_uid, 'read', m.read_at is not null) order by m.created_at)
      from (select * from private.titan_coach_messages where link_id = p_link and (p_before is null or created_at < p_before) order by created_at desc limit 50) m), '[]'::jsonb),
    'more', exists (select 1 from private.titan_coach_messages where link_id = p_link and created_at < coalesce((select min(x.created_at) from (select created_at from private.titan_coach_messages
              where link_id = p_link and (p_before is null or created_at < p_before) order by created_at desc limit 50) x), 'infinity'::timestamptz)));
end;
$function$;

create or replace function public.titan_coach_messages_read_v1(p_link uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_n integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.titan_coach_link_role(p_link, v_uid) is null then raise exception 'SHARING_UNAVAILABLE' using errcode = '42501'; end if;
  update private.titan_coach_messages set read_at = now() where link_id = p_link and sender_id <> v_uid and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

create or replace function public.titan_coach_unread_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(x.link_id, x.n) from (
    select m.link_id, count(*)::integer as n from private.titan_coach_messages m join public.coach_links l on l.id = m.link_id and l.revoked_at is null
     where (l.coach_id = v_uid or l.athlete_id = v_uid) and m.sender_id <> v_uid and m.read_at is null group by m.link_id) x), '{}'::jsonb);
end;
$function$;

create or replace function public.titan_coach_message_report_v1(p_message uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_link uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'other') then raise exception 'BAD_REASON' using errcode = '22023'; end if;
  select link_id into v_link from private.titan_coach_messages where id = p_message and sender_id <> v_uid;
  if v_link is null or private.titan_coach_link_role(v_link, v_uid) is null then raise exception 'SHARING_UNAVAILABLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'coach_report', 20);
  insert into private.titan_coach_message_reports (message_id, reporter_id, reason) values (p_message, v_uid, p_reason) on conflict do nothing;
  return true;
end;
$function$;

create or replace function public.titan_coach_message_reports_admin_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'at', r.created_at, 'body', m.body, 'sender', m.sender_id) order by r.created_at)
                     from (select * from private.titan_coach_message_reports where status = 'open' order by created_at limit 100) r join private.titan_coach_messages m on m.id = r.message_id), '[]'::jsonb);
end;
$function$;

-- ---- Check-ins
create or replace function public.titan_coach_checkin_v1(p_link uuid, p_scores jsonb, p_note text default null, p_shared boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_week date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date;
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]<>]', '', 'g')), '');
  v_scores jsonb := '{}'::jsonb;
  k text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.titan_coach_link_role(p_link, v_uid) is distinct from 'athlete' then raise exception 'ATHLETE_ONLY' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'coach_checkin', 30);
  if jsonb_typeof(p_scores) is distinct from 'object' then raise exception 'BAD_SCORES' using errcode = '22023'; end if;
  foreach k in array array['fatigue', 'energy', 'sleep', 'motivation'] loop
    if p_scores ? k then
      if jsonb_typeof(p_scores -> k) is distinct from 'number' or (p_scores ->> k)::numeric not in (1, 2, 3, 4, 5) then raise exception 'BAD_SCORES' using errcode = '22023'; end if;
      v_scores := v_scores || jsonb_build_object(k, (p_scores ->> k)::integer);
    end if;
  end loop;
  if v_scores = '{}'::jsonb then raise exception 'BAD_SCORES' using errcode = '22023'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'BAD_NOTE' using errcode = '22023'; end if;
  insert into private.titan_coach_checkins (link_id, week_start, scores, note, shared) values (p_link, v_week, v_scores, v_note, coalesce(p_shared, false))
  on conflict (link_id, week_start) do update set scores = excluded.scores, note = excluded.note, shared = excluded.shared, updated_at = now();
  return jsonb_build_object('week', v_week, 'shared', coalesce(p_shared, false));
end;
$function$;

create or replace function public.titan_coach_checkin_share_v1(p_link uuid, p_week date, p_shared boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.titan_coach_link_role(p_link, v_uid) is distinct from 'athlete' then raise exception 'ATHLETE_ONLY' using errcode = '42501'; end if;
  update private.titan_coach_checkins set shared = coalesce(p_shared, false), updated_at = now() where link_id = p_link and week_start = p_week;
  return found;
end;
$function$;

-- The athlete reads all of their own check-ins; the coach reads only the ones the athlete shared.
create or replace function public.titan_coach_checkins_v1(p_link uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_role := private.titan_coach_link_role(p_link, v_uid);
  if v_role is null then raise exception 'SHARING_UNAVAILABLE' using errcode = '42501'; end if;
  return jsonb_build_object('role', v_role, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('week', c.week_start, 'scores', c.scores, 'note', c.note, 'shared', c.shared) order by c.week_start desc)
      from (select * from private.titan_coach_checkins where link_id = p_link and (v_role = 'athlete' or shared) order by week_start desc limit 12) c), '[]'::jsonb));
end;
$function$;

revoke all on function public.titan_coach_template_save_v1(uuid, text, text, text), public.titan_coach_templates_v1(), public.titan_coach_template_delete_v1(uuid),
  public.titan_coach_message_send_v1(uuid, text), public.titan_coach_messages_v1(uuid, timestamptz), public.titan_coach_messages_read_v1(uuid), public.titan_coach_unread_v1(),
  public.titan_coach_message_report_v1(uuid, text), public.titan_coach_message_reports_admin_list_v1(), public.titan_coach_checkin_v1(uuid, jsonb, text, boolean),
  public.titan_coach_checkins_v1(uuid), public.titan_coach_checkin_share_v1(uuid, date, boolean) from public, anon;
grant execute on function public.titan_coach_template_save_v1(uuid, text, text, text), public.titan_coach_templates_v1(), public.titan_coach_template_delete_v1(uuid),
  public.titan_coach_message_send_v1(uuid, text), public.titan_coach_messages_v1(uuid, timestamptz), public.titan_coach_messages_read_v1(uuid), public.titan_coach_unread_v1(),
  public.titan_coach_message_report_v1(uuid, text), public.titan_coach_message_reports_admin_list_v1(), public.titan_coach_checkin_v1(uuid, jsonb, text, boolean),
  public.titan_coach_checkins_v1(uuid), public.titan_coach_checkin_share_v1(uuid, date, boolean) to authenticated;

-- The export gains the coach templates, the player's own coach messages and check-ins (the helper stays cumulative).
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
                                 from private.titan_coach_checkins c join public.coach_links l on l.id = c.link_id where l.athlete_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
