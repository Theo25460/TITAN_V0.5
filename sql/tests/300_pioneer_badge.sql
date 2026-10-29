-- V11-60 (COM-D1): the Pionnier badge. Granted only by an administrator from the announced rule, once per account, revocable, no effect
-- on XP or credits, readable by its owner only, exported, erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); s uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); n uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(s,'{}'),(adm,'{}'),(n,'{}');
  update public.profiles set created_at = now() - interval '40 days' where id in (a, b, s, adm);
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set is_suspended = true where id = s;
  -- a: three confirmed sessions, b: one session only, s: suspended with sessions, n: brand-new.
  insert into public.training_logs(user_id, sport, val, unit, xp, date) select a, 'running', 5, 'km', 10, now() - (g || ' days')::interval from generate_series(1,3) g;
  insert into public.training_logs(user_id, sport, val, unit, xp, date) values (b, 'running', 5, 'km', 10, now() - interval '2 days');
  insert into public.training_logs(user_id, sport, val, unit, xp, date) select s, 'running', 5, 'km', 10, now() - (g || ' days')::interval from generate_series(1,3) g;
  perform set_config('titan.pb_a',a::text,true); perform set_config('titan.pb_b',b::text,true); perform set_config('titan.pb_s',s::text,true);
  perform set_config('titan.pb_adm',adm::text,true); perform set_config('titan.pb_n',n::text,true);
  assert not has_table_privilege('authenticated','private.titan_pioneers','select'), 'no API grant on the table';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; xp0 integer; cr0 integer;
  a uuid := current_setting('titan.pb_a')::uuid; b uuid := current_setting('titan.pb_b')::uuid; s uuid := current_setting('titan.pb_s')::uuid;
  adm uuid := current_setting('titan.pb_adm')::uuid; n uuid := current_setting('titan.pb_n')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert (public.titan_pioneer_v1()->>'granted')::boolean = false, 'no badge yet';
  ok:=false; begin perform public.titan_pioneer_grant_v1(a,'Fondateurs'); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'a player cannot grant itself the badge';
  ok:=false; begin perform public.titan_pioneer_candidates_v1(now(),3); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'a player cannot list candidates';
  select xp, credits into xp0, cr0 from public.profiles where id = a;

  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_pioneer_candidates_v1(null,3); exception when others then ok:=sqlerrm='CRITERIA_INVALID'; end; assert ok,'criteria are required';
  ok:=false; begin perform public.titan_pioneer_candidates_v1(now(),0); exception when others then ok:=sqlerrm='CRITERIA_INVALID'; end; assert ok,'at least one session';
  r := public.titan_pioneer_candidates_v1(now() - interval '1 day', 3);
  assert (select count(*) from jsonb_array_elements(r) e where (e->>'id')::uuid = a) = 1, 'a meets the rule';
  assert (select count(*) from jsonb_array_elements(r) e where (e->>'id')::uuid in (b, s, n)) = 0, 'too few sessions, suspended and brand-new accounts are not candidates: '||r::text;
  ok:=false; begin perform public.titan_pioneer_grant_v1(s,'Fondateurs'); exception when others then ok:=sqlerrm='ACCOUNT_NOT_ELIGIBLE'; end; assert ok,'a suspended account cannot be granted';
  ok:=false; begin perform public.titan_pioneer_grant_v1(a,'x'); exception when others then ok:=true; end; assert ok,'a cohort name has at least three characters';
  assert public.titan_pioneer_grant_v1(a,'  Fondateurs 2026 ') is true, 'first grant';
  assert public.titan_pioneer_grant_v1(a,'Autre cohorte') is false, 'granting twice changes nothing';
  r := public.titan_pioneer_candidates_v1(now() - interval '1 day', 3);
  assert (select count(*) from jsonb_array_elements(r) e where (e->>'id')::uuid = a) = 0, 'a holder is no longer a candidate';

  r := public.titan_pioneer_list_v1();
  assert jsonb_array_length(r)=1 and r->0->>'cohort'='Fondateurs 2026', 'the administrator lists the holders: '||r::text;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_pioneer_v1();
  assert (r->>'granted')::boolean and r->>'cohort'='Fondateurs 2026', 'the owner reads its badge: '||r::text;
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'the badge gives no XP and no credit';
  assert public.export_own_data()->'pioneer'->>'cohort' = 'Fondateurs 2026', 'exported';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_pioneer_list_v1(); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'a player cannot list the holders';
  assert (public.titan_pioneer_v1()->>'granted')::boolean = false, 'another account does not see it';
  assert public.export_own_data()->'pioneer' = 'null'::jsonb, 'nothing to export without a badge';

  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  assert public.titan_pioneer_revoke_v1(a) is true and public.titan_pioneer_revoke_v1(a) is false, 'revocable, once';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert (public.titan_pioneer_v1()->>'granted')::boolean = false, 'revoked';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_pioneer_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.pb_a')::uuid; adm uuid := current_setting('titan.pb_adm')::uuid;
begin
  insert into private.titan_pioneers(user_id, cohort, granted_by) values (a, 'Fondateurs', adm);
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_pioneers where user_id = a), 'erased with the account';
  insert into private.titan_pioneers(user_id, cohort, granted_by) select current_setting('titan.pb_b')::uuid, 'Fondateurs', adm;
  delete from auth.users where id = adm;
  assert (select granted_by from private.titan_pioneers where user_id = current_setting('titan.pb_b')::uuid) is null, 'the badge outlives the administrator who granted it';
end $$;
rollback;
