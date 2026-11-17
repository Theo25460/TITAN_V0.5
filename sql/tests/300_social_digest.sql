-- Social excellence, lot D — « Depuis ta dernière visite » (migration 20261120120000). Synthetic accounts only, full rollback.
-- Covered: only Moments friends chose to share (not private ones, not strangers', not a blocked friend's), encouragements from friends,
-- requests received in the window, friends active only when they allow it and only from confirmed sessions, the Duo invitation,
-- a running cordée and the suggestion of a pace that fits the last 28 days, the window clamped, an empty digest for a newcomer.
begin;
do $$
declare k text; v uuid;
begin
  foreach k in array array['a','b','c','s','n'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_dg_' || k, privacy = '{"publicProfile":true}' where id = v;
    perform set_config('titan.dg_' || k, v::text, true);
  end loop;
  -- b allows presence, c does not; s is a stranger; n a newcomer with nothing.
  update public.profiles set privacy = '{"publicProfile":true,"socialPresence":true}' where id = current_setting('titan.dg_b')::uuid;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.cordee', true, 100, 'QA'), ('screens.buddy', true, 100, 'QA')
    on conflict (key) do update set enabled = true, rollout = 100;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.dg_a'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values
    (current_setting('titan.dg_a')::uuid, current_setting('titan.dg_b')::uuid, 'accepted'),
    (current_setting('titan.dg_a')::uuid, current_setting('titan.dg_c')::uuid, 'accepted');
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.dg_s'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values (current_setting('titan.dg_s')::uuid, current_setting('titan.dg_a')::uuid, 'pending');
  perform set_config('request.jwt.claims', '{}', true);
  set local session_replication_role = replica;
  -- b and c trained yesterday (confirmed); a trained on 5 days of the last 28.
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (current_setting('titan.dg_b')::uuid, 'swimming', 1, 'km', 10, now() - interval '1 day', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '1 day'),
    (current_setting('titan.dg_c')::uuid, 'running', 5, 'km', 10, now() - interval '1 day', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '1 day');
  for k in select generate_series(2, 10, 2)::text loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (current_setting('titan.dg_a')::uuid, 'yoga', 1, 'session', 10, now() - make_interval(days => k::int), '{"serverReward":true,"effort":{"effort_minutes":30}}', now() - make_interval(days => k::int));
  end loop;
  set local session_replication_role = origin;
end $$;

set local role authenticated;
do $$
declare a uuid := current_setting('titan.dg_a')::uuid; b uuid := current_setting('titan.dg_b')::uuid; c uuid := current_setting('titan.dg_c')::uuid;
  s uuid := current_setting('titan.dg_s')::uuid; n uuid := current_setting('titan.dg_n')::uuid; r jsonb; mine uuid; xp0 integer; cr0 integer;
begin
  -- b shares a Moment for friends and a private one; s (stranger) shares one; a shares one that b and s try to cheer.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_moment_share('record', 'Premier 1 500 m', null, 'swimming', null, 'friends');
  perform public.titan_moment_share('session', 'Séance privée', null, null, null, 'private');
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform public.titan_moment_share('record', 'Moment d’un inconnu', null, null, null, 'friends');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  mine := (public.titan_moment_share('goal', 'Objectif tenu', null, null, null, 'friends')->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_moment_cheer(mine);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_buddy_invite_v1(a);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  r := public.titan_social_digest_v1(now() - interval '2 days');
  assert (r->'friendMoments'->>'count')::int = 1 and r->'friendMoments'->'latest'->0->>'title' = 'Premier 1 500 m' and r->'friendMoments'->'latest'->0->>'author' = 'qa_dg_b',
    'only the Moment a friend shared with friends: ' || r::text;
  assert r::text not like '%Séance privée%' and r::text not like '%inconnu%', 'no private Moment, no stranger';
  assert (r->>'cheersReceived')::int = 1, 'one encouragement from a friend';
  assert (r->>'requestsIn')::int = 1, 'one request received';
  assert r->'friendsActive' = '["qa_dg_b"]'::jsonb, 'only the friend who allows presence: ' || (r->'friendsActive')::text;
  assert r->'duo'->>'status' = 'invited' and r->'duo'->>'partner' = 'qa_dg_b', 'the Duo invitation is there';
  assert r->'suggestion'->>'pace' = 'douce' and (r->'suggestion'->>'activeDays28')::int = 5 and (r->'suggestion'->>'friends')::int = 2,
    'a gentle pace for five active days: ' || (r->'suggestion')::text;
  assert (r->>'since')::timestamptz between now() - interval '2 days 1 minute' and now() - interval '2 days' + interval '1 minute', 'the window is the one asked';
  assert (public.titan_social_digest_v1(now() - interval '400 days')->>'since')::timestamptz >= now() - interval '30 days 1 minute', 'clamped to 30 days';
  assert (public.titan_social_digest_v1(now())->>'since')::timestamptz <= now() - interval '1 hour', 'at least one hour';

  -- With a running cordée the suggestion disappears and the cordée is summarised.
  perform public.titan_cordee_create_v1('marees', 'douce', 7, array[b]);
  r := public.titan_social_digest_v1(now() - interval '2 days');
  assert r->'suggestion' = 'null'::jsonb and jsonb_array_length(r->'cordees') = 1 and r->'cordees'->0->>'route' = 'marees', 'the cordée replaces the suggestion: ' || r::text;

  -- A blocked friend's Moments leave the digest.
  perform public.titan_block_user(b, null);
  r := public.titan_social_digest_v1(now() - interval '2 days');
  assert (r->'friendMoments'->>'count')::int = 0 and r->'friendsActive' = '[]'::jsonb and (r->>'cheersReceived')::int = 0, 'nothing of a blocked friend: ' || r::text;
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';

  -- A newcomer gets an empty digest (and the suggestion of a gentle pace).
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
  r := public.titan_social_digest_v1(null);
  assert (r->'friendMoments'->>'count')::int = 0 and (r->>'requestsIn')::int = 0 and jsonb_array_length(r->'cordees') = 0 and r->'duo'->>'status' is null
     and r->'suggestion'->>'pace' = 'douce' and (r->'suggestion'->>'friends')::int = 0, 'a newcomer: nothing but a gentle suggestion: ' || r::text;
end $$;
rollback;
