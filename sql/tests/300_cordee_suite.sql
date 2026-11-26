-- V1.8.3 — Un groupe qui se retrouve (migration 20261130104300). Synthetic accounts only, full rollback.
-- Cordée 1 (the scenario): a summited « Les crêtes de l'Aube » with b, c, d and e (e by a's link). b proposes another route at a softer
-- pace, d declines, c proposes the very same thing at the same moment (canonical: one proposal), the group sets off with the counters at
-- zero, a accepts later, e declines from the invitation. The finished cordée stays readable with its story; the next one holds only the
-- members who accepted. Covered: closed flag, running cordée, no free advance, digest, visibility through the chain, export.
-- Cordée 2 (two distinct proposals and a blocked account): b and c propose different routes; d, who blocked b, never sees b's proposal
-- and cannot answer it; b rallies c's proposal (merged), the group sets off; a then proposes again and leaves with f; f cannot choose a
-- second one; a suspended member can do nothing.
-- Cordée 3 (refusals): every other member declines; the proposal starts nothing and expires; a departed member is not of the group.
-- Cordée 4 (alone, then too late): nobody else to propose to; the 14-day window closes.
begin;
create function pg_temp.cordee(p_id uuid) returns jsonb language sql as
  $$ select x from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = p_id::text $$;
create function pg_temp.as_user(k text) returns void language sql as
  $$ select set_config('request.jwt.claims', case when k is null then '{}' else json_build_object('sub', current_setting('titan.su_' || k), 'role', 'authenticated')::text end, true) $$;
create function pg_temp.uid(k text) returns uuid language sql as $$ select current_setting('titan.su_' || k)::uuid $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'no error'; exception when others then return sqlerrm; end $$;
create function pg_temp.suite(p_from uuid, p_action text, p_suite uuid default null, p_route text default null, p_pace text default null, p_days integer default null)
  returns jsonb language sql as $$ select public.titan_cordee_suite_v1(p_from, p_action, p_suite, p_route, p_pace, p_days) $$;
-- Reads of private tables from a test step that runs as an authenticated member.
create function pg_temp.val(p_sql text) returns text language plpgsql security definer as
  $$ declare r text; begin execute p_sql into r; return r; end $$;
grant execute on all functions in schema pg_temp to authenticated;

do $$
declare k text; v uuid;
begin
  foreach k in array array['a','b','c','d','e','f','g'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_su_' || k, privacy = '{"publicProfile":true}' where id = v;
    perform set_config('titan.su_' || k, v::text, true);
  end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values
    ('screens.cordee', true, 100, 'QA'), ('screens.cordee_relay', true, 100, 'QA'), ('screens.cordee_suite', false, 100, 'QA')
    on conflict (key) do update set enabled = excluded.enabled, rollout = 100;
  -- a is friends with b, c, d, f and g; b and c are friends. e is nobody's friend (joins cordée 1 by a's link).
  perform pg_temp.as_user('a');
  insert into public.friendships(user_id_1, user_id_2, status) values
    (pg_temp.uid('a'), pg_temp.uid('b'), 'accepted'), (pg_temp.uid('a'), pg_temp.uid('c'), 'accepted'), (pg_temp.uid('a'), pg_temp.uid('d'), 'accepted'),
    (pg_temp.uid('a'), pg_temp.uid('f'), 'accepted'), (pg_temp.uid('a'), pg_temp.uid('g'), 'accepted');
  perform pg_temp.as_user('b');
  insert into public.friendships(user_id_1, user_id_2, status) values (pg_temp.uid('b'), pg_temp.uid('c'), 'accepted');
  perform pg_temp.as_user(null);
end $$;

-- Four cordées formed by a (cordée 3 with f and g, cordée 4 alone); e joins cordée 1 by link; a fifth one keeps running.
set local role authenticated;
do $$
declare id1 uuid; id2 uuid; id3 uuid; id4 uuid; id5 uuid; t1 text;
begin
  perform pg_temp.as_user('a');
  id1 := (public.titan_cordee_create_v1('aube', 'soutenue', 14, array[pg_temp.uid('b'), pg_temp.uid('c'), pg_temp.uid('d')])->>'id')::uuid;
  id2 := (public.titan_cordee_create_v1('aube', 'reguliere', 14, array[pg_temp.uid('b'), pg_temp.uid('c'), pg_temp.uid('d'), pg_temp.uid('f')])->>'id')::uuid;
  id3 := (public.titan_cordee_create_v1('marees', 'douce', 7, array[pg_temp.uid('f'), pg_temp.uid('g')])->>'id')::uuid;
  t1 := public.titan_challenge_link_create_v1(id1)->>'token';
  perform pg_temp.as_user('e');
  perform public.titan_challenge_link_accept_v1(t1);
  perform set_config('titan.su_id1', id1::text, true);
  perform set_config('titan.su_id2', id2::text, true);
  perform set_config('titan.su_id3', id3::text, true);
end $$;
-- The next day (another creation window), a forms cordée 4 alone and cordée 5, still running.
reset role;
do $$
begin
  update public.titan_social_action_log set created_at = created_at - interval '2 days' where actor_id = pg_temp.uid('a');
  update public.titan_challenges set ends_at = now() - interval '2 days', starts_at = now() - interval '16 days'
   where id in (current_setting('titan.su_id1')::uuid, current_setting('titan.su_id2')::uuid, current_setting('titan.su_id3')::uuid);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('a'), 'role', 'authenticated')::text, true);
  perform set_config('titan.su_id4', (public.titan_cordee_create_v1('forge', 'douce', 7, '{}')->>'id'), true);
  perform set_config('titan.su_id5', (public.titan_cordee_create_v1('aube', 'douce', 28, array[pg_temp.uid('b')])->>'id'), true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- Everyone joins. Cordées 1 to 4 ran from 16 to 2 days ago; cordée 1 summited 2 days ago, the others ended. a's session opened the relay of
-- cordée 1, c received it; b brought 2 longueurs. g left cordée 3 before its end.
reset role;
do $$
declare id1 uuid := current_setting('titan.su_id1')::uuid; id2 uuid := current_setting('titan.su_id2')::uuid;
  id3 uuid := current_setting('titan.su_id3')::uuid; id4 uuid := current_setting('titan.su_id4')::uuid; id5 uuid := current_setting('titan.su_id5')::uuid;
begin
  update public.titan_challenge_members set status = 'joined', joined_at = now() - interval '16 days' where challenge_id in (id1, id2, id3, id4, id5);
  update public.titan_challenges set starts_at = now() - interval '16 days', ends_at = now() - interval '2 days' where id in (id1, id2, id3, id4);
  update public.titan_challenges set starts_at = now() - interval '2 days', ends_at = now() + interval '26 days' where id = id5;
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (pg_temp.uid('a'), 'climbing', 1, 'session', 10, now() - interval '10 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '10 days'),
    (pg_temp.uid('c'), 'running', 5, 'km', 10, now() - interval '8 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '8 days'),
    (pg_temp.uid('b'), 'running', 5, 'km', 10, now() - interval '6 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '6 days');
  set local session_replication_role = origin;
  insert into private.titan_cordee_relays (challenge_id, opened_by, opened_day, opened_family, opened_at, confirmed_by, confirmed_day, confirmed_family, confirmed_at)
  values (id1, pg_temp.uid('a'), ((now() - interval '10 days') at time zone 'Europe/Paris')::date, 'technique', now() - interval '10 days',
          pg_temp.uid('c'), ((now() - interval '8 days') at time zone 'Europe/Paris')::date, 'endurance', now() - interval '8 days');
  update public.titan_challenges set summited_at = now() - interval '2 days' where id = id1;
  update public.titan_challenge_members set status = 'left' where challenge_id = id3 and user_id = pg_temp.uid('g');
end $$;

-- =========================================================================================== Cordée 1: the scenario.
set local role authenticated;
do $$
declare id1 uuid := current_setting('titan.su_id1')::uuid; id5 uuid := current_setting('titan.su_id5')::uuid;
  s jsonb; r jsonb; p uuid; n uuid; old0 jsonb;
begin
  -- Closed flag: the finished cordée shows its story and no proposal can be made.
  perform pg_temp.as_user('b');
  s := pg_temp.cordee(id1);
  assert s->>'status' = 'summited' and s->'suite'->'can' = '["propose"]'::jsonb and (s->'suite'->>'group')::int = 5,
    'b sees the finished cordée of 5 and may propose: ' || (s->'suite')::text;
  assert jsonb_path_query_array(s->'story', '$[*].kind') = '["formed","relay_opened","relay_confirmed","summit"]'::jsonb,
    'the story holds shareable steps only: ' || (s->'story')::text;
  assert (s->'story')::text !~ '(climbing|running|effort|minutes|log_id|km)', 'no session, sport, duration or distance in the story';
  assert s->'story'->1->'who'->>'name' = 'qa_su_a' and s->'story'->1->'who'->>'family' = 'technique', 'relay names follow the Cordée rule';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id1, 'propose', 'marees', 'douce', 14)) = 'FEATURE_DISABLED', 'closed flag: propose refused';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id5, 'propose', 'marees', 'douce', 14)) = 'FEATURE_DISABLED', 'closed flag first';
  perform pg_temp.as_user(null);
  reset role;
  update private.titan_feature_flags set enabled = true where key = 'screens.cordee_suite';
  set local role authenticated;
  -- A running cordée has nothing to set off from.
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id5, 'propose', 'marees', 'douce', 14)) = 'SUITE_NOT_FINISHED', 'running cordée';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id1, 'propose', 'lune', 'douce', 14)) = 'CORDEE_INVALID', 'only existing routes';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id1, 'propose', 'marees', 'extreme', 14)) = 'CORDEE_INVALID', 'only tested paces';
  perform pg_temp.as_user('a');
  old0 := pg_temp.cordee(id1) - 'suite' - 'story';
  perform set_config('titan.su_xp0', pg_temp.val($q$select array_agg(xp order by id)::text || array_agg(credits order by id)::text from public.profiles where username like 'qa_su_%'$q$), true);

  -- b proposes the Marées at a softer pace for 14 days. b accepts by proposing; nobody else is added.
  perform pg_temp.as_user('b');
  r := pg_temp.suite(id1, 'propose', null, 'marees', 'douce', 14);
  p := (r->>'proposal')::uuid;
  assert (r->>'changed')::boolean and r->>'status' = 'open' and r->'started' = 'null'::jsonb and not (r->>'canonical')::boolean, 'b proposed: ' || r::text;
  s := r->'suite'->'proposals'->0;
  assert (s->>'mine')::boolean and s->>'myAnswer' = 'yes' and (s->>'yes')::int = 1 and (s->>'eligible')::int = 5 and (s->>'waiting')::int = 4
     and s->'turn' = '["withdraw"]'::jsonb and r->'suite'->'can' = '[]'::jsonb and r->'suite'->>'hint' = 'mine', 'b sees its proposal: ' || s::text;
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id1, 'propose', 'forge', 'douce', 14)) = 'SUITE_PENDING', 'one open proposal per proposer';
  r := pg_temp.suite(id1, 'propose', null, 'marees', 'douce', 14);
  assert not (r->>'changed')::boolean and (r->>'proposal')::uuid = p, 'proposing the same again changes nothing';
  -- e (joined by a's link) sees the proposal, the proposer nameless, the answers to give.
  perform pg_temp.as_user('e');
  s := pg_temp.cordee(id1)->'suite';
  assert s->'proposals'->0->'by'->>'name' = 'Membre de la cordée' and s->'proposals'->0->'turn' = '["accept","decline"]'::jsonb
     and s->>'hint' = 'answer' and (s->>'waiting')::int = 1, 'e may answer, without b''s name: ' || s::text;
  -- d declines (a refusal): nothing starts, the refusal is a count, never a name.
  perform pg_temp.as_user('d');
  r := pg_temp.suite(id1, 'decline', p);
  assert (r->>'changed')::boolean and r->>'status' = 'open' and r->'suite'->'proposals'->0->>'myAnswer' = 'no'
     and r->'suite'->'proposals'->0->'turn' = '["accept"]'::jsonb, 'd declined and may still change its mind: ' || r::text;
  perform pg_temp.as_user('b');
  s := pg_temp.cordee(id1)->'suite'->'proposals'->0;
  assert (s->>'no')::int = 1 and s->'accepted' = '[{"me": true, "name": "qa_su_b"}]'::jsonb and s::text !~ 'qa_su_d', 'a refusal is never named: ' || s::text;

  -- c proposes the very same route, pace and duration: the canonical proposal. c's proposal is an acceptance, and two have accepted:
  -- the group sets off now, with the counters at zero.
  perform pg_temp.as_user('c');
  r := pg_temp.suite(id1, 'propose', null, 'marees', 'douce', 14);
  assert (r->>'canonical')::boolean and (r->>'proposal')::uuid = p and r->>'status' = 'started' and r->'started' <> 'null'::jsonb, 'canonical, started: ' || r::text;
  n := (r->>'started')::uuid;
  perform set_config('titan.su_n1', n::text, true);
  perform pg_temp.as_user(null);
  reset role;
  assert (select count(*) from private.titan_cordee_suites where from_id = id1) = 1, 'one proposal for the group';
  assert (select string_agg(p2.username || ':' || m.status, ',' order by p2.username) from public.titan_challenge_members m join public.profiles p2 on p2.id = m.user_id
           where m.challenge_id = n) = 'qa_su_a:invited,qa_su_b:joined,qa_su_c:joined,qa_su_e:invited',
    'b and c are roped in, a and e invited, d (declined) not added';
  assert (select creator_id = pg_temp.uid('b') and route = 'marees' and pace = 'douce' and starts_at > now() - interval '1 minute'
             and ends_at = starts_at + interval '14 days' and summited_at is null from public.titan_challenges where id = n), 'a new cordée, started now';
  -- b's session of 6 days ago belongs to the finished cordée: it never counts in the new one.
  set local role authenticated;
  perform pg_temp.as_user('b');
  s := pg_temp.cordee(n);
  assert (s->>'longueurs')::int = 0 and (s->>'total')::int = 0 and (s->'me'->>'counted')::int = 0 and (s->>'camps')::int = 0
     and (s->>'joined')::int = 2 and s->>'myStatus' = 'joined', 'counters at zero: ' || s::text;
  assert s->'follows'->>'route' = 'aube' and (s->'follows'->>'summited')::boolean and (s->'follows'->>'group')::int = 5
     and s->'follows'->'proposedBy'->>'name' = 'qa_su_b', 'the new cordée names the one it follows: ' || (s->'follows')::text;
  -- The finished cordée is untouched and still readable; its story now tells the group's decision.
  perform pg_temp.as_user('a');
  s := pg_temp.cordee(id1);
  assert s - 'suite' - 'story' = old0, 'the finished cordée is unchanged';
  assert jsonb_path_query_array(s->'story', '$[*].kind') = '["formed","relay_opened","relay_confirmed","summit","proposal","suite"]'::jsonb
     and (s->'story'->4->>'yes')::int = 2 and (s->'story'->4->>'no')::int = 1 and (s->'story'->5->>'joined')::int = 2
     and s->'story'->4->>'route' = 'marees' and s->'story'->4->>'pace' = 'douce', 'the story: ' || (s->'story')::text;
  assert s->'suite'->'proposals'->0->>'status' = 'started' and s->'suite'->'proposals'->0->'turn' = '["accept","decline"]'::jsonb
     and s->'suite'->>'hint' = 'answer', 'a is invited and may still accept: ' || (s->'suite')::text;
  -- « Depuis ta dernière visite »: the answer that waits for a is visible in the digest already used.
  r := public.titan_social_digest_v1(now() - interval '3 days');
  assert jsonb_array_length(r->'suites') = 1 and (r->'suites'->0->>'waiting')::int = 1 and r->'suites'->0->'proposals'->0->>'status' = 'started'
     and r->'suites'->0->'proposals'->0->>'route' = 'marees', 'the digest says the group waits for a: ' || (r->'suites')::text;
  assert exists (select 1 from jsonb_array_elements(r->'cordees') x where x->>'id' = n::text and x->>'myStatus' = 'invited' and x->>'follows' = 'aube'),
    'the digest names the cordée the new one follows';
  -- a accepts later: roped in at once. e declines from the ordinary invitation: the answer is recorded.
  r := pg_temp.suite(id1, 'accept', p);
  assert (r->>'changed')::boolean and r->'suite'->'proposals'->0->>'myAnswer' = 'yes' and (r->'suite'->'proposals'->0->>'joined')::int = 3, 'a joined: ' || r::text;
  r := pg_temp.suite(id1, 'accept', p);
  assert not (r->>'changed')::boolean, 'accepting again changes nothing';
  perform pg_temp.as_user('e');
  perform public.titan_challenge_respond(n, 'decline');
  s := pg_temp.cordee(id1)->'suite'->'proposals'->0;
  assert s->>'myAnswer' = 'no' and (s->>'no')::int = 2 and (s->>'yes')::int = 3 and s->'turn' = '["accept"]'::jsonb, 'e''s refusal is recorded: ' || s::text;
  -- Link partners of the finished cordée keep seeing each other in the one that follows it; nobody else does.
  assert pg_temp.val(format('select private.titan_member_named(%L, %L, %L) and not private.titan_member_named(%L, %L, %L)',
           pg_temp.uid('e'), pg_temp.uid('a'), n, pg_temp.uid('e'), pg_temp.uid('b'), n)) = 'true', 'visibility follows the chain, not more';
  -- No free advance: XP and credits untouched for everyone.
  assert pg_temp.val($q$select array_agg(xp order by id)::text || array_agg(credits order by id)::text from public.profiles where username like 'qa_su_%'$q$)
     = current_setting('titan.su_xp0'), 'no XP, no credit';
  -- A member roped in the started proposal cannot propose another one.
  perform pg_temp.as_user('c');
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id1, 'propose', 'forge', 'soutenue', 7)) = 'SUITE_ALREADY_IN', 'leave first';
  assert pg_temp.cordee(id1)->'suite'->>'hint' = 'in', 'c reads that it already set off';
end $$;

-- =========================================================================================== Cordée 2: two distinct proposals, a block.
-- d blocks b (both stay in a's cordée, nameless to each other). b proposes the Forges, c the Aurores, at the same time.
do $$
declare id2 uuid := current_setting('titan.su_id2')::uuid; s jsonb; r jsonb; p1 uuid; p2 uuid; n2 uuid;
begin
  perform pg_temp.as_user('d');
  perform public.titan_block_user(pg_temp.uid('b'), null);
  perform pg_temp.as_user('b');
  p1 := (pg_temp.suite(id2, 'propose', null, 'forge', 'reguliere', 21)->>'proposal')::uuid;
  perform pg_temp.as_user('c');
  r := pg_temp.suite(id2, 'propose', null, 'aurores', 'soutenue', 7);
  p2 := (r->>'proposal')::uuid;
  assert not (r->>'canonical')::boolean and (r->'suite'->>'choice')::boolean and jsonb_array_length(r->'suite'->'proposals') = 2,
    'two distinct proposals: the group chooses explicitly: ' || (r->'suite')::text;
  -- The blocked account never sees b's proposal and cannot answer it; c's proposal is d's to answer.
  perform pg_temp.as_user('d');
  s := pg_temp.cordee(id2)->'suite';
  assert jsonb_array_length(s->'proposals') = 1 and s->'proposals'->0->>'id' = p2::text and not (s->>'choice')::boolean, 'd sees only c''s proposal: ' || s::text;
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, %L)', id2, 'accept', p1)) = 'SUITE_UNAVAILABLE', 'd cannot answer b''s proposal';
  perform pg_temp.as_user('a');
  s := pg_temp.cordee(id2)->'suite';
  assert (s->>'choice')::boolean and (s->>'waiting')::int = 2 and s->'proposals'->0->>'id' = p1::text and (s->'proposals'->0->>'eligible')::int = 4,
    'a chooses between two; b''s proposal can reach 4 (not d): ' || s::text;
  -- a chooses the Forges: b and a accepted, the Forges start.
  r := pg_temp.suite(id2, 'accept', p1);
  assert r->>'status' = 'started' and r->'started' <> 'null'::jsonb, 'b and a: the Forges start: ' || r::text;
  n2 := (r->>'started')::uuid;
  -- One started proposal at a time: a must leave the Forges to choose the Aurores.
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, %L)', id2, 'accept', p2)) = 'SUITE_ALREADY_IN', 'one started proposal at a time';
  perform public.titan_challenge_respond(n2, 'leave');
  r := pg_temp.suite(id2, 'accept', p2);
  assert r->>'status' = 'started' and r->'started' <> 'null'::jsonb, 'the Aurores start with c and a: ' || r::text;
  perform set_config('titan.su_n2', n2::text, true);
  perform set_config('titan.su_n3', r->>'started', true);
  perform set_config('titan.su_p2', p2::text, true);
  -- f accepts the Forges (roped in at once) and can no longer accept the Aurores.
  perform pg_temp.as_user('f');
  s := pg_temp.cordee(id2)->'suite';
  assert (select count(*) from jsonb_array_elements(s->'proposals') x where x->>'status' = 'started') = 2, 'two departures for this group';
  r := pg_temp.suite(id2, 'accept', p1);
  assert (r->>'changed')::boolean, 'f joins the Forges';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, %L)', id2, 'accept', p2)) = 'SUITE_ALREADY_IN', 'f chose the Forges';
end $$;
reset role;
do $$
declare n2 uuid := current_setting('titan.su_n2')::uuid; n3 uuid := current_setting('titan.su_n3')::uuid;
begin
  -- d (blocked with b) was never added to b's cordée; d is invited to c's.
  assert not exists (select 1 from public.titan_challenge_members where challenge_id = n2 and user_id = pg_temp.uid('d')), 'the blocked account is not in b''s cordée';
  assert (select status from public.titan_challenge_members where challenge_id = n3 and user_id = pg_temp.uid('d')) = 'invited', 'd is invited to c''s cordée';
  assert (select string_agg(p.username, ',' order by p.username) from public.titan_challenge_members m join public.profiles p on p.id = m.user_id
           where m.challenge_id = n2 and m.status = 'joined') = 'qa_su_b,qa_su_f', 'the Forges hold only b and f, who accepted (a left)';
  assert (select string_agg(p.username, ',' order by p.username) from public.titan_challenge_members m join public.profiles p on p.id = m.user_id
           where m.challenge_id = n3 and m.status = 'joined') = 'qa_su_a,qa_su_c', 'the Aurores hold only a and c';
  -- A suspended member can do nothing.
  perform pg_temp.as_user(null);
  update public.profiles set is_suspended = true where id = pg_temp.uid('d');
end $$;
set local role authenticated;
do $$
declare id2 uuid := current_setting('titan.su_id2')::uuid;
begin
  perform pg_temp.as_user('d');
  assert pg_temp.cordee(id2)->'suite'->>'hint' = 'suspended', 'suspended: nothing to do';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, %L)', id2, 'accept', current_setting('titan.su_p2'))) = 'ACCOUNT_SUSPENDED', 'suspended: refused';
end $$;
reset role;
do $$ begin perform pg_temp.as_user(null); end $$;
update public.profiles set is_suspended = false where id = current_setting('titan.su_d')::uuid;
set local role authenticated;

-- =========================================================================================== Cordée 3: refusals, a departed member, the expiry.
do $$
declare id3 uuid := current_setting('titan.su_id3')::uuid; r jsonb; p uuid; s jsonb;
begin
  -- g left before the end: not of the group any more.
  perform pg_temp.as_user('g');
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id3, 'propose', 'aube', 'douce', 7)) = 'CHALLENGE_NOT_FOUND', 'a departed member';
  perform pg_temp.as_user('a');
  r := pg_temp.suite(id3, 'propose', null, 'aube', 'douce', 7);
  p := (r->>'proposal')::uuid;
  assert (r->'suite'->'proposals'->0->>'eligible')::int = 2, 'a and f only: ' || r::text;
  -- f proposes another route and declines a's.
  perform pg_temp.as_user('f');
  r := pg_temp.suite(id3, 'propose', null, 'forge', 'douce', 7);
  r := pg_temp.suite(id3, 'decline', p);
  assert r->>'status' = 'open' and r->'started' = 'null'::jsonb, 'f declined a''s proposal: nothing starts';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, %L)', id3, 'withdraw', p)) = 'SUITE_NOT_MINE', 'only the proposer withdraws';
  perform pg_temp.as_user('a');
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, %L)', id3, 'decline', p)) = 'SUITE_OWN', 'the proposer withdraws instead';
  -- a accepts f's proposal instead: a's own proposal is merged (it rallies f's), f's starts with a and f.
  p := pg_temp.val(format('select id from private.titan_cordee_suites where from_id = %L and route = %L', id3, 'forge'))::uuid;
  r := pg_temp.suite(id3, 'accept', p);
  assert r->>'status' = 'started', 'f''s proposal starts: ' || r::text;
  assert pg_temp.val(format('select status from private.titan_cordee_suites where from_id = %L and route = %L', id3, 'aube')) = 'merged', 'a rallied f''s proposal';
  s := pg_temp.cordee(id3);
  assert (select count(*) from jsonb_array_elements(s->'story') x where x->>'kind' = 'proposal') = 2
     and exists (select 1 from jsonb_array_elements(s->'story') x where x->>'kind' = 'proposal' and x->>'status' = 'merged'), 'decisions in the story: ' || (s->'story')::text;
end $$;

-- Refusals only (cordée 1 again, as d, who declined: d proposes, everybody declines, the proposal expires and starts nothing).
do $$
declare id1 uuid := current_setting('titan.su_id1')::uuid; r jsonb; p uuid;
begin
  perform pg_temp.as_user('d');
  r := pg_temp.suite(id1, 'propose', null, 'forge', 'reguliere', 7);
  p := (r->>'proposal')::uuid;
  perform pg_temp.as_user('e');
  r := pg_temp.suite(id1, 'decline', p);
  assert r->>'status' = 'open' and r->'started' = 'null'::jsonb, 'a refusal starts nothing';
  perform pg_temp.as_user(null);
  reset role;
  update private.titan_cordee_suites set created_at = now() - interval '4 days', expires_at = now() - interval '1 hour' where id = p;
  set local role authenticated;
  perform pg_temp.as_user('d');
  r := pg_temp.cordee(id1)->'suite';
  assert exists (select 1 from jsonb_array_elements(r->'proposals') x where x->>'id' = p::text and x->>'status' = 'expired' and x->'turn' = '[]'::jsonb),
    'the proposal expired: ' || r::text;
  assert pg_temp.val(format('select status || coalesce(started_id::text, %L) from private.titan_cordee_suites where id = %L', '-', p)) = 'expired-',
    'written as expired, nothing started';
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, %L)', id1, 'withdraw', p)) = 'SUITE_CLOSED', 'an expired proposal cannot be withdrawn';
end $$;

-- =========================================================================================== Cordée 4: alone, then too late.
do $$
declare id4 uuid := current_setting('titan.su_id4')::uuid; s jsonb;
begin
  perform pg_temp.as_user('a');
  s := pg_temp.cordee(id4)->'suite';
  assert s->'can' = '[]'::jsonb and s->>'hint' = 'alone', 'alone: nobody to propose to: ' || s::text;
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', id4, 'propose', 'aube', 'douce', 7)) = 'SUITE_GROUP_TOO_SMALL', 'too small';
  perform pg_temp.as_user(null);
  reset role;
  update public.titan_challenges set ends_at = now() - interval '15 days', starts_at = now() - interval '22 days' where id = current_setting('titan.su_id3')::uuid;
  set local role authenticated;
  perform pg_temp.as_user('f');
  assert pg_temp.err(format('select pg_temp.suite(%L, %L, null, %L, %L, %s)', current_setting('titan.su_id3')::uuid, 'propose', 'aube', 'douce', 7)) = 'SUITE_CLOSED',
    'the 14-day window is over';
  -- Withdrawing one's own proposal works with the flag closed.
  perform pg_temp.as_user(null);
  reset role;
  update private.titan_feature_flags set enabled = false where key = 'screens.cordee_suite';
  update private.titan_cordee_suites set status = 'open', resolved_at = null, expires_at = now() + interval '1 day'
   where from_id = current_setting('titan.su_id1')::uuid and route = 'forge';
  set local role authenticated;
  perform pg_temp.as_user('d');
  assert (pg_temp.suite(current_setting('titan.su_id1')::uuid, 'withdraw',
           pg_temp.val(format('select id from private.titan_cordee_suites where from_id = %L and route = %L', current_setting('titan.su_id1'), 'forge'))::uuid)->>'status') = 'withdrawn',
    'withdraw with the flag closed';
end $$;

-- Export, measure, erasure.
reset role;
do $$
declare x jsonb; m jsonb; id1 uuid := current_setting('titan.su_id1')::uuid;
begin
  x := private.titan_social_export_v1(pg_temp.uid('a'))->'cordeeSuites';
  assert exists (select 1 from jsonb_array_elements(x) j where j->>'role' = 'proposed') and exists (select 1 from jsonb_array_elements(x) j where j->>'role' = 'answered'),
    'a''s export lists its proposals and answers: ' || x::text;
  assert x::text !~ pg_temp.uid('b')::text and x::text !~ pg_temp.uid('c')::text, 'never another member';
  m := private.titan_cordee_suite_measure(now() - interval '30 days');
  assert (m->>'finishedGroups')::int >= 3 and (m->>'groupsBackWithin14Days')::int >= 2 and (m->>'declines')::int >= 3
     and (m->'members') <> '{}'::jsonb, 'the measure: ' || m::text;
  assert m::text !~ '[0-9a-f]{8}-[0-9a-f]{4}', 'counts only: ' || m::text;
  delete from auth.users where id = pg_temp.uid('b');
  assert exists (select 1 from private.titan_cordee_suites where from_id = id1 and proposed_by is null and status = 'started'),
    'the erased proposer leaves the group''s history with no person';
end $$;
rollback;
