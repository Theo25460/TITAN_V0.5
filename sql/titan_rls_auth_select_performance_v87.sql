-- TITAN OS v87 - RLS auth init-plan performance
-- Date: 2026-07-30
-- Objectif:
-- 1. Evaluer auth.uid() une seule fois par requete dans les policies publiques.
-- 2. Remplacer la derniere policy auth.role() par une policy ciblee TO authenticated.
-- Cette migration ne modifie ni les donnees ni la logique d'autorisation.

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
              coalesce(qual, '') like '%auth.uid()%'
              or coalesce(with_check, '') like '%auth.uid()%'
          )
        order by tablename, policyname
    loop
        new_qual := rec.qual;
        new_check := rec.with_check;

        if new_qual is not null then
            new_qual := replace(new_qual, '(select auth.uid())', '__titan_auth_uid_initplan__');
            new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
            new_qual := replace(new_qual, '__titan_auth_uid_initplan__', '(select auth.uid())');
        end if;

        if new_check is not null then
            new_check := replace(new_check, '(select auth.uid())', '__titan_auth_uid_initplan__');
            new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
            new_check := replace(new_check, '__titan_auth_uid_initplan__', '(select auth.uid())');
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
        end if;
    end loop;
end $$;

drop policy if exists titan_dynamic_quests_select_all on public.dynamic_quests;
create policy titan_dynamic_quests_select_all
on public.dynamic_quests
for select
to authenticated
using (true);

notify pgrst, 'reload schema';
