-- RPG-NEW-01..09. Additive adventure only: NEVER changes XP, credits or v300 effort.
-- Live budget = existing confirmed effort, capped90/day across all worlds. Candidate v2 is recorded only.
-- Six optional milestones/arc, three arcs/world; four existing worlds and nine chapters stay intact.
create table if not exists private.adventure_journeys (
 user_id uuid not null references auth.users(id) on delete cascade,
 world_id text not null references public.adventure_worlds(id), started_at timestamptz not null default clock_timestamp(),
 timezone text not null, target integer not null check(target between 15 and 45), baseline_rpe numeric not null,
 profile jsonb not null, primary key(user_id,world_id)
);
create table if not exists private.adventure_sensor_proofs (
 source_id uuid primary key references public.training_logs(id) on delete cascade,
 active_minutes numeric not null check(active_minutes between 0 and 1440),
 heart_rate_relative numeric check(heart_rate_relative between 0 and 1),
 provenance text not null check(provenance in ('garmin_verified','native_verified')),
 verified_at timestamptz not null default now()
);
-- Only a trusted ingestion backend may attest a sensor, never a details JSON flag.
grant select,insert,update,delete on private.adventure_sensor_proofs to service_role;
create table if not exists private.adventure_effort_ledger (
 user_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null references public.training_logs(id) on delete cascade,
 world_id text not null, day date not null, effort numeric not null check(effort between 0 and 90),
 candidate_v2 jsonb not null, family text not null, created_at timestamptz not null default now(),
 primary key(user_id,source_id), foreign key(user_id,world_id) references private.adventure_journeys(user_id,world_id) on delete cascade
);
create index if not exists adventure_effort_owner_day on private.adventure_effort_ledger(user_id,day);
create table if not exists private.adventure_encounter_rewards (
 user_id uuid not null, world_id text not null, ordinal integer not null check(ordinal between 1 and 18),
 choice integer check(choice in (0,1)), earned_at timestamptz not null default now(),
 primary key(user_id,world_id,ordinal),
 foreign key(user_id,world_id) references private.adventure_journeys(user_id,world_id) on delete cascade
);
create table if not exists private.adventure_family_rewards (
 user_id uuid not null references auth.users(id) on delete cascade, family text not null,
 earned_at timestamptz not null default now(), primary key(user_id,family)
);
alter table private.adventure_journeys enable row level security;
alter table private.adventure_sensor_proofs enable row level security;
alter table private.adventure_effort_ledger enable row level security;
alter table private.adventure_encounter_rewards enable row level security;
alter table private.adventure_family_rewards enable row level security;
revoke all on private.adventure_journeys,private.adventure_sensor_proofs,private.adventure_effort_ledger,
 private.adventure_encounter_rewards,private.adventure_family_rewards from public,anon,authenticated;

create or replace function private.titan_adventure_candidate_v2(p_minutes numeric,p_rpe numeric,p_baseline numeric,p_hr numeric,p_verified boolean)
returns jsonb language sql immutable security invoker set search_path='' as $$
 with factor as(select case when p_rpe between 1 and 10 then least(10,greatest(1,5+p_rpe-coalesce(p_baseline,5))) else 5 end as relative),
 score as(select 0.6+0.08*relative as rpe_factor from factor)
 select jsonb_build_object('version',2,'candidate',true,'active',false,
 'score',round(least(90,least(90,greatest(0,coalesce(p_minutes,0)))*case when p_verified and p_hr between 0 and 1
   then (rpe_factor+0.6+0.8*p_hr)/2 else rpe_factor end),1),
 'minutes',least(90,greatest(0,coalesce(p_minutes,0))),
 'provenance',case when p_verified then 'verified_sensor' when p_rpe between 1 and 10 then 'declared_rpe' else 'declared_duration' end) from score;
$$;
revoke all on function private.titan_adventure_candidate_v2(numeric,numeric,numeric,numeric,boolean) from public,anon,authenticated;

create or replace function public.titan_adventure_rpg_snapshot_v1(p_world text)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare u uuid:=auth.uid(); j private.adventure_journeys%rowtype; chapter integer; effort numeric; days integer; rewards jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=u and is_suspended is not true) then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 if not exists(select 1 from public.adventure_worlds where id=p_world) then raise exception 'INVALID_WORLD'; end if;
 select * into j from private.adventure_journeys where user_id=u and world_id=p_world;
 select coalesce(a.chapter,0) into chapter from public.adventure_progress a where a.user_id=u and a.world_id=p_world;
 select coalesce(sum(e.effort),0),count(distinct e.day) filter(where e.effort>0) into effort,days
 from private.adventure_effort_ledger e join public.training_logs l on l.id=e.source_id and l.user_id=e.user_id
 where e.user_id=u and e.world_id=p_world and l.archived_at is null and l.is_suspicious is not true
 and l.status not in ('rejected','flagged','pending_review') and l.details->>'serverReward'='true'
 and coalesce(l.details->>'historical','false')<>'true';
 select coalesce(jsonb_agg(jsonb_build_object('ordinal',r.ordinal,'choice',r.choice,'earnedAt',r.earned_at) order by r.ordinal),'[]')
 into rewards from private.adventure_encounter_rewards r where r.user_id=u and r.world_id=p_world;
 return jsonb_build_object('version',1,'owner',u,'world',p_world,'active',j.user_id is not null,
 'chapter',coalesce(chapter,0),'target',j.target,'profile',j.profile,'effort',effort,'days',days,'rewards',rewards,
 'curve',jsonb_build_object('live',1,'candidate',2,'candidateActive',false),
 'milestones',(select jsonb_agg(jsonb_build_object('ordinal',n,'arc',(n-1)/6+1,'chapter',(n+1)/2,
   'kind',(array['discovery','choice','monster','lore','treasure','miniboss'])[(n-1)%6+1],
   'effortTarget',n*j.target,'daysTarget',(n+1)/2,
   'ready',j.user_id is not null and coalesce(chapter,0)>=(n+1)/2 and effort>=n*j.target and days>=(n+1)/2
      and (n=1 or exists(select 1 from private.adventure_encounter_rewards r where r.user_id=u and r.world_id=p_world and r.ordinal=n-1)),
   'earned',exists(select 1 from private.adventure_encounter_rewards r where r.user_id=u and r.world_id=p_world and r.ordinal=n)) order by n) from generate_series(1,18)n),
 'familyTitles',coalesce((select jsonb_agg(jsonb_build_object('family',family,'earnedAt',earned_at) order by family)
 from private.adventure_family_rewards where user_id=u),'[]'));
end $$;
revoke all on function public.titan_adventure_rpg_snapshot_v1(text) from public,anon;
grant execute on function public.titan_adventure_rpg_snapshot_v1(text) to authenticated;

create or replace function public.titan_adventure_rpg_action_v1(p_world text,p_action text,p_ordinal integer default null,p_choice integer default null)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare u uuid:=auth.uid(); a public.adventure_progress%rowtype; j private.adventure_journeys%rowtype;
 l record; profile jsonb; baseline numeric; budget numeric; candidate jsonb; snapshot jsonb; target jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 -- Serialize per account: prevents duplicate rewards and double allocation across worlds/devices.
 perform 1 from public.profiles where id=u and is_suspended is not true for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 if p_action is null or p_action not in ('start','sync','claim') then raise exception 'INVALID_ACTION'; end if;
 select * into a from public.adventure_progress where user_id=u and world_id=p_world;
 if not found then raise exception 'CAMPAIGN_NOT_STARTED'; end if;
 if p_action='start' then
   profile:=private.titan_adventure_quest_profile(now(),a.timezone);
   -- At most one RPE observation per eligible day in the28-day profile.
   select percentile_cont(0.5) within group(order by rpe) into baseline from (
    select (date at time zone a.timezone)::date as day,avg(public.titan_numeric_from_json(coalesce(details->'bio',details),'rpe')) as rpe
    from public.training_logs where user_id=u and date>=now()-interval '28 days' and date<=now() and created_at<=now()
      and archived_at is null and is_suspicious is not true and status not in ('rejected','flagged','pending_review')
      and details->>'serverReward'='true' and coalesce(details->>'historical','false')<>'true'
    group by 1) daily where rpe between 1 and 10;
   insert into private.adventure_journeys(user_id,world_id,timezone,target,baseline_rpe,profile)
   values(u,p_world,a.timezone,(profile->>'effortTarget')::integer,coalesce(baseline,5),profile) on conflict do nothing;
 end if;
 select * into j from private.adventure_journeys where user_id=u and world_id=p_world;
 if not found then raise exception 'JOURNEY_NOT_STARTED'; end if;
 -- Import only confirmed, nonhistorical sessions created AFTER opt-in. Client cannot supply a score/source/owner.
 for l in select t.*,coalesce(s.category,'autre') as family,
    proof.active_minutes as verified_minutes,proof.heart_rate_relative as verified_hr,proof.source_id as proof_id
   from public.training_logs t left join public.sports s on s.id=t.sport
   left join private.adventure_sensor_proofs proof on proof.source_id=t.id
   where t.user_id=u and t.created_at>=j.started_at and t.date>=j.started_at and t.date<=now() and t.val>0
    and t.archived_at is null and t.is_suspicious is not true and t.status not in ('rejected','flagged','pending_review')
    and t.details->>'serverReward'='true' and coalesce(t.details->>'historical','false')<>'true'
    and not exists(select 1 from private.adventure_effort_ledger e where e.user_id=u and e.source_id=t.id)
   order by t.date,t.created_at,t.id
 loop
   select greatest(0,90-coalesce(sum(e.effort),0)) into budget from private.adventure_effort_ledger e
   where e.user_id=u and e.day=(l.date at time zone 'UTC')::date;
   candidate:=private.titan_adventure_candidate_v2(
     coalesce(l.verified_minutes,public.titan_numeric_from_json(l.details->'effort','minutes'),
       public.titan_numeric_from_json(public.titan_effort_v300(l.sport,l.unit,l.val,l.details),'minutes'),0),
     public.titan_numeric_from_json(coalesce(l.details->'bio',l.details),'rpe'),j.baseline_rpe,l.verified_hr,l.proof_id is not null);
   insert into private.adventure_effort_ledger(user_id,source_id,world_id,day,effort,candidate_v2,family)
   values(u,l.id,p_world,(l.date at time zone 'UTC')::date,
     least(budget,greatest(0,coalesce(public.titan_numeric_from_json(l.details->'effort','effort_minutes'),
       public.titan_numeric_from_json(public.titan_effort_v300(l.sport,l.unit,l.val,l.details),'effort_minutes'),0))),candidate,l.family)
   on conflict do nothing;
 end loop;
 insert into private.adventure_family_rewards(user_id,family)
 select u,e.family from private.adventure_effort_ledger e join public.training_logs t on t.id=e.source_id
 where e.user_id=u and e.effort>0 and t.archived_at is null and t.is_suspicious is not true
 and t.status not in ('rejected','flagged','pending_review') and t.details->>'serverReward'='true'
 group by e.family having count(distinct e.day)>=3 on conflict do nothing;
 if p_action='claim' then
   if p_ordinal is null or p_ordinal not between 1 and 18 then raise exception 'INVALID_MILESTONE'; end if;
   if exists(select 1 from private.adventure_encounter_rewards where user_id=u and world_id=p_world and ordinal=p_ordinal) then
     return public.titan_adventure_rpg_snapshot_v1(p_world); -- same ordinal retry never grants twice or changes choice
   end if;
   snapshot:=public.titan_adventure_rpg_snapshot_v1(p_world);
   select n into target from jsonb_array_elements(snapshot->'milestones')n where (n->>'ordinal')::integer=p_ordinal;
   if coalesce((target->>'ready')::boolean,false) is not true then raise exception 'ENCOUNTER_INCOMPLETE'; end if;
   if p_ordinal%6=2 and (p_choice is null or p_choice not in (0,1)) then raise exception 'INVALID_CHOICE'; end if;
   if p_ordinal%6<>2 and p_choice is not null then raise exception 'INVALID_CHOICE'; end if;
   insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice) values(u,p_world,p_ordinal,p_choice);
 end if;
 return public.titan_adventure_rpg_snapshot_v1(p_world);
end $$;
revoke all on function public.titan_adventure_rpg_action_v1(text,text,integer,integer) from public,anon;
grant execute on function public.titan_adventure_rpg_action_v1(text,text,integer,integer) to authenticated;

-- Trusted ingestion integration only. A client cannot attest its own HR/duration or spoof provenance in details.
create or replace function public.titan_adventure_attest_sensor_v1(p_source_id uuid,p_active_minutes numeric,p_hr_relative numeric,p_provenance text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_source_id is null or p_active_minutes is null or p_active_minutes not between 0 and 1440
 or (p_hr_relative is not null and p_hr_relative not between 0 and 1)
 or p_provenance is null or p_provenance not in ('garmin_verified','native_verified') then raise exception 'INVALID_SENSOR_PROOF'; end if;
 if not exists(select 1 from public.training_logs where id=p_source_id and details->>'serverReward'='true') then raise exception 'CONFIRMED_SOURCE_REQUIRED'; end if;
 insert into private.adventure_sensor_proofs(source_id,active_minutes,heart_rate_relative,provenance)
 values(p_source_id,p_active_minutes,p_hr_relative,p_provenance)
 on conflict(source_id) do update set active_minutes=excluded.active_minutes,heart_rate_relative=excluded.heart_rate_relative,
 provenance=excluded.provenance,verified_at=now();
end $$;
revoke all on function public.titan_adventure_attest_sensor_v1(uuid,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.titan_adventure_attest_sensor_v1(uuid,numeric,numeric,text) to service_role;

-- Preserve every previous account-export section; append the optional RPG journal.
do $$begin
 if to_regprocedure('private.titan_export_extras_before_rpg_v1(uuid)') is null then
  alter function private.titan_export_extras_v1(uuid) rename to titan_export_extras_before_rpg_v1;
 end if;
end $$;
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select private.titan_export_extras_before_rpg_v1(p_uid)||jsonb_build_object('adventureRpg',jsonb_build_object(
 'journeys',coalesce((select jsonb_agg(to_jsonb(j)-'user_id') from private.adventure_journeys j where user_id=p_uid),'[]'),
 'effort',coalesce((select jsonb_agg(to_jsonb(e)-'user_id') from private.adventure_effort_ledger e where user_id=p_uid),'[]'),
 'encounters',coalesce((select jsonb_agg(to_jsonb(r)-'user_id') from private.adventure_encounter_rewards r where user_id=p_uid),'[]'),
 'familyTitles',coalesce((select jsonb_agg(to_jsonb(f)-'user_id') from private.adventure_family_rewards f where user_id=p_uid),'[]')));
$$;
revoke all on function private.titan_export_extras_before_rpg_v1(uuid),private.titan_export_extras_v1(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
