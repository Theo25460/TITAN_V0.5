-- V11-73 (COM-C8 moderation): reporting a club announcement or a club, the team's review and decisions, privacy of the reporter, export, erasure. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(adm,'{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (a, b, c, adm);
  update public.profiles set role = 'admin' where id = adm;
  perform set_config('titan.cr_a',a::text,true); perform set_config('titan.cr_b',b::text,true); perform set_config('titan.cr_c',c::text,true); perform set_config('titan.cr_adm',adm::text,true);
  assert not has_table_privilege('authenticated','private.titan_club_reports','select'), 'no API grant on the table';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; club uuid; ann uuid; rid uuid; code text;
  a uuid := current_setting('titan.cr_a')::uuid; b uuid := current_setting('titan.cr_b')::uuid; c uuid := current_setting('titan.cr_c')::uuid; adm uuid := current_setting('titan.cr_adm')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  club := public.titan_club_create_v1('Club à signaler','x',false);
  code := public.titan_club_my_v1()->0->>'code';
  ann := public.titan_club_announce_v1(club,'Un message à signaler.');
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  perform public.titan_club_join_v1(code,null);

  -- A member reports; a bad reason is refused; an outsider cannot report a private club (same refusal as an unknown one).
  ok:=false; begin perform public.titan_club_report_v1(club,ann,'nope',null); exception when others then ok:=sqlerrm='BAD_REASON'; end; assert ok,'the reason comes from a short list';
  assert public.titan_club_report_v1(club,ann,'harassment','  Message <b>déplacé</b>  '), 'reported';
  assert public.titan_club_report_v1(club,ann,'harassment','encore'), 'a second report on the same target is absorbed, not an error';
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_club_report_v1(club,ann,'spam',null); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'an outsider cannot report a private club';
  ok:=false; begin perform public.titan_club_reports_admin_list_v1(); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only the team lists reports';
  ok:=false; begin perform public.titan_club_report_resolve_v1(gen_random_uuid(),'dismiss',null); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only the team decides';

  -- The club administrator never sees a report.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert not (public.titan_club_my_v1()::text like '%harassment%'), 'reports are not shown to the club';

  -- The team sees one open report, with the text concerned, and removes the announcement.
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  r := public.titan_club_reports_admin_list_v1();
  assert jsonb_array_length(r)=1 and r->0->>'announcement'='Un message à signaler.' and r->0->>'details'='Message bdéplacé/b', 'one open report with the text: '||r::text;
  rid := (r->0->>'id')::uuid;
  ok:=false; begin perform public.titan_club_report_resolve_v1(rid,'nothing',null); exception when others then ok:=sqlerrm='BAD_ACTION'; end; assert ok,'a known action';
  assert public.titan_club_report_resolve_v1(rid,'remove_announcement','Retiré.'), 'announcement removed';
  assert jsonb_array_length(public.titan_club_reports_admin_list_v1())=0, 'the queue is empty';
  ok:=false; begin perform public.titan_club_report_resolve_v1(rid,'dismiss',null); exception when others then ok:=sqlerrm='REPORT_NOT_FOUND'; end; assert ok,'a decision is final';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_club_my_v1()->0->'announcements')=0, 'the member no longer sees the announcement';
  ok:=false; begin perform public.titan_club_report_v1(club,ann,'spam',null); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'a removed announcement cannot be reported again';

  -- A report on the club itself, then archiving it takes the club away from everybody.
  assert public.titan_club_report_v1(club,null,'inappropriate',null), 'club reported';
  assert jsonb_array_length(public.export_own_data()->'clubReports')=2, 'own reports exported';
  perform set_config('request.jwt.claims',json_build_object('sub',adm,'role','authenticated')::text,true);
  r := public.titan_club_reports_admin_list_v1();
  ok:=false; begin perform public.titan_club_report_resolve_v1((r->0->>'id')::uuid,'remove_announcement',null); exception when others then ok:=sqlerrm='NO_ANNOUNCEMENT'; end; assert ok,'no announcement on a club report';
  assert public.titan_club_report_resolve_v1((r->0->>'id')::uuid,'archive_club','Fermé.'), 'club archived';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert jsonb_array_length(public.titan_club_my_v1())=0, 'an archived club disappears for its members';
  ok:=false; begin perform public.titan_club_join_v1(code,null); exception when others then ok:=sqlerrm='CLUB_NOT_FOUND'; end; assert ok,'and cannot be joined';
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.cr_b')::uuid;
begin
  assert exists (select 1 from private.titan_club_reports where reporter_id = b), 'b filed reports';
  delete from auth.users where id = b;
  assert not exists (select 1 from private.titan_club_reports where reporter_id = b) and exists (select 1 from private.titan_club_reports where reporter_id is null), 'the reports stay, without the reporter';
end $$;
rollback;
