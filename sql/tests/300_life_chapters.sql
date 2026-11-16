-- AUD-48: life chapters — named periods told in figures, one open at a time, own rows only, validation, export, erasure. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (a, 'running', 5, 'km', 10, now() - interval '40 days', '{"effort":{"effort_minutes":45}}', now() - interval '40 days'),
    (a, 'running', 8, 'km', 10, now() - interval '10 days', '{"effort":{"effort_minutes":60}}', now() - interval '10 days');
  perform set_config('titan.lc_a',a::text,true); perform set_config('titan.lc_b',b::text,true);
  assert not has_table_privilege('authenticated','private.titan_life_chapters','select'), 'no API grant';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; c1 uuid; c2 uuid; today date := (now() at time zone 'Europe/Paris')::date;
  a uuid := current_setting('titan.lc_a')::uuid; b uuid := current_setting('titan.lc_b')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_chapter_start_v1('x'); exception when others then ok:=sqlerrm='CHAPTER_TITLE_INVALID'; end; assert ok,'title too short';
  ok:=false; begin perform public.titan_chapter_start_v1('Futur', today + 3); exception when others then ok:=sqlerrm='CHAPTER_DATE_INVALID'; end; assert ok,'no chapter in the future';
  c1 := public.titan_chapter_start_v1('Reprise après blessure', today - 60);
  c2 := public.titan_chapter_start_v1('Prépa semi-marathon', today - 20);
  r := public.titan_chapters_v1();
  assert jsonb_array_length(r) = 2, 'two chapters';
  assert (r->0->>'title') = 'Prépa semi-marathon' and (r->0->>'open')::boolean and (r->0->>'minutes')::int = 60 and (r->0->>'days')::int = 1, 'the open chapter tells its figures: '||(r->0)::text;
  assert not (r->1->>'open')::boolean and (r->1->>'endsOn')::date = today - 21 and (r->1->>'minutes')::int = 45, 'the previous one closed the day before: '||(r->1)::text;
  assert public.titan_chapter_close_v1(c2), 'closed';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_chapters_v1()) = 0 and not public.titan_chapter_delete_v1(c1), 'another account sees and deletes nothing';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.lc_a')::uuid;
begin
  assert jsonb_array_length(private.titan_export_extras_v1(a)->'lifeChapters') = 2 and private.titan_export_extras_v1(a) ? 'timeCapsules', 'exported with the other parts';
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_life_chapters where user_id = a), 'erased with the account';
end $$;
rollback;
