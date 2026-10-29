-- V11-38 (V11-04 prep, RPG21): daily steps from an allowed source. Never a session, never a reward; replaced when the source sends a new total;
-- several sources for one day are not added; consent per source; own rows only; exported; erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  perform set_config('titan.da_a',a::text,true); perform set_config('titan.da_b',b::text,true);
  assert not has_table_privilege('authenticated','private.titan_daily_activity','select'), 'no API grant on the table';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; a uuid := current_setting('titan.da_a')::uuid; n int; x0 int; xp0 integer;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date,8000); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end; assert ok,'no consent, no steps';
  perform public.titan_set_source_consent_v1('health_connect',true);
  ok:=false; begin perform public.titan_import_daily_activity_v1('garmin',current_date,8000); exception when others then ok:=sqlerrm='SOURCE_UNKNOWN'; end; assert ok,'closed list of sources';
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date+5,8000); exception when others then ok:=sqlerrm='DAY_OUT_OF_RANGE'; end; assert ok,'no future';
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date-500,8000); exception when others then ok:=sqlerrm='DAY_OUT_OF_RANGE'; end; assert ok,'not older than 400 days';
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date,-1); exception when others then ok:=sqlerrm='STEPS_OUT_OF_RANGE'; end; assert ok,'no negative';
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date,900000); exception when others then ok:=sqlerrm='STEPS_OUT_OF_RANGE'; end; assert ok,'no absurd total';
  select xp into xp0 from public.profiles where id = a;

  perform public.titan_import_daily_activity_v1('health_connect',current_date,4000);
  perform public.titan_import_daily_activity_v1('health_connect',current_date,9500);   -- the day grows: replaced, not added
  perform public.titan_import_daily_activity_v1('health_connect',current_date-1,12000);
  r := public.titan_daily_activity_v1();
  assert jsonb_array_length(r)=2 and r->1->>'steps'='9500' and r->0->>'steps'='12000','replaced, one row a day: '||r::text;
  assert r->1->'sources' = '["health_connect"]'::jsonb,'says where it comes from';
  assert (r->1->>'updatedAt') is not null and (r->1->>'updatedAt')::timestamptz <= now(),'says when it was last refreshed';
  r := public.titan_daily_activity_v1(current_date, current_date);
  assert jsonb_array_length(r)=1,'a one-day range';
  ok:=false; begin perform public.titan_daily_activity_v1(current_date, current_date-3); exception when others then ok:=sqlerrm='RANGE_INVALID'; end; assert ok,'inverted range refused';
  ok:=false; begin perform public.titan_daily_activity_v1(current_date-500, current_date); exception when others then ok:=sqlerrm='RANGE_INVALID'; end; assert ok,'range limited to 400 days';

  -- Not a session, not a reward.
  select count(*) into n from public.training_logs where user_id = a; assert n=0,'no journal entry';
  assert (select xp from public.profiles where id = a) is not distinct from xp0,'no XP';

  -- Another account sees nothing of it.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.da_b'),'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_daily_activity_v1())=0,'b sees nothing';
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date,5000); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end; assert ok,'consent is per account';

  -- Revoking stops new steps; the stored days remain readable and exportable until the account removes them.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('health_connect',false);
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date,9999); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end; assert ok,'revoked: no more steps';
  assert jsonb_array_length(public.export_own_data()->'dailyActivity')=2,'exported';

  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_daily_activity_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
  ok:=false; begin perform public.titan_import_daily_activity_v1('health_connect',current_date,1); exception when others then ok:=true; end; assert ok,'anonymous cannot write';
end $$;
reset role;
-- Two sources for one day are never added: the reading takes the highest and lists both (the closed list of sources is widened inside
-- this rolled-back test only, to prove the rule before a second source exists).
do $$
declare a uuid := current_setting('titan.da_a')::uuid; r jsonb;
begin
  alter table private.titan_daily_activity drop constraint titan_daily_activity_source_check;
  insert into private.titan_daily_activity(user_id, source, day, steps) values (a, 'second_source', current_date, 11000);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  r := public.titan_daily_activity_v1(current_date, current_date);
  reset role;
  assert r->0->>'steps' = '11000' and r->0->'sources' = '["health_connect","second_source"]'::jsonb, 'highest of the sources, not the sum: '||r::text;
end $$;
do $$
declare a uuid := current_setting('titan.da_a')::uuid;
begin
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_daily_activity where user_id = a),'erased with the account';
end $$;
rollback;
