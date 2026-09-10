-- TITAN OS v89 — remove duplicate shop policies and duplicate index.

begin;

drop index if exists public.shop_history_user_item_purchased_at_idx;

drop policy if exists "shop_history_own_all" on public.shop_history;
drop policy if exists "shop_history_insert_own" on public.shop_history;
drop policy if exists "shop_history_own_insert" on public.shop_history;
drop policy if exists "shop_history_own_select" on public.shop_history;
drop policy if exists "shop_history_select_own" on public.shop_history;

create policy "shop_history_select_own_v89"
on public.shop_history
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "shop_history_insert_own_v89"
on public.shop_history
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Public Read Shop" on public.shop_items;
drop policy if exists "game_data_public_read_shop_items" on public.shop_items;
drop policy if exists "shop_items_public_active_select_v1" on public.shop_items;
drop policy if exists "titan_catalog_public_read" on public.shop_items;
drop policy if exists "shop_items_admin_all_v1" on public.shop_items;

create policy "shop_items_visible_catalog_v89"
on public.shop_items
for select
to anon, authenticated
using (
  (
    coalesce(is_active, true) is true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
  or private.titan_is_admin((select auth.uid()))
);

create policy "shop_items_admin_insert_v89"
on public.shop_items
for insert
to authenticated
with check (private.titan_is_admin((select auth.uid())));

create policy "shop_items_admin_update_v89"
on public.shop_items
for update
to authenticated
using (private.titan_is_admin((select auth.uid())))
with check (private.titan_is_admin((select auth.uid())));

create policy "shop_items_admin_delete_v89"
on public.shop_items
for delete
to authenticated
using (private.titan_is_admin((select auth.uid())));

commit;
