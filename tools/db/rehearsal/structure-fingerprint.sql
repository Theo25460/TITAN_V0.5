with obj as (
 select 'column' cat, c.table_schema||'.'||c.table_name||'.'||c.column_name nm, md5(c.data_type||c.udt_name||c.is_nullable||coalesce(c.column_default,'')||coalesce(c.character_maximum_length::text,'')) h from information_schema.columns c where c.table_schema in ('public','private')
 union all
 select 'constraint', conrelid::regclass::text||'.'||conname, md5(pg_get_constraintdef(oid)) from pg_constraint where connamespace in ('public'::regnamespace,'private'::regnamespace)
 union all
 select 'index', schemaname||'.'||indexname, md5(indexdef) from pg_indexes where schemaname in ('public','private')
 union all
 select 'function', p.oid::regprocedure::text, md5(replace(pg_get_functiondef(p.oid), E'\r', '')) from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace) and p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
 union all
 select 'policy', schemaname||'.'||tablename||'.'||policyname, md5(coalesce(qual,'')||coalesce(with_check,'')||cmd||roles::text) from pg_policies where schemaname in ('public','private')
 union all
 select 'trigger', tgrelid::regclass::text||'.'||tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t where not tgisinternal and (tgrelid::regclass::text like 'public.%' or tgrelid::regclass::text like 'private.%' or tgrelid::regclass::text = 'auth.users')
 union all
 select 'rls', c.oid::regclass::text, md5(c.relrowsecurity::text||c.relforcerowsecurity::text) from pg_class c where c.relkind in ('r','p') and c.relnamespace in ('public'::regnamespace,'private'::regnamespace)
 union all
 select 'acl', c.oid::regclass::text, md5(coalesce((select string_agg(a.grantee::regrole::text||a.privilege_type, ',' order by a.grantee::regrole::text, a.privilege_type) from aclexplode(c.relacl) a where a.grantee::regrole::text in ('anon','authenticated','service_role') and a.privilege_type <> 'MAINTAIN'),'')) from pg_class c where c.relkind in ('r','p','v','S') and c.relnamespace in ('public'::regnamespace,'private'::regnamespace)
)
select coalesce(jsonb_agg(jsonb_build_object('cat',cat,'n',n,'h',h,'items',items)),'[]'::jsonb) from (select cat, count(*) n, md5(string_agg(nm||h, '' order by nm)) h, jsonb_object_agg(nm,h) as items from obj group by cat order by cat) x
