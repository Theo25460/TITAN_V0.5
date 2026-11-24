-- V1.8.6 — Agenda et rendez-vous d’équipe (migration 20261129090000). Synthetic accounts only, full rollback.
-- Club 1 « Les Rouleurs du jeudi » (the scenario): o administers it and proposes a Saturday ride with a fallback session (« Si pluie :
-- séance de renfo au gymnase »), a precise meeting point and 3 places. a, b, c answer; d and w wait for a place; x never answers; the
-- precise place is read only by those who come, hesitate or wait. a changes her mind: d gets the place. The ride is moved by a day: the
-- answers are kept and marked « to confirm »; b changes her mind and keeps the new time, the fallback and the history. c leaves the club:
-- her place goes to the first one waiting and she reads nothing any more, not even through the invitation link. A renewed or unknown code,
-- a non-member, an expired series: no detail. A weekly series of 12 keeps its Paris time across the change of hour; one occurrence is
-- cancelled then restored; the series is cancelled then resumed without a single duplicated row. After the ride, each one declares their
-- presence and may link one of their own confirmed sessions of that day; the journal is never written. Export, measure, erasure.
begin;
create function pg_temp.as_user(k text) returns void language sql as
  $$ select set_config('request.jwt.claims', case when k is null then '{}' else json_build_object('sub', current_setting('titan.ag_' || k), 'role', 'authenticated')::text end, true) $$;
create function pg_temp.uid(k text) returns uuid language sql as $$ select current_setting('titan.ag_' || k)::uuid $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'no error'; exception when others then return sqlerrm; end $$;
create function pg_temp.club(k text) returns uuid language sql as $$ select current_setting('titan.ag_club' || k)::uuid $$;
create function pg_temp.slot(k text) returns uuid language sql as $$ select current_setting('titan.ag_slot' || k)::uuid $$;
create function pg_temp.act(p_club uuid, p_action text, p_slot uuid default null, p_answer text default null, p_on boolean default null,
  p_starts timestamptz default null, p_log uuid default null, p_event uuid default null, p_form jsonb default null) returns jsonb language sql as
  $$ select public.titan_club_agenda_act_v1(p_club, p_action, p_slot, p_event, p_answer, p_on, p_starts, p_log, p_form) $$;
-- The view of one occurrence by the current account.
create function pg_temp.view(p_club uuid, p_slot uuid) returns jsonb language sql as
  $$ select x from jsonb_array_elements((select public.titan_club_agenda_v1(p_club)->'upcoming') || (select public.titan_club_agenda_v1(p_club)->'past')) x
      where x->>'id' = p_slot::text $$;
create function pg_temp.digest(k text) returns jsonb language plpgsql as
  $$ begin perform pg_temp.as_user(k); return public.titan_social_digest_v1(now() - interval '1 day')->'agenda'; end $$;
grant execute on all functions in schema pg_temp to authenticated;

do $$
declare k text; v uuid;
begin
  foreach k in array array['o','a','b','c','d','w','x','z','out','q'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_ag_' || k, created_at = now() - interval '30 days' where id = v;
    perform set_config('titan.ag_' || k, v::text, true);
  end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.club_agenda', false, 100, 'QA')
    on conflict (key) do update set enabled = false, rollout = 100;
  assert not has_table_privilege('authenticated', 'private.titan_club_events', 'select')
     and not has_table_privilege('authenticated', 'private.titan_club_event_slots', 'select')
     and not has_table_privilege('authenticated', 'private.titan_club_event_answers', 'select')
     and not has_table_privilege('authenticated', 'private.titan_club_event_changes', 'select'), 'no API grant on the agenda tables';
  assert not has_function_privilege('anon', 'public.titan_club_agenda_v1(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.titan_club_agenda_measure(timestamptz)', 'execute'), 'no anonymous read, no measure for members';
end $$;

set local role authenticated;
do $$
declare c1 uuid; code1 text; k text;
begin
  perform pg_temp.as_user('o');
  c1 := public.titan_club_create_v1('Les Rouleurs du jeudi', 'Vélo et sorties communes.', false);
  code1 := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = c1::text);
  foreach k in array array['a','b','c','d','w','x','z','q'] loop perform pg_temp.as_user(k); perform public.titan_club_join_v1(code1, null); end loop;
  perform set_config('titan.ag_club1', c1::text, true);
end $$;
reset role;
do $$ begin perform pg_temp.as_user(null); end $$;
update public.profiles set is_suspended = true where id = pg_temp.uid('z');
set local role authenticated;

-- Flag closed: nothing is created, a read is empty.
do $$
declare c1 uuid := pg_temp.club('1'); r jsonb;
begin
  perform pg_temp.as_user('o');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create',
    jsonb_build_object('title', 'Sortie du samedi', 'area', 'Parc de la Tête d’Or', 'durationMin', 120, 'startsAt', now() + interval '3 days'))) = 'FEATURE_DISABLED', 'flag closed: no creation';
  r := public.titan_club_agenda_v1(c1);
  assert r->'upcoming' = '[]'::jsonb and not (r->>'canCreate')::boolean and r->>'role' = 'organizer', 'flag closed: an empty agenda '||r::text;
  perform pg_temp.as_user('out');
  assert pg_temp.err(format('select public.titan_club_agenda_v1(%L)', c1)) = 'CLUB_NOT_FOUND', 'outside the club: nothing';
end $$;
reset role;
update private.titan_feature_flags set enabled = true where key = 'screens.club_agenda';
set local role authenticated;

-- Organiser, inputs, creation.
do $$
declare c1 uuid := pg_temp.club('1'); r jsonb; v jsonb; sat timestamptz := ((((now() at time zone 'Europe/Paris')::date + 3)::timestamp + time '09:00') at time zone 'Europe/Paris');
  f jsonb;
begin
  f := jsonb_build_object('title', '  Sortie <b>du</b> samedi ', 'area', 'Parc de la Tête d’Or', 'place', 'Parking nord, portail vert',
    'fallback', 'Si pluie : séance de renfo au gymnase Lafayette', 'durationMin', 120, 'capacity', 3, 'recurrence', 'once', 'occurrences', 1, 'startsAt', sat);
  perform pg_temp.as_user('a');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create', f)) = 'CLUB_ADMIN_REQUIRED', 'only an administrator organises';
  perform pg_temp.as_user('o');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create', f || '{"title":"ab"}')) = 'AGENDA_INVALID', 'a title of 3 characters';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create', f || jsonb_build_object('startsAt', now() - interval '1 hour'))) = 'AGENDA_INVALID', 'not in the past';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create', f || jsonb_build_object('startsAt', now() + interval '61 days'))) = 'AGENDA_INVALID', '60 days ahead at most';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create', f || '{"capacity":1}')) = 'AGENDA_INVALID', 'a capacity of 2 at least';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create', f || '{"recurrence":"weekly","occurrences":1}')) = 'AGENDA_INVALID', 'a weekly series has 2 to 12 occurrences';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_form => %L)', c1, 'create', f || '{"durationMin":"beaucoup"}')) = 'AGENDA_INVALID', 'a duration is a number';
  r := pg_temp.act(c1, 'create', p_form => f);
  v := r->'upcoming'->0;
  assert v->>'title' = 'Sortie bdu/b samedi' and v->>'phase' = 'upcoming' and (v->>'capacity')::integer = 3 and v->>'recurrence' = 'once'
     and (v->>'startsAt')::timestamptz = sat and (v->>'endsAt')::timestamptz = sat + interval '2 hours', 'created: '||v::text;
  assert v->>'place' = 'Parking nord, portail vert' and length(v->>'code') = 8 and v->'roster' = '[]'::jsonb, 'the organiser reads the place, the link and the roster';
  assert v->'counts' = '{"no": 0, "yes": 0, "maybe": 0, "waitlist": 0}'::jsonb and v->'me' = 'null'::jsonb, 'nobody is answered for anyone';
  assert (select count(*) from jsonb_array_elements(v->'history') h where h->>'kind' = 'created') = 1, 'the history starts with the creation';
  perform set_config('titan.ag_slot1', v->>'id', true);
  perform set_config('titan.ag_code1', v->>'code', true);
  perform set_config('titan.ag_event1', v->>'event', true);
  -- A member: counts, the area and the fallback, never the precise place, the link or a name.
  perform pg_temp.as_user('x');
  v := pg_temp.view(c1, pg_temp.slot('1'));
  assert v->'place' = 'null'::jsonb and (v->>'hasPlace')::boolean and v->'code' = 'null'::jsonb and v->'roster' = 'null'::jsonb
     and v->>'area' = 'Parc de la Tête d’Or' and v->>'fallback' like 'Si pluie%' and v->'can' = '["yes", "maybe", "no"]'::jsonb, 'a member before answering: '||v::text;
end $$;

-- Answers, the precise place, the capacity and the waiting list.
do $$
declare c1 uuid := pg_temp.club('1'); s1 uuid := pg_temp.slot('1'); v jsonb;
begin
  perform pg_temp.as_user('a'); perform pg_temp.act(c1, 'answer', s1, 'yes');
  perform pg_temp.as_user('b'); perform pg_temp.act(c1, 'answer', s1, 'yes');
  perform pg_temp.as_user('c'); v := pg_temp.act(c1, 'answer', s1, 'maybe');
  perform pg_temp.as_user('d'); perform pg_temp.act(c1, 'answer', s1, 'no');
  v := pg_temp.view(c1, s1);
  assert v->'place' = 'null'::jsonb and v->'me'->>'answer' = 'no', 'who does not come does not read the precise place';
  perform pg_temp.as_user('c'); v := pg_temp.view(c1, s1);
  assert v->>'place' = 'Parking nord, portail vert' and v->'me'->>'answer' = 'maybe', 'who hesitates reads it';
  assert v->'counts' = '{"no": 1, "yes": 2, "maybe": 1, "waitlist": 0}'::jsonb and v->'roster' = 'null'::jsonb, 'counts only, no name: '||v::text;
  -- The last place, then the waiting list in order of answer.
  v := pg_temp.act(c1, 'answer', s1, 'yes');
  perform pg_temp.as_user('d'); perform pg_temp.act(c1, 'answer', s1, 'yes');
  perform pg_temp.as_user('w'); perform pg_temp.act(c1, 'answer', s1, 'yes');
  v := pg_temp.view(c1, s1);
  assert v->'me'->>'answer' = 'waitlist' and (v->'me'->>'position')::integer = 2 and (v->>'full')::boolean
     and v->'counts' = '{"no": 0, "yes": 3, "maybe": 0, "waitlist": 2}'::jsonb, 'beyond the capacity: waiting, second in line '||v::text;
  assert v->>'place' = 'Parking nord, portail vert', 'who waits reads the place';
  perform pg_temp.as_user('d'); v := pg_temp.view(c1, s1);
  assert (v->'me'->>'position')::integer = 1 and not v->'can' ? 'yes', 'd waits first and cannot answer yes twice';
  perform pg_temp.act(c1, 'answer', s1, 'yes');
  assert (pg_temp.view(c1, s1)->'counts'->>'waitlist')::integer = 2, 'a « yes » repeated changes nothing';
  -- The suspended member: a « no » only.
  perform pg_temp.as_user('z');
  assert pg_temp.view(c1, s1)->'can' = '["no"]'::jsonb, 'a suspended account is offered « no » only';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L)', c1, 'answer', s1, 'yes')) = 'ACCOUNT_SUSPENDED', 'a suspended account does not take a place';
  -- The organiser reads who answered what.
  perform pg_temp.as_user('o'); v := pg_temp.view(c1, s1);
  assert jsonb_array_length(v->'roster') = 5 and v->'roster'->0->>'answer' = 'yes' and v->'roster'->3->>'name' = 'qa_ag_d'
     and v->'roster'->3->>'answer' = 'waitlist', 'the organiser reads the answers in order: '||(v->'roster')::text;
  -- a changes her mind: d takes the place, and the digest tells her.
  perform pg_temp.as_user('a'); perform pg_temp.act(c1, 'answer', s1, 'no');
  perform pg_temp.as_user('d'); v := pg_temp.view(c1, s1);
  assert v->'me'->>'answer' = 'yes' and (v->'me'->>'promoted')::boolean and (v->'counts'->>'yes')::integer = 3 and (v->'counts'->>'waitlist')::integer = 1, 'the first one waiting gets the place '||v::text;
  assert pg_temp.digest('d')->0->>'reason' = 'promoted' and pg_temp.digest('d')->0->>'clubName' = 'Les Rouleurs du jeudi', 'the digest says a place was freed: '||pg_temp.digest('d')::text;
  -- x, who never answered, is asked once (the next occurrence of the series).
  assert pg_temp.digest('x') = jsonb_build_array(jsonb_build_object('slot', s1, 'club', c1, 'clubName', 'Les Rouleurs du jeudi',
    'title', 'Sortie bdu/b samedi', 'startsAt', (pg_temp.view(c1, s1)->>'startsAt')::timestamptz, 'reason', 'answer')), 'x is asked for an answer: '||pg_temp.digest('x')::text;
end $$;

-- A move (report), the fallback, a change of mind after the move.
do $$
declare c1 uuid := pg_temp.club('1'); s1 uuid := pg_temp.slot('1'); v jsonb; was timestamptz; sun timestamptz;
begin
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_starts => %L)', c1, 'move', s1, now() + interval '4 days')) = 'CLUB_ADMIN_REQUIRED', 'only the organiser moves';
  perform pg_temp.as_user('o');
  was := (pg_temp.view(c1, s1)->>'startsAt')::timestamptz;
  sun := was + interval '1 day 1 hour';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_starts => %L)', c1, 'move', s1, now() - interval '1 hour')) = 'AGENDA_INVALID', 'not to the past';
  v := pg_temp.act(c1, 'move', s1, p_starts => sun);
  perform pg_temp.act(c1, 'fallback', s1, p_on => true);
  perform pg_temp.as_user('b'); v := pg_temp.view(c1, s1);
  assert (v->>'startsAt')::timestamptz = sun and (v->>'plannedAt')::timestamptz = was and (v->>'moved')::boolean and (v->>'fallbackOn')::boolean, 'moved, on its fallback '||v::text;
  assert (v->'me'->>'toConfirm')::boolean and v->'me'->>'answer' = 'yes', 'the answer is kept, to be confirmed';
  assert (select count(*) from jsonb_array_elements(v->'history') h where h->>'kind' = 'moved' and (h->>'from')::timestamptz = was and (h->>'to')::timestamptz = sun) = 1
     and (select count(*) from jsonb_array_elements(v->'history') h where h->>'kind' = 'fallback_on') = 1
     and not (v->'history')::text like '%' || pg_temp.uid('o')::text || '%', 'the history says from when to when, never who '||(v->'history')::text;
  assert pg_temp.digest('b')->0->>'reason' = 'toConfirm', 'the digest asks b to confirm';
  -- b changes her mind: her place goes to w; she keeps the new time, the fallback and the history, not the precise place.
  perform pg_temp.act(c1, 'answer', s1, 'no');
  v := pg_temp.view(c1, s1);
  assert (v->>'startsAt')::timestamptz = sun and v->>'fallback' like 'Si pluie%' and jsonb_array_length(v->'history') = 3 and v->'place' = 'null'::jsonb
     and not (v->'me'->>'toConfirm')::boolean and pg_temp.digest('b') = '[]'::jsonb, 'after a change of mind: the useful information stays '||v::text;
  perform pg_temp.as_user('w');
  assert pg_temp.view(c1, s1)->'me'->>'answer' = 'yes' and pg_temp.digest('w')->0->>'reason' = 'promoted', 'w gets the place b freed';
  -- The organiser goes back to the planned session.
  perform pg_temp.as_user('o'); perform pg_temp.act(c1, 'fallback', s1, p_on => false);
  assert not (pg_temp.view(c1, s1)->>'fallbackOn')::boolean, 'fallback off';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L)', c1, 'cancel', gen_random_uuid())) = 'SLOT_NOT_FOUND', 'an unknown occurrence';
end $$;

-- A member who leaves the club, the invitation link.
do $$
declare c1 uuid := pg_temp.club('1'); s1 uuid := pg_temp.slot('1'); v jsonb; code text := current_setting('titan.ag_code1'); r jsonb;
begin
  -- c (yes) leaves: her place goes to the first one waiting (b answered no, so nobody waits: the place stays free).
  perform pg_temp.as_user('b'); perform pg_temp.act(c1, 'answer', s1, 'yes');
  assert pg_temp.view(c1, s1)->'me'->>'answer' = 'waitlist', 'full again: b waits';
  perform pg_temp.as_user('x');
  r := public.titan_club_agenda_invite_v1(lower(code));
  assert r->>'status' = 'open' and r->'slot'->>'id' = s1::text and r->'slot'->'place' = 'null'::jsonb, 'a member opens the link (no place without an answer) '||r::text;
  perform pg_temp.as_user('c');
  perform public.titan_club_leave_v1(c1);
  assert pg_temp.err(format('select public.titan_club_agenda_v1(%L)', c1)) = 'CLUB_NOT_FOUND', 'a member who left reads nothing';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L)', c1, 'answer', s1, 'yes')) = 'CLUB_NOT_FOUND', 'and answers nothing';
  assert public.titan_club_agenda_invite_v1(code) = '{"status": "unavailable"}'::jsonb, 'not even through the link';
  perform pg_temp.as_user('b');
  assert pg_temp.view(c1, s1)->'me'->>'answer' = 'yes', 'the place c held goes to b, who was waiting';
  perform pg_temp.as_user('out');
  assert public.titan_club_agenda_invite_v1(code) = '{"status": "unavailable"}'::jsonb and public.titan_club_agenda_invite_v1('ZZZZZZZZ') = '{"status": "unavailable"}'::jsonb
     and public.titan_club_agenda_invite_v1('<script>') = '{"status": "unavailable"}'::jsonb, 'a non-member, an unknown or hostile code: nothing';
  perform pg_temp.as_user('o');
  perform pg_temp.act(c1, 'new_code', p_event => current_setting('titan.ag_event1')::uuid);
  perform pg_temp.as_user('x');
  assert public.titan_club_agenda_invite_v1(code) = '{"status": "unavailable"}'::jsonb, 'a renewed code no longer opens anything';
  perform pg_temp.as_user('o');
  code := pg_temp.view(c1, s1)->>'code';
  perform pg_temp.as_user('x');
  assert public.titan_club_agenda_invite_v1(code)->>'status' = 'open', 'the new code opens it';
  perform set_config('titan.ag_code1', code, true);
  assert (select count(*) from jsonb_array_elements(pg_temp.view(c1, s1)->'history') h where h->>'kind' = 'code_renewed') = 0, 'a renewed code is not a change of the meeting';
end $$;

-- Reminders, the start, a weekly series across the change of hour, cancellations without duplicates.
do $$
declare c1 uuid := pg_temp.club('1'); s1 uuid := pg_temp.slot('1'); v jsonb; r jsonb; ev uuid; first timestamptz; ids uuid[]; ids2 uuid[]; s2 uuid; s3 uuid; s5 uuid;
  offsets integer;
begin
  perform pg_temp.as_user('x');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_on => true)', c1, 'remind', s1)) = 'ANSWER_REQUIRED', 'a reminder needs an answer';
  perform pg_temp.as_user('d'); perform pg_temp.act(c1, 'answer', s1, 'yes'); perform pg_temp.act(c1, 'remind', s1, p_on => true);
  assert not (pg_temp.view(c1, s1)->'me'->>'toConfirm')::boolean, 'repeating « yes » confirms it after the move';
  -- (d's promotion is older than her last visit from here on.)
  reset role;
  update private.titan_club_event_answers set promoted_at = now() - interval '2 days' where slot_id = s1 and user_id = pg_temp.uid('d');
  set local role authenticated;
  assert (pg_temp.view(c1, s1)->'me'->>'reminder')::boolean and pg_temp.digest('d') = '[]'::jsonb, 'reminder kept, not yet due (more than 24 h): '||pg_temp.digest('d')::text;
  reset role;
  update private.titan_club_event_slots set starts_at = now() + interval '5 hours' where id = s1;
  update private.titan_club_event_answers set confirmed_at = clock_timestamp() where slot_id = s1;
  set local role authenticated;
  assert pg_temp.digest('d')->0->>'reason' = 'reminder', 'within 24 hours, the digest reminds the one who asked: '||pg_temp.digest('d')::text;
  perform pg_temp.as_user('w');
  assert not exists (select 1 from jsonb_array_elements(pg_temp.digest('w')) d where d->>'reason' = 'reminder'), 'no reminder for who did not ask';

  -- Weekly, 12 occurrences at 18:30 Paris starting in 55 days: every occurrence keeps 18:30 whatever the change of hour.
  first := ((((now() at time zone 'Europe/Paris')::date + 55)::timestamp + time '18:30') at time zone 'Europe/Paris');
  perform pg_temp.as_user('o');
  r := pg_temp.act(c1, 'create', p_form => jsonb_build_object('title', 'Footing du jeudi', 'area', 'Quais du Rhône', 'durationMin', 60,
    'recurrence', 'weekly', 'occurrences', 12, 'startsAt', first));
  ev := (r->>'created')::uuid;
  reset role;
  assert (select count(*) from private.titan_club_event_slots where event_id = ev) = 12, '12 rows, once';
  assert (select bool_and((starts_at at time zone 'Europe/Paris')::time = time '18:30') from private.titan_club_event_slots where event_id = ev), 'always 18:30 in Paris';
  assert (select bool_and(((starts_at at time zone 'Europe/Paris')::date - (first at time zone 'Europe/Paris')::date) = 7 * (n - 1)) from private.titan_club_event_slots where event_id = ev), 'one week apart';
  select count(distinct (starts_at at time zone 'UTC')::time) into offsets from private.titan_club_event_slots where event_id = ev;
  raise notice 'weekly series from % to %: % distinct UTC times (2 = it crosses a change of hour)', first,
    (select max(starts_at) from private.titan_club_event_slots where event_id = ev), offsets;
  assert offsets = case when exists (select 1 from generate_series(0, 77) g
                         where (((first at time zone 'Europe/Paris')::date + g)::timestamp + time '12:00') at time zone 'Europe/Paris'
                               - ((((first at time zone 'Europe/Paris')::date + g - 1)::timestamp + time '12:00') at time zone 'Europe/Paris') <> interval '1 day')
                    then 2 else 1 end, 'the UTC time changes exactly when the Paris offset does';
  select array_agg(id order by n) into ids from private.titan_club_event_slots where event_id = ev;
  s2 := ids[2]; s3 := ids[3]; s5 := ids[5];
  -- Bring the series near: occurrences 2.. in the next weeks (the test needs them within the digest window and before the end).
  update private.titan_club_event_slots set starts_at = now() + make_interval(days => 7 * (n - 1)) + interval '2 days', planned_at = now() + make_interval(days => 7 * (n - 1)) + interval '2 days'
   where event_id = ev;
  set local role authenticated;
  perform pg_temp.as_user('a'); perform pg_temp.act(c1, 'answer', s2, 'yes'); perform pg_temp.act(c1, 'answer', s5, 'yes');
  -- One occurrence cancelled, then restored; the others are untouched.
  perform pg_temp.as_user('o'); perform pg_temp.act(c1, 'cancel', s2);
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L)', c1, 'cancel', s2)) = 'SLOT_CANCELLED', 'cancelled once';
  perform pg_temp.as_user('a');
  v := pg_temp.view(c1, s2);
  assert v->>'phase' = 'cancelled' and v->'can' = '[]'::jsonb and v->'place' = 'null'::jsonb, 'a cancelled occurrence stays readable, nothing to do '||v::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L)', c1, 'answer', s2, 'yes')) = 'SLOT_CANCELLED', 'no answer to a cancelled occurrence';
  assert exists (select 1 from jsonb_array_elements(pg_temp.digest('a')) d where d->>'slot' = s2::text and d->>'reason' = 'cancelled'), 'the digest tells a it is cancelled';
  assert pg_temp.view(c1, ids[1])->>'phase' = 'upcoming' and pg_temp.view(c1, s3)->>'phase' = 'upcoming', 'the rest of the series goes on';
  perform pg_temp.as_user('o'); perform pg_temp.act(c1, 'restore', s2);
  perform pg_temp.as_user('a'); v := pg_temp.view(c1, s2);
  assert v->>'phase' = 'upcoming' and v->'me'->>'answer' = 'yes' and (v->'me'->>'toConfirm')::boolean, 'restored with the answer kept, to be confirmed';
  -- Occurrence 3 is cancelled alone; then the whole series is cancelled; then resumed.
  perform pg_temp.as_user('o'); perform pg_temp.act(c1, 'cancel', s3);
  perform pg_temp.act(c1, 'cancel_series', p_event => ev);
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_event => %L)', c1, 'cancel_series', ev)) = 'SERIES_CANCELLED', 'a series is cancelled once';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L)', c1, 'restore', s5)) = 'SERIES_CANCELLED', 'an occurrence of a cancelled series is not restored alone';
  perform pg_temp.as_user('o');
  r := public.titan_club_agenda_invite_v1(pg_temp.view(c1, s5)->>'code');
  assert r = '{"status": "expired"}'::jsonb, 'the link of a cancelled series is expired, with no detail: '||r::text;
  reset role;
  assert (select count(*) from private.titan_club_event_slots where event_id = ev) = 12
     and (select count(*) from private.titan_club_event_slots where event_id = ev and status = 'cancelled') = 12, 'cancelled in place: 12 rows, all cancelled';
  set local role authenticated;
  perform pg_temp.as_user('o'); perform pg_temp.act(c1, 'resume_series', p_event => ev);
  assert pg_temp.err(format('select pg_temp.act(%L, %L, p_event => %L)', c1, 'resume_series', ev)) = 'SERIES_ACTIVE', 'resumed once';
  reset role;
  select array_agg(id order by n) into ids2 from private.titan_club_event_slots where event_id = ev;
  assert ids2 = ids and (select count(*) from private.titan_club_event_slots where event_id = ev) = 12, 'the same 12 rows, no duplicate';
  assert (select count(*) from private.titan_club_event_slots where event_id = ev and status = 'cancelled') = 1
     and (select status from private.titan_club_event_slots where id = s3) = 'cancelled', 'only the occurrence cancelled alone stays cancelled';
  assert (select count(*) from private.titan_club_event_changes where event_id = ev and kind = 'series_cancelled') = 1
     and (select count(*) from private.titan_club_event_changes where event_id = ev and kind = 'series_resumed') = 1
     and (select count(*) from private.titan_club_event_changes where event_id = ev) = 6, 'one line per change: created, cancel 2, restore 2, cancel 3, series cancelled, series resumed';
  set local role authenticated;
  perform pg_temp.as_user('a'); v := pg_temp.view(c1, s5);
  assert v->>'phase' = 'upcoming' and v->'me'->>'answer' = 'yes' and (v->'me'->>'toConfirm')::boolean, 'answers kept after a resumption, to be confirmed';
  assert (select count(*) from jsonb_array_elements(v->'history') h where h->>'kind' in ('series_cancelled', 'series_resumed')) = 2, 'the history of the series reads both';
  perform set_config('titan.ag_event2', ev::text, true);
  perform set_config('titan.ag_slot5', s5::text, true);
end $$;

-- The ride took place: presences, linked sessions, the group's report; the journal is never written.
do $$
declare c1 uuid := pg_temp.club('1'); s1 uuid := pg_temp.slot('1'); v jsonb; logs_before text; logs_after text; k text; l uuid;
  la uuid := gen_random_uuid(); lb uuid := gen_random_uuid(); ld uuid := gen_random_uuid(); lw uuid := gen_random_uuid(); lx uuid := gen_random_uuid();
  lnot uuid := gen_random_uuid(); lother uuid := gen_random_uuid(); d0 timestamptz;
begin
  reset role;
  update private.titan_club_event_slots set starts_at = now() - interval '3 hours', planned_at = now() - interval '3 hours' where id = s1;
  d0 := now() - interval '2 hours';
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    (lb, pg_temp.uid('b'), 'cycling', 42, 'km', 10, d0, '{"serverReward":true,"effort":{"effort_minutes":110}}', d0),
    (ld, pg_temp.uid('d'), 'cycling', 38, 'km', 10, d0, '{"serverReward":true,"effort":{"effort_minutes":100}}', d0),
    (lw, pg_temp.uid('w'), 'running', 9, 'km', 10, d0, '{"serverReward":true,"effort":{"effort_minutes":55}}', d0),
    (lx, pg_temp.uid('x'), 'cycling', 30, 'km', 10, d0, '{"serverReward":true,"effort":{"effort_minutes":95}}', d0),
    -- Never linkable: a session the server never stamped, a session of another day.
    (lnot, pg_temp.uid('d'), 'cycling', 20, 'km', 10, d0, '{"effort":{"effort_minutes":60}}', d0),
    (lother, pg_temp.uid('d'), 'cycling', 20, 'km', 10, now() - interval '3 days', '{"serverReward":true,"effort":{"effort_minutes":60}}', now() - interval '3 days');
  set local session_replication_role = origin;
  logs_before := (select md5(string_agg(t::text, '|' order by t.id)) from public.training_logs t);
  set local role authenticated;
  perform pg_temp.as_user('d');
  v := pg_temp.view(c1, s1);
  assert v->>'phase' = 'ended' and v->'can' = '["attend"]'::jsonb and v->'place' = 'null'::jsonb and (v->'report'->>'present')::integer = 0, 'ended: presence only, no place any more '||v::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, %L)', c1, 'answer', s1, 'no')) = 'SLOT_STARTED', 'no answer after the start';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_log => %L)', c1, 'link', s1, ld)) = 'PRESENCE_REQUIRED', 'a session is linked only after saying one was there';
  perform pg_temp.act(c1, 'attend', s1, p_on => true);
  v := pg_temp.view(c1, s1);
  assert v->'me'->'candidates' = jsonb_build_array(jsonb_build_object('id', ld, 'sport', 'cycling', 'minutes', 90, 'unit', 'km', 'val', 38)), 'd chooses among her own confirmed sessions of the day: '||(v->'me')::text;
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_log => %L)', c1, 'link', s1, lnot)) = 'LOG_NOT_ELIGIBLE', 'a session the server never stamped';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_log => %L)', c1, 'link', s1, lother)) = 'LOG_NOT_ELIGIBLE', 'a session of another day';
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_log => %L)', c1, 'link', s1, lb)) = 'LOG_NOT_ELIGIBLE', 'the session of another member';
  perform pg_temp.act(c1, 'link', s1, p_log => ld);
  v := pg_temp.view(c1, s1);
  assert v->'me'->'linked'->>'id' = ld::text and v->'can' = '["attend", "unlink"]'::jsonb and (v->'report'->>'linked')::integer = 1
     and not (v->'report'->>'visible')::boolean and v->'report'->'minutes' is null, 'one session linked: no total below 3 '||(v->'report')::text;
  -- b and w come too; x, who never answered, came anyway; a was not there.
  perform pg_temp.as_user('b'); perform pg_temp.act(c1, 'attend', s1, p_on => true); perform pg_temp.act(c1, 'link', s1, p_log => lb);
  perform pg_temp.as_user('w'); perform pg_temp.act(c1, 'attend', s1, p_on => true);
  perform pg_temp.as_user('x'); perform pg_temp.act(c1, 'attend', s1, p_on => true); perform pg_temp.act(c1, 'link', s1, p_log => lx);
  perform pg_temp.as_user('a'); perform pg_temp.act(c1, 'attend', s1, p_on => false);
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_log => %L)', c1, 'link', s1, ld)) = 'PRESENCE_REQUIRED', 'a, who was not there, links nothing';
  v := pg_temp.view(c1, s1);
  assert v->'report' = '{"km": 110.0, "linked": 3, "sports": 1, "minutes": 270, "present": 4, "visible": true, "threshold": 3}'::jsonb, 'three linked sessions: the group report '||(v->'report')::text;
  assert not (v::text like '%' || pg_temp.uid('d')::text || '%') and not (v::text like '%qa_ag_%') and not (v::text like '%' || ld::text || '%'), 'a member reads no name and no session of another';
  perform pg_temp.as_user('w');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_log => %L)', c1, 'link', s1, ld)) = 'LOG_NOT_ELIGIBLE', 'a session already linked by its owner';
  perform pg_temp.as_user('x'); perform pg_temp.act(c1, 'attend', s1, p_on => false);
  v := pg_temp.view(c1, s1);
  assert (v->'report'->>'linked')::integer = 2 and not (v->'report'->>'visible')::boolean and v->'me'->'linked' = 'null'::jsonb, 'saying « I was not there » unlinks: back under the threshold';
  perform pg_temp.act(c1, 'attend', s1, p_on => true); perform pg_temp.act(c1, 'link', s1, p_log => lx);
  perform pg_temp.as_user('b');
  assert exists (select 1 from jsonb_array_elements(pg_temp.digest('a')) d where d->>'slot' = s1::text) is false, 'a said she was not there: nothing left to ask';
  assert not exists (select 1 from jsonb_array_elements(pg_temp.digest('w')) d where d->>'slot' = s1::text) and not exists (select 1 from jsonb_array_elements(pg_temp.digest('d')) d where d->>'slot' = s1::text),
    'presence said: nothing left to ask '||pg_temp.digest('w')::text;
  perform pg_temp.as_user('o'); v := pg_temp.view(c1, s1);
  assert (select count(*) from jsonb_array_elements(v->'roster') r where (r->>'attended')::boolean) = 4, 'the organiser reads who declared a presence';
  reset role;
  logs_after := (select md5(string_agg(t::text, '|' order by t.id)) from public.training_logs t);
  assert logs_before = logs_after, 'the journal is never written by an answer, a presence or a link';
  -- Seven days after the end: closed.
  update private.titan_club_event_slots set starts_at = now() - interval '8 days', planned_at = now() - interval '8 days' where id = s1;
  set local role authenticated;
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select pg_temp.act(%L, %L, %L, p_on => false)', c1, 'attend', s1)) = 'SLOT_CLOSED', 'presence is declared within 7 days';
  assert pg_temp.view(c1, s1)->'can' = '[]'::jsonb and (pg_temp.view(c1, s1)->'report'->>'present')::integer = 4, 'the report stays readable';
end $$;

-- Export, measure, erasure.
do $$
declare c1 uuid := pg_temp.club('1'); s5 uuid := pg_temp.slot('5'); v jsonb; e jsonb; m jsonb;
begin
  reset role;
  e := private.titan_social_export_v1(pg_temp.uid('d'))->'clubAgenda';
  assert jsonb_array_length(e) = 1 and e->0->>'role' = 'answered' and e->0->>'answer' = 'yes' and (e->0->>'attended')::boolean and e->0->>'log_id' is not null
     and (e->0->>'reminder')::boolean and e->0->>'promoted_at' is not null, 'd exports her own answer, presence and link '||e::text;
  assert not (e::text like '%' || pg_temp.uid('b')::text || '%'), 'never another member';
  e := private.titan_social_export_v1(pg_temp.uid('o'))->'clubAgenda';
  assert (select count(*) from jsonb_array_elements(e) x where x->>'role' = 'organised') = 2, 'o exports the two series she organised';
  m := private.titan_club_agenda_measure(now() - interval '30 days');
  assert (m->>'occurrencesEnded')::integer = 1 and (m->>'held')::integer = 1 and (m->>'confirmedAnswers')::integer = 3 and (m->>'presences')::integer = 4
     and (m->>'linked')::integer = 3 and (m->>'returnEligible')::integer = 4 and (m->>'series')::integer = 2 and (m->>'weekly')::integer = 1
     and (m->>'moved')::integer = 1 and (m->>'cancelled')::integer = 1 and (m->>'waitlistPromoted')::integer >= 3, 'measure: '||m::text;
  -- Return the following week: b answers yes to an occurrence within 7 days of the ride (s5 brought there).
  update private.titan_club_event_slots set starts_at = now() - interval '4 days' where id = s5;
  update private.titan_club_event_answers set answer = 'yes' where slot_id = s5 and user_id = pg_temp.uid('a');
  insert into private.titan_club_event_answers(slot_id, user_id, answer) values (s5, pg_temp.uid('b'), 'yes');
  m := private.titan_club_agenda_measure(now() - interval '30 days');
  -- b came back with a « yes », d with a confirmed session three days later (lother); w and x did not.
  assert (m->>'returned')::integer = 2 and (m->>'returnEligible')::integer = 4, 'b and d came back the following week: '||m::text;
  assert not (m::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-'), 'counts only, no identifier';
  -- Erasure: an account that held a place to come frees it for the first one waiting.
  update private.titan_club_event_slots set starts_at = now() + interval '3 days' where id = s5;
  delete from private.titan_club_event_answers where slot_id = s5;
  update private.titan_club_events set capacity = 2 where id = current_setting('titan.ag_event2')::uuid;
  insert into private.titan_club_event_answers(slot_id, user_id, answer, answered_at) values
    (s5, pg_temp.uid('a'), 'yes', now() - interval '3 minutes'), (s5, pg_temp.uid('q'), 'yes', now() - interval '2 minutes'),
    (s5, pg_temp.uid('w'), 'waitlist', now() - interval '1 minute');
  delete from auth.users where id = pg_temp.uid('q');
  assert (select answer from private.titan_club_event_answers where slot_id = s5 and user_id = pg_temp.uid('w')) = 'yes'
     and (select count(*) from private.titan_club_event_answers where slot_id = s5 and answer = 'yes') = 2, 'an erased account frees its place';
  -- The organiser's account erased: the series and their history stay, without her.
  delete from auth.users where id = pg_temp.uid('o');
  assert (select count(*) from private.titan_club_events where club_id = c1) = 2 and (select count(*) from private.titan_club_events where created_by is not null and club_id = c1) = 0
     and (select count(*) from private.titan_club_event_changes c join private.titan_club_events e on e.id = c.event_id where e.club_id = c1 and c.by_user is not null) = 0,
     'the agenda keeps its history without the organiser';
end $$;

rollback;
