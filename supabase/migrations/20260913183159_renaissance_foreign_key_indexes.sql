-- Cover foreign keys used when deleting accounts, revising sessions or managing worlds.
-- Access grants and RLS remain unchanged.
create index if not exists coach_invites_accepted_by_idx on private.coach_invites(accepted_by);
create index if not exists adventure_profiles_selected_world_idx on public.adventure_profiles(selected_world);
create index if not exists adventure_progress_world_idx on public.adventure_progress(world_id);
create index if not exists adventure_rewards_world_idx on public.adventure_rewards(world_id);
create index if not exists training_revisions_log_idx on public.training_revisions(log_id);
create index if not exists training_revisions_user_idx on public.training_revisions(user_id);
