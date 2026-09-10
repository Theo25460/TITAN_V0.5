begin;

-- TITAN OS - Public catalog read access.
-- Purpose: keep the public app bootable after private-table RLS closure.
-- These tables contain game/catalog content, not private user sport history.
-- Safe to rerun. Does not delete or modify catalog rows.

do $$
declare
  v_table text;
  v_using text;
  v_has_is_active boolean;
  v_has_active boolean;
  v_tables text[] := array[
    'mobs',
    'bosses',
    'talents',
    'sports',
    'achievements_config',
    'global_config',
    'fun_stats',
    'shop_items',
    'news_updates'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise notice 'Skipping %. Table does not exist.', v_table;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);
    execute format('grant select on public.%I to anon, authenticated', v_table);

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'is_active'
    ) into v_has_is_active;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'active'
    ) into v_has_active;

    if v_has_is_active then
      v_using := 'coalesce(is_active, true) is true';
    elsif v_has_active then
      v_using := 'coalesce(active, true) is true';
    else
      v_using := 'true';
    end if;

    execute format('drop policy if exists titan_catalog_public_read on public.%I', v_table);
    execute format(
      'create policy titan_catalog_public_read on public.%I for select to anon, authenticated using (%s)',
      v_table,
      v_using
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
