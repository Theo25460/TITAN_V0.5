-- Additive, read-only personal analysis. No writes to sessions, rewards or billing.
-- Existing training_logs_user_date_idx / user_sport_date_idx cover the bounded owner scan.
create or replace function public.titan_compare_periods(
  p_weeks integer default 4,
  p_sport text default null,
  p_timezone text default 'UTC'
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  entitled boolean;
  monday date;
  date_from date;
  date_to date;
  time_from timestamptz;
  time_to timestamptz;
  payload jsonb;
  result jsonb;
  part integer;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select coalesce(p.is_elite,false) and not coalesce(p.is_suspended,false)
    and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at>now())
    into entitled from public.profiles p where p.id=u;
  result:=jsonb_build_object('version',1,'owner',u,'available',coalesce(entitled,false));
  if not coalesce(entitled,false) then return result||jsonb_build_object('reason','premium_required'); end if;

  if p_weeks is null or p_weeks not in (4,12,26)
    or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=p_timezone)
    or (p_sport is not null and not exists(select 1 from public.sports s where s.id=p_sport)) then
    raise exception 'INVALID_COMPARISON_OPTIONS' using errcode='22023';
  end if;
  monday:=date_trunc('week',timezone(p_timezone,now()))::date;
  result:=result||jsonb_build_object('as_of',now(),'timezone',p_timezone,'weeks',p_weeks,'sport',p_sport);

  for part in 0..1 loop
    date_from:=monday-(part+1)*p_weeks*7;
    date_to:=monday-part*p_weeks*7;
    time_from:=date_from::timestamp at time zone p_timezone;
    time_to:=date_to::timestamp at time zone p_timezone;
    with sessions as materialized (
      select l.id,l.sport,l.date,timezone(p_timezone,l.date)::date as day,
        coalesce((e.value->>'minutes')::numeric,0) as minutes,
        coalesce((e.value->>'estimated')::boolean,false) as estimated
      from public.training_logs l
      cross join lateral (select public.titan_effort_v300(l.sport,l.unit,l.val,l.details) as value) e
      where l.user_id=u and l.archived_at is null and l.date>=time_from and l.date<time_to
        and (p_sport is null or l.sport=p_sport)
    ), weekly as (
      select date_from+k*7 as date_start,date_from+(k+1)*7 as date_end,
        count(s.id) as sessions,count(distinct s.day) as active_days,coalesce(sum(s.minutes),0) as minutes
      from generate_series(0,p_weeks-1) k
      left join sessions s on s.day>=date_from+k*7 and s.day<date_from+(k+1)*7
      group by k
    ), examples as (
      select id,sport,date,minutes,estimated from sessions order by date desc,id desc limit 5
    )
    select jsonb_build_object(
      'from',date_from,'to',date_to,
      'sessions',count(*),'active_days',count(distinct day),'minutes',round(coalesce(sum(minutes),0),1),
      'estimated_sessions',count(*) filter(where estimated),
      'series',(select jsonb_agg(jsonb_build_object('from',date_start,'to',date_end,'sessions',sessions,
          'active_days',active_days,'minutes',round(minutes,1)) order by date_start) from weekly),
      'sources',coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc,x.id desc) from examples x),'[]'::jsonb)
    ) into payload from sessions;
    result:=result||jsonb_build_object(case when part=0 then 'recent' else 'previous' end,payload);
  end loop;
  return result;
end;
$$;
revoke all on function public.titan_compare_periods(integer,text,text) from public,anon;
grant execute on function public.titan_compare_periods(integer,text,text) to authenticated;
comment on function public.titan_compare_periods(integer,text,text) is
  'TITAN+ own-session comparisons over equal complete local calendar weeks. Server entitlement, RLS, no writes.';
