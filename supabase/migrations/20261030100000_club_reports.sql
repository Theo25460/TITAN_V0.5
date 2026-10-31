-- V11-73 (COM-C8, moderation): a member reports an announcement or a club, the TITAN team reviews the report. Text written by other people
-- needs a way to be reported and a human decision (store policies on user-generated content ask for both). A report names the club, optionally one
-- announcement, a reason from a short list and at most 300 characters of explanation. Only a member of the club (or anyone, for a club that is open
-- to discovery) can report; one open report per account and target; 20 reports per hour. The team (profiles.role admin) lists the open reports with the
-- text concerned and decides: dismiss, remove the announcement, or archive the club. Reports are never shown to the club's administrators, nor to
-- the reported people. A reporter's identity is kept for the team only and removed (not the report) when the reporter erases their account.
-- Own reports are exported (extras helper, kept cumulative). Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_club_report_v1(uuid,uuid,text,text), public.titan_club_reports_admin_list_v1(), public.titan_club_report_resolve_v1(uuid,text,text);
-- drop table private.titan_club_reports; then re-apply the extras helper of migration 52 (20261030090000_clubs.sql).

create table if not exists private.titan_club_reports (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references private.titan_clubs(id) on delete cascade,
  announcement_id uuid references private.titan_club_announcements(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  details text check (details is null or char_length(details) <= 300),
  status text not null default 'open' check (status in ('open', 'dismissed', 'announcement_removed', 'club_archived')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  note text check (note is null or char_length(note) <= 300)
);
create unique index if not exists titan_club_reports_open_uniq on private.titan_club_reports (reporter_id, club_id, coalesce(announcement_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open' and reporter_id is not null;
create index if not exists titan_club_reports_status_idx on private.titan_club_reports (status, created_at);
alter table private.titan_club_reports enable row level security;
revoke all on private.titan_club_reports from public, anon, authenticated;

create or replace function public.titan_club_report_v1(p_club uuid, p_announcement uuid, p_reason text, p_details text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_details text := private.titan_club_text(p_details, 300);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_report', 20);
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'other') then raise exception 'BAD_REASON' using errcode = '22023'; end if;
  if v_details is not null and char_length(v_details) > 300 then raise exception 'BAD_DETAILS' using errcode = '22023'; end if;
  if not exists (select 1 from private.titan_clubs c where c.id = p_club and c.archived_at is null
                  and (c.discoverable or exists (select 1 from private.titan_club_members m where m.club_id = c.id and m.user_id = v_uid))) then
    raise exception 'CLUB_NOT_FOUND' using errcode = '22023';
  end if;
  if p_announcement is not null and not exists (select 1 from private.titan_club_announcements a where a.id = p_announcement and a.club_id = p_club and a.removed_at is null) then
    raise exception 'CLUB_NOT_FOUND' using errcode = '22023';
  end if;
  insert into private.titan_club_reports (club_id, announcement_id, reporter_id, reason, details)
  values (p_club, p_announcement, v_uid, p_reason, v_details) on conflict do nothing;
  return true;
end;
$function$;

create or replace function public.titan_club_reports_admin_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'clubId', r.club_id, 'club', c.name, 'announcementId', r.announcement_id, 'announcement', a.body,
             'reason', r.reason, 'details', r.details, 'at', r.created_at,
             'sameTarget', (select count(*) from private.titan_club_reports o where o.status = 'open' and o.club_id = r.club_id and o.announcement_id is not distinct from r.announcement_id)) order by r.created_at)
      from (select * from private.titan_club_reports where status = 'open' order by created_at limit 100) r
      join private.titan_clubs c on c.id = r.club_id left join private.titan_club_announcements a on a.id = r.announcement_id), '[]'::jsonb);
end;
$function$;

-- Decisions: dismiss | remove_announcement | archive_club. The decision closes every open report on the same target.
create or replace function public.titan_club_report_resolve_v1(p_report uuid, p_action text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_r private.titan_club_reports%rowtype;
  v_status text;
  v_note text := private.titan_club_text(p_note, 300);
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_action not in ('dismiss', 'remove_announcement', 'archive_club') then raise exception 'BAD_ACTION' using errcode = '22023'; end if;
  select * into v_r from private.titan_club_reports where id = p_report and status = 'open';
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode = '22023'; end if;
  if p_action = 'remove_announcement' and v_r.announcement_id is null then raise exception 'NO_ANNOUNCEMENT' using errcode = '22023'; end if;
  v_status := case p_action when 'dismiss' then 'dismissed' when 'remove_announcement' then 'announcement_removed' else 'club_archived' end;
  if p_action = 'remove_announcement' then update private.titan_club_announcements set removed_at = coalesce(removed_at, now()) where id = v_r.announcement_id; end if;
  if p_action = 'archive_club' then update private.titan_clubs set archived_at = coalesce(archived_at, now()) where id = v_r.club_id; end if;
  update private.titan_club_reports set status = v_status, handled_by = v_uid, handled_at = now(), note = v_note
   where status = 'open' and club_id = v_r.club_id and (id = v_r.id or (p_action <> 'dismiss' and announcement_id is not distinct from v_r.announcement_id) or p_action = 'archive_club');
  return true;
end;
$function$;

revoke all on function public.titan_club_report_v1(uuid, uuid, text, text), public.titan_club_reports_admin_list_v1(), public.titan_club_report_resolve_v1(uuid, text, text) from public, anon;
grant execute on function public.titan_club_report_v1(uuid, uuid, text, text), public.titan_club_reports_admin_list_v1(), public.titan_club_report_resolve_v1(uuid, text, text) to authenticated;

-- The export gains the reports the account filed (the helper stays cumulative).
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
                               from private.titan_club_reports r where r.reporter_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
