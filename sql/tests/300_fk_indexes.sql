-- V11-34: the five foreign keys flagged by the performance advisor are covered by an index whose first column is the key column.
begin;
do $$
declare r record; n int := 0;
begin
  for r in select * from (values
    ('adventure_quest_rewards','world_id'),('titan_challenges','creator_id'),('titan_expedition_members','user_id'),
    ('titan_moment_cheers','user_id'),('titan_moments','log_id')) t(tbl, col)
  loop
    assert exists (
      select 1 from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
       where n.nspname = 'public' and c.relname = r.tbl and a.attname = r.col and i.indisvalid),
      'index covering '||r.tbl||'.'||r.col;
    n := n + 1;
  end loop;
  assert n = 5, 'five foreign keys checked';
end $$;
rollback;
