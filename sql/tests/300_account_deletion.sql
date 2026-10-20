-- LEG10 — "Supprimer mon compte" must succeed for a fully used account, leave no reference to it,
-- and keep everybody else's data usable. Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
begin
  -- A deletes its account; B is A's friend, coach, athlete and guild member; C was appointed
  -- moderator by A and belongs to A's legacy guild through profiles.guild_id only; D is a
  -- suspended solo guild owner.
  perform set_config('titan.del_a',a::text,true); perform set_config('titan.del_b',b::text,true);
  perform set_config('titan.del_c',c::text,true); perform set_config('titan.del_d',d::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}'),(d,'{}');
  update public.profiles set username='qa_delete_a',friend_code='TN-QADA2',credits=5000,
    privacy='{"publicProfile":true,"showStats":true}',is_elite=true,elite_ends_at=now()+interval '1 day' where id=a;
  update public.profiles set username='qa_delete_b',friend_code='TN-QADB3',
    privacy='{"publicProfile":true,"showStats":true}' where id=b;
  update public.profiles set username='qa_delete_d',credits=5000 where id=d;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_b'),'role','authenticated')::text,true);
do $$ declare r record; begin
  select * into r from public.titan_submit_training_session('running','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '2 hour');
  perform set_config('titan.del_log_b',r.log_id::text,true);
  perform public.titan_social_request('TN-QADA2');
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_a'),'role','authenticated')::text,true);
do $$ declare r record; m jsonb; ch jsonb; g jsonb; begin
  perform public.titan_social_respond(current_setting('titan.del_b')::uuid,true);
  select * into r from public.titan_submit_training_session('running','cardio',10,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',50,'note','QA_PRIVATE_NOTE'),now()-interval '1 hour');
  perform public.titan_update_training_session(r.log_id::uuid,1,'{"note":"QA_EDITED_NOTE"}');
  insert into public.sport_goals(user_id,title,metric,target,start_date,end_date)
    values(auth.uid(),'Objectif A','sessions',3,current_date,current_date+7);
  perform public.titan_purchase_shop_item('cos_frame_neon');
  m:=public.titan_moment_share('record','Record A','47:12','running',null,'friends');
  perform set_config('titan.del_moment_a',m->>'id',true);
  ch:=public.titan_challenge_create('Défi A','effort_minutes',null,300,7,array[current_setting('titan.del_b')::uuid]);
  perform set_config('titan.del_challenge_a',ch->>'id',true);
  perform public.titan_public_card_save(true,'{"level":true}'::jsonb,false);
  perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'Vue A','report','{"period":"month","offset":0}');
  perform public.titan_adventure_action('start','aube','rhythm',null,0,null,'Europe/Paris');
  perform public.titan_save_profile_state('{"campaign":{"qa":1}}'::jsonb,'qa_delete_a',null,null,null,null,null,null);
  perform public.titan_coach_portal('invite');
  insert into public.analytics_events(user_id,event_name,page,metadata)
    values(auth.uid(),'first_session','/journal','{"consent":"granted","v":300}');
  g:=public.titan_create_guild('Escouade A','Tenir la ligne');
  perform set_config('titan.del_guild_code',g->>'code',true);
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_b'),'role','authenticated')::text,true);
do $$ declare m jsonb; inv jsonb; begin
  perform public.titan_moment_cheer(current_setting('titan.del_moment_a')::uuid);
  perform public.titan_challenge_respond(current_setting('titan.del_challenge_a')::uuid,'join');
  m:=public.titan_moment_share('record','Record B','40:00','running',null,'friends');
  perform set_config('titan.del_moment_b',m->>'id',true);
  inv:=public.titan_coach_portal('invite'); perform set_config('titan.del_invite_b',inv->>'token',true);
  perform public.titan_join_guild(current_setting('titan.del_guild_code'));
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_a'),'role','authenticated')::text,true);
do $$ begin
  perform public.titan_moment_cheer(current_setting('titan.del_moment_b')::uuid);
  perform public.titan_coach_portal('accept',jsonb_build_object('token',current_setting('titan.del_invite_b'),
    'since_date',current_date,'consent',true));
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_d'),'role','authenticated')::text,true);
do $$ begin perform public.titan_create_guild('Escouade D','Seul'); end $$;

-- Server-side rows an account can accumulate outside the app's own RPCs.
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare a uuid:=current_setting('titan.del_a')::uuid; begin
  insert into public.admin_messages(receiver_id,content) values(a,'QA legacy admin message');
  insert into public.titan_admins(user_id,role,created_by) values(current_setting('titan.del_c')::uuid,'moderator',a);
  insert into public.guilds(name,owner_id,code) values('QA legacy guild',a,'QALEG1');
  update public.profiles set guild_id=(select id from public.guilds where code='QALEG1')
    where id=current_setting('titan.del_c')::uuid;
  update public.profiles set is_suspended=true where id=current_setting('titan.del_d')::uuid;
  -- CHEAT19: A's own appeal goes with A; an appeal of another player that A decided keeps its decision, detached from A.
  insert into private.titan_appeals(user_id,kind,message) values (a,'account','QA appeal by the deleted account');
  insert into private.titan_appeals(user_id,kind,message,status,decided_by,decision_note,decided_at)
    values (current_setting('titan.del_b')::uuid,'account','QA appeal decided by A','declined',a,'QA note',now());
  assert (select guild_id is not null from public.profiles where id=current_setting('titan.del_b')::uuid),'B is in A''s guild';
end $$;
create temporary table qa_del_others_before as
  select 'profile' kind,id::text id,to_jsonb(p)-'guild_id'-'updated_at' row from public.profiles p
    where id in (current_setting('titan.del_b')::uuid,current_setting('titan.del_c')::uuid)
  union all select 'log',id::text,to_jsonb(l) from public.training_logs l where user_id=current_setting('titan.del_b')::uuid
  union all select 'moment',id::text,to_jsonb(m) from public.titan_moments m where user_id=current_setting('titan.del_b')::uuid;

-- Anonymous callers cannot reach the RPC.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
  begin perform public.delete_own_account(); assert false,'anon must not delete';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_a'),'role','authenticated')::text,true);
do $$ declare r jsonb; begin
  r:=public.delete_own_account();
  assert r->>'userId'=current_setting('titan.del_a') and (r#>>'{deleted,auth_users}')::int=1
    and (r#>>'{deleted,profiles}')::int=1,'deletion is confirmed for the caller only: '||r::text;
  -- A lost response is retried with the same token: the retry succeeds and deletes nothing more.
  r:=public.delete_own_account();
  assert (r#>>'{deleted,auth_users}')::int=0 and (r#>>'{deleted,profiles}')::int=0,'retry is harmless';
end $$;

reset role;
-- No table in any schema keeps a reference to the deleted account, as a key or inside text/JSON.
do $$
declare a text:=current_setting('titan.del_a'); r record; n bigint; found text[]:='{}';
begin
  for r in select c.table_schema s,c.table_name t,c.column_name col,c.data_type dt
           from information_schema.columns c join information_schema.tables tb using(table_schema,table_name)
           where tb.table_type='BASE TABLE' and c.table_schema not in ('pg_catalog','information_schema')
             and c.table_schema not like 'pg\_temp%' and c.table_schema not like 'pg\_toast%'
             and c.data_type in ('uuid','text','character varying','jsonb','json','ARRAY') loop
    if r.dt='uuid' then execute format('select count(*) from %I.%I where %I=$1::uuid',r.s,r.t,r.col) into n using a;
    elsif r.s='public' and r.t='audit_logs' then
      -- The closed security journal keeps another actor's action (the message sent to A); A's own
      -- entries, including the cascade that deletes that message, go with A. Retention: see the handoff.
      execute format('select count(*) from public.audit_logs where %I::text like $1
        and not (table_name=''admin_messages'' and operation=''INSERT'' and changed_by is null)',r.col)
        into n using '%'||a||'%';
    else execute format('select count(*) from %I.%I where %I::text like $1',r.s,r.t,r.col) into n using '%'||a||'%'; end if;
    if n>0 then found:=found||format('%s.%s.%s=%s',r.s,r.t,r.col,n); end if;
  end loop;
  assert cardinality(found)=0,'residual references to the deleted account: '||array_to_string(found,', ');
  assert not exists(select 1 from public.training_logs where details::text like '%QA_EDITED_NOTE%' or details::text like '%QA_PRIVATE_NOTE%')
    and not exists(select 1 from public.training_revisions where to_jsonb(training_revisions)::text like '%QA_PRIVATE_NOTE%'),
    'private notes and their revisions are gone';
  assert not exists(select 1 from public.admin_messages where content='QA legacy admin message'),'messages addressed to A are gone';
  assert not exists(select 1 from private.titan_appeals where message='QA appeal by the deleted account'),'A''s appeals are gone';
  assert exists(select 1 from private.titan_appeals where message='QA appeal decided by A' and decided_by is null and status='declined'),'B''s appeal survives, detached from A';
  assert exists(select 1 from public.analytics_events where user_id is null and event_name='first_session' and page='/journal'),
    'a consented usage event survives only as an anonymous count';
end $$;

-- Everybody else keeps their data; links that pointed to A are released, not corrupted.
do $$
declare b uuid:=current_setting('titan.del_b')::uuid; c uuid:=current_setting('titan.del_c')::uuid; g uuid;
begin
  assert not exists((select kind,id,row from qa_del_others_before)
    except (select 'profile',id::text,to_jsonb(p)-'guild_id'-'updated_at' from public.profiles p where id in (b,c)
      union all select 'log',id::text,to_jsonb(l) from public.training_logs l where user_id=b
      union all select 'moment',id::text,to_jsonb(m) from public.titan_moments m where user_id=b)),
    'B and C profiles, B sessions and B moments are unchanged';
  select guild_id into g from public.profiles where id=b;
  assert g is not null and (select owner_id=b from public.guilds where id=g)
    and (select role='owner' from public.guild_members where guild_id=g and user_id=b),
    'the guild survives and its oldest member becomes owner, as when an owner leaves';
  assert (select active and role='moderator' and created_by is null from public.titan_admins where user_id=c),
    'an admin appointed by the deleted account keeps its role';
  assert (select owner_id=c from public.guilds where code='QALEG1')
    and (select guild_id=(select id from public.guilds where code='QALEG1') from public.profiles where id=c),
    'a legacy member known only through its profile inherits the guild';
  assert (select role='owner' from public.guild_members gm join public.guilds g on g.id=gm.guild_id
    where g.code='QALEG1' and gm.user_id=c),'the successor gets the membership row and owner role it lacked';
  assert not exists(select 1 from public.titan_moment_cheers where moment_id=current_setting('titan.del_moment_b')::uuid),
    'cheers given by A disappear with A';
end $$;

-- A suspended solo owner can still exercise the right to erasure; the empty guild is removed.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_d'),'role','authenticated')::text,true);
do $$ declare r jsonb; begin
  r:=public.delete_own_account();
  assert (r#>>'{deleted,auth_users}')::int=1,'suspended account can be deleted';
end $$;
reset role;
do $$ begin
  assert not exists(select 1 from public.guilds where owner_id=current_setting('titan.del_d')::uuid)
    and not exists(select 1 from public.guilds where name='Escouade D'),'an empty guild is removed with its owner';
end $$;

-- Support deletion outside the RPC (dashboard, service role): the guild is handed over too.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare e uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); g uuid; begin
  perform set_config('titan.del_e',e::text,true); perform set_config('titan.del_f',f::text,true);
  insert into auth.users(id,raw_user_meta_data) values(e,'{}'),(f,'{}');
  update public.profiles set credits=5000 where id=e;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_e'),'role','authenticated')::text,true);
select set_config('titan.del_guild_e',public.titan_create_guild('Escouade E','Relais')->>'code',true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.del_f'),'role','authenticated')::text,true);
do $$ begin perform public.titan_join_guild(current_setting('titan.del_guild_e')); end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
delete from auth.users where id=current_setting('titan.del_e')::uuid;
do $$ declare f uuid:=current_setting('titan.del_f')::uuid; begin
  assert (select owner_id=f from public.guilds where code=current_setting('titan.del_guild_e'))
    and (select guild_id is not null from public.profiles where id=f),'support deletion keeps the guild for its members';
end $$;
rollback;
