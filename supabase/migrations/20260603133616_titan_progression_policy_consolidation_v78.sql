begin;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "training_logs_select_own" on public.training_logs;

notify pgrst, 'reload schema';

commit;
