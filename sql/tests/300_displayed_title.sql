-- SHOP06: wearing a title. Only an earned title can be worn (adventure insignia or expedition title), the choice is private
-- to the account, cosmetic, rate limited, and shown on the public card only when the card is on and shows titles.
-- Synthetic identities, real RPCs with API roles, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  assert to_regprocedure('public.titan_set_displayed_title(text)') is not null,'set RPC exists';
  assert to_regprocedure('public.titan_displayed_title()') is not null,'read RPC exists';
  assert to_regprocedure('public.titan_public_card_title(text)') is not null,'public RPC exists';
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  -- a: one insignia (Aube, chapter 1) and an ended expedition fully done. b: nothing.
  insert into public.adventure_rewards(user_id,world_id,chapter,source_ids) values (a,'aube',1,array[gen_random_uuid()]);
  insert into public.titan_expeditions(id,title,story,guardian,starts_at,ends_at,collective_goal,personal_days,personal_minutes,reward_title)
  values ('qa-titre','QA titre','Une expédition terminée pour tester les titres.','Le Testeur',now()-interval '3 days',now()-interval '1 hour',600,1,30,'Testeur');
  insert into public.titan_expedition_members(expedition_id,user_id,joined_at) values ('qa-titre',a,now()-interval '3 days');
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,client_event_id,created_at)
  values (a,'running','cardio',10,'km',0,now()-interval '2 days','{"effort":{"effort_minutes":60},"historical":false}',gen_random_uuid(),now()-interval '2 days');
  perform set_config('titan.ti_a',a::text,true); perform set_config('titan.ti_b',b::text,true);
end $$;

set local role authenticated;
do $$
declare ok boolean; r jsonb; slug text; i integer;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ti_a'),'role','authenticated')::text,true);
  assert (public.titan_displayed_title()->>'key') is null,'no title worn at first';

  -- Format and ownership.
  ok:=false; begin perform public.titan_set_displayed_title('Champion'); exception when others then ok:=sqlerrm='INVALID_TITLE'; end; assert ok,'free text is refused';
  ok:=false; begin perform public.titan_set_displayed_title('chapter:aube:10'); exception when others then ok:=sqlerrm='INVALID_TITLE'; end; assert ok,'chapter 10 does not exist';
  ok:=false; begin perform public.titan_set_displayed_title('chapter:aube:2'); exception when others then ok:=sqlerrm='NOT_EARNED'; end; assert ok,'an insignia not earned cannot be worn';
  ok:=false; begin perform public.titan_set_displayed_title('chapter:forge:1'); exception when others then ok:=sqlerrm='NOT_EARNED'; end; assert ok,'another world is not earned either';
  ok:=false; begin perform public.titan_set_displayed_title('exp:automne-2026'); exception when others then ok:=sqlerrm='NOT_EARNED'; end; assert ok,'the running expedition has not been earned yet';

  -- Earned titles can be worn.
  r:=public.titan_set_displayed_title('chapter:aube:1'); assert r->>'key'='chapter:aube:1' and r->'label'='null'::jsonb,'insignia worn, named by the catalogue';
  assert public.titan_displayed_title()->>'key'='chapter:aube:1','read back';
  r:=public.titan_set_displayed_title('exp:qa-titre'); assert r->>'key'='exp:qa-titre' and r->>'label'='Testeur','expedition title worn with its server wording';

  -- Cosmetic only: the Atelier look never reads it.
  assert not (public.titan_set_appearance('frame',null) ? 'title'),'the title is not part of the look';

  -- Public card: nothing until the card is on and shows titles.
  r:=public.titan_public_card_save(true,'{"titles":false}'::jsonb,false); slug:=r->>'slug';
  assert public.titan_public_card_title(slug) is null,'hidden titles are not exposed';
  perform public.titan_public_card_save(true,'{"titles":true}'::jsonb,false);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  r:=public.titan_public_card_title(slug); assert r->>'key'='exp:qa-titre' and r->>'label'='Testeur','visible when the card shows titles';
  assert public.titan_public_card_title('0000000000') is null and public.titan_public_card_title(null) is null,'unknown slug answers null';
  ok:=false; begin perform public.titan_set_displayed_title('chapter:aube:1'); exception when others then ok:=true; end; assert ok,'anonymous cannot write';
  ok:=false; begin perform public.titan_displayed_title(); exception when others then ok:=true; end; assert ok,'anonymous cannot read the private value';

  -- Another account sees nothing of a and cannot wear it.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ti_b'),'role','authenticated')::text,true);
  assert (public.titan_displayed_title()->>'key') is null,'b has no title';
  ok:=false; begin perform public.titan_set_displayed_title('chapter:aube:1'); exception when others then ok:=sqlerrm='NOT_EARNED'; end; assert ok,'b cannot wear the insignia of a';
  ok:=false; begin perform public.titan_set_displayed_title('exp:qa-titre'); exception when others then ok:=sqlerrm='NOT_EARNED'; end; assert ok,'nor the expedition title of a';

  -- Clearing, and a title that stops being earned reads as none.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ti_a'),'role','authenticated')::text,true);
  r:=public.titan_set_displayed_title(null); assert r->>'key' is null,'cleared';
  perform public.titan_set_displayed_title('chapter:aube:1');
end $$;
reset role;
do $$
begin
  delete from public.adventure_rewards where user_id=current_setting('titan.ti_a')::uuid;
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ti_a'),'role','authenticated')::text,true);
  set local role authenticated;
  assert (public.titan_displayed_title()->>'key') is null,'a title no longer earned reads as none';
  reset role;
end $$;

-- Rate limit: 30 changes an hour, then RATE_LIMITED, and nothing changes.
set local role authenticated;
do $$
declare i integer; ok boolean:=false;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ti_b'),'role','authenticated')::text,true);
  for i in 1..30 loop perform public.titan_set_displayed_title(null); end loop;
  begin perform public.titan_set_displayed_title(null); exception when others then ok:=sqlerrm='RATE_LIMITED'; end;
  assert ok,'the thirty-first change in an hour is refused';
end $$;
reset role;
rollback;
