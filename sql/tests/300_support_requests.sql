-- Synthetic support requests only, all fixtures roll back. Never run on production.
begin;
do $$ begin
  assert to_regprocedure('public.titan_support_accept_v300(uuid,uuid,text,text,boolean)') is not null,'support reception RPC must exist';
end $$;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); begin
  perform set_config('titan.support_a',a::text,true); perform set_config('titan.support_b',b::text,true);
  perform set_config('titan.support_request',gen_random_uuid()::text,true);
  perform set_config('titan.support_lease',gen_random_uuid()::text,true);
  insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
    values(a,'verified@example.test',now(),false,'{}'),(b,'other@example.test',now(),false,'{}');
end $$;
set local role service_role;
do $$ declare a uuid:=current_setting('titan.support_a')::uuid; b uuid:=current_setting('titan.support_b')::uuid;
  r uuid:=current_setting('titan.support_request')::uuid; l uuid:=current_setting('titan.support_lease')::uuid;
  j jsonb; again jsonb; other jsonb; begin
  j:=public.titan_support_accept_v300(a,r,'bug','Un problème fictif.',false);
  assert j->>'notification'='pending' and j->>'reference' is not null,'receipt without email promise';
  assert not(j ? 'message') and not(j ? 'user_id') and not(j ? 'reply_email'),'minimal receipt';
  again:=public.titan_support_accept_v300(a,r,'bug','Un problème fictif.',false); assert j=again,'same receipt on retry';
  begin perform public.titan_support_accept_v300(a,r,'bug','Un autre problème.',false); assert false,'conflicting retry';
    exception when sqlstate 'PT409' then assert sqlerrm='SUPPORT_REQUEST_CONFLICT',sqlerrm; end;
  other:=public.titan_support_accept_v300(b,r,'bug','Un problème fictif.',true);
  assert other->>'reference'<>j->>'reference','same request key in other account cannot disclose first receipt';
  again:=public.titan_support_claim_v300(a,r,l,'assistance@example.test');
  assert again->>'notification'='claimed' and again->>'message'='Un problème fictif.' and again->>'reply_email' is null,'claim text and no reply without consent';
  assert public.titan_support_claim_v300(a,r,gen_random_uuid(),'other@example.test')->>'notification'='pending','exclusive lease';
  assert not public.titan_support_finish_v300(a,r,gen_random_uuid(),true,'mail-fake'),'foreign lease cannot mark sent';
  assert public.titan_support_finish_v300(a,r,l,false,null),'failed send released';
  again:=public.titan_support_claim_v300(a,r,l,'changed@example.test'); assert again->>'from'='assistance@example.test','envelope frozen on retry';
  assert public.titan_support_finish_v300(a,r,l,true,'mail-fake'),'matching completion';
  assert public.titan_support_accept_v300(a,r,'bug','Un problème fictif.',false)->>'notification'='sent','durable email acceptance';
  assert public.titan_support_claim_v300(a,r,gen_random_uuid(),'changed@example.test')->>'notification'='sent','never claim an accepted alert twice';
  again:=public.titan_support_claim_v300(b,r,gen_random_uuid(),'assistance@example.test'); assert again->>'reply_email'='other@example.test','reply-to only consenting owner';
  perform public.titan_support_accept_v300(a,gen_random_uuid(),'titanplus','Demande fictive de remboursement.',false);
  perform public.titan_support_accept_v300(a,gen_random_uuid(),'donnees','Une demande fictive de données.',false);
  begin perform public.titan_support_accept_v300(a,gen_random_uuid(),'autre','Quatrième demande fictive.',false); assert false,'quota';
    exception when sqlstate 'PT429' then assert sqlerrm='SUPPORT_RATE_LIMIT',sqlerrm; end;
  assert public.titan_support_accept_v300(a,r,'bug','Un problème fictif.',false)->>'reference'=j->>'reference','retry allowed even at quota';
  begin perform public.titan_support_accept_v300(a,gen_random_uuid(),'invalid','Un problème fictif.',false); assert false,'category';
    exception when invalid_parameter_value then assert sqlerrm='SUPPORT_INVALID_INPUT',sqlerrm; end;
  begin perform public.titan_support_accept_v300(a,gen_random_uuid(),'bug','short',false); assert false,'short message';
    exception when invalid_parameter_value then null; end;
  begin perform public.titan_support_accept_v300(a,gen_random_uuid(),'bug',repeat('a',4001),false); assert false,'long message';
    exception when invalid_parameter_value then null; end;
  begin perform public.titan_support_accept_v300(a,gen_random_uuid(),'bug',E'Un contrôle\r interdit',false); assert false,'control';
    exception when invalid_parameter_value then null; end;
  begin perform public.titan_support_accept_v300(a,null,'bug','Un problème fictif.',false); assert false,'null request';
    exception when invalid_parameter_value then null; end;
  assert public.titan_support_claim_v300(b,gen_random_uuid(),gen_random_uuid(),'assistance@example.test')->>'notification'='pending','missing id exposes nothing';
end $$;
reset role;
-- The consenting email is frozen for provider dedupe even if the account changes it.
update auth.users set email='changed@example.test' where id=current_setting('titan.support_b')::uuid;
set local role service_role;
do $$ declare b uuid:=current_setting('titan.support_b')::uuid; r uuid:=current_setting('titan.support_request')::uuid; begin
  assert public.titan_support_accept_v300(b,r,'bug','Un problème fictif.',true)->>'reference' is not null,'same client request survives account email change';
end $$;
reset role;
-- Test timing without actually waiting; only synthetic rows within this rollback.
update private.titan_support_requests set notification_first_attempt_at=now()-interval '24 hours',notification_lease_until=now()-interval '1 minute'
  where user_id=current_setting('titan.support_b')::uuid;
set local role service_role;
do $$ declare a uuid:=current_setting('titan.support_a')::uuid; b uuid:=current_setting('titan.support_b')::uuid; r uuid:=current_setting('titan.support_request')::uuid; begin
  assert public.titan_support_claim_v300(b,r,gen_random_uuid(),'assistance@example.test')->>'notification'='pending','no new send past provider dedupe window';
end $$;
reset role;
update auth.users set is_anonymous=true where id=current_setting('titan.support_b')::uuid;
set local role service_role;
do $$ begin
  begin perform public.titan_support_accept_v300(current_setting('titan.support_b')::uuid,gen_random_uuid(),'bug','Un problème fictif.',false);
    assert false,'anonymous account'; exception when insufficient_privilege then assert sqlerrm='SUPPORT_ACCOUNT_UNAVAILABLE',sqlerrm; end;
end $$;
reset role;
update auth.users set is_anonymous=false,email_confirmed_at=null where id=current_setting('titan.support_b')::uuid;
set local role service_role;
do $$ begin
  begin perform public.titan_support_accept_v300(current_setting('titan.support_b')::uuid,gen_random_uuid(),'bug','Un problème fictif.',false);
    assert false,'unconfirmed account'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare role_name text; function_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    assert not has_table_privilege(role_name,'private.titan_support_requests','SELECT,INSERT,UPDATE,DELETE'),'no public table access';
    foreach function_name in array array['public.titan_support_accept_v300(uuid,uuid,text,text,boolean)',
      'public.titan_support_claim_v300(uuid,uuid,uuid,text)','public.titan_support_finish_v300(uuid,uuid,uuid,boolean,text)'] loop
      assert not has_function_privilege(role_name,function_name,'execute'),'no client support RPC';
      assert has_function_privilege('service_role',function_name,'execute'),'service-only support RPC';
    end loop;
  end loop;
  assert (select relrowsecurity from pg_class where oid='private.titan_support_requests'::regclass),'RLS defense in depth';
  assert not exists(select 1 from pg_publication_tables where schemaname='private' and tablename='titan_support_requests'),'no Realtime';
  assert (select proconfig @> array['search_path=""'] from pg_proc where oid='public.titan_support_accept_v300(uuid,uuid,text,text,boolean)'::regprocedure),'empty definer search path';
  delete from auth.users where id=current_setting('titan.support_a')::uuid;
  assert not exists(select 1 from private.titan_support_requests where user_id=current_setting('titan.support_a')::uuid),'account deletion cascades only own support';
  assert exists(select 1 from private.titan_support_requests where user_id=current_setting('titan.support_b')::uuid),'other account retained';
end $$;
rollback;
