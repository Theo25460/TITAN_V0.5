-- TITAN+ private report. Read-only; no client-selected owner or entitlement.
create or replace function public.titan_training_insights(
  p_from timestamptz, p_to timestamptz, p_sport text default null,
  p_timezone text default 'Europe/Paris'
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_uid
      and p.is_elite is true and p.is_suspended is not true
      and (p.elite_ends_at is null or p.elite_ends_at > now())
      and p.elite_refunded_at is null
  ) then raise exception 'TITAN_PLUS_REQUIRED'; end if;
  if p_from is null or p_to is null or p_from >= p_to
     or p_to > now() + interval '5 minutes'
     or p_to - p_from > interval '366 days'
     or p_from < now() - interval '5 years'
     or coalesce(length(p_sport),0) > 100 then
    raise exception 'INVALID_REPORT_PERIOD';
  end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then raise exception 'INVALID_TIMEZONE'; end if;

  with periods(period, start_at, end_at) as (
    values ('current', p_from, p_to), ('previous', p_from-(p_to-p_from), p_from)
  ), measured as (
    select l.id,l.sport,l.date,l.unit,l.val,d.minutes,
      case when l.details#>>'{bio,rpe}' ~ '^(10|[1-9])(\.[0-9]{1,2})?$'
        then case when (l.details#>>'{bio,rpe}')::numeric <= 10
          then (l.details#>>'{bio,rpe}')::numeric end end as rpe
    from public.training_logs l
    left join lateral (
      select raw::numeric as minutes from (values
        (1,l.details->>'duration'), (2,l.details->>'val2'),
        (3,l.details#>>'{gpxStats,movingMinutes}'),
        (4,case when l.unit='min' then l.val::text when l.unit='h' then (l.val*60)::text end)
      ) candidates(priority,raw)
      where case when raw ~ '^[0-9]{1,6}(\.[0-9]{1,8})?$'
        then raw::numeric > 0 and raw::numeric <= 1440 else false end
      order by priority limit 1
    ) d on true
    where l.user_id = v_uid and l.archived_at is null
      and l.date >= p_from-(p_to-p_from) and l.date < p_to
      and (p_sport is null or l.sport = p_sport)
  ), totals as (
    select p.period, count(m.id) as sessions,
      count(m.minutes) as duration_measured, coalesce(sum(m.minutes),0) as minutes,
      count(m.id) filter(where m.unit='km') as distance_measured,
      coalesce(sum(m.val) filter(where m.unit='km'),0) as distance,
      count(distinct (m.date at time zone p_timezone)::date) as active_days,
      count(m.id) filter(where m.rpe is not null and m.minutes is not null) as load_measured,
      coalesce(sum(m.minutes*m.rpe),0) as reported_load,
      round(avg(m.rpe),1) as average_rpe
    from periods p left join measured m on m.date >= p.start_at and m.date < p.end_at
    group by p.period
  ), sports as (
    select sport,count(*) as sessions,count(minutes) as duration_measured,
      coalesce(sum(minutes),0) as minutes from measured
    where date >= p_from group by sport
  )
  select jsonb_build_object(
    'from',p_from,'to',p_to,'previous_from',p_from-(p_to-p_from),'timezone',p_timezone,
    'periods',(select jsonb_object_agg(period,to_jsonb(t)-'period') from totals t),
    'sports',coalesce((select jsonb_agg(to_jsonb(s) order by sessions desc,sport) from sports s),'[]'::jsonb),
    'generated_at',now()
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.titan_training_insights(timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.titan_training_insights(timestamptz,timestamptz,text,text) to authenticated;
comment on function public.titan_training_insights(timestamptz,timestamptz,text,text)
  is 'TITAN+ owner-only report. Missing duration/RPE are counted explicitly; archived sessions excluded.';
