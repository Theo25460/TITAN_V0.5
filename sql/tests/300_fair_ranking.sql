-- V11-65 (COM-C4): the fair ranking among friends. Opt-in, friends only (accepted, unblocked) who also opted in, regularity and progress
-- instead of volume (a very trained athlete does not crush a beginner), suspicious sessions ignored, no history = no score, equal scores
-- share a rank, optional sport filter, nothing granted, exported and erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(d,'{}'),(e,'{}'),(f,'{}');
  update public.profiles set privacy = coalesce(privacy, '{}'::jsonb) || '{"publicProfile": true}'::jsonb where id in (b, c, d, e);
  update public.profiles set username = 'Alba' where id = a; update public.profiles set username = 'Basile' where id = b; update public.profiles set username = 'Denis' where id = d;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into public.friendships(user_id_1,user_id_2,status) values (a,b,'accepted'),(a,c,'accepted'),(a,d,'accepted'),(a,e,'accepted');
  perform set_config('request.jwt.claims','{}',true);
  set local session_replication_role = replica;   -- the creation ceilings guard live inserts; here we seed history
  -- a: twelve days of 30 minutes, six in each fortnight, flat. Recent ones are running, the older ones cycling.
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) select a, 'running', 5, 'km', 10, now() - (g || ' days')::interval, '{"effort":{"effort_minutes":30}}' from unnest(array[1,3,5,7,9,11]) g;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) select a, 'cycling', 5, 'km', 10, now() - (g || ' days')::interval, '{"effort":{"effort_minutes":30}}' from unnest(array[15,17,19,21,23,25]) g;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, is_suspicious) values (a, 'running', 5, 'km', 10, now() - interval '2 days', '{"effort":{"effort_minutes":90}}', true);
  -- b: a beginner, one short day before, three longer days now.
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) values (b, 'running', 5, 'km', 10, now() - interval '20 days', '{"effort":{"effort_minutes":30}}');
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) select b, 'running', 5, 'km', 10, now() - (g || ' days')::interval, '{"effort":{"effort_minutes":60}}' from unnest(array[2,5,9]) g;
  -- d: very trained: every day for four weeks, 200 minutes (capped at 90 a day).
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) select d, 'running', 5, 'km', 10, now() - (g || ' days')::interval, '{"effort":{"effort_minutes":200}}' from generate_series(0,27) g;
  -- c has sessions but never opts in; e opts in without any session; f is a stranger who opts in.
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details) values (c, 'running', 5, 'km', 10, now() - interval '3 days', '{"effort":{"effort_minutes":60}}'), (f, 'running', 5, 'km', 10, now() - interval '3 days', '{"effort":{"effort_minutes":60}}');
  set local session_replication_role = origin;
  perform set_config('titan.fr_a',a::text,true); perform set_config('titan.fr_b',b::text,true); perform set_config('titan.fr_c',c::text,true);
  perform set_config('titan.fr_d',d::text,true); perform set_config('titan.fr_e',e::text,true); perform set_config('titan.fr_f',f::text,true);
  assert not has_table_privilege('authenticated','private.titan_ranking_optin','select'), 'no API grant on the table';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; xp0 integer;
  a uuid := current_setting('titan.fr_a')::uuid; b uuid := current_setting('titan.fr_b')::uuid; c uuid := current_setting('titan.fr_c')::uuid;
  d uuid := current_setting('titan.fr_d')::uuid; ue uuid := current_setting('titan.fr_e')::uuid; f uuid := current_setting('titan.fr_f')::uuid;
begin
  -- Nobody is in unless they chose to be, and a player who did not opt in sees nothing of the others.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select xp into xp0 from public.profiles where id = a;
  r := public.titan_ranking_v1();
  assert (r->>'optedIn')::boolean = false and not (r ? 'entries'), 'not opted in: nothing is shown: '||r::text;
  ok:=false; begin perform public.titan_ranking_v1('Not A Sport!'); exception when others then ok:=sqlerrm='SPORT_INVALID'; end; assert ok,'the sport filter is checked';
  perform public.titan_ranking_set_v1(true);
  foreach c in array array[b, d, ue, f] loop
    perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
    perform public.titan_ranking_set_v1(true);
  end loop;
  c := current_setting('titan.fr_c')::uuid;

  -- a sees itself and its opted-in friends with a score: b and d, not c (no opt-in), not e (no session), not f (not a friend).
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_ranking_v1();
  assert jsonb_array_length(r->'entries')=3, 'a, b and d only: '||r::text;
  assert (select array_agg(e->>'name' order by ord) from jsonb_array_elements(r->'entries') with ordinality as t(e, ord)) = array['Denis','Alba','Basile'], 'equal scores share a rank, ordered by active days then name: '||r::text;
  assert (select count(distinct e->>'score') from jsonb_array_elements(r->'entries') e) = 1 and (r->'entries'->0->>'score')::int = 60, 'the very trained athlete, the regular one and the beginner all reach 60: '||r::text;
  assert (select count(distinct e->>'rank') from jsonb_array_elements(r->'entries') e) = 1 and (r->'entries'->0->>'rank')::int = 1, 'one shared rank';
  assert (r->'me'->>'activeDays')::int = 12 and (r->'me'->>'score')::int = 60, 'the suspicious session is ignored: '||(r->'me')::text;
  assert (select (e->>'activeDays')::int from jsonb_array_elements(r->'entries') e where e->>'name'='Denis') = 28, 'the volume does not raise the score';
  assert (select (e->>'progressPct')::int from jsonb_array_elements(r->'entries') e where e->>'name'='Basile') = 100, 'the beginner is rewarded for progress';

  -- b sees only its own friends: a (and itself), never d.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_ranking_v1();
  assert jsonb_array_length(r->'entries')=2 and not exists (select 1 from jsonb_array_elements(r->'entries') e where e->>'name'='Denis'), 'b only sees its friends: '||r::text;

  -- The sport filter applies the same formula to one discipline.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_ranking_v1('running');
  assert (r->'me'->>'score')::int = 70 and (r->'me'->>'activeDays')::int = 6, 'running only: six days, progress from nothing: '||(r->'me')::text;
  r := public.titan_ranking_v1('swimming');
  assert jsonb_array_length(r->'entries')=0 and (r->'me') = 'null'::jsonb, 'a sport nobody does lists nobody';

  -- A block or a suspension removes someone from the list.
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.titan_user_blocks(blocker_id, blocked_id) values (a, d);
  update public.profiles set is_suspended = true where id = b;
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_ranking_v1();
  assert jsonb_array_length(r->'entries')=1 and r->'entries'->0->>'name'='Alba', 'blocked and suspended players are gone: '||r::text;

  -- Leaving: invisible to others and blind again; exported while in; nothing granted.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert public.export_own_data()->'rankingOptIn'->>'since' is not null, 'the opt-in is exported';
  assert (select xp from public.profiles where id = a) is not distinct from xp0, 'no XP';
  assert public.titan_ranking_set_v1(false) is false, 'left';
  assert (public.titan_ranking_v1()->>'optedIn')::boolean = false, 'and blind again';
  assert public.export_own_data()->'rankingOptIn' = 'null'::jsonb, 'nothing to export after leaving';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_ranking_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare f uuid := current_setting('titan.fr_f')::uuid;
begin
  assert exists (select 1 from private.titan_ranking_optin where user_id = f), 'f is in';
  delete from auth.users where id = f;
  assert not exists (select 1 from private.titan_ranking_optin where user_id = f), 'erased with the account';
end $$;
rollback;
