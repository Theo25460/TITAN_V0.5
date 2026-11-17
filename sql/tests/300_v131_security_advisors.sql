-- V1.3.1 security review (migration 20261114170000). Synthetic accounts only, full rollback.
-- Covered: the day check of daily intents runs with an empty search_path and still refuses a day out of range; the account export
-- succeeds for an account with a Garmin link and a buddy pair and carries the two keys production had lost; the export carries the
-- sections added by this migration, with the account's own rows only and without staff identifiers, internal notes, token digests or
-- purchase tokens; the internal export functions are closed to the API roles; an anonymous bug report is bounded and cannot choose
-- its triage fields, while an ordinary report still goes through.
begin;
do $$
declare k text; v uuid;
begin
  -- a is the account under test, b holds the same kinds of rows (must never appear in a's export), c is blocked by a, z is staff.
  foreach k in array array['a','b','c','z'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_sa_' || k where id = v;
    perform set_config('titan.sa_' || k, v::text, true);
  end loop;
  update public.profiles set role = 'admin' where id = current_setting('titan.sa_z')::uuid;
end $$;

-- 1. Structure: search_path, volatility, grants.
do $$
declare f regprocedure;
begin
  assert exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = 'private.titan_intent_day_ok(date)'::regprocedure and c = 'search_path=""'),
    'the day check runs with an empty search_path';
  assert (select provolatile = 's' from pg_proc where oid = 'private.titan_intent_day_ok(date)'::regprocedure), 'the day check reads current_date: STABLE';
  assert private.titan_intent_day_ok(current_date) and private.titan_intent_day_ok(current_date + 1) and private.titan_intent_day_ok(current_date - 1)
    and not private.titan_intent_day_ok(current_date + 2) and not private.titan_intent_day_ok(current_date - 2) and not private.titan_intent_day_ok(null),
    'same window as before: yesterday, today, tomorrow';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
    'no function of the application schemas is left with a caller-controlled search_path';
  foreach f in array array[
    'private.titan_export_extras_v1(uuid)'::regprocedure,
    'private.titan_export_extras_v131_v1(uuid)'::regprocedure,
    'private.titan_export_extras_before_rpg_v1(uuid)'::regprocedure,
    'private.titan_intent_day_ok(date)'::regprocedure
  ] loop
    assert not has_function_privilege('public', f, 'EXECUTE') and not has_function_privilege('anon', f, 'EXECUTE')
      and not has_function_privilege('authenticated', f, 'EXECUTE'), 'no API role can execute ' || f;
  end loop;
  assert (select prosrc like '%''last_event_at'', g.last_event_at%' and prosrc like '%''ended_at'', b.ended_at%'
            from pg_proc where oid = 'private.titan_export_extras_before_rpg_v1(uuid)'::regprocedure),
    'the export names every value it returns (an unnamed value makes jsonb_build_object fail)';
end $$;

-- Rows an account can hold in the tables the export used to leave out (written by the server paths in production).
do $$
declare a uuid := current_setting('titan.sa_a')::uuid; b uuid := current_setting('titan.sa_b')::uuid;
  c uuid := current_setting('titan.sa_c')::uuid; z uuid := current_setting('titan.sa_z')::uuid; u uuid; l uuid; g uuid; s uuid;
begin
  insert into private.titan_garmin_links(user_id, garmin_user_id, last_event_at) values (a, 'qa-garmin-a', now()), (b, 'qa-garmin-b', now());
  insert into private.titan_buddies(inviter_id, invitee_id, status, starts_on, ends_on, ended_at, ended_by)
    values (a, c, 'ended', current_date - 20, current_date - 6, now() - interval '6 days', a);
  insert into public.guilds(name, owner_id, code) values ('Guilde QA SA', b, 'G-QASA01') returning id into g;
  foreach u in array array[a, b] loop
    insert into public.coach_links(coach_id, athlete_id, since_date) values (z, u, current_date - 3) returning id into l;
    insert into public.coach_assignments(link_id, title, sport, planned_date) values (l, 'Sortie longue', 'Course à pied', current_date + 1);
    insert into private.coach_invites(coach_id, token_hash, expires_at) values (u, encode(extensions.digest(u::text, 'sha256'), 'hex'), now() + interval '7 days');
    insert into private.titan_appeals(user_id, kind, message, status, decided_by, decision_note, decided_at)
      values (u, 'account', 'Je conteste cette décision.', 'declined', z, 'Décision maintenue.', now());
    insert into private.titan_analysis_views(id, user_id, name, kind, options) values (gen_random_uuid(), u, 'Vue QA', 'report', '{"period":"month"}');
    insert into private.titan_verification_requests(user_id, requested_by, message, status, answer, answered_at)
      values (u, z, 'Peux-tu préciser cette séance ?', 'answered', 'Oui, sortie en club.', now());
    insert into private.titan_support_requests(user_id, request_id, category, message, reply_email, reply_allowed, notification_provider_id)
      values (u, gen_random_uuid(), 'compte', 'Question de test sur mon compte.', 'qa@example.test', true, 'provider-secret-' || u);
    insert into public.titan_user_blocks(blocker_id, blocked_id, reason) values (u, c, 'test');
    insert into public.titan_moderation_reports(reporter_id, target_user_id, reason, resolved_by, resolution_note) values (u, c, 'spam', z, 'note interne ' || u);
    insert into public.bug_reports(user_id, title, admin_note) values (u, 'Bug QA', 'note interne ' || u);
    insert into public.contact_messages(user_id, name, email, subject, message, admin_note) values (u, 'QA', 'qa@example.test', 'Sujet', 'Message de contact de test.', 'note interne ' || u);
    insert into public.combat_logs(user_id, enemy_key, enemy_type) values (u, 'qa-mob', 'MOB');
    insert into private.titan_entitlements(source, external_id, user_id, is_active, status, product_id, last_event_at)
      values ('manual', 'purchase-token-' || u, u, true, 'active', 'titan01', now());
    insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details)
      values (u, 'Course à pied', 'cardio', 30, 'min', 10, now(), '{}') returning id into s;
    insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at) values (s, u, 10, 1, now() + interval '1 day');
    insert into public.titan_weekly_reward_usage(user_id, week_start, xp_awarded, credits_awarded) values (u, public.titan_week_start(now()), 10, 1)
      on conflict (user_id, week_start) do nothing;
    insert into private.titan_economy_journal(user_id, actor_id, kind, changes) values (u, z, 'economy', '{"credits":[200,210]}');
    insert into public.analytics_events(user_id, event_name, page, source, metadata) values (u, 'page_view', '/journal', 'web', '{"consent":"granted"}');
    insert into private.titan_moderation_decisions(user_id, admin_id, decision, reason, snapshot) values (u, z, 'watch', 'Surveillance de test.', jsonb_build_object('internal', 'snapshot-' || u));
    insert into public.guild_messages(guild_id, sender_id, sender_name, content) values (g, u, 'qa', 'Message de guilde');
    insert into public.titan_challenges(creator_id, title, metric, sport, target, starts_at, ends_at) values (u, 'Défi QA', 'effort_minutes', null, 100, now(), now() + interval '7 days');
    insert into public.contest_entries(user_id, contest_key) values (u, 'qa-contest');
  end loop;
  insert into public.referrals(referrer_user_id, referred_user_id, referral_code) values (a, c, 'QA-REF-A');
end $$;

-- 2. The export of the account: complete, its own rows only, nothing internal.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.sa_a'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; t text; k text;
  b text := current_setting('titan.sa_b'); z text := current_setting('titan.sa_z');
  need text[] := array['coachLinks','coachAssignments','coachInvites','appeals','analysisViews','verificationRequests','supportRequests','blocks',
    'moderationReportsFiled','coachMessageReports','bugReports','contactMessages','combatLogs','entitlements','rewardHolds','weeklyRewardUsage',
    'economyJournal','usageEvents','moderationDecisions','guildMessages','intentCheersGiven','buddyNudgesSent','challengesCreated',
    'challengeLinksCreated','contestEntries','referrals'];
  one text[] := array['coachLinks','coachAssignments','coachInvites','appeals','analysisViews','verificationRequests','supportRequests','blocks',
    'moderationReportsFiled','bugReports','contactMessages','combatLogs','entitlements','rewardHolds','weeklyRewardUsage','usageEvents',
    'moderationDecisions','guildMessages','challengesCreated','contestEntries','referrals'];
begin
  r := public.export_own_data();
  t := r::text;
  assert jsonb_array_length(r -> 'garminLink') = 1 and (r -> 'garminLink' -> 0) ? 'last_event_at', 'an account linked to Garmin can export, with the date of the last event';
  assert jsonb_array_length(r -> 'buddies') = 1 and (r -> 'buddies' -> 0) ? 'ended_at', 'an account with a buddy pair can export, with the end of the pair';
  foreach k in array need loop
    assert r ? k and jsonb_typeof(r -> k) = 'array', 'export has the list ' || k;
  end loop;
  foreach k in array one loop
    assert jsonb_array_length(r -> k) = 1, 'exactly the account''s own row in ' || k || ' (found ' || jsonb_array_length(r -> k) || ')';
  end loop;
  assert jsonb_array_length(r -> 'economyJournal') >= 1, 'the movements of the account are exported';
  assert r -> 'coachLinks' -> 0 ->> 'role' = 'athlete' and r -> 'referrals' -> 0 ->> 'role' = 'referrer', 'the side of the account is named, not the other party';
  assert r -> 'appeals' -> 0 ->> 'decision_note' = 'Décision maintenue.', 'the answer given to the player is part of the export';
  assert position(b in t) = 0, 'nothing of another account';
  assert position(z in t) = 0, 'no staff identifier';
  assert position('note interne' in t) = 0 and position('snapshot-' in t) = 0, 'no internal note or moderation snapshot';
  assert position('purchase-token-' in t) = 0 and position('provider-secret-' in t) = 0 and position('token_hash' in t) = 0, 'no purchase token, provider id or token digest';
end $$;
reset role;

-- 3. Legacy bug report intake: bounded, intake defaults only.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare bad text[] := array[
  $q$insert into public.bug_reports(title, description) values ('Titre correct', repeat('d', 5001))$q$,
  $q$insert into public.bug_reports(title) values (repeat('t', 201))$q$,
  $q$insert into public.bug_reports(title) values ('  ')$q$,
  $q$insert into public.bug_reports(title, technical_details) values ('Titre correct', jsonb_build_object('blob', repeat('x', 9000)))$q$,
  $q$insert into public.bug_reports(title, status) values ('Titre correct', 'fixed')$q$,
  $q$insert into public.bug_reports(title, admin_note) values ('Titre correct', 'note écrite par l''expéditeur')$q$,
  $q$insert into public.bug_reports(title, severity) values ('Titre correct', 'apocalypse')$q$,
  $q$insert into public.bug_reports(title, screenshot_url) values ('Titre correct', repeat('u', 501))$q$];
  q text; refused boolean;
begin
  foreach q in array bad loop
    refused := false;
    begin execute q; exception when insufficient_privilege then refused := true; end;
    assert refused, 'anonymous intake accepted: ' || left(q, 90);
  end loop;
  insert into public.bug_reports(title, description, page_url, severity, technical_details)
    values ('Bouton inactif', 'Le bouton ne répond pas.', '/journal', 'low', '{"ua":"test"}');
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.sa_a'), 'role', 'authenticated')::text, true);
do $$
declare refused boolean := false;
begin
  insert into public.bug_reports(user_id, title) values (auth.uid(), 'Signalement d''un compte');
  begin
    insert into public.bug_reports(user_id, title, status, admin_note) values (auth.uid(), 'Signalement d''un compte', 'fixed', 'x');
  exception when insufficient_privilege then refused := true; end;
  assert refused, 'a signed-in player cannot choose the triage fields either';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.bug_reports where title in ('Bouton inactif', 'Signalement d''un compte')) = 2, 'ordinary reports still arrive';
  assert exists (select 1 from pg_policy where polrelid = 'public.bug_reports'::regclass and polname = 'bug_reports_intake_bounds_v131' and not polpermissive and polcmd = 'a'),
    'the bounds are a restrictive INSERT policy';
  assert has_table_privilege('anon', 'public.bug_reports', 'INSERT') and has_table_privilege('anon', 'public.contact_messages', 'INSERT'),
    'the intake grants themselves are unchanged';
end $$;
rollback;
