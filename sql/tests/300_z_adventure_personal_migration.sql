-- Preserve caller transaction, old contracts and acquired data on repeated upgrade.
do $$ begin
  if current_database() not like 'titan_test_%' then raise exception 'REFUSED: disposable database required'; end if;
end $$;
begin;
set local plpgsql.check_asserts=on;
set local lock_timeout='23s';
create temporary table qa_personal_marker(value integer);
insert into qa_personal_marker values(1);
do $$
declare a uuid:=gen_random_uuid();
begin
  perform set_config('titan.personal_legacy',a::text,true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}');
  insert into public.adventure_progress(user_id,world_id,chapter,route,started_at,completed_at)
  values(a,'aube',9,'journal',now()-interval '12 days',null),
    (a,'forge',2,'rhythm',now()-interval '2 days',null),
    (a,'marees',10,'rhythm',now()-interval '10 days',now()-interval '9 days');
  update public.adventure_progress set main_objective=null where user_id=a and world_id='aube';
  insert into public.adventure_rewards(user_id,world_id,chapter,source_ids)
  values(a,'aube',3,array[gen_random_uuid()]),(a,'marees',9,array[gen_random_uuid()]);
end $$;
create temporary table qa_personal_progress as select to_jsonb(p)-'main_objective' as row from public.adventure_progress p;
create temporary table qa_personal_frozen as select main_objective from public.adventure_progress where user_id=current_setting('titan.personal_legacy')::uuid and world_id='forge';
create temporary table qa_personal_badges as select to_jsonb(r) as row from public.adventure_rewards r;
create temporary table qa_personal_profiles as select to_jsonb(p) as row from public.profiles p;
\ir ../../supabase/migrations/20261019062757_adventure_personal_targets_v4.sql
\ir ../../supabase/migrations/20261019062757_adventure_personal_targets_v4.sql
do $$
declare s jsonb; c jsonb;
begin
  assert current_setting('lock_timeout')='23s' and (select count(*)=1 from qa_personal_marker),'caller transaction preserved';
  assert not exists(
    (select to_jsonb(p)-'main_objective' from public.adventure_progress p except select row from qa_personal_progress)
    union all (select row from qa_personal_progress except select to_jsonb(p)-'main_objective' from public.adventure_progress p)
  ),'all chapters, dates, route and quest profiles preserved';
  assert not exists(
    (select to_jsonb(r) from public.adventure_rewards r except select row from qa_personal_badges)
    union all (select row from qa_personal_badges except select to_jsonb(r) from public.adventure_rewards r)
  ),'all acquired badges and source ids preserved';
  assert not exists(
    (select to_jsonb(p) from public.profiles p except select row from qa_personal_profiles)
    union all (select row from qa_personal_profiles except select to_jsonb(p) from public.profiles p)
  ),'balances preserved';
  assert (select main_objective=(select main_objective from qa_personal_frozen) from public.adventure_progress where user_id=current_setting('titan.personal_legacy')::uuid and world_id='forge'),'existing personal contract preserved';
  assert (select main_objective is null from public.adventure_progress where user_id=current_setting('titan.personal_legacy')::uuid and world_id='marees'),'completed campaign unchanged';
  assert not exists(select 1 from public.adventure_quest_rewards where user_id=current_setting('titan.personal_legacy')::uuid),'no retrospective souvenir';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.personal_legacy'),'role','authenticated')::text,true);
  s:=public.titan_adventure_snapshot();
  select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'='aube';
  assert c->>'target'='3' and c->>'effort_target'='150' and c#>>'{main_objective,version}'='0','active legacy guardian keeps exact3/150';
  assert not has_table_privilege('authenticated','public.adventure_progress','UPDATE'),'no direct personal target writes';
  raise notice 'Personal target migration: repeated upgrade preserves legacy3/150, frozen contracts and every acquired field.';
end $$;
rollback;
