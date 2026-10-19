-- CHEAT14 / CHEAT15: administrator-confirmed exclusion of a session, reversible, audited, never automatic.
-- Synthetic identities, real RPC with API roles, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
  ls uuid:=gen_random_uuid(); la uuid:=gen_random_uuid(); lb uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(m,'{}'),(p,'{}');
  update public.profiles set role='admin' where id in (a,b);
  update public.profiles set role='moderator' where id=m;
  update public.profiles set credits=500,xp=100,level=3 where id=p;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details) values
    (ls,p,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}'),
    (la,a,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}'),
    (lb,b,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}');
  perform set_config('titan.se_a',a::text,true); perform set_config('titan.se_m',m::text,true);
  perform set_config('titan.se_p',p::text,true); perform set_config('titan.se_ls',ls::text,true);
  perform set_config('titan.se_la',la::text,true); perform set_config('titan.se_lb',lb::text,true);
  assert to_regprocedure('public.titan_session_exclusion_v1(uuid,boolean,text)') is not null,'the RPC exists';
end $$;

set local role authenticated;
do $$
declare who text; ok boolean;
begin
  -- Only administrators.
  foreach who in array array['titan.se_m','titan.se_p'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting(who),'role','authenticated')::text,true);
    ok:=false; begin perform public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,true,'motif de test');
    exception when insufficient_privilege then ok:=sqlerrm='ADMIN_ONLY'; end;
    assert ok,'refused for '||who;
  end loop;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,true,'motif de test'); exception when others then ok:=true; end;
  assert ok,'anonymous refused';
end $$;

do $$
declare r jsonb; ok boolean; before_p record; n int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.se_a'),'role','authenticated')::text,true);
  select credits,xp,level into before_p from public.profiles where id=current_setting('titan.se_p')::uuid;

  -- Inputs and targets are validated before anything changes.
  ok:=false; begin perform public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,true,'  '); exception when others then ok:=sqlerrm='REASON_REQUIRED'; end;
  assert ok,'a reason is required';
  ok:=false; begin perform public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,null,'motif de test'); exception when others then ok:=sqlerrm='EXCLUSION_REQUIRED'; end;
  assert ok,'an explicit choice is required';
  ok:=false; begin perform public.titan_session_exclusion_v1(gen_random_uuid(),true,'motif de test'); exception when others then ok:=sqlerrm='SESSION_NOT_FOUND'; end;
  assert ok,'unknown session';
  ok:=false; begin perform public.titan_session_exclusion_v1(current_setting('titan.se_la')::uuid,true,'motif de test'); exception when others then ok:=sqlerrm='CANNOT_MODERATE_SELF'; end;
  assert ok,'an administrator cannot exclude their own session';
  ok:=false; begin perform public.titan_session_exclusion_v1(current_setting('titan.se_lb')::uuid,true,'motif de test'); exception when others then ok:=sqlerrm='CANNOT_MODERATE_ADMIN'; end;
  assert ok,'an administrator cannot exclude another administrator session';
  assert (select not coalesce(is_suspicious,false) from public.training_logs where id=current_setting('titan.se_ls')::uuid),'nothing changed so far';

  -- Exclude.
  r:=public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,true,'Séance impossible : vitesse 2x la médiane');
  assert (r->>'excluded')::boolean and (r->>'changed')::boolean,'excluded and changed: '||r::text;
  assert (select is_suspicious and status='suspicious' and admin_note like 'Séance impossible%' and reviewed_by=current_setting('titan.se_a')::uuid and reviewed_at is not null
    from public.training_logs where id=current_setting('titan.se_ls')::uuid),'review columns written with the administrator identity';
  assert current_setting('titan.admin_session_review',true)='','the marker is cleared after the call';
  assert auth.uid()=current_setting('titan.se_a')::uuid,'the caller identity is untouched';
  select count(*) into n from public.titan_admin_audit where action='session.exclusion' and admin_id=current_setting('titan.se_a')::uuid and target_user_id=current_setting('titan.se_p')::uuid
    and payload->>'reason' like 'Séance impossible%' and (payload->>'excluded')::boolean;
  assert n=1,'one audit entry with administrator, player and reason';
  -- Idempotent: nothing more is written.
  r:=public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,true,'deuxième appel');
  assert not (r->>'changed')::boolean,'second identical call changes nothing';
  select count(*) into n from public.titan_admin_audit where action='session.exclusion' and target_user_id=current_setting('titan.se_p')::uuid;
  assert n=1,'and adds no audit entry';
  -- Never touches what the player already earned, nor the session content.
  assert (select (credits,xp,level)=(before_p.credits,before_p.xp,before_p.level) from public.profiles where id=current_setting('titan.se_p')::uuid),'no XP or credit changed';
  assert (select (val,xp,details)=(5,10,'{"duration":30}'::jsonb) from public.training_logs where id=current_setting('titan.se_ls')::uuid),'session content untouched';

  -- Reversible.
  r:=public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,false,'Vérifié : séance légitime');
  assert not (select is_suspicious from public.training_logs where id=current_setting('titan.se_ls')::uuid) and (select status from public.training_logs where id=current_setting('titan.se_ls')::uuid)='valid','restored';
  select count(*) into n from public.titan_admin_audit where action='session.exclusion' and target_user_id=current_setting('titan.se_p')::uuid;
  assert n=2,'the restoration is audited too';

  -- The exemption is narrow: even with the marker, an administrator cannot change anything but the review columns...
  perform set_config('titan.admin_session_review','on',true);
  ok:=false; begin update public.training_logs set val=500 where id=current_setting('titan.se_ls')::uuid; exception when others then ok:=sqlerrm='TRAINING_USER_MISMATCH'; end;
  assert ok,'content edits of another player stay refused even with the marker';
  perform set_config('titan.admin_session_review','',true);
  -- ...and without the marker the review columns are refused for a direct update, as before.
  ok:=false; begin update public.training_logs set is_suspicious=true where id=current_setting('titan.se_ls')::uuid; exception when others then ok:=sqlerrm='TRAINING_USER_MISMATCH'; end;
  assert ok,'no marker, no exemption';
end $$;

-- The marker alone gives nothing to a non-administrator, and the owner keeps seeing the excluded session.
do $$
declare ok boolean; seen int; changed int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.se_m'),'role','authenticated')::text,true);
  perform set_config('titan.admin_session_review','on',true);
  ok:=false; changed:=0;
  begin update public.training_logs set is_suspicious=true where id=current_setting('titan.se_ls')::uuid; get diagnostics changed = row_count;
  exception when others then ok:=true; end;
  assert ok or changed=0,'a moderator with the marker changes nothing (refused or hidden by row security)';
  perform set_config('titan.admin_session_review','',true);
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.se_a'),'role','authenticated')::text,true);
  perform public.titan_session_exclusion_v1(current_setting('titan.se_ls')::uuid,true,'exclusion visible du joueur');
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.se_p'),'role','authenticated')::text,true);
  select count(*) into seen from public.training_logs where id=current_setting('titan.se_ls')::uuid;
  assert seen=1,'the owner still sees the excluded session';
end $$;
reset role;
-- Row security aside (table owner), the guard itself refuses the marker for a non-administrator.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.se_m'),'role','authenticated')::text,true);
  perform set_config('titan.admin_session_review','on',true);
  ok:=false; begin update public.training_logs set is_suspicious=false where id=current_setting('titan.se_ls')::uuid; exception when others then ok:=sqlerrm='TRAINING_USER_MISMATCH'; end;
  assert ok,'the guard refuses the marker when the caller is not an administrator';
  perform set_config('titan.admin_session_review','',true);
end $$;
rollback;
