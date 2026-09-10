begin;

-- TITAN OS v40 - integrity/RLS checklist for the browser app.
-- Run in Supabase SQL editor after reviewing table names against production.

alter table if exists public.profiles enable row level security;
alter table if exists public.training_logs enable row level security;
alter table if exists public.shop_history enable row level security;
alter table if exists public.user_achievements enable row level security;
alter table if exists public.social_challenges enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.mobs to anon, authenticated;
grant select on public.bosses to anon, authenticated;
grant select on public.talents to anon, authenticated;
grant select on public.sports to anon, authenticated;
grant select on public.achievements_config to anon, authenticated;
grant select on public.global_config to anon, authenticated;
grant select on public.fun_stats to anon, authenticated;
grant select on public.shop_items to anon, authenticated;
grant select on public.news_updates to anon, authenticated;

grant select, insert on public.shop_history to authenticated;
grant select, insert on public.user_achievements to authenticated;
grant select, insert, update on public.social_challenges to authenticated;

create table if not exists public.shop_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  purchased_at timestamptz default now()
);

create index if not exists shop_history_user_item_date_idx
on public.shop_history(user_id, item_id, purchased_at desc);

drop policy if exists "shop_history_select_own" on public.shop_history;
drop policy if exists "shop_history_insert_own" on public.shop_history;

create policy "shop_history_select_own"
on public.shop_history
for select
to authenticated
using (user_id = auth.uid());

create policy "shop_history_insert_own"
on public.shop_history
for insert
to authenticated
with check (user_id = auth.uid());

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz default now(),
  primary key (user_id, achievement_id)
);

drop policy if exists "user_achievements_select_own" on public.user_achievements;
drop policy if exists "user_achievements_insert_own" on public.user_achievements;

create policy "user_achievements_select_own"
on public.user_achievements
for select
to authenticated
using (user_id = auth.uid());

create policy "user_achievements_insert_own"
on public.user_achievements
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "social_challenges_select_involved" on public.social_challenges;
drop policy if exists "social_challenges_insert_own" on public.social_challenges;
drop policy if exists "social_challenges_update_involved" on public.social_challenges;

create policy "social_challenges_select_involved"
on public.social_challenges
for select
to authenticated
using (challenger_id = auth.uid() or opponent_id = auth.uid());

create policy "social_challenges_insert_own"
on public.social_challenges
for insert
to authenticated
with check (challenger_id = auth.uid());

create policy "social_challenges_update_involved"
on public.social_challenges
for update
to authenticated
using (challenger_id = auth.uid() or opponent_id = auth.uid())
with check (challenger_id = auth.uid() or opponent_id = auth.uid());

commit;
