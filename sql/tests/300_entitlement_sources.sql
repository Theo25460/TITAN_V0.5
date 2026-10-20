-- PREM13 / PREM14 / ADR-004: one access record per paying source. Real functions, synthetic identities, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); t0 timestamptz:=now()-interval '10 days'; ok boolean; denied boolean; r record;
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  perform set_config('titan.es_a',a::text,true); perform set_config('titan.es_b',b::text,true);
  assert (select is_elite from public.profiles where id=a) is not true, 'a new account has no TITAN+';

  -- 1. Paddle grants access through the unchanged webhook function.
  ok := public.titan_apply_paddle_entitlement_v87(a,true,'active','subscription.activated',t0,'sub_1','txn_1','pro_x','pri_x',t0+interval '30 days',null,null,null);
  assert ok, 'paddle event applied';
  assert (select is_elite from public.profiles where id=a), 'paddle grants access';
  assert (select count(*) from private.titan_entitlements where user_id=a and source='paddle')=1, 'one paddle row';

  -- 2. Google Play grants access too; both sources coexist.
  ok := public.titan_apply_entitlement_v1(a,'google_play','gp-token-AAA',true,'active','SUBSCRIPTION_PURCHASED',t0+interval '1 day','GPA.1','titan_plus','monthly',t0+interval '31 days',null,null,null);
  assert ok, 'google event applied';
  assert (select count(*) from private.titan_entitlements where user_id=a)=2, 'two sources';
  -- the purchase token is never copied to the profile row a player can read
  assert (select elite_subscription_id from public.profiles where id=a) is null, 'token not exposed on profiles';
  assert (select elite_product_id from public.profiles where id=a)='titan_plus', 'product mirrored';

  -- 3. THE FIX: cancelling Paddle later does not revoke access paid through Google Play.
  ok := public.titan_apply_paddle_entitlement_v87(a,false,'canceled','subscription.canceled',t0+interval '2 days','sub_1','txn_1','pro_x','pri_x',null,t0+interval '2 days',null,null);
  assert ok, 'cancel applied to the paddle row';
  assert (select is_elite from public.profiles where id=a), 'google access survives a paddle cancellation';

  -- 4. An older event never overrides a newer one on the same source.
  ok := public.titan_apply_entitlement_v1(a,'google_play','gp-token-AAA',false,'expired','SUBSCRIPTION_EXPIRED',t0,'GPA.1','titan_plus','monthly',null,t0,null,null);
  assert not ok, 'stale google event ignored';
  assert (select is_elite from public.profiles where id=a), 'still active after a stale event';
  assert (select is_active from private.titan_entitlements where source='google_play' and external_id='gp-token-AAA'), 'row unchanged';

  -- 5. Replaying the same event is harmless.
  ok := public.titan_apply_entitlement_v1(a,'google_play','gp-token-AAA',true,'active','SUBSCRIPTION_PURCHASED',t0+interval '1 day','GPA.1','titan_plus','monthly',t0+interval '31 days',null,null,null);
  assert (select count(*) from private.titan_entitlements where user_id=a)=2, 'replay creates no duplicate';

  -- 6. When the last active source ends, access ends.
  ok := public.titan_apply_entitlement_v1(a,'google_play','gp-token-AAA',false,'expired','SUBSCRIPTION_EXPIRED',t0+interval '40 days','GPA.1','titan_plus','monthly',null,t0+interval '40 days',null,null);
  assert ok and not (select is_elite from public.profiles where id=a), 'access ends with the last active source';

  -- 7. A purchase token serves one account only.
  denied:=false;
  begin perform public.titan_apply_entitlement_v1(b,'google_play','gp-token-AAA',true,'active','SUBSCRIPTION_PURCHASED',now(),'GPA.1','titan_plus','monthly',null,null,null,null);
  exception when insufficient_privilege then denied:=true; end;
  assert denied, 'a token already used by another account is refused';
  assert (select is_elite from public.profiles where id=b) is not true, 'the second account gained nothing';

  -- 8. Malformed calls are refused.
  denied:=false; begin perform public.titan_apply_entitlement_v1(b,'apple','x',true,'a','e',now()); exception when others then denied:=true; end; assert denied, 'unknown source refused';
  denied:=false; begin perform public.titan_apply_entitlement_v1(b,'google_play','',true,'a','e',now()); exception when others then denied:=true; end; assert denied, 'empty id refused';
  denied:=false; begin perform public.titan_apply_entitlement_v1(b,'google_play','y',true,'a','e',null); exception when others then denied:=true; end; assert denied, 'missing time refused';
  denied:=false; begin perform public.titan_apply_entitlement_v1(gen_random_uuid(),'google_play','z',true,'a','e',now()); exception when others then denied:=true; end; assert denied, 'unknown profile refused';
end $$;

-- 9. Players cannot call the function or read the table.
set local role authenticated;
do $$
declare a uuid:=current_setting('titan.es_a')::uuid; denied boolean;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  denied:=false; begin perform public.titan_apply_entitlement_v1(a,'google_play','forged',true,'active','x',now()); exception when others then denied:=true; end;
  assert denied, 'a player cannot grant themselves access';
  denied:=false; begin perform public.titan_apply_paddle_entitlement_v87(a,true,'active','x',now(),'s','o','p','v',null,null,null,null); exception when others then denied:=true; end;
  assert denied, 'the paddle function is not callable by players';
  denied:=false; begin perform count(*) from private.titan_entitlements; exception when others then denied:=true; end;
  assert denied, 'the table is private';
end $$;
reset role;
rollback;
