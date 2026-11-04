
select jsonb_object_agg(t, jsonb_build_object('n', n, 'h', h)) from (
 select format('%I.%I', schemaname, tablename) t, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint n,
        (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(to_jsonb(x)::text, E''\n'' order by to_jsonb(x)::text collate "C"), '''')) as h from %I.%I x', schemaname, tablename), false, true, '')))[1]::text h
 from pg_tables where schemaname in ('public','private') or (schemaname='auth' and tablename in ('users','identities'))
) z;
