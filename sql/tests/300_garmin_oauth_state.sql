begin;

do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  perform set_config('titan.oauth_a',a::text,true);
  perform set_config('titan.oauth_b',b::text,true);
  assert not has_table_privilege('authenticated','private.titan_garmin_oauth_attempts','select');
  assert not has_function_privilege('anon','public.titan_garmin_oauth_start_v1(uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.titan_garmin_oauth_consume_v1(uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.titan_garmin_oauth_link_v1(uuid,text,text,text,text,timestamptz)','execute');
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.oauth_a'),'role','authenticated')::text,true);
select public.titan_set_source_consent_v1('garmin',true);
reset role;

set local role service_role;
do $$
declare
  a uuid := current_setting('titan.oauth_a')::uuid;
  b uuid := current_setting('titan.oauth_b')::uuid;
  first_nonce text := repeat('a',64);
  next_nonce text := repeat('b',64);
  rejected boolean := false;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin
    perform public.titan_garmin_oauth_start_v1(b,first_nonce);
  exception when insufficient_privilege then rejected := sqlerrm='CONSENT_REQUIRED'; end;
  assert rejected, 'a start needs local consent';
  assert public.titan_garmin_oauth_start_v1(a,first_nonce);
  assert not public.titan_garmin_oauth_consume_v1(b,first_nonce), 'attempts belong to one TITAN owner';
  assert public.titan_garmin_oauth_start_v1(a,next_nonce);
  assert not public.titan_garmin_oauth_consume_v1(a,first_nonce), 'a new attempt replaces the preceding one';
  assert public.titan_garmin_oauth_consume_v1(a,next_nonce);
  assert not public.titan_garmin_oauth_consume_v1(a,next_nonce), 'a nonce is consumed once';

  perform public.titan_garmin_link_v1(a,'previous-garmin-user');
  perform public.titan_garmin_tokens_set_v1(a,'previous-access-ciphertext','previous-refresh-ciphertext',null);
  rejected := false;
  begin
    perform public.titan_garmin_oauth_link_v1(a,next_nonce,'replacement-garmin-user','short',null,null);
  exception when check_violation then rejected := true; end;
  assert rejected, 'invalid ciphertext causes the whole transaction to fail';
  assert public.titan_garmin_tokens_get_v1(a)->>'access_enc'='previous-access-ciphertext';
  assert public.titan_garmin_oauth_link_v1(a,next_nonce,'replacement-garmin-user','replacement-access-ciphertext',null,null)->>'linked'='true';
  assert public.titan_garmin_tokens_get_v1(a)->>'access_enc'='replacement-access-ciphertext';
  assert public.titan_garmin_tokens_get_v1(a)->>'refresh_enc' is null, 'do not carry an old Garmin identity refresh token into its replacement';
  assert public.titan_garmin_oauth_start_v1(a,first_nonce);
  assert public.titan_garmin_oauth_consume_v1(a,first_nonce);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.oauth_a'),'role','authenticated')::text,true);
select public.titan_set_source_consent_v1('garmin',false);
select public.titan_set_source_consent_v1('garmin',true);
reset role;

set local role service_role;
do $$
declare a uuid := current_setting('titan.oauth_a')::uuid; rejected boolean := false;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin
    perform public.titan_garmin_oauth_link_v1(a,repeat('a',64),'replacement-garmin-user','replacement-access-ciphertext',null,null);
  exception when insufficient_privilege then rejected := sqlerrm='GARMIN_STATE_INVALID'; end;
  assert rejected, 'withdrawal and regrant cannot re-enable a previously claimed attempt';
  assert public.titan_garmin_tokens_get_v1(a) is null, 'withdrawal erases the old credentials';
  assert public.titan_garmin_oauth_start_v1(a,repeat('c',64));
end $$;
reset role;

update private.titan_garmin_oauth_attempts set expires_at=now()-interval '1 second' where user_id=current_setting('titan.oauth_a')::uuid;
set local role service_role;
do $$ begin
  assert not public.titan_garmin_oauth_consume_v1(current_setting('titan.oauth_a')::uuid,repeat('c',64)), 'an expired attempt is never consumed';
end $$;
reset role;

rollback;
