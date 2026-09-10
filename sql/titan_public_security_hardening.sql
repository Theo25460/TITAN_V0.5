-- TITAN OS - Public launch hardening
-- Run this in Supabase SQL editor before opening the app publicly.

create or replace function public.titan_guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only trusted backend/service-role flows may change entitlement flags.
  if auth.role() <> 'service_role' then
    new.is_elite := old.is_elite;
    new.is_tester := old.is_tester;
  end if;

  return new;
end;
$$;

drop trigger if exists titan_guard_profile_privileges on public.profiles;

create trigger titan_guard_profile_privileges
before update on public.profiles
for each row
execute function public.titan_guard_profile_privileges();

comment on function public.titan_guard_profile_privileges()
is 'Prevents authenticated clients from self-granting Elite or tester privileges.';
