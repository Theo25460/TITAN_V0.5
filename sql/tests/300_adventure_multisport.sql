-- RPG05/06/07 business matrix. Real training + Adventure RPCs, synthetic identities only.
-- Time compression: before each chapter, an ADMIN fixture moves its start four days back and
-- removes the preceding synthetic training sources. This avoids waiting months or triggering
-- real ingestion rate limits. Targets, claims, rewards and trust calculations remain native.
-- This is NOT a claim that 36 chapters can be farmed in one real day.
do $$ begin
  if current_database() not like 'titan_test_%' then raise exception 'REFUSED: multisport contracts require a disposable titan_test_ database'; end if;
end $$;
begin;
set local plpgsql.check_asserts=on;
create temporary table qa_multisport_outcomes(route text,practice text,world text,chapter integer,outcome jsonb);

do $$
declare sport record; e jsonb; n integer:=0;
begin
  for sport in select id,unit from public.sports loop
    e:=public.titan_effort_v300(sport.id,sport.unit,1,'{"duration":50,"bio":{"rpe":5}}');
    assert e->>'effort_minutes'='50.0' or (e->>'effort_minutes')::numeric=50,sport.id||':50min effort';
    assert (e->>'xp')::int=500 and not (e->>'estimated')::boolean,sport.id||':equal declared time/intensity';
    n:=n+1;
  end loop;
  assert n>=260,'nonempty complete catalog';
  raise notice 'Multisport effort: % catalog sports, same50min declared effort/500XP.',n;
end $$;

do $$
declare
  owner uuid; route text; practice text; world text; sport text; unit text; val numeric;
  s jsonb; c jsonb; q jsonb; result jsonb; submitted record; world_number integer; stamp timestamptz;
begin
  foreach route in array array['rhythm','journal'] loop
    foreach practice in array array['swimming','running','muscu_gym','mixed'] loop
      perform set_config('request.jwt.claims','{"role":"service_role"}',true);
      owner:=gen_random_uuid();
      insert into auth.users(id,raw_user_meta_data) values(owner,'{}');
      update public.profiles set xp=0,level=1,credits=0 where id=owner;
      perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      s:=public.titan_adventure_snapshot();
      world_number:=0;
      foreach world in array array['aube','marees','forge','aurores'] loop
        world_number:=world_number+1;
        s:=public.titan_adventure_action('start',world,route,null,(s->>'revision')::int,null,'UTC');
        for chapter in 1..9 loop
          execute 'reset role';
          perform set_config('request.jwt.claims','{"role":"service_role"}',true);
          delete from public.training_logs where user_id=owner;
          update public.adventure_progress set started_at=now()-interval '4 days' where user_id=owner and world_id=world;
          perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
          execute 'set local role authenticated';
          for day in 0..2 loop
            sport:=case when practice='mixed' then (array['swimming','running','muscu_gym'])[day+1] else practice end;
            unit:=case sport when 'swimming' then 'm' when 'running' then 'km' else 'kg' end;
            val:=case sport when 'swimming' then 2000 when 'running' then 8 else 4000 end;
            stamp:=now()-make_interval(days=>2-day);
            select * into submitted from public.titan_submit_training_session(sport,'training',val,unit,
              jsonb_build_object('client_event_id',gen_random_uuid(),'duration',50,'bio',jsonb_build_object('rpe',5),
                'note','Une trace de ma pratique'),stamp);
            assert submitted.server_version='sport-effort-v300','canonical training submission';
          end loop;
          s:=public.titan_adventure_snapshot();
          select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'=world;
          q:=c->'quests';
          assert (c->>'chapter')::int=chapter and (c->>'target')::int=case when chapter=9 then greatest(2,(q#>>'{profile,daysTarget}')::int) else least((array[1,2,2,2,3,2,3,3,3])[chapter],(q#>>'{profile,daysTarget}')::int) end,practice||':expected primary target';
          assert (c#>>'{evidence,days}')::int=3 and (c#>>'{evidence,effort}')::numeric=150,practice||':same eligible days/effort';
          assert jsonb_array_length(q->'items')=3 and not exists(select 1 from jsonb_array_elements(q->'items') i where not (i->>'complete')::boolean),practice||':three optional quests complete';
          assert (select array_agg(i->>'id' order by i->>'id')=array['days','effort','note'] from jsonb_array_elements(q->'items') i),'only sport-neutral quest conditions';
          result:=jsonb_build_object('target',c->'target','effort_target',c->'effort_target',
            'days',c#>'{evidence,days}','effort',c#>'{evidence,effort}',
            'quest_profile',(q->'profile')-'frozen_at','quests',q->'items');
          s:=public.titan_adventure_action('claim',world,route,null,(s->>'revision')::int,chapter,'UTC');
          select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'=world;
          assert (c->>'chapter')::int=chapter+1,practice||':chapter really confirmed';
          assert jsonb_array_length(s->'rewards')=(world_number-1)*9+chapter,practice||':one acquired badge per chapter';
          assert jsonb_array_length(s->'quest_rewards')=((world_number-1)*9+chapter)*3,practice||':three confirmed souvenirs';
          result:=result||jsonb_build_object('chapter',c->'chapter','badges',jsonb_array_length(s->'rewards'),
            'souvenirs',jsonb_array_length(s->'quest_rewards'),'xp',s->'xp','credits',s->'credits','level',s->'level');
          execute 'reset role';
          insert into qa_multisport_outcomes values(route,practice,world,chapter,result);
          perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
          execute 'set local role authenticated';
        end loop;
      end loop;
      assert not exists(select 1 from jsonb_array_elements(s->'campaigns') completed_campaign where completed_campaign->>'chapter'<>'10'),practice||':all4campaigns complete';
      assert jsonb_array_length(s->'rewards')=36 and jsonb_array_length(s->'quest_rewards')=108,practice||':same final collection';
      execute 'reset role';
    end loop;
  end loop;
end $$;
do $$ begin
  assert (select count(*)=288 from qa_multisport_outcomes),'4practices ×2routes ×36chapters';
  assert not exists(
    select 1 from qa_multisport_outcomes actual join qa_multisport_outcomes swimmer
      on swimmer.practice='swimming' and swimmer.route=actual.route and swimmer.world=actual.world and swimmer.chapter=actual.chapter
    where actual.outcome<>swimmer.outcome
  ),'swimming-only, running-only, strength-only and optional variety have identical targets/progress/collections/XP/credits';
  raise notice 'RPG multisport:288native chapter claims,8complete four-region journeys, identical targets/progress/rewards across practices.';
end $$;

-- Every catalog sport also passes the native guardian gate: no hidden allowlist.
do $$
declare owner uuid; sport record; s jsonb; c jsonb; r record; result jsonb; reference jsonb; n integer:=0;
begin
  for sport in select id,unit from public.sports order by id loop
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    owner:=gen_random_uuid();insert into auth.users(id,raw_user_meta_data) values(owner,'{}');
    update public.profiles set xp=0,level=1,credits=0 where id=owner;
    perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    s:=public.titan_adventure_action('start','aube','rhythm',null,0,null,'UTC');
    execute 'reset role';
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    update public.adventure_progress set chapter=9,started_at=now()-interval '4 days' where user_id=owner;
    perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    for day in 0..2 loop
      select * into r from public.titan_submit_training_session(sport.id,'training',1,sport.unit,
        jsonb_build_object('client_event_id',gen_random_uuid(),'duration',50,'bio',jsonb_build_object('rpe',5),
          'note','Une trace de ma pratique'),now()-make_interval(days=>2-day));
    end loop;
    s:=public.titan_adventure_snapshot();
    select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'='aube';
    assert c#>>'{evidence,days}'='3' and c#>>'{evidence,effort}'='150',sport.id||':same guardian evidence';
    s:=public.titan_adventure_action('claim','aube','rhythm',null,(s->>'revision')::int,9,'UTC');
    select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'='aube';
    assert c->>'chapter'='10',sport.id||':single sport can really defeat guardian';
    result:=jsonb_build_object('chapter',c->'chapter','xp',s->'xp','credits',s->'credits','level',s->'level',
      'badges',jsonb_array_length(s->'rewards'),'souvenirs',jsonb_array_length(s->'quest_rewards'));
    assert jsonb_array_length(s->'rewards')=1 and jsonb_array_length(s->'quest_rewards')=3,'one guardian badge/three souvenirs';
    if reference is null then reference:=result; else assert result=reference,sport.id||':no sport advantage'; end if;
    execute 'reset role';n:=n+1;
  end loop;
  assert n>=260,'complete nonempty sport catalog';
  raise notice 'RPG catalog: % sole-sport native guardian claims, identical effort/progression/rewards.',n;
end $$;

-- A large session cannot replace days of regularity, regardless of the chosen sport.
do $$
declare owner uuid; sport text; unit text; val numeric; s jsonb; r record; refused boolean;
begin
  foreach sport in array array['swimming','running','muscu_gym'] loop
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    owner:=gen_random_uuid();insert into auth.users(id,raw_user_meta_data) values(owner,'{}');
    perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    s:=public.titan_adventure_action('start','aube','rhythm',null,0,null,'UTC');
    execute 'reset role';
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    update public.adventure_progress set chapter=9,started_at=now()-interval '4 days' where user_id=owner;
    perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    unit:=case sport when 'swimming' then 'm' when 'running' then 'km' else 'kg' end;
    val:=case sport when 'swimming' then 2000 when 'running' then 8 else 4000 end;
    select * into r from public.titan_submit_training_session(sport,'training',val,unit,
      jsonb_build_object('client_event_id',gen_random_uuid(),'duration',120,'bio',jsonb_build_object('rpe',5)),now());
    assert public.titan_adventure_evidence('aube')->>'days'='1' and public.titan_adventure_evidence('aube')->>'effort'='90','same single-day cap';
    refused:=false;
    begin perform public.titan_adventure_action('claim','aube','rhythm',null,2,9,'UTC');
    exception when others then refused:=sqlerrm='QUEST_INCOMPLETE'; end;
    assert refused,'single sport volume cannot replace3days';
    assert jsonb_array_length(public.titan_adventure_snapshot()->'quest_rewards')=0,'refusal creates no souvenir';
    execute 'reset role';
  end loop;
end $$;
rollback;
