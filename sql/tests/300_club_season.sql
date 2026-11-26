-- V1.8.4 — Saisons privées de club (migration 20261130104400). Synthetic accounts only, full rollback.
-- Club 1 (the scenario): o administers « Les Foulées du mardi » and launches four weeks of common practice. a, b, c and p choose to take
-- part (x, a member, never chooses and is never counted); three stages unlock with the group's active days; a's very trained month is
-- capped and never unlocks a stage alone; p pauses in the middle and the others read which stage is still in progress; n arrives during
-- the season, d arrives then leaves the club, b leaves the season: acquired days stay, stages already reached never re-lock. The season
-- ends; its private report is frozen and a later recomputation, a late session or an erased account change nothing. Below 3 participants
-- no total, goal, pause count or stage is given. A suspended member cannot join.
-- Club 2 (the organiser's role): a season that has not started is postponed twice, never a third time, then stopped (cancelled); only an
-- administrator does so; an erased participant of an open season leaves nothing behind.
begin;
create function pg_temp.as_user(k text) returns void language sql as
  $$ select set_config('request.jwt.claims', case when k is null then '{}' else json_build_object('sub', current_setting('titan.cs_' || k), 'role', 'authenticated')::text end, true) $$;
create function pg_temp.uid(k text) returns uuid language sql as $$ select current_setting('titan.cs_' || k)::uuid $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'no error'; exception when others then return sqlerrm; end $$;
create function pg_temp.act(p_club uuid, p_action text, p_title text default null, p_pace text default null, p_weeks integer default null,
  p_starts date default null, p_days integer default null) returns jsonb language sql as
  $$ select public.titan_club_season_act_v1(p_club, p_action, p_title, p_pace, p_weeks, p_starts, p_days) $$;
create function pg_temp.cur(p_club uuid) returns jsonb language sql as $$ select public.titan_club_season_v1(p_club)->'current' $$;
create function pg_temp.club(k text) returns uuid language sql as $$ select current_setting('titan.cs_club' || k)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated;

do $$
declare k text; v uuid;
begin
  foreach k in array array['o','a','b','c','d','p','n','x','z','e','out'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_cs_' || k, created_at = now() - interval '30 days' where id = v;
    perform set_config('titan.cs_' || k, v::text, true);
  end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.club_season', false, 100, 'QA')
    on conflict (key) do update set enabled = false, rollout = 100;
  assert not has_table_privilege('authenticated', 'private.titan_club_seasons', 'select')
     and not has_table_privilege('authenticated', 'private.titan_club_season_members', 'select')
     and not has_table_privilege('authenticated', 'private.titan_club_season_pauses', 'select'), 'no API grant on the season tables';
end $$;

set local role authenticated;
do $$
declare c1 uuid; c2 uuid; code1 text; code2 text; k text;
begin
  perform pg_temp.as_user('o');
  c1 := public.titan_club_create_v1('Les Foulées du mardi', 'Tous sports, tous niveaux.', false);
  c2 := public.titan_club_create_v1('Le club du dimanche', null, false);
  code1 := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = c1::text);
  code2 := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = c2::text);
  foreach k in array array['a','b','c','d','p','n','x','z'] loop perform pg_temp.as_user(k); perform public.titan_club_join_v1(code1, null); end loop;
  foreach k in array array['a','b','e'] loop perform pg_temp.as_user(k); perform public.titan_club_join_v1(code2, null); end loop;
  perform set_config('titan.cs_club1', c1::text, true);
  perform set_config('titan.cs_club2', c2::text, true);
end $$;

-- Permissions, flag and inputs.
do $$
declare c1 uuid := pg_temp.club('1'); today date := (now() at time zone 'Europe/Paris')::date; r jsonb;
begin
  perform pg_temp.as_user('o');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 4, %L)', c1, 'create', 'Quatre semaines ensemble', 'reguliere', today)) = 'FEATURE_DISABLED', 'flag closed: no creation';
  r := public.titan_club_season_v1(c1);
  assert r->'current' = 'null'::jsonb and (r->>'canCreate')::boolean and r->>'role' = 'organizer', 'the administrator is the organiser: '||r::text;
  perform pg_temp.as_user('a');
  assert public.titan_club_season_v1(c1)->>'role' = 'member' and not (public.titan_club_season_v1(c1)->>'canCreate')::boolean, 'a member is not an organiser';
  perform pg_temp.as_user('out');
  assert pg_temp.err(format('select public.titan_club_season_v1(%L)', c1)) = 'CLUB_NOT_FOUND', 'outside the club: nothing';
end $$;
reset role;
update private.titan_feature_flags set enabled = true where key = 'screens.club_season';
set local role authenticated;
do $$
declare c1 uuid := pg_temp.club('1'); today date := (now() at time zone 'Europe/Paris')::date; r jsonb; v jsonb;
begin
  perform pg_temp.as_user('a');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 4, %L)', c1, 'create', 'Ma saison', 'reguliere', today)) = 'CLUB_ADMIN_REQUIRED', 'only an administrator creates';
  perform pg_temp.as_user('o');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 4, %L)', c1, 'create', 'ab', 'reguliere', today)) = 'SEASON_INVALID', 'a title of three characters';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 9, %L)', c1, 'create', 'Trop longue', 'reguliere', today)) = 'SEASON_INVALID', '8 weeks at most';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 4, %L)', c1, 'create', 'Hier', 'reguliere', today - 1)) = 'SEASON_INVALID', 'no start in the past';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 4, %L)', c1, 'create', 'Allure', 'folle', today)) = 'SEASON_INVALID', 'a tested pace only';
  r := pg_temp.act(c1, 'create', '  Quatre <b>semaines</b> ensemble ', 'reguliere', 4, today);
  v := r->'current';
  assert v->>'title' = 'Quatre bsemaines/b ensemble' and v->>'phase' = 'running' and (v->>'weeks')::integer = 4 and (v->>'perWeek')::integer = 3, 'created, running from today: '||v::text;
  -- EXPLICIT PARTICIPATION: creating the season adds nobody, not even the organiser.
  assert (v->>'participants')::integer = 0 and v->'me' = 'null'::jsonb and v->'can' @> '["join", "stop"]'::jsonb, 'nobody is added: '||v::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 4, %L)', c1, 'create', 'Une autre', 'douce', today)) = 'SEASON_OPEN', 'one season at a time';
  perform pg_temp.as_user('x');
  v := pg_temp.cur(c1);
  assert v->'can' = '["join"]'::jsonb and v->'me' = 'null'::jsonb, 'a member who has not chosen only sees the invitation to join';
  -- Two participants: under the threshold, no aggregate.
  perform pg_temp.as_user('a'); perform pg_temp.act(c1, 'join');
  perform pg_temp.as_user('b'); v := pg_temp.act(c1, 'join')->'current';
  assert (v->>'participants')::integer = 2 and not (v->>'visible')::boolean and v->'total' = 'null'::jsonb and v->'target' = 'null'::jsonb
     and v->'paused' = 'null'::jsonb and v->'contributors' = 'null'::jsonb and v->'next' = 'null'::jsonb
     and v->'stages' = '[{"n":1},{"n":2},{"n":3}]'::jsonb, 'two participants: no total, goal, pause count or stage: '||v::text;
  assert v->'me'->>'status' = 'active' and (v->'me'->>'cap')::integer = 18 and (v->'me'->>'share')::integer = 12 and v->'can' = '["pause", "leave"]'::jsonb,
    'one''s own part is always readable (share 3 × 4 weeks, cap 1.5 × share): '||(v->'me')::text;
  assert (pg_temp.act(c1, 'join')->'current'->>'participants')::integer = 2, 'joining twice is idempotent';
  perform pg_temp.as_user('c'); perform pg_temp.act(c1, 'join');
  perform pg_temp.as_user('p'); v := pg_temp.act(c1, 'join')->'current';
  assert (v->>'participants')::integer = 4 and (v->>'visible')::boolean and (v->>'target')::integer = 48 and (v->>'total')::integer = 0
     and v->'stages'->0->>'threshold' = '16' and v->'stages'->0 ? 'reachedAt' and not v->'stages'->0 ? 'due', 'four participants: the group reads its goal: '||v::text;
  perform pg_temp.as_user(null);
end $$;
reset role;
update public.profiles set is_suspended = true where id = pg_temp.uid('z');
set local role authenticated;
do $$
declare c1 uuid := pg_temp.club('1'); v jsonb;
begin
  perform pg_temp.as_user('z');
  v := pg_temp.cur(c1);
  assert v->'can' = '[]'::jsonb and (v->>'suspended')::boolean, 'a suspended member is offered nothing';
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', c1, 'join')) = 'ACCOUNT_SUSPENDED', 'and cannot join';
  perform pg_temp.as_user('o');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, null, null, null, null, 7)', c1, 'postpone')) = 'SEASON_STARTED', 'a running season is not postponed';
end $$;

-- Time passes: the season started 25 days ago and ends in 3 days. a trains every day; nobody else has recorded anything yet.
reset role;
do $$
declare s uuid; a uuid := pg_temp.uid('a'); i integer; held uuid := gen_random_uuid();
begin
  select id into s from private.titan_club_seasons where club_id = pg_temp.club('1') and status = 'open';
  perform set_config('titan.cs_s1', s::text, true);
  update private.titan_club_seasons set starts_at = now() - interval '25 days', ends_at = now() + interval '3 days' where id = s;
  update private.titan_club_season_members set joined_at = now() - interval '25 days' where season_id = s;
  set local session_replication_role = replica;
  for i in 1..24 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (a, 'running', 8, 'km', 10, now() - make_interval(days => i), '{"serverReward":true,"effort":{"effort_minutes":45}}', now() - make_interval(days => i));
  end loop;
  -- Never counted: a session before the season, a held reward, a session the server never stamped, x who did not choose to take part.
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (pg_temp.uid('b'), 'swimming', 1, 'km', 10, now() - interval '27 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '27 days'),
    (pg_temp.uid('c'), 'climbing', 1, 'session', 10, now() - interval '12 days', '{"effort":{"effort_minutes":60}}', now() - interval '12 days'),
    (pg_temp.uid('x'), 'running', 5, 'km', 10, now() - interval '3 days', '{"serverReward":true,"effort":{"effort_minutes":50}}', now() - interval '3 days');
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at)
  values (held, pg_temp.uid('c'), 'climbing', 1, 'session', 10, now() - interval '11 days', '{"serverReward":true,"effort":{"effort_minutes":60}}', now() - interval '11 days');
  insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at) values (held, pg_temp.uid('c'), 10, 1, now() + interval '1 day');
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare c1 uuid := pg_temp.club('1'); v jsonb;
begin
  perform pg_temp.as_user('a');
  v := pg_temp.cur(c1);
  -- 24 active days, counted up to the cap of 18; one contributor: the total passes the first stage but no single account unlocks it.
  assert (v->'me'->>'days')::integer = 18 and (v->'me'->>'capped')::boolean, 'the individual cap: '||(v->'me')::text;
  assert (v->>'total')::integer = 18 and (v->>'target')::integer = 48 and (v->>'contributors')::integer = 1
     and v->'stages'->0->'reachedAt' = 'null'::jsonb and (v->>'next')::integer = 1, 'one account alone never unlocks a stage: '||v::text;
end $$;

-- The others contribute, each with another discipline; p pauses a week ago and trains during the pause (not counted).
reset role;
do $$
declare s uuid := current_setting('titan.cs_s1')::uuid; i integer;
begin
  set local session_replication_role = replica;
  for i in 15..20 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (pg_temp.uid('b'), 'swimming', 1, 'km', 10, now() - make_interval(days => i), '{"serverReward":true,"effort":{"effort_minutes":15}}', now() - make_interval(days => i));
  end loop;
  for i in 6..10 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (pg_temp.uid('c'), 'climbing', 1, 'session', 10, now() - make_interval(days => i), '{"serverReward":true,"effort":{"effort_minutes":60}}', now() - make_interval(days => i));
  end loop;
  -- A day of b below 12 counted minutes is not an active day.
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (pg_temp.uid('b'), 'swimming', 1, 'km', 10, now() - interval '14 days', '{"serverReward":true,"effort":{"effort_minutes":8}}', now() - interval '14 days');
  for i in 22..24 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (pg_temp.uid('p'), 'yoga', 1, 'session', 10, now() - make_interval(days => i), '{"serverReward":true,"effort":{"effort_minutes":30}}', now() - make_interval(days => i));
  end loop;
  for i in 4..5 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (pg_temp.uid('p'), 'yoga', 1, 'session', 10, now() - make_interval(days => i), '{"serverReward":true,"effort":{"effort_minutes":30}}', now() - make_interval(days => i));
  end loop;
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare c1 uuid := pg_temp.club('1'); v jsonb;
begin
  perform pg_temp.as_user('p');
  v := pg_temp.act(c1, 'pause')->'current';
  assert v->'me'->>'status' = 'paused' and v->'can' = '["resume", "leave"]'::jsonb, 'p paused: '||(v->'me')::text;
end $$;
reset role;
-- The pause started a week ago (the server stamps « now »; the test moves it back to the middle of the season).
update private.titan_club_season_pauses set paused_at = now() - interval '7 days' where user_id = pg_temp.uid('p');
set local role authenticated;
do $$
declare c1 uuid := pg_temp.club('1'); v jsonb; v2 jsonb; s uuid := current_setting('titan.cs_s1')::uuid;
begin
  perform pg_temp.as_user('c');
  v := pg_temp.cur(c1);
  -- a 18 (capped) + b 6 + c 5 (the held and the unstamped sessions excluded) + p 3 (the two sessions of the pause excluded) = 32.
  -- Goal: a, b, c 12 each; p's open pause frees the rest of her share: 3 × 18 days / 7 → 8. 44 → stages at 15, 30 and 44.
  assert (v->>'total')::integer = 32 and (v->>'target')::integer = 44 and (v->>'contributors')::integer = 4, 'progress from confirmed sessions only: '||v::text;
  assert v->'stages'->0->>'reachedAt' is not null and v->'stages'->1->>'reachedAt' is not null and v->'stages'->2->'reachedAt' = 'null'::jsonb
     and (v->>'next')::integer = 3 and (v->>'paused')::integer = 1, 'two stages reached; with one member paused, the others read that stage 3 is in progress: '||v::text;
  assert v->'me'->>'days' = '5' and v->'me'->>'share' = '12', 'c reads her own days';
  assert v::text !~ 'qa_cs_' and v::text !~ (pg_temp.uid('a'))::text, 'never a name or an account of another member';
  -- SAME INPUTS, SAME RESULT: the state computed twice is identical, and reading again freezes nothing new.
  v2 := pg_temp.cur(c1);
  assert v = v2, 'a second reading gives the same state';
end $$;
reset role;
do $$
declare s uuid := current_setting('titan.cs_s1')::uuid;
begin
  assert private.titan_club_season_state(s, null) = private.titan_club_season_state(s, null), 'an identical recomputation gives the same result';
  assert jsonb_array_length((select stages from private.titan_club_seasons where id = s)) = 2, 'two stages frozen with their date';
end $$;
set local role authenticated;

-- Changes of the group: n arrives with three days left, d arrived 12 days ago and leaves the club, b leaves the season.
do $$
declare c1 uuid := pg_temp.club('1'); v jsonb;
begin
  perform pg_temp.as_user('n');
  v := pg_temp.act(c1, 'join')->'current';
  -- n's share and cap are prorated to the three days left: 3 × 3 / 7 → 2. The goal rises to 46 (stages at 16, 31, 46): reached ones stay.
  assert v->'me'->>'share' = '2' and v->'me'->>'cap' = '2' and (v->>'target')::integer = 46 and (v->>'total')::integer = 32
     and v->'stages'->1->>'reachedAt' is not null and (v->>'participants')::integer = 5, 'an arrival never re-locks a stage: '||v::text;
  perform pg_temp.as_user('d');
  perform pg_temp.act(c1, 'join');
end $$;
reset role;
do $$
declare i integer;
begin
  update private.titan_club_season_members set joined_at = now() - interval '12 days' where user_id = pg_temp.uid('d');
  set local session_replication_role = replica;
  for i in 10..11 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (pg_temp.uid('d'), 'cycling', 10, 'km', 10, now() - make_interval(days => i), '{"serverReward":true,"effort":{"effort_minutes":30}}', now() - make_interval(days => i));
  end loop;
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare c1 uuid := pg_temp.club('1'); v jsonb; before jsonb;
begin
  perform pg_temp.as_user('d');
  assert pg_temp.cur(c1)->'me'->>'days' = '2', 'd brought two days';
  perform public.titan_club_leave_v1(c1);
  perform pg_temp.as_user('b');
  before := pg_temp.cur(c1);
  assert (before->>'total')::integer = 34 and (before->>'participants')::integer = 5, 'd left the club: his two days stay with the group, he is no longer counted in: '||before::text;
  v := pg_temp.act(c1, 'leave')->'current';
  assert v->'me'->>'status' = 'left' and v->'can' = '[]'::jsonb and (v->>'total')::integer = 34 and (v->>'participants')::integer = 4
     and v->'stages'->1->>'reachedAt' is not null, 'b leaves the season: his six days stay, nothing re-locks: '||v::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', c1, 'join')) = 'SEASON_LEFT', 'leaving is final for the season (a pause is the way back)';
  perform pg_temp.as_user('p');
  v := pg_temp.act(c1, 'resume')->'current';
  assert v->'me'->>'status' = 'active' and (v->>'paused')::integer = 0, 'p resumes';
end $$;
reset role;
do $$
declare s uuid := current_setting('titan.cs_s1')::uuid;
begin
  assert (select left_at is not null from private.titan_club_season_members where season_id = s and user_id = pg_temp.uid('d')), 'leaving the club ended the participation';
end $$;

-- The season ends. Its report is frozen once, with the stages reached; nothing written later changes it.
do $$
declare s uuid := current_setting('titan.cs_s1')::uuid; expected jsonb;
begin
  update private.titan_club_seasons set ends_at = now() - interval '1 second' where id = s;
  expected := private.titan_club_season_state(s, null);
  perform set_config('titan.cs_expected', expected::text, true);
end $$;
set local role authenticated;
do $$
declare c1 uuid := pg_temp.club('1'); r jsonb; l jsonb; e jsonb := current_setting('titan.cs_expected')::jsonb;
begin
  perform pg_temp.as_user('a');
  r := public.titan_club_season_v1(c1);
  l := r->'last';
  assert r->'current' = 'null'::jsonb and (r->>'canCreate') is not null, 'the season is closed: '||r::text;
  assert l->>'phase' = 'closed' and (l->>'visible')::boolean and (l->>'total')::integer = (e->>'total')::integer and (l->>'target')::integer = (e->>'target')::integer
     and (l->>'reached')::integer = 2 and (l->>'participants')::integer = 4 and (l->'me'->>'days')::integer = 18,
    'the private report equals the last computed state: '||l::text||' vs '||e::text;
  assert l::text !~ 'qa_cs_' and not l ? 'ranking' and not l ? 'members', 'a report of milestones, never a ranking or a name';
  perform pg_temp.as_user('x');
  l := public.titan_club_season_v1(c1)->'last';
  assert l->'me' = 'null'::jsonb and (l->>'total')::integer = (e->>'total')::integer, 'every member of the club reads the report; x took no part';
  perform pg_temp.as_user('o');
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', c1, 'stop')) = 'SEASON_NOT_FOUND', 'a closed season is not stopped again';
end $$;
reset role;
do $$
declare s uuid := current_setting('titan.cs_s1')::uuid; before jsonb;
begin
  before := (select summary from private.titan_club_seasons where id = s);
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (pg_temp.uid('c'), 'climbing', 1, 'session', 10, now() - interval '2 days', '{"serverReward":true,"effort":{"effort_minutes":60}}', now());
  set local session_replication_role = origin;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('c'), 'role', 'authenticated')::text, true);
  perform public.titan_club_season_v1(pg_temp.club('1'));
  assert (select summary from private.titan_club_seasons where id = s) = before, 'a late session does not change the frozen report';
  -- The export: own participation and pauses only; the organiser's seasons.
  assert jsonb_array_length(private.titan_social_export_v1(pg_temp.uid('p'))->'clubSeasons') = 1
     and jsonb_array_length(private.titan_social_export_v1(pg_temp.uid('p'))->'clubSeasons'->0->'pauses') = 1
     and private.titan_social_export_v1(pg_temp.uid('p'))::text !~ (pg_temp.uid('a'))::text, 'p exports her participation and her pause, nothing of a';
  assert private.titan_social_export_v1(pg_temp.uid('o'))->'clubSeasons'->0->>'role' = 'organised', 'the organiser exports the seasons they organised';
  -- No XP, credit or title from a season.
  assert not exists (select 1 from private.titan_social_export_v1(pg_temp.uid('a')) x where x::text ~ '"xp"'), 'nothing granted';
  -- Erasing the organiser and a participant keeps the report as it was.
  delete from auth.users where id in (pg_temp.uid('o'), pg_temp.uid('d'));
  assert (select summary from private.titan_club_seasons where id = s) = before and (select created_by from private.titan_club_seasons where id = s) is null,
    'the report outlives the erased accounts';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- Club 2: postpone, the limit, the controlled stop before the start, an erased participant of an open season.
reset role;
insert into private.titan_club_members (club_id, user_id, role) values (pg_temp.club('2'), pg_temp.uid('a'), 'admin')
  on conflict (club_id, user_id) do update set role = 'admin';
set local role authenticated;
do $$
declare c2 uuid := pg_temp.club('2'); today date := (now() at time zone 'Europe/Paris')::date; v jsonb; r jsonb; s0 timestamptz;
begin
  perform pg_temp.as_user('a');
  v := pg_temp.act(c2, 'create', 'Saison d''hiver', 'douce', 2, today + 7)->'current';
  s0 := (v->>'startsAt')::timestamptz;
  assert v->>'phase' = 'upcoming' and v->'can' @> '["join", "postpone", "stop"]'::jsonb and (v->>'perWeek')::integer = 2, 'an upcoming season: '||v::text;
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, null, null, null, null, 7)', c2, 'postpone')) = 'CLUB_ADMIN_REQUIRED', 'a member does not postpone';
  perform pg_temp.act(c2, 'join');
  perform pg_temp.as_user('e');
  perform pg_temp.act(c2, 'join');
  perform pg_temp.as_user('a');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, null, null, null, null, 3)', c2, 'postpone')) = 'SEASON_INVALID', 'postponed by 7 or 14 days';
  v := pg_temp.act(c2, 'postpone', null, null, null, null, 7)->'current';
  assert (v->>'startsAt')::timestamptz = s0 + interval '7 days' and (v->>'postponed')::integer = 1 and (v->>'participants')::integer = 2, 'postponed once, participants kept: '||v::text;
  v := pg_temp.act(c2, 'postpone', null, null, null, null, 14)->'current';
  assert (v->>'startsAt')::timestamptz = s0 + interval '21 days' and not v->'can' @> '["postpone"]'::jsonb, 'postponed twice';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, null, null, null, null, 7)', c2, 'postpone')) = 'SEASON_POSTPONE_LIMIT', 'never a third time';
end $$;
reset role;
-- An erased participant of an open season leaves nothing behind (the club-membership trigger is no obstacle).
delete from auth.users where id = pg_temp.uid('e');
set local role authenticated;
do $$
declare c2 uuid := pg_temp.club('2'); r jsonb;
begin
  perform pg_temp.as_user('a');
  assert (pg_temp.cur(c2)->>'participants')::integer = 1, 'the erased participant is gone';
  r := pg_temp.act(c2, 'stop');
  assert r->'current' = 'null'::jsonb and r->'last'->>'phase' = 'cancelled' and (r->>'canCreate')::boolean, 'stopped before the start: cancelled: '||r::text;
  perform pg_temp.as_user(null);
end $$;
reset role;
-- One transaction has one « now »: the cancelled season is dated a minute earlier so that the next one is the last.
update private.titan_club_seasons set stopped_at = stopped_at - interval '1 minute' where club_id = pg_temp.club('2') and status = 'stopped';
set local role authenticated;
do $$
declare c2 uuid := pg_temp.club('2'); r jsonb;
begin
  perform pg_temp.as_user('a');
  r := pg_temp.act(c2, 'create', 'Saison de printemps', 'soutenue', 3, (now() at time zone 'Europe/Paris')::date);
  assert r->'current'->>'phase' = 'running' and (r->'current'->>'perWeek')::integer = 4, 'a new season can follow';
  r := pg_temp.act(c2, 'stop');
  assert r->'last'->>'phase' = 'stopped' and r->'current' = 'null'::jsonb, 'a controlled stop of a running season freezes its report';
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', c2, 'pause')) = 'SEASON_NOT_FOUND', 'nothing left to pause';
end $$;

-- The measure of the pilot: counts only.
reset role;
do $$
declare m jsonb := private.titan_club_season_measure(now() - interval '60 days');
begin
  assert (m->>'seasonsStarted')::integer = 2 and (m->>'stagesHeld')::integer = 2 and (m->'byStage'->>'2')::integer = 1 and (m->>'finished')::integer = 2
     and (m->>'activeLastWeek')::integer = 1 and (m->>'cancelledBeforeStart')::integer = 1 and (m->>'stoppedEarly')::integer = 1, 'the measure: '||m::text;
  assert m::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-', 'numbers only';
end $$;
rollback;
