-- SEC02: the signed-in player cannot write coins, XP, level, role, Premium, inventory, sanctions or the review state of a
-- session directly, whatever the statement: every attempt either fails or leaves the value untouched.
-- Synthetic identities, real API role, full rollback.
begin;
do $$
declare p uuid:=gen_random_uuid(); l uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(p,'{}');
  update public.profiles set credits=500,xp=40,level=3,total_xp=900 where id=p;
  set local session_replication_role = replica;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious,status)
  values (l,p,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}',true,'suspicious');
  update public.profiles set status='suspended', is_suspended=true, suspension_reason='test', admin_notes='note' where id=p;
  set local session_replication_role = origin;
  perform set_config('titan.cw_p',p::text,true); perform set_config('titan.cw_l',l::text,true);
end $$;

create temporary table qa_cw_before as
  select 'profile' k, to_jsonb(p) r from public.profiles p where id=current_setting('titan.cw_p')::uuid
  union all select 'log', to_jsonb(t) from public.training_logs t where id=current_setting('titan.cw_l')::uuid;
grant select on qa_cw_before to authenticated;

set local role authenticated;
do $$
declare p uuid:=current_setting('titan.cw_p')::uuid; l uuid:=current_setting('titan.cw_l')::uuid; stmt text; attempted int:=0; refused int:=0;
  stmts text[] := array[
    format('update public.profiles set credits=999999 where id=%L',p),
    format('update public.profiles set xp=999999, total_xp=999999 where id=%L',p),
    format('update public.profiles set level=99 where id=%L',p),
    format('update public.profiles set is_admin=true where id=%L',p),
    format('update public.profiles set role=''super_admin'' where id=%L',p),
    format('update public.profiles set is_elite=true where id=%L',p),
    format('update public.profiles set is_suspended=false where id=%L',p),
    format('update public.profiles set status=''active'' where id=%L',p),
    format('update public.profiles set suspension_reason=null, admin_notes=null where id=%L',p),
    format('update public.profiles set inventory=''{"cos_frame_aegis":1}''::jsonb where id=%L',p),
    format('update public.profiles set unlocked_talents=array[''all''] where id=%L',p),
    format('update public.training_logs set is_suspicious=false where id=%L',l),
    format('update public.training_logs set status=''valid'' where id=%L',l),
    format('update public.training_logs set xp=25000 where id=%L',l),
    format('update public.training_logs set admin_note=null, reviewed_by=null where id=%L',l),
    format('update public.training_logs set val=300000 where id=%L',l),
    format('insert into public.shop_history(user_id,item_id,cost_credits,reward_credits) values (%L,''cos_frame_aegis'',0,500)',p),
    format('insert into public.inventory(user_id,item_id) values (%L,1)',p),
    format('insert into public.premium_access(user_id,type,is_lifetime) values (%L,''premium'',true)',p),
    format('insert into public.user_achievements(user_id,achievement_id) values (%L,''forged'')',p),
    format('insert into public.titan_billing_events(event_id,event_name,user_id) values (''forged'',''subscription.activated'',%L)',p),
    format('insert into public.titan_suspicious_actions(user_id,action_type,severity,reason) values (%L,''x'',''low'',''forged'')',p),
    format('delete from public.titan_suspicious_actions where user_id=%L',p),
    format('insert into public.contest_entries(user_id,is_eligible,excluded_reason) values (%L,false,''forged'')',p),
    format('insert into public.contest_entries(user_id,excluded_reason) values (%L,''forged'')',p),
    format('insert into public.titan_moderation_reports(reporter_id,reason,status,resolved_by,resolution_note) values (%L,''forged'',''resolved'',%L,''forged'')',p,p),
    format('insert into public.titan_moderation_reports(reporter_id,reason,resolved_at) values (%L,''forged'',now())',p),
    format('update public.titan_moderation_reports set status=''resolved'' where reporter_id=%L',p),
    format('update public.contest_entries set is_eligible=true, excluded_reason=null where user_id=%L',p),
    format('insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values (%L,''running'',''cardio'',5,''km'',25000,now(),''{"effort":{"effort_minutes":9999}}'')',p),
    format('delete from public.training_logs where id=%L',l)
  ];
begin
  perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
  foreach stmt in array stmts loop
    begin
      execute stmt;
      attempted := attempted + 1;
    exception when others then
      -- a refusal is fine, a broken statement (unknown column or table, syntax) would make this test vacuous
      assert sqlstate not in ('42703','42P01','42601','42883','23502','22P02','23503'), 'invalid test statement: '||stmt||' => '||sqlerrm;
      attempted := attempted + 1; refused := refused + 1;
    end;
  end loop;
  assert attempted = cardinality(stmts), 'every attempt was made';
  assert refused >= 10, 'most attempts are refused outright, not merely ignored: '||refused;
end $$;

reset role;
do $$
declare diff text;
begin
  select string_agg(distinct b.k||': '||(select string_agg(key,',') from jsonb_each(b.r) e(key,value) where n.r->key is distinct from e.value), '; ')
    into diff
    from qa_cw_before b
    join (select 'profile' k, to_jsonb(p) r from public.profiles p where id=current_setting('titan.cw_p')::uuid
          union all select 'log', to_jsonb(t) from public.training_logs t where id=current_setting('titan.cw_l')::uuid) n using (k)
   where b.r is distinct from n.r and exists (select 1 from jsonb_each(b.r) e(key,value) where n.r->key is distinct from e.value and key not in ('updated_at'));
  assert diff is null, 'direct client writes changed protected values: '||diff;
  assert not exists(select 1 from public.shop_history where user_id=current_setting('titan.cw_p')::uuid),'no forged purchase or refund';
  assert (select count(*) from public.training_logs where user_id=current_setting('titan.cw_p')::uuid)=1,'no session can be inserted or deleted directly: only the server records a performance';
  assert not exists(select 1 from public.premium_access where user_id=current_setting('titan.cw_p')::uuid),'no forged Premium';
  assert not exists(select 1 from public.inventory where user_id=current_setting('titan.cw_p')::uuid),'no forged inventory row';
  assert not exists(select 1 from public.user_achievements where achievement_id='forged'),'no forged achievement';
  assert not exists(select 1 from public.titan_billing_events where event_id='forged'),'no forged billing event';
  assert not exists(select 1 from public.titan_suspicious_actions where reason='forged'),'no forged sanction signal';
  assert not exists(select 1 from public.contest_entries where excluded_reason='forged' or user_id=current_setting('titan.cw_p')::uuid and not is_eligible),'no forged contest eligibility';
  assert not exists(select 1 from public.titan_moderation_reports where reason='forged'),'no pre-resolved report';

end $$;
rollback;
