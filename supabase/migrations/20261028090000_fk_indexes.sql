-- V11-34: five foreign keys had no covering index (Supabase performance advisor, read on 28/10/2026). Account deletion cascades through
-- several of them (titan_expedition_members.user_id, titan_moment_cheers.user_id, titan_moments.log_id): without an index each cascade scans
-- the whole table. Plain additive indexes on small tables (non-concurrent, brief lock; the caller owns the transaction: never BEGIN/COMMIT here).
-- Rollback: drop index if exists public.adventure_quest_rewards_world_id_fk_idx, public.titan_challenges_creator_id_fk_idx,
-- public.titan_expedition_members_user_id_fk_idx, public.titan_moment_cheers_user_id_fk_idx, public.titan_moments_log_id_fk_idx;

do $$
declare
  previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if to_regclass('public.adventure_quest_rewards') is not null then
    create index if not exists adventure_quest_rewards_world_id_fk_idx on public.adventure_quest_rewards (world_id);
  end if;
  if to_regclass('public.titan_challenges') is not null then
    create index if not exists titan_challenges_creator_id_fk_idx on public.titan_challenges (creator_id);
  end if;
  if to_regclass('public.titan_expedition_members') is not null then
    create index if not exists titan_expedition_members_user_id_fk_idx on public.titan_expedition_members (user_id);
  end if;
  if to_regclass('public.titan_moment_cheers') is not null then
    create index if not exists titan_moment_cheers_user_id_fk_idx on public.titan_moment_cheers (user_id);
  end if;
  if to_regclass('public.titan_moments') is not null then
    create index if not exists titan_moments_log_id_fk_idx on public.titan_moments (log_id);
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;
