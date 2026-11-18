-- Social excellence, lot C — La Grande Cordée (migration 20261120110000). Synthetic accounts only, full rollback.
-- A trained runner, a beginner in yoga and a weightlifter climb together; a stranger joins by link. Covered: invitations to friends only,
-- the share and the 1.5 × cap (the runner cannot summit alone), longueurs by day (12 and 35 counted minutes), the variety of families,
-- held sessions ignored, the beginner's last session is the one that brings the summit, the summit happens once and freezes the results,
-- the route title goes to those who brought a longueur, names follow the challenge rule, the friends' challenge list stays individual,
-- invalid routes and the running-cordée limit are refused, a block removes the blocked member from the blocker's cordée; no XP, no credit.
-- An unanswered invitation counts during the first 48 hours only: a silent invitee never makes the summit impossible. The earned route
-- titles are in the account export (cordeeTitles).
begin;
do $$
declare k text; v uuid;
begin
  foreach k in array array['a','b','c','d','e'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_co_' || k, privacy = '{"publicProfile":true}' where id = v;
    perform set_config('titan.co_' || k, v::text, true);
  end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.cordee', false, 100, 'QA')
    on conflict (key) do update set enabled = false, rollout = 100;
  -- a is friends with b and c; b and c are not friends; d is a stranger; e is nobody's friend.
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.co_a'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values
    (current_setting('titan.co_a')::uuid, current_setting('titan.co_b')::uuid, 'accepted'),
    (current_setting('titan.co_a')::uuid, current_setting('titan.co_c')::uuid, 'accepted');
  perform set_config('request.jwt.claims', '{}', true);
end $$;

set local role authenticated;
do $$
declare a uuid := current_setting('titan.co_a')::uuid; b uuid := current_setting('titan.co_b')::uuid; c uuid := current_setting('titan.co_c')::uuid;
  d uuid := current_setting('titan.co_d')::uuid; e uuid := current_setting('titan.co_e')::uuid; r jsonb; id1 uuid; tok text; ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.titan_cordee_create_v1('aube', 'douce', 14, '{}'); exception when others then ok := sqlerrm = 'FEATURE_DISABLED'; end;
  assert ok, 'closed flag: no cordée';
  ok := false;
  perform set_config('request.jwt.claims', '{}', true);
  reset role;
  update private.titan_feature_flags set enabled = true where key = 'screens.cordee';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.titan_cordee_create_v1('mordor', 'douce', 14, '{}'); exception when others then ok := sqlerrm = 'CORDEE_INVALID'; end;
  assert ok, 'an unknown route is refused';
  ok := false; begin perform public.titan_cordee_create_v1('aube', 'reguliere', 10, '{}'); exception when others then ok := sqlerrm = 'CORDEE_INVALID'; end;
  assert ok, 'durations are 7, 14, 21 or 28 days';
  r := public.titan_cordee_create_v1('aube', 'reguliere', 14, array[b, c, e]);
  assert (r->>'invited')::int = 2, 'only friends are invited (e is not a friend): ' || r::text;
  id1 := (r->>'id')::uuid;
  tok := public.titan_challenge_link_create_v1(id1)->>'token';
  r := public.titan_cordees_v1()->'cordees'->0;
  assert r->>'title' = 'Les crêtes de l’Aube' and (r->>'share')::int = 10 and (r->>'cap')::int = 15 and (r->>'target')::int = 30
     and (r->>'pending')::int = 2 and r->>'status' = 'active',
    'share of 10 longueurs (5 a week, 14 days), cap 15; the two friends who have not answered already count in the target: ' || r::text;
  assert jsonb_array_length(public.titan_social_overview()->'challenges') = 0, 'the friends'' challenge list keeps individual challenges only';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert public.titan_cordees_v1()->'cordees'->0->>'myStatus' = 'invited', 'b sees the invitation';
  perform public.titan_challenge_respond(id1, 'join');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(id1, 'join');
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(public.titan_cordees_v1()->'cordees') = 0, 'e sees nothing';
  ok := false; begin perform public.titan_challenge_respond(id1, 'join'); exception when others then ok := sqlerrm = 'CHALLENGE_NOT_FOUND'; end;
  assert ok, 'e cannot join without an invitation';
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.titan_challenge_link_preview_v1(tok);
  assert r->>'kind' = 'cordee' and r->>'route' = 'aube' and r::text not like '%qa_co_%', 'the link says it is a cordée, without any name: ' || r::text;
  perform public.titan_challenge_link_accept_v1(tok);
  perform set_config('titan.co_id', id1::text, true);
end $$;

-- Ten days of sessions: the runner trains hard every day, the beginner four short yoga sessions, the lifter three sessions; one held.
reset role;
do $$
declare a uuid := current_setting('titan.co_a')::uuid; b uuid := current_setting('titan.co_b')::uuid; c uuid := current_setting('titan.co_c')::uuid;
  id1 uuid := current_setting('titan.co_id')::uuid; i integer; held uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', '{}', true);
  update public.titan_challenges set starts_at = now() - interval '11 days', ends_at = now() + interval '3 days' where id = id1;
  set local session_replication_role = replica;
  for i in 1..10 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (a, 'running', 25, 'km', 10, now() - make_interval(days => i), '{"serverReward":true,"effort":{"effort_minutes":150}}', now() - make_interval(days => i));
  end loop;
  for i in 1..4 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (b, 'yoga', 1, 'session', 10, now() - make_interval(days => i * 2), '{"serverReward":true,"effort":{"effort_minutes":15}}', now() - make_interval(days => i * 2));
  end loop;
  for i in 1..3 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (c, 'weightlifting', 1, 'session', 10, now() - make_interval(days => i * 3), '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - make_interval(days => i * 3));
  end loop;
  -- A short session of the yogi that does not reach 12 counted minutes, and a session of the lifter whose reward is held.
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (b, 'yoga', 1, 'session', 10, now() - interval '9 days', '{"serverReward":true,"effort":{"effort_minutes":8}}', now() - interval '9 days');
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at)
  values (held, c, 'weightlifting', 1, 'session', 10, now() - interval '10 days', '{"serverReward":true,"effort":{"effort_minutes":60}}', now() - interval '10 days');
  insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at) values (held, c, 10, 1, now() + interval '1 day');
  set local session_replication_role = origin;
end $$;

set local role authenticated;
do $$
declare a uuid := current_setting('titan.co_a')::uuid; b uuid := current_setting('titan.co_b')::uuid; d uuid := current_setting('titan.co_d')::uuid;
  r jsonb; me jsonb; names text[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.titan_cordees_v1()->'cordees'->0;
  -- 4 members joined (a, b, c, d): target 40. a: 20 longueurs, counted 15 (cap). b: 4. c: 6 (the held session ignored). d: 0.
  assert (r->>'target')::int = 40 and (r->>'joined')::int = 4, 'target = share × joined: ' || r::text;
  assert (select (m->>'pitches')::int from jsonb_array_elements(r->'members') m where m->>'name' = 'qa_co_a') = 15, 'the runner counts up to the cap: ' || r::text;
  me := r->'me';
  assert (me->>'pitches')::int = 4 and (me->>'days')::int = 4 and me->'families' = '["mobilite"]'::jsonb and not (me->>'strand')::boolean, 'b: 4 longueurs in mobility: ' || me::text;
  assert (r->>'longueurs')::int = 25 and (r->>'variety')::int = 4 and r->'families' @> '["endurance","force","mobilite"]'::jsonb,
    'three families bring 4 longueurs of variety: ' || r::text;
  assert (r->>'total')::int = 29 and (r->>'camps')::int = 2 and r->>'status' = 'active', '29 / 40: two camps reached: ' || r::text;
  select array_agg(m->>'name' order by m->>'name') into names from jsonb_array_elements(r->'members') m;
  assert names = array['Membre de la cordée', 'Membre de la cordée', 'qa_co_a', 'qa_co_b'], 'b sees itself and its friend a only: ' || r::text;
  assert not exists (select 1 from jsonb_array_elements(r->'members') m where m->>'id' is null and (m ? 'pitches' or m ? 'families' or m ? 'strand')),
    'a nameless member shows nothing personal: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.titan_cordees_v1()->'cordees'->0;
  select array_agg(m->>'name' order by m->>'name') into names from jsonb_array_elements(r->'members') m;
  assert names = array['Membre de la cordée', 'Membre de la cordée', 'qa_co_a', 'qa_co_d'], 'the stranger sees itself and the link creator only: ' || r::text;
end $$;

-- titan_challenge_result_v1 cannot freeze a running cordée as an individual challenge.
do $$
declare ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.co_b'), 'role', 'authenticated')::text, true);
  begin perform public.titan_challenge_result_v1(current_setting('titan.co_id')::uuid); exception when others then ok := sqlerrm = 'CHALLENGE_RUNNING'; end;
  assert ok, 'a running cordée has no result yet';
end $$;
reset role;
do $$
declare id1 uuid := current_setting('titan.co_id')::uuid;
begin
  perform set_config('request.jwt.claims', '{}', true);
  assert not exists (select 1 from private.titan_challenge_results where challenge_id = id1), 'nothing was frozen';
  -- d logs a 5-minute climbing session: a token session brings no family (and no longueur).
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (current_setting('titan.co_d')::uuid, 'football', 1, 'session', 10, now() - interval '2 days', '{"serverReward":true,"effort":{"effort_minutes":5}}', now() - interval '2 days');
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.co_d'), 'role', 'authenticated')::text, true);
  r := public.titan_cordees_v1()->'cordees'->0;
  assert (r->>'variety')::int = 4 and not (r->'families' @> '["jeu"]'::jsonb) and (r->'me'->>'pitches')::int = 0, 'a 5-minute session opens no route: ' || r::text;
end $$;

-- d leaves (a stranger who did nothing): the target falls to 30. The lifter adds one short session.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.co_d'), 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(current_setting('titan.co_id')::uuid, 'leave');
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.co_b')::uuid; c uuid := current_setting('titan.co_c')::uuid;
begin
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (c, 'weightlifting', 1, 'session', 10, now() - interval '1 day', '{"serverReward":true,"effort":{"effort_minutes":12}}', now() - interval '1 day');
  set local session_replication_role = origin;
end $$;
set local role authenticated;
-- 15 (runner, capped) + 4 (beginner) + 7 (lifter) = 26, + 4 for three families = 30 = 3 × 10: the lifter's short session brings the summit.
do $$
declare a uuid := current_setting('titan.co_a')::uuid; b uuid := current_setting('titan.co_b')::uuid; c uuid := current_setting('titan.co_c')::uuid;
  d uuid := current_setting('titan.co_d')::uuid; id1 uuid := current_setting('titan.co_id')::uuid; r jsonb; s1 timestamptz; ok boolean := false;
  xp0 integer; cr0 integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  r := public.titan_cordees_v1();
  assert r->'cordees'->0->>'status' = 'summited' and (r->'cordees'->0->>'percent')::int = 100 and (r->'cordees'->0->>'camps')::int = 4, 'the cordée summits: ' || r::text;
  assert (r->'cordees'->0->>'earned')::boolean and r->'titles' = '["aube"]'::jsonb, 'a earns the route title';
  s1 := (r->'cordees'->0->>'summitedAt')::timestamptz;
  assert (public.titan_set_displayed_title('cordee:aube')->>'label') = 'Brin de l’Aube', 'the title can be worn';
  -- Once: a second read changes nothing.
  r := public.titan_cordees_v1();
  assert (r->'cordees'->0->>'summitedAt')::timestamptz = s1, 'the summit is written once';
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert (public.titan_cordees_v1()->'cordees'->0->>'earned')::boolean, 'the beginner earns the title too';
  r := public.export_own_data();
  assert jsonb_array_length(r->'cordeeTitles') = 1 and r->'cordeeTitles'->0->>'route' = 'aube' and r->'cordeeTitles'->0->>'challenge_id' = id1::text
     and r ? 'friendInvites', 'the export lists the earned route title, cumulatively: ' || coalesce(r->'cordeeTitles', 'null'::jsonb)::text;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  begin perform public.titan_set_displayed_title('cordee:aube'); exception when others then ok := sqlerrm = 'NOT_EARNED'; end;
  assert ok, 'the stranger who left with no longueur earns nothing';
end $$;
reset role;
do $$
declare id1 uuid := current_setting('titan.co_id')::uuid; c uuid := current_setting('titan.co_c')::uuid;
begin
  perform set_config('request.jwt.claims', '{}', true);
  assert (select count(*) from private.titan_challenge_results where challenge_id = id1) = 3, 'one frozen result per remaining member';
  assert (select count(*) from private.titan_challenge_results where challenge_id = id1 and reached) = 3, 'all three brought longueurs';
  assert (select final_progress from private.titan_challenge_results where challenge_id = id1 and user_id = current_setting('titan.co_a')::uuid) = 15, 'frozen at the cap';
  assert (select ends_at <= now() from public.titan_challenges where id = id1), 'a summited cordée is over';
  -- A session after the summit changes nothing.
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (c, 'weightlifting', 1, 'session', 10, now(), '{"serverReward":true,"effort":{"effort_minutes":60}}', now());
  set local session_replication_role = origin;
  assert (select final_progress from private.titan_challenge_results where challenge_id = id1 and user_id = c) = 7, 'results stay frozen';
end $$;

-- The route titles survive the erasure of the cordée's creator.
reset role;
do $$
declare b uuid := current_setting('titan.co_b')::uuid; a uuid := current_setting('titan.co_a')::uuid;
begin
  perform set_config('request.jwt.claims', '{}', true);
  assert private.titan_title_earned(b, 'cordee:aube'), 'b holds the title';
  -- A second cordée of a is created by a and then a is erased (cascade from auth.users, as the account erasure does).
  perform set_config('titan.co_keep', a::text, true);
end $$;
set local role authenticated;

-- Limits and blocks.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.co_a')::uuid; c uuid := current_setting('titan.co_c')::uuid; ok boolean := false; id2 uuid; r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  id2 := (public.titan_cordee_create_v1('forge', 'douce', 7, array[c])->>'id')::uuid;
  perform public.titan_cordee_create_v1('marees', 'douce', 7, '{}');
  begin perform public.titan_cordee_create_v1('aurores', 'douce', 7, '{}'); exception when others then ok := sqlerrm = 'SOCIAL_RATE_LIMIT'; end;
  assert ok, 'three cordées created a day at most (the first one counts)';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(id2, 'join');
  perform public.titan_block_user(a, null);
  r := public.titan_cordees_v1();
  assert jsonb_array_length(r->'cordees') = 0, 'after blocking their creator, c leaves both of a''s cordées: ' || r::text;
  assert r->'titles' = '["aube"]'::jsonb, 'what c earned before the block stays earned';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := (select x from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id2::text);
  assert (r->>'joined')::int = 1, 'the blocked member left the blocker''s cordée: ' || r::text;
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.co_a')::uuid; b uuid := current_setting('titan.co_b')::uuid;
begin
  perform set_config('request.jwt.claims', '{}', true);
  delete from auth.users where id = a;
  assert not exists (select 1 from public.titan_challenges where creator_id = a), 'the creator''s cordées are gone with the account';
  assert private.titan_title_earned(b, 'cordee:aube'), 'b keeps the title earned with the erased creator';
end $$;

-- A cordée formed with friends invited cannot summit alone in its first 48 hours, even with a strong first day; after them, a friend
-- who never answers no longer counts and the cordée can summit.
do $$
declare c uuid := current_setting('titan.co_c')::uuid; e uuid := current_setting('titan.co_e')::uuid; id3 uuid; id4 uuid; r jsonb;
begin
  update private.titan_feature_flags set enabled = true where key = 'screens.cordee';
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values (e, c, 'pending');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_social_respond(e, true);
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  id3 := (public.titan_cordee_create_v1('aube', 'douce', 7, array[c])->>'id')::uuid;
  id4 := (public.titan_cordee_create_v1('forge', 'douce', 7, array[c])->>'id')::uuid;
  perform set_config('request.jwt.claims', '{}', true);
  -- id3 started 30 hours ago (inside the 48 hours), id4 three days ago (after them); c answers neither.
  update public.titan_challenges set starts_at = now() - interval '30 hours' where id = id3;
  update public.titan_challenges set starts_at = now() - interval '3 days' where id = id4;
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (e, 'running', 10, 'km', 10, now() - interval '28 hours', '{"serverReward":true,"effort":{"effort_minutes":60}}', now() - interval '28 hours'),
    (e, 'yoga', 1, 'session', 10, now() - interval '2 hours', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '2 hours');
  set local session_replication_role = origin;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  r := public.titan_cordees_v1();
  -- Inside the 48 hours: e alone reaches 6 = target 3 × 2 (c has not answered and counts), but one contributor is not two: no summit.
  assert (select x->>'status' from jsonb_array_elements(r->'cordees') x where x->>'id' = id3::text) = 'active'
     and (select (x->>'target')::int from jsonb_array_elements(r->'cordees') x where x->>'id' = id3::text) = 6
     and (select (x->>'needs')::int from jsonb_array_elements(r->'cordees') x where x->>'id' = id3::text) = 2,
    'no summit while the invited friend may still answer: ' || r::text;
  -- After the 48 hours: the silent invitation no longer counts (target 3, needs 1), the same sessions bring the summit.
  assert (select x->>'status' from jsonb_array_elements(r->'cordees') x where x->>'id' = id4::text) = 'summited'
     and (select (x->>'target')::int from jsonb_array_elements(r->'cordees') x where x->>'id' = id4::text) = 3
     and (select (x->>'pending')::int from jsonb_array_elements(r->'cordees') x where x->>'id' = id4::text) = 0,
    'a silent invitee no longer blocks the summit after 48 hours: ' || r::text;
  assert private.titan_title_earned(e, 'cordee:forge'), 'e earns the route title';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(id3, 'join');
  assert (select x->>'myStatus' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id3::text) = 'joined', 'c could still join';
  assert not private.titan_title_earned(c, 'cordee:forge'), 'the silent invitee earns nothing';
end $$;
rollback;
