-- TITAN OS v86 - RLS auth function performance
-- Date: 2026-06-04
-- Objectif: eviter la reevaluation ligne par ligne de auth.uid()/auth.role()
-- dans les policies RLS, en suivant la recommandation Supabase:
-- auth.uid() -> (select auth.uid()).

do $$
declare
    rec record;
    new_qual text;
    new_check text;
    stmt text;
begin
    for rec in
        select schemaname, tablename, policyname, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and (
              (qual is not null and (qual like '%auth.uid()%' or qual like '%auth.role()%'))
              or
              (with_check is not null and (with_check like '%auth.uid()%' or with_check like '%auth.role()%'))
          )
        order by tablename, policyname
    loop
        new_qual := rec.qual;
        new_check := rec.with_check;

        if new_qual is not null and position('select auth.uid' in lower(new_qual)) = 0 then
            new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
        end if;
        if new_qual is not null and position('select auth.role' in lower(new_qual)) = 0 then
            new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
        end if;

        if new_check is not null and position('select auth.uid' in lower(new_check)) = 0 then
            new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
        end if;
        if new_check is not null and position('select auth.role' in lower(new_check)) = 0 then
            new_check := replace(new_check, 'auth.role()', '(select auth.role())');
        end if;

        if new_qual is distinct from rec.qual or new_check is distinct from rec.with_check then
            stmt := format('alter policy %I on %I.%I', rec.policyname, rec.schemaname, rec.tablename);
            if new_qual is not null then
                stmt := stmt || format(' using (%s)', new_qual);
            end if;
            if new_check is not null then
                stmt := stmt || format(' with check (%s)', new_check);
            end if;
            execute stmt;
            raise notice 'optimized RLS policy: %.%', rec.tablename, rec.policyname;
        end if;
    end loop;
end $$;
