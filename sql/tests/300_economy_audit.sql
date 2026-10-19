-- SEC06: every change to a balance, level, entitlement or moderation state is journaled, whoever wrote it.
-- Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); n uuid:=gen_random_uuid();
begin
  perform set_config('titan.aud_a',a::text,true); perform set_config('titan.aud_m',m::text,true);
  perform set_config('titan.aud_n',n::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(m,'{}'),(n,'{}');
  assert to_regclass('private.titan_economy_journal') is not null,'the journal table exists';
  update public.profiles set credits=5000,xp=0,level=1,username='qa_audit_a' where id=a;
  update public.profiles set role='admin' where id=m;
  perform set_config('titan.aud_baseline',(select count(*) from private.titan_economy_journal)::text,true);
end $$;

-- A purchase and a rewarded session by the player, through the public RPCs.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.aud_a'),'role','authenticated')::text,true);
do $$ declare r record; begin
  perform public.titan_purchase_shop_item('cos_frame_neon');
  select * into r from public.titan_submit_training_session('running','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '1 hour');
  assert r.xp=300,'the session was rewarded';
end $$;

-- Support tooling suspends the player and the billing worker grants TITAN+, both with the service role.
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set is_suspended=true,status='suspended' where id=current_setting('titan.aud_a')::uuid;
update public.profiles set is_elite=true,elite_ends_at=now()+interval '30 days' where id=current_setting('titan.aud_a')::uuid;
-- Changes that are not economy or moderation, and no-op writes, leave no trace.
update public.profiles set username='qa_audit_a2' where id=current_setting('titan.aud_a')::uuid;
update public.profiles set credits=credits,xp=xp where id=current_setting('titan.aud_a')::uuid;

do $$
declare a uuid:=current_setting('titan.aud_a')::uuid; m uuid:=current_setting('titan.aud_m')::uuid; j record;
begin
  select * into j from private.titan_economy_journal where user_id=a and kind='economy'
    and changes ? 'credits' and (changes#>>'{credits,old}')::int=5000 order by id limit 1;
  assert found and (j.changes#>>'{credits,new}')::int-(j.changes#>>'{credits,old}')::int<0 and j.actor_id=a and j.actor_role='authenticated',
    'the purchase debit is journaled with its actor';
  assert exists(select 1 from private.titan_economy_journal where user_id=a and kind='economy'
    and changes ? 'xp' and (changes#>>'{xp,new}')::int=300),'session XP is journaled';
  select * into j from private.titan_economy_journal where user_id=a and kind='moderation' order by id limit 1;
  assert found and j.actor_id is null and j.actor_role='service_role' and j.changes->'is_suspended'->>'new'='true'
    and j.changes->'status'->>'new'='suspended','the suspension is journaled with its service-role writer';
  assert exists(select 1 from private.titan_economy_journal where user_id=a and kind='entitlement'
    and changes ? 'is_elite'),'the TITAN+ grant is journaled as an entitlement';
  assert not exists(select 1 from private.titan_economy_journal where user_id=a and changes ? 'username'),
    'names are never journaled';
  assert (select count(*) from private.titan_economy_journal where user_id=a and kind='entitlement')=1
    and (select count(*) from private.titan_economy_journal where user_id=a and kind='moderation')=1,
    'the renamed profile and the no-op write left no extra row';
  assert not exists(select 1 from private.titan_economy_journal where user_id=a and changes::text ~* '(email|password|token)'),
    'no personal data beyond the account id';
end $$;

-- Clients cannot read or write the journal, and nobody can edit or erase an entry.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.aud_a'),'role','authenticated')::text,true);
do $$ begin
  assert not has_table_privilege('authenticated','private.titan_economy_journal','select,insert,update,delete')
    and not has_table_privilege('anon','private.titan_economy_journal','select,insert,update,delete'),
    'API roles have no privilege on the journal';
  begin perform public.titan_economy_journal_v1(); assert false,'a player cannot read the journal';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare a uuid:=current_setting('titan.aud_a')::uuid; begin
  begin update private.titan_economy_journal set at=at+interval '1 day' where user_id=a; assert false,'entries are immutable';
  exception when others then assert sqlerrm='JOURNAL_APPEND_ONLY',sqlerrm; end;
  begin delete from private.titan_economy_journal where user_id=a; assert false,'entries cannot be erased';
  exception when others then assert sqlerrm='JOURNAL_APPEND_ONLY',sqlerrm; end;
  begin truncate private.titan_economy_journal; assert false,'the journal cannot be truncated';
  exception when others then assert sqlerrm='JOURNAL_APPEND_ONLY',sqlerrm; end;
end $$;

-- A moderator reads the journal through the audited RPC, bounded and filtered.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.aud_m'),'role','authenticated')::text,true);
do $$ declare j jsonb; begin
  j:=public.titan_economy_journal_v1(current_setting('titan.aud_a')::uuid,2);
  assert jsonb_array_length(j->'entries')=2 and (j->>'limit')::int=2,'the limit is honoured';
  assert not exists(select 1 from jsonb_array_elements(j->'entries') e where e->>'user_id'<>current_setting('titan.aud_a')),
    'only the requested account is returned';
  j:=public.titan_economy_journal_v1(current_setting('titan.aud_a')::uuid,100000);
  assert (j->>'limit')::int<=200,'the page size is capped';
end $$;

-- Deleting the account keeps the entries but detaches them from the person.
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare a uuid:=current_setting('titan.aud_a')::uuid; kept int; begin
  select count(*) into kept from private.titan_economy_journal where user_id=a;
  assert kept>=4,'entries exist before deletion';
  perform set_config('titan.aud_kept',kept::text,true);
  delete from auth.users where id=a;
  assert (select count(*) from private.titan_economy_journal where user_id is null and changes::text<>'')
    >=kept,'entries survive deletion without the account id';
  assert not exists(select 1 from private.titan_economy_journal where user_id=a or changes::text like '%'||a::text||'%'),
    'no remaining reference to the deleted account in the journal';
end $$;
rollback;
