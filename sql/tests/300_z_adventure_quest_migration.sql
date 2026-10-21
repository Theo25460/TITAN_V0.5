-- Reapply around synthetic legacy state; preserve caller transaction and every acquired badge.
do $$ begin
  if current_database() not like 'titan_test_%' then raise exception 'REFUSED: disposable database required'; end if;
end $$;
begin;
set local lock_timeout='23s';
create temporary table qa_quest_marker(value integer);
insert into qa_quest_marker values(1);
do $$
declare a uuid:=gen_random_uuid();
begin
  perform set_config('titan.legacy_quests',a::text,true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}');
  insert into public.adventure_progress(user_id,world_id,chapter,route,started_at,completed_at)
  values(a,'aube',4,'journal',now()-interval '12 days',null),
    (a,'marees',10,'rhythm',now()-interval '10 days',now()-interval '9 days');
  update public.adventure_progress set quest_profile=null where user_id=a;
  insert into public.adventure_rewards(user_id,world_id,chapter,source_ids)
  values(a,'aube',3,array[gen_random_uuid()]),(a,'marees',9,array[gen_random_uuid()]);
end $$;
create temporary table qa_quest_progress_before as select to_jsonb(p)-'quest_profile' as row from public.adventure_progress p;
create temporary table qa_quest_badges_before as select to_jsonb(r) as row from public.adventure_rewards r;
create temporary table qa_quest_profiles_before as select to_jsonb(p) as row from public.profiles p;
update public.adventure_worlds set tier='plus' where id in ('forge','aurores');
\ir ../../supabase/migrations/20261019053123_adventure_quests_v3.sql
\ir ../../supabase/migrations/20261019053123_adventure_quests_v3.sql
do $$ begin
  assert current_setting('lock_timeout')='23s' and (select count(*)=1 from qa_quest_marker),'caller transaction preserved';
  assert not exists(
    (select to_jsonb(p)-'quest_profile' from public.adventure_progress p except select row from qa_quest_progress_before)
    union all (select row from qa_quest_progress_before except select to_jsonb(p)-'quest_profile' from public.adventure_progress p)
  ),'all existing campaign fields preserved';
  assert not exists(
    (select to_jsonb(r) from public.adventure_rewards r except select row from qa_quest_badges_before)
    union all (select row from qa_quest_badges_before except select to_jsonb(r) from public.adventure_rewards r)
  ),'all badges and source ids preserved';
  assert not exists(
    (select to_jsonb(p) from public.profiles p except select row from qa_quest_profiles_before)
    union all (select row from qa_quest_profiles_before except select to_jsonb(p) from public.profiles p)
  ),'profile and balances preserved';
  assert (select quest_profile->>'legacy'='true' and quest_profile->>'daysTarget'='1' and quest_profile->>'effortTarget'='15'
    from public.adventure_progress where user_id=current_setting('titan.legacy_quests')::uuid and world_id='aube'),'gentle migration for active chapter';
  assert (select quest_profile is null from public.adventure_progress where user_id=current_setting('titan.legacy_quests')::uuid and world_id='marees'),'finished campaign unchanged';
  assert not exists(select 1 from public.adventure_quest_rewards where user_id=current_setting('titan.legacy_quests')::uuid),'no retrospective grants';
  assert not exists(select 1 from public.adventure_worlds where tier<>'free'),'all four regions free after upgrade';
end $$;
rollback;
