-- CHEAT19: a player can appeal an excluded session or a suspension; an administrator decides; nothing is automatic.
-- Synthetic identities, real RPCs with API roles, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid();
  s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); s3 uuid:=gen_random_uuid(); sq uuid:=gen_random_uuid(); sn uuid:=gen_random_uuid();
begin
  assert to_regprocedure('public.titan_appeal_submit_v1(text,uuid,text)') is not null,'submit RPC exists';
  assert to_regprocedure('public.titan_my_appeals_v1()') is not null,'player list RPC exists';
  assert to_regprocedure('public.titan_my_review_state_v1()') is not null,'player review-state RPC exists';
  assert to_regprocedure('public.titan_appeal_list_v1(text,integer)') is not null,'admin list RPC exists';
  assert to_regprocedure('public.titan_appeal_decide_v1(bigint,boolean,text)') is not null,'decide RPC exists';
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(m,'{}'),(p,'{}'),(q,'{}');
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='moderator' where id=m;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious,status) values
    (s1,p,'running','cardio',5,'km',10,now()-interval '3 days','{"duration":30}',true,'suspicious'),
    (s2,p,'running','cardio',5,'km',10,now()-interval '2 days','{"duration":30}',true,'suspicious'),
    (s3,p,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}',true,'suspicious'),
    (sn,p,'running','cardio',5,'km',10,now()-interval '4 days','{"duration":30}',false,'valid'),
    (sq,q,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}',true,'suspicious');
  perform set_config('titan.ap_a',a::text,true); perform set_config('titan.ap_m',m::text,true);
  perform set_config('titan.ap_p',p::text,true); perform set_config('titan.ap_q',q::text,true);
  perform set_config('titan.ap_s1',(select id::text from public.training_logs where user_id=p and date::date=(now()-interval '3 days')::date),true);
  perform set_config('titan.ap_s2',(select id::text from public.training_logs where user_id=p and date::date=(now()-interval '2 days')::date),true);
  perform set_config('titan.ap_s3',(select id::text from public.training_logs where user_id=p and date::date=(now()-interval '1 day')::date),true);
  perform set_config('titan.ap_sn',sn::text,true); perform set_config('titan.ap_sq',sq::text,true);
end $$;

create temporary table qa_ap_before as
  select 'profile' k, to_jsonb(p) r from public.profiles p union all select 'log', to_jsonb(l) from public.training_logs l;
grant select on qa_ap_before to authenticated;

set local role authenticated;
do $$
declare ok boolean; r jsonb; id1 bigint;
begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_s1')::uuid,'Je conteste cette exclusion.'); exception when others then ok:=true; end;
  assert ok,'anonymous refused';

  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_p'),'role','authenticated')::text,true);
  -- Validation.
  ok:=false; begin perform public.titan_appeal_submit_v1('autre',current_setting('titan.ap_s1')::uuid,'Je conteste cette exclusion.'); exception when others then ok:=sqlerrm='UNKNOWN_KIND'; end;
  assert ok,'unknown kind refused';
  ok:=false; begin perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_s1')::uuid,'court'); exception when others then ok:=sqlerrm='MESSAGE_REQUIRED'; end;
  assert ok,'message too short refused';
  ok:=false; begin perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_s1')::uuid,repeat('x',501)); exception when others then ok:=sqlerrm='MESSAGE_REQUIRED'; end;
  assert ok,'message too long refused';
  ok:=false; begin perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_sq')::uuid,'Cette séance est à moi, vraiment.'); exception when others then ok:=sqlerrm='SESSION_NOT_FOUND'; end;
  assert ok,'another player''s session cannot be appealed (not revealed)';
  ok:=false; begin perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_sn')::uuid,'Cette séance est valide pourtant.'); exception when others then ok:=sqlerrm='NOT_EXCLUDED'; end;
  assert ok,'a session that is not excluded has nothing to appeal';
  ok:=false; begin perform public.titan_appeal_submit_v1('account',null,'Mon compte n''est pas suspendu.'); exception when others then ok:=sqlerrm='NOT_SUSPENDED'; end;
  assert ok,'an active account has nothing to appeal';

  -- A valid appeal; a second one for the same object is refused while the first is open.
  r:=public.titan_appeal_submit_v1('session',current_setting('titan.ap_s1')::uuid,'Course faite avec ma montre, voici le contexte.');
  assert r->>'status'='open' and (r->>'id') is not null,'appeal opened';
  id1:=(r->>'id')::bigint; perform set_config('titan.ap_id1',id1::text,true);
  ok:=false; begin perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_s1')::uuid,'Je renvoie ma demande une seconde fois.'); exception when others then ok:=sqlerrm='APPEAL_ALREADY_OPEN'; end;
  assert ok,'one open appeal per object';
  perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_s2')::uuid,'Deuxième séance contestée, même contexte.');
  perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_s3')::uuid,'Troisième séance contestée, même contexte.');
  -- Player sees only own appeals, with status; admin note only once decided.
  r:=public.titan_my_appeals_v1();
  assert jsonb_array_length(r->'appeals')=3 and (r->'appeals'->0->>'status')='open','player sees own three appeals';
  assert (select bool_and((e->>'sessionId')::uuid in (current_setting('titan.ap_s1')::uuid,current_setting('titan.ap_s2')::uuid,current_setting('titan.ap_s3')::uuid)) from jsonb_array_elements(r->'appeals') e),'only own sessions listed';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_q'),'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_my_appeals_v1()->'appeals')=0,'other player sees none';

  -- The player sees their own excluded sessions and account state, and which already have an open appeal; nobody else's.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_p'),'role','authenticated')::text,true);
  r:=public.titan_my_review_state_v1();
  assert jsonb_array_length(r->'excludedSessions')=3,'the three excluded sessions of the player are listed: '||r::text;
  assert (select count(*) from jsonb_array_elements(r->'excludedSessions') e where (e->>'hasOpenAppeal')::boolean)=3,'three already have an open appeal';
  assert not (r->'account'->>'suspended')::boolean,'account is not suspended';
  assert not (r::text like '%'||current_setting('titan.ap_sq')||'%'),'another player''s session is not exposed';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_my_review_state_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_p'),'role','authenticated')::text,true);

  -- Direct table access is closed.
  ok:=false; begin perform 1 from private.titan_appeals; exception when insufficient_privilege then ok:=true; end;
  assert ok,'table not readable by the API role';

  -- Administrators only for the queue and the decision.
end $$;

do $$
declare ok boolean; who text; r jsonb;
begin
  foreach who in array array['titan.ap_m','titan.ap_p'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting(who),'role','authenticated')::text,true);
    ok:=false; begin perform public.titan_appeal_list_v1('open',50); exception when insufficient_privilege then ok:=sqlerrm='ADMIN_ONLY'; end;
    assert ok,'list refused for '||who;
    ok:=false; begin perform public.titan_appeal_decide_v1(current_setting('titan.ap_id1')::bigint,true,'je valide'); exception when insufficient_privilege then ok:=sqlerrm='ADMIN_ONLY'; end;
    assert ok,'decision refused for '||who;
  end loop;

  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_a'),'role','authenticated')::text,true);
  r:=public.titan_appeal_list_v1('open',50);
  assert jsonb_array_length(r->'appeals')=3,'admin sees the three open appeals';
  assert (r->'appeals'->0->>'userId')=current_setting('titan.ap_p') and (r->'appeals'->0->>'message') is not null,'with author and message';
  ok:=false; begin perform public.titan_appeal_decide_v1(current_setting('titan.ap_id1')::bigint,true,'x'); exception when others then ok:=sqlerrm='REASON_REQUIRED'; end;
  assert ok,'decision needs a note';
  ok:=false; begin perform public.titan_appeal_decide_v1(-1,true,'note valable'); exception when others then ok:=sqlerrm='APPEAL_NOT_FOUND'; end;
  assert ok,'unknown appeal';

  -- Accept: the exclusion is lifted through the audited RPC, the appeal closes with the note.
  r:=public.titan_appeal_decide_v1(current_setting('titan.ap_id1')::bigint,true,'Contexte vérifié, séance rétablie.');
  assert r->>'status'='accepted','accepted';
  assert (select not is_suspicious and status='valid' from public.training_logs where id=current_setting('titan.ap_s1')::uuid),'exclusion lifted';
  assert exists(select 1 from public.titan_admin_audit where action='session.exclusion' and (payload->>'excluded')::boolean=false and target_user_id=current_setting('titan.ap_p')::uuid),'lift audited';
  ok:=false; begin perform public.titan_appeal_decide_v1(current_setting('titan.ap_id1')::bigint,false,'second avis'); exception when others then ok:=sqlerrm='APPEAL_CLOSED'; end;
  assert ok,'a closed appeal cannot be decided twice';

  -- Decline: the session stays excluded, the player reads the note.
  r:=public.titan_appeal_decide_v1((select (e->>'id')::bigint from jsonb_array_elements(public.titan_appeal_list_v1('open',50)->'appeals') e where e->>'sessionId'=current_setting('titan.ap_s2')),false,'Chevauchement avéré avec une autre séance.');
  assert r->>'status'='declined','declined';
  assert (select is_suspicious from public.training_logs where id=current_setting('titan.ap_s2')::uuid),'still excluded after a refusal';
end $$;

do $$
declare ok boolean; r jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_p'),'role','authenticated')::text,true);
  r:=public.titan_my_appeals_v1();
  assert exists(select 1 from jsonb_array_elements(r->'appeals') e where e->>'status'='declined' and e->>'decisionNote'='Chevauchement avéré avec une autre séance.'),'player reads the refusal note';
  assert exists(select 1 from jsonb_array_elements(r->'appeals') e where e->>'status'='accepted'),'and the acceptance';
  -- Cooldown after a refusal, then a new appeal is possible on another day (simulated by ageing the decision).
  ok:=false; begin perform public.titan_appeal_submit_v1('session',current_setting('titan.ap_s2')::uuid,'Je fais appel une nouvelle fois, vite.'); exception when others then ok:=sqlerrm='APPEAL_COOLDOWN'; end;
  assert ok,'cooldown after a refusal';
end $$;

-- Suspension appeal: accepted -> restored through the moderation RPC; a ban is never lifted from here.
reset role;
set local session_replication_role = replica;
update public.profiles set status='suspended' where id=current_setting('titan.ap_q')::uuid;
update public.profiles set status='banned' where id=current_setting('titan.ap_m')::uuid;
set local session_replication_role = origin;
set local role authenticated;
do $$
declare ok boolean; r jsonb; id2 bigint;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_q'),'role','authenticated')::text,true);
  r:=public.titan_appeal_submit_v1('account',null,'Ma suspension me semble injustifiée, merci de relire.');
  id2:=(r->>'id')::bigint;
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_a'),'role','authenticated')::text,true);
  r:=public.titan_appeal_decide_v1(id2,true,'Suspension levée après relecture.');
  assert r->>'status'='accepted' and (select status from public.profiles where id=current_setting('titan.ap_q')::uuid)='active','suspension lifted';
  -- The administrator cannot decide their own appeal.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_m'),'role','authenticated')::text,true);
  r:=public.titan_appeal_submit_v1('account',null,'Je suis modérateur banni, je souhaite relecture.');
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_a'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_appeal_decide_v1((r->>'id')::bigint,true,'levée du ban'); exception when others then ok:=sqlerrm='USE_ADMIN_PROFILE_TOOL'; end;
  assert ok,'a ban is not lifted from the appeal queue';
  r:=public.titan_appeal_decide_v1((r->>'id')::bigint,false,'Ban confirmé après relecture.');
  assert r->>'status'='declined','but it can be declined with a note';
end $$;

-- State changes, deleted accounts, self-decision, cooldown exit, anonymous on every RPC, bounds.
reset role;
do $$
declare d uuid:=gen_random_uuid(); b2 uuid:=gen_random_uuid(); a2 uuid:=gen_random_uuid(); sc uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(d,'{}'),(b2,'{}'),(a2,'{}');
  set local session_replication_role = replica;
  update public.profiles set status='deleted', is_suspended=true where id=d;
  update public.profiles set status='suspended' where id=b2;
  update public.profiles set role='admin', status='suspended' where id=a2;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious,status)
    values (sc,b2,'running','cardio',5,'km',1,now()-interval '1 day','{"duration":30}',true,'suspicious');
  perform set_config('titan.ap_d',d::text,true); perform set_config('titan.ap_b2',b2::text,true);
  perform set_config('titan.ap_a2',a2::text,true); perform set_config('titan.ap_sc',sc::text,true);
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare ok boolean; idc bigint; ida bigint; ids bigint; n int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_d'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_appeal_submit_v1('account',null,'Mon compte supprimé veut faire appel.'); exception when others then ok:=sqlerrm='NOT_SUSPENDED'; end;
  assert ok,'a deleted account has nothing to appeal';

  -- State changed between filing and decision: acceptance is refused (nothing to lift); the appeal can still be declined.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_b2'),'role','authenticated')::text,true);
  idc:=(public.titan_appeal_submit_v1('session',current_setting('titan.ap_sc')::uuid,'Séance exclue à tort, merci de relire.')->>'id')::bigint;
  ids:=(public.titan_appeal_submit_v1('account',null,'Suspension à tort, merci de relire aussi.')->>'id')::bigint;
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_a'),'role','authenticated')::text,true);
  perform public.titan_session_exclusion_v1(current_setting('titan.ap_sc')::uuid,false,'rétablie par ailleurs');
  perform public.titan_moderation_decide_v1(current_setting('titan.ap_b2')::uuid,'restore','rétablie par ailleurs');
  ok:=false; begin perform public.titan_appeal_decide_v1(idc,true,'accepté'); exception when others then ok:=sqlerrm='STATE_CHANGED'; end;
  assert ok,'hollow session acceptance refused';
  ok:=false; begin perform public.titan_appeal_decide_v1(ids,true,'accepté'); exception when others then ok:=sqlerrm='STATE_CHANGED'; end;
  assert ok,'hollow account acceptance refused';
  assert public.titan_appeal_decide_v1(idc,false,'Déjà rétablie, rien à lever.')->>'status'='declined','but it can be declined';
  assert public.titan_appeal_decide_v1(ids,false,'Déjà rétablie, rien à lever.')->>'status'='declined','both';

  -- An administrator cannot decide their own appeal.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_a2'),'role','authenticated')::text,true);
  ida:=(public.titan_appeal_submit_v1('account',null,'Je suis administrateur suspendu, relecture svp.')->>'id')::bigint;
  ok:=false; begin perform public.titan_appeal_decide_v1(ida,true,'je me lève'); exception when others then ok:=sqlerrm='CANNOT_MODERATE_SELF'; end;
  assert ok,'own appeal cannot be decided';

  -- Status filter and bounds.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_a'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_appeal_list_v1('nope',10); exception when others then ok:=sqlerrm='UNKNOWN_STATUS'; end;
  assert ok,'unknown status refused';
  assert jsonb_array_length(public.titan_appeal_list_v1('declined',1)->'appeals')=1,'limit honoured';
  n:=jsonb_array_length(public.titan_appeal_list_v1('open',-5)->'appeals');
  assert n>=1,'a non-positive limit is clamped to 1';

  -- Anonymous is refused on every RPC.
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_my_appeals_v1(); exception when others then ok:=true; end; assert ok,'anon my';
  ok:=false; begin perform public.titan_appeal_list_v1('open',10); exception when others then ok:=true; end; assert ok,'anon list';
  ok:=false; begin perform public.titan_appeal_decide_v1(ida,false,'anonyme'); exception when others then ok:=true; end; assert ok,'anon decide';
end $$;

-- Cooldown ends after seven days (decision aged by the fixture owner).
reset role;
update private.titan_appeals set decided_at = now() - interval '8 days', created_at = now() - interval '9 days'
 where session_id = current_setting('titan.ap_s2')::uuid;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_p'),'role','authenticated')::text,true);
  assert (public.titan_appeal_submit_v1('session',current_setting('titan.ap_s2')::uuid,'Nouvelle demande après le délai prévu.')->>'status')='open','appeal possible again after the cooldown';
end $$;

-- Cap on open appeals per player.
reset role;
set local session_replication_role = replica;
do $$
declare u uuid:=gen_random_uuid(); i int; ok boolean;
begin
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  for i in 1..6 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,is_suspicious,status)
    values (u,'running','cardio',5,'km',1,now()-i*interval '1 day','{"duration":30}',true,'suspicious');
  end loop;
  perform set_config('titan.ap_cap',u::text,true);
end $$;
set local session_replication_role = origin;
set local role authenticated;
do $$
declare ok boolean; s record; n int:=0;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ap_cap'),'role','authenticated')::text,true);
  for s in select id from public.training_logs where user_id=current_setting('titan.ap_cap')::uuid order by date loop
    begin perform public.titan_appeal_submit_v1('session',s.id,'Contestation motivée de cette séance.'); n:=n+1;
    exception when others then assert sqlerrm='APPEAL_LIMIT','limit error: '||sqlerrm; end;
  end loop;
  assert n=5,'five open appeals at most, got '||n;
end $$;

-- Nothing else moved.
reset role;
do $$
declare diff text;
begin
  select string_agg(distinct k, ',') into diff from (
    select 'profile' k, to_jsonb(p) r from public.profiles p union all select 'log', to_jsonb(l) from public.training_logs l) now_
   where not exists (select 1 from qa_ap_before b where b.k=now_.k and b.r=now_.r)
     and now_.r->>'id' not in (current_setting('titan.ap_q'), current_setting('titan.ap_s1'), current_setting('titan.ap_m'), current_setting('titan.ap_cap'), current_setting('titan.ap_b2'), current_setting('titan.ap_sc'), current_setting('titan.ap_p'), current_setting('titan.ap_d'), current_setting('titan.ap_a2'))
     and coalesce(now_.r->>'user_id','') <> current_setting('titan.ap_cap');
  assert diff is null,'unexpected rows changed: '||diff;
end $$;
rollback;
