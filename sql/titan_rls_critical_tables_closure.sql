begin;

-- TITAN OS - Critical tables RLS closure pass.
-- Purpose: reduce anon/authenticated blast radius on common user-owned tables.
-- Safe to rerun. Missing tables/columns are reported as NOTICE, not fatal.

create or replace function public.titan_try_exec(p_sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute p_sql;
exception
  when undefined_table or undefined_column or invalid_column_reference then
    raise notice 'Skipped RLS statement: % -- %', p_sql, sqlerrm;
  when duplicate_object then
    raise notice 'Already exists: %', p_sql;
end;
$$;

revoke all on function public.titan_try_exec(text) from public;

create or replace function public.titan_rls_has_column(p_table text, p_column text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

revoke all on function public.titan_rls_has_column(text, text) from public;

do $$
begin
  -- Private user-owned activity history.
  perform public.titan_try_exec('alter table if exists public.training_logs enable row level security');
  perform public.titan_try_exec('revoke all on public.training_logs from anon');
  perform public.titan_try_exec('grant select, insert on public.training_logs to authenticated');
  perform public.titan_try_exec('drop policy if exists "training_logs_select_own" on public.training_logs');
  perform public.titan_try_exec('create policy "training_logs_select_own" on public.training_logs for select to authenticated using (user_id = auth.uid())');
  perform public.titan_try_exec('drop policy if exists "training_logs_insert_own" on public.training_logs');
  perform public.titan_try_exec('create policy "training_logs_insert_own" on public.training_logs for insert to authenticated with check (user_id = auth.uid())');

  perform public.titan_try_exec('alter table if exists public.activities enable row level security');
  perform public.titan_try_exec('revoke all on public.activities from anon');
  perform public.titan_try_exec('grant select, insert, update, delete on public.activities to authenticated');
  perform public.titan_try_exec('drop policy if exists "activities_own_all" on public.activities');
  perform public.titan_try_exec('create policy "activities_own_all" on public.activities for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())');

  -- Purchases and achievement rows belong to one user.
  perform public.titan_try_exec('alter table if exists public.shop_history enable row level security');
  perform public.titan_try_exec('revoke all on public.shop_history from anon');
  perform public.titan_try_exec('grant select, insert on public.shop_history to authenticated');
  perform public.titan_try_exec('drop policy if exists "shop_history_own_select" on public.shop_history');
  perform public.titan_try_exec('create policy "shop_history_own_select" on public.shop_history for select to authenticated using (user_id = auth.uid())');
  perform public.titan_try_exec('drop policy if exists "shop_history_own_insert" on public.shop_history');
  perform public.titan_try_exec('create policy "shop_history_own_insert" on public.shop_history for insert to authenticated with check (user_id = auth.uid())');

  perform public.titan_try_exec('alter table if exists public.user_achievements enable row level security');
  perform public.titan_try_exec('revoke all on public.user_achievements from anon');
  perform public.titan_try_exec('grant select, insert on public.user_achievements to authenticated');
  perform public.titan_try_exec('drop policy if exists "user_achievements_own_select" on public.user_achievements');
  perform public.titan_try_exec('create policy "user_achievements_own_select" on public.user_achievements for select to authenticated using (user_id = auth.uid())');
  perform public.titan_try_exec('drop policy if exists "user_achievements_own_insert" on public.user_achievements');
  perform public.titan_try_exec('create policy "user_achievements_own_insert" on public.user_achievements for insert to authenticated with check (user_id = auth.uid())');

  perform public.titan_try_exec('alter table if exists public.inventory enable row level security');
  perform public.titan_try_exec('revoke all on public.inventory from anon');
  perform public.titan_try_exec('grant select, insert, update, delete on public.inventory to authenticated');
  perform public.titan_try_exec('drop policy if exists "inventory_own_all" on public.inventory');
  perform public.titan_try_exec('create policy "inventory_own_all" on public.inventory for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())');

  -- Social challenges are readable/writable only by involved users.
  perform public.titan_try_exec('alter table if exists public.social_challenges enable row level security');
  perform public.titan_try_exec('revoke all on public.social_challenges from anon');
  perform public.titan_try_exec('grant select, insert, update on public.social_challenges to authenticated');
  perform public.titan_try_exec('drop policy if exists "social_challenges_involved_select" on public.social_challenges');
  perform public.titan_try_exec('create policy "social_challenges_involved_select" on public.social_challenges for select to authenticated using (challenger_id = auth.uid() or opponent_id = auth.uid())');
  perform public.titan_try_exec('drop policy if exists "social_challenges_challenger_insert" on public.social_challenges');
  perform public.titan_try_exec('create policy "social_challenges_challenger_insert" on public.social_challenges for insert to authenticated with check (challenger_id = auth.uid())');
  perform public.titan_try_exec('drop policy if exists "social_challenges_involved_update" on public.social_challenges');
  perform public.titan_try_exec('create policy "social_challenges_involved_update" on public.social_challenges for update to authenticated using (challenger_id = auth.uid() or opponent_id = auth.uid()) with check (challenger_id = auth.uid() or opponent_id = auth.uid())');

  -- Chat remains public-read if desired, but inserts are authenticated and sender-owned.
  perform public.titan_try_exec('alter table if exists public.messages enable row level security');
  perform public.titan_try_exec('grant select on public.messages to anon, authenticated');
  perform public.titan_try_exec('grant insert on public.messages to authenticated');
  perform public.titan_try_exec('drop policy if exists "messages_public_read" on public.messages');
  perform public.titan_try_exec('create policy "messages_public_read" on public.messages for select to anon, authenticated using (true)');
  perform public.titan_try_exec('drop policy if exists "messages_insert_authenticated" on public.messages');
  perform public.titan_try_exec('create policy "messages_insert_authenticated" on public.messages for insert to authenticated with check (sender_id = auth.uid())');

  -- Guild tables vary by prototype. Try common owner/member shapes, skip if columns differ.
  perform public.titan_try_exec('alter table if exists public.guilds enable row level security');
  perform public.titan_try_exec('revoke all on public.guilds from anon');
  perform public.titan_try_exec('grant select, insert, update on public.guilds to authenticated');
  perform public.titan_try_exec('drop policy if exists "guilds_owner_write" on public.guilds');
  perform public.titan_try_exec('drop policy if exists "guilds_leader_write" on public.guilds');
  if public.titan_rls_has_column('guilds', 'owner_id') then
    perform public.titan_try_exec('create policy "guilds_owner_write" on public.guilds for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())');
  end if;
  if public.titan_rls_has_column('guilds', 'leader_id') then
    perform public.titan_try_exec('create policy "guilds_leader_write" on public.guilds for all to authenticated using (leader_id = auth.uid()) with check (leader_id = auth.uid())');
  end if;

  perform public.titan_try_exec('alter table if exists public.guild_raid enable row level security');
  perform public.titan_try_exec('revoke all on public.guild_raid from anon');
  perform public.titan_try_exec('grant select, insert, update on public.guild_raid to authenticated');
  perform public.titan_try_exec('drop policy if exists "guild_raid_owner_write" on public.guild_raid');
  perform public.titan_try_exec('drop policy if exists "guild_raid_user_write" on public.guild_raid');
  if public.titan_rls_has_column('guild_raid', 'owner_id') then
    perform public.titan_try_exec('create policy "guild_raid_owner_write" on public.guild_raid for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())');
  end if;
  if public.titan_rls_has_column('guild_raid', 'user_id') then
    perform public.titan_try_exec('create policy "guild_raid_user_write" on public.guild_raid for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())');
  end if;
end;
$$;

drop function if exists public.titan_try_exec(text);
drop function if exists public.titan_rls_has_column(text, text);

notify pgrst, 'reload schema';

commit;
