-- D11: the start-up diagnostic keeps at most 20 reports per account and day, answers every call the same way, and expires.
-- D8: the public avatars bucket only takes small images.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}');
  perform set_config('titan.v131_cap_a', a::text, true);
  perform set_config('titan.v131_cap_b', b::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_cap_a'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; kept int := 0; skipped int := 0;
begin
  for i in 1..30 loop
    r := public.titan_submit_cache_reconciliation(jsonb_build_object('user', jsonb_build_object('id', auth.uid(), 'level', i)));
    assert r->>'ok' = 'true', 'every call still answers ok';
    assert r ? 'differences' and r ? 'riskFlags', 'the comparison is still returned';
    if r->>'reportId' is null then skipped := skipped + 1; else kept := kept + 1; end if;
  end loop;
  assert kept = 20, format('20 reports kept, got %s', kept);
  assert skipped = 10, format('10 calls answered without a stored report, got %s', skipped);
end $$;

-- Another account is not affected by A's cap.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_cap_b'), 'role', 'authenticated')::text, true);
do $$
begin
  assert public.titan_submit_cache_reconciliation('{"user":{}}'::jsonb)->>'reportId' is not null, 'B keeps its own allowance';
end $$;
reset role;

do $$
declare a uuid := current_setting('titan.v131_cap_a')::uuid;
begin
  assert (select count(*) from public.titan_cache_reconciliation_reports where user_id = a) = 20, 'exactly 20 rows for A';
  -- A day later the allowance comes back.
  update public.titan_cache_reconciliation_reports set created_at = now() - interval '25 hours' where user_id = a;
  insert into public.titan_cache_reconciliation_reports(user_id) values (a);
  assert (select count(*) from public.titan_cache_reconciliation_reports where user_id = a) = 21, 'allowance restored after 24 hours';

  -- Retention: the rule exists and a 91-day-old report is purged, a recent one stays.
  assert exists(select 1 from private.titan_retention_rules where id = 'cache_reconciliation' and keep = interval '90 days'),
    'retention rule declared';
  update public.titan_cache_reconciliation_reports set created_at = now() - interval '91 days'
   where id = (select id from public.titan_cache_reconciliation_reports where user_id = a order by created_at limit 1);
  perform private.titan_purge_expired_data_v1();
  assert (select count(*) from public.titan_cache_reconciliation_reports where user_id = a) = 20, 'one expired report purged';

  assert not has_function_privilege('authenticated', 'private.titan_cache_reconciliation_daily_cap()', 'EXECUTE'),
    'the cap is not callable by players';

  assert (select file_size_limit = 2097152 and allowed_mime_types = array['image/png','image/jpeg','image/webp']
            from storage.buckets where id = 'avatars'), 'avatars bucket bounded to 2 MB images';
end $$;
rollback;
