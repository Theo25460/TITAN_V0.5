-- SHOP03 / SHOP11 / SHOP17: the shop sells cosmetics only, for in-game credits only, and never an advantage; items are rows.
-- Synthetic identity, real purchase RPC with the API role, full rollback.
begin;
do $$
declare p uuid:=gen_random_uuid(); types text[];
begin
  insert into auth.users(id,raw_user_meta_data) values(p,'{}');
  set local session_replication_role = replica;
  update public.profiles set credits=5000000, xp=0, level=50, is_elite=true where id=p;
  set local session_replication_role = origin;
  perform set_config('titan.sp_p',p::text,true);
  select array_agg(distinct type order by type) into types from public.shop_items where is_active;
  assert types = array['cosmetic'], 'only cosmetics are on sale: '||coalesce(array_to_string(types,','),'none');
  assert not exists(select 1 from public.shop_items where is_active and (price < 0 or coalesce(price_credits,0) < 0)), 'no negative price (a payout)';
  assert not exists(select 1 from information_schema.columns where table_schema='public' and table_name='shop_items' and column_name ~* '(eur|euro|usd|currency|stripe|paddle)'), 'prices exist in in-game credits only: no real-money column';
end $$;

create temporary table qa_sp_before as select credits, xp, level from public.profiles where id=current_setting('titan.sp_p')::uuid;
grant select on qa_sp_before to authenticated;
set local role authenticated;
do $$
declare p uuid:=current_setting('titan.sp_p')::uuid; i record; bought int:=0; refused int:=0; b record; a record;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
  -- every item, active or not, is attempted: inactive or non-cosmetic items must not be obtainable.
  for i in select id, is_active, type from public.shop_items order by id loop
    begin
      perform public.titan_purchase_shop_item(i.id);
      assert i.is_active and i.type = 'cosmetic', 'a non-cosmetic or inactive item was sold: '||i.id;
      bought := bought + 1;
    exception when others then
      if sqlerrm like 'a non-cosmetic or inactive item was sold%' then raise; end if;
      refused := refused + 1;
    end;
  end loop;
  assert bought >= 1 and refused >= 1, 'the attempt exercised both paths: bought '||bought||', refused '||refused;
  select * into b from qa_sp_before; select credits, xp, level into a from public.profiles where id=p;
  assert a.credits <= b.credits and a.xp = b.xp and a.level = b.level, 'purchases only ever spend credits: never credits, XP or level gained';
  assert not exists(select 1 from public.shop_history h where h.user_id=p and h.reward_credits > 0), 'no purchase pays anything back';
end $$;
-- SHOP17: a new item is a row, not code: it shows up in the Atelier and can be bought without any function change.
reset role;
do $$
declare p uuid:=current_setting('titan.sp_p')::uuid; r jsonb; ok boolean;
begin
  insert into public.shop_items(id,name,description,price,type,is_active,required_level,cosmetic_id,slug,metadata)
  values ('cos_qa_new_row','Nouvel objet','Ajouté par une simple ligne',300,'cosmetic',true,1,'qa_new_row','qa-new-row','{"slot":"frame","unlock":"credits"}'::jsonb);
  perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
  set local role authenticated;
  r := public.titan_atelier();
  assert r::text like '%cos_qa_new_row%', 'the new row is listed by the Atelier';
  perform public.titan_purchase_shop_item('cos_qa_new_row');
  assert exists(select 1 from public.shop_history where user_id=p and item_id='cos_qa_new_row'), 'and can be bought';
  reset role;
end $$;
-- SHOP20: the economy is reachable without Premium or ads: a free player earns credits from an ordinary session, their weekly
-- allowance covers the dearest free cosmetic, and most of the catalogue is open to them.
reset role;
do $$
declare f uuid:=gen_random_uuid(); limits jsonb; dearest int; open_items int; total_items int; r record; c0 int;
begin
  insert into auth.users(id,raw_user_meta_data) values(f,'{}');
  set local session_replication_role = replica;
  update public.profiles set credits=0, xp=0, level=1, is_elite=false where id=f;
  set local session_replication_role = origin;
  assert not exists(select 1 from public.premium_access where user_id=f), 'a free player';
  perform set_config('request.jwt.claims',json_build_object('sub',f,'role','authenticated')::text,true);
  set local role authenticated;
  select * into r from public.titan_submit_training_session('running','cardio',5,'km',jsonb_build_object('duration',30,'client_event_id',gen_random_uuid()),now()-interval '1 hour');
  assert r.credits > 0 and r.xp > 0, 'an ordinary session pays a free player';
  limits := to_jsonb(public.titan_economy_limits(f));
  reset role;
  select max(price), count(*) filter (where not required_premium and not requires_elite), count(*)
    into dearest, open_items, total_items
    from public.shop_items where is_active and type='cosmetic' and not required_premium and not requires_elite;
  select count(*) into total_items from public.shop_items where is_active and type='cosmetic';
  assert coalesce((limits->>'weeklyCreditCap')::int, (limits->'titan_economy_limits'->>'weeklyCreditCap')::int, 0) >= dearest, 'the free weekly allowance covers the dearest free cosmetic: '||limits::text;
  assert open_items * 2 > total_items, 'most of the catalogue is open to a free player: '||open_items||' of '||total_items;
end $$;
rollback;
