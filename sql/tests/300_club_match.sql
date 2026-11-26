-- V1.8.5 — Rencontres entre clubs (migration 20261130104500). Synthetic accounts only, full rollback.
-- Match 1 (the scenario, cooperation): « Les Rouleurs » (cycling, administered by hv) proposes one week to « Multisport du parc »
-- (administered by hm), who previews the code and accepts. 9 cyclists and 3 multisport members choose to take part (m4 never chooses
-- and is never counted; z is suspended). Sizes 9 against 3, comparable completion → close rates; v1 and m1 train every day and count
-- only their own share; the other club reads names of clubs, numbers of participants and rates only, as of the last midnight; a session
-- invalidated after the fact and withdrawals (from the meeting and from the club) move the score by the published rule only. The end
-- freezes the recap; a late session, a recomputation and erased accounts change nothing. Answers feed the pilot's measure.
-- Match 2 (comparison, flag closed then open): two weeks only, equality under 5 points, then a club falls under 3: no result.
-- Match 3 (organisers): refused, expired, withdrawn, cancelled before the start, abandoned while running; a code needs another organiser.
begin;
create function pg_temp.as_user(k text) returns void language sql as
  $$ select set_config('request.jwt.claims', case when k is null then '{}' else json_build_object('sub', current_setting('titan.cm_' || k), 'role', 'authenticated')::text end, true) $$;
create function pg_temp.uid(k text) returns uuid language sql as $$ select current_setting('titan.cm_' || k)::uuid $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'no error'; exception when others then return sqlerrm; end $$;
create function pg_temp.act(p_club uuid, p_action text, p_format text default null, p_pace text default null, p_weeks integer default null,
  p_starts date default null, p_match uuid default null, p_clear boolean default null, p_again boolean default null) returns jsonb language sql as
  $$ select public.titan_club_match_act_v1(p_club, p_action, p_format, p_pace, p_weeks, p_starts, p_match, p_clear, p_again) $$;
create function pg_temp.view(p_club uuid) returns jsonb language sql as $$ select public.titan_club_match_v1(p_club) $$;
create function pg_temp.cur(p_club uuid) returns jsonb language sql as $$ select public.titan_club_match_v1(p_club)->'current' $$;
create function pg_temp.club(k text) returns uuid language sql as $$ select current_setting('titan.cm_club' || k)::uuid $$;
create function pg_temp.keys(j jsonb) returns text language sql as $$ select string_agg(k, ',' order by k) from jsonb_object_keys(j) k $$;
-- True when the text holds no account identifier of the scenario (and no username).
create function pg_temp.anonymous(t text) returns boolean language sql as
  $$ select t !~ 'qa_cm_' and not exists (select 1 from unnest(string_to_array(current_setting('titan.cm_all'), ',')) u where t like '%' || u || '%') $$;
create function pg_temp.mid() returns timestamptz language sql as $$ select (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris' $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Europe/Paris')::date $$;
-- A confirmed session at noon, k days before today (Paris).
create function pg_temp.log(k text, days_ago integer, minutes integer, sport text default 'cycling') returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); at timestamptz := pg_temp.mid() - make_interval(days => days_ago) + interval '12 hours';
begin
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at)
  values (v, pg_temp.uid(k), sport, 1, 'session', 10, at, jsonb_build_object('serverReward', true, 'effort', jsonb_build_object('effort_minutes', minutes)), at);
  return v;
end $$;
-- Everything here happens in one transaction (one now()): a recap that ended « earlier » is aged so that the latest one is unambiguous.
create function pg_temp.age(p_match uuid) returns void language sql security definer as
  $$ update private.titan_club_matches set ended_at = ended_at - interval '1 hour' where id = p_match $$;
grant execute on all functions in schema pg_temp to authenticated;

do $$
declare k text; v uuid; ids text[] := '{}';
begin
  foreach k in array array['hv','v1','v2','v3','v4','v5','v6','v7','v8','v9','hm','m1','m2','m3','m4','z','hx','hy','x1','x2','x3','out'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_cm_' || k, created_at = now() - interval '30 days' where id = v;
    perform set_config('titan.cm_' || k, v::text, true);
    ids := ids || v::text;
  end loop;
  perform set_config('titan.cm_all', array_to_string(ids, ','), true);
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.club_match', false, 100, 'QA'), ('screens.club_match_versus', false, 100, 'QA')
    on conflict (key) do update set enabled = false, rollout = 100;
  assert not has_table_privilege('authenticated', 'private.titan_club_matches', 'select')
     and not has_table_privilege('authenticated', 'private.titan_club_match_members', 'select'), 'no API grant on the meeting tables';
  assert not has_function_privilege('anon', 'public.titan_club_match_v1(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.titan_club_match_measure(timestamptz)', 'execute'), 'nothing for anon, no measure for players';
end $$;

set local role authenticated;
do $$
declare cv uuid; cm uuid; cx uuid; cy uuid; code text; k text;
begin
  perform pg_temp.as_user('hv'); cv := public.titan_club_create_v1('Les Rouleurs', 'Club vélo.', false);
  code := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = cv::text);
  foreach k in array array['v1','v2','v3','v4','v5','v6','v7','v8','v9'] loop perform pg_temp.as_user(k); perform public.titan_club_join_v1(code, null); end loop;
  perform pg_temp.as_user('hm'); cm := public.titan_club_create_v1('Multisport du parc', 'Course, natation, escalade.', false);
  code := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = cm::text);
  foreach k in array array['m1','m2','m3','m4','z'] loop perform pg_temp.as_user(k); perform public.titan_club_join_v1(code, null); end loop;
  perform pg_temp.as_user('hx'); cx := public.titan_club_create_v1('Les Grimpeurs', null, false);
  code := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = cx::text);
  foreach k in array array['x1','x2','x3'] loop perform pg_temp.as_user(k); perform public.titan_club_join_v1(code, null); end loop;
  perform pg_temp.as_user('hx'); cy := public.titan_club_create_v1('Le second club de hx', null, false);
  perform set_config('titan.cm_clubV', cv::text, true); perform set_config('titan.cm_clubM', cm::text, true);
  perform set_config('titan.cm_clubX', cx::text, true); perform set_config('titan.cm_clubY', cy::text, true);
end $$;

-- ===================================================================================== Match 1: cooperation, 9 against 3.
do $$
declare cv uuid := pg_temp.club('V'); r jsonb;
begin
  perform pg_temp.as_user('hv');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 1, %L)', cv, 'propose', 'cooperation', 'reguliere', pg_temp.today() + 1)) = 'FEATURE_DISABLED', 'flag closed: no proposal';
  r := pg_temp.view(cv);
  assert r->'current' = 'null'::jsonb and (r->>'canPropose')::boolean and r->>'role' = 'organizer' and r->'formats' = '["cooperation"]'::jsonb, 'organiser, cooperation only: '||r::text;
  perform pg_temp.as_user('out');
  assert pg_temp.err(format('select public.titan_club_match_v1(%L)', cv)) = 'CLUB_NOT_FOUND', 'outside the club: nothing';
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
update private.titan_feature_flags set enabled = true where key = 'screens.club_match';
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); r jsonb; v jsonb; p jsonb; code text;
begin
  perform pg_temp.as_user('v1');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 1, %L)', cv, 'propose', 'cooperation', 'reguliere', pg_temp.today() + 1)) = 'CLUB_ADMIN_REQUIRED', 'only an administrator proposes';
  perform pg_temp.as_user('hv');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 1, %L)', cv, 'propose', 'cooperation', 'reguliere', pg_temp.today())) = 'MATCH_INVALID', 'the start is tomorrow at the earliest';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 3, %L)', cv, 'propose', 'cooperation', 'reguliere', pg_temp.today() + 1)) = 'MATCH_INVALID', 'one or two weeks';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 1, %L)', cv, 'propose', 'cooperation', 'folle', pg_temp.today() + 1)) = 'MATCH_INVALID', 'a tested pace only';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 2, %L)', cv, 'propose', 'versus', 'reguliere', pg_temp.today() + 1)) = 'VERSUS_CLOSED', 'the comparative format is closed';
  r := pg_temp.act(cv, 'propose', 'cooperation', 'reguliere', 1, pg_temp.today() + 1);
  v := r->'current';
  code := v->>'code';
  assert v->>'phase' = 'proposed' and code ~ '^[A-Z2-9]{8}$' and v->'them' = 'null'::jsonb and v->'can' = '["stop"]'::jsonb and not (r->>'canPropose')::boolean,
    'proposed with a code for the organisers: '||v::text;
  assert extract(epoch from (v->>'endsAt')::timestamptz - (v->>'startsAt')::timestamptz) = 7 * 86400 and ((v->>'startsAt')::timestamptz at time zone 'Europe/Paris')::time = '00:00', 'seven Paris days from midnight';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 1, %L)', cv, 'propose', 'cooperation', 'douce', pg_temp.today() + 2)) = 'MATCH_OPEN', 'one meeting at a time';
  perform set_config('titan.cm_code1', code, true);
  perform pg_temp.as_user('v1');
  assert pg_temp.cur(cv) = 'null'::jsonb, 'a member does not read a proposal not yet accepted';
  -- The preview: an administrator of the other club reads the parameters and the name of the proposing club, nothing else.
  perform pg_temp.as_user('m1');
  assert pg_temp.err(format('select public.titan_club_match_preview_v1(%L, %L)', cm, code)) = 'CLUB_ADMIN_REQUIRED', 'a member does not answer for the club';
  perform pg_temp.as_user('hm');
  assert public.titan_club_match_preview_v1(cm, 'ZZZZZZZZ') is null, 'an unknown code: nothing, and no error (the limiter keeps its count)';
  p := public.titan_club_match_preview_v1(cm, lower(substr(code, 1, 4)) || '-' || substr(code, 5));
  assert p->>'host' = 'Les Rouleurs' and p->>'format' = 'cooperation' and (p->>'weeks')::integer = 1 and (p->>'goal')::integer = 60 and not (p->>'self')::boolean
     and pg_temp.keys(p) = 'endsAt,format,goal,host,id,joinUntil,pace,perWeek,self,startsAt,threshold,tieMargin,weeks' and pg_temp.anonymous(p::text), 'the preview: '||p::text;
  perform set_config('titan.cm_match1', p->>'id', true);
  perform pg_temp.as_user('hv');
  assert (public.titan_club_match_preview_v1(cv, code)->>'self')::boolean, 'its own code is recognised as its own';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_match => %L)', cv, 'accept', p->>'id')) = 'MATCH_SELF', 'a club does not meet itself';
  perform pg_temp.as_user('m1');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_match => %L)', cm, 'accept', p->>'id')) = 'CLUB_ADMIN_REQUIRED', 'a member does not accept';
  perform pg_temp.as_user('hm');
  v := pg_temp.act(cm, 'accept', p_match => (p->>'id')::uuid)->'current';
  assert v->>'phase' = 'upcoming' and v->>'side' = 'guest' and v->'us'->>'name' = 'Multisport du parc' and v->'them'->>'name' = 'Les Rouleurs'
     and (v->'us'->>'participants')::integer = 0 and v->'me' = 'null'::jsonb and v->'can' = '["join", "stop"]'::jsonb, 'accepted, nobody is added: '||v::text;
  assert public.titan_club_match_preview_v1(cm, code) is null, 'the code is used up';
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
update public.profiles set is_suspended = true where id = pg_temp.uid('z');
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); k text; v jsonb;
begin
  -- EXPLICIT PARTICIPATION: each one chooses, in either club.
  foreach k in array array['v1','v2','v3','v4','v5','v6','v7','v8','v9'] loop perform pg_temp.as_user(k); perform pg_temp.act(cv, 'join'); end loop;
  perform pg_temp.as_user('v1');
  assert (pg_temp.act(cv, 'join')->'current'->'us'->>'participants')::integer = 9, 'joining twice is idempotent';
  foreach k in array array['m1','m2'] loop perform pg_temp.as_user(k); perform pg_temp.act(cm, 'join'); end loop;
  perform pg_temp.as_user('m4');
  v := pg_temp.cur(cm);
  assert v->'can' = '["join"]'::jsonb and v->'me' = 'null'::jsonb and (v->'us'->>'participants')::integer = 2 and not (v->'us'->>'scored')::boolean
     and v->'us'->'rate' = 'null'::jsonb and v->'us'->'total' = 'null'::jsonb and v->'us'->'target' = 'null'::jsonb, 'two participants: no rate, no total: '||v::text;
  perform pg_temp.as_user('z');
  v := pg_temp.cur(cm);
  assert v->'can' = '[]'::jsonb and (v->>'suspended')::boolean, 'a suspended member is offered nothing';
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', cm, 'join')) = 'ACCOUNT_SUSPENDED', 'and cannot join';
  perform pg_temp.as_user('m3'); v := pg_temp.act(cm, 'join')->'current';
  assert (v->'us'->>'participants')::integer = 3 and (v->'us'->>'scored')::boolean and (v->'them'->>'participants')::integer = 9
     and v->'me'->>'status' = 'active' and (v->'me'->>'share')::integer = 3 and v->'can' = '["leave"]'::jsonb, 'three participants: the club is scored; share 3 × 1 week: '||v::text;
  assert pg_temp.keys(v->'them') = 'name,participants,rate,scored', 'the other club: a name, a number of participants and a rate, nothing else';
end $$;

-- Time passes: the meeting started five Paris days ago and ends in two. Sessions of days 1 to 5.
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
do $$
declare x uuid := current_setting('titan.cm_match1')::uuid; k text; i integer; held uuid;
begin
  update private.titan_club_matches set starts_at = pg_temp.mid() - interval '5 days', ends_at = pg_temp.mid() + interval '2 days', join_until = pg_temp.mid() - interval '3 days' where id = x;
  update private.titan_club_match_members set joined_at = pg_temp.mid() - interval '5 days' - interval '1 hour' where match_id = x;
  set local session_replication_role = replica;
  -- v1 rides every day (5 active days, counted up to his share of 3); v2 to v8 two days each; v9 nothing.
  for i in 1..5 loop perform pg_temp.log('v1', i, 90); end loop;
  foreach k in array array['v2','v3','v4','v5','v6','v7','v8'] loop perform pg_temp.log(k, 1, 40); perform pg_temp.log(k, 2, 40); end loop;
  -- m1 every day (another sport each day), m2 two days, m3 one day of climbing.
  for i in 1..5 loop perform pg_temp.log('m1', i, 30, (array['running','swimming','climbing','yoga','cycling'])[i]); end loop;
  perform pg_temp.log('m2', 1, 45, 'swimming'); perform pg_temp.log('m2', 2, 45, 'swimming');
  perform set_config('titan.cm_m3log', pg_temp.log('m3', 3, 60, 'climbing')::text, true);
  -- Never counted: m4 did not choose to take part; a day of v9 at 8 minutes; a held reward; a session the server never stamped.
  perform pg_temp.log('m4', 2, 60, 'running');
  perform pg_temp.log('v9', 3, 8);
  held := pg_temp.log('v9', 4, 60);
  insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at) values (held, pg_temp.uid('v9'), 10, 1, now() + interval '1 day');
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (pg_temp.uid('v9'), 'cycling', 1, 'session', 10, pg_temp.mid() - interval '1 day' + interval '12 hours', '{"effort":{"effort_minutes":60}}', pg_temp.mid() - interval '1 day');
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); a jsonb; b jsonb; k text;
begin
  perform pg_temp.as_user('v2');
  a := pg_temp.cur(cv);
  -- Les Rouleurs: v1 3 (capped) + 7 × 2 + v9 0 = 17 of 27 → 62 %. Multisport: m1 3 (capped) + m2 2 + m3 1 = 6 of 9 → 66 %.
  assert a->>'phase' = 'running' and (a->'us'->>'total')::integer = 17 and (a->'us'->>'target')::integer = 27 and (a->'us'->>'rate')::integer = 62
     and (a->'them'->>'rate')::integer = 66 and (a->'them'->>'participants')::integer = 3, '9 against 3, comparable completion, close rates: '||a::text;
  -- Common score = floor((62 + 66) / 2) = 64 ≥ 60.
  assert (a->>'common')::integer = 64 and (a->>'reached')::boolean and a->'lead' = 'null'::jsonb and (a->>'asOf')::timestamptz = pg_temp.mid(), 'common score as of midnight: '||a::text;
  assert (a->'me'->>'days')::integer = 2 and (a->'me'->>'share')::integer = 3, 'one reads one''s own days';
  perform pg_temp.as_user('v1');
  assert (pg_temp.cur(cv)->'me'->>'days')::integer = 3, 'a very active member counts up to his own share only';
  perform pg_temp.as_user('m1');
  b := pg_temp.cur(cm);
  assert (b->'us'->>'rate')::integer = 66 and (b->'them'->>'rate')::integer = 62 and (b->>'common')::integer = 64 and (b->'me'->>'days')::integer = 3, 'the other side reads the same score: '||b::text;
  assert b->'them'->'total' = 'null'::jsonb or not (b->'them' ? 'total'), 'never the other club''s total';
  -- CONFIDENTIALITY: in everything any member of either club reads, no account and no name of a member.
  foreach k in array array['hv','v1','v2','v9','hm','m1','m2','m3','m4','z'] loop
    perform pg_temp.as_user(k);
    assert pg_temp.anonymous(pg_temp.view(case when k in ('hv','v1','v2','v9') then cv else cm end)::text), 'anonymous for '||k;
  end loop;
end $$;

-- PRESENCE: m2 trains this morning. The other club's view does not move until midnight; m2 reads it live.
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
do $$
declare at timestamptz := pg_temp.mid() + (now() - pg_temp.mid()) / 2;
begin
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (pg_temp.uid('m2'), 'swimming', 1, 'km', 10, at, '{"serverReward":true,"effort":{"effort_minutes":50}}', at);
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); a jsonb;
begin
  perform pg_temp.as_user('v2');
  a := pg_temp.cur(cv);
  assert (a->'them'->>'rate')::integer = 66 and (a->>'common')::integer = 64, 'a session of today is not seen by the other club: '||a::text;
  perform pg_temp.as_user('m3');
  assert (pg_temp.cur(cm)->'us'->>'rate')::integer = 66, 'nor by one''s own club';
  perform pg_temp.as_user('m2');
  assert (pg_temp.cur(cm)->'me'->>'days')::integer = 3, 'm2 reads her own day live';
end $$;

-- AN INVALIDATED SESSION: m3's only session is found suspicious. Multisport falls to 5 of 9 → 55 %; common floor(117 / 2) = 58 < 60.
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
set local session_replication_role = replica;
update public.training_logs set is_suspicious = true where id = current_setting('titan.cm_m3log')::uuid;
set local session_replication_role = origin;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); a jsonb;
begin
  perform pg_temp.as_user('hv');
  a := pg_temp.cur(cv);
  assert (a->'them'->>'rate')::integer = 55 and (a->>'common')::integer = 58 and not (a->>'reached')::boolean, 'the published rule, after an invalidated session: '||a::text;
end $$;

-- WITHDRAWALS: v9 (nothing done) leaves the meeting on day 6; v8 leaves the club. Their shares shrink to the time spent (3 × 5.x / 7 → 3):
-- the rate does not rise by making the inactive leave; v8's two days stay. A late arrival is refused (the window closed after day 2).
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); a jsonb;
begin
  perform pg_temp.as_user('v9');
  a := pg_temp.act(cv, 'leave')->'current';
  assert a->'me'->>'status' = 'left' and a->'can' = '[]'::jsonb and (a->'us'->>'participants')::integer = 8 and (a->'us'->>'target')::integer = 27 and (a->'us'->>'rate')::integer = 62,
    'a withdrawal keeps the share of the time spent: '||a::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', cv, 'join')) = 'MATCH_LEFT', 'leaving is final';
  perform pg_temp.as_user('v8');
  perform public.titan_club_leave_v1(cv);
  perform pg_temp.as_user('v2');
  a := pg_temp.cur(cv);
  assert (a->'us'->>'participants')::integer = 7 and (a->'us'->>'total')::integer = 17 and (a->'us'->>'rate')::integer = 62, 'leaving the club leaves the meeting, days stay: '||a::text;
  perform pg_temp.as_user('m4');
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', cm, 'join')) = 'MATCH_JOIN_CLOSED', 'participations close at the end of the second day';
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', cm, 'leave')) = 'MATCH_NOT_IN', 'm4 never took part';
end $$;

-- THE END: the meeting ends a little after m2's session of today; the final score counts it (dated and recorded before the end).
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
do $$
declare x uuid := current_setting('titan.cm_match1')::uuid;
begin
  update private.titan_club_matches set ends_at = now() - (now() - pg_temp.mid()) / 4 where id = x;
end $$;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); r jsonb; l jsonb; x uuid := current_setting('titan.cm_match1')::uuid;
begin
  perform pg_temp.as_user('v2');
  r := pg_temp.view(cv);
  l := r->'last';
  -- Multisport: m1 3 + m2 3 + m3 0 = 6 of 9 → 66 %; Les Rouleurs 62 % → common 64 % ≥ 60: reached together.
  assert r->'current' = 'null'::jsonb and l->>'phase' = 'closed' and (l->'us'->>'rate')::integer = 62 and (l->'them'->>'rate')::integer = 66
     and (l->>'common')::integer = 64 and (l->>'reached')::boolean and (l->'us'->>'participants')::integer = 7 and (l->'them'->>'participants')::integer = 3, 'the recap: '||l::text;
  assert l->'me' = '{"days": 2, "left": false, "share": 3, "answered": false}'::jsonb and l->'can' = '["feedback"]'::jsonb, 'one''s own part in the recap: '||(l->'me')::text;
  assert pg_temp.keys(l->'them') = 'name,participants,rate,scored' and pg_temp.anonymous(r::text), 'the recap gives no personal contribution';
  assert (r->>'canPropose')::boolean is false, 'a member never proposes';
  perform pg_temp.as_user('m2');
  l := pg_temp.view(cm)->'last';
  assert (l->'me'->>'days')::integer = 3 and (l->'us'->>'rate')::integer = 66 and (l->>'common')::integer = 64, 'm2''s own part: '||(l->'me')::text;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
do $$
declare x uuid := current_setting('titan.cm_match1')::uuid; s jsonb; at timestamptz;
begin
  s := (select summary from private.titan_club_matches where id = x);
  assert (select status from private.titan_club_matches where id = x) = 'closed', 'settled once';
  -- SAME INPUTS, SAME RESULT: the final score computed again equals the frozen recap.
  assert private.titan_club_match_score(x, (select ends_at from private.titan_club_matches where id = x)) = private.titan_club_match_score(x, (select ends_at from private.titan_club_matches where id = x)), 'stable recomputation';
  assert (private.titan_club_match_score(x, (select ends_at from private.titan_club_matches where id = x))->>'common')::integer = (s->>'common')::integer, 'the frozen common score is the computed one';
  -- A late session dated inside the meeting but recorded after its end changes nothing.
  at := (select ends_at from private.titan_club_matches where id = x) - interval '1 minute';
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (pg_temp.uid('v2'), 'cycling', 1, 'session', 10, at, '{"serverReward":true,"effort":{"effort_minutes":50}}', now());
  set local session_replication_role = origin;
  assert (private.titan_club_match_score(x, (select ends_at from private.titan_club_matches where id = x))->'host'->>'total')::integer = 17, 'recorded after the end: not counted';
  perform set_config('titan.cm_summary1', s::text, true);
end $$;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); l jsonb;
begin
  perform pg_temp.as_user('v2');
  l := pg_temp.act(cv, 'feedback', p_clear => true, p_again => true)->'last';
  assert (l->'me'->>'answered')::boolean and l->'can' = '[]'::jsonb, 'answered once: '||l::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_clear => true, p_again => false)', cv, 'feedback')) = 'MATCH_NOT_IN', 'one answer per person';
  perform pg_temp.as_user('v3'); perform pg_temp.act(cv, 'feedback', p_clear => true, p_again => false);
  perform pg_temp.as_user('v4'); perform pg_temp.act(cv, 'feedback', p_clear => true, p_again => true);
  perform pg_temp.as_user('m1'); perform pg_temp.act(cm, 'feedback', p_clear => false, p_again => true);
  perform pg_temp.as_user('m4');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_clear => true, p_again => true)', cm, 'feedback')) = 'MATCH_NOT_IN', 'only participants answer';
  perform pg_temp.as_user('v2');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_clear => null, p_again => true)', cv, 'feedback')) = 'MATCH_INVALID', 'both answers are needed';
end $$;

-- ===================================================================================== Match 2: comparison (two weeks, tie, short).
do $$
declare cm uuid := pg_temp.club('M'); r jsonb;
begin
  perform pg_temp.as_user('hm');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 2, %L)', cm, 'propose', 'versus', 'douce', pg_temp.today() + 3)) = 'VERSUS_CLOSED', 'still closed';
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
update private.titan_feature_flags set enabled = true where key = 'screens.club_match_versus';
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); r jsonb; p jsonb; k text;
begin
  perform pg_temp.as_user('hm');
  assert pg_temp.view(cm)->'formats' = '["cooperation", "versus"]'::jsonb, 'both formats once the flag opens';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L, 1, %L)', cm, 'propose', 'versus', 'douce', pg_temp.today() + 3)) = 'MATCH_INVALID', 'a comparison lasts two weeks';
  r := pg_temp.act(cm, 'propose', 'versus', 'douce', 2, pg_temp.today() + 3);
  perform pg_temp.as_user('hv');
  p := public.titan_club_match_preview_v1(cv, r->'current'->>'code');
  perform pg_temp.act(cv, 'accept', p_match => (p->>'id')::uuid);
  perform set_config('titan.cm_match2', p->>'id', true);
  foreach k in array array['v1','v2','v3','v4'] loop perform pg_temp.as_user(k); perform pg_temp.act(cv, 'join'); end loop;
  foreach k in array array['m1','m2','m3'] loop perform pg_temp.as_user(k); perform pg_temp.act(cm, 'join'); end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
do $$
declare x uuid := current_setting('titan.cm_match2')::uuid; i integer;
begin
  -- The sessions of match 1 are archived so that match 2 starts from a clean slate (match 1's recap is frozen and does not move).
  set local session_replication_role = replica;
  update public.training_logs set archived_at = now() where user_id in (select unnest(string_to_array(current_setting('titan.cm_all'), ','))::uuid);
  set local session_replication_role = origin;
  update private.titan_club_matches set starts_at = pg_temp.mid() - interval '4 days', ends_at = pg_temp.mid() + interval '10 days', join_until = pg_temp.mid() - interval '2 days' where id = x;
  update private.titan_club_match_members set joined_at = pg_temp.mid() - interval '5 days' where match_id = x;
end $$;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); a jsonb;
begin
  -- EQUALITY: nobody has trained yet in this meeting: 0 % against 0 %.
  perform pg_temp.as_user('v1');
  a := pg_temp.cur(cv);
  assert (a->'us'->>'target')::integer = 16 and (a->'us'->>'rate')::integer = 0 and (a->'them'->>'rate')::integer = 0 and a->>'lead' = 'tie' and a->'common' = 'null'::jsonb, 'a tie: '||a::text;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
do $$
declare k text;
begin
  set local session_replication_role = replica;
  -- Les Rouleurs: v1 3, v2 2, v3 1 = 6 of 16 → 37 %. Multisport: m1 2 of 12 → 16 %. More than 5 points apart.
  perform pg_temp.log('v1', 1, 30); perform pg_temp.log('v1', 2, 30); perform pg_temp.log('v1', 3, 30);
  perform pg_temp.log('v2', 1, 30); perform pg_temp.log('v2', 3, 30); perform pg_temp.log('v3', 2, 30);
  perform pg_temp.log('m1', 1, 30, 'running'); perform pg_temp.log('m1', 2, 30, 'running');
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); cm uuid := pg_temp.club('M'); a jsonb;
begin
  perform pg_temp.as_user('v4');
  a := pg_temp.cur(cv);
  assert (a->'us'->>'rate')::integer = 37 and (a->'them'->>'rate')::integer = 16 and a->>'lead' = 'us', 'Les Rouleurs lead: '||a::text;
  perform pg_temp.as_user('m2');
  assert pg_temp.cur(cm)->>'lead' = 'them', 'read from the other side';
  -- A SMALL TEAM: m3 leaves, Multisport has 2 participants: no rate, no comparison.
  perform pg_temp.as_user('m3');
  a := pg_temp.act(cm, 'leave')->'current';
  assert not (a->'us'->>'scored')::boolean and a->'us'->'rate' = 'null'::jsonb and a->'lead' = 'null'::jsonb, 'under 3: nothing compared: '||a::text;
  perform pg_temp.as_user('v4');
  a := pg_temp.cur(cv);
  assert a->'them'->'rate' = 'null'::jsonb and (a->'them'->>'participants')::integer = 2 and (a->'us'->>'rate')::integer = 37, 'the other side reads only that it is under 3';
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
update private.titan_club_matches set ends_at = now() - interval '1 minute' where id = current_setting('titan.cm_match2')::uuid;
set local role authenticated;
do $$
declare cv uuid := pg_temp.club('V'); l jsonb;
begin
  perform pg_temp.as_user('v1');
  l := pg_temp.view(cv)->'last';
  assert l->>'phase' = 'short' and l->'lead' = 'null'::jsonb and (l->'us'->>'rate')::integer = 37 and l->'them'->'rate' = 'null'::jsonb, 'ended under 3: no result: '||l::text;
end $$;

-- ===================================================================================== Match 3: the organisers' paths.
do $$
declare cx uuid := pg_temp.club('X'); cy uuid := pg_temp.club('Y'); cm uuid := pg_temp.club('M'); cv uuid := pg_temp.club('V'); r jsonb; p jsonb; l jsonb;
begin
  -- The same account cannot propose and accept: two organisers agree.
  perform pg_temp.as_user('hx');
  r := pg_temp.act(cx, 'propose', 'cooperation', 'soutenue', 1, pg_temp.today() + 5);
  p := public.titan_club_match_preview_v1(cy, r->'current'->>'code');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_match => %L)', cy, 'accept', p->>'id')) = 'MATCH_SAME_ORGANISER', 'another organiser accepts';
  -- Withdrawn by its organiser: the code no longer works.
  l := pg_temp.act(cx, 'stop')->'last';
  assert l->>'phase' = 'cancelled' and l->>'stoppedBy' = 'us', 'withdrawn: '||l::text;
  assert public.titan_club_match_preview_v1(cy, r->'current'->>'code') is null, 'a withdrawn code is dead';
  perform pg_temp.age((r->'current'->>'id')::uuid);
  perform pg_temp.as_user('x1');
  assert pg_temp.view(cx)->'last' = 'null'::jsonb, 'members never saw it';
  -- REFUSED by Multisport: Les Grimpeurs' organisers read it, no data was exchanged.
  perform pg_temp.as_user('hx');
  r := pg_temp.act(cx, 'propose', 'cooperation', 'reguliere', 2, pg_temp.today() + 5);
  perform pg_temp.as_user('hm');
  p := public.titan_club_match_preview_v1(cm, r->'current'->>'code');
  perform pg_temp.act(cm, 'refuse', p_match => (p->>'id')::uuid);
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_match => %L)', cm, 'accept', p->>'id')) = 'MATCH_CODE', 'a refused proposal cannot be accepted';
  perform pg_temp.as_user('hx');
  l := pg_temp.view(cx)->'last';
  assert l->>'phase' = 'refused' and l->'them'->>'name' = 'Multisport du parc' and l->'us' = 'null'::jsonb, 'refused: '||l::text;
  perform pg_temp.age((p->>'id')::uuid); perform pg_temp.age((p->>'id')::uuid);
  -- EXPIRED: nobody accepts before the start.
  r := pg_temp.act(cx, 'propose', 'cooperation', 'reguliere', 1, pg_temp.today() + 1);
  perform set_config('titan.cm_match3', r->'current'->>'id', true);
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
update private.titan_club_matches set starts_at = now() - interval '1 minute' where id = current_setting('titan.cm_match3')::uuid;
set local role authenticated;
do $$
declare cx uuid := pg_temp.club('X'); cm uuid := pg_temp.club('M'); cv uuid := pg_temp.club('V'); r jsonb; p jsonb; l jsonb; k text;
begin
  perform pg_temp.as_user('hm');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_match => %L)', cm, 'accept', current_setting('titan.cm_match3'))) = 'MATCH_STARTED', 'too late to accept';
  perform pg_temp.as_user('hx');
  l := pg_temp.view(cx)->'last';
  assert l->>'phase' = 'expired', 'expired: '||l::text;
  -- CANCELLED before the start by the other side, after acceptance: both clubs read it.
  r := pg_temp.act(cx, 'propose', 'cooperation', 'reguliere', 1, pg_temp.today() + 2);
  perform pg_temp.as_user('hm');
  p := public.titan_club_match_preview_v1(cm, r->'current'->>'code');
  perform pg_temp.act(cm, 'accept', p_match => (p->>'id')::uuid);
  perform pg_temp.as_user('x1'); perform pg_temp.act(cx, 'join');
  perform pg_temp.as_user('m1');
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', cm, 'stop')) = 'CLUB_ADMIN_REQUIRED', 'a member does not stop the meeting';
  perform pg_temp.as_user('hm');
  l := pg_temp.act(cm, 'stop')->'last';
  assert l->>'phase' = 'cancelled' and l->>'stoppedBy' = 'us', 'cancelled: '||l::text;
  perform pg_temp.as_user('x1');
  l := pg_temp.view(cx)->'last';
  assert l->>'phase' = 'cancelled' and l->>'stoppedBy' = 'them' and l->'them'->>'name' = 'Multisport du parc' and l->'can' = '[]'::jsonb, 'the other side reads who cancelled: '||l::text;
  perform pg_temp.age((p->>'id')::uuid);
  -- ABANDONED while running: no result.
  perform pg_temp.as_user('hx');
  r := pg_temp.act(cx, 'propose', 'cooperation', 'reguliere', 1, pg_temp.today() + 2);
  perform pg_temp.as_user('hv');
  p := public.titan_club_match_preview_v1(cv, r->'current'->>'code');
  perform pg_temp.act(cv, 'accept', p_match => (p->>'id')::uuid);
  perform set_config('titan.cm_match4', p->>'id', true);
  foreach k in array array['x1','x2','x3'] loop perform pg_temp.as_user(k); perform pg_temp.act(cx, 'join'); end loop;
  foreach k in array array['v1','v2','v3'] loop perform pg_temp.as_user(k); perform pg_temp.act(cv, 'join'); end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
update private.titan_club_matches set starts_at = pg_temp.mid() - interval '2 days', ends_at = pg_temp.mid() + interval '5 days', join_until = pg_temp.mid() where id = current_setting('titan.cm_match4')::uuid;
set local role authenticated;
do $$
declare cx uuid := pg_temp.club('X'); cv uuid := pg_temp.club('V'); l jsonb;
begin
  perform pg_temp.as_user('hv');
  assert pg_temp.cur(cv)->'can' @> '["stop"]'::jsonb, 'each side may stop';
  l := pg_temp.act(cv, 'stop')->'last';
  assert l->>'phase' = 'abandoned' and l->>'stoppedBy' = 'us' and l->'common' = 'null'::jsonb, 'abandoned: '||l::text;
  perform pg_temp.as_user('x2');
  l := pg_temp.view(cx)->'last';
  assert l->>'phase' = 'abandoned' and l->>'stoppedBy' = 'them' and l->'can' = '["feedback"]'::jsonb and pg_temp.anonymous(l::text), 'the other side: '||l::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L)', cx, 'leave')) = 'MATCH_NOT_FOUND', 'nothing left to leave';
  perform pg_temp.act(cx, 'feedback', p_clear => true, p_again => true);
end $$;

-- ===================================================================================== Export, erasure, measure.
reset role;
select set_config('request.jwt.claims', '{}', true) is null as reset_claims \gset
do $$
declare e jsonb; x uuid := current_setting('titan.cm_match1')::uuid; m jsonb;
begin
  e := private.titan_social_export_v1(pg_temp.uid('m1'))->'clubMatches';
  assert jsonb_array_length(e) = 2 and e->0->>'role' = 'took_part' and (e->0->>'final_days')::integer = 3 and (e->0->>'clear')::boolean = false, 'm1''s export: '||e::text;
  assert pg_temp.anonymous(replace(e::text, pg_temp.uid('m1')::text, '')), 'the export holds no other member';
  e := private.titan_social_export_v1(pg_temp.uid('hv'))->'clubMatches';
  assert e @> jsonb_build_array(jsonb_build_object('role', 'proposed', 'match_id', x)) and e @> '[{"role": "accepted"}]'::jsonb, 'hv proposed and accepted: '||e::text;
  assert (private.titan_social_export_v1(pg_temp.uid('hm'))->'clubMatches') @> '[{"role": "refused"}]'::jsonb, 'hm refused one';
  -- Erasure: an organiser and a participant go; the recap stays as it was frozen.
  delete from auth.users where id in (pg_temp.uid('hv'), pg_temp.uid('v2'));
  assert (select created_by from private.titan_club_matches where id = x) is null, 'the meeting keeps no organiser';
  assert (select summary from private.titan_club_matches where id = x) = current_setting('titan.cm_summary1')::jsonb, 'the recap does not move';
  assert not exists (select 1 from private.titan_club_match_members where user_id = pg_temp.uid('v2')), 'the participation goes with the account';
  m := private.titan_club_match_measure(now() - interval '1 day');
  assert (m->>'proposed')::integer = 7 and (m->>'accepted')::integer = 4 and (m->>'refused')::integer = 1 and (m->>'expired')::integer = 1
     and (m->>'cancelled')::integer = 2 and (m->>'abandoned')::integer = 1 and (m->>'completed')::integer = 1 and (m->>'completedCooperation')::integer = 1
     and (m->>'reachedTogether')::integer = 1 and (m->>'withoutResult')::integer = 1, 'the measure counts the meetings: '||m::text;
  -- Answers: v3 (clear, not again), v4 (clear, again), m1 (unclear, again), x2 (clear, again); v2's answer left with his account.
  assert (m->>'answers')::integer = 4 and (m->>'unclear')::integer = 1 and (m->>'unclearShare')::numeric = 0.25
     and (m->>'sidesAnswering')::integer = 3 and (m->>'sidesAgain')::integer = 2 and not (m->>'explainable')::boolean, 'misunderstandings and wish to play again: '||m::text;
  assert pg_temp.anonymous(m::text), 'counts only';
end $$;
rollback;
