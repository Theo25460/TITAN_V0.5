-- Synthetic owners and summaries, rolled back. Steps never travel through the client import RPC.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); v_old timestamptz:=now()-interval '3 days';
begin
  perform set_config('titan.garmin_dailies_a',a::text,true);
  perform set_config('titan.garmin_dailies_b',b::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  insert into public.profiles(id,username,level,xp,credits) values(a,'qa_garmin_dailies_a',1,17,23),(b,'qa_garmin_dailies_b',1,11,19)
    on conflict(id) do update set xp=excluded.xp,credits=excluded.credits;
  insert into private.titan_source_consents(user_id,source,granted_at,revoked_at) values(a,'garmin',v_old,null),(b,'garmin',v_old,now());
  insert into private.titan_garmin_links(user_id,garmin_user_id,linked_at) values(a,'daily-a',v_old),(b,'daily-b',v_old);
end $$;

create function pg_temp.daily(p_provider text,p_steps integer,p_duration integer,p_day date default current_date-1)
returns jsonb language sql as $$
  select jsonb_build_object('provider_user',p_provider,'steps',p_steps,'day',p_day,
    'started_at',p_day::timestamp at time zone 'UTC','duration_seconds',p_duration)
$$;

set local role service_role;
do $$begin
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-a',14000,43200)))=0,'old activity-only links do not attest';
end $$;
reset role;

update private.titan_garmin_links set dailies_authorized_at=linked_at where garmin_user_id in ('daily-a','daily-b');
set local role service_role;
do $$
declare v_valid jsonb:=pg_temp.daily('daily-a',14000,43200);
begin
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(
    pg_temp.daily('daily-a',18000,86400,current_date-4),
    pg_temp.daily('daily-b',19000,86400),
    pg_temp.daily('not-linked',19000,86400),
    pg_temp.daily('daily-a',200001,86400)))=0,'old link, revoked or unknown owner and out-of-range count are ignored';
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(v_valid))=1,'eligible provider day recorded';
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(v_valid,v_valid))=0,'duplicate push and duplicate batch are idempotent';
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-a',20000,3600)))=0,'shorter, delayed snapshot cannot overwrite the later period';
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-a',16000,86400)))=1,'later snapshot replaces the day';
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-a',15000,86400)))=1,'conflicting equal period keeps the lower defensible count';
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-a',16000,86400)))=0,'replayed equal period cannot raise the count again';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.garmin_dailies_a'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
  assert not has_function_privilege('anon','public.titan_garmin_ingest_dailies_v1(jsonb)','execute');
  assert not has_function_privilege('authenticated','public.titan_garmin_ingest_dailies_v1(jsonb)','execute');
  assert not has_function_privilege('authenticated','public.titan_garmin_oauth_link_dailies_v1(uuid,text,text,text,text,timestamptz)','execute');
  s:=public.titan_journey_sync_v1();
  assert (s->>'totalSteps')::int=15000 and (s->>'observedSteps')::int=0,'only verified steps are counted once';
  assert exists(select 1 from jsonb_array_elements(s->'discoveries') d where d->>'id'='steps-10000' and d->>'earnedAt' is not null);
  assert public.titan_garmin_status_v1()->>'dailies_authorized'='true';
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.garmin_dailies_b'),'role','authenticated')::text,true);
do $$begin
  assert (public.titan_journey_snapshot_v1()->>'totalSteps')::int=0,'another owner cannot read the verified day';
end $$;
reset role;

set local role service_role;
do $$declare a uuid:=current_setting('titan.garmin_dailies_a')::uuid; n text:=repeat('b',64);begin
  perform public.titan_garmin_revoke_dailies_v1('daily-a');
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-a',19000,86400)))=0,'HEALTH_EXPORT revoked';
  assert public.titan_garmin_oauth_start_v1(a,n);
  assert public.titan_garmin_oauth_consume_v1(a,n);
  assert public.titan_garmin_oauth_bind_dailies_v1(a,n,'daily-a');
  perform public.titan_garmin_revoke_dailies_v1('daily-a');
  begin
    perform public.titan_garmin_oauth_link_dailies_v1(a,n,'daily-a',repeat('a',48),null,null);
    raise exception 'a permission snapshot that preceded the revocation must not reinstate access';
  exception when insufficient_privilege then null; end;
  assert public.titan_garmin_oauth_start_v1(a,n);
  assert public.titan_garmin_oauth_consume_v1(a,n);
  assert public.titan_garmin_oauth_bind_dailies_v1(a,n,'daily-a');
  assert public.titan_garmin_oauth_link_dailies_v1(a,n,'daily-a',repeat('a',48),null,null)->>'linked'='true';
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-a',19000,86400)))=0,'an older period cannot re-enter under the new OAuth link';
  perform public.titan_garmin_link_v1(a,'daily-other');
  assert public.titan_garmin_ingest_dailies_v1(jsonb_build_array(pg_temp.daily('daily-other',19000,86400)))=0,'a legacy relink does not inherit health authorization';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.garmin_dailies_a'),'role','authenticated')::text,true);
do $$declare s jsonb:=public.titan_journey_snapshot_v1();begin
  assert (s->>'totalSteps')::int=0;
  assert public.titan_garmin_status_v1()->>'linked'='true' and public.titan_garmin_status_v1()->>'dailies_authorized'='false','activity link preserved';
  assert exists(select 1 from jsonb_array_elements(s->'discoveries') d where d->>'id'='steps-10000' and d->>'earnedAt' is not null),'past cosmetic acquisition preserved';
end $$;
reset role;

do $$begin
  assert (select count(*)=1 from private.titan_journey_verified_days where user_id=current_setting('titan.garmin_dailies_a')::uuid);
  assert (select xp=17 and credits=23 from public.profiles where id=current_setting('titan.garmin_dailies_a')::uuid),'steps cannot award XP or credits';
end $$;
rollback;
