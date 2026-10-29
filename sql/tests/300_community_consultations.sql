-- V11-57 (COM-F3, COM-F4): polls and roadmap. One vote per account and poll (changeable until the close), results only after the close,
-- only eligible accounts vote, only an administrator creates or changes anything, at most 5 open roadmap votes, no reward of any kind,
-- own votes exported and erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(adm,'{}');
  update public.profiles set created_at = now() - interval '3 days' where id in (a, b, adm);   -- c stays a brand-new account
  update public.profiles set role = 'admin' where id = adm;
  perform set_config('titan.cc_a',a::text,true); perform set_config('titan.cc_b',b::text,true); perform set_config('titan.cc_c',c::text,true); perform set_config('titan.cc_adm',adm::text,true);
  assert not has_table_privilege('authenticated','private.titan_polls','select') and not has_table_privilege('authenticated','private.titan_poll_votes','select')
     and not has_table_privilege('authenticated','private.titan_roadmap_items','select') and not has_table_privilege('authenticated','private.titan_roadmap_votes','select'), 'no API grant on the tables';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; pid uuid; rid uuid; xp0 integer;
  a uuid := current_setting('titan.cc_a')::uuid; b uuid := current_setting('titan.cc_b')::uuid; c uuid := current_setting('titan.cc_c')::uuid; adm uuid := current_setting('titan.cc_adm')::uuid;
  ids uuid[] := '{}'; i integer;
begin
  -- A player cannot create or change anything.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_poll_admin_save_v1('Quelle quête ?','x',array['A','B'],now()-interval '1 hour',now()+interval '3 days'); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'players cannot create a poll';
  ok:=false; begin perform public.titan_roadmap_admin_save_v1(null,'Une idée','x','wish'); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'players cannot change the roadmap';

  -- The administrator creates a poll: 2 to 6 options, a sensible window.
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_poll_admin_save_v1('Une seule option','x',array['A'],now()-interval '1 hour',now()+interval '3 days'); exception when others then ok:=sqlerrm='OPTIONS_2_TO_6'; end; assert ok,'at least two options';
  ok:=false; begin perform public.titan_poll_admin_save_v1('Sept options','x',array['1','2','3','4','5','6','7'],now()-interval '1 hour',now()+interval '3 days'); exception when others then ok:=sqlerrm='OPTIONS_2_TO_6'; end; assert ok,'at most six options';
  ok:=false; begin perform public.titan_poll_admin_save_v1('Trop long','x',array['A','B'],now(),now()+interval '90 days'); exception when others then ok:=true; end; assert ok,'a poll lasts at most 60 days';
  pid := public.titan_poll_admin_save_v1('Quelle quête commune la semaine prochaine ?','Une seule voix par compte.',array['Endurance',' Force ','Multisport'],now()-interval '1 hour',now()+interval '3 days');

  -- Voting: eligible accounts only, one vote, changeable while open, no result before the close.
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_poll_vote_v1(pid,1::smallint); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'a brand-new account does not vote';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select xp into xp0 from public.profiles where id = a;
  ok:=false; begin perform public.titan_poll_vote_v1(pid,9::smallint); exception when others then ok:=sqlerrm='OPTION_UNKNOWN'; end; assert ok,'unknown option';
  ok:=false; begin perform public.titan_poll_vote_v1(gen_random_uuid(),1::smallint); exception when others then ok:=sqlerrm='POLL_NOT_FOUND'; end; assert ok,'unknown poll';
  perform public.titan_poll_vote_v1(pid,1::smallint);
  perform public.titan_poll_vote_v1(pid,2::smallint);   -- changes the vote: still one
  r := public.titan_polls_v1();
  assert jsonb_array_length(r)=1 and r->0->>'state'='open' and (r->0->>'myVote')::int=2, 'one open poll, my vote is the second option: '||r::text;
  assert not (r->0->'options'->0 ? 'votes'), 'no count while the poll is open';
  assert r->0->'options'->1->>'label'='Force','labels are trimmed';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  perform public.titan_poll_vote_v1(pid,2::smallint);
  assert (public.titan_polls_v1()->0->>'myVote')::int=2, 'b has its own vote';

  -- The close shows the counts and stops votes.
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  perform public.titan_poll_admin_close_v1(pid);
  ok:=false; begin perform public.titan_poll_admin_close_v1(pid); exception when others then ok:=sqlerrm='POLL_NOT_OPEN_OR_UNKNOWN'; end; assert ok,'closing twice is refused';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_poll_vote_v1(pid,1::smallint); exception when others then ok:=sqlerrm='POLL_CLOSED'; end; assert ok,'no vote after the close';
  r := public.titan_polls_v1();
  assert r->0->>'state'='closed' and (r->0->'options'->1->>'votes')::int=2 and (r->0->'options'->0->>'votes')::int=0, 'counts after the close: '||r::text;
  assert (select xp from public.profiles where id = a) is not distinct from xp0, 'a vote gives no XP';

  -- A poll that has not opened yet is invisible and refuses votes.
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  pid := public.titan_poll_admin_save_v1('Plus tard','x',array['A','B'],now()+interval '1 day',now()+interval '4 days');
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_polls_v1())=1, 'the future poll is not listed';
  ok:=false; begin perform public.titan_poll_vote_v1(pid,1::smallint); exception when others then ok:=sqlerrm='POLL_NOT_OPEN'; end; assert ok,'not open yet';

  -- Roadmap: honest statuses with history, preference votes capped at five open ones, a shipped idea no longer takes votes.
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_roadmap_admin_save_v1(null,'Une idée','x','promised'); exception when others then ok:=sqlerrm='STATUS_UNKNOWN'; end; assert ok,'closed list of statuses';
  for i in 1..7 loop ids := ids || public.titan_roadmap_admin_save_v1(null,'Idée numéro '||i,'détail','wish',i); end loop;
  rid := ids[1];
  perform public.titan_roadmap_admin_save_v1(rid,'Idée numéro 1','détail','study',1);
  perform public.titan_roadmap_admin_save_v1(rid,'Idée numéro 1','détail revu','planned',1);
  r := public.titan_roadmap_v1();
  assert jsonb_array_length(r)=7 and jsonb_array_length(r->0->'history')=3 and r->0->>'status'='planned', 'status history is kept: '||(r->0)::text;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  for i in 1..5 loop perform public.titan_roadmap_vote_v1(ids[i], true); end loop;
  ok:=false; begin perform public.titan_roadmap_vote_v1(ids[6], true); exception when others then ok:=sqlerrm='VOTE_LIMIT_5'; end; assert ok,'five open votes at most';
  perform public.titan_roadmap_vote_v1(ids[1], true);    -- voting twice for the same idea changes nothing
  assert (public.titan_roadmap_vote_v1(ids[1], true)->>'votes')::int=1, 'one vote per account and idea';
  perform public.titan_roadmap_vote_v1(ids[5], false);   -- taking a vote back frees a slot
  perform public.titan_roadmap_vote_v1(ids[6], true);
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  perform public.titan_roadmap_admin_save_v1(ids[2],'Idée numéro 2','détail','shipped',2);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert (select (e->>'mine')::boolean from jsonb_array_elements(public.titan_roadmap_v1()) e where (e->>'id')::uuid = ids[2]), 'a shipped idea keeps the vote that was given';
  perform public.titan_roadmap_vote_v1(ids[7], true);   -- the shipped idea no longer counts in the five: the slot is free again
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_roadmap_vote_v1(ids[2], true); exception when others then ok:=sqlerrm='ITEM_SHIPPED'; end; assert ok,'a shipped idea takes no new vote';
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_roadmap_vote_v1(ids[3], true); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'a brand-new account does not vote on the roadmap either';

  -- Export, then anonymous refusal.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert jsonb_array_length(public.export_own_data()->'pollVotes')=1 and jsonb_array_length(public.export_own_data()->'roadmapVotes')=6, 'own votes are exported: '||(public.export_own_data()->'roadmapVotes')::text;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_polls_v1(); exception when others then ok:=true; end; assert ok,'anonymous cannot read the polls';
  ok:=false; begin perform public.titan_roadmap_vote_v1(ids[1], true); exception when others then ok:=true; end; assert ok,'anonymous cannot vote';
end $$;
reset role;
-- Erased with the account.
do $$
declare a uuid := current_setting('titan.cc_a')::uuid;
begin
  assert (select count(*) from private.titan_poll_votes where user_id = a)=1 and (select count(*) from private.titan_roadmap_votes where user_id = a)=6, 'the votes exist';
  delete from auth.users where id = a;
  assert (select count(*) from private.titan_poll_votes where user_id = a)=0 and (select count(*) from private.titan_roadmap_votes where user_id = a)=0, 'the votes leave with the account';
end $$;
rollback;
