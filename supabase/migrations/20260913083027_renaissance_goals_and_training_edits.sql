create table public.sport_goals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 100),
 metric text not null check(metric in ('sessions','days','minutes','distance')),
 sport text check(sport is null or length(sport) between 1 and 100),
 target numeric not null check(target>0 and target<=1000000),
 start_date date not null, end_date date not null,
 archived_at timestamptz, revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(end_date>=start_date and end_date-start_date<=730),
 check(start_date>='2000-01-01' and end_date<='2100-01-01'),
 check(metric not in ('sessions','days') or target=trunc(target))
);
create index sport_goals_owner_active on public.sport_goals(user_id,archived_at);
alter table public.sport_goals enable row level security;
revoke all on public.sport_goals from public,anon,authenticated;
grant select,insert,update on public.sport_goals to authenticated;
create policy sport_goals_read on public.sport_goals for select to authenticated using((select auth.uid())=user_id);
create policy sport_goals_insert on public.sport_goals for insert to authenticated with check((select auth.uid())=user_id);
create policy sport_goals_update on public.sport_goals for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create or replace function private.titan_guard_sport_goal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid()<>new.user_id then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() and is_suspended is not true for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501';end if;
 if tg_op='UPDATE' then
   if new.user_id<>old.user_id or new.id<>old.id then raise exception 'OWNER_IMMUTABLE' using errcode='42501';end if;
   new.revision:=old.revision+1;new.created_at:=old.created_at;
 else new.revision:=1;new.created_at:=now();end if;
 if new.archived_at is null and (select count(*) from public.sport_goals where user_id=new.user_id and archived_at is null and id<>new.id)>=50 then raise exception 'GOAL_LIMIT';end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function private.titan_guard_sport_goal() from public,anon,authenticated;
create trigger sport_goal_guard before insert or update on public.sport_goals for each row execute function private.titan_guard_sport_goal();

create or replace function private.titan_update_training_session(p_id uuid,p_revision integer,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
 u uuid:=auth.uid();l public.training_logs%rowtype;v public.training_logs%rowtype;
 ex jsonb;s jsonb;all_ex jsonb:='[]';rows jsonb;clean_rows jsonb;
 weight numeric;reps numeric;rir numeric;volume numeric;total_reps numeric;max_weight numeric;total_volume numeric:=0;all_reps numeric:=0;
 extra record;clean_extras jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into l from public.training_logs where id=p_id and user_id=u for update;
 if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
 if p_revision is null or l.revision<>p_revision then raise exception 'SESSION_VERSION_CONFLICT' using errcode='40001'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>100000 then raise exception 'PATCH_INVALID' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('val','date','note','duration','archived','exercises','extras')) then raise exception 'PATCH_INVALID' using errcode='22023';end if;
 v:=l;
 if p_patch ? 'val' then
  if jsonb_typeof(p_patch->'val')<>'number' then raise exception 'SESSION_INVALID' using errcode='22023'; end if;
  v.val:=(p_patch->>'val')::numeric;
  if jsonb_typeof(l.details->'exercises')='array' and jsonb_array_length(l.details->'exercises')>0 and v.val<>l.val then
   raise exception 'EXERCISE_VOLUME_READ_ONLY' using errcode='22023';end if;
  v.details:=jsonb_set(coalesce(v.details,'{}'),'{val1}',to_jsonb(v.val));
 end if;
 if p_patch ? 'exercises' then
  if jsonb_typeof(l.details->'exercises') is distinct from 'array' or jsonb_array_length(l.details->'exercises')=0 then raise exception 'EXERCISE_SESSION_REQUIRED';end if;
  if jsonb_typeof(p_patch->'exercises') is distinct from 'array' or jsonb_array_length(p_patch->'exercises') not between 1 and 30 then raise exception 'EXERCISES_INVALID';end if;
  for ex in select value from jsonb_array_elements(p_patch->'exercises') loop
   if jsonb_typeof(ex)<>'object' or jsonb_typeof(ex->'name') is distinct from 'string' or length(trim(ex->>'name')) not between 1 and 120 then raise exception 'EXERCISE_NAME_INVALID';end if;
   rows:=ex->'setRows';
   if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 30 then raise exception 'SETS_INVALID';end if;
   clean_rows:='[]';volume:=0;total_reps:=0;max_weight:=0;
   for s in select value from jsonb_array_elements(rows) loop
    if jsonb_typeof(s->'weight') is distinct from 'number' or jsonb_typeof(s->'reps') is distinct from 'number' then raise exception 'SET_INVALID';end if;
    weight:=(s->>'weight')::numeric;reps:=(s->>'reps')::numeric;rir:=null;
    if weight<0 or weight>1000 or reps<1 or reps>500 or reps<>trunc(reps) then raise exception 'SET_INVALID';end if;
    if s ? 'rir' and s->'rir'<>'null'::jsonb then
      if jsonb_typeof(s->'rir') is distinct from 'number' then raise exception 'RIR_INVALID';end if;
      rir:=(s->>'rir')::numeric;if rir<0 or rir>10 then raise exception 'RIR_INVALID';end if;
    end if;
    clean_rows:=clean_rows||jsonb_build_array(jsonb_build_object('weight',weight,'reps',reps,'rir',rir));
    volume:=volume+weight*reps;total_reps:=total_reps+reps;max_weight:=greatest(max_weight,weight);
   end loop;
   all_ex:=all_ex||jsonb_build_array(jsonb_build_object('name',left(trim(ex->>'name'),120),'variant',left(coalesce(ex->>'variant',''),100),
     'equipment',left(coalesce(ex->>'equipment',''),100),'setRows',clean_rows,'sets',jsonb_array_length(clean_rows),'volume',volume,'totalReps',total_reps,
     'weight',max_weight,'reps',round(total_reps/jsonb_array_length(clean_rows)),'rir',null));
   total_volume:=total_volume+volume;all_reps:=all_reps+total_reps;
  end loop;
  v.val:=case when total_volume>0 then total_volume else all_reps end;v.unit:=case when total_volume>0 then 'kg' else 'reps' end;
  v.details:=jsonb_set(jsonb_set(jsonb_set(v.details,'{exercises}',all_ex),'{val1}',to_jsonb(v.val)),'{unitOverride}',to_jsonb(v.unit));
 end if;
 if p_patch ? 'extras' then
  if jsonb_typeof(p_patch->'extras') is distinct from 'object' or octet_length((p_patch->'extras')::text)>5000 then raise exception 'EXTRAS_INVALID';end if;
  clean_extras:=coalesce(v.details->'extras','{}');
  for extra in select key,value from jsonb_each(p_patch->'extras') loop
   if extra.key not in ('climbing_discipline','belay','location','grade_system','max_attempt','max_done','attempts','successful_routes','session_type','result','score')
      or jsonb_typeof(extra.value) not in ('string','number','null') or length(extra.value::text)>160 then raise exception 'EXTRAS_INVALID';end if;
   if extra.key in ('attempts','successful_routes') and extra.value<>'null'::jsonb and extra.value<>'""'::jsonb then
    if not (extra.value#>>'{}') ~ '^[0-9]{1,3}$' then raise exception 'EXTRAS_INVALID';end if;
    if (extra.value#>>'{}')::numeric>200 then raise exception 'EXTRAS_INVALID';end if;
   end if;
   clean_extras:=jsonb_set(clean_extras,array[extra.key],extra.value);
  end loop;
  v.details:=jsonb_set(v.details,'{extras}',clean_extras);
 end if;
 if p_patch ? 'date' then v.date:=(p_patch->>'date')::timestamptz;v.details:=jsonb_set(v.details,'{performedAt}',coalesce(to_jsonb(v.date),'null'::jsonb));end if;
 if p_patch ? 'note' then
  if jsonb_typeof(p_patch->'note')<>'string' then raise exception 'NOTE_INVALID' using errcode='22023';end if;
  v.details:=jsonb_set(v.details,'{note}',to_jsonb(left(p_patch->>'note',2000)));
 end if;
 if p_patch ? 'duration' then
  if p_patch->'duration'='null'::jsonb and v.unit not in ('min','h') then
   v.details:=v.details-'duration'-'val2';
   if jsonb_typeof(v.details->'gpxStats')='object' then v.details:=jsonb_set(v.details,'{gpxStats}',(v.details->'gpxStats')-'movingMinutes');end if;
  else
   if jsonb_typeof(p_patch->'duration')<>'number' then raise exception 'DURATION_INVALID' using errcode='22023';end if;
   if (p_patch->>'duration')::numeric<=0 or (p_patch->>'duration')::numeric>1440 then raise exception 'DURATION_INVALID' using errcode='22023';end if;
   v.details:=jsonb_set(jsonb_set(v.details,'{val2}',p_patch->'duration'),'{duration}',p_patch->'duration');
  end if;
 end if;
 if v.unit in ('min','h') and (p_patch ? 'val' or p_patch ? 'duration') then
  v.details:=jsonb_set(jsonb_set(v.details,'{duration}',to_jsonb(v.val*case when v.unit='h' then 60 else 1 end)),'{val2}',to_jsonb(v.val*case when v.unit='h' then 60 else 1 end));end if;
 if p_patch ?| array['val','duration','exercises','extras'] then v.details:=v.details-'summary';end if;
 if p_patch ? 'archived' then
  if jsonb_typeof(p_patch->'archived')<>'boolean' then raise exception 'ARCHIVE_INVALID' using errcode='22023';end if;
  v.archived_at:=case when (p_patch->>'archived')::boolean then now() else null end;
 end if;
 if v.val is null or v.val<=0 or v.val>300000 or v.date is null or v.date>now()+interval '10 minutes' then raise exception 'SESSION_INVALID' using errcode='22023';end if;
 insert into public.training_revisions(user_id,log_id,snapshot) values(u,l.id,to_jsonb(l));
 update public.training_logs set val=v.val,unit=v.unit,date=v.date,details=v.details,archived_at=v.archived_at,revision=l.revision+1 where id=l.id returning * into v;
 if v.revision<>l.revision+1 then raise exception 'SESSION_REJECTED' using errcode='23514';end if;
 return to_jsonb(v);
end $$;
revoke all on function private.titan_update_training_session(uuid,integer,jsonb) from public,anon;
grant execute on function private.titan_update_training_session(uuid,integer,jsonb) to authenticated;
create or replace function public.titan_update_training_session(p_id uuid,p_revision integer,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.titan_update_training_session(p_id,p_revision,p_patch);$$;
revoke all on function public.titan_update_training_session(uuid,integer,jsonb) from public,anon;
grant execute on function public.titan_update_training_session(uuid,integer,jsonb) to authenticated;
