-- INSERT must respect the economy even when it comes from a trusted writer.
-- Existing UPDATE guards are retained. CHECK keeps the historical nullable contract.
-- NOT VALID avoids scanning or rewriting existing rows; new/updated rows are checked.
-- Validate separately after the release preflight. No grants or RPC signatures change.
begin;
set local lock_timeout = '5s';
alter table public.profiles
  add constraint profiles_credits_minimum_check check (credits >= 0) not valid,
  add constraint profiles_xp_minimum_check check (xp >= 0) not valid,
  add constraint profiles_level_minimum_check check (level >= 1) not valid;
commit;
