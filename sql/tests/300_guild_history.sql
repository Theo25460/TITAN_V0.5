-- AUD-44: the chronicle of a guild — weeks against the target, weeks held together, best streak; members only. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); o uuid := gen_random_uuid(); g uuid; w date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date; k integer;
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(o,'{}');
  insert into public.guilds(name, owner_id, code, weekly_effort_target) values ('Les Aubes', a, 'G-HIST1', 100) returning id into g;
  insert into public.guild_members(guild_id, user_id, role) values (g, a, 'owner'), (g, b, 'member');
  -- Weeks -1, -2, -3: 60 + 60 minutes (held); week -4: 30 minutes (not held).
  for k in 1..3 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
      (a, 'running', 5, 'km', 10, ((w - 7 * k + 1)::timestamp + interval '10 hours') at time zone 'Europe/Paris', '{"effort":{"effort_minutes":60}}', ((w - 7 * k + 1)::timestamp + interval '11 hours') at time zone 'Europe/Paris'),
      (b, 'yoga', 30, 'min', 10, ((w - 7 * k + 2)::timestamp + interval '10 hours') at time zone 'Europe/Paris', '{"effort":{"effort_minutes":60}}', ((w - 7 * k + 2)::timestamp + interval '11 hours') at time zone 'Europe/Paris');
  end loop;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (a, 'running', 5, 'km', 10, ((w - 28 + 1)::timestamp + interval '10 hours') at time zone 'Europe/Paris', '{"effort":{"effort_minutes":30}}', ((w - 28 + 1)::timestamp + interval '11 hours') at time zone 'Europe/Paris');
  perform set_config('titan.gh_a',a::text,true); perform set_config('titan.gh_o',o::text,true);
end $$;
set local role authenticated;
do $$
declare r jsonb; a uuid := current_setting('titan.gh_a')::uuid; o uuid := current_setting('titan.gh_o')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_guild_history_v1(6);
  assert jsonb_array_length(r->'weeks') = 6 and (r->>'target')::int = 100, 'six weeks against the target: '||r::text;
  assert (r->>'held')::int = 3 and (r->>'bestStreak')::int = 3, 'three weeks held in a row: '||r::text;
  assert (r->'weeks'->5->>'minutes')::int = 120 and (r->'weeks'->2->>'minutes')::int = 30, 'weekly totals of the members';
  perform set_config('request.jwt.claims',json_build_object('sub',o,'role','authenticated')::text,true);
  assert public.titan_guild_history_v1(6) is null, 'outside the guild: nothing';
end $$;
rollback;
