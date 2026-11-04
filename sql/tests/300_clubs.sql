-- V11-71 (COM-C8): club spaces. Private by default, joined by a code only administrators see, discoverable only by choice, announcements and
-- moderation by administrators, members never see other members, a removed member cannot come back, roles handed over on leaving,
-- exported and erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); n uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(d,'{}'),(n,'{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (a, b, c, d);
  update public.profiles set username = 'Alba' where id = a;
  update public.profiles set username = 'Basile' where id = b;
  perform set_config('titan.cl_a',a::text,true); perform set_config('titan.cl_b',b::text,true); perform set_config('titan.cl_c',c::text,true);
  perform set_config('titan.cl_d',d::text,true); perform set_config('titan.cl_n',n::text,true);
  assert not has_table_privilege('authenticated','private.titan_clubs','select') and not has_table_privilege('authenticated','private.titan_club_members','select')
     and not has_table_privilege('authenticated','private.titan_club_announcements','select') and not has_table_privilege('authenticated','private.titan_club_bans','select'), 'no API grant on the tables';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; club uuid; club2 uuid; code text; ann uuid;
  a uuid := current_setting('titan.cl_a')::uuid; b uuid := current_setting('titan.cl_b')::uuid; c uuid := current_setting('titan.cl_c')::uuid;
  d uuid := current_setting('titan.cl_d')::uuid; n uuid := current_setting('titan.cl_n')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_club_create_v1('Un club','x',false); exception when others then ok:=sqlerrm='NOT_ELIGIBLE'; end; assert ok,'a brand-new account does not create a club';

  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_club_create_v1('ab','x',false); exception when others then ok:=sqlerrm='BAD_NAME'; end; assert ok,'a name of three characters at least';
  club := public.titan_club_create_v1('  Les <b>Foulées</b>  du  mardi ','Course à pied, tous niveaux.',false);
  r := public.titan_club_my_v1();
  assert jsonb_array_length(r)=1 and r->0->>'name'='Les bFoulées/b du mardi', 'markup characters are removed and spaces collapsed: '||(r->0->>'name');
  assert r->0->>'role'='admin' and (r->0->>'members')::int=1 and (r->0->>'discoverable')::boolean=false and r->0->>'code' ~ '^[A-Z2-9]{8}$', 'the creator is administrator, private, and sees the code: '||r::text;
  code := r->0->>'code';
  assert jsonb_array_length(public.titan_club_discover_v1())=0, 'a private club is not discoverable';

  -- b joins with the code (lower case, with a dash): a plain member sees no code and no roster.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_club_join_v1('ZZZZZZZZ',null); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'a wrong code is refused';
  ok:=false; begin perform public.titan_club_join_v1(null,club); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'a private club cannot be joined by identifier';
  assert public.titan_club_join_v1(lower(substr(code,1,4))||'-'||lower(substr(code,5)),null)=club, 'joined with the code';
  assert public.titan_club_join_v1(code,null)=club, 'joining twice changes nothing';
  r := public.titan_club_my_v1();
  assert r->0->>'role'='member' and (r->0->>'members')::int=2 and r->0->'code'='null'::jsonb and r->0->'roster'='null'::jsonb, 'a member sees neither the code nor the member names: '||r::text;
  ok:=false; begin perform public.titan_club_announce_v1(club,'Bonjour'); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only administrators announce';
  ok:=false; begin perform public.titan_club_set_v1(club,'Autre nom','x',true,false); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only administrators edit';
  ok:=false; begin perform public.titan_club_member_remove_v1(club,a); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only administrators moderate';

  -- The administrator announces, sees the roster, and makes the club discoverable.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ann := public.titan_club_announce_v1(club,'  Sortie  mardi 18h30 <script>x</script> ');
  ok:=false; begin perform public.titan_club_announce_v1(club,'   '); exception when others then ok:=sqlerrm='BAD_ANNOUNCEMENT'; end; assert ok,'an empty announcement is refused';
  r := public.titan_club_my_v1();
  assert (r->0->'roster')::text like '%Alba%' and (r->0->'roster')::text like '%Basile%', 'the administrator sees the roster: '||r::text;
  assert r->0->'announcements'->0->>'body' = 'Sortie mardi 18h30 scriptx/script', 'markup characters are removed from announcements: '||(r->0->'announcements'->0->>'body');
  perform public.titan_club_set_v1(club,'Foulées du mardi','Course à pied.',true,false);
  assert public.titan_club_my_v1()->0->>'code' = code, 'the code did not change';

  -- c discovers it, joins by identifier; d, never a member, finds it too. A member does not see the club in the list again.
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_club_discover_v1())=1 and public.titan_club_discover_v1()->0->>'name'='Foulées du mardi' and not (public.titan_club_discover_v1()->0 ? 'code'), 'discoverable, without the code';
  assert public.titan_club_join_v1(null,club)=club, 'joined by identifier';
  assert jsonb_array_length(public.titan_club_discover_v1())=0, 'already a member: not listed';
  assert jsonb_array_length(public.titan_club_my_v1()->0->'announcements')=1, 'a member reads the announcement';

  -- Moderation: the administrator removes an announcement, then removes c, who cannot return, even with the code.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_club_announce_remove_v1(ann); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'a member cannot remove an announcement';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.titan_club_announce_remove_v1(ann);
  assert jsonb_array_length(public.titan_club_my_v1()->0->'announcements')=0, 'a removed announcement is gone';
  ok:=false; begin perform public.titan_club_member_remove_v1(club,a); exception when others then ok:=sqlerrm='CANNOT_REMOVE_ADMIN'; end; assert ok,'an administrator does not remove themself';
  assert public.titan_club_member_remove_v1(club,c), 'c removed';
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_club_my_v1())=0 and jsonb_array_length(public.titan_club_discover_v1())=0, 'c is out and no longer sees it listed';
  ok:=false; begin perform public.titan_club_join_v1(code,null); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'a removed member cannot come back with the code (same refusal as a wrong code)';
  ok:=false; begin perform public.titan_club_join_v1(null,club); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'nor by identifier';

  -- A new code locks out those who only had the old one; a second club; limits.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.titan_club_set_v1(club,'Foulées du mardi','Course à pied.',false,true);
  assert public.titan_club_my_v1()->0->>'code' <> code, 'the code was renewed';
  perform set_config('request.jwt.claims',json_build_object('sub',d,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_club_join_v1(code,null); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'the old code no longer works';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  club2 := public.titan_club_create_v1('Second club','x',false);
  perform public.titan_club_create_v1('Troisième club','x',false);
  ok:=false; begin perform public.titan_club_create_v1('Quatrième club','x',false); exception when others then ok:=sqlerrm='TOO_MANY_CREATED'; end; assert ok,'three clubs created at most';

  -- Leaving: the last administrator hands over to the oldest member; the last member out archives the club.
  assert jsonb_array_length(public.titan_club_my_v1())=3, 'three clubs';
  assert public.titan_club_leave_v1(club), 'the administrator leaves';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert public.titan_club_my_v1()->0->>'role'='admin', 'the oldest member became administrator';
  assert jsonb_array_length(public.titan_club_my_v1()->0->'roster')=1, 'only b remains';
  assert jsonb_array_length(public.export_own_data()->'clubs')=1, 'exported';
  assert public.titan_club_leave_v1(club), 'b leaves';
  assert jsonb_array_length(public.titan_club_my_v1())=0, 'b has no club left';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_club_my_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.cl_a')::uuid; club uuid;
begin
  assert exists (select 1 from private.titan_clubs where archived_at is not null), 'a club with nobody left is archived';
  assert exists (select 1 from private.titan_club_announcements where author_id = a), 'a authored an announcement';
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_club_members where user_id = a) and not exists (select 1 from private.titan_club_announcements where author_id = a), 'memberships and announcements erased with the account';
end $$;
rollback;
