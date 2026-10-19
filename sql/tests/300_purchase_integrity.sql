-- SHOP15 / SHOP16: a cosmetic can be bought once whatever the writer, balances never go negative, the
-- client cannot edit purchases, and the journal accounts for every credit that moved.
-- Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  perform set_config('titan.pur_a',a::text,true); perform set_config('titan.pur_b',b::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  update public.profiles set credits=3000,xp=0,level=1 where id in (a,b);
  perform set_config('titan.pur_start',(select credits::text from public.profiles where id=a),true);
  perform set_config('titan.pur_mark',(select coalesce(max(id),0)::text from private.titan_economy_journal),true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.pur_a'),'role','authenticated')::text,true);
do $$ declare r record; begin
  select * into r from public.titan_purchase_shop_item('cos_frame_neon');
  perform set_config('titan.pur_price',r.cost::text,true);
  select * into r from public.titan_submit_training_session('running','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '1 hour');
  begin perform public.titan_purchase_shop_item('cos_frame_neon'); assert false,'second purchase';
  exception when others then assert sqlerrm='PURCHASE_LIMIT_ONCE',sqlerrm; end;
end $$;

reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare a uuid:=current_setting('titan.pur_a')::uuid; b uuid:=current_setting('titan.pur_b')::uuid; v int; begin
  -- SHOP15: the database itself refuses a second purchase of the same cosmetic, even from a trusted writer.
  begin
    insert into public.shop_history(user_id,item_id,cost_credits,reward_credits,economy_meta)
      values (a,'cos_frame_neon',0,0,'{"type":"cosmetic","version":300}');
    assert false,'duplicate cosmetic purchase';
  exception when unique_violation then null; end;
  -- Another account may buy the same cosmetic; older repeatable purchases keep their freedom.
  insert into public.shop_history(user_id,item_id,cost_credits,reward_credits,economy_meta)
    values (b,'cos_frame_neon',0,0,'{"type":"cosmetic","version":300}');
  insert into public.shop_history(user_id,item_id,cost_credits,reward_credits,economy_meta)
    values (a,'legacy_boost',10,0,'{}'),(a,'legacy_boost',10,0,'{}');
  update public.profiles set credits=-1 where id=a;
  assert (select credits>=0 from public.profiles where id=a),'a negative balance is never stored';
  begin insert into public.shop_history(user_id,item_id,cost_credits,reward_credits) values (a,'x',-5,0);
    assert false,'negative cost'; exception when check_violation then null; end;

  -- SHOP16: purchase and session are both in the history and the journal; credits are fully accounted for.
  assert (select count(*)=1 from public.shop_history where user_id=a and item_id='cos_frame_neon' and cost_credits=current_setting('titan.pur_price')::int),
    'the purchase is recorded with its price';
  assert (select coalesce(sum((changes#>>'{credits,new}')::int-(changes#>>'{credits,old}')::int),0)
      from private.titan_economy_journal where id>current_setting('titan.pur_mark')::bigint and user_id=a and kind='economy' and changes ? 'credits')
    =(select credits from public.profiles where id=a)-current_setting('titan.pur_start')::int,
    'the journaled credit movements add up to the actual balance change';
  assert (select min((changes#>>'{credits,new}')::int-(changes#>>'{credits,old}')::int)
      from private.titan_economy_journal where id>current_setting('titan.pur_mark')::bigint and user_id=a and changes ? 'credits')=-current_setting('titan.pur_price')::int,
    'the purchase debit equals the item price';
end $$;

-- The client cannot edit purchases or inventory.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.pur_a'),'role','authenticated')::text,true);
do $$ declare attack text; v int; denied boolean; begin
  for attack in select unnest(array['insert into public.shop_history(user_id,item_id,cost_credits) values (auth.uid(),''cos_map_night'',0)',
    'update public.shop_history set cost_credits=0','delete from public.shop_history',
    'insert into public.inventory(user_id,item_id) values (auth.uid(),1)','delete from public.inventory']) loop
    denied:=false; begin execute attack; get diagnostics v=row_count; denied:=v=0; exception when others then denied:=true; end;
    assert denied,'refused: '||attack;
  end loop;
end $$;
rollback;
