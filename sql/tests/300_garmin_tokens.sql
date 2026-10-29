-- GAR-06: Garmin tokens are stored as ciphertext only, readable by the server role alone, erased by every end of the link. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  perform set_config('titan.gt_a',a::text,true); perform set_config('titan.gt_b',b::text,true);
  assert not has_table_privilege('authenticated','private.titan_garmin_tokens','select'), 'no API grant on the token table';
  assert not has_table_privilege('anon','private.titan_garmin_tokens','select'), 'nor for anonymous';
  assert not has_function_privilege('authenticated','public.titan_garmin_tokens_get_v1(uuid)','execute'), 'a player cannot read tokens';
  assert not has_function_privilege('authenticated','public.titan_garmin_tokens_set_v1(uuid,text,text,timestamptz)','execute'), 'a player cannot write tokens';
  assert not has_function_privilege('anon','public.titan_garmin_unlink_for_v1(uuid)','execute'), 'anonymous cannot unlink for someone';
  assert has_function_privilege('service_role','public.titan_garmin_tokens_get_v1(uuid)','execute'), 'the server can read';
end $$;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.gt_a'),'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('garmin',true);
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.gt_b'),'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('garmin',true);
end $$;
reset role;
set local role service_role;
do $$
declare a uuid := current_setting('titan.gt_a')::uuid; b uuid := current_setting('titan.gt_b')::uuid; r jsonb; ok boolean;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  ok:=false; begin perform public.titan_garmin_tokens_set_v1(a,'ciphertext-access-0000','ciphertext-refresh-000',now()+interval '1 hour'); exception when others then ok:=sqlerrm='NOT_LINKED'; end; assert ok,'no tokens without a link';
  perform public.titan_garmin_link_v1(a,'gt-user-a'); perform public.titan_garmin_link_v1(b,'gt-user-b');
  perform public.titan_garmin_tokens_set_v1(a,'ciphertext-access-0000','ciphertext-refresh-000',now()+interval '1 hour');
  perform public.titan_garmin_tokens_set_v1(b,'ciphertext-access-bbbb','ciphertext-refresh-bbb',now()+interval '1 hour');
  r := public.titan_garmin_tokens_get_v1(a);
  assert r->>'access_enc'='ciphertext-access-0000' and r->>'refresh_enc'='ciphertext-refresh-000' and not (r ? 'user_id'),'own tokens only: '||r::text;
  -- A renewal replaces the access token and keeps the refresh token when none is sent.
  perform public.titan_garmin_tokens_set_v1(a,'ciphertext-access-1111',null,now()+interval '2 hours');
  r := public.titan_garmin_tokens_get_v1(a); assert r->>'access_enc'='ciphertext-access-1111' and r->>'refresh_enc'='ciphertext-refresh-000','refresh kept';
  ok:=false; begin perform public.titan_garmin_tokens_set_v1(a,'short',null,null); exception when others then ok:=true; end; assert ok,'a too-short value is refused';
end $$;
reset role;
-- Each way of ending the link erases the tokens, and only those of the account concerned.
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.gt_a'),'role','authenticated')::text,true);
  perform public.titan_garmin_unlink_v1();
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.gt_a')::uuid; b uuid := current_setting('titan.gt_b')::uuid;
begin
  assert not exists (select 1 from private.titan_garmin_tokens where user_id = a),'unlink erased the tokens';
  assert exists (select 1 from private.titan_garmin_tokens where user_id = b),'the other account keeps its own';
end $$;
set local role service_role;
do $$
declare b uuid := current_setting('titan.gt_b')::uuid;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  assert public.titan_garmin_deregister_v1('gt-user-b')=1,'Garmin deregistration';
  assert public.titan_garmin_tokens_get_v1(b) is null,'nothing readable after the link ended';
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.gt_b')::uuid;
begin
  assert not exists (select 1 from private.titan_garmin_tokens where user_id = b),'deregistration erased the tokens';
end $$;
-- Consent withdrawal and server-side unlink, then account deletion.
set local role service_role;
do $$
declare a uuid := current_setting('titan.gt_a')::uuid;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.titan_garmin_link_v1(a,'gt-user-a2'); -- consent was withdrawn by the unlink above
exception when others then
  assert sqlerrm='CONSENT_REQUIRED','a withdrawn consent blocks a new link: '||sqlerrm;
end $$;
reset role;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.gt_a'),'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('garmin',true);
end $$;
reset role;
set local role service_role;
do $$
declare a uuid := current_setting('titan.gt_a')::uuid;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.titan_garmin_link_v1(a,'gt-user-a3');
  perform public.titan_garmin_tokens_set_v1(a,'ciphertext-access-2222','ciphertext-refresh-222',now()+interval '1 hour');
  perform public.titan_garmin_unlink_for_v1(a);
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.gt_a')::uuid; b uuid := current_setting('titan.gt_b')::uuid;
begin
  assert not exists (select 1 from private.titan_garmin_tokens where user_id = a),'unlink for the player erased the tokens';
  assert not exists (select 1 from private.titan_garmin_links where user_id = a and revoked_at is null),'and ended the link';
  -- Account deletion cascades.
  insert into private.titan_garmin_links(user_id, garmin_user_id) values (b,'gt-user-b2') on conflict (user_id) do update set garmin_user_id=excluded.garmin_user_id, revoked_at=null;
  insert into private.titan_garmin_tokens(user_id, access_enc) values (b,'ciphertext-access-3333');
  delete from auth.users where id = b;
  assert not exists (select 1 from private.titan_garmin_tokens where user_id = b),'account deletion erased the tokens';
end $$;
rollback;
