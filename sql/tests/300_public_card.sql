-- TITAN 300 — public card checks. Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid := gen_random_uuid();
begin
  perform set_config('titan.qa_a', a::text, true);
  insert into auth.users(id, raw_user_meta_data) values (a, '{}');
  insert into public.profiles(id, username, credits, level, xp) values (a, 'qa_public', 0, 8, 0)
  on conflict (id) do update set username = excluded.username, level = excluded.level;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details, client_event_id, created_at)
  values (a, 'running', 'cardio', 10, 'km', 0, now() - interval '2 days', '{"effort":{"minutes":52},"note":"genou sensible","bio":{"weight":71}}', gen_random_uuid(), now() - interval '2 days'),
         (a, 'running', 'cardio', 12, 'km', 0, now() - interval '9 days', '{"effort":{"minutes":64}}', gen_random_uuid(), now() - interval '9 days'),
         (a, 'yoga', 'mobility', 30, 'min', 0, now() - interval '1 day', '{"effort":{"minutes":30}}', gen_random_uuid(), now() - interval '1 day');
end $$;

-- Nothing is public until the athlete says so.
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
begin
  begin
    perform public.titan_public_card_settings();
    assert false, 'anon cannot read settings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.titan_public_cards;
    assert false, 'anon cannot read the table';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_a'), 'role', 'authenticated')::text, true);
do $$
declare s jsonb; s2 jsonb;
begin
  s := public.titan_public_card_settings();
  assert (s ->> 'enabled')::boolean = false and s ->> 'slug' is null, 'off by default';
  s := public.titan_public_card_save(false, '{}');
  assert s ->> 'slug' ~ '^[a-z0-9]{10}$', 'slug minted';
  perform set_config('titan.qa_slug', s ->> 'slug', true);
  begin
    perform 1 from public.titan_public_cards;
    assert false, 'authenticated cannot read the table directly';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
begin
  perform public.titan_public_card(current_setting('titan.qa_slug'));
  assert false, 'disabled card is not readable';
exception when others then
  assert sqlerrm = 'CARD_NOT_FOUND', sqlerrm;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_a'), 'role', 'authenticated')::text, true);
select public.titan_public_card_save(true, '{"name": false, "titles": false}');

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare c jsonb; txt text;
begin
  c := public.titan_public_card(upper(current_setting('titan.qa_slug')));
  txt := c::text;
  assert c ->> 'name' = 'Athlète TITAN', 'name hidden on request';
  assert (c ->> 'level')::int = 8, 'level shown';
  assert (c -> 'totals' ->> 'sessions')::int = 3 and (c -> 'totals' ->> 'minutes')::int = 146 and (c -> 'totals' ->> 'weeks')::int >= 2, 'totals: ' || (c -> 'totals')::text;
  assert c -> 'sports' -> 0 ->> 'sport' = 'running' and (c -> 'sports' -> 0 ->> 'sessions')::int = 2, 'top sport first';
  assert c -> 'titles' is null, 'titles hidden on request';
  assert txt not like '%genou%' and txt not like '%weight%' and txt not like '%qa_public%' and txt not like '%' || current_setting('titan.qa_a') || '%', 'no note, no weight, no name, no id';
end $$;

-- A new link retires the old QR code.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_a'), 'role', 'authenticated')::text, true);
do $$
declare s jsonb;
begin
  s := public.titan_public_card_save(null, null, true);
  assert s ->> 'slug' <> current_setting('titan.qa_slug') and (s ->> 'enabled')::boolean, 'new link, still enabled';
end $$;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
begin
  perform public.titan_public_card(current_setting('titan.qa_slug'));
  assert false, 'old link is dead';
exception when others then
  assert sqlerrm = 'CARD_NOT_FOUND', sqlerrm;
end $$;
rollback;
