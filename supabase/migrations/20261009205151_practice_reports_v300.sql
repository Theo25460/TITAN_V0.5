-- Personal calendar reports. Existing owner/date index, read-only RLS scan, no billing/reward writes.
create or replace function public.titan_practice_report(
  p_period text default 'month', p_offset integer default 0, p_timezone text default 'UTC'
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  u uuid := auth.uid();
  entitled boolean;
  local_now timestamp;
  date_from date;
  date_to date;
  bucket_last date;
  step interval;
  time_from timestamptz;
  time_to timestamptz;
  result jsonb;
  payload jsonb;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select coalesce(p.is_elite,false) and not coalesce(p.is_suspended,false)
    and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at>now())
    into entitled from public.profiles p where p.id=u;
  result:=jsonb_build_object('version',1,'owner',u,'available',coalesce(entitled,false));
  if not coalesce(entitled,false) then return result||jsonb_build_object('reason','premium_required'); end if;
  if p_period is null or p_period not in ('month','year') or p_offset is null or p_offset not in (0,1)
    or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=p_timezone) then
    raise exception 'INVALID_REPORT_OPTIONS' using errcode='22023';
  end if;
  local_now:=timezone(p_timezone,now());
  step:=case when p_period='month' then interval '1 day' else interval '1 month' end;
  date_from:=(date_trunc(p_period,local_now)-p_offset*case when p_period='month' then interval '1 month' else interval '1 year' end)::date;
  date_to:=(date_from::timestamp+case when p_period='month' then interval '1 month' else interval '1 year' end)::date;
  bucket_last:=case when p_offset=0 then date_trunc(case when p_period='month' then 'day' else 'month' end,local_now)::date
    else (date_to::timestamp-step)::date end;
  time_from:=date_from::timestamp at time zone p_timezone;
  time_to:=least(date_to::timestamp at time zone p_timezone,now());
  with sessions as materialized (
    select l.id,l.sport,l.date,timezone(p_timezone,l.date)::date as day,
      coalesce((e.value->>'minutes')::numeric,0) as minutes,
      coalesce((e.value->>'estimated')::boolean,false) as estimated
    from public.training_logs l
    cross join lateral (select public.titan_effort_v300(l.sport,l.unit,l.val,l.details) as value) e
    where l.user_id=u and l.archived_at is null and l.date>=time_from and l.date<time_to
  ), by_sport as (
    select sport,count(*) as sessions,count(distinct day) as active_days,
      round(sum(minutes),1) as minutes,count(*) filter(where estimated) as estimated_sessions
    from sessions group by sport
  ), calendar as (
    select k::date as date_start,(k+step)::date as date_end,count(s.id) as sessions,
      count(distinct s.day) as active_days,round(coalesce(sum(s.minutes),0),1) as minutes,
      count(s.id) filter(where s.estimated) as estimated_sessions
    from generate_series(date_from::timestamp,bucket_last::timestamp,step) k
    left join sessions s on s.day>=k::date and s.day<(k+step)::date group by k
  ), examples as (
    select id,sport,date,minutes,estimated from sessions order by date desc,id desc limit 5
  )
  select jsonb_build_object(
    'sessions',count(*),'active_days',count(distinct day),'minutes',round(coalesce(sum(minutes),0),1),
    'estimated_sessions',count(*) filter(where estimated),
    'sports',coalesce((select jsonb_agg(to_jsonb(s) order by s.minutes desc,s.sport) from by_sport s),'[]'::jsonb),
    'series',(select jsonb_agg(jsonb_build_object('from',date_start,'to',date_end,'sessions',sessions,
      'active_days',active_days,'minutes',minutes,'estimated_sessions',estimated_sessions) order by date_start) from calendar),
    'sources',coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc,x.id desc) from examples x),'[]'::jsonb)
  ) into payload from sessions;
  return result||payload||jsonb_build_object('period',p_period,'offset',p_offset,'timezone',p_timezone,
    'as_of',now(),'from',date_from,'to',date_to,'current',p_offset=0);
end;
$$;
revoke all on function public.titan_practice_report(text,integer,text) from public,anon;
grant execute on function public.titan_practice_report(text,integer,text) to authenticated;
comment on function public.titan_practice_report(text,integer,text) is
  'TITAN+ own monthly/yearly practice report; local calendar, provisional current period, fresh entitlement, RLS, no writes.';
