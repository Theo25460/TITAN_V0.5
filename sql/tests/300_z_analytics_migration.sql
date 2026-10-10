-- Reapply the real migration in a caller transaction, preserving historical payloads and rollback.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
select set_config('titan.analytics_migration_before',(select count(*)::text from public.analytics_events),false);
begin;
set local lock_timeout='2s';
create temporary table titan_analytics_transaction_marker(id integer);
insert into titan_analytics_transaction_marker values(1);
select set_config('titan.analytics_migration_owner',gen_random_uuid()::text,true);
select set_config('titan.analytics_migration_foreign',gen_random_uuid()::text,true);
insert into auth.users(id,raw_user_meta_data) values
  (current_setting('titan.analytics_migration_owner')::uuid,'{}'),
  (current_setting('titan.analytics_migration_foreign')::uuid,'{}');
insert into public.analytics_events(event_name,page,source,referrer,metadata,created_at)
values('old_unregistered_event','/legacy?old=query','old-source','https://example.test/old',
  '{"slug":"old-content","notes":"old synthetic text"}','2020-01-01T00:00:00Z');
create temporary table titan_analytics_history_before as
  select id,to_jsonb(e) payload from public.analytics_events e;

drop policy analytics_events_contract_insert_v300 on public.analytics_events;
drop function private.titan_analytics_payload_valid_v300(text,text,text,text,jsonb);
-- A future permissive policy must not bypass the new restrictive contract/ownership check.
create policy titan_qa_analytics_permissive on public.analytics_events for insert to anon,authenticated with check(true);
\ir ../../supabase/migrations/20261010163122_analytics_payload_contract_v300.sql
\ir ../../supabase/migrations/20261010163122_analytics_payload_contract_v300.sql
do $$ begin
  assert current_setting('lock_timeout')='2s','migration preserves caller settings';
  assert (select count(*) from titan_analytics_transaction_marker)=1,'migration preserves caller transaction';
  assert not exists(select 1 from titan_analytics_history_before b
    left join public.analytics_events e on e.id=b.id where to_jsonb(e) is distinct from b.payload),
    'legacy names, payloads, identities and timestamps are preserved byte-for-byte as JSON values';
  assert (select count(*)=1 from pg_policy where polrelid='public.analytics_events'::regclass
    and polname='analytics_events_contract_insert_v300' and not polpermissive and polcmd='a'),
    'reapplication leaves one restrictive INSERT policy';
end $$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
insert into public.analytics_events(event_name,page,metadata)
values('dynamic_page_opened','/dynamic-page','{"consent":"anonymous","v":300}');
do $$ begin
  begin
    insert into public.analytics_events(user_id,event_name,page,metadata)
    values(current_setting('titan.analytics_migration_foreign')::uuid,'dynamic_page_opened','/dynamic-page','{"consent":"granted","v":300}');
    assert false,'another permissive policy cannot let anon attribute another account';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events(event_name,page,metadata)
    values('unknown','/dynamic-page','{"consent":"anonymous","v":300}');
    assert false,'another permissive policy cannot admit an unknown name';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.analytics_migration_owner'),'role','authenticated')::text,true);
do $$ begin
  begin
    insert into public.analytics_events(user_id,event_name,page,metadata)
    values(current_setting('titan.analytics_migration_foreign')::uuid,'first_session','/stats','{"consent":"granted","v":300}');
    assert false,'another permissive policy cannot let an account attribute another owner';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
-- Tested operational rollback: remove only the two new objects; leave ownership/admin policies and rows.
drop policy analytics_events_contract_insert_v300 on public.analytics_events;
drop function private.titan_analytics_payload_valid_v300(text,text,text,text,jsonb);
drop policy titan_qa_analytics_permissive on public.analytics_events;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
insert into public.analytics_events(event_name,page,metadata) values('old_unregistered_event','/legacy','{"old":true}');
reset role;
rollback;
do $$ begin
  assert to_regclass('pg_temp.titan_analytics_transaction_marker') is null,'migration must never commit its caller transaction';
  assert (select count(*) from public.analytics_events)=current_setting('titan.analytics_migration_before')::bigint,
    'caller rollback removes all synthetic fixtures';
  assert exists(select 1 from pg_policy where polrelid='public.analytics_events'::regclass
    and polname='analytics_events_contract_insert_v300' and not polpermissive),
    'caller rollback restores the restrictive policy';
  assert to_regprocedure('private.titan_analytics_payload_valid_v300(text,text,text,text,jsonb)') is not null,
    'caller rollback restores the private validator';
end $$;
