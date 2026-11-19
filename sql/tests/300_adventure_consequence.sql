-- V1.5.2 — Camp et conséquences. Synthetic and rolled back. Every API call runs as authenticated/anon.
-- A (la corniche, passage_rouvert) and B (les ruines, serment_restitue) resolved the Veilleur (V1.5.1 is proven by
-- 300_adventure_guardian). Each finds a distinct access: A aligns two landmarks of the sketch (shortcut), B brings the
-- fragment to one engraving (annex room). Wrong answers are corrected, the discovery is stable, visits are counted.
-- C has a long history but never entered the pilot, D entered the pilot without resolving the Veilleur, E is a legacy pilot
-- account (mini-boss earned before V1.5.1): none of them gets a consequence. XP, credits, rewards, effort and the LIVE world
-- never change. Also covered: a reinstall/second device reads the same state, export, metrics, closed API surface.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
begin
 perform set_config('titan.cq_a',a::text,true); perform set_config('titan.cq_b',b::text,true); perform set_config('titan.cq_c',c::text,true);
 perform set_config('titan.cq_d',d::text,true); perform set_config('titan.cq_e',e::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}'),(d,'{}'),(e,'{}');
 set local session_replication_role=replica;
 insert into public.profiles(id,username,level,xp,credits,is_suspended)
 select u,'qa_cq_'||left(u::text,8),4,900,40,false from unnest(array[a,b,c,d,e]) u
 on conflict(id) do update set is_suspended=false,xp=900,credits=40;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 select u,'aube',9,'rhythm','UTC',now()-interval '60 days' from unnest(array[a,b,c,d,e]) u;
 insert into private.adventure_journeys(user_id,world_id,started_at,timezone,target,baseline_rpe,profile)
 select u,'aube',now()-interval '50 days','UTC',15,5,'{}'::jsonb from unnest(array[a,b,c,d,e]) u on conflict do nothing;
 -- A, B, D and E entered the pilot; A, B and E took ordinals 1..6, D stopped at 5. C took 1..6 without the pilot (legacy v1 path).
 insert into private.adventure_branch_entries(user_id,world_id,pilot,version,entered_at)
 select u,'aube','aube-arc1',1,now()-interval '40 days' from unnest(array[a,b,d,e]) u;
 insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
 select x.u,'aube',o,case when o=2 then x.choice else null end,now()-interval '39 days'+o*interval '1 day'
 from (values(a,0,6),(b,1,6),(c,0,6),(d,0,5),(e,0,6)) x(u,choice,last), generate_series(1,6) o where o<=x.last;
 insert into private.adventure_guardian_encounters(user_id,world_id,guardian,version,route,attempts,last_sign,prepared_at,outcome,resolved_at)
 values(a,'aube','veilleur',1,'corniche',1,'fissure',now()-interval '3 days','passage_rouvert',now()-interval '2 days'),
       (b,'aube','veilleur',1,'ruines',2,'gravure',now()-interval '3 days','serment_restitue',now()-interval '2 days'),
       (d,'aube','veilleur',1,'corniche',1,'fissure',now()-interval '3 days',null,null);
 -- C has a LIVE world (camp built, finds collected): it must stay untouched by everything below.
 insert into private.titan_live_wallets(user_id,eclats,souffle) values(a,120,30),(c,400,90);
 insert into private.titan_live_buildings(user_id,building,level) values(a,'phare',2),(c,'observatoire',3);
 set local session_replication_role=origin;
end $$;
create temp table cq_before on commit drop as
 select p.id,p.xp,p.credits,
  (select count(*) from private.adventure_encounter_rewards r where r.user_id=p.id) rewards,
  (select coalesce(sum(l.effort),0) from private.adventure_effort_ledger l where l.user_id=p.id) effort,
  (select to_jsonb(w)-'updated_at' from private.titan_live_wallets w where w.user_id=p.id) wallet,
  (select coalesce(jsonb_agg(to_jsonb(x)-'updated_at' order by x.building),'[]') from private.titan_live_buildings x where x.user_id=p.id) buildings,
  (select coalesce(jsonb_agg(to_jsonb(g) order by g.guardian),'[]') from private.adventure_guardian_encounters g where g.user_id=p.id) guardian
 from public.profiles p where p.id in (select unnest(array[current_setting('titan.cq_a'),current_setting('titan.cq_b'),current_setting('titan.cq_c'),
  current_setting('titan.cq_d'),current_setting('titan.cq_e')])::uuid);

-- The new objects are closed to the API roles; the contract has one consequence per guardian outcome.
do $$begin
 assert not has_table_privilege('authenticated','private.adventure_consequences','select'),'consequences have no API grant';
 assert not has_table_privilege('authenticated','private.adventure_consequence_events','select'),'events have no API grant';
 assert not has_function_privilege('anon','public.titan_adventure_consequences_v1()','execute'),'anon snapshot';
 assert not has_function_privilege('anon','public.titan_adventure_consequence_action_v1(text,text,text[])','execute'),'anon action';
 assert not has_function_privilege('authenticated','private.titan_adventure_consequence_state(uuid,text)','execute'),'state is private';
 assert not has_function_privilege('authenticated','private.titan_adventure_consequence_metrics_v1(integer)','execute'),'metrics are private';
 assert (private.titan_adventure_consequence_current('aube')->>'id')='veilleur-retour' and private.titan_adventure_consequence_current('marees') is null,'one consequence';
 assert (select array_agg(x->>'outcome' order by x->>'outcome') from jsonb_array_elements(private.titan_adventure_consequence_current('aube')->'outcomes') x)
  = (select array_agg(x->>'outcome' order by x->>'outcome') from jsonb_array_elements(private.titan_adventure_guardian_current('aube')->'routes') x),
  'one access per canonical guardian outcome';
end $$;
set local role anon;
do $$begin
 begin perform public.titan_adventure_consequences_v1(); raise exception 'anon snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_consequence_action_v1('aube','visit'); raise exception 'anon visit'; exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
-- C (no pilot), D (pilot, guardian not resolved) and E (legacy): nothing linked, nothing to discover.
do $$declare s jsonb; u text;begin
 foreach u in array array[current_setting('titan.cq_c'),current_setting('titan.cq_d'),current_setting('titan.cq_e')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_consequences_v1();
  assert (s->>'contract')::integer=1 and s->>'owner'=u and s->'items'='[]'::jsonb,'no consequence: '||s::text;
  begin perform public.titan_adventure_consequence_action_v1('aube','discover',array['cairn','pin']); raise exception 'discovered without outcome';
  exception when raise_exception then assert sqlerrm='CONSEQUENCE_UNAVAILABLE',sqlerrm; end;
  begin perform public.titan_adventure_consequence_action_v1('aube','visit'); raise exception 'visited without outcome';
  exception when raise_exception then assert sqlerrm='CONSEQUENCE_UNAVAILABLE',sqlerrm; end;
 end loop;
end $$;

-- A and B: the access is there from the canonical outcome, before any action; each has its own interaction.
do $$declare s jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cq_b'),'role','authenticated')::text,true);
 s:=public.titan_adventure_consequences_v1();
 assert s->'items'->0->>'state'='discover' and s->'items'->0->>'outcome'='serment_restitue',s::text;
end $$;
reset role;
do $$begin assert not exists(select 1 from private.adventure_consequences),'reading writes nothing'; end $$;
set local role authenticated;
do $$declare s jsonb; i jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cq_a'),'role','authenticated')::text,true);
 s:=public.titan_adventure_consequences_v1(); i:=s->'items'->0;
 assert jsonb_array_length(s->'items')=1 and i->>'state'='discover' and i->>'outcome'='passage_rouvert' and i->>'kind'='shortcut'
  and i->>'world'='aube' and i->>'returnPoint'='camp' and (i->>'attempts')::integer=0 and i->>'resolvedAt' is not null,i::text;
 begin perform public.titan_adventure_consequence_action_v1('aube','visit'); raise exception 'visited before discovering';
 exception when raise_exception then assert sqlerrm='CONSEQUENCE_NOT_DISCOVERED',sqlerrm; end;
 -- The shortcut needs two landmarks: one alone, a duplicate or an engraving of the ruins are refused, not counted.
 begin perform public.titan_adventure_consequence_action_v1('aube','discover',array['cairn']); raise exception 'one landmark';
 exception when raise_exception then assert sqlerrm='INVALID_MARKS',sqlerrm; end;
 begin perform public.titan_adventure_consequence_action_v1('aube','discover',array['cairn','cairn']); raise exception 'duplicate landmark';
 exception when raise_exception then assert sqlerrm='INVALID_MARKS',sqlerrm; end;
 begin perform public.titan_adventure_consequence_action_v1('aube','discover',array['cerf','pin']); raise exception 'ruins engraving';
 exception when raise_exception then assert sqlerrm='INVALID_MARKS',sqlerrm; end;
 begin perform public.titan_adventure_consequence_action_v1('aube','discover',null); raise exception 'no answer';
 exception when raise_exception then assert sqlerrm='INVALID_MARKS',sqlerrm; end;
 i:=public.titan_adventure_consequence_action_v1('aube','discover',array['tour','cairn'])->'items'->0;
 assert i->>'state'='discover' and (i->>'attempts')::integer=1 and i->'lastAnswer'='["cairn","tour"]'::jsonb and not (i->>'lastCorrect')::boolean,i::text;
 -- Order does not matter: pin then cairn aligns the sketch.
 i:=public.titan_adventure_consequence_action_v1('aube','discover',array['pin','cairn'])->'items'->0;
 assert i->>'state'='open' and (i->>'attempts')::integer=2 and (i->>'lastCorrect')::boolean and i->>'discoveredAt' is not null
  and (i->>'visits')::integer=0,i::text;

 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cq_b'),'role','authenticated')::text,true);
 i:=public.titan_adventure_consequences_v1()->'items'->0;
 assert i->>'state'='discover' and i->>'outcome'='serment_restitue' and i->>'kind'='annex',i::text;
 -- The annex room needs one engraving; two are refused.
 begin perform public.titan_adventure_consequence_action_v1('aube','discover',array['cerf','soleil']); raise exception 'two engravings';
 exception when raise_exception then assert sqlerrm='INVALID_MARKS',sqlerrm; end;
 begin perform public.titan_adventure_consequence_action_v1('aube','discover',array['pin']); raise exception 'corniche landmark';
 exception when raise_exception then assert sqlerrm='INVALID_MARKS',sqlerrm; end;
 i:=public.titan_adventure_consequence_action_v1('aube','discover',array['spirale'])->'items'->0;
 assert i->>'state'='discover' and (i->>'attempts')::integer=1 and not (i->>'lastCorrect')::boolean,i::text;
 i:=public.titan_adventure_consequence_action_v1('aube','discover',array['soleil'])->'items'->0;
 assert i->>'state'='discover' and (i->>'attempts')::integer=2,i::text;
 i:=public.titan_adventure_consequence_action_v1('aube','discover',array['cerf'])->'items'->0;
 assert i->>'state'='open' and (i->>'attempts')::integer=3 and i->'lastAnswer'='["cerf"]'::jsonb,i::text;
end $$;

-- Stable after discovery; visits are counted; a second device (or a reinstall) reads the same server state.
do $$declare i jsonb; again jsonb; u text;begin
 foreach u in array array[current_setting('titan.cq_a'),current_setting('titan.cq_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  i:=public.titan_adventure_consequences_v1()->'items'->0;
  again:=public.titan_adventure_consequence_action_v1('aube','discover',case when i->>'kind'='shortcut' then array['tour','cascade'] else array['vague'] end)->'items'->0;
  assert again->>'discoveredAt'=i->>'discoveredAt' and again->>'attempts'=i->>'attempts' and again->>'state'='open'
   and again->'lastAnswer'=i->'lastAnswer','a later answer neither undoes nor counts: '||again::text;
  again:=public.titan_adventure_consequence_action_v1('aube','visit')->'items'->0;
  assert (again->>'visits')::integer=1 and again->>'lastVisitAt' is not null,again::text;
  again:=public.titan_adventure_consequence_action_v1('aube','visit')->'items'->0;
  assert (again->>'visits')::integer=2,again::text;
  -- "Second device": a fresh read with no client state returns exactly the canonical item.
  assert public.titan_adventure_consequences_v1()->'items'->0=again,'same state on every device';
 end loop;
 begin perform public.titan_adventure_consequence_action_v1('aube','attack'); raise exception 'unknown action';
 exception when raise_exception then assert sqlerrm='INVALID_ACTION',sqlerrm; end;
 begin perform public.titan_adventure_consequence_action_v1('marees','visit'); raise exception 'other world';
 exception when raise_exception then assert sqlerrm='CONSEQUENCE_UNAVAILABLE',sqlerrm; end;
 begin perform public.titan_adventure_consequence_action_v1('atlantide','visit'); raise exception 'unknown world';
 exception when raise_exception then assert sqlerrm='INVALID_WORLD',sqlerrm; end;
end $$;
reset role;

-- Nothing else changed: XP, credits, rewards, effort, LIVE world, guardian outcome. Rows, events, export and metrics.
do $$declare s jsonb; m record;begin
 assert (select bool_and(p.xp=b.xp and p.credits=b.credits
   and (select count(*) from private.adventure_encounter_rewards r where r.user_id=p.id)=b.rewards
   and (select coalesce(sum(l.effort),0) from private.adventure_effort_ledger l where l.user_id=p.id)=b.effort
   and (select to_jsonb(w)-'updated_at' from private.titan_live_wallets w where w.user_id=p.id) is not distinct from b.wallet
   and (select coalesce(jsonb_agg(to_jsonb(x)-'updated_at' order by x.building),'[]') from private.titan_live_buildings x where x.user_id=p.id)=b.buildings
   and (select coalesce(jsonb_agg(to_jsonb(g) order by g.guardian),'[]') from private.adventure_guardian_encounters g where g.user_id=p.id)=b.guardian)
  from cq_before b join public.profiles p on p.id=b.id),'the consequence never touches the economy, the LIVE world or the outcome';
 assert (select count(*) from private.adventure_consequences)=2 and (select count(distinct outcome) from private.adventure_consequences)=2,'two accounts, two accesses';
 assert (select count(*) from private.adventure_consequences where user_id not in (current_setting('titan.cq_a')::uuid,current_setting('titan.cq_b')::uuid))=0,'refused calls left no row';
 assert (select array_agg(kind order by id) from private.adventure_consequence_events where user_id=current_setting('titan.cq_a')::uuid)
  =array['attempt','attempt','discover','visit','visit'],'A: two attempts, one discovery, two visits';
 assert (select array_agg(kind order by id) from private.adventure_consequence_events where user_id=current_setting('titan.cq_b')::uuid)
  =array['attempt','attempt','attempt','discover','visit','visit'],'B: three attempts, one discovery, two visits';
 s:=private.titan_export_extras_v1(current_setting('titan.cq_a')::uuid);
 assert s ? 'adventureRpg' and s ? 'adventureBranches' and s ? 'adventureGuardians','export keeps earlier sections';
 assert jsonb_array_length(s->'adventureConsequences')=1 and s->'adventureConsequences'->0->>'outcome'='passage_rouvert'
  and not (s->'adventureConsequences'->0 ? 'user_id') and jsonb_array_length(s->'adventureConsequenceEvents')=5
  and not (s->'adventureConsequenceEvents'->0 ? 'user_id'),s::text;
 for m in select * from private.titan_adventure_consequence_metrics_v1(14) loop
  assert m.resolved_accounts>=1 and m.discovered_accounts>=1 and m.visiting_accounts>=1 and m.visits>=2,m::text;
 end loop;
 assert (select sum(attempts) from private.titan_adventure_consequence_metrics_v1(14) where outcome in ('passage_rouvert','serment_restitue'))>=5,'attempts measured';
 raise notice 'V1.5.2 consequences %',(select jsonb_agg(jsonb_build_object('outcome',outcome,'attempts',attempts,'discovered',discovered_at is not null,'visits',visits) order by outcome) from private.adventure_consequences);
end $$;

-- Deleting the journey (account deletion cascades through it) removes the consequence and its events.
delete from private.adventure_journeys where user_id=current_setting('titan.cq_a')::uuid and world_id='aube';
do $$begin
 assert not exists(select 1 from private.adventure_consequences where user_id=current_setting('titan.cq_a')::uuid),'row removed with the journey';
 assert not exists(select 1 from private.adventure_consequence_events where user_id=current_setting('titan.cq_a')::uuid),'events removed with the journey';
end $$;
rollback;
