-- BOT06 / Q-005: an administrator asks a player for a verification; the player reads it and answers once.
-- A request changes nothing about the account. Synthetic identities, real RPCs with API roles, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid();
begin
  assert to_regprocedure('public.titan_verification_request_v1(uuid,text)') is not null,'request RPC exists';
  assert to_regprocedure('public.titan_verification_close_v1(bigint)') is not null,'close RPC exists';
  assert to_regprocedure('public.titan_verification_list_v1(text,uuid,integer)') is not null,'admin list RPC exists';
  assert to_regprocedure('public.titan_my_verification_requests_v1()') is not null,'player list RPC exists';
  assert to_regprocedure('public.titan_verification_answer_v1(bigint,text)') is not null,'answer RPC exists';
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(m,'{}'),(p,'{}'),(q,'{}');
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='moderator' where id=m;
  perform set_config('titan.vr_a',a::text,true); perform set_config('titan.vr_m',m::text,true);
  perform set_config('titan.vr_p',p::text,true); perform set_config('titan.vr_q',q::text,true);
end $$;

create temporary table qa_vr_before as
  select 'profile' k, to_jsonb(p) r from public.profiles p union all select 'log', to_jsonb(l) from public.training_logs l;
grant select on qa_vr_before to authenticated;

set local role authenticated;
do $$
declare ok boolean; r jsonb; id1 bigint;
begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_my_verification_requests_v1(); exception when others then ok:=true; end; assert ok,'anonymous cannot read';
  ok:=false; begin perform public.titan_verification_answer_v1(1,'réponse'); exception when others then ok:=true; end; assert ok,'anonymous cannot answer';

  -- Only administrators ask, list and close.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.vr_m'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,'Peux-tu confirmer ta séance de dimanche ?'); exception when others then ok:=sqlerrm='ADMIN_ONLY'; end; assert ok,'moderator refused';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.vr_p'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_verification_request_v1(current_setting('titan.vr_q')::uuid,'Peux-tu confirmer ta séance de dimanche ?'); exception when others then ok:=sqlerrm='ADMIN_ONLY'; end; assert ok,'player cannot ask another player';
  ok:=false; begin perform public.titan_verification_list_v1('open',null,10); exception when others then ok:=sqlerrm='ADMIN_ONLY'; end; assert ok,'player cannot list';
  ok:=false; begin perform public.titan_verification_close_v1(1); exception when others then ok:=sqlerrm='ADMIN_ONLY'; end; assert ok,'player cannot close';
  ok:=false; begin perform 1 from private.titan_verification_requests; exception when insufficient_privilege then ok:=true; end; assert ok,'table closed to the API';

  -- Validation.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.vr_a'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_verification_request_v1(null,'Peux-tu confirmer ta séance de dimanche ?'); exception when others then ok:=sqlerrm='USER_REQUIRED'; end; assert ok,'user required';
  ok:=false; begin perform public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,'court'); exception when others then ok:=sqlerrm='MESSAGE_REQUIRED'; end; assert ok,'message too short';
  ok:=false; begin perform public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,repeat('x',501)); exception when others then ok:=sqlerrm='MESSAGE_REQUIRED'; end; assert ok,'message too long';
  ok:=false; begin perform public.titan_verification_request_v1(current_setting('titan.vr_a')::uuid,'Je me demande une vérification à moi-même.'); exception when others then ok:=sqlerrm='CANNOT_MODERATE_SELF'; end; assert ok,'not self';
  ok:=false; begin perform public.titan_verification_request_v1(gen_random_uuid(),'Peux-tu confirmer ta séance de dimanche ?'); exception when others then ok:=sqlerrm='USER_NOT_FOUND'; end; assert ok,'unknown user';

  -- A valid request; a second one is refused while the first is open.
  r:=public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,'Peux-tu confirmer ta séance de dimanche ?');
  assert r->>'status'='open','request opened'; id1:=(r->>'id')::bigint; perform set_config('titan.vr_id1',id1::text,true);
  ok:=false; begin perform public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,'Une deuxième demande pendant la première.'); exception when others then ok:=sqlerrm='REQUEST_ALREADY_OPEN'; end; assert ok,'one open request per player';
  assert exists(select 1 from public.titan_admin_audit where action='verification.request' and target_user_id=current_setting('titan.vr_p')::uuid and admin_id=current_setting('titan.vr_a')::uuid),'request audited with its author';
  assert not exists(select 1 from public.titan_admin_audit where action='verification.request' and payload::text like '%dimanche%'),'the message text is not copied into the audit trail';

  -- The player sees it, without the administrator identity; another player sees nothing.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.vr_p'),'role','authenticated')::text,true);
  r:=public.titan_my_verification_requests_v1();
  assert (r->>'open')::int=1 and jsonb_array_length(r->'requests')=1 and r->'requests'->0->>'message'='Peux-tu confirmer ta séance de dimanche ?','player reads the request';
  assert not (r::text like '%'||current_setting('titan.vr_a')||'%'),'the administrator identity is not exposed';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.vr_q'),'role','authenticated')::text,true);
  r:=public.titan_my_verification_requests_v1(); assert (r->>'open')::int=0 and jsonb_array_length(r->'requests')=0,'another player sees none';
  ok:=false; begin perform public.titan_verification_answer_v1(current_setting('titan.vr_id1')::bigint,'Je réponds à la place de quelqu''un.'); exception when others then ok:=sqlerrm='REQUEST_NOT_FOUND'; end; assert ok,'cannot answer someone else''s request (not revealed)';

  -- The player answers once.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.vr_p'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_verification_answer_v1(current_setting('titan.vr_id1')::bigint,'ok'); exception when others then ok:=sqlerrm='ANSWER_REQUIRED'; end; assert ok,'answer too short';
  r:=public.titan_verification_answer_v1(current_setting('titan.vr_id1')::bigint,'Oui, séance faite avec ma montre, trace jointe plus tard.');
  assert r->>'status'='answered','answered';
  ok:=false; begin perform public.titan_verification_answer_v1(current_setting('titan.vr_id1')::bigint,'Une seconde réponse.'); exception when others then ok:=sqlerrm='REQUEST_NOT_OPEN'; end; assert ok,'answer only once';
  r:=public.titan_my_verification_requests_v1();
  assert (r->>'open')::int=0 and r->'requests'->0->>'answer' like 'Oui, séance faite%','player reads their own answer';
end $$;

do $$
declare ok boolean; r jsonb;
begin
  -- The administrator reads the answer, closes, and may ask again.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.vr_a'),'role','authenticated')::text,true);
  r:=public.titan_verification_list_v1('answered',current_setting('titan.vr_p')::uuid,10);
  assert jsonb_array_length(r->'requests')=1 and r->'requests'->0->>'answer' like 'Oui, séance faite%','administrator reads the answer';
  assert jsonb_array_length(public.titan_verification_list_v1('open',null,10)->'requests')=0,'nothing open';
  ok:=false; begin perform public.titan_verification_list_v1('inconnu',null,10); exception when others then ok:=sqlerrm='UNKNOWN_STATUS'; end; assert ok,'unknown status';
  ok:=false; begin perform public.titan_verification_close_v1(-1); exception when others then ok:=sqlerrm='REQUEST_NOT_FOUND'; end; assert ok,'unknown request';
  r:=public.titan_verification_close_v1(current_setting('titan.vr_id1')::bigint); assert r->>'status'='closed','closed';
  ok:=false; begin perform public.titan_verification_close_v1(current_setting('titan.vr_id1')::bigint); exception when others then ok:=sqlerrm='REQUEST_CLOSED'; end; assert ok,'closed once';
  assert exists(select 1 from public.titan_admin_audit where action='verification.close' and target_user_id=current_setting('titan.vr_p')::uuid),'closing audited';
  perform public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,'Deuxième vérification, autre séance cette fois.');
  perform public.titan_verification_close_v1((select (e->>'id')::bigint from jsonb_array_elements(public.titan_verification_list_v1('open',null,10)->'requests') e limit 1));
  perform public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,'Troisième vérification, autre séance encore.');
  perform public.titan_verification_close_v1((select (e->>'id')::bigint from jsonb_array_elements(public.titan_verification_list_v1('open',null,10)->'requests') e limit 1));
  ok:=false; begin perform public.titan_verification_request_v1(current_setting('titan.vr_p')::uuid,'Quatrième demande dans la même semaine.'); exception when others then ok:=sqlerrm='REQUEST_LIMIT'; end; assert ok,'three requests a week at most';
end $$;

-- A request changes nothing else.
reset role;
do $$
begin
  assert not exists(
    (select k, r from qa_vr_before except select 'profile', to_jsonb(p) from public.profiles p except select 'log', to_jsonb(l) from public.training_logs l)
  ),'no profile or session changed';
  -- Deleting the account removes its requests.
  delete from auth.users where id=current_setting('titan.vr_p')::uuid;
  assert not exists(select 1 from private.titan_verification_requests where user_id=current_setting('titan.vr_p')::uuid),'requests removed with the account';
end $$;
rollback;
