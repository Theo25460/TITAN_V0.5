-- CHEAT17 / SEC05: public card saves and look changes are limited per account, other accounts are not affected,
-- the service role and cascades are never throttled, and shop_history refuses negative amounts. Full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  assert exists(select 1 from pg_trigger where tgname='titan_rate_limit_public_cards'),'public card trigger installed';
  assert exists(select 1 from pg_trigger where tgname='titan_rate_limit_profile_appearance'),'appearance trigger installed';
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  perform set_config('titan.al_a',a::text,true); perform set_config('titan.al_b',b::text,true);
end $$;

set local role authenticated;
do $$
declare ok boolean; i integer;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.al_a'),'role','authenticated')::text,true);
  -- Public card: sixty saves are fine, the sixty-first is refused and changes nothing.
  for i in 1..60 loop perform public.titan_public_card_save(i % 2 = 0,'{}'::jsonb,false); end loop;
  ok:=false; begin perform public.titan_public_card_save(true,'{}'::jsonb,false); exception when others then ok:=sqlerrm='RATE_LIMITED'; end;
  assert ok,'the sixty-first public card save in an hour is refused';

  -- Look: thirty equip/remove pairs are sixty real changes; the next one is refused. Repeating the same state costs nothing.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.al_b'),'role','authenticated')::text,true);
  for i in 1..30 loop
    perform public.titan_set_appearance('frame','cos_frame_standard');
    perform public.titan_set_appearance('frame',null);
  end loop;
  ok:=false; begin perform public.titan_set_appearance('frame','cos_frame_standard'); exception when others then ok:=sqlerrm='RATE_LIMITED'; end;
  assert ok,'the sixty-first look change in an hour is refused';
  -- Account b did not touch the card of a, and a is not throttled on the look.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.al_a'),'role','authenticated')::text,true);
  perform public.titan_set_appearance('frame','cos_frame_standard');
end $$;
reset role;

-- Not throttled: no authenticated session (service role, SQL editor), whatever the number of writes.
do $$
declare i integer;
begin
  perform set_config('request.jwt.claims','',true);
  for i in 1..80 loop update public.profiles set appearance = case when i % 2 = 0 then '{}'::jsonb else '{"frame":"frame-standard"}'::jsonb end where id=current_setting('titan.al_a')::uuid; end loop;
end $$;

-- shop_history refuses negative amounts, accepts zero and positive ones.
do $$
declare ok boolean:=false; a uuid:=current_setting('titan.al_a')::uuid;
begin
  insert into public.shop_history(user_id,item_id,cost_credits,reward_credits) values (a,'qa-ok',0,0),(a,'qa-ok2',450,10);
  begin insert into public.shop_history(user_id,item_id,cost_credits,reward_credits) values (a,'qa-bad',-1,0); exception when check_violation then ok:=true; end;
  assert ok,'a negative cost is refused';
  ok:=false; begin insert into public.shop_history(user_id,item_id,cost_credits,reward_credits) values (a,'qa-bad2',10,-5); exception when check_violation then ok:=true; end;
  assert ok,'a negative reward is refused';
end $$;
rollback;
