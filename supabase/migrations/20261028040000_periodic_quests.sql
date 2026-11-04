-- V11-13 / V11-15 (V1.1): one optional weekly quest and one optional monthly quest, personalised from the sessions the account already has.
-- Everything is computed by the server from admissible sessions only: not archived, not suspicious, not rejected/flagged/pending review,
-- not historical, confirmed by the server (details.serverReward), and with no reward held or cancelled by the risk review.
-- Nothing is drawn at random and nothing is stored but the claim of a finished quest: the quest is a pure function of the history, so a
-- session can never count twice and a repeat call changes nothing.
-- WEEK (Monday to Sunday, Europe/Paris), by order of precedence:
--   starter     fewer than two sessions in 8 weeks or fewer than two active weeks in 4 : one session of 15 minutes or more
--   return      no session in the last two complete weeks                            : one session of 20 minutes or more
--   progress    stable (at least the usual active days in each of the last 3 weeks, usual >= 2) and one week in three: +10 % of usual minutes
--               (never more than +60 minutes), so a quest never asks to beat the previous week systematically
--   constancy   otherwise                                                                : the usual number of active days (1 to 5)
-- MONTH:
--   multisport  the player already practised at least two sports in each recent month and in the last 90 days : 2 or 3 different sports
--               among those already practised (never one to discover)
--   regularity  alternative for a player with a single sport or irregular variety                           : the usual active days (4 to 12)
-- A finished quest can be claimed once: a cosmetic keepsake, no XP, no credits, no ranking effect (private claims table, no API grant).
-- Additive and backward compatible. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_periodic_quests_v1(), public.titan_periodic_quest_claim_v1(text),
-- private.titan_periodic_quests(uuid, timestamptz), private.titan_eligible_sessions(uuid, timestamptz, timestamptz); drop table private.titan_periodic_quest_claims;

create table if not exists private.titan_periodic_quest_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('week', 'month')),
  period_start date not null,
  kind text not null check (kind in ('starter', 'return', 'progress', 'constancy', 'multisport', 'regularity')),
  claimed_at timestamptz not null default now(),
  primary key (user_id, scope, period_start)
);
alter table private.titan_periodic_quest_claims enable row level security;
revoke all on table private.titan_periodic_quest_claims from public, anon, authenticated;

create or replace function private.titan_eligible_sessions(p_uid uuid, p_from timestamptz, p_to timestamptz)
returns table(log_id uuid, sport text, day date, minutes numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select l.id, l.sport, (l.date at time zone 'Europe/Paris')::date,
         greatest(0, coalesce(public.titan_numeric_from_json(l.details -> 'effort', 'minutes'), public.titan_numeric_from_json(l.details, 'duration'), 0))
  from public.training_logs l
  where l.user_id = p_uid and l.date >= p_from and l.date < p_to and l.val > 0
    and l.archived_at is null and l.is_suspicious is not true
    and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review')
    and l.details ->> 'serverReward' = 'true' and coalesce(l.details ->> 'historical', 'false') <> 'true'
    and not exists (select 1 from private.titan_reward_holds h where h.log_id = l.id and h.status in ('held', 'cancelled'));
$function$;
revoke all on function private.titan_eligible_sessions(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function private.titan_periodic_quests(p_uid uuid, p_now timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (p_now at time zone 'Europe/Paris')::date;
  v_week date := date_trunc('week', v_today)::date;
  v_month date := date_trunc('month', v_today)::date;
  v_next_month date := (date_trunc('month', v_today) + interval '1 month')::date;
  v_from timestamptz := ((least(v_week - 56, (v_month - interval '3 months')::date, v_today - 90))::timestamp at time zone 'Europe/Paris');
  v_to timestamptz := ((greatest(v_week + 7, v_next_month))::timestamp at time zone 'Europe/Paris');
  v_s jsonb;   -- admissible sessions of the window, read once
  v_wk jsonb;  -- eight complete weeks before this one
  v_mo jsonb;  -- three complete months before this one
  v_sessions8 integer; v_active_weeks integer; v_recent2 integer; v_med_days numeric; v_med_min numeric; v_base_days integer; v_stable boolean;
  v_kind text; v_target jsonb; v_progress jsonb; v_complete boolean; v_focus jsonb;
  v_w_days integer; v_w_minutes numeric; v_w_long integer;
  v_week_q jsonb; v_month_q jsonb;
  v_m_sports integer; v_m_days integer; v_m_med_sports numeric; v_m_med_days numeric; v_sports90 integer; v_m_ok boolean; v_m_target integer; v_m_active boolean;
  v_weeks_claimed integer; v_months_claimed integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', log_id, 'sport', sport, 'day', day, 'min', minutes)), '[]'::jsonb) into v_s
    from private.titan_eligible_sessions(p_uid, v_from, v_to);

  select coalesce(jsonb_agg(jsonb_build_object('k', g.k, 'days', w.days, 'minutes', w.minutes, 'sessions', w.sessions) order by g.k), '[]'::jsonb) into v_wk
    from generate_series(1, 8) g(k)
    cross join lateral (
      select count(distinct s.day)::integer as days, coalesce(sum(s.min), 0) as minutes, count(s.id)::integer as sessions
      from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric)
      where s.day >= v_week - 7 * g.k and s.day < v_week - 7 * g.k + 7) w;

  select coalesce(sum(w.sessions), 0), count(*) filter (where w.k <= 4 and w.days > 0)
    into v_sessions8, v_active_weeks from jsonb_to_recordset(v_wk) w(k integer, days integer, minutes numeric, sessions integer);
  select coalesce(sum(w.sessions), 0) into v_recent2 from jsonb_to_recordset(v_wk) w(k integer, days integer, minutes numeric, sessions integer) where w.k <= 2;
  select percentile_cont(0.5) within group (order by w.days), percentile_cont(0.5) within group (order by w.minutes) into v_med_days, v_med_min
    from jsonb_to_recordset(v_wk) w(k integer, days integer, minutes numeric, sessions integer) where w.k <= 4;
  select coalesce(jsonb_agg(f.sport order by f.m desc), '[]'::jsonb) into v_focus from (
    select s.sport, sum(s.min) as m from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric)
    where s.day >= v_week - 56 and s.day < v_week + 7 group by s.sport having count(*) >= 2 order by sum(s.min) desc limit 3) f;
  select count(distinct s.day)::integer, coalesce(sum(s.min), 0) into v_w_days, v_w_minutes
    from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric) where s.day >= v_week and s.day < v_week + 7;

  if v_sessions8 < 2 or v_active_weeks < 2 then
    v_kind := 'starter';
    v_target := jsonb_build_object('sessions', 1, 'minSessionMinutes', 15);
    select count(*)::integer into v_w_long from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric) where s.day >= v_week and s.day < v_week + 7 and s.min >= 15;
    v_progress := jsonb_build_object('sessions', v_w_long); v_complete := v_w_long >= 1;
  elsif v_recent2 = 0 then
    v_kind := 'return';
    v_target := jsonb_build_object('sessions', 1, 'minSessionMinutes', 20);
    select count(*)::integer into v_w_long from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric) where s.day >= v_week and s.day < v_week + 7 and s.min >= 20;
    v_progress := jsonb_build_object('sessions', v_w_long); v_complete := v_w_long >= 1;
  else
    v_base_days := greatest(1, least(5, round(coalesce(v_med_days, 1))::integer));
    select coalesce(bool_and(w.days >= v_base_days), false) into v_stable
      from jsonb_to_recordset(v_wk) w(k integer, days integer, minutes numeric, sessions integer) where w.k <= 3;
    if v_base_days >= 2 and v_stable and extract(week from v_week)::integer % 3 = 0 and coalesce(v_med_min, 0) > 0 then
      v_kind := 'progress';
      v_target := jsonb_build_object('minutes', greatest(30, (ceil(least(v_med_min * 1.10, v_med_min + 60) / 5) * 5)::integer));
      v_progress := jsonb_build_object('minutes', round(v_w_minutes)::integer); v_complete := v_w_minutes >= (v_target ->> 'minutes')::numeric;
    else
      v_kind := 'constancy';
      v_target := jsonb_build_object('days', v_base_days);
      v_progress := jsonb_build_object('days', v_w_days); v_complete := v_w_days >= v_base_days;
    end if;
  end if;
  v_week_q := jsonb_build_object('scope', 'week', 'period_start', v_week, 'period_end', v_week + 6, 'kind', v_kind, 'target', v_target, 'progress', v_progress,
    'complete', v_complete, 'focus', v_focus,
    'claimed', exists (select 1 from private.titan_periodic_quest_claims c where c.user_id = p_uid and c.scope = 'week' and c.period_start = v_week));

  -- Month: variety already practised, or regularity for a single-sport player.
  select count(distinct s.sport)::integer, count(distinct s.day)::integer into v_m_sports, v_m_days
    from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric) where s.day >= v_month and s.day < v_next_month;
  select count(distinct s.sport)::integer into v_sports90 from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric) where s.day > v_today - 90 and s.day <= v_today;
  select coalesce(jsonb_agg(jsonb_build_object('k', g.k, 'sports', m.sports, 'days', m.days) order by g.k), '[]'::jsonb) into v_mo
    from generate_series(1, 3) g(k)
    cross join lateral (
      select count(distinct s.sport)::integer as sports, count(distinct s.day)::integer as days
      from jsonb_to_recordset(v_s) s(id uuid, sport text, day date, min numeric)
      where s.day >= (v_month - make_interval(months => g.k))::date and s.day < (v_month - make_interval(months => g.k - 1))::date) m;
  select percentile_cont(0.5) within group (order by m.sports), percentile_cont(0.5) within group (order by m.days) into v_m_med_sports, v_m_med_days
    from jsonb_to_recordset(v_mo) m(k integer, sports integer, days integer);
  select coalesce(bool_and(m.sports >= 2), false), coalesce(bool_or(m.days > 0), false) into v_m_ok, v_m_active
    from jsonb_to_recordset(v_mo) m(k integer, sports integer, days integer) where m.days > 0;
  if v_sports90 >= 2 and v_m_ok and v_m_active then
    v_m_target := least(3, greatest(2, round(v_m_med_sports)::integer), v_sports90);
    v_month_q := jsonb_build_object('scope', 'month', 'period_start', v_month, 'period_end', v_next_month - 1, 'kind', 'multisport',
      'target', jsonb_build_object('sports', v_m_target), 'progress', jsonb_build_object('sports', v_m_sports), 'complete', v_m_sports >= v_m_target);
  else
    v_m_target := greatest(4, least(12, round(coalesce(v_m_med_days, 0))::integer));
    v_month_q := jsonb_build_object('scope', 'month', 'period_start', v_month, 'period_end', v_next_month - 1, 'kind', 'regularity',
      'target', jsonb_build_object('days', v_m_target), 'progress', jsonb_build_object('days', v_m_days), 'complete', v_m_days >= v_m_target);
  end if;
  v_month_q := v_month_q || jsonb_build_object('claimed', exists (select 1 from private.titan_periodic_quest_claims c where c.user_id = p_uid and c.scope = 'month' and c.period_start = v_month));

  select count(*) filter (where scope = 'week'), count(*) filter (where scope = 'month') into v_weeks_claimed, v_months_claimed
    from private.titan_periodic_quest_claims where user_id = p_uid;
  return jsonb_build_object('version', 1, 'week', v_week_q, 'month', v_month_q, 'souvenirs', jsonb_build_object('weeks', v_weeks_claimed, 'months', v_months_claimed));
end;
$function$;
revoke all on function private.titan_periodic_quests(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.titan_periodic_quests_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return private.titan_periodic_quests(v_uid, now());
end;
$function$;

create or replace function public.titan_periodic_quest_claim_v1(p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_all jsonb;
  v_q jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_scope is null or p_scope not in ('week', 'month') then raise exception 'INVALID_SCOPE' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  perform private.titan_rate_limit(v_uid, 'quest_claim', 20);
  v_all := private.titan_periodic_quests(v_uid, now());
  v_q := v_all -> p_scope;
  if (v_q ->> 'claimed')::boolean then return v_all; end if;
  if not (v_q ->> 'complete')::boolean then raise exception 'QUEST_INCOMPLETE' using errcode = '22023'; end if;
  insert into private.titan_periodic_quest_claims(user_id, scope, period_start, kind)
    values (v_uid, p_scope, (v_q ->> 'period_start')::date, v_q ->> 'kind') on conflict do nothing;
  return private.titan_periodic_quests(v_uid, now());
end;
$function$;

revoke all on function public.titan_periodic_quests_v1() from public, anon;
revoke all on function public.titan_periodic_quest_claim_v1(text) from public, anon;
grant execute on function public.titan_periodic_quests_v1() to authenticated;
grant execute on function public.titan_periodic_quest_claim_v1(text) to authenticated;
