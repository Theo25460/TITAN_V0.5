-- Idempotency and economy bounds. Synthetic identities only, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  perform set_config('titan.qa_a',a::text,true);
  perform set_config('titan.qa_b',b::text,true);
  perform set_config('titan.qa_event',gen_random_uuid()::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  update public.profiles set credits=1000,xp=0,level=1 where id in(a,b);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_a'),'role','authenticated')::text,true);
do $$
declare r record; replay record; d jsonb:=jsonb_build_object('client_event_id',current_setting('titan.qa_event'),'duration',30);
  stamp timestamptz:=now()-interval '1 hour';
begin
  select * into r from public.titan_submit_training_session('running','cardio',5,'km',d,stamp);
  assert r.xp=300 and r.credits=30 and r.credits_after=1030,'real session rewarded';
  perform set_config('titan.qa_log',r.log_id,true);
  select * into replay from public.titan_submit_training_session('running','cardio',5,'km',d,stamp);
  assert to_jsonb(replay)=to_jsonb(r),'exact replay returns the complete original receipt';
  begin
    perform public.titan_submit_training_session('running','cardio',6,'km',d,stamp);
    assert false,'changed content must not reuse a receipt';
  exception when unique_violation then assert sqlerrm='EVENT_CONTENT_CONFLICT',sqlerrm; end;
  begin
    insert into public.training_receipts(user_id,client_event_id,request,response)
      values(auth.uid(),gen_random_uuid(),'{}','{}');
    assert false,'client cannot forge receipts';
  exception when insufficient_privilege then null; end;
  perform public.titan_update_training_session(r.log_id::uuid,1,'{"note":"Edited"}');
  perform public.titan_update_training_session(r.log_id::uuid,2,'{"archived":true}');
  select * into replay from public.titan_submit_training_session('running','cardio',5,'km',d,stamp);
  assert to_jsonb(replay)=to_jsonb(r),'archive does not mint a second reward on retry';
  assert (select archived_at is not null and revision=3 from public.training_logs where id=r.log_id::uuid),'retry does not restore the archived session';
  perform public.titan_purchase_shop_item('cos_frame_neon');
  begin
    perform public.titan_purchase_shop_item('cos_frame_neon');
    assert false,'repeat purchase must not debit again';
  exception when check_violation then assert sqlerrm='PURCHASE_LIMIT_ONCE',sqlerrm; end;
  assert (select credits=580 and xp=300 from public.profiles where id=auth.uid()),'only one reward and one purchase debit';
  assert (select count(*)=1 from public.shop_history where user_id=auth.uid()),'one purchase history row';
end $$;

-- A client UUID is scoped to its owner: B can legitimately use the same UUID.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_b'),'role','authenticated')::text,true);
do $$
declare r record;
begin
  select * into r from public.titan_submit_training_session('yoga','mobility',30,'min',
    jsonb_build_object('client_event_id',current_setting('titan.qa_event')),now()-interval '2 hours');
  assert r.log_id<>current_setting('titan.qa_log') and r.xp=300 and r.credits_after=1030,'B receives its own independent receipt';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
begin
  assert (select count(*)=2 from public.training_receipts where client_event_id=current_setting('titan.qa_event')::uuid),'one receipt per owner';
  assert (select count(*)=2 from public.training_logs where client_event_id=current_setting('titan.qa_event')::uuid),'one session per owner';
  assert (select xp_awarded=300 and credits_awarded=30 from public.titan_weekly_reward_usage
    where user_id=current_setting('titan.qa_a')::uuid),'retries never consume the weekly allowance twice';
  begin
    insert into public.training_receipts(user_id,client_event_id,request,response)
      select user_id,client_event_id,request,response from public.training_receipts where user_id=current_setting('titan.qa_a')::uuid;
    assert false,'database rejects duplicate receipts even for privileged writers';
  exception when unique_violation then null; end;
end $$;

-- Update guards do not cover INSERT. Boundaries must also hold for trusted writers.
do $$
declare u uuid; column_name text; constraint_name text;
begin
  foreach column_name in array array['credits','xp','level'] loop
    u:=gen_random_uuid();
    insert into auth.users(id,raw_user_meta_data) values(u,'{}');
    delete from public.profiles where id=u;
    begin
      execute format('insert into public.profiles(id,username,%I) values($1,$2,$3)',column_name)
        using u,'qa_invalid_economy',case when column_name='level' then 0 else -1 end;
      assert false,'database must reject invalid '||column_name||' on INSERT';
    exception when check_violation then
      get stacked diagnostics constraint_name=constraint_name;
      assert constraint_name='profiles_'||column_name||'_minimum_check',constraint_name;
    end;
    insert into public.profiles(id,username,credits,xp,level) values(u,'qa_valid_boundary',0,0,1);
    assert (select credits=0 and xp=0 and level=1 from public.profiles where id=u),'valid economy boundary accepted';
  end loop;
end $$;
rollback;
