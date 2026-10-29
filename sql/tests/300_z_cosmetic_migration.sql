-- Replay with synthetic legacy state: existing inventory/data and caller transaction survive.
do $$ begin
  if current_database() not like 'titan_test_%' then
    raise exception 'REFUSED: cosmetic migration checks require a disposable titan_test_ database';
  end if;
end $$;
create temporary table qa_fair_transaction_marker(value text);
begin;
set local lock_timeout = '23s';
insert into qa_fair_transaction_marker values ('uncommitted');
do $$
declare a uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}');
  insert into public.profiles(id, username, credits, level, xp, appearance) values
    (a, 'qa_fair_preserve', 123, 2, 44, '{"frame":"frame-aegis"}')
  on conflict (id) do update set credits = 123, level = 2, xp = 44, appearance = excluded.appearance;
  insert into public.shop_history(user_id, item_id, cost_credits, reward_credits, economy_meta)
    values (a, 'cos_frame_aegis', 42, 0, '{"legacy_receipt":true}');
end $$;
-- Restore the catalog's former gate; keep an unknown metadata key to prove it is preserved.
update public.shop_items set price = 0, requires_elite = true,
  metadata = (metadata - 'plus_access') || '{"unlock":"plus","qa_preserved":"keep"}'::jsonb
  where id in ('cos_frame_aegis', 'cos_frame_frost', 'cos_map_aurora', 'cos_card_obsidian');
create temporary table qa_fair_profiles_before as select to_jsonb(p) as row from public.profiles p;
create temporary table qa_fair_history_before as select to_jsonb(h) as row from public.shop_history h;
create temporary table qa_fair_other_items_before as select to_jsonb(i) as row from public.shop_items i
  where id not in ('cos_frame_aegis', 'cos_frame_frost', 'cos_map_aurora', 'cos_card_obsidian');
create temporary table qa_fair_grants_before as select oid, proacl from pg_proc
  where oid in ('private.titan_cosmetic_owned(uuid,text)'::regprocedure, 'public.titan_atelier()'::regprocedure);
\ir ../../supabase/migrations/20261008120931_web_cosmetic_fairness.sql
-- Repeating the compatible migration also leaves data and grants unchanged.
\ir ../../supabase/migrations/20261008120931_web_cosmetic_fairness.sql
do $$
begin
  assert current_setting('lock_timeout') = '23s', 'caller lock timeout restored';
  assert not exists (
    (select to_jsonb(p) from public.profiles p except select row from qa_fair_profiles_before)
    union all (select row from qa_fair_profiles_before except select to_jsonb(p) from public.profiles p)
  ), 'profiles, balances, progression and stored appearance unchanged';
  assert not exists (
    (select to_jsonb(h) from public.shop_history h except select row from qa_fair_history_before)
    union all (select row from qa_fair_history_before except select to_jsonb(h) from public.shop_history h)
  ), 'historical receipts unchanged';
  assert not exists (
    (select to_jsonb(i) from public.shop_items i where id not in ('cos_frame_aegis', 'cos_frame_frost', 'cos_map_aurora', 'cos_card_obsidian')
      except select row from qa_fair_other_items_before)
    union all (select row from qa_fair_other_items_before except select to_jsonb(i) from public.shop_items i
      where id not in ('cos_frame_aegis', 'cos_frame_frost', 'cos_map_aurora', 'cos_card_obsidian'))
  ), 'unrelated and retired catalog pieces unchanged';
  assert (select count(*) from public.shop_items where metadata ->> 'qa_preserved' = 'keep') = 4, 'unknown metadata preserved';
  assert not exists (select 1 from pg_proc p join qa_fair_grants_before g on g.oid = p.oid where p.proacl is distinct from g.proacl), 'function grants preserved';
  assert not has_function_privilege('anon', 'public.titan_atelier()', 'execute'), 'anonymous access remains closed';
  assert has_function_privilege('authenticated', 'public.titan_atelier()', 'execute'), 'authenticated access remains available';
end $$;
rollback;
do $$ begin
  assert (select count(*) from qa_fair_transaction_marker) = 0, 'migration did not commit its caller transaction';
  assert not exists (select 1 from public.shop_items where metadata ? 'qa_preserved'), 'catalog and fixtures rolled back';
end $$;
drop table qa_fair_transaction_marker;

-- Without an outer transaction, a missing prerequisite must also leave everything unchanged.
-- Only this explicitly disposable database may be mutated by the negative test.
create temporary table qa_fair_full_catalog as select * from public.shop_items;
delete from public.shop_items where id = 'cos_frame_frost';
create temporary table qa_fair_missing_catalog as select to_jsonb(i) as row from public.shop_items i;
\set ON_ERROR_STOP off
\ir ../../supabase/migrations/20261008120931_web_cosmetic_fairness.sql
\set qa_failure :LAST_ERROR_SQLSTATE
\set ON_ERROR_STOP on
select :'qa_failure' = 'P0001' as expected_failure \gset
\if :expected_failure
\else
  \quit 1
\endif
do $$ begin
  assert not exists (
    (select to_jsonb(i) from public.shop_items i except select row from qa_fair_missing_catalog)
    union all (select row from qa_fair_missing_catalog except select to_jsonb(i) from public.shop_items i)
  ), 'failed standalone migration must not partially update the catalog';
end $$;
insert into public.shop_items select * from qa_fair_full_catalog where id = 'cos_frame_frost';
drop table qa_fair_full_catalog, qa_fair_missing_catalog;
