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
