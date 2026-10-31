-- V11-74 (COM-D2, COM-D4, COM-D7): factions (one at a time, controlled change, counts only from five members, no double contribution),
-- the Pantheon (opt-in, public profile, dated rule-based distinctions, team can hide, no ranking), club trophies (team awards, once per key,
-- visible to members, gone with an archived club). Full rollback.
begin;
do $$
declare u uuid[] := array[]::uuid[]; i integer; adm uuid := gen_random_uuid(); n uuid := gen_random_uuid();
begin
  for i in 1..6 loop u := u || gen_random_uuid(); end loop;
  insert into auth.users(id,raw_user_meta_data) select x,'{}' from unnest(u) x;
  insert into auth.users(id,raw_user_meta_data) values (adm,'{}'),(n,'{}');
  update public.profiles set created_at = now() - interval '5 days' where id = any(u) or id = adm;
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set username = 'Alba', privacy = jsonb_set(coalesce(privacy,'{}'::jsonb),'{publicProfile}','true') where id = u[1];
  update public.profiles set username = 'Basile' where id = u[2];  -- stays private
  perform set_config('titan.fp_u',array_to_string(u,','),true); perform set_config('titan.fp_adm',adm::text,true); perform set_config('titan.fp_n',n::text,true);
  assert not has_table_privilege('authenticated','private.titan_factions','select') and not has_table_privilege('authenticated','private.titan_faction_members','select')
     and not has_table_privilege('authenticated','private.titan_pantheon_optin','select') and not has_table_privilege('authenticated','private.titan_club_trophies','select'), 'no API grant on the tables';
  -- Superuser fixtures for the Pantheon: a pioneer badge and a closed season for Alba and Basile.
  insert into private.titan_pioneers(user_id, cohort) values (u[1], 'Premiers pas'), (u[2], 'Premiers pas');
  insert into private.titan_seasons(name, starts_on, closed_at, result) values ('Saison d’automne', date '2026-09-28', now(), '{}'::jsonb);
  insert into private.titan_season_members(season_id, user_id, final_minutes, final_days) select s.id, x, 300, 6 from private.titan_seasons s, unnest(array[u[1], u[2]]) x where s.name = 'Saison d’automne';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; i integer; club uuid; code text; tid uuid;
  u uuid[] := string_to_array(current_setting('titan.fp_u'), ',')::uuid[]; adm uuid := current_setting('titan.fp_adm')::uuid; n uuid := current_setting('titan.fp_n')::uuid;
begin
  -- FACTIONS
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_faction_choose_v1('aube'); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'a brand-new account does not join';
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  r := public.titan_faction_v1();
  assert r->'mine'='null'::jsonb and jsonb_array_length(r->'factions')=3 and (r->'factions'->0->>'key')='aube', 'three factions, none chosen: '||r::text;
  ok:=false; begin perform public.titan_faction_choose_v1('inconnue'); exception when others then ok:=sqlerrm='FACTION_NOT_FOUND'; end; assert ok,'unknown faction';
  assert public.titan_faction_choose_v1('aube'), 'joined';
  r := public.titan_faction_v1();
  assert r->>'mine'='aube' and (r->'factions'->0->'members')='null'::jsonb and (r->'factions'->0->'minutes')='null'::jsonb, 'below five members: no count, no minutes: '||r::text;
  assert public.titan_faction_choose_v1('forge'), 'the first choice can be corrected once for free';
  ok:=false; begin perform public.titan_faction_choose_v1('sentier'); exception when others then ok:=sqlerrm='FACTION_CHANGE_LOCKED'; end; assert ok,'then any further change waits thirty days';
  ok:=false; begin perform public.titan_faction_choose_v1(null); exception when others then ok:=sqlerrm='FACTION_CHANGE_LOCKED'; end; assert ok,'leaving is locked too, so leaving and joining cannot be used to hop';
  assert public.titan_faction_v1()->>'canChangeAt' is not null, 'the date of the next possible change is given';
  -- Five more members join the same faction: the count and the effort of the week appear, nothing per person.
  for i in 2..6 loop
    perform set_config('request.jwt.claims',json_build_object('sub',u[i],'role','authenticated')::text,true);
    perform public.titan_faction_choose_v1('forge');
  end loop;
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  r := public.titan_faction_v1();
  assert (r->'factions'->1->>'members')::int=6 and (r->'factions'->1->>'minutes')::int=0 and (r->'factions'->0->'members')='null'::jsonb, 'six members in the forge: count shown, empty week: '||r::text;
  assert not (r::text like '%user%'), 'no identity in the answer';
  -- A session after joining counts once, capped; a session before does not.
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_faction_members set joined_at = now() - interval '1 hour' where user_id = u[1];
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (u[1], 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":200}}', now());
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  assert (public.titan_faction_v1()->'factions'->1->>'minutes')::int=90, 'capped at 90 minutes a day, counted once';
  assert public.export_own_data()->'faction'->>'faction'='forge', 'the faction is exported';

  -- PANTHEON: nothing before the opt-in; Basile (private profile) never appears; Alba appears with two dated distinctions; no score anywhere.
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  r := public.titan_pantheon_v1();
  assert (r->>'mine')::boolean=false and jsonb_array_length(r->'entries')=0 and (r->>'profilePublic')::boolean, 'no entry before the opt-in: '||r::text;
  assert public.titan_pantheon_set_v1(true), 'opted in';
  perform set_config('request.jwt.claims',json_build_object('sub',u[2],'role','authenticated')::text,true);
  assert public.titan_pantheon_set_v1(true), 'Basile opted in too, but his profile is private';
  r := public.titan_pantheon_v1();
  assert (r->>'mine')::boolean and (r->>'profilePublic')::boolean=false and jsonb_array_length(r->'entries')=2, 'Basile sees only what the others see (Alba), not himself: '||r::text;
  assert (select bool_and(e->>'name'='Alba') from jsonb_array_elements(r->'entries') e), 'only the public profile is shown';
  assert (select count(*) from jsonb_array_elements(r->'entries') e where e->>'kind'='pioneer')=1 and (select count(*) from jsonb_array_elements(r->'entries') e where e->>'kind'='season')=1, 'two rule-based distinctions';
  assert (select bool_and(e->'userId'='null'::jsonb) from jsonb_array_elements(r->'entries') e), 'no identifier for players';
  assert not (r::text ~* '(score|rank|classement)'), 'nothing resembling a ranking';
  perform set_config('request.jwt.claims',json_build_object('sub',u[3],'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_pantheon_v1()->'entries')=2, 'a player who did not opt in can still look at the gallery';
  ok:=false; begin perform public.titan_pantheon_moderate_v1(u[1],true); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only the team hides an entry';
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  assert (select bool_and(e->>'userId' is not null) from jsonb_array_elements(public.titan_pantheon_v1()->'entries') e), 'the team sees identifiers to moderate';
  assert public.titan_pantheon_moderate_v1(u[1],true), 'hidden by the team';
  perform set_config('request.jwt.claims',json_build_object('sub',u[3],'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_pantheon_v1()->'entries')=0, 'gone from the gallery';
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  assert (public.titan_pantheon_v1()->>'hiddenByTeam')::boolean, 'Alba is told she is hidden';
  assert public.export_own_data()->'pantheon' ? 'since', 'the opt-in is exported';
  assert public.titan_pantheon_set_v1(false)=false, 'withdrawn';
  assert (public.titan_pantheon_v1()->>'mine')::boolean=false, 'withdrawal is immediate';

  -- CLUB TROPHIES
  club := public.titan_club_create_v1('Club des trophées','x',false);
  code := public.titan_club_my_v1()->0->>'code';
  ok:=false; begin perform public.titan_club_trophy_award_v1(club,'cent-membres','Cent minutes',null); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only the team awards';
  ok:=false; begin perform public.titan_club_admin_list_v1(); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only the team lists clubs';
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_club_admin_list_v1())>=1, 'the team lists the clubs';
  ok:=false; begin perform public.titan_club_trophy_award_v1(club,'Mauvaise Clé','Titre',null); exception when others then ok:=sqlerrm='BAD_TROPHY'; end; assert ok,'a clean key';
  tid := public.titan_club_trophy_award_v1(club,'premiere-saison','Première saison ensemble','Bravo.');
  ok:=false; begin perform public.titan_club_trophy_award_v1(club,'premiere-saison','Autre titre',null); exception when others then ok:=sqlerrm='TROPHY_ALREADY_AWARDED'; end; assert ok,'once per club and key';
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  r := public.titan_club_my_v1();
  assert jsonb_array_length(r->0->'trophies')=1 and r->0->'trophies'->0->>'title'='Première saison ensemble' and r->0->'trophies'->0->>'on' is not null, 'the members read the dated trophy: '||r::text;
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  assert public.titan_club_trophy_revoke_v1(tid), 'the team can withdraw a trophy';
  perform set_config('request.jwt.claims',json_build_object('sub',u[1],'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_club_my_v1()->0->'trophies')=0, 'withdrawn';
end $$;
reset role;
do $$
declare u uuid[] := string_to_array(current_setting('titan.fp_u'), ',')::uuid[];
begin
  assert exists (select 1 from private.titan_faction_members where user_id = u[2]), 'u2 has a faction';
  delete from auth.users where id = u[2];
  assert not exists (select 1 from private.titan_faction_members where user_id = u[2]) and not exists (select 1 from private.titan_pantheon_optin where user_id = u[2]), 'erased with the account';
end $$;
rollback;
