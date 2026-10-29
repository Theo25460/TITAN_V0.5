-- V11-61 (COM-B7): the daily rendezvous. Optional, private unless the player picks "friends", friends only (accepted, unblocked), the
-- owner sees a count of encouragements and not who, no reward, own intentions exported and erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(d,'{}');
  -- a and b are friends (the guard trigger wants the owner's session), c is a stranger, d is a friend of a that a will block.
  update public.profiles set privacy = coalesce(privacy, '{}'::jsonb) || '{"publicProfile": true}'::jsonb where id in (b, d);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into public.friendships(user_id_1,user_id_2,status) values (a,b,'accepted'),(a,d,'accepted');
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('titan.di_a',a::text,true); perform set_config('titan.di_b',b::text,true); perform set_config('titan.di_c',c::text,true); perform set_config('titan.di_d',d::text,true);
  assert not has_table_privilege('authenticated','private.titan_daily_intents','select') and not has_table_privilege('authenticated','private.titan_intent_cheers','select'), 'no API grant on the tables';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; xp0 integer; cr0 integer;
  a uuid := current_setting('titan.di_a')::uuid; b uuid := current_setting('titan.di_b')::uuid; c uuid := current_setting('titan.di_c')::uuid; d uuid := current_setting('titan.di_d')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  ok:=false; begin perform public.titan_intent_set_v1(current_date+5,'Courir 30 minutes'); exception when others then ok:=sqlerrm='DAY_OUT_OF_RANGE'; end; assert ok,'only today, yesterday or tomorrow';
  ok:=false; begin perform public.titan_intent_set_v1(current_date,'ab'); exception when others then ok:=sqlerrm='INTENT_TOO_SHORT'; end; assert ok,'a real sentence';
  ok:=false; begin perform public.titan_intent_done_v1(current_date,true); exception when others then ok:=sqlerrm='INTENT_NOT_FOUND'; end; assert ok,'nothing to tick without an intention';

  -- Private by default: nobody else sees it.
  r := public.titan_intent_set_v1(current_date,'  Courir <b>30</b> minutes  ');
  assert r->>'visibility'='private' and r->>'intent'='Courir b30/b minutes', 'private by default and cleaned: '||r::text;
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_intents_v1(current_date)->'friends')=0, 'a friend sees nothing of a private intention';
  ok:=false; begin perform public.titan_intent_cheer_v1(a,current_date,true); exception when others then ok:=sqlerrm='CHEER_NOT_ALLOWED'; end; assert ok,'no cheering a private intention';

  -- Shared with friends.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.titan_intent_set_v1(current_date,'Courir 30 minutes','friends');   -- changing it keeps one row for the day
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_intents_v1(current_date);
  assert jsonb_array_length(r->'friends')=1 and r->'friends'->0->>'intent'='Courir 30 minutes' and (r->'friends'->0->>'cheered')::boolean=false, 'a friend sees it: '||r::text;
  assert r->'mine' = 'null'::jsonb, 'b has no intention of its own';
  perform public.titan_intent_cheer_v1(a,current_date,true);
  perform public.titan_intent_cheer_v1(a,current_date,true);   -- twice: still one
  assert (public.titan_intents_v1(current_date)->'friends'->0->>'cheered')::boolean, 'b sees its own cheer';
  ok:=false; begin perform public.titan_intent_cheer_v1(b,current_date,true); exception when others then ok:=sqlerrm='CHEER_NOT_ALLOWED'; end; assert ok,'no cheering oneself';

  -- A stranger sees and cheers nothing.
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_intents_v1(current_date)->'friends')=0, 'a stranger sees nothing';
  ok:=false; begin perform public.titan_intent_cheer_v1(a,current_date,true); exception when others then ok:=sqlerrm='CHEER_NOT_ALLOWED'; end; assert ok,'a stranger cannot cheer';

  -- The owner sees a count, not who; ticking it off changes nothing else.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_intents_v1(current_date);
  assert (r->'mine'->>'cheers')::int=1 and not (r->'mine' ? 'cheerers'), 'a count of encouragements, never the names: '||r::text;
  assert (public.titan_intent_done_v1(current_date,true)->>'done')::boolean and (public.titan_intents_v1(current_date)->'mine'->>'done')::boolean, 'ticked';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert (public.titan_intents_v1(current_date)->'friends'->0->>'done')::boolean, 'the friend sees that it was kept';
  perform public.titan_intent_cheer_v1(a,current_date,false);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert (public.titan_intents_v1(current_date)->'mine'->>'cheers')::int=0, 'a cheer can be taken back';
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';
  assert public.export_own_data()->'dailyIntents'->0->>'intent'='Courir 30 minutes', 'exported';

  -- A block ends the visibility, both ways.
  perform public.titan_intent_set_v1(current_date,'Courir 30 minutes','friends');
  perform set_config('request.jwt.claims',json_build_object('sub',d,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_intents_v1(current_date)->'friends')=1, 'd sees it before the block';
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.titan_user_blocks(blocker_id, blocked_id) values (a, d);
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',d,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_intents_v1(current_date)->'friends')=0, 'blocked: nothing visible';
  ok:=false; begin perform public.titan_intent_cheer_v1(a,current_date,true); exception when others then ok:=sqlerrm='CHEER_NOT_ALLOWED'; end; assert ok,'blocked: no cheer';

  -- Clearing an intention removes it and its cheers.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert public.titan_intent_clear_v1(current_date) is true and public.titan_intent_clear_v1(current_date) is false, 'cleared once';
  assert public.titan_intents_v1(current_date)->'mine' = 'null'::jsonb, 'gone';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_intents_v1(current_date); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.di_b')::uuid;
begin
  insert into private.titan_daily_intents(user_id, day, intent, visibility) values (b, current_date, 'Nager un peu', 'friends');
  delete from auth.users where id = b;
  assert not exists (select 1 from private.titan_daily_intents where user_id = b), 'erased with the account';
end $$;
rollback;
