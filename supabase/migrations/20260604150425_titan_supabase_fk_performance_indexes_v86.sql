-- TITAN OS v86 - final Supabase FK performance pass
-- Date: 2026-06-04
-- Objectif: ajouter les index manquants sur les cles etrangeres publiques.
-- Le script est idempotent et ignore toute FK deja couverte par un index valide
-- dont les colonnes de gauche correspondent a la FK.

do $$
declare
    rec record;
begin
    for rec in
        with fk as (
            select
                n.nspname as schema_name,
                c.relname as table_name,
                con.conrelid,
                array_agg(u.attnum::int order by u.ord) as key_attnums,
                array_agg(a.attname order by u.ord) as columns,
                string_agg(a.attname, '_' order by u.ord) as column_slug
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            join unnest(con.conkey) with ordinality as u(attnum, ord) on true
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum
            where con.contype = 'f'
              and n.nspname = 'public'
            group by n.nspname, c.relname, con.conrelid, con.conname
        ),
        idx as (
            select
                i.indrelid,
                array_agg(k.attnum::int order by k.ord) filter (where k.attnum > 0) as key_attnums
            from pg_index i
            join unnest(i.indkey) with ordinality as k(attnum, ord) on true
            where i.indisvalid
            group by i.indrelid, i.indexrelid
        )
        select
            fk.schema_name,
            fk.table_name,
            left(fk.table_name || '_' || fk.column_slug || '_fk_idx', 63) as index_name,
            (
                select string_agg(quote_ident(col), ', ')
                from unnest(fk.columns) as col
            ) as index_columns
        from fk
        where not exists (
            select 1
            from idx
            where idx.indrelid = fk.conrelid
              and idx.key_attnums[1:cardinality(fk.key_attnums)] = fk.key_attnums
        )
        order by fk.table_name, fk.column_slug
    loop
        execute format(
            'create index if not exists %I on %I.%I (%s)',
            rec.index_name,
            rec.schema_name,
            rec.table_name,
            rec.index_columns
        );
        raise notice 'created or verified FK index: %.% on (%)',
            rec.table_name,
            rec.index_name,
            rec.index_columns;
    end loop;
end $$;
