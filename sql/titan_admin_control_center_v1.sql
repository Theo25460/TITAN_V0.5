begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: keep the current Titan schema, add admin/premium/content controls.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.titan_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  active boolean not null default true
);

create table if not exists public.titan_admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_premium boolean not null default false;
alter table public.profiles add column if not exists premium_type text;
alter table public.profiles add column if not exists premium_until timestamptz;
alter table public.profiles add column if not exists xp integer default 0;
alter table public.profiles add column if not exists level integer default 1;
alter table public.profiles add column if not exists credits integer default 0;
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists friend_code text;
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists is_elite boolean default false;
alter table public.profiles add column if not exists is_tester boolean default false;
alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists admin_notes text;
alter table public.profiles add column if not exists moderated_at timestamptz;
alter table public.profiles add column if not exists moderated_by uuid references auth.users(id) on delete set null;

update public.profiles
set is_premium = true
where coalesce(is_elite, false) is true
  and coalesce(is_premium, false) is false;

update public.profiles
set status = 'suspended'
where coalesce(is_suspended, false) is true
  and coalesce(status, 'active') = 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_control_check') then
    alter table public.profiles
      add constraint profiles_role_control_check
      check (role in ('user', 'premium', 'moderator', 'admin', 'super_admin')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_status_control_check') then
    alter table public.profiles
      add constraint profiles_status_control_check
      check (status in ('active', 'suspended', 'banned', 'deleted')) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Core admin/content tables. Existing tables are only extended, never dropped.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text,
  target_table text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.admin_logs add column if not exists admin_id uuid references auth.users(id) on delete set null;
alter table public.admin_logs add column if not exists action text;
alter table public.admin_logs add column if not exists target_table text;
alter table public.admin_logs add column if not exists target_id text;
alter table public.admin_logs add column if not exists old_value jsonb;
alter table public.admin_logs add column if not exists new_value jsonb;
alter table public.admin_logs add column if not exists reason text;
alter table public.admin_logs add column if not exists action_type text;
alter table public.admin_logs add column if not exists details text;

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null default 'null'::jsonb,
  label text,
  description text,
  category text,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  page text,
  section text,
  title text,
  subtitle text,
  body text,
  cta_label text,
  cta_url text,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.dynamic_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  meta_title text,
  meta_description text,
  content text,
  cover_image_url text,
  status text not null default 'draft',
  is_indexable boolean not null default true,
  template text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  type text not null default 'info',
  placement text not null default 'all',
  cta_label text,
  cta_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.lore_chapters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  excerpt text,
  content text,
  image_url text,
  required_level integer not null default 1,
  required_grade text,
  required_premium boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.creatures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  type text not null default 'mob',
  rarity text not null default 'common',
  description text,
  image_url text,
  required_level integer not null default 1,
  required_grade text,
  required_premium boolean not null default false,
  event_key text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.premium_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'premium',
  source text not null default 'admin',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_lifetime boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  subject text,
  message text not null,
  category text not null default 'other',
  status text not null default 'new',
  priority text not null default 'normal',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  page_url text,
  title text not null,
  description text,
  browser text,
  device text,
  severity text not null default 'medium',
  status text not null default 'new',
  screenshot_url text,
  technical_details jsonb not null default '{}'::jsonb,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_key text not null default 'launch',
  is_eligible boolean not null default true,
  excluded_reason text,
  created_at timestamptz not null default now(),
  unique (user_id, contest_key)
);

create table if not exists public.contest_draws (
  id uuid primary key default gen_random_uuid(),
  contest_key text not null default 'launch',
  draw_number integer not null,
  winner_user_id uuid references auth.users(id) on delete set null,
  total_entries integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (contest_key, draw_number),
  unique (contest_key, winner_user_id)
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  page text,
  source text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid references auth.users(id) on delete set null,
  referred_user_id uuid references auth.users(id) on delete set null,
  referral_code text,
  reward_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.influencers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text,
  profile_url text,
  contact_email text,
  niche text,
  followers_count integer,
  engagement_note text,
  status text not null default 'to_contact',
  rating integer,
  referral_code text,
  premium_granted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  sport text not null,
  category text,
  val numeric not null default 0,
  unit text,
  xp integer not null default 0,
  date timestamptz default now(),
  details jsonb
);

create table if not exists public.sports (
  id text primary key,
  label text not null,
  category text not null default 'training',
  icon text default 'ri-trophy-line',
  unit text default 'unit',
  xp_multiplier numeric default 10,
  form_type text default 'standard',
  extra_fields jsonb default '[]'::jsonb,
  is_active boolean default true,
  xp_rules jsonb default '{}'::jsonb,
  validation_rules jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.shop_items (
  id text primary key,
  name text not null,
  description text,
  price integer not null default 0,
  type text not null default 'cosmetic',
  icon text,
  effect_val integer,
  cooldown_type text,
  cooldown_max integer,
  is_active boolean default true,
  requires_elite boolean not null default false
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  target_type text,
  target_id text,
  reason text,
  description text,
  status text not null default 'new',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports add column if not exists reported_user_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists reported_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists target_type text;
alter table public.reports add column if not exists target_id text;
alter table public.reports add column if not exists description text;
alter table public.reports add column if not exists admin_note text;
alter table public.reports add column if not exists updated_at timestamptz not null default now();

-- Extend existing game/content tables instead of replacing their current API.
alter table if exists public.training_logs add column if not exists status text not null default 'valid';
alter table if exists public.training_logs add column if not exists is_suspicious boolean not null default false;
alter table if exists public.training_logs add column if not exists admin_note text;
alter table if exists public.training_logs add column if not exists reviewed_at timestamptz;
alter table if exists public.training_logs add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table if exists public.sports add column if not exists slug text;
alter table if exists public.sports add column if not exists name text;
alter table if exists public.sports add column if not exists description text;
alter table if exists public.sports add column if not exists required_fields jsonb not null default '{}'::jsonb;
alter table if exists public.sports add column if not exists xp_formula jsonb not null default '{}'::jsonb;
alter table if exists public.sports add column if not exists credits_formula jsonb not null default '{}'::jsonb;
alter table if exists public.sports add column if not exists max_daily_reward integer;
alter table if exists public.sports add column if not exists suspicious_rules jsonb not null default '{}'::jsonb;
alter table if exists public.sports add column if not exists sort_order integer not null default 0;

update public.sports
set slug = coalesce(slug, id),
    name = coalesce(name, label)
where to_regclass('public.sports') is not null;

alter table if exists public.shop_items add column if not exists slug text;
alter table if exists public.shop_items add column if not exists image_url text;
alter table if exists public.shop_items add column if not exists price_credits integer;
alter table if exists public.shop_items add column if not exists rarity text;
alter table if exists public.shop_items add column if not exists item_type text;
alter table if exists public.shop_items add column if not exists required_level integer not null default 1;
alter table if exists public.shop_items add column if not exists required_premium boolean not null default false;
alter table if exists public.shop_items add column if not exists starts_at timestamptz;
alter table if exists public.shop_items add column if not exists ends_at timestamptz;
alter table if exists public.shop_items add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.shop_items add column if not exists created_at timestamptz not null default now();
alter table if exists public.shop_items add column if not exists updated_at timestamptz not null default now();

update public.shop_items
set slug = coalesce(slug, id),
    price_credits = coalesce(price_credits, price),
    item_type = coalesce(item_type, type),
    required_premium = coalesce(required_premium, requires_elite, false)
where to_regclass('public.shop_items') is not null;

-- Backfill profile roles from the previous Titan admin table when it exists.
do $$
begin
  if to_regclass('public.titan_admins') is not null then
    update public.profiles p
    set role = case
      when a.role = 'owner' then 'super_admin'
      when a.role = 'admin' then 'admin'
      when a.role = 'moderator' then 'moderator'
      else coalesce(p.role, 'user')
    end,
    is_admin = case when a.role in ('owner', 'admin') then true else coalesce(p.is_admin, false) end
    from public.titan_admins a
    where a.user_id = p.id
      and coalesce(a.active, true) is true
      and a.revoked_at is null
      and coalesce(p.role, 'user') not in ('admin', 'super_admin');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes.
-- ---------------------------------------------------------------------------

create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_premium_idx on public.profiles(is_premium, premium_until);
create index if not exists admin_logs_created_idx on public.admin_logs(created_at desc);
create index if not exists admin_logs_action_idx on public.admin_logs(action, target_table, created_at desc);
create index if not exists site_settings_key_idx on public.site_settings(key);
create index if not exists content_blocks_page_idx on public.content_blocks(page, section, is_active, sort_order);
create index if not exists announcements_active_idx on public.announcements(is_active, placement, priority, starts_at, ends_at);
create index if not exists dynamic_pages_slug_idx on public.dynamic_pages(slug, status);
create index if not exists lore_chapters_status_idx on public.lore_chapters(status, sort_order);
create index if not exists creatures_active_idx on public.creatures(is_active, type, sort_order);
create index if not exists premium_access_user_idx on public.premium_access(user_id, created_at desc);
create index if not exists contact_messages_status_idx on public.contact_messages(status, category, created_at desc);
create index if not exists bug_reports_status_idx on public.bug_reports(status, severity, created_at desc);
create index if not exists contest_entries_key_idx on public.contest_entries(contest_key, is_eligible, created_at);
create index if not exists contest_draws_key_idx on public.contest_draws(contest_key, draw_number);
create index if not exists analytics_events_name_idx on public.analytics_events(event_name, created_at desc);
create index if not exists influencers_status_idx on public.influencers(status, platform, created_at desc);
create unique index if not exists sports_slug_unique_idx on public.sports(slug) where slug is not null;
create unique index if not exists shop_items_slug_unique_idx on public.shop_items(slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- Private security helpers. Public wrappers below expose only safe RPC entrypoints.
-- ---------------------------------------------------------------------------

create or replace function private.titan_admin_role_for(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select case
      when p.role in ('super_admin', 'admin', 'moderator') then p.role
      when coalesce(p.is_admin, false) is true then 'admin'
      when a.role = 'owner' then 'super_admin'
      when a.role = 'admin' then 'admin'
      when a.role = 'moderator' then 'moderator'
      when coalesce(p.is_premium, false) is true or coalesce(p.is_elite, false) is true then 'premium'
      else coalesce(p.role, 'user')
    end
    from public.profiles p
    left join public.titan_admins a
      on a.user_id = p.id
     and coalesce(a.active, true) is true
     and a.revoked_at is null
    where p.id = p_user_id
    limit 1
  ), 'none');
$$;

create or replace function private.titan_is_admin(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id is not null
     and private.titan_admin_role_for(p_user_id) in ('admin', 'super_admin');
$$;

create or replace function private.titan_is_moderator_or_admin(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id is not null
     and private.titan_admin_role_for(p_user_id) in ('moderator', 'admin', 'super_admin');
$$;

create or replace function private.titan_admin_assert()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then
    raise exception 'TITAN_ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.titan_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security invoker
set search_path = public, private
stable
as $$
  select private.titan_is_admin(p_user_id);
$$;

create or replace function public.titan_admin_role(p_user_id uuid default auth.uid())
returns text
language sql
security invoker
set search_path = public, private
stable
as $$
  select private.titan_admin_role_for(p_user_id);
$$;

revoke all on function private.titan_admin_role_for(uuid) from public;
revoke all on function private.titan_is_admin(uuid) from public;
revoke all on function private.titan_is_moderator_or_admin(uuid) from public;
revoke all on function private.titan_admin_assert() from public;
grant execute on function private.titan_admin_role_for(uuid) to anon, authenticated;
grant execute on function private.titan_is_admin(uuid) to anon, authenticated;
grant execute on function private.titan_is_moderator_or_admin(uuid) to authenticated;
grant execute on function public.titan_is_admin(uuid) to anon, authenticated;
grant execute on function public.titan_admin_role(uuid) to authenticated;

create or replace function private.titan_admin_log_v1(
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.titan_admin_assert();

  insert into public.admin_logs (
    admin_id, action, target_table, target_id, old_value, new_value, reason, action_type, details
  )
  values (
    auth.uid(),
    p_action,
    p_target_table,
    p_target_id,
    p_old_value,
    p_new_value,
    nullif(trim(coalesce(p_reason, '')), ''),
    p_action,
    jsonb_build_object(
      'target_table', p_target_table,
      'target_id', p_target_id,
      'reason', p_reason,
      'new_value', p_new_value
    )::text
  );

  if to_regclass('public.titan_admin_audit') is not null then
    insert into public.titan_admin_audit(admin_id, action, target_user_id, payload)
    values (
      auth.uid(),
      p_action,
      case when p_target_table = 'profiles' and p_target_id ~* '^[0-9a-f-]{36}$' then p_target_id::uuid else null end,
      jsonb_build_object(
        'target_table', p_target_table,
        'target_id', p_target_id,
        'old_value', p_old_value,
        'new_value', p_new_value,
        'reason', p_reason
      )
    );
  end if;
end;
$$;

create or replace function public.titan_admin_write_log_v1(
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_reason text default null
)
returns void
language sql
security invoker
set search_path = public, private
as $$
  select private.titan_admin_log_v1(p_action, p_target_table, p_target_id, p_old_value, p_new_value, p_reason);
$$;

revoke all on function private.titan_admin_log_v1(text, text, text, jsonb, jsonb, text) from public;
grant execute on function private.titan_admin_log_v1(text, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.titan_admin_write_log_v1(text, text, text, jsonb, jsonb, text) to authenticated;

create or replace function private.titan_safe_count(p_table text, p_where text default null)
returns bigint
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_count bigint := 0;
  v_sql text;
begin
  if p_table !~ '^[a-z_][a-z0-9_]*$' or to_regclass('public.' || p_table) is null then
    return 0;
  end if;

  v_sql := format('select count(*) from public.%I', p_table);
  if p_where is not null and length(trim(p_where)) > 0 then
    v_sql := v_sql || ' where ' || p_where;
  end if;

  execute v_sql into v_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function private.titan_admin_get_context_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := private.titan_admin_role_for(v_uid);
  v_profile jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('isAdmin', false, 'role', 'none', 'profile', null);
  end if;

  select jsonb_build_object(
    'id', p.id,
    'email', coalesce(p.email, u.email),
    'username', p.username,
    'role', v_role,
    'status', p.status,
    'is_premium', p.is_premium,
    'is_elite', p.is_elite
  )
  into v_profile
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = v_uid;

  return jsonb_build_object(
    'isAdmin', v_role in ('admin', 'super_admin'),
    'role', v_role,
    'profile', v_profile
  );
end;
$$;

create or replace function public.titan_admin_get_context_v1()
returns jsonb
language sql
security invoker
set search_path = public, private
stable
as $$
  select private.titan_admin_get_context_v1();
$$;

grant execute on function private.titan_admin_get_context_v1() to authenticated;
grant execute on function public.titan_admin_get_context_v1() to authenticated;

create or replace function private.titan_admin_dashboard_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  perform private.titan_admin_assert();

  result := jsonb_build_object(
    'users_total', private.titan_safe_count('profiles'),
    'users_today', private.titan_safe_count('profiles', 'created_at >= current_date'),
    'users_week', private.titan_safe_count('profiles', 'created_at >= now() - interval ''7 days'''),
    'active_7d', private.titan_safe_count('profiles', 'coalesce(last_seen_at, updated_at, created_at) >= now() - interval ''7 days'''),
    'activities_today', private.titan_safe_count('training_logs', 'date >= current_date'),
    'activities_total', private.titan_safe_count('training_logs'),
    'premium_total', private.titan_safe_count('profiles', 'coalesce(is_premium, false) is true or coalesce(is_elite, false) is true'),
    'messages_unread', private.titan_safe_count('contact_messages', 'status in (''new'', ''read'')'),
    'bugs_open', private.titan_safe_count('bug_reports', 'status in (''new'', ''confirmed'', ''in_progress'')'),
    'reports_open', greatest(
      private.titan_safe_count('reports', 'coalesce(status, ''new'') in (''new'', ''pending'', ''open'', ''reviewing'')'),
      private.titan_safe_count('titan_moderation_reports', 'status in (''open'', ''reviewing'')')
    ),
    'contest_entries', private.titan_safe_count('contest_entries', 'is_eligible is true'),
    'contest_draws', private.titan_safe_count('contest_draws'),
    'contest_next_step', ((floor(private.titan_safe_count('contest_entries', 'is_eligible is true') / 50.0)::int + 1) * 50),
    'suspicious_activities', private.titan_safe_count('training_logs', 'coalesce(is_suspicious, false) is true or status = ''suspicious'''),
    'content_active', private.titan_safe_count('content_blocks', 'is_active is true'),
    'announcements_active', private.titan_safe_count('announcements', 'is_active is true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())'),
    'pages_published', private.titan_safe_count('dynamic_pages', 'status = ''published'''),
    'settings_total', private.titan_safe_count('site_settings')
  );

  return result;
end;
$$;

create or replace function public.titan_admin_dashboard_v1()
returns jsonb
language sql
security invoker
set search_path = public, private
stable
as $$
  select private.titan_admin_dashboard_v1();
$$;

grant execute on function private.titan_safe_count(text, text) to authenticated;
grant execute on function private.titan_admin_dashboard_v1() to authenticated;
grant execute on function public.titan_admin_dashboard_v1() to authenticated;

create or replace function private.titan_admin_list_profiles_v1(
  p_search text default '',
  p_role text default '',
  p_status text default '',
  p_premium text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  perform private.titan_admin_assert();

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      p.id,
      coalesce(p.email, u.email) as email,
      p.username,
      private.titan_admin_role_for(p.id) as role,
      coalesce(p.is_premium, false) as is_premium,
      coalesce(p.is_elite, false) as is_elite,
      p.premium_type,
      p.premium_until,
      coalesce(p.level, 1) as level,
      coalesce(p.xp, 0) as xp,
      coalesce(p.credits, 0) as credits,
      coalesce(p.status, case when coalesce(p.is_suspended, false) then 'suspended' else 'active' end) as status,
      coalesce(p.is_tester, false) as is_tester,
      p.friend_code,
      p.created_at,
      p.updated_at,
      p.last_seen_at,
      p.admin_notes,
      p.suspension_reason
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (
        coalesce(trim(p_search), '') = ''
        or p.username ilike '%' || trim(p_search) || '%'
        or p.email ilike '%' || trim(p_search) || '%'
        or u.email ilike '%' || trim(p_search) || '%'
        or p.id::text = trim(p_search)
        or p.friend_code ilike '%' || trim(p_search) || '%'
      )
      and (coalesce(trim(p_role), '') = '' or private.titan_admin_role_for(p.id) = trim(p_role))
      and (coalesce(trim(p_status), '') = '' or coalesce(p.status, 'active') = trim(p_status))
      and (
        coalesce(trim(p_premium), '') = ''
        or (trim(p_premium) = 'premium' and (coalesce(p.is_premium, false) is true or coalesce(p.is_elite, false) is true))
        or (trim(p_premium) = 'free' and coalesce(p.is_premium, false) is false and coalesce(p.is_elite, false) is false)
      )
    order by p.created_at desc nulls last
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0)
  ) row_data;

  return result;
end;
$$;

create or replace function public.titan_admin_list_profiles_v1(
  p_search text default '',
  p_role text default '',
  p_status text default '',
  p_premium text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language sql
security invoker
set search_path = public, private
stable
as $$
  select private.titan_admin_list_profiles_v1(p_search, p_role, p_status, p_premium, p_limit, p_offset);
$$;

grant execute on function private.titan_admin_list_profiles_v1(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.titan_admin_list_profiles_v1(text, text, text, text, integer, integer) to authenticated;

create or replace function private.titan_admin_update_profile_v1(
  p_user_id uuid,
  p_patch jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_old jsonb;
  v_new jsonb;
  v_role text;
  v_status text;
begin
  perform private.titan_admin_assert();

  if p_user_id is null then
    raise exception 'TARGET_REQUIRED' using errcode = '22023';
  end if;

  select to_jsonb(p.*) into v_old
  from public.profiles p
  where p.id = p_user_id;

  if v_old is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_role := coalesce(nullif(trim(v_patch ->> 'role'), ''), v_old ->> 'role', 'user');
  if v_role not in ('user', 'premium', 'moderator', 'admin', 'super_admin') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  v_status := coalesce(nullif(trim(v_patch ->> 'status'), ''), v_old ->> 'status', 'active');
  if v_status not in ('active', 'suspended', 'banned', 'deleted') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  update public.profiles p
  set
    email = case when v_patch ? 'email' then nullif(trim(v_patch ->> 'email'), '') else p.email end,
    username = case when v_patch ? 'username' then nullif(trim(v_patch ->> 'username'), '') else p.username end,
    role = case when v_patch ? 'role' then v_role else p.role end,
    is_premium = case when v_patch ? 'is_premium' then (v_patch ->> 'is_premium')::boolean else p.is_premium end,
    is_elite = case
      when v_patch ? 'is_premium' then (v_patch ->> 'is_premium')::boolean
      when v_patch ? 'is_elite' then (v_patch ->> 'is_elite')::boolean
      else p.is_elite
    end,
    premium_type = case when v_patch ? 'premium_type' then nullif(trim(v_patch ->> 'premium_type'), '') else p.premium_type end,
    premium_until = case when v_patch ? 'premium_until' then nullif(trim(v_patch ->> 'premium_until'), '')::timestamptz else p.premium_until end,
    credits = case when v_patch ? 'credits' then greatest(0, least((v_patch ->> 'credits')::integer, 999999999)) else p.credits end,
    xp = case when v_patch ? 'xp' then greatest(0, least((v_patch ->> 'xp')::integer, 999999999)) else p.xp end,
    level = case when v_patch ? 'level' then greatest(1, least((v_patch ->> 'level')::integer, 9999)) else p.level end,
    status = case when v_patch ? 'status' then v_status else p.status end,
    is_suspended = case
      when v_patch ? 'status' then v_status in ('suspended', 'banned', 'deleted')
      when v_patch ? 'is_suspended' then (v_patch ->> 'is_suspended')::boolean
      else p.is_suspended
    end,
    suspension_reason = case when v_patch ? 'suspension_reason' then nullif(trim(v_patch ->> 'suspension_reason'), '') else p.suspension_reason end,
    admin_notes = case when v_patch ? 'admin_notes' then nullif(trim(v_patch ->> 'admin_notes'), '') else p.admin_notes end,
    moderated_at = now(),
    moderated_by = auth.uid(),
    updated_at = now()
  where p.id = p_user_id
  returning to_jsonb(p.*) into v_new;

  perform private.titan_admin_log_v1(
    case
      when v_patch ? 'role' then 'update_user_role'
      when v_patch ? 'credits' then 'update_credits'
      when v_patch ? 'status' and v_status = 'banned' then 'ban_user'
      when v_patch ? 'status' and v_status = 'suspended' then 'suspend_user'
      else 'update_user'
    end,
    'profiles',
    p_user_id::text,
    v_old,
    v_new,
    p_reason
  );

  return v_new;
end;
$$;

create or replace function public.titan_admin_update_profile_v1(
  p_user_id uuid,
  p_patch jsonb,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.titan_admin_update_profile_v1(p_user_id, p_patch, p_reason);
$$;

grant execute on function private.titan_admin_update_profile_v1(uuid, jsonb, text) to authenticated;
grant execute on function public.titan_admin_update_profile_v1(uuid, jsonb, text) to authenticated;

create or replace function private.titan_admin_grant_premium_v1(
  p_user_id uuid,
  p_type text default 'premium',
  p_source text default 'admin',
  p_ends_at timestamptz default null,
  p_is_lifetime boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_access jsonb;
begin
  perform private.titan_admin_assert();

  select to_jsonb(p.*) into v_old from public.profiles p where p.id = p_user_id;
  if v_old is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.premium_access(user_id, type, source, starts_at, ends_at, is_lifetime, granted_by, reason)
  values (
    p_user_id,
    coalesce(nullif(trim(p_type), ''), 'premium'),
    coalesce(nullif(trim(p_source), ''), 'admin'),
    now(),
    case when coalesce(p_is_lifetime, false) then null else p_ends_at end,
    coalesce(p_is_lifetime, false),
    auth.uid(),
    nullif(trim(coalesce(p_reason, '')), '')
  )
  returning to_jsonb(premium_access.*) into v_access;

  update public.profiles
  set is_premium = true,
      is_elite = true,
      role = case when role = 'user' then 'premium' else role end,
      premium_type = coalesce(nullif(trim(p_type), ''), 'premium'),
      premium_until = case when coalesce(p_is_lifetime, false) then null else p_ends_at end,
      updated_at = now()
  where id = p_user_id
  returning to_jsonb(profiles.*) into v_new;

  perform private.titan_admin_log_v1('grant_premium', 'profiles', p_user_id::text, v_old, jsonb_build_object('profile', v_new, 'premium_access', v_access), p_reason);
  return jsonb_build_object('profile', v_new, 'premium_access', v_access);
end;
$$;

create or replace function public.titan_admin_grant_premium_v1(
  p_user_id uuid,
  p_type text default 'premium',
  p_source text default 'admin',
  p_ends_at timestamptz default null,
  p_is_lifetime boolean default false,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.titan_admin_grant_premium_v1(p_user_id, p_type, p_source, p_ends_at, p_is_lifetime, p_reason);
$$;

grant execute on function private.titan_admin_grant_premium_v1(uuid, text, text, timestamptz, boolean, text) to authenticated;
grant execute on function public.titan_admin_grant_premium_v1(uuid, text, text, timestamptz, boolean, text) to authenticated;

create or replace function private.titan_admin_revoke_premium_v1(
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  perform private.titan_admin_assert();

  select to_jsonb(p.*) into v_old from public.profiles p where p.id = p_user_id;
  if v_old is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.premium_access
  set ends_at = coalesce(ends_at, now())
  where user_id = p_user_id
    and (is_lifetime is true or ends_at is null or ends_at > now());

  update public.profiles
  set is_premium = false,
      is_elite = false,
      role = case when role = 'premium' then 'user' else role end,
      premium_type = null,
      premium_until = now(),
      updated_at = now()
  where id = p_user_id
  returning to_jsonb(profiles.*) into v_new;

  perform private.titan_admin_log_v1('revoke_premium', 'profiles', p_user_id::text, v_old, v_new, p_reason);
  return v_new;
end;
$$;

create or replace function public.titan_admin_revoke_premium_v1(
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.titan_admin_revoke_premium_v1(p_user_id, p_reason);
$$;

grant execute on function private.titan_admin_revoke_premium_v1(uuid, text) to authenticated;
grant execute on function public.titan_admin_revoke_premium_v1(uuid, text) to authenticated;

create or replace function private.titan_admin_run_contest_draw_v1(
  p_contest_key text default 'launch',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := coalesce(nullif(trim(p_contest_key), ''), 'launch');
  v_total integer := 0;
  v_allowed integer := 0;
  v_drawn integer := 0;
  v_winner uuid;
  v_draw public.contest_draws%rowtype;
  v_premium jsonb;
begin
  perform private.titan_admin_assert();

  select count(*)::integer
  into v_total
  from public.contest_entries ce
  join public.profiles p on p.id = ce.user_id
  where ce.contest_key = v_key
    and ce.is_eligible is true
    and coalesce(p.status, 'active') = 'active'
    and coalesce(p.is_tester, false) is false
    and private.titan_admin_role_for(p.id) not in ('admin', 'super_admin');

  v_allowed := floor(v_total / 50.0)::integer;

  select count(*)::integer
  into v_drawn
  from public.contest_draws
  where contest_key = v_key;

  if v_allowed <= v_drawn then
    raise exception 'NO_DRAW_AVAILABLE' using errcode = '22023';
  end if;

  select ce.user_id
  into v_winner
  from public.contest_entries ce
  join public.profiles p on p.id = ce.user_id
  where ce.contest_key = v_key
    and ce.is_eligible is true
    and coalesce(p.status, 'active') = 'active'
    and coalesce(p.is_tester, false) is false
    and private.titan_admin_role_for(p.id) not in ('admin', 'super_admin')
    and not exists (
      select 1
      from public.contest_draws cd
      where cd.contest_key = v_key
        and cd.winner_user_id = ce.user_id
    )
  order by random()
  limit 1;

  if v_winner is null then
    raise exception 'NO_ELIGIBLE_WINNER' using errcode = 'P0002';
  end if;

  insert into public.contest_draws(contest_key, draw_number, winner_user_id, total_entries, created_by, metadata)
  values (
    v_key,
    v_drawn + 1,
    v_winner,
    v_total,
    auth.uid(),
    jsonb_build_object('allowed_draws', v_allowed, 'reason', p_reason)
  )
  returning * into v_draw;

  v_premium := private.titan_admin_grant_premium_v1(
    v_winner,
    'lifetime',
    'contest',
    null,
    true,
    coalesce(p_reason, 'Contest draw ' || (v_drawn + 1)::text)
  );

  perform private.titan_admin_log_v1('run_contest_draw', 'contest_draws', v_draw.id::text, null, to_jsonb(v_draw), p_reason);

  return jsonb_build_object(
    'draw', to_jsonb(v_draw),
    'winner_user_id', v_winner,
    'premium', v_premium,
    'total_entries', v_total,
    'allowed_draws', v_allowed,
    'draws_done', v_drawn + 1
  );
end;
$$;

create or replace function public.titan_admin_run_contest_draw_v1(
  p_contest_key text default 'launch',
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.titan_admin_run_contest_draw_v1(p_contest_key, p_reason);
$$;

grant execute on function private.titan_admin_run_contest_draw_v1(text, text) to authenticated;
grant execute on function public.titan_admin_run_contest_draw_v1(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Updated guard for profile self-updates.
-- ---------------------------------------------------------------------------

drop trigger if exists titan_guard_profile_privileges on public.profiles;
drop function if exists public.titan_guard_profile_privileges();

create or replace function private.titan_guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not private.titan_is_admin(auth.uid()) then
    new.email := old.email;
    new.role := old.role;
    new.is_admin := old.is_admin;
    new.is_premium := old.is_premium;
    new.premium_type := old.premium_type;
    new.premium_until := old.premium_until;
    new.is_elite := old.is_elite;
    new.is_tester := old.is_tester;
    new.status := old.status;
    new.is_suspended := old.is_suspended;
    new.suspension_reason := old.suspension_reason;
    new.admin_notes := old.admin_notes;
    new.moderated_at := old.moderated_at;
    new.moderated_by := old.moderated_by;
  end if;

  return new;
end;
$$;

create trigger titan_guard_profile_privileges
before update on public.profiles
for each row
execute function private.titan_guard_profile_privileges();

revoke all on function private.titan_guard_profile_privileges() from public;

-- ---------------------------------------------------------------------------
-- RLS and Data API grants.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.admin_logs enable row level security;
alter table public.site_settings enable row level security;
alter table public.content_blocks enable row level security;
alter table public.dynamic_pages enable row level security;
alter table public.announcements enable row level security;
alter table public.lore_chapters enable row level security;
alter table public.creatures enable row level security;
alter table public.premium_access enable row level security;
alter table public.contact_messages enable row level security;
alter table public.bug_reports enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_draws enable row level security;
alter table public.analytics_events enable row level security;
alter table public.referrals enable row level security;
alter table public.influencers enable row level security;
alter table if exists public.training_logs enable row level security;
alter table if exists public.sports enable row level security;
alter table if exists public.shop_items enable row level security;
alter table if exists public.reports enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.content_blocks, public.dynamic_pages, public.announcements, public.lore_chapters, public.creatures, public.site_settings to anon, authenticated;
grant select on public.sports, public.shop_items to anon, authenticated;
grant insert on public.contact_messages, public.bug_reports, public.analytics_events to anon, authenticated;
grant select, insert, update, delete on public.site_settings, public.content_blocks, public.dynamic_pages, public.announcements, public.lore_chapters, public.creatures, public.premium_access, public.contact_messages, public.bug_reports, public.contest_entries, public.contest_draws, public.analytics_events, public.referrals, public.influencers to authenticated;
grant select on public.admin_logs to authenticated;
grant insert on public.admin_logs to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.training_logs to authenticated;
grant select, insert, update, delete on public.sports, public.shop_items to authenticated;

drop policy if exists "profiles_self_or_admin_select_v1" on public.profiles;
create policy "profiles_self_or_admin_select_v1"
on public.profiles
for select
to authenticated
using (id = auth.uid() or private.titan_is_moderator_or_admin(auth.uid()));

drop policy if exists "profiles_self_or_admin_update_v1" on public.profiles;
create policy "profiles_self_or_admin_update_v1"
on public.profiles
for update
to authenticated
using (id = auth.uid() or private.titan_is_admin(auth.uid()))
with check (id = auth.uid() or private.titan_is_admin(auth.uid()));

drop policy if exists "admin_logs_admin_select_v1" on public.admin_logs;
create policy "admin_logs_admin_select_v1"
on public.admin_logs
for select
to authenticated
using (private.titan_is_admin(auth.uid()));

drop policy if exists "admin_logs_admin_insert_v1" on public.admin_logs;
create policy "admin_logs_admin_insert_v1"
on public.admin_logs
for insert
to authenticated
with check (private.titan_is_admin(auth.uid()) and (admin_id = auth.uid() or admin_id is null));

drop policy if exists "site_settings_public_select_v1" on public.site_settings;
create policy "site_settings_public_select_v1"
on public.site_settings
for select
to anon, authenticated
using (is_public is true or private.titan_is_admin(auth.uid()));

drop policy if exists "site_settings_admin_all_v1" on public.site_settings;
create policy "site_settings_admin_all_v1"
on public.site_settings
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "content_blocks_public_select_v1" on public.content_blocks;
create policy "content_blocks_public_select_v1"
on public.content_blocks
for select
to anon, authenticated
using (is_active is true or private.titan_is_admin(auth.uid()));

drop policy if exists "content_blocks_admin_all_v1" on public.content_blocks;
create policy "content_blocks_admin_all_v1"
on public.content_blocks
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "dynamic_pages_public_select_v1" on public.dynamic_pages;
create policy "dynamic_pages_public_select_v1"
on public.dynamic_pages
for select
to anon, authenticated
using (status = 'published' or private.titan_is_admin(auth.uid()));

drop policy if exists "dynamic_pages_admin_all_v1" on public.dynamic_pages;
create policy "dynamic_pages_admin_all_v1"
on public.dynamic_pages
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "announcements_public_select_v1" on public.announcements;
create policy "announcements_public_select_v1"
on public.announcements
for select
to anon, authenticated
using (
  (
    is_active is true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
  or private.titan_is_admin(auth.uid())
);

drop policy if exists "announcements_admin_all_v1" on public.announcements;
create policy "announcements_admin_all_v1"
on public.announcements
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "lore_public_select_v1" on public.lore_chapters;
create policy "lore_public_select_v1"
on public.lore_chapters
for select
to anon, authenticated
using (status = 'published' or private.titan_is_admin(auth.uid()));

drop policy if exists "lore_admin_all_v1" on public.lore_chapters;
create policy "lore_admin_all_v1"
on public.lore_chapters
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "creatures_public_select_v1" on public.creatures;
create policy "creatures_public_select_v1"
on public.creatures
for select
to anon, authenticated
using (is_active is true or private.titan_is_admin(auth.uid()));

drop policy if exists "creatures_admin_all_v1" on public.creatures;
create policy "creatures_admin_all_v1"
on public.creatures
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "premium_access_self_or_admin_select_v1" on public.premium_access;
create policy "premium_access_self_or_admin_select_v1"
on public.premium_access
for select
to authenticated
using (user_id = auth.uid() or private.titan_is_admin(auth.uid()));

drop policy if exists "premium_access_admin_all_v1" on public.premium_access;
create policy "premium_access_admin_all_v1"
on public.premium_access
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "contact_messages_public_insert_v1" on public.contact_messages;
create policy "contact_messages_public_insert_v1"
on public.contact_messages
for insert
to anon, authenticated
with check (true);

drop policy if exists "contact_messages_admin_all_v1" on public.contact_messages;
create policy "contact_messages_admin_all_v1"
on public.contact_messages
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "bug_reports_public_insert_v1" on public.bug_reports;
create policy "bug_reports_public_insert_v1"
on public.bug_reports
for insert
to anon, authenticated
with check (user_id is null or user_id = auth.uid());

drop policy if exists "bug_reports_self_or_admin_select_v1" on public.bug_reports;
create policy "bug_reports_self_or_admin_select_v1"
on public.bug_reports
for select
to authenticated
using (user_id = auth.uid() or private.titan_is_admin(auth.uid()));

drop policy if exists "bug_reports_admin_update_v1" on public.bug_reports;
create policy "bug_reports_admin_update_v1"
on public.bug_reports
for update
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "contest_entries_self_or_admin_select_v1" on public.contest_entries;
create policy "contest_entries_self_or_admin_select_v1"
on public.contest_entries
for select
to authenticated
using (user_id = auth.uid() or private.titan_is_admin(auth.uid()));

drop policy if exists "contest_entries_self_insert_v1" on public.contest_entries;
create policy "contest_entries_self_insert_v1"
on public.contest_entries
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "contest_entries_admin_all_v1" on public.contest_entries;
create policy "contest_entries_admin_all_v1"
on public.contest_entries
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "contest_draws_admin_select_v1" on public.contest_draws;
create policy "contest_draws_admin_select_v1"
on public.contest_draws
for select
to authenticated
using (private.titan_is_admin(auth.uid()));

drop policy if exists "contest_draws_admin_all_v1" on public.contest_draws;
create policy "contest_draws_admin_all_v1"
on public.contest_draws
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "analytics_events_public_insert_v1" on public.analytics_events;
create policy "analytics_events_public_insert_v1"
on public.analytics_events
for insert
to anon, authenticated
with check (user_id is null or user_id = auth.uid());

drop policy if exists "analytics_events_admin_select_v1" on public.analytics_events;
create policy "analytics_events_admin_select_v1"
on public.analytics_events
for select
to authenticated
using (private.titan_is_admin(auth.uid()));

drop policy if exists "referrals_self_or_admin_select_v1" on public.referrals;
create policy "referrals_self_or_admin_select_v1"
on public.referrals
for select
to authenticated
using (referrer_user_id = auth.uid() or referred_user_id = auth.uid() or private.titan_is_admin(auth.uid()));

drop policy if exists "referrals_admin_all_v1" on public.referrals;
create policy "referrals_admin_all_v1"
on public.referrals
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "influencers_admin_all_v1" on public.influencers;
create policy "influencers_admin_all_v1"
on public.influencers
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "training_logs_self_or_admin_select_v1" on public.training_logs;
create policy "training_logs_self_or_admin_select_v1"
on public.training_logs
for select
to authenticated
using (user_id = auth.uid() or private.titan_is_admin(auth.uid()));

drop policy if exists "training_logs_admin_update_v1" on public.training_logs;
create policy "training_logs_admin_update_v1"
on public.training_logs
for update
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "sports_public_active_select_v1" on public.sports;
create policy "sports_public_active_select_v1"
on public.sports
for select
to anon, authenticated
using (coalesce(is_active, true) is true or private.titan_is_admin(auth.uid()));

drop policy if exists "sports_admin_all_v1" on public.sports;
create policy "sports_admin_all_v1"
on public.sports
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "shop_items_public_active_select_v1" on public.shop_items;
create policy "shop_items_public_active_select_v1"
on public.shop_items
for select
to anon, authenticated
using (
  (
    coalesce(is_active, true) is true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
  or private.titan_is_admin(auth.uid())
);

drop policy if exists "shop_items_admin_all_v1" on public.shop_items;
create policy "shop_items_admin_all_v1"
on public.shop_items
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "reports_self_or_admin_select_v1" on public.reports;
create policy "reports_self_or_admin_select_v1"
on public.reports
for select
to authenticated
using (reporter_id = auth.uid() or reported_id = auth.uid() or private.titan_is_admin(auth.uid()));

drop policy if exists "reports_admin_update_v1" on public.reports;
create policy "reports_admin_update_v1"
on public.reports
for update
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Seed essential public settings/content keys without overriding custom values.
-- ---------------------------------------------------------------------------

insert into public.site_settings(key, value, label, description, category, is_public)
values
  ('maintenance_mode', 'false'::jsonb, 'Mode maintenance', 'Bloque ou avertit les utilisateurs pendant une maintenance.', 'system', true),
  ('registrations_enabled', 'true'::jsonb, 'Inscriptions actives', 'Autorise la creation de comptes.', 'auth', true),
  ('premium_enabled', 'true'::jsonb, 'Premium actif', 'Active les parcours et CTA premium.', 'premium', true),
  ('shop_enabled', 'true'::jsonb, 'Boutique active', 'Active la boutique.', 'shop', true),
  ('challenges_enabled', 'true'::jsonb, 'Defis actifs', 'Active les defis sociaux.', 'social', true),
  ('contest_enabled', 'true'::jsonb, 'Concours actif', 'Active le concours de lancement.', 'contest', true),
  ('xp_multiplier', '1'::jsonb, 'Multiplicateur XP', 'Multiplicateur global applique aux gains XP.', 'economy', false),
  ('credits_multiplier', '1'::jsonb, 'Multiplicateur credits', 'Multiplicateur global applique aux credits.', 'economy', false),
  ('max_rewarded_activities_per_day', '10'::jsonb, 'Activites recompensees par jour', 'Limite quotidienne anti-abus.', 'economy', false)
on conflict (key) do nothing;

insert into public.content_blocks(key, page, section, title, subtitle, body, cta_label, cta_url, is_active, sort_order)
values
  ('homepage_hero', 'homepage', 'hero', 'Transforme chaque effort en progression.', 'OS sportif personnel', 'TITAN OS suit tes seances, mesure ta regularite et rend ta discipline visible.', 'Demarrer maintenant', 'login.html', true, 10),
  ('homepage_intro', 'homepage', 'intro', 'Un poste de commandement sportif.', 'Accueil dynamique', 'Les textes principaux peuvent maintenant etre ajustes depuis Supabase sans redeploiement.', null, null, true, 20),
  ('premium_header', 'premium', 'header', 'Elite', 'Profondeur et confort', 'Analyses avancees, cosmetiques premium et pilotage plus fin de la progression.', null, null, true, 10),
  ('contest_conditions', 'contest', 'conditions', 'Concours de lancement', 'Un premium a vie tous les 50 inscrits eligibles', 'Les admins peuvent ajuster les conditions, participants et tirages depuis le centre de controle.', null, null, true, 10)
on conflict (key) do nothing;

notify pgrst, 'reload schema';

commit;
