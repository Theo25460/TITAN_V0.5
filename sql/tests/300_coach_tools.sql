-- V11-81 (COACH-04, COACH-05): templates, messages and check-ins between a coach and an athlete. Everything needs an accepted, unrevoked link; a stranger reaches nothing;
-- ending the link ends access for both; a check-in reaches the coach only when the athlete shares it; messages can be reported to the team alone. Full rollback.
begin;
do $$
declare c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (c,'{}'),(a,'{}'),(s,'{}'),(adm,'{}');
  update public.profiles set role = 'admin' where id = adm;
  perform set_config('titan.ct_c',c::text,true); perform set_config('titan.ct_a',a::text,true); perform set_config('titan.ct_s',s::text,true); perform set_config('titan.ct_adm',adm::text,true);
  assert not has_table_privilege('authenticated','private.titan_coach_messages','select') and not has_table_privilege('authenticated','private.titan_coach_checkins','select')
     and not has_table_privilege('authenticated','private.titan_coach_templates','select'), 'no API grant on the tables';
end $$;
create function public.zz_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.ct_c')::uuid; a uuid := current_setting('titan.ct_a')::uuid; s uuid := current_setting('titan.ct_s')::uuid; adm uuid := current_setting('titan.ct_adm')::uuid;
  inv jsonb; link uuid; rev integer; ok boolean; r jsonb; t uuid; m uuid; i integer; week date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date;
begin
  perform public.zz_as(c); inv := public.titan_coach_portal('invite');
  perform public.zz_as(a); link := (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date, 'consent', true))->>'id')::uuid;

  -- TEMPLATES: the coach's own, validated, bounded.
  perform public.zz_as(c);
  ok:=false; begin perform public.titan_coach_template_save_v1(null,'   ','running','x'); exception when others then ok:=sqlerrm='BAD_TITLE'; end; assert ok,'a title is needed';
  ok:=false; begin perform public.titan_coach_template_save_v1(null,'Fractionné','sport_inconnu','x'); exception when others then ok:=sqlerrm='SPORT_UNKNOWN'; end; assert ok,'a catalogue sport';
  t := public.titan_coach_template_save_v1(null,'  Fractionné <b>court</b> ','running',E'6 x 400 m\\nRécup 1 min <script>');
  r := public.titan_coach_templates_v1();
  assert jsonb_array_length(r)=1 and r->0->>'title'='Fractionné bcourt/b' and r->0->>'instructions' = E'6 x 400 m\\nRécup 1 min script', 'cleaned, newlines kept: '||r::text;
  perform public.titan_coach_template_save_v1(t,'Fractionné court','running','6 x 400 m');
  assert public.titan_coach_templates_v1()->0->>'instructions'='6 x 400 m', 'updated';
  perform public.zz_as(a);
  assert jsonb_array_length(public.titan_coach_templates_v1())=0, 'an athlete sees none of the coach templates';
  ok:=false; begin perform public.titan_coach_template_save_v1(t,'Pris','running','x'); exception when others then ok:=sqlerrm='TEMPLATE_NOT_FOUND'; end; assert ok,'not someone else''s template';
  assert not public.titan_coach_template_delete_v1(t), 'and not deleted by someone else';
  perform public.zz_as(c);
  assert public.titan_coach_template_delete_v1(t), 'the owner deletes';

  -- MESSAGES
  perform public.zz_as(s);
  ok:=false; begin perform public.titan_coach_message_send_v1(link,'Salut'); exception when others then ok:=sqlerrm='SHARING_UNAVAILABLE'; end; assert ok,'a stranger cannot write';
  ok:=false; begin perform public.titan_coach_messages_v1(link); exception when others then ok:=sqlerrm='SHARING_UNAVAILABLE'; end; assert ok,'nor read';
  perform public.zz_as(c);
  m := public.titan_coach_message_send_v1(link,'  Bonjour, comment va la reprise ?  ');
  ok:=false; begin perform public.titan_coach_message_send_v1(link,'   '); exception when others then ok:=sqlerrm='BAD_MESSAGE'; end; assert ok,'not empty';
  ok:=false; begin perform public.titan_coach_message_send_v1(link,repeat('x',1001)); exception when others then ok:=sqlerrm='BAD_MESSAGE'; end; assert ok,'bounded';
  perform public.zz_as(a);
  assert (public.titan_coach_unread_v1()->>link::text)::int=1, 'one unread for the athlete';
  perform public.titan_coach_message_send_v1(link,'Bien, merci ! <3');
  r := public.titan_coach_messages_v1(link);
  assert jsonb_array_length(r->'rows')=2 and r->'rows'->0->>'body'='Bonjour, comment va la reprise ?' and (r->'rows'->0->>'mine')::boolean=false and (r->'rows'->1->>'mine')::boolean and r->'rows'->1->>'body'='Bien, merci ! <3', 'both sides read the thread: '||r::text;
  assert public.titan_coach_messages_read_v1(link)=1, 'one marked read';
  assert public.titan_coach_unread_v1()='{}'::jsonb, 'nothing unread';
  perform public.zz_as(c);
  assert (public.titan_coach_unread_v1()->>link::text)::int=1, 'the coach has one unread';
  assert (public.titan_coach_messages_v1(link)->'rows'->0->>'read')::boolean, 'the coach sees their message was read';

  -- A message is reported to the team alone.
  perform public.zz_as(c);
  ok:=false; begin perform public.titan_coach_message_report_v1(m,'spam'); exception when others then ok:=sqlerrm='SHARING_UNAVAILABLE'; end; assert ok,'one cannot report their own message';
  perform public.zz_as(a);
  ok:=false; begin perform public.titan_coach_message_report_v1(m,'nope'); exception when others then ok:=sqlerrm='BAD_REASON'; end; assert ok,'a known reason';
  assert public.titan_coach_message_report_v1(m,'harassment'), 'reported';
  ok:=false; begin perform public.titan_coach_message_reports_admin_list_v1(); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'only the team reads reports';
  perform public.zz_as(adm);
  assert jsonb_array_length(public.titan_coach_message_reports_admin_list_v1())=1, 'the team sees it';

  -- CHECK-INS
  perform public.zz_as(c);
  ok:=false; begin perform public.titan_coach_checkin_v1(link,'{"fatigue":3}','x',true); exception when others then ok:=sqlerrm='ATHLETE_ONLY'; end; assert ok,'only the athlete fills a check-in';
  perform public.zz_as(a);
  ok:=false; begin perform public.titan_coach_checkin_v1(link,'{"fatigue":9}','x',false); exception when others then ok:=sqlerrm='BAD_SCORES'; end; assert ok,'scores 1 to 5';
  ok:=false; begin perform public.titan_coach_checkin_v1(link,'{"humeur":3}','x',false); exception when others then ok:=sqlerrm='BAD_SCORES'; end; assert ok,'known measures only';
  perform public.titan_coach_checkin_v1(link,'{"fatigue":4,"energy":2,"sleep":3,"motivation":5}','Jambes lourdes <b>ce matin</b>',false);
  assert jsonb_array_length(public.titan_coach_checkins_v1(link)->'rows')=1, 'the athlete reads their own';
  perform public.zz_as(c);
  assert jsonb_array_length(public.titan_coach_checkins_v1(link)->'rows')=0, 'the coach sees nothing that is not shared';
  perform public.zz_as(a);
  assert public.titan_coach_checkin_share_v1(link, week, true), 'shared by the athlete';
  perform public.zz_as(c);
  r := public.titan_coach_checkins_v1(link);
  assert jsonb_array_length(r->'rows')=1 and r->'rows'->0->'scores'->>'fatigue'='4' and r->'rows'->0->>'note'='Jambes lourdes bce matin/b' and r->>'role'='coach', 'the coach reads the shared one: '||r::text;
  ok:=false; begin perform public.titan_coach_checkin_share_v1(link, week, false); exception when others then ok:=sqlerrm='ATHLETE_ONLY'; end; assert ok,'only the athlete withdraws';
  perform public.zz_as(a); perform public.titan_coach_checkin_share_v1(link, week, false);
  perform public.zz_as(c);
  assert jsonb_array_length(public.titan_coach_checkins_v1(link)->'rows')=0, 'withdrawn: gone from the coach';
  perform public.zz_as(a);
  assert (public.export_own_data()->'coachMessages' is not null) and jsonb_array_length(public.export_own_data()->'coachMessages')=2 and jsonb_array_length(public.export_own_data()->'coachCheckins')=1, 'exported';

  -- Ending the link ends access for both sides at once.
  select revision into rev from public.coach_links where id = link;
  perform public.titan_coach_portal('revoke', jsonb_build_object('link_id', link, 'revision', rev));
  ok:=false; begin perform public.titan_coach_messages_v1(link); exception when others then ok:=sqlerrm='SHARING_UNAVAILABLE'; end; assert ok,'the athlete no longer reads';
  perform public.zz_as(c);
  ok:=false; begin perform public.titan_coach_message_send_v1(link,'Encore ?'); exception when others then ok:=sqlerrm='SHARING_UNAVAILABLE'; end; assert ok,'the coach no longer writes';
  ok:=false; begin perform public.titan_coach_checkins_v1(link); exception when others then ok:=sqlerrm='SHARING_UNAVAILABLE'; end; assert ok,'nor reads check-ins';
  assert public.titan_coach_unread_v1()='{}'::jsonb, 'no unread count for an ended link';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.ct_a')::uuid;
begin
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_coach_messages) and not exists (select 1 from private.titan_coach_checkins), 'thread and check-ins erased with the account';
end $$;
rollback;
