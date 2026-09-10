begin;

create extension if not exists pgcrypto;

-- Admin identities. Run titan_admin_claim_first('ton-email@example.com') once after this script.
create table if not exists public.titan_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator' check (role in ('owner', 'admin', 'moderator')),
  permissions jsonb not null default '{"profiles":true,"news":true,"reports":true,"audit":true}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  revoked_at timestamptz
);

create table if not exists public.titan_admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.titan_moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.news_updates (
  id uuid primary key default gen_random_uuid(),
  version_id text not null unique,
  title text not null,
  message text not null,
  kind text not null default 'update' check (kind in ('update', 'maintenance', 'event', 'warning')),
  active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null default 'Agent',
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists admin_notes text;
alter table public.profiles add column if not exists moderated_at timestamptz;
alter table public.profiles add column if not exists moderated_by uuid references auth.users(id) on delete set null;

create unique index if not exists profiles_friend_code_unique_idx
on public.profiles(friend_code)
where friend_code is not null;

create index if not exists titan_admin_audit_created_idx on public.titan_admin_audit(created_at desc);
create index if not exists titan_reports_status_idx on public.titan_moderation_reports(status, created_at desc);
create index if not exists titan_news_active_idx on public.news_updates(active, created_at desc);
create index if not exists titan_profiles_moderation_idx on public.profiles(is_suspended, updated_at desc);

create or replace function public.titan_generate_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i integer;
begin
  loop
    code := 'TN-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

revoke all on function public.titan_generate_friend_code() from public;
grant execute on function public.titan_generate_friend_code() to authenticated;

create or replace function public.titan_assign_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select friend_code into code
  from public.profiles
  where id = auth.uid();

  if code is not null and code ~ '^TN-[A-Z2-9]{4,8}$' then
    return code;
  end if;

  code := public.titan_generate_friend_code();
  update public.profiles
  set friend_code = code, updated_at = now()
  where id = auth.uid();

  return code;
end;
$$;

revoke all on function public.titan_assign_friend_code() from public;
grant execute on function public.titan_assign_friend_code() to authenticated;

alter table public.titan_admins enable row level security;
alter table public.titan_admin_audit enable row level security;
alter table public.titan_moderation_reports enable row level security;
alter table public.news_updates enable row level security;
alter table public.messages enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.news_updates to anon, authenticated;
grant select on public.messages to anon, authenticated;
grant insert on public.messages to authenticated;
grant select, insert on public.titan_moderation_reports to authenticated;
grant select on public.titan_admins, public.titan_admin_audit to authenticated;

create or replace function public.titan_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.titan_admins a
    where a.user_id = p_user_id
      and a.revoked_at is null
  );
$$;

revoke all on function public.titan_is_admin(uuid) from public;
grant execute on function public.titan_is_admin(uuid) to anon, authenticated;

create or replace function public.titan_admin_role(p_user_id uuid default auth.uid())
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select a.role
    from public.titan_admins a
    where a.user_id = p_user_id
      and a.revoked_at is null
    limit 1
  ), 'none');
$$;

revoke all on function public.titan_admin_role(uuid) from public;
grant execute on function public.titan_admin_role(uuid) to authenticated;

drop policy if exists "titan_admins_read_self_or_admin" on public.titan_admins;
create policy "titan_admins_read_self_or_admin"
on public.titan_admins
for select
to authenticated
using (user_id = auth.uid() or public.titan_is_admin(auth.uid()));

drop policy if exists "titan_audit_read_admin" on public.titan_admin_audit;
create policy "titan_audit_read_admin"
on public.titan_admin_audit
for select
to authenticated
using (public.titan_is_admin(auth.uid()));

drop policy if exists "titan_reports_insert_authenticated" on public.titan_moderation_reports;
create policy "titan_reports_insert_authenticated"
on public.titan_moderation_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "titan_reports_select_admin_or_own" on public.titan_moderation_reports;
create policy "titan_reports_select_admin_or_own"
on public.titan_moderation_reports
for select
to authenticated
using (public.titan_is_admin(auth.uid()) or reporter_id = auth.uid());

drop policy if exists "news_updates_public_active" on public.news_updates;
create policy "news_updates_public_active"
on public.news_updates
for select
to anon, authenticated
using (active = true or public.titan_is_admin(auth.uid()));

drop policy if exists "messages_public_read" on public.messages;
create policy "messages_public_read"
on public.messages
for select
to anon, authenticated
using (true);

drop policy if exists "messages_insert_authenticated" on public.messages;
create policy "messages_insert_authenticated"
on public.messages
for insert
to authenticated
with check (sender_id is null or sender_id = auth.uid());

create or replace function public.titan_admin_assert()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.titan_is_admin(auth.uid()) then
    raise exception 'TITAN_ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.titan_admin_assert() from public;
grant execute on function public.titan_admin_assert() to authenticated;

create or replace function public.titan_admin_audit_write(
  p_action text,
  p_target_user_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.titan_admin_audit(admin_id, action, target_user_id, payload)
  values (auth.uid(), p_action, p_target_user_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function public.titan_admin_audit_write(text, uuid, jsonb) from public;
grant execute on function public.titan_admin_audit_write(text, uuid, jsonb) to authenticated;

create or replace function public.titan_admin_claim_first(p_expected_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.titan_admins where revoked_at is null) then
    raise exception 'ADMIN_ALREADY_EXISTS' using errcode = '42501';
  end if;

  if v_email <> lower(trim(p_expected_email)) then
    raise exception 'EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.titan_admins(user_id, role, created_by)
  values (auth.uid(), 'owner', auth.uid());

  perform public.titan_admin_audit_write('admin.claim_first', auth.uid(), jsonb_build_object('email', v_email));
  return jsonb_build_object('ok', true, 'role', 'owner');
end;
$$;

revoke all on function public.titan_admin_claim_first(text) from public;
grant execute on function public.titan_admin_claim_first(text) to authenticated;

create or replace function public.titan_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.titan_admin_assert();

  select jsonb_build_object(
    'role', public.titan_admin_role(auth.uid()),
    'profilesTotal', (select count(*) from public.profiles),
    'profilesSuspended', (select count(*) from public.profiles where is_suspended is true),
    'eliteTotal', (select count(*) from public.profiles where is_elite is true),
    'testerTotal', (select count(*) from public.profiles where is_tester is true),
    'trainingLogsTotal', (select count(*) from public.training_logs),
    'openReports', (select count(*) from public.titan_moderation_reports where status in ('open','reviewing')),
    'messagesTotal', (case when to_regclass('public.messages') is not null then (select count(*) from public.messages) else 0 end),
    'activeNews', (select count(*) from public.news_updates where active is true),
    'contentTables', 8,
    'latestNews', (
      select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
      from (select id, version_id, title, kind, active, created_at from public.news_updates order by created_at desc limit 5) n
    ),
    'recentProfiles', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb)
      from (
        select id, username, level, credits, is_elite, is_tester, is_suspended, updated_at
        from public.profiles
        order by updated_at desc nulls last
        limit 8
      ) p
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.titan_admin_dashboard() from public;
grant execute on function public.titan_admin_dashboard() to authenticated;

create or replace function public.titan_admin_list_profiles(
  p_search text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  level integer,
  credits integer,
  is_elite boolean,
  is_tester boolean,
  is_suspended boolean,
  suspension_reason text,
  admin_notes text,
  friend_code text,
  streak_count integer,
  last_seen_news_version text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.titan_admin_assert();

  return query
  select p.id, p.username, p.level, p.credits, p.is_elite, p.is_tester, p.is_suspended,
         p.suspension_reason, p.admin_notes, p.friend_code, p.streak_count,
         p.last_seen_news_version, p.created_at, p.updated_at
  from public.profiles p
  where coalesce(trim(p_search), '') = ''
     or p.username ilike '%' || trim(p_search) || '%'
     or p.friend_code ilike '%' || trim(p_search) || '%'
     or p.id::text = trim(p_search)
  order by p.updated_at desc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.titan_admin_list_profiles(text, integer, integer) from public;
grant execute on function public.titan_admin_list_profiles(text, integer, integer) to authenticated;

create or replace function public.titan_admin_allowed_content_tables()
returns table (
  table_name text,
  label text,
  description text,
  order_by text
)
language sql
security definer
set search_path = public
stable
as $$
  select * from (values
    ('sports', 'Sports', 'Disciplines, categories, XP, formulaires et champs avances.', 'id'),
    ('mobs', 'Mobs', 'Ennemis standards de la campagne.', 'id'),
    ('bosses', 'Bosses', 'Boss, niveaux, HP, faiblesse et visuels.', 'level'),
    ('talents', 'Talents', 'Arbre de talents et prerequis.', 'path'),
    ('achievements_config', 'Succes', 'Trophees, objectifs et recompenses.', 'id'),
    ('shop_items', 'Boutique', 'Objets, prix, effets, cooldown et activation.', 'id'),
    ('fun_stats', 'Fun stats', 'Equivalences statistiques affichees dans l app.', 'id'),
    ('global_config', 'Config globale', 'Parametres publics comme maintenance_mode.', 'key')
  ) as t(table_name, label, description, order_by)
  where to_regclass('public.' || table_name) is not null;
$$;

revoke all on function public.titan_admin_allowed_content_tables() from public;
grant execute on function public.titan_admin_allowed_content_tables() to authenticated;

create or replace function public.titan_admin_content_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.titan_admin_assert();

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'table', t.table_name,
        'label', t.label,
        'description', t.description,
        'orderBy', t.order_by,
        'columns', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', c.column_name,
            'type', c.data_type,
            'udt', c.udt_name,
            'nullable', c.is_nullable = 'YES',
            'default', c.column_default
          ) order by c.ordinal_position), '[]'::jsonb)
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = t.table_name
        )
      ) order by t.label
    ), '[]'::jsonb)
    from public.titan_admin_allowed_content_tables() t
  );
end;
$$;

revoke all on function public.titan_admin_content_catalog() from public;
grant execute on function public.titan_admin_content_catalog() to authenticated;

create or replace function public.titan_admin_list_content(
  p_table text,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order text;
  v_sql text;
  result jsonb;
begin
  perform public.titan_admin_assert();

  select order_by into v_order
  from public.titan_admin_allowed_content_tables()
  where table_name = p_table;

  if v_order is null then
    raise exception 'CONTENT_TABLE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = v_order
  ) then
    v_order := 'id';
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by %I), ''[]''::jsonb) from (select * from public.%I limit %s) t',
    v_order,
    p_table,
    least(greatest(coalesce(p_limit, 100), 1), 500)
  );
  execute v_sql into result;
  return result;
end;
$$;

revoke all on function public.titan_admin_list_content(text, integer) from public;
grant execute on function public.titan_admin_list_content(text, integer) to authenticated;

create or replace function public.titan_admin_json_value_sql(
  p_value jsonb,
  p_data_type text,
  p_udt_name text
)
returns text
language plpgsql
immutable
as $$
begin
  if p_value is null or p_value = 'null'::jsonb then
    return 'null';
  end if;

  if p_data_type = 'jsonb' then
    return quote_literal(p_value::text) || '::jsonb';
  elsif p_data_type = 'json' then
    return quote_literal(p_value::text) || '::json';
  elsif p_data_type in ('integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision') then
    return quote_literal(p_value #>> '{}') || '::' || p_data_type;
  elsif p_data_type = 'boolean' then
    return quote_literal(p_value #>> '{}') || '::boolean';
  elsif p_data_type like 'timestamp%' then
    return quote_literal(p_value #>> '{}') || '::timestamptz';
  else
    return quote_literal(p_value #>> '{}');
  end if;
end;
$$;

revoke all on function public.titan_admin_json_value_sql(jsonb, text, text) from public;

create or replace function public.titan_admin_upsert_content(
  p_table text,
  p_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
  v_key text := 'id';
  v_exists boolean;
  v_cols text;
  v_vals text;
  v_sets text;
  v_sql text;
  v_result jsonb;
begin
  perform public.titan_admin_assert();

  select exists(select 1 from public.titan_admin_allowed_content_tables() where table_name = p_table) into v_allowed;
  if not v_allowed then
    raise exception 'CONTENT_TABLE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_table = 'global_config' then
    v_key := 'key';
  end if;

  if p_row is null or not (p_row ? v_key) then
    raise exception 'CONTENT_KEY_REQUIRED' using errcode = '22023';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = v_key
  ) into v_exists;
  if not v_exists then
    raise exception 'CONTENT_KEY_COLUMN_MISSING' using errcode = '42703';
  end if;

  select
    string_agg(format('%I', c.column_name), ', '),
    string_agg(public.titan_admin_json_value_sql(p_row -> c.column_name, c.data_type, c.udt_name), ', '),
    string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ')
  into v_cols, v_vals, v_sets
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
    and p_row ? c.column_name
    and c.is_generated = 'NEVER'
    and c.column_name not in ('created_at');

  if v_cols is null then
    raise exception 'CONTENT_NO_VALID_COLUMNS' using errcode = '22023';
  end if;

  select string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ')
  into v_sets
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
    and p_row ? c.column_name
    and c.column_name <> v_key
    and c.column_name not in ('created_at')
    and c.is_generated = 'NEVER';

  if v_sets is null then
    v_sets := format('%I = excluded.%I', v_key, v_key);
  end if;

  v_sql := format(
    'insert into public.%I (%s) values (%s) on conflict (%I) do update set %s returning to_jsonb(%I.*)',
    p_table, v_cols, v_vals, v_key, v_sets, p_table
  );
  execute v_sql into v_result;

  perform public.titan_admin_audit_write('content.upsert', null, jsonb_build_object('table', p_table, 'row', p_row));
  notify pgrst, 'reload schema';
  return v_result;
end;
$$;

revoke all on function public.titan_admin_upsert_content(text, jsonb) from public;
grant execute on function public.titan_admin_upsert_content(text, jsonb) to authenticated;

create or replace function public.titan_admin_delete_content(
  p_table text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
  v_key_col text := 'id';
  v_sql text;
  v_result jsonb;
begin
  perform public.titan_admin_assert();

  select exists(select 1 from public.titan_admin_allowed_content_tables() where table_name = p_table) into v_allowed;
  if not v_allowed then
    raise exception 'CONTENT_TABLE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_table = 'global_config' then
    v_key_col := 'key';
  end if;

  v_sql := format('delete from public.%I where %I::text = %L returning to_jsonb(%I.*)', p_table, v_key_col, p_key, p_table);
  execute v_sql into v_result;

  if v_result is null then
    raise exception 'CONTENT_ROW_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('content.delete', null, jsonb_build_object('table', p_table, 'key', p_key));
  notify pgrst, 'reload schema';
  return v_result;
end;
$$;

revoke all on function public.titan_admin_delete_content(text, text) from public;
grant execute on function public.titan_admin_delete_content(text, text) to authenticated;

create or replace function public.titan_admin_list_messages(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.titan_admin_assert();

  if to_regclass('public.messages') is null then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), ''[]''::jsonb)
     from (select * from public.messages order by created_at desc limit %s) m',
    least(greatest(coalesce(p_limit, 50), 1), 200)
  ) into result;

  return result;
end;
$$;

revoke all on function public.titan_admin_list_messages(integer) from public;
grant execute on function public.titan_admin_list_messages(integer) to authenticated;

create or replace function public.titan_admin_delete_message(p_message_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.titan_admin_assert();

  if to_regclass('public.messages') is null then
    raise exception 'MESSAGES_TABLE_MISSING' using errcode = '42P01';
  end if;

  execute format('delete from public.messages where id::text = %L returning to_jsonb(messages.*)', p_message_id)
  into result;

  if result is null then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('message.delete', null, result);
  return result;
end;
$$;

revoke all on function public.titan_admin_delete_message(text) from public;
grant execute on function public.titan_admin_delete_message(text) to authenticated;

create or replace function public.titan_admin_update_profile(
  p_user_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_level integer;
  v_credits integer;
  v_row public.profiles%rowtype;
begin
  perform public.titan_admin_assert();

  if p_user_id is null then
    raise exception 'TARGET_REQUIRED' using errcode = '22023';
  end if;

  if v_patch ? 'level' then
    v_level := greatest(1, least((v_patch ->> 'level')::integer, 999));
  end if;

  if v_patch ? 'credits' then
    v_credits := greatest(0, least((v_patch ->> 'credits')::integer, 999999999));
  end if;

  update public.profiles as p
  set
    username = case when v_patch ? 'username' then nullif(trim(v_patch ->> 'username'), '') else p.username end,
    level = case when v_patch ? 'level' then v_level else p.level end,
    credits = case when v_patch ? 'credits' then v_credits else p.credits end,
    is_elite = case when v_patch ? 'is_elite' then (v_patch ->> 'is_elite')::boolean else p.is_elite end,
    is_tester = case when v_patch ? 'is_tester' then (v_patch ->> 'is_tester')::boolean else p.is_tester end,
    is_suspended = case when v_patch ? 'is_suspended' then (v_patch ->> 'is_suspended')::boolean else p.is_suspended end,
    suspension_reason = case when v_patch ? 'suspension_reason' then nullif(trim(v_patch ->> 'suspension_reason'), '') else p.suspension_reason end,
    admin_notes = case when v_patch ? 'admin_notes' then nullif(trim(v_patch ->> 'admin_notes'), '') else p.admin_notes end,
    moderated_at = now(),
    moderated_by = auth.uid(),
    updated_at = now()
  where p.id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if (v_patch ? 'delete_training_logs') and (v_patch ->> 'delete_training_logs')::boolean then
    delete from public.training_logs where user_id = p_user_id;
  end if;

  perform public.titan_admin_audit_write('profile.update', p_user_id, v_patch);
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.titan_admin_update_profile(uuid, jsonb) from public;
grant execute on function public.titan_admin_update_profile(uuid, jsonb) to authenticated;

create or replace function public.titan_admin_list_news(p_limit integer default 20)
returns setof public.news_updates
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.titan_admin_assert();
  return query
  select *
  from public.news_updates
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.titan_admin_list_news(integer) from public;
grant execute on function public.titan_admin_list_news(integer) to authenticated;

create or replace function public.titan_admin_publish_news(
  p_version_id text,
  p_title text,
  p_message text,
  p_kind text default 'update',
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.news_updates%rowtype;
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'update');
begin
  perform public.titan_admin_assert();

  if trim(coalesce(p_version_id, '')) = '' or trim(coalesce(p_title, '')) = '' or trim(coalesce(p_message, '')) = '' then
    raise exception 'NEWS_FIELDS_REQUIRED' using errcode = '22023';
  end if;

  if v_kind not in ('update', 'maintenance', 'event', 'warning') then
    v_kind := 'update';
  end if;

  if p_active is true then
    update public.news_updates set active = false, updated_at = now() where active is true;
  end if;

  insert into public.news_updates(version_id, title, message, kind, active, created_by)
  values (trim(p_version_id), trim(p_title), trim(p_message), v_kind, coalesce(p_active, true), auth.uid())
  on conflict (version_id) do update
    set title = excluded.title,
        message = excluded.message,
        kind = excluded.kind,
        active = excluded.active,
        updated_at = now(),
        created_by = auth.uid()
  returning * into v_row;

  perform public.titan_admin_audit_write('news.publish', null, to_jsonb(v_row));
  notify pgrst, 'reload schema';
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.titan_admin_publish_news(text, text, text, text, boolean) from public;
grant execute on function public.titan_admin_publish_news(text, text, text, text, boolean) to authenticated;

create or replace function public.titan_admin_set_news_active(p_news_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.news_updates%rowtype;
begin
  perform public.titan_admin_assert();

  if p_active is true then
    update public.news_updates set active = false, updated_at = now() where active is true;
  end if;

  update public.news_updates
  set active = coalesce(p_active, false), updated_at = now()
  where id = p_news_id
  returning * into v_row;

  if not found then
    raise exception 'NEWS_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('news.set_active', null, jsonb_build_object('id', p_news_id, 'active', p_active));
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.titan_admin_set_news_active(uuid, boolean) from public;
grant execute on function public.titan_admin_set_news_active(uuid, boolean) to authenticated;

create or replace function public.titan_admin_list_reports(p_status text default null, p_limit integer default 50)
returns setof public.titan_moderation_reports
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.titan_admin_assert();

  return query
  select *
  from public.titan_moderation_reports
  where p_status is null or status = p_status
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke all on function public.titan_admin_list_reports(text, integer) from public;
grant execute on function public.titan_admin_list_reports(text, integer) to authenticated;

create or replace function public.titan_admin_resolve_report(
  p_report_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.titan_moderation_reports%rowtype;
  v_status text := coalesce(nullif(trim(p_status), ''), 'resolved');
begin
  perform public.titan_admin_assert();

  if v_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'INVALID_REPORT_STATUS' using errcode = '22023';
  end if;

  update public.titan_moderation_reports
  set status = v_status,
      resolved_by = case when v_status in ('resolved', 'dismissed') then auth.uid() else resolved_by end,
      resolution_note = nullif(trim(coalesce(p_note, '')), ''),
      resolved_at = case when v_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id
  returning * into v_row;

  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('report.resolve', v_row.target_user_id, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.titan_admin_resolve_report(uuid, text, text) from public;
grant execute on function public.titan_admin_resolve_report(uuid, text, text) to authenticated;

create or replace function public.titan_guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Clients cannot self-grant privileges or unsuspend themselves.
  if auth.role() <> 'service_role' and not public.titan_is_admin(auth.uid()) then
    new.is_elite := old.is_elite;
    new.is_tester := old.is_tester;
    new.is_suspended := old.is_suspended;
    new.suspension_reason := old.suspension_reason;
    new.admin_notes := old.admin_notes;
    new.moderated_at := old.moderated_at;
    new.moderated_by := old.moderated_by;
  end if;

  return new;
end;
$$;

drop trigger if exists titan_guard_profile_privileges on public.profiles;
create trigger titan_guard_profile_privileges
before update on public.profiles
for each row
execute function public.titan_guard_profile_privileges();

notify pgrst, 'reload schema';

commit;

-- First admin bootstrap, to run after logging into the app with your owner account:
-- select public.titan_admin_claim_first('titanteam.app@gmail.com');
