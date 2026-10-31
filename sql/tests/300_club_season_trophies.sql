-- V11-76 (COM-D7, automatic part): a club earns the season trophy only from frozen results, with enough members who were in the club before the season ended;
-- awarded once, to nobody in particular; recruiting afterwards does not count. Full rollback.
begin;
do $$
declare u uuid[] := array[]::uuid[]; i integer;
begin
  for i in 1..6 loop u := u || gen_random_uuid(); end loop;
  insert into auth.users(id,raw_user_meta_data) select x,'{}' from unnest(u) x;
  update public.profiles set created_at = now() - interval '9 days' where id = any(u);
  perform set_config('titan.ct_u',array_to_string(u,','),true);
  -- A closed season ended last week (frozen results for u1..u3 and u6) and an open one (nothing frozen).
  insert into private.titan_seasons(name, starts_on, closed_at, result) values ('Saison d’automne', date_trunc('week', now() - interval '6 weeks')::date, now() - interval '3 days', '{}'::jsonb);
  insert into private.titan_season_members(season_id, user_id, final_minutes, final_days) select s.id, x, 200, 5 from private.titan_seasons s, unnest(array[u[1], u[2], u[3], u[6]]) x where s.name = 'Saison d’automne';
end $$;
set local role authenticated;
do $$
declare club uuid; code text; i integer;
  u uuid[] := string_to_array(current_setting('titan.ct_u'), ',')::uuid[];
begin
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  club := public.titan_club_create_v1('Club de la saison','x',false);
  code := public.titan_club_my_v1()->0->>'code';
  assert public.titan_club_trophy_sync_v1()=0, 'a club of one gets nothing';
  for i in 2..5 loop
    perform set_config('request.jwt.claims',json_build_object('sub',u[i],'role','authenticated')::text,true);
    perform public.titan_club_join_v1(code,null);
  end loop;
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  assert public.titan_club_trophy_sync_v1()=0, 'members who came after the season ended do not count, whatever they did during it';
  assert jsonb_array_length(public.titan_club_my_v1()->0->'trophies')=0, 'no trophy yet';
  -- A second club whose single season participant is its creator.
  perform set_config('request.jwt.claims',json_build_object('sub',u[6],'role','authenticated')::text,true);
  perform public.titan_club_create_v1('Petit club','x',false);
end $$;
reset role;
-- Fixtures: the five members of the first club were in it before the season ended (three of them took part in the season: 3 of 5 is more than half);
-- the second club also has an older creator.
update private.titan_club_members set joined_at = now() - interval '30 days';
set local role authenticated;
do $$
declare ok boolean; r jsonb; i integer;
  u uuid[] := string_to_array(current_setting('titan.ct_u'), ',')::uuid[];
begin
  perform set_config('request.jwt.claims',json_build_object('sub',u[6],'role','authenticated')::text,true);
  assert public.titan_club_trophy_sync_v1()=0, 'one participant is not enough';
  assert jsonb_array_length(public.titan_club_my_v1()->0->'trophies')=0, 'no trophy for the small club';
  perform set_config('request.jwt.claims',json_build_object('sub',u[4],'role','authenticated')::text,true);
  assert public.titan_club_trophy_sync_v1()=1, 'the club earns the season trophy, even if a member who did not take part asks';
  r := public.titan_club_my_v1();
  assert jsonb_array_length(r->0->'trophies')=1 and r->0->'trophies'->0->>'title'='A traversé Saison d’automne ensemble' and r->0->'trophies'->0->>'note'='Attribué automatiquement.', 'the members read it: '||r::text;
  assert public.titan_club_trophy_sync_v1()=0, 'awarded once';
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  assert public.titan_club_trophy_sync_v1()=0, 'still once for another member';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_club_trophy_sync_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
begin
  assert (select count(*) from private.titan_club_trophies where key like 'saison-%')=1, 'exactly one automatic trophy';
  assert (select awarded_by from private.titan_club_trophies where key like 'saison-%') is null, 'attributed to nobody';
end $$;
rollback;
