-- Read-only. After the bundle: every row must show ok = true.
with expected(schema, fonctions, droits, corps) as (values ('private', 166, '550d46c5de65', '3f3e1401b571'), ('public', 332, '44ce47c36337', '978b18a6a81f')), actual as (
select n.nspname as schema, count(*) as fonctions,
  substr(md5(string_agg(p.oid::regprocedure::text || '|' || p.prosecdef || has_function_privilege('anon', p.oid, 'EXECUTE') || has_function_privilege('authenticated', p.oid, 'EXECUTE')
    || coalesce(array_to_string(p.proconfig, ','), ''), ';' order by p.oid::regprocedure::text collate "C")), 1, 12) as droits,
  substr(md5(string_agg(p.oid::regprocedure::text || '|' || md5(lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n\r]*', '', 'g'), '\s+', '', 'g'))), ';'
    order by p.oid::regprocedure::text collate "C") filter (where p.proname not in ('handle_audit_log', 'titan_session_exclusion_v1'))), 1, 12) as corps
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') group by 1 order by 1
)
select e.schema, a.fonctions, a.droits, a.corps,
  (a.fonctions = e.fonctions and a.droits = e.droits and a.corps = e.corps) as ok
from expected e left join actual a on a.schema = e.schema order by 1;

-- Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.club_match for the pilot clubs' accounts only; leave screens.club_match_versus closed.
