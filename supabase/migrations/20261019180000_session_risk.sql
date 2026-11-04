-- CHEAT12 / CHEAT13 / CHEAT06: explainable per-session risk, read-only.
-- Nothing here rejects a session, changes XP/credits/rankings, or flags an account: the score is computed at call time
-- for an administrator, from signals the player's own history makes inconsistent. The existing exclusion switch
-- (training_logs.is_suspicious, already honoured by rankings and rewards) is only reported, never written.
-- States: normal (< 3) · watch (3-7) · review (8-19, candidate for exclusion from competitive rewards) · critical (>= 20).
-- Weights are the moderation ones (low 1, medium 3, high 8, critical 20), each signal counted once per session.
-- Signals: overlap (two sessions cannot both fill the same minutes), speed_jump (km/h far above the player's own median
-- for that sport), day_volume (more than 12 or 16 hours of declared activity in one UTC day).
-- `date` may be a start or an end time, so overlap counts only what overlaps under BOTH readings.
-- Additive: new private function and one admin RPC. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_session_risk_v1(uuid, integer); drop function private.titan_session_risk(uuid, integer);

-- CHEAT02 / CHEAT03: per-sport reference limits, data not code. A row says: this sport is powered by the athlete alone, and
-- no human sustains more than max_kmh over min_minutes or more (a generous bound far above the official world records, with the
-- record that justifies it). Sports without a row get no pace ceiling and no series signal: only their own history
-- and the day volume are judged (CHEAT11). Adding a discipline = inserting a row. Never used to reject anything.
create table if not exists private.titan_sport_limits (
  sport text primary key,
  max_kmh numeric not null check (max_kmh > 0),
  min_minutes integer not null default 15 check (min_minutes between 1 and 120),
  reference text not null
);
alter table private.titan_sport_limits enable row level security;
revoke all on table private.titan_sport_limits from public, anon, authenticated;
insert into private.titan_sport_limits(sport, max_kmh, min_minutes, reference) values
  ('running', 30, 15, 'World records: 5 000 m 12:35 (23.8 km/h), 10 000 m 26:11 (22.9 km/h); bound 30 km/h over 15 minutes or more'),
  ('walking', 20, 15, 'Race walking: 20 km about 1:16 (15.8 km/h), indoor 5 000 m about 18:05 (16.6 km/h); bound 20 km/h over 15 minutes or more'),
  ('swimming', 9, 15, 'World records: 800 m 7:32 (6.4 km/h), 1 500 m 14:30 (6.2 km/h); bound 9 km/h (generous: current, tide, fins) over 15 minutes or more')
on conflict (sport) do nothing;

create or replace function private.titan_session_risk(p_user uuid, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_out jsonb;
begin
  with s as materialized (
    select l.id, l.sport, l.date, l.val, l.unit, l.is_suspicious,
      -- distance in km whatever the unit of record (swimming and open water are stored in metres)
      case when l.unit = 'km' then l.val when l.unit = 'm' then l.val / 1000.0 end as dist_km,
      -- A session cannot last more than a day (the training guard refuses it on insert): clamp so that an
      -- impossible stored value can never overflow the interval arithmetic below and abort an analysis.
      least(greatest(coalesce(coalesce(nullif(public.titan_jsonb_numeric(l.details, 'val2'), 0),
                        nullif(public.titan_jsonb_numeric(l.details, 'duration'), 0)), 0), 0), 1440) as dur,
      coalesce(l.details ->> 'historical', 'false') = 'true' as hist
    from public.training_logs l
    where l.user_id = p_user and l.archived_at is null
      and l.date > now() - interval '120 days' and l.date <= now() + interval '1 day'
    order by l.date desc
    limit 1000
  ),
  recent as materialized (select * from s order by date desc limit greatest(1, least(coalesce(p_limit, 30), 100))),
  -- One row per PAIR of sessions, severity decided on that pair alone, then the worst pair per session.
  pairs as materialized (
    select r.id as rid, o.id as oid, m.minutes, m.minutes / nullif(least(r.dur, o.dur), 0) as ratio,
      (r.date = o.date and r.sport is distinct from o.sport) as same_instant
    from recent r
    join s o on o.id <> r.id and not o.hist and o.dur > 0
    cross join lateral (select least(
      extract(epoch from (least(r.date, o.date) - greatest(r.date - r.dur * interval '1 minute', o.date - o.dur * interval '1 minute'))) / 60,
      extract(epoch from (least(r.date + r.dur * interval '1 minute', o.date + o.dur * interval '1 minute') - greatest(r.date, o.date))) / 60
    ) as minutes) m
    where not r.hist and r.dur > 0 and m.minutes > 0
  ),
  overlap as materialized (
    select distinct on (rid) rid as id, minutes, ratio,
      case when ratio >= 0.9 and minutes >= 20 and not same_instant then 'high'
           when ratio >= 0.5 and minutes >= 10 then 'medium' end as severity
    from pairs
    where (ratio >= 0.9 and minutes >= 20) or (ratio >= 0.5 and minutes >= 10)
    order by rid, (case when ratio >= 0.9 and minutes >= 20 and not same_instant then 2 else 1 end) desc, minutes desc
  ),
  speed as materialized (
    select r.id, (r.dist_km / (r.dur / 60.0)) as kmh, b.median_kmh, b.prior
    from recent r
    cross join lateral (
      select percentile_cont(0.5) within group (order by o.dist_km / (o.dur / 60.0)) as median_kmh, count(*) as prior
      from s o where o.id <> r.id and o.sport = r.sport and o.dist_km is not null and not o.hist
        and o.dur >= 5 and o.dist_km > 0 and o.date < r.date) b
    where r.dist_km is not null and r.dur >= 10 and r.dist_km > 0 and not r.hist
  ),
  -- CHEAT05: a pace beyond what any human sustains over that duration (well above the corresponding world records:
  -- running 5-10 km about 23-24 km/h, race walking about 14 km/h, swimming 1500 m about 6.2 km/h). Only sports whose
  -- speed cannot be motor-assisted are listed; the ceilings are generous on purpose and never reject anything.
  superhuman as materialized (
    select r.id from recent r join private.titan_sport_limits lim on lim.sport = r.sport
    where not r.hist and r.dist_km > 0 and r.dur >= lim.min_minutes
      and (r.dist_km / (r.dur / 60.0)) > lim.max_kmh
  ),
  -- CHEAT09: three or more distinct sessions (distinct dates) of one human-powered sport within 14 days, each at least
  -- 1.5 x that sport's own median pace (median over the window, at least 8 sessions, sessions of 20 minutes or more; only the human-powered sports listed in private.titan_sport_limits). A
  -- watch-level signal on its own (medium): it reaches human review only together with another signal, so a returning
  -- or fast-improving athlete is looked at, never held for it. Motor-assisted sports (cycling, skiing) are left out.
  sport_median as materialized (
    select o.sport, percentile_cont(0.5) within group (order by o.dist_km / (o.dur / 60.0)) as median_kmh
    from s o where o.sport in (select sport from private.titan_sport_limits) and o.dist_km > 0 and not o.hist and o.dur >= 20
    group by o.sport having count(*) >= 8
  ),
  fast as materialized (
    select distinct on (o.sport, o.date) o.id, o.sport, o.date from s o join sport_median m on m.sport = o.sport
    where o.dist_km > 0 and not o.hist and o.dur >= 20
      and (o.dist_km / (o.dur / 60.0)) >= 1.5 * m.median_kmh
    order by o.sport, o.date, o.id
  ),
  series as materialized (
    select r.id, count(*) as n
    from recent r join fast f on f.sport = r.sport and f.date <= r.date and f.date > r.date - interval '14 days'
    where r.id in (select id from fast)
    group by r.id
  ),
  day_total as materialized (
    select r.id, d.minutes from recent r
    cross join lateral (select coalesce(sum(o.dur), 0) as minutes from s o
      where not o.hist and (o.date at time zone 'utc')::date = (r.date at time zone 'utc')::date) d
    where not r.hist
  ),
  sig as (
    select r.id, x.code, x.severity, x.detail
    from recent r
    left join overlap ov on ov.id = r.id
    left join speed sp on sp.id = r.id
    left join day_total dt on dt.id = r.id
    left join superhuman sh on sh.id = r.id
    left join series se on se.id = r.id
    cross join lateral (values
      ('overlap', ov.severity,
        jsonb_build_object('overlapMinutes', round(coalesce(ov.minutes, 0)::numeric, 1), 'shareOfShorter', round(coalesce(ov.ratio, 0)::numeric, 2))),
      ('speed_jump', case when sp.prior >= 5 and sp.median_kmh > 0 and sp.kmh / sp.median_kmh >= 2 then 'high'
                          when sp.prior >= 5 and sp.median_kmh > 0 and sp.kmh / sp.median_kmh >= 1.5 then 'medium' end,
        jsonb_build_object('kmh', round(coalesce(sp.kmh, 0)::numeric, 1), 'medianKmh', round(coalesce(sp.median_kmh, 0)::numeric, 1), 'priorSessions', coalesce(sp.prior, 0))),
      ('beyond_human', case when sh.id is not null then 'high' end,
        jsonb_build_object('kmh', round(coalesce(r.dist_km / nullif(r.dur / 60.0, 0), 0)::numeric, 1), 'sport', r.sport)),
      ('extraordinary_series', case when se.n >= 3 then 'medium' end,
        jsonb_build_object('sessionsInFourteenDays', coalesce(se.n, 0))),
      ('day_volume', case when dt.minutes >= 960 then 'high' when dt.minutes >= 720 then 'medium' end,
        jsonb_build_object('minutesThatDay', round(coalesce(dt.minutes, 0)::numeric, 0)))
    ) as x(code, severity, detail)
    where x.severity is not null
  ),
  scored as (
    select r.*, coalesce((select sum(private.titan_moderation_weight(g.severity)) from sig g where g.id = r.id), 0)::integer as score,
      coalesce((select jsonb_agg(jsonb_build_object('code', g.code, 'severity', g.severity,
        'points', private.titan_moderation_weight(g.severity), 'detail', g.detail)
        order by private.titan_moderation_weight(g.severity) desc, g.code) from sig g where g.id = r.id), '[]'::jsonb) as signals
    from recent r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', sc.id, 'sport', sc.sport, 'date', sc.date, 'value', sc.val, 'unit', sc.unit, 'durationMin', sc.dur,
      'historical', sc.hist, 'score', sc.score,
      'state', case when sc.score >= 20 then 'critical' when sc.score >= 8 then 'review' when sc.score >= 3 then 'watch' else 'normal' end,
      'excludedFromRankings', coalesce(sc.is_suspicious, false), 'signals', sc.signals)
    order by sc.date desc, sc.id), '[]'::jsonb)
  into v_out from scored sc;
  return v_out;
end;
$function$;
revoke all on function private.titan_session_risk(uuid, integer) from public, anon, authenticated;

-- Administrators only; the role is read from the profile, never from client metadata.
create or replace function public.titan_session_risk_v1(p_user uuid, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_sessions jsonb;
begin
  perform private.titan_moderation_require_admin();
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_sessions := private.titan_session_risk(p_user, p_limit);
  return jsonb_build_object(
    'sessions', v_sessions,
    'rule', 'Weights low 1, medium 3, high 8, critical 20, one count per signal. normal < 3, watch 3-7, review 8-19, critical >= 20. Advisory only: nothing is excluded or rejected automatically.',
    'counts', jsonb_build_object(
      'normal', (select count(*) from jsonb_array_elements(v_sessions) e where e ->> 'state' = 'normal'),
      'watch', (select count(*) from jsonb_array_elements(v_sessions) e where e ->> 'state' = 'watch'),
      'review', (select count(*) from jsonb_array_elements(v_sessions) e where e ->> 'state' = 'review'),
      'critical', (select count(*) from jsonb_array_elements(v_sessions) e where e ->> 'state' = 'critical')));
end;
$function$;
revoke all on function public.titan_session_risk_v1(uuid, integer) from public, anon;
grant execute on function public.titan_session_risk_v1(uuid, integer) to authenticated;
