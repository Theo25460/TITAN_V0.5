-- V11-09R: additive schema, all fields reachable, unique IDs, meaningful bounds.
begin;
do $$
declare s record; ids text[]; f jsonb; checked integer := 0;
begin
  for s in select id, extra_fields from public.sports where is_active loop
    checked := checked + 1;
    assert jsonb_array_length(s.extra_fields) >= 3, 'missing schema for ' || s.id;
    select array_agg(x->>'id') into ids from jsonb_array_elements(s.extra_fields) x;
    assert cardinality(ids) = (select count(distinct id) from unnest(ids) id), 'duplicate field in ' || s.id;
    for f in select * from jsonb_array_elements(s.extra_fields) loop
      assert f->>'id' is not null and f->>'label' is not null, 'missing metadata in ' || s.id;
      if f->>'type' = 'number' then
        assert (f->>'min')::numeric <= (f->>'max')::numeric, 'invalid bounds in ' || s.id;
      end if;
    end loop;
  end loop;
  assert checked > 0, 'empty catalog cannot demonstrate coverage';
  if exists(select 1 from public.sports where id='yoga') then
    assert exists(select 1 from public.sports sport_row, jsonb_array_elements(sport_row.extra_fields) field_row where sport_row.id='yoga' and field_row->>'id'='style'), 'yoga style missing';
  end if;
end $$;
rollback;
