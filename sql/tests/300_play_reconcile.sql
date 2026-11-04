-- V11-82: the Google Play sweep list names only active Google Play rows that are due, oldest first, bounded, and is not reachable by a player.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); r record; n integer;
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(d,'{}');
  assert not has_function_privilege('authenticated','public.titan_play_entitlements_due_v1(integer)','execute'), 'players cannot call it';
  assert not has_function_privilege('anon','public.titan_play_entitlements_due_v1(integer)','execute'), 'anonymous cannot call it';
  assert has_function_privilege('service_role','public.titan_play_entitlements_due_v1(integer)','execute'), 'the server can';
  -- a: ends tomorrow-ish (due); b: ends in 20 days and heard today (not due); c: silent for 4 days (due); d: inactive and past (never listed)
  perform public.titan_apply_entitlement_v1(a,'google_play','tok-a-0123456789abcdef',true,'active','verify',now() - interval '2 days','o1','titan_plus',null,null,now() + interval '10 hours',null,null);
  perform public.titan_apply_entitlement_v1(b,'google_play','tok-b-0123456789abcdef',true,'active','verify',now(),'o2','titan_plus',null,null,now() + interval '20 days',null,null);
  perform public.titan_apply_entitlement_v1(c,'google_play','tok-c-0123456789abcdef',true,'active','verify',now() - interval '4 days','o3','titan_plus',null,null,now() + interval '25 days',null,null);
  perform public.titan_apply_entitlement_v1(d,'google_play','tok-d-0123456789abcdef',false,'expired','verify',now() - interval '9 days','o4','titan_plus',null,null,now() - interval '8 days',null,null);
  -- another source is never listed
  perform public.titan_apply_entitlement_v1(b,'manual','manual-b-0123456789',true,'active','grant',now() - interval '30 days',null,null,null,null,now() - interval '1 day',null,null);
  select count(*) into n from public.titan_play_entitlements_due_v1(50) where external_id in ('tok-a-0123456789abcdef','tok-b-0123456789abcdef','tok-c-0123456789abcdef','tok-d-0123456789abcdef','manual-b-0123456789');
  assert n = 2, format('exactly the two due rows, got %s', n);
  select external_id into r from public.titan_play_entitlements_due_v1(1) limit 1;
  assert r.external_id = 'tok-c-0123456789abcdef', 'oldest first and the limit applies';
  assert (select count(*) from public.titan_play_entitlements_due_v1(0)) <= 1, 'a limit below 1 is raised to 1';
  assert (select count(*) from public.titan_play_entitlements_due_v1(100000)) <= 200, 'bounded to 200';
end $$;
rollback;
