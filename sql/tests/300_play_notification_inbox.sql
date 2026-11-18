-- Incident of 18 November 2026: Google Play notifications are KEPT in a private inbox and acknowledged instead of answered 503 for days.
-- Proves: one row per Pub/Sub message (duplicates recognised), processed rows answer 'done', the unauthenticated quota, the claim schedules the
-- next try before processing (bounded back-off, no loop), finish closes or leaves pending, and no API role can reach any of it.
-- Synthetic data, full rollback.
begin;
do $$
declare r text; n integer; t timestamptz; ok boolean;
begin
  assert to_regclass('private.titan_play_notification_inbox') is not null, 'inbox table exists';
  assert (select relrowsecurity from pg_class where oid = 'private.titan_play_notification_inbox'::regclass), 'RLS is on';

  r := public.titan_record_play_notification_v1('msg-1', 'synthetic-token-0123456789', 'subscription', 4, true);
  assert r = 'new', 'first delivery is kept: ' || r;
  r := public.titan_record_play_notification_v1('msg-1', 'synthetic-token-0123456789', 'subscription', 4, true);
  assert r = 'duplicate', 'second delivery of the same message is recognised: ' || r;
  assert (select deliveries from private.titan_play_notification_inbox where message_id = 'msg-1') = 2, 'deliveries counted';
  assert (select count(*) from private.titan_play_notification_inbox where message_id = 'msg-1') = 1, 'one row per message';

  ok := false; begin perform public.titan_record_play_notification_v1('msg-bad', 'short', 'subscription', 4, true); exception when others then ok := sqlerrm = 'PLAY_NOTIFICATION_INVALID'; end;
  assert ok, 'a malformed token is refused';
  ok := false; begin perform public.titan_record_play_notification_v1('msg-bad', 'synthetic-token-0123456789', 'oneTime', 4, true); exception when others then ok := sqlerrm = 'PLAY_NOTIFICATION_INVALID'; end;
  assert ok, 'an unknown kind is refused';

  -- Claim: the row is returned once, its next try is scheduled BEFORE processing, a second claim right away returns nothing.
  select count(*) into n from public.titan_play_notifications_due_v1(10);
  assert n = 1, 'one row due';
  select next_attempt_at into t from private.titan_play_notification_inbox where message_id = 'msg-1';
  assert t > now() + interval '4 minutes' and t <= now() + interval '24 hours', 'next try scheduled with back-off';
  select count(*) into n from public.titan_play_notifications_due_v1(10);
  assert n = 0, 'a claimed row is not handed out again before its back-off';

  -- Transient failure: still pending. Final outcome: closed, and a new delivery answers 'done'.
  assert public.titan_finish_play_notification_v1('msg-1', 'google-503', false), 'transient outcome recorded';
  assert (select processed_at is null from private.titan_play_notification_inbox where message_id = 'msg-1'), 'still pending after a transient failure';
  assert public.titan_finish_play_notification_v1('msg-1', 'applied-active', true), 'final outcome recorded';
  assert (select processed_at is not null and outcome = 'applied-active' from private.titan_play_notification_inbox where message_id = 'msg-1'), 'closed';
  r := public.titan_record_play_notification_v1('msg-1', 'synthetic-token-0123456789', 'subscription', 4, true);
  assert r = 'done', 'a late re-delivery of a processed message is acknowledged without processing: ' || r;
  assert not public.titan_finish_play_notification_v1('msg-1', 'again', true), 'a closed row is not rewritten';

  -- After 30 attempts a transient failure closes the row (no endless retry).
  perform public.titan_record_play_notification_v1('msg-2', 'synthetic-token-9876543210', 'voided', null, true);
  update private.titan_play_notification_inbox set attempts = 30 where message_id = 'msg-2';
  perform public.titan_finish_play_notification_v1('msg-2', 'google-503', false);
  assert (select processed_at is not null from private.titan_play_notification_inbox where message_id = 'msg-2'), 'abandoned after 30 attempts';

  -- Unauthenticated quota: 5 000 pending unauthenticated rows at most.
  insert into private.titan_play_notification_inbox (message_id, purchase_token, kind, authenticated)
  select 'flood-' || g, 'synthetic-token-flood-' || lpad(g::text, 6, '0'), 'subscription', false from generate_series(1, 5000) g;
  r := public.titan_record_play_notification_v1('msg-3', 'synthetic-token-1111111111', 'subscription', 4, false);
  assert r = 'full', 'the unauthenticated quota holds: ' || r;
  r := public.titan_record_play_notification_v1('msg-4', 'synthetic-token-2222222222', 'subscription', 4, true);
  assert r = 'new', 'an authenticated notification is still kept when the unauthenticated quota is full: ' || r;
end $$;

-- No API role reaches the inbox or its functions.
do $$
declare role_name text; fn text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(role_name, 'private.titan_play_notification_inbox', 'select'), role_name || ' cannot read the inbox';
    foreach fn in array array['public.titan_record_play_notification_v1(text,text,text,integer,boolean)', 'public.titan_play_notifications_due_v1(integer)', 'public.titan_finish_play_notification_v1(text,text,boolean)'] loop
      assert not has_function_privilege(role_name, fn, 'execute'), role_name || ' cannot execute ' || fn;
    end loop;
  end loop;
  assert has_function_privilege('service_role', 'public.titan_record_play_notification_v1(text,text,text,integer,boolean)', 'execute'), 'the server function can keep notifications';
  assert not has_function_privilege('authenticated', 'public.titan_play_checkout_ready_v1(uuid)', 'execute'), 'readiness stays server-only';
end $$;

-- Checkout readiness requires the inbox and the V18 sweep, plus a real non-anonymous profile.
do $$
declare a uuid := gen_random_uuid();
begin
  assert not public.titan_play_checkout_ready_v1(a), 'no profile: not ready';
  insert into auth.users(id, raw_user_meta_data, is_anonymous) values (a, '{}', false);
  insert into public.profiles(id, username) values (a, 'qa_inbox_ready') on conflict (id) do nothing;
  assert public.titan_play_checkout_ready_v1(a), 'profile and up-to-date backend: ready';
end $$;
rollback;
