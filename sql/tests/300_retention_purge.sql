-- Q-002 / LEG31 / LEG09: durations executed by code, and an account leaves nothing readable behind. Synthetic data, full rollback.
begin;
do $$
declare
  u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); d_old bigint; counts jsonb; ids text[]; denied boolean;
  old_ts timestamptz:=now()-interval '30 months'; young_ts timestamptz:=now()-interval '1 day';
begin
  insert into auth.users(id,raw_user_meta_data) values(u,'{}'),(v,'{}'),(w,'{}'),(x,'{}');

  -- 1. The rules are exactly the ones the published matrix lists.
  select array_agg(id order by id) into ids from private.titan_retention_rules;
  assert ids = array['admin_audit','admin_logs','analytics','appeals','audit_logs','billing_events','bug_reports','contact_messages','moderation_decisions','moderation_reports','reports_legacy','reward_holds','social_action_log','support_general','support_payment','support_rights','suspicious_actions'], 'rule ids: '||array_to_string(ids,',');
  assert (select keep from private.titan_retention_rules where id='analytics')=interval '13 months' and (select keep from private.titan_retention_rules where id='support_general')=interval '6 months'
    and (select keep from private.titan_retention_rules where id='support_rights')=interval '12 months' and (select keep from private.titan_retention_rules where id='billing_events')=interval '13 months', 'documented durations';

  -- 2. Expired rows go, fresh rows stay, per category.
  insert into public.analytics_events(user_id,event_name,page,created_at) values(null,'qa_old','/',old_ts),(null,'qa_young','/',young_ts);
  insert into private.titan_support_requests(user_id,request_id,category,message,reply_allowed,created_at) values
    (u,gen_random_uuid(),'bug','message assez long ancien',false,now()-interval '7 months'),
    (u,gen_random_uuid(),'bug','message assez long recent',false,now()-interval '5 months'),
    (u,gen_random_uuid(),'titanplus','paiement assez long ancien',false,now()-interval '14 months'),
    (u,gen_random_uuid(),'titanplus','paiement assez long recent',false,now()-interval '12 months'),
    (u,gen_random_uuid(),'donnees','droits assez long ancien',false,now()-interval '13 months'),
    (u,gen_random_uuid(),'donnees','droits assez long recent',false,now()-interval '11 months');
  insert into public.bug_reports(user_id,title,description,created_at) values(null,'qa old','x',old_ts),(null,'qa young','x',young_ts);
  insert into public.contact_messages(user_id,name,email,subject,message,created_at) values(null,'qa','qa@example.test','s','m',old_ts),(null,'qa','qa@example.test','s','m',young_ts);
  insert into public.titan_billing_events(event_id,event_name,user_id,payload,occurred_at,processed_at) values('qa-old','x',null,'{}',now()-interval '14 months',now()),('qa-young','x',null,'{}',now()-interval '12 months',now());
  insert into public.titan_admin_audit(admin_id,action,target_user_id,payload,created_at) values(null,'qa_old',null,'{}',old_ts),(null,'qa_young',null,'{}',young_ts);
  insert into public.titan_suspicious_actions(user_id,action_type,severity,reason,payload,created_at) values(v,'qa_old','low','r','{}',old_ts),(v,'qa_young','low','r','{}',young_ts);
  insert into private.titan_moderation_decisions(at,user_id,admin_id,decision,reason,snapshot) values(old_ts,v,null,'watch','ancienne décision','{}'),(young_ts,v,null,'watch','décision récente','{}');
  insert into private.titan_appeals(created_at,user_id,kind,message,status,decided_at) values(old_ts,v,'account','ancien recours tranché','declined',old_ts),(young_ts,v,'account','recours récent tranché','declined',young_ts),(old_ts,v,'account','ancien recours encore ouvert','open',null);
  insert into public.titan_moderation_reports(reporter_id,target_user_id,reason,status,created_at) values(null,null,'qa_old','resolved',old_ts),(null,null,'qa_young','resolved',young_ts),(null,null,'qa_old_open','open',old_ts);

  -- Journals that the generic audit trigger copies, an old decision that a younger one reverts, suspensions.
  insert into public.admin_logs(action,created_at) values('qa_old',old_ts),('qa_young',young_ts);
  insert into public.reports(status,description,created_at) values('resolved','qa_old_done',old_ts),('pending','qa_old_pending',old_ts),('resolved','qa_young_done',young_ts);
  insert into public.audit_logs(table_name,operation,record_id,created_at) values('qa_table','UPDATE','qa-old-audit',old_ts),('qa_table','UPDATE','qa-young-audit',young_ts);
  insert into public.titan_social_action_log(actor_id,action,created_at) values(v,'friend_add',now()-interval '100 days'),(v,'friend_remove',young_ts);
  insert into private.titan_moderation_decisions(at,user_id,decision,reason) values(old_ts,w,'watch','qa reverted one') returning id into d_old;
  insert into private.titan_moderation_decisions(at,user_id,decision,reason,reverts) values(young_ts,w,'revert','qa the revert',d_old);
  insert into private.titan_moderation_decisions(at,user_id,decision,reason) values(old_ts,w,'suspend','qa suspend lifted'),(young_ts,w,'restore','qa restore'),(old_ts,x,'suspend','qa suspend still active');

  counts := private.titan_purge_expired_data_v1();
  assert not exists(select 1 from public.admin_logs where action='qa_old') and exists(select 1 from public.admin_logs where action='qa_young'), 'legacy admin journal 12 months (no caller identity needed)';
  assert not exists(select 1 from public.reports where description='qa_old_done') and exists(select 1 from public.reports where description='qa_old_pending') and exists(select 1 from public.reports where description='qa_young_done'), 'legacy reports: processed ones expire, pending ones stay';
  assert not exists(select 1 from public.audit_logs where record_id='qa-old-audit') and exists(select 1 from public.audit_logs where record_id='qa-young-audit'), 'audit journal 12 months';
  assert not exists(select 1 from public.audit_logs where table_name in ('admin_logs','reports') and operation='DELETE' and (old_data->>'description' like 'qa_old%' or old_data->>'action'='qa_old')), 'purged rows leave no copy in audit_logs';
  assert not exists(select 1 from public.titan_social_action_log where actor_id=v and action='friend_add') and exists(select 1 from public.titan_social_action_log where actor_id=v and action='friend_remove'), 'social journal 90 days';
  assert exists(select 1 from private.titan_moderation_decisions where reason='qa reverted one'), 'a decision that a younger one reverts is kept';
  assert not exists(select 1 from private.titan_moderation_decisions where reason='qa suspend lifted') and exists(select 1 from private.titan_moderation_decisions where reason='qa suspend still active'), 'a lifted suspension expires, an active one stays';
  assert (counts->>'moderation_decisions')::int>=0 and (counts->>'admin_logs')::int>=1 and (counts->>'reports_legacy')::int>=1, 'no rule failed';
  assert not exists(select 1 from public.analytics_events where event_name='qa_old') and exists(select 1 from public.analytics_events where event_name='qa_young'), 'analytics 13 months';
  assert (select count(*) from private.titan_support_requests where user_id=u)=3, 'support: only the three recent ones remain';
  assert not exists(select 1 from private.titan_support_requests where user_id=u and message like '%ancien'), 'support: expired removed in each category';
  assert not exists(select 1 from public.bug_reports where title='qa old') and exists(select 1 from public.bug_reports where title='qa young'), 'bug reports 12 months';
  assert (select count(*) from public.contact_messages where email='qa@example.test')=1, 'contact messages 12 months';
  assert not exists(select 1 from public.titan_billing_events where event_id='qa-old') and exists(select 1 from public.titan_billing_events where event_id='qa-young'), 'billing events 13 months';
  assert not exists(select 1 from public.titan_admin_audit where action='qa_old') and exists(select 1 from public.titan_admin_audit where action='qa_young'), 'admin audit 12 months';
  assert not exists(select 1 from public.titan_suspicious_actions where action_type='qa_old') and exists(select 1 from public.titan_suspicious_actions where action_type='qa_young'), 'signals 12 months';
  assert (select count(*) from private.titan_moderation_decisions where user_id=v)=1, 'decisions 24 months';
  assert (select count(*) from private.titan_appeals where user_id=v)=2 and exists(select 1 from private.titan_appeals where user_id=v and status='open'), 'decided appeals 24 months, an open one is never purged';
  assert exists(select 1 from public.titan_moderation_reports where reason='qa_young') and exists(select 1 from public.titan_moderation_reports where reason='qa_old_open') and not exists(select 1 from public.titan_moderation_reports where reason='qa_old'), 'only closed reports expire';
  assert (counts->>'analytics')::int>=1 and (counts->>'support_general')::int>=1, 'counts reported';

  -- 3. The decisions journal stays append-only for everybody else.
  denied:=false; begin delete from private.titan_moderation_decisions where user_id=v; exception when insufficient_privilege then denied:=true; end;
  assert denied, 'direct delete of a decision is still refused';
  denied:=false; begin update private.titan_moderation_decisions set snapshot='{"a":1}' where user_id=v; exception when insufficient_privilege then denied:=true; end;
  assert denied, 'direct edit of a decision is still refused';

  -- 4. Deleting an account scrubs what would survive it, and only that account.
  insert into public.bug_reports(user_id,title,description) values(u,'qa mine','x'),(v,'qa other','x');
  insert into public.contact_messages(user_id,name,email,subject,message) values(u,'Mine','mine@example.test','s','m');
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  insert into public.messages(sender_id,receiver_id,content) values(u,v,'bonjour contenu prive');
  perform set_config('request.jwt.claims',json_build_object('sub',v,'role','authenticated')::text,true);
  insert into public.messages(sender_id,receiver_id,content) values(v,u,'reponse de lautre');
  perform set_config('request.jwt.claims','',true);
  insert into public.titan_billing_events(event_id,event_name,user_id,payload) values('qa-mine','x',u,'{"customer":{"email":"mine@example.test"}}'),('qa-other','x',v,'{"customer":"keep"}');
  insert into public.titan_admin_audit(admin_id,action,target_user_id,payload) values(null,'qa_target_mine',u,'{"email":"mine@example.test"}');
  insert into private.titan_moderation_decisions(user_id,admin_id,decision,reason,snapshot) values(u,null,'watch','decision sur le compte','{"username":"mine"}'),(v,null,'watch','decision sur lautre','{"username":"other"}');
  insert into public.titan_moderation_reports(reporter_id,target_user_id,reason,details,status) values(u,v,'qa_rep','texte libre du signalant','open');
  insert into public.reports(reporter_id,reported_id,status,description) values(u,v,'pending','qa legacy free text'),(v,u,'pending','qa legacy about mine');
  insert into public.admin_logs(action,target_table,target_id,new_value,details) values('ban','profiles',u::text,'{"username":"qa_mine_name"}','qa details');
  insert into public.titan_suspicious_actions(user_id,action_type,severity,reason,payload) values(u,'qa_mine','low','r','{}');
  perform set_config('titan.qa_u',u::text,true); perform set_config('titan.qa_v',v::text,true);
  -- the generic audit trigger had copied the message rows into audit_logs
  assert exists(select 1 from public.audit_logs where table_name='messages' and (old_data->>'sender_id'=u::text or new_data->>'sender_id'=u::text)), 'precondition: the audit trigger copied the message';

  -- an audit copy written by someone else (an administrator) that still names the account
  insert into public.audit_logs(table_name,operation,record_id,old_data,changed_by) values('inventory','UPDATE','qa-record',jsonb_build_object('user_id',u,'note','qa-audit-copy'),v),('inventory','UPDATE','qa-record-2',jsonb_build_object('user_id',v,'note','qa-audit-other'),v);
  delete from auth.users where id=u;
  assert not exists(select 1 from public.audit_logs where old_data->>'note'='qa-audit-copy') and exists(select 1 from public.audit_logs where old_data->>'note'='qa-audit-other'), 'audit copies naming the account go, others stay';
  assert not exists(select 1 from public.bug_reports where title='qa mine') and exists(select 1 from public.bug_reports where title='qa other'), 'its bug reports go, others stay';
  assert not exists(select 1 from public.contact_messages where email='mine@example.test'), 'its contact messages go';
  assert not exists(select 1 from public.messages where sender_id=u) and exists(select 1 from public.messages where sender_id=v), 'its messages go even when deleted straight from auth.users';
  assert not exists(select 1 from public.audit_logs where old_data::text like '%bonjour contenu prive%' or new_data::text like '%bonjour contenu prive%'), 'no copy of its message content survives in audit_logs';
  assert (select payload from public.titan_billing_events where event_id='qa-mine')='{}'::jsonb and (select payload from public.titan_billing_events where event_id='qa-other')<>'{}'::jsonb, 'billing payload scrubbed for it only';
  assert (select payload from public.titan_admin_audit where action='qa_target_mine')='{}'::jsonb, 'admin audit payload scrubbed';
  assert (select snapshot from private.titan_moderation_decisions where reason='decision sur le compte')='{}'::jsonb and (select snapshot from private.titan_moderation_decisions where reason='decision sur lautre')<>'{}'::jsonb, 'decision snapshot scrubbed for it only';
  assert (select details from public.titan_moderation_reports where reason='qa_rep') is null, 'free text of the report scrubbed';
  assert not exists(select 1 from public.titan_suspicious_actions where action_type='qa_mine'), 'its signals go';
  assert exists(select 1 from private.titan_moderation_decisions where reason='decision sur le compte'), 'the decision itself is kept, without identity';
  assert (select reporter_id is null and description is null from public.reports where description is null and reported_id=v) and (select reported_id is null and reported_user_id is null from public.reports where description='qa legacy about mine'), 'legacy reports detached from the deleted account';
  assert (select target_id is null and new_value is null and details is null from public.admin_logs where action='ban' and target_table='profiles'), 'legacy admin journal detached from the deleted account';
  assert not exists(select 1 from public.audit_logs where table_name in ('reports','admin_logs') and (old_data::text like '%'||u::text||'%' or new_data::text like '%'||u::text||'%')), 'no audit copy of those rows names the deleted account';

  -- 4b. Deleting an account with no caller identity (dashboard, inactivity purge) must work, and give the identity back.
  perform set_config('request.jwt.claims','',true);
  insert into public.admin_messages(receiver_id,content) values(x,'qa admin message');
  delete from auth.users where id=x;
  assert not exists(select 1 from auth.users where id=x) and not exists(select 1 from public.admin_messages where receiver_id=x), 'an account with an admin message is deleted without any caller identity';
end $$;

-- 5. Players cannot run the purge or read the rules.
set local role authenticated;
do $$
declare denied boolean;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  denied:=false; begin perform private.titan_purge_expired_data_v1(); exception when others then denied:=true; end;
  assert denied, 'a player cannot run the purge';
  denied:=false; begin perform count(*) from private.titan_retention_rules; exception when others then denied:=true; end;
  assert denied, 'the rules are private';
end $$;
reset role;
rollback;
