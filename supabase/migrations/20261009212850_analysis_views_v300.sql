-- Private analysis parameters only. No analysis output, billing, or reward writes.
create table private.titan_analysis_views (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'),
  kind text not null check(kind in ('comparison','report')),
  options jsonb not null check(jsonb_typeof(options)='object'),
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index titan_analysis_views_owner_name on private.titan_analysis_views(user_id,lower(name));
create index titan_analysis_views_owner_updated on private.titan_analysis_views(user_id,updated_at desc,id);
alter table private.titan_analysis_views enable row level security;
create policy analysis_views_owner_read on private.titan_analysis_views for select to authenticated
  using(user_id=(select auth.uid()) and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_suspended));
revoke all on private.titan_analysis_views from public,anon,authenticated;
grant usage on schema private to authenticated;
grant select on private.titan_analysis_views to authenticated;

create function public.titan_analysis_views(p_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=''
as $$
declare u uuid:=auth.uid(); entitled boolean; suspended boolean; payload jsonb; total integer;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select coalesce(p.is_suspended,false),coalesce(p.is_elite,false) and p.elite_refunded_at is null
    and (p.elite_ends_at is null or p.elite_ends_at>now()) into suspended,entitled from public.profiles p where p.id=u;
  if not found or suspended then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
  select count(*) into total from private.titan_analysis_views v where v.user_id=u;
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'kind',v.kind,'options',v.options,
    'revision',v.revision,'created_at',v.created_at,'updated_at',v.updated_at) order by v.updated_at desc,v.id),'[]'::jsonb)
    into payload from private.titan_analysis_views v where v.user_id=u and (p_id is null or v.id=p_id);
  return jsonb_build_object('version',1,'owner',u,'available',entitled,'limit',10,'count',total,'views',payload)
    ||case when entitled then '{}'::jsonb else jsonb_build_object('reason','premium_required') end;
end $$;
revoke all on function public.titan_analysis_views(uuid) from public,anon,authenticated;
grant execute on function public.titan_analysis_views(uuid) to authenticated;

create function public.titan_mutate_analysis_view(
  p_action text,p_id uuid,p_expected_revision integer,p_name text default null,p_kind text default null,p_options jsonb default null
) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s'
as $$
declare
  u uuid:=auth.uid(); entitled boolean; suspended boolean;
  v private.titan_analysis_views%rowtype; name_clean text; keys text[]; payload jsonb;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_action is null or p_action not in ('save','delete') or p_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'INVALID_VIEW_OPTIONS' using errcode='22023';
  end if;
  -- Serialize quota, create retries and revision checks for this owner only.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,30008));
  -- A billing/suspension update cannot commit between this fresh check and the write.
  select coalesce(p.is_suspended,false),coalesce(p.is_elite,false) and p.elite_refunded_at is null
    and (p.elite_ends_at is null or p.elite_ends_at>now()) into suspended,entitled
    from public.profiles p where p.id=u for share;
  if not found or suspended then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
  if p_action='save' and not entitled then raise exception 'PREMIUM_REQUIRED' using errcode='42501'; end if;
  select * into v from private.titan_analysis_views where id=p_id for update;
  if found and v.user_id<>u then raise exception 'VIEW_NOT_FOUND' using errcode='P0002'; end if;
  if p_action='delete' then
    if p_expected_revision<1 or p_name is not null or p_kind is not null or p_options is not null then
      raise exception 'INVALID_VIEW_OPTIONS' using errcode='22023';
    end if;
    if v.id is null then raise exception 'VIEW_NOT_FOUND' using errcode='P0002'; end if;
    if v.revision<>p_expected_revision then raise exception 'VIEW_VERSION_CONFLICT' using errcode='40001'; end if;
    delete from private.titan_analysis_views where id=p_id and user_id=u;
    return jsonb_build_object('version',1,'owner',u,'action','delete','deleted_id',p_id);
  end if;
  name_clean:=btrim(p_name);
  if name_clean is null or char_length(name_clean) not between 1 and 40 or name_clean ~ '[[:cntrl:]]'
    or p_kind is null or p_kind not in ('comparison','report') or jsonb_typeof(p_options) is distinct from 'object'
    or octet_length(p_options::text)>512 then
    raise exception 'INVALID_VIEW_OPTIONS' using errcode='22023';
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(p_options) k;
  if p_kind='report' then
    if keys is distinct from array['offset','period'] or p_options->'period' not in ('"month"'::jsonb,'"year"'::jsonb)
      or p_options->'offset' not in ('0'::jsonb,'1'::jsonb) then
      raise exception 'INVALID_VIEW_OPTIONS' using errcode='22023';
    end if;
  else
    if keys is distinct from array['sport','weeks'] or p_options->'weeks' not in ('4'::jsonb,'12'::jsonb,'26'::jsonb)
      or (p_options->'sport'<>'null'::jsonb and (jsonb_typeof(p_options->'sport')<>'string'
      or not exists(select 1 from public.sports s where s.id=p_options->>'sport'))) then
      raise exception 'INVALID_VIEW_OPTIONS' using errcode='22023';
    end if;
  end if;
  if v.id is not null then
    if p_expected_revision=0 then
      if v.revision<>1 or v.name<>name_clean or v.kind<>p_kind or v.options<>p_options then
        raise exception 'VIEW_VERSION_CONFLICT' using errcode='40001';
      end if;
    else
      if v.revision<>p_expected_revision then raise exception 'VIEW_VERSION_CONFLICT' using errcode='40001'; end if;
      update private.titan_analysis_views set name=name_clean,kind=p_kind,options=p_options,revision=revision+1,updated_at=now()
        where id=p_id and user_id=u returning * into v;
    end if;
  else
    if p_expected_revision<>0 then raise exception 'VIEW_NOT_FOUND' using errcode='P0002'; end if;
    if (select count(*) from private.titan_analysis_views where user_id=u)>=10 then
      raise exception 'VIEW_LIMIT' using errcode='23514';
    end if;
    insert into private.titan_analysis_views(id,user_id,name,kind,options) values(p_id,u,name_clean,p_kind,p_options) returning * into v;
  end if;
  payload:=jsonb_build_object('id',v.id,'name',v.name,'kind',v.kind,'options',v.options,
    'revision',v.revision,'created_at',v.created_at,'updated_at',v.updated_at);
  return jsonb_build_object('version',1,'owner',u,'action','save','view',payload);
exception when unique_violation then raise exception 'VIEW_NAME_TAKEN' using errcode='23505';
end $$;
revoke all on function public.titan_mutate_analysis_view(text,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.titan_mutate_analysis_view(text,uuid,integer,text,text,jsonb) to authenticated;
