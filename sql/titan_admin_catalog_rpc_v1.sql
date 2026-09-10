-- TITAN OS - Admin catalog write RPC.
-- Applies after titan_admin_control_center_v1.sql.
-- Purpose: make admin writes reliable under RLS, stamp audit columns server-side,
-- and expose legacy mobs/bosses to the admin control center.

create or replace function private.titan_admin_upsert_row_v1(
  p_table text,
  p_pk text default 'id',
  p_payload jsonb default '{}'::jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_allowed_tables constant text[] := array[
    'site_settings', 'content_blocks', 'dynamic_pages', 'announcements',
    'lore_chapters', 'creatures', 'mobs', 'bosses', 'shop_items', 'sports',
    'contact_messages', 'bug_reports', 'reports', 'influencers', 'training_logs',
    'contest_entries'
  ];
  v_table text := lower(trim(coalesce(p_table, '')));
  v_pk text := lower(trim(coalesce(nullif(p_pk, ''), 'id')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_pk_value text;
  v_exists boolean := false;
  v_old jsonb;
  v_new jsonb;
  v_columns text[];
  v_insert_columns text;
  v_insert_select text;
  v_update_assignments text;
  v_action text;
begin
  perform private.titan_admin_assert();

  if v_table = '' or not (v_table = any(v_allowed_tables)) or to_regclass('public.' || quote_ident(v_table)) is null then
    raise exception 'ADMIN_TABLE_NOT_ALLOWED: %', p_table using errcode = '42501';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_table
      and column_name = v_pk
  ) then
    raise exception 'ADMIN_PK_NOT_FOUND: %.%', v_table, v_pk using errcode = '42703';
  end if;

  v_pk_value := nullif(v_payload ->> v_pk, '');

  if v_pk_value is not null then
    execute format('select exists(select 1 from public.%I as t where t.%I::text = $1)', v_table, v_pk)
    using v_pk_value
    into v_exists;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = v_table and column_name = 'updated_at'
  ) then
    v_payload := v_payload || jsonb_build_object('updated_at', now());
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = v_table and column_name = 'updated_by'
  ) then
    v_payload := v_payload || jsonb_build_object('updated_by', auth.uid());
  end if;

  if not v_exists and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = v_table and column_name = 'created_by'
  ) then
    v_payload := v_payload || jsonb_build_object('created_by', auth.uid());
  end if;

  select array_agg(c.column_name order by c.ordinal_position)
  into v_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = v_table
    and v_payload ? c.column_name
    and c.is_generated = 'NEVER'
    and c.identity_generation is null;

  if coalesce(array_length(v_columns, 1), 0) = 0 then
    raise exception 'ADMIN_EMPTY_PAYLOAD' using errcode = '22023';
  end if;

  if v_exists then
    execute format('select to_jsonb(t.*) from public.%I as t where t.%I::text = $1', v_table, v_pk)
    using v_pk_value
    into v_old;

    select string_agg(format('%1$I = r.%1$I', col), ', ')
    into v_update_assignments
    from unnest(v_columns) as col
    where col <> v_pk;

    if coalesce(v_update_assignments, '') = '' then
      raise exception 'ADMIN_EMPTY_UPDATE' using errcode = '22023';
    end if;

    execute format(
      'update public.%1$I as t set %2$s from jsonb_populate_record(null::public.%1$I, $1) as r where t.%3$I::text = $2 returning to_jsonb(t.*)',
      v_table,
      v_update_assignments,
      v_pk
    )
    using v_payload, v_pk_value
    into v_new;

    v_action := 'update_' || v_table;
  else
    select string_agg(format('%I', col), ', '), string_agg(format('r.%I', col), ', ')
    into v_insert_columns, v_insert_select
    from unnest(v_columns) as col;

    execute format(
      'insert into public.%1$I (%2$s) select %3$s from jsonb_populate_record(null::public.%1$I, $1) as r returning to_jsonb(%1$I.*)',
      v_table,
      v_insert_columns,
      v_insert_select
    )
    using v_payload
    into v_new;

    v_action := 'create_' || v_table;
  end if;

  if v_new is null then
    raise exception 'ADMIN_WRITE_FAILED: %', v_table using errcode = 'P0002';
  end if;

  perform private.titan_admin_log_v1(
    v_action,
    v_table,
    coalesce(v_new ->> v_pk, v_pk_value, v_new ->> 'id'),
    v_old,
    v_new,
    p_reason
  );

  return v_new;
end;
$$;

create or replace function public.titan_admin_upsert_row_v1(
  p_table text,
  p_pk text default 'id',
  p_payload jsonb default '{}'::jsonb,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.titan_admin_upsert_row_v1(p_table, p_pk, p_payload, p_reason);
$$;

revoke all on function private.titan_admin_upsert_row_v1(text, text, jsonb, text) from public;
grant execute on function private.titan_admin_upsert_row_v1(text, text, jsonb, text) to authenticated;
grant execute on function public.titan_admin_upsert_row_v1(text, text, jsonb, text) to authenticated;

alter table if exists public.mobs enable row level security;
alter table if exists public.bosses enable row level security;

grant select on public.mobs, public.bosses to anon, authenticated;
grant select, insert, update, delete on public.mobs, public.bosses to authenticated;
grant usage, select on sequence public.mobs_id_seq to authenticated;

do $$
begin
  if to_regclass('public.bosses_id_seq') is not null then
    grant usage, select on sequence public.bosses_id_seq to authenticated;
  end if;
end;
$$;

drop policy if exists "mobs_admin_all_v1" on public.mobs;
create policy "mobs_admin_all_v1"
on public.mobs
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "bosses_admin_all_v1" on public.bosses;
create policy "bosses_admin_all_v1"
on public.bosses
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

notify pgrst, 'reload schema';
