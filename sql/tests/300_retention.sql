-- TITAN 300 — retention checks: active members are never deleted. Synthetic identities, rolled back.
begin;
do $$
declare
  active_session uuid := gen_random_uuid();   -- signed in 4 months ago, session refreshed yesterday
  active_logs uuid := gen_random_uuid();      -- signed in 5 months ago, logged a session last week
  plus_member uuid := gen_random_uuid();      -- dormant 4 years but TITAN+ still active
  dormant uuid := gen_random_uuid();          -- nothing for 4 years
  abandoned uuid := gen_random_uuid();        -- never confirmed, 2 months old, no data
  fresh_signup uuid := gen_random_uuid();     -- never confirmed, 3 days old
  n integer;
begin
  insert into auth.users(id, email_confirmed_at, last_sign_in_at, created_at) values
    (active_session, now() - interval '1 year', now() - interval '4 months', now() - interval '1 year'),
    (active_logs, now() - interval '1 year', now() - interval '5 months', now() - interval '1 year'),
    (plus_member, now() - interval '5 years', now() - interval '4 years', now() - interval '5 years'),
    (dormant, now() - interval '5 years', now() - interval '4 years', now() - interval '5 years'),
    (abandoned, null, null, now() - interval '2 months'),
    (fresh_signup, null, null, now() - interval '3 days');
  insert into public.profiles(id, username, is_elite, updated_at) values
    (active_session, 'qa_session', false, now() - interval '4 months'),
    (active_logs, 'qa_logs', false, now() - interval '5 months'),
    (plus_member, 'qa_plus', true, now() - interval '4 years'),
    (dormant, 'qa_dormant', false, now() - interval '4 years'),
    (abandoned, 'qa_abandoned', false, now() - interval '2 months'),
    (fresh_signup, 'qa_fresh', false, now() - interval '3 days')
  on conflict (id) do update set is_elite = excluded.is_elite, updated_at = excluded.updated_at;
  update public.profiles set updated_at = now() - interval '4 years' where id in (plus_member, dormant);
  insert into auth.sessions(user_id, created_at, updated_at, refreshed_at) values (active_session, now() - interval '4 months', now() - interval '1 day', (now() - interval '1 day')::timestamp);
  perform set_config('request.jwt.claims', json_build_object('sub', active_logs, 'role', 'authenticated')::text, true);
  insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details, client_event_id, created_at)
  values (active_logs, 'running', 'cardio', 8, 'km', 0, now() - interval '7 days', '{}', gen_random_uuid(), now() - interval '7 days');
  perform set_config('request.jwt.claims', '', true);

  n := public.delete_inactive_users();
  assert exists (select 1 from auth.users where id = active_session), 'open session keeps the account';
  assert exists (select 1 from auth.users where id = active_logs), 'recent sessions keep the account';
  assert exists (select 1 from auth.users where id = plus_member), 'TITAN+ in progress is never purged';
  assert exists (select 1 from auth.users where id = fresh_signup), 'recent unconfirmed sign-up kept';
  assert not exists (select 1 from auth.users where id = dormant), 'four dormant years: deleted';
  assert not exists (select 1 from auth.users where id = abandoned), 'abandoned sign-up: deleted';
  assert not exists (select 1 from public.profiles where id = dormant), 'profile follows the account';
end $$;
rollback;
