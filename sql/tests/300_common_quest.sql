-- V11-62 (COM-B1): the common quest of the week. Created by an administrator for a Monday, joined on purpose, counted only from the join
-- (sessions recorded after joining, dated inside the week, capped per day), aggregates only, nothing granted, exported and erased with the
-- account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(n,'{}'),(adm,'{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (a, b, adm);
  update public.profiles set role = 'admin' where id = adm;
  perform set_config('titan.cq_a',a::text,true); perform set_config('titan.cq_b',b::text,true); perform set_config('titan.cq_n',n::text,true); perform set_config('titan.cq_adm',adm::text,true);
  assert not has_table_privilege('authenticated','private.titan_common_quests','select') and not has_table_privilege('authenticated','private.titan_common_quest_members','select'), 'no API grant on the tables';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; q uuid; xp0 integer; cr0 integer; week date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date;
  a uuid := current_setting('titan.cq_a')::uuid; b uuid := current_setting('titan.cq_b')::uuid; n uuid := current_setting('titan.cq_n')::uuid; adm uuid := current_setting('titan.cq_adm')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert public.titan_common_quest_v1() is null, 'no quest yet';
  ok:=false; begin perform public.titan_common_quest_admin_save_v1(null,week,'Une quête','x',500); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'players cannot create a quest';

  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_common_quest_admin_save_v1(null,week+2,'Pas un lundi','x',500); exception when others then ok:=sqlerrm='WEEK_MUST_START_MONDAY'; end; assert ok,'a quest starts on a Monday';
  ok:=false; begin perform public.titan_common_quest_admin_save_v1(null,week-14,'Passé','x',500); exception when others then ok:=sqlerrm='WEEK_IN_THE_PAST'; end; assert ok,'not in the past';
  ok:=false; begin perform public.titan_common_quest_admin_save_v1(null,week,'Cible trop basse','x',10); exception when others then ok:=true; end; assert ok,'a sensible target';
  q := public.titan_common_quest_admin_save_v1(null,week,'  Cent minutes ensemble ','Tous les sports comptent.',100);
  ok:=false; begin perform public.titan_common_quest_admin_save_v1(null,week,'Doublon','x',200); exception when others then ok:=true; end; assert ok,'one quest per week';
  ok:=false; begin perform public.titan_common_quest_admin_save_v1(q,week,'Cent minutes ensemble','x',9999); exception when others then ok:=sqlerrm='QUEST_STARTED_FROZEN'; end; assert ok,'the target is frozen once the week began';
  perform public.titan_common_quest_admin_save_v1(q,week,'Cent minutes ensemble','Le texte peut changer.',100);
  assert jsonb_array_length(public.titan_common_quest_admin_list_v1())=1, 'the administrator lists the quests';

  -- A reads it, has not joined, contributes nothing yet.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_common_quest_v1();
  assert r->>'title'='Cent minutes ensemble' and (r->>'minutes')::int=0 and (r->>'members')::int=0 and (r->>'joined')::boolean=false and r->>'state'='open', 'open, nobody yet: '||r::text;
  ok:=false; begin perform public.titan_common_quest_admin_list_v1(); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'a player cannot list as admin';
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_common_quest_join_v1(q,true); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'a brand-new account does not join';
  ok:=false; begin perform public.titan_common_quest_join_v1(gen_random_uuid(),true); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'eligibility first';

  -- A session recorded BEFORE joining does not count; one recorded after does, capped per day.
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) values (a, 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":40}}');
  perform pg_sleep(0.01);
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  perform public.titan_common_quest_join_v1(q,true);
  perform public.titan_common_quest_join_v1(q,true);
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_common_quest_members set joined_at = clock_timestamp() where user_id = a;   -- one transaction has one now(): make the join later than the first session
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_common_quest_v1();
  assert (r->>'members')::int=1 and (r->>'joined')::boolean and (r->>'minutes')::int=0, 'joined once; the earlier session does not count: '||r::text;
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (a, 'swimming', 1, 'km', 10, now(), '{"effort":{"effort_minutes":50}}', clock_timestamp());
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (a, 'yoga', 30, 'min', 10, now(), '{"effort":{"effort_minutes":200}}', clock_timestamp());
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, is_suspicious, created_at) values (a, 'cycling', 30, 'km', 10, now(), '{"effort":{"effort_minutes":90}}', true, clock_timestamp());
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_common_quest_v1();
  assert (r->>'mine')::int=90 and (r->>'minutes')::int=90, 'capped at 90 a day, suspicious sessions excluded: '||r::text;
  assert r->>'state'='open', 'still open under the target';

  -- b joins, contributes, sees the aggregate but not a's share.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  perform public.titan_common_quest_join_v1(q,true);
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_common_quest_members set joined_at = clock_timestamp() where user_id = b;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (b, 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":30}}', clock_timestamp());
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_common_quest_v1();
  assert (r->>'members')::int=2 and (r->>'mine')::int=30 and (r->>'minutes')::int=120 and r->>'state'='done', 'the total reached the target, b sees only its own share: '||r::text;
  assert not (r ? 'contributors'), 'no per-player breakdown';

  -- Leaving removes the contribution; nothing was granted.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert jsonb_array_length(public.export_own_data()->'commonQuests')=1, 'exported';
  perform public.titan_common_quest_join_v1(q,false);
  assert (public.titan_common_quest_v1()->>'members')::int=1 and (public.titan_common_quest_v1()->>'joined')::boolean=false, 'left';
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_common_quest_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.cq_b')::uuid;
begin
  assert exists (select 1 from private.titan_common_quest_members where user_id = b), 'b participates';
  delete from auth.users where id = b;
  assert not exists (select 1 from private.titan_common_quest_members where user_id = b), 'erased with the account';
end $$;
rollback;
