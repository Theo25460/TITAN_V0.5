-- V11-23 (IDEA02): the showcase shows only titles the account has earned, at most three, privately chosen, public only through an opt-in card
-- that shows titles. Synthetic identities, real RPCs with API roles, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  insert into public.adventure_rewards(user_id,world_id,chapter,source_ids) values (a,'aube',1,array[gen_random_uuid()]),(a,'aube',2,array[gen_random_uuid()]),(a,'forge',1,array[gen_random_uuid()]),(a,'marees',1,array[gen_random_uuid()]);
  perform set_config('titan.sc_a',a::text,true); perform set_config('titan.sc_b',b::text,true);
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; slug text; i int; a uuid := current_setting('titan.sc_a')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_showcase_v1())=0,'empty at first';
  ok:=false; begin perform public.titan_set_showcase_v1(array['Champion']); exception when others then ok:=sqlerrm='INVALID_TITLE'; end; assert ok,'free text refused';
  ok:=false; begin perform public.titan_set_showcase_v1(array['chapter:aurores:1']); exception when others then ok:=sqlerrm='NOT_EARNED'; end; assert ok,'unearned refused';
  ok:=false; begin perform public.titan_set_showcase_v1(array['chapter:aube:1','chapter:aube:2','chapter:forge:1','chapter:marees:1']); exception when others then ok:=sqlerrm='SHOWCASE_TOO_LONG'; end; assert ok,'at most three';
  ok:=false; begin perform public.titan_set_showcase_v1(array['chapter:aube:1','chapter:aube:1']); exception when others then ok:=sqlerrm='SHOWCASE_DUPLICATE'; end; assert ok,'no duplicate';
  ok:=false; begin perform public.titan_set_showcase_v1(array['chapter:aube:1',null]); exception when others then ok:=true; end; assert ok,'null entry refused';
  r:=public.titan_set_showcase_v1(array['chapter:forge:1','chapter:aube:1','chapter:marees:1']);
  assert jsonb_array_length(r)=3 and r->0->>'key'='chapter:forge:1' and r->2->>'key'='chapter:marees:1','chosen order kept: '||r::text;
  assert not (public.titan_set_appearance('frame',null) ? 'showcase'),'not part of the look';
  -- Card off, then on without titles, then on with titles.
  r:=public.titan_public_card_save(true,'{"titles":false}'::jsonb,false); slug:=r->>'slug';
  assert jsonb_array_length(public.titan_public_card_showcase(slug))=0,'hidden titles: nothing';
  perform public.titan_public_card_save(true,'{"titles":true}'::jsonb,false);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  assert jsonb_array_length(public.titan_public_card_showcase(slug))=3,'visible when the card shows titles';
  assert jsonb_array_length(public.titan_public_card_showcase('0000000000'))=0 and jsonb_array_length(public.titan_public_card_showcase(null))=0,'unknown slug: empty';
  ok:=false; begin perform public.titan_set_showcase_v1(array['chapter:aube:1']); exception when others then ok:=true; end; assert ok,'anonymous cannot write';
  ok:=false; begin perform public.titan_showcase_v1(); exception when others then ok:=true; end; assert ok,'anonymous cannot read the private list';
  -- Other account.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.sc_b'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_set_showcase_v1(array['chapter:aube:1']); exception when others then ok:=sqlerrm='NOT_EARNED'; end; assert ok,'b cannot show the insignia of a';
  assert jsonb_array_length(public.titan_showcase_v1())=0,'b sees nothing of a';
  -- Clearing.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_set_showcase_v1(array[]::text[]))=0,'cleared';
  perform public.titan_set_showcase_v1(array['chapter:aube:1']);
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.sc_a')::uuid;
begin
  delete from public.adventure_rewards where user_id=a and world_id='aube' and chapter=1;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  assert jsonb_array_length(public.titan_showcase_v1())=0,'an item no longer earned disappears';
  reset role;
end $$;
-- Own counter: thirty changes an hour, then RATE_LIMITED; and the look counter is untouched.
set local role authenticated;
do $$
declare i int; ok boolean:=false;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.sc_b'),'role','authenticated')::text,true);
  for i in 1..30 loop perform public.titan_set_showcase_v1(array[]::text[]); end loop;
  begin perform public.titan_set_showcase_v1(array[]::text[]); exception when others then ok:=sqlerrm='RATE_LIMITED'; end;
  assert ok,'the thirty-first change in an hour is refused';
end $$;
reset role;
rollback;
