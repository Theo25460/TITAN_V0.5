-- V11-64 (COM-B3, COM-D3): seasons of 28 days. Created by an administrator for a Monday without overlap, joined on purpose, counted from the
-- join, frozen once at the end and never recomputed, archive stable after a change of rules, aggregates and one's own result only, nothing
-- granted, exported and erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(n,'{}'),(adm,'{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (a, b, adm);
  update public.profiles set role = 'admin' where id = adm;
  perform set_config('titan.se_a',a::text,true); perform set_config('titan.se_b',b::text,true); perform set_config('titan.se_n',n::text,true); perform set_config('titan.se_adm',adm::text,true);
  assert not has_table_privilege('authenticated','private.titan_seasons','select') and not has_table_privilege('authenticated','private.titan_season_members','select'), 'no API grant on the tables';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; cur uuid; old uuid; xp0 integer; cr0 integer; week date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date;
  a uuid := current_setting('titan.se_a')::uuid; b uuid := current_setting('titan.se_b')::uuid; n uuid := current_setting('titan.se_n')::uuid; adm uuid := current_setting('titan.se_adm')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_season_v1();
  assert r->'current' = 'null'::jsonb and jsonb_array_length(r->'archive')=0, 'nothing yet';
  ok:=false; begin perform public.titan_season_admin_save_v1(null,week,'Saison un','x'); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'players cannot create a season';

  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_season_admin_save_v1(null,week+1,'Pas un lundi','x'); exception when others then ok:=sqlerrm='WEEK_MUST_START_MONDAY'; end; assert ok,'a season starts on a Monday';
  ok:=false; begin perform public.titan_season_admin_save_v1(null,week-84,'Passée','x'); exception when others then ok:=sqlerrm='SEASON_IN_THE_PAST'; end; assert ok,'not in the past';
  cur := public.titan_season_admin_save_v1(null,week,'  Saison de la reprise ','Quatre semaines, à ton rythme.');
  ok:=false; begin perform public.titan_season_admin_save_v1(null,week+7,'Chevauchement','x'); exception when others then ok:=sqlerrm='SEASON_OVERLAP'; end; assert ok,'no overlap';
  ok:=false; begin perform public.titan_season_admin_save_v1(cur,week+7,'Saison de la reprise','x'); exception when others then ok:=true; end; assert ok,'dates frozen once the season started';
  perform public.titan_season_admin_save_v1(cur,week,'Saison de la reprise','Quatre semaines, à ton rythme, repos compris.');
  assert (public.titan_season_admin_list_v1()->0->>'rulesVersion')::int = 2, 'a change of wording bumps the rules version';

  -- A joins before recording a session; b never joins.
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_season_join_v1(cur,true); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'a brand-new account does not join';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  perform public.titan_season_join_v1(cur,true);
  perform public.titan_season_join_v1(cur,true);
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_season_members set joined_at = clock_timestamp() where user_id = a;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (a, 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":45}}', clock_timestamp());
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_season_v1();
  assert r->'current'->>'name'='Saison de la reprise' and (r->'current'->>'participants')::int=1 and (r->'current'->>'joined')::boolean and (r->'current'->>'myMinutes')::int=45 and (r->'current'->>'myDays')::int=1 and r->'current'->>'state'='running', 'running, my own result: '||r::text;
  assert not (r->'current' ? 'ranking') and not (r->'current' ? 'leaderboard'), 'no ranking';
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';
  assert jsonb_array_length(public.export_own_data()->'seasons')=1, 'exported';

  -- The season ends: frozen once, with the members of that moment; later activity and rule changes never move the archive.
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_seasons set starts_on = week - 28 where id = cur;   -- shifted back in this rolled-back test only: it ended last week
  update private.titan_season_members set joined_at = (week - 28)::timestamptz where user_id = a;
  update public.training_logs set date = (week - 20)::timestamptz + interval '10 hours', created_at = (week - 20)::timestamptz + interval '11 hours' where user_id = a;
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_season_v1();
  assert r->'current' = 'null'::jsonb and jsonb_array_length(r->'archive')=1, 'the season is archived: '||r::text;
  assert (r->'archive'->0->>'participants')::int=1 and (r->'archive'->0->>'minutes')::int=45 and (r->'archive'->0->'mine'->>'minutes')::int=45 and (r->'archive'->0->'mine'->>'days')::int=1 and (r->'archive'->0->>'rulesVersion')::int=2, 'frozen result: '||r::text;
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (a, 'swimming', 1, 'km', 10, (week - 19)::timestamptz + interval '10 hours', '{"effort":{"effort_minutes":60}}', (week - 19)::timestamptz + interval '11 hours');
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_season_admin_save_v1(cur,week-28,'Renommée','x'); exception when others then ok:=sqlerrm='SEASON_FROZEN'; end; assert ok,'a frozen season cannot be edited';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_season_v1();
  assert (r->'archive'->0->'mine'->>'minutes')::int=45 and (r->'archive'->0->>'minutes')::int=45, 'later activity never moves the archive: '||r::text;
  ok:=false; begin perform public.titan_season_join_v1(cur,true); exception when others then ok:=sqlerrm='SEASON_ENDED'; end; assert ok,'no joining a finished season';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert (public.titan_season_v1()->'archive'->0->'mine') = 'null'::jsonb, 'b did not take part: no result';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_season_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.se_a')::uuid;
begin
  assert exists (select 1 from private.titan_season_members where user_id = a), 'a took part';
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_season_members where user_id = a), 'erased with the account';
end $$;
rollback;
