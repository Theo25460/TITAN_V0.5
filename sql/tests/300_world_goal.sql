-- V11-70 (COM-B5): the world goal. Created by an administrator for a period of 1 to 13 weeks with three increasing levels, joined on purpose,
-- counted only from the join (sessions recorded after joining, dated inside the period, capped per day, suspicious sessions excluded),
-- aggregates only, no overlap between two goals, rules frozen once started, nothing granted, exported and erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(n,'{}'),(adm,'{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (a, b, adm);
  update public.profiles set role = 'admin' where id = adm;
  perform set_config('titan.wg_a',a::text,true); perform set_config('titan.wg_b',b::text,true); perform set_config('titan.wg_n',n::text,true); perform set_config('titan.wg_adm',adm::text,true);
  assert not has_table_privilege('authenticated','private.titan_world_goals','select') and not has_table_privilege('authenticated','private.titan_world_goal_members','select'), 'no API grant on the tables';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; g uuid; xp0 integer; cr0 integer; today date := (now() at time zone 'Europe/Paris')::date;
  a uuid := current_setting('titan.wg_a')::uuid; b uuid := current_setting('titan.wg_b')::uuid; n uuid := current_setting('titan.wg_n')::uuid; adm uuid := current_setting('titan.wg_adm')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert public.titan_world_goal_v1() is null, 'no goal yet';
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(null,today,today+20,'Un objectif','x',100,200,300); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'players cannot create a goal';

  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(null,today,today,'Trop court','x',100,200,300); exception when others then ok:=sqlerrm='BAD_PERIOD'; end; assert ok,'the end follows the start';
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(null,today,today+92,'Trop long','x',100,200,300); exception when others then ok:=sqlerrm='BAD_PERIOD'; end; assert ok,'thirteen weeks at most';
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(null,today,today+20,'Niveaux','x',300,200,100); exception when others then ok:=sqlerrm='BAD_LEVELS'; end; assert ok,'levels increase';
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(null,today-40,today-20,'Passé','x',100,200,300); exception when others then ok:=sqlerrm='PERIOD_IN_THE_PAST'; end; assert ok,'not in the past';
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(null,today,today+20,'Cible trop basse','x',10,200,300); exception when others then ok:=true; end; assert ok,'a sensible first level';
  g := public.titan_world_goal_admin_save_v1(null,today,today+20,'  Un million de minutes ','Tous les sports comptent.',100,200,300);
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(null,today+10,today+30,'Chevauche','x',100,200,300); exception when others then ok:=sqlerrm='GOAL_OVERLAP'; end; assert ok,'two goals never overlap';
  ok:=false; begin perform public.titan_world_goal_admin_save_v1(g,today,today+20,'Un million de minutes','x',100,200,999); exception when others then ok:=sqlerrm='GOAL_STARTED_FROZEN'; end; assert ok,'levels are frozen once started';
  perform public.titan_world_goal_admin_save_v1(g,today,today+20,'Un million de minutes','Le texte peut changer.',100,200,300);
  assert jsonb_array_length(public.titan_world_goal_admin_list_v1())=1, 'the administrator lists the goals';

  -- A reads it, has not joined, contributes nothing yet.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_world_goal_v1();
  assert r->>'title'='Un million de minutes' and (r->>'minutes')::int=0 and (r->>'members')::int=0 and (r->>'joined')::boolean=false and r->>'state'='open' and (r->>'level')::int=0
    and r->'levels'='[100,200,300]'::jsonb, 'open, nobody yet: '||r::text;
  ok:=false; begin perform public.titan_world_goal_admin_list_v1(); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'a player cannot list as admin';
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_world_goal_join_v1(g,true); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'a brand-new account does not join';

  -- A session recorded BEFORE joining does not count; one recorded after does, capped per day.
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) values (a, 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":40}}');
  perform pg_sleep(0.01);
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  perform public.titan_world_goal_join_v1(g,true);
  perform public.titan_world_goal_join_v1(g,true);
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_world_goal_members set joined_at = clock_timestamp() where user_id = a;
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_world_goal_v1();
  assert (r->>'members')::int=1 and (r->>'joined')::boolean and (r->>'minutes')::int=0, 'joined once; the earlier session does not count: '||r::text;
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (a, 'swimming', 1, 'km', 10, now(), '{"effort":{"effort_minutes":50}}', clock_timestamp());
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (a, 'yoga', 30, 'min', 10, now(), '{"effort":{"effort_minutes":200}}', clock_timestamp());
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, is_suspicious, created_at) values (a, 'cycling', 30, 'km', 10, now(), '{"effort":{"effort_minutes":90}}', true, clock_timestamp());
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_world_goal_v1();
  assert (r->>'mine')::int=90 and (r->>'minutes')::int=90 and (r->>'level')::int=0, 'capped at 90 a day, suspicious sessions excluded, first level not reached: '||r::text;

  -- b joins, contributes; the total reaches the first level; b sees only its own share.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  perform public.titan_world_goal_join_v1(g,true);
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_world_goal_members set joined_at = clock_timestamp() where user_id = b;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (b, 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":30}}', clock_timestamp());
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_world_goal_v1();
  assert (r->>'members')::int=2 and (r->>'mine')::int=30 and (r->>'minutes')::int=120 and (r->>'level')::int=1, 'first level reached, b sees only its own share: '||r::text;
  assert not (r ? 'contributors'), 'no per-player breakdown';

  -- A flagged session stops counting at the next read (correction after an exclusion).
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update public.training_logs set is_suspicious = true where user_id = b;
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_world_goal_v1();
  assert (r->>'mine')::int=0 and (r->>'minutes')::int=90 and (r->>'level')::int=0, 'an excluded session no longer counts: '||r::text;

  -- Leaving removes the contribution; nothing was granted.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert jsonb_array_length(public.export_own_data()->'worldGoals')=1, 'exported';
  perform public.titan_world_goal_join_v1(g,false);
  assert (public.titan_world_goal_v1()->>'members')::int=1 and (public.titan_world_goal_v1()->>'joined')::boolean=false, 'left';
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_world_goal_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.wg_b')::uuid;
begin
  assert exists (select 1 from private.titan_world_goal_members where user_id = b), 'b participates';
  delete from auth.users where id = b;
  assert not exists (select 1 from private.titan_world_goal_members where user_id = b), 'erased with the account';
end $$;
rollback;
