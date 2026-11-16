-- AUD-40: time capsules — written by oneself, hidden until their date, then shown with the practice then and now; own rows only,
-- validation, limits, export and erasure with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (a, 'running', 5, 'km', 10, now() - interval '2 days', '{"effort":{"effort_minutes":45}}', now() - interval '2 days');
  perform set_config('titan.tc_a',a::text,true); perform set_config('titan.tc_b',b::text,true);
  assert not has_table_privilege('authenticated','private.titan_time_capsules','select'), 'no API grant on the capsules';
  assert not has_function_privilege('anon','public.titan_capsule_create_v1(text,integer)','execute'), 'anonymous cannot write';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; a uuid := current_setting('titan.tc_a')::uuid; b uuid := current_setting('titan.tc_b')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_capsule_create_v1('Bonjour', 2); exception when others then ok:=sqlerrm='CAPSULE_DELAY_INVALID'; end; assert ok,'3, 6 or 12 months only';
  ok:=false; begin perform public.titan_capsule_create_v1('   ', 3); exception when others then ok:=sqlerrm='CAPSULE_MESSAGE_INVALID'; end; assert ok,'an empty message is refused';
  ok:=false; begin perform public.titan_capsule_create_v1(repeat('x', 501), 3); exception when others then ok:=sqlerrm='CAPSULE_MESSAGE_INVALID'; end; assert ok,'500 characters at most';
  r := public.titan_capsule_create_v1('Continue, tu tiens tes semaines.', 6);
  assert (r->>'deliverOn')::date > current_date + 150, 'delivered in about six months: '||r::text;
  r := public.titan_capsules_v1();
  assert jsonb_array_length(r->'waiting') = 1 and jsonb_array_length(r->'delivered') = 0, 'waiting only';
  assert not (r::text like '%Continue, tu tiens%'), 'the message stays hidden before its date';
  perform set_config('titan.tc_id', r->'waiting'->0->>'id', true);
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_capsules_v1()->'waiting') = 0, 'another account sees nothing';
end $$;
reset role;
do $$ begin
  update private.titan_time_capsules set deliver_on = current_date - 1 where id = current_setting('titan.tc_id')::uuid;
end $$;
set local role authenticated;
do $$
declare r jsonb; a uuid := current_setting('titan.tc_a')::uuid; b uuid := current_setting('titan.tc_b')::uuid; id uuid := current_setting('titan.tc_id')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert not public.titan_capsule_open_v1(id), 'another account cannot open it';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_capsules_v1()->'delivered'->0;
  assert r->>'message' = 'Continue, tu tiens tes semaines.' and (r->'then'->>'minutes')::int = 45 and (r->'then'->>'days')::int = 1 and not (r->>'opened')::boolean, 'delivered with its then: '||r::text;
  assert r ? 'now', 'and the practice now';
  assert public.titan_capsule_open_v1(id), 'opened';
  assert (public.titan_capsules_v1()->'delivered'->0->>'opened')::boolean, 'marked as opened';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.tc_a')::uuid;
begin
  assert jsonb_array_length(private.titan_export_extras_v1(a)->'timeCapsules') = 1, 'exported with the account';
  assert private.titan_export_extras_v1(a) ? 'cadenceWeekClaims' and private.titan_export_extras_v1(a) ? 'journey', 'the other export parts stay';
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_time_capsules where user_id = a), 'erased with the account';
end $$;
rollback;
