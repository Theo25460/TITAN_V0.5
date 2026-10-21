-- SEC10: logical attacks on the shop, Premium, balances and session creation, run as a hostile player.
-- Each attack must be refused and must leave balances, inventory and entitlements untouched.
-- Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
begin
  perform set_config('titan.atk_a',a::text,true); perform set_config('titan.atk_b',b::text,true);
  perform set_config('titan.atk_s',s::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(s,'{}');
  update public.profiles set credits=1000,xp=100,level=2,is_elite=false where id in (a,b);
  update public.profiles set credits=5000,is_suspended=true,status='suspended' where id=s;
end $$;
create temporary table qa_atk_before as
  select id,to_jsonb(p)-'updated_at' row from public.profiles p where id in
    (current_setting('titan.atk_a')::uuid,current_setting('titan.atk_b')::uuid,current_setting('titan.atk_s')::uuid);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.atk_a'),'role','authenticated',
  'user_metadata',json_build_object('role','super_admin','is_elite',true))::text,true);
do $$
declare a uuid:=current_setting('titan.atk_a')::uuid; b uuid:=current_setting('titan.atk_b')::uuid; v int; r record;
  attack text; denied boolean; known record; custom record;
begin
  -- 1. Direct writes to one's own economy, entitlement, moderation and role columns have no effect.
  for attack in select unnest(array[
    'credits=999999','xp=999999','level=99','is_elite=true','elite_ends_at=now()+interval ''10 years''',
    'elite_refunded_at=null','role=''super_admin''','status=''active''','is_suspended=false','moderated_by=null']) loop
    begin
      execute format('update public.profiles set %s where id=$1',attack) using a;
    exception when others then null; end;
  end loop;
  assert (select credits=1000 and xp=100 and level=2 and not is_elite and role='user' and elite_ends_at is null
    from public.profiles where id=a),'direct profile tampering changes nothing';
  -- 2. Writing someone else's profile is refused or affects no row.
  update public.profiles set credits=0 where id=b; get diagnostics v=row_count; assert v=0,'foreign profile untouched';
  -- 3. Forged purchase history, inventory and receipts.
  for attack in select unnest(array[
    'insert into public.shop_history(user_id,item_id,cost_credits,reward_credits) values (auth.uid(),''cos_frame_aegis'',0,5000)',
    'insert into public.inventory(user_id,item_id) values (auth.uid(),1)',
    'update public.shop_history set cost_credits=0',
    'delete from public.shop_history',
    'insert into public.user_achievements(user_id,achievement_id) values (auth.uid(),''forged'')',
    'insert into public.training_receipts(user_id,client_event_id,request,response) values (auth.uid(),gen_random_uuid(),''{}'',''{}'')']) loop
    denied:=false;
    begin execute attack; get diagnostics v=row_count; denied:=v=0;
    exception when others then denied:=true; end;
    assert denied,'refused: '||attack;
  end loop;
  assert not exists(select 1 from public.shop_history where user_id=a and reward_credits>0),'no forged refund';
  -- 4. Internal economy functions are not callable by players.
  for attack in select unnest(array[
    'select public.add_rewards(auth.uid(),9999,9999)',
    'select public.titan_apply_progression_reward(auth.uid(),9999,9999)',
    'select public.titan_charge_credits(auth.uid(),-9999,''x'')',
    'select public.titan_apply_paddle_entitlement_v87(auth.uid(),true,''active'',''x'',now(),''p'',''v'',''s'',''o'',null,null,null,null)',
    'select public.titan_admin_update_profile(auth.uid(),''{"credits":9999}'')',
    'select public.titan_admin_update_profile_v1(auth.uid(),''{"credits":9999}'',''x'')']) loop
    denied:=false;
    begin execute attack; exception when others then denied:=true; end;
    assert denied,'refused: '||attack;
  end loop;
  -- 5. Shop abuse: unknown item, injection, non-cosmetic, negative or repeated purchase, no funds.
  for attack in select unnest(array['no_such_item','cos_frame_neon'' or ''1''=''1','''; update public.profiles set credits=9999; --','','  ']) loop
    denied:=false;
    begin perform public.titan_purchase_shop_item(attack); exception when others then denied:=true; end;
    assert denied,'bad item refused: '||attack;
  end loop;
  begin perform public.titan_purchase_shop_item(null); assert false,'null item'; exception when others then null; end;
  perform public.titan_purchase_shop_item('cos_frame_neon');
  select credits into v from public.profiles where id=a;
  begin perform public.titan_purchase_shop_item('cos_frame_neon'); assert false,'second purchase';
  exception when others then assert sqlerrm='PURCHASE_LIMIT_ONCE',sqlerrm; end;
  assert (select credits from public.profiles where id=a)=v and (select count(*) from public.shop_history where user_id=a)=1,
    'a repeated purchase debits once';
  update public.profiles set credits=credits where id=a;
  begin
    perform public.titan_purchase_shop_item('cos_frame_aegis'); perform public.titan_purchase_shop_item('cos_frame_frost');
    perform public.titan_purchase_shop_item('cos_frame_summit'); perform public.titan_purchase_shop_item('cos_map_night');
    assert false,'purchases cannot exceed the balance';
  exception when others then assert sqlerrm='NO_FUNDS',sqlerrm; end;
  assert (select credits>=0 from public.profiles where id=a),'balance never negative';
  -- 6. Session creation: absurd values, future date, malformed payloads and replays are not rewarded.
  select credits,xp into r from public.profiles where id=a;
  for attack in select unnest(array['-5','0','1e12','NaN']) loop
    denied:=false;
    begin perform public.titan_submit_training_session('running','cardio',attack::numeric,'km',
      jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '1 hour');
    exception when others then denied:=true; end;
    assert denied,'implausible value refused: '||attack;
  end loop;
  begin perform public.titan_submit_training_session('running','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()+interval '30 days');
    assert false,'future session'; exception when others then null; end;
  begin perform public.titan_submit_training_session('running','cardio',5,'km','not an object'::jsonb,now()-interval '1 hour');
    assert false,'malformed details'; exception when others then null; end;
  assert (select credits=r.credits and xp=r.xp from public.profiles where id=a),'refused sessions award nothing';
  -- A free-text sport label is accepted (atypical sports are allowed) but never earns more than a known sport.
  select * into known from public.titan_submit_training_session('running','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '100 minutes');
  select * into custom from public.titan_submit_training_session('qa_made_up_sport','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '200 minutes');
  assert custom.xp<=known.xp and custom.credits<=known.credits,'an invented sport earns no bonus';
  select credits,xp into r from public.profiles where id=a;
  -- 7. Forged reward metadata is replaced by canonical values.
  perform public.titan_submit_training_session('running','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30,'xp',99999,'credits',99999,
      'serverReward',true,'rewardMult',50),now()-interval '90 minutes');
  assert (select xp-r.xp<=400 and credits-r.credits<=100 from public.profiles where id=a),'forged reward fields ignored';
  -- 8. Premium is not obtainable from the client: metadata, lookalike calls, direct inserts.
  begin insert into public.premium_access(user_id,access_type) values (auth.uid(),'lifetime'); assert false,'premium_access insert';
  exception when others then null; end;
  assert not (select is_elite from public.profiles where id=a),'no self-granted TITAN+';
  assert not public.titan_is_admin(a),'user_metadata grants no admin right';
end $$;

-- A suspended account cannot buy or earn.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.atk_s'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.titan_purchase_shop_item('cos_frame_neon'); assert false,'suspended purchase';
  exception when others then assert sqlerrm='ACCOUNT_SUSPENDED',sqlerrm; end;
  begin perform public.titan_submit_training_session('running','cardio',5,'km',
      jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '1 hour');
    assert false,'suspended session'; exception when others then null; end;
end $$;
-- Anonymous callers reach none of it.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare attack text; denied boolean; begin
  for attack in select unnest(array['select public.titan_purchase_shop_item(''cos_frame_neon'')',
    'select * from public.titan_submit_training_session(''running'',''cardio'',5,''km'',''{}'',now())',
    'select public.add_rewards(gen_random_uuid(),1,1)','select count(*) from public.shop_history']) loop
    denied:=false; begin execute attack; exception when insufficient_privilege then denied:=true; end;
    assert denied,'anon refused: '||attack;
  end loop;
end $$;

reset role;
do $$ begin
  assert not exists((select id,row from qa_atk_before where id<>current_setting('titan.atk_a')::uuid)
    except (select id,to_jsonb(p)-'updated_at' from public.profiles p)),'other players and the suspended account are unchanged';
end $$;
rollback;
