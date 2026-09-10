begin;

-- TITAN OS v78 - remove duplicate progression SELECT policies.
-- The remaining self_or_admin policies already cover the same user-owned reads.

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "training_logs_select_own" on public.training_logs;

notify pgrst, 'reload schema';

commit;
