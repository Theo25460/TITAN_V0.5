-- SEC05: close the economy checks that were prepared NOT VALID, and refuse negative purchase amounts.
-- SEC06: append-only journal of every change to a balance, level, entitlement or moderation state,
-- written by a trigger so that RPCs, the billing worker, support tools and admins are all covered.
-- Additive and backward compatible: no existing column, grant, RPC signature or client contract changes.
-- Validation scans only profiles and shop_history (6 and 5 rows in production at preflight, 0 violations)
-- and fails the whole migration, changing nothing, if a row ever violates a rule.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: docs/CDC_WEB_ECONOMY_SECURITY_HANDOFF_2026-10-19.md.

-- ---------------------------------------------------------------------------------------------
-- SEC05: states that must be impossible.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  previous_lock_timeout text := current_setting('lock_timeout');
  c record;
begin
  perform set_config('lock_timeout', '5s', true);
  if to_regclass('public.shop_history') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.shop_history'::regclass
      and conname = 'shop_history_amounts_nonnegative_check') then
    alter table public.shop_history
      add constraint shop_history_amounts_nonnegative_check
      check (coalesce(cost_credits, 0) >= 0 and coalesce(reward_credits, 0) >= 0) not valid;
  end if;
  for c in
    select conrelid::regclass as tbl, conname from pg_constraint
    where not convalidated
      and conrelid in (select oid from pg_class where oid in (to_regclass('public.profiles'), to_regclass('public.shop_history')))
      and conname in ('profiles_credits_minimum_check', 'profiles_xp_minimum_check',
        'profiles_level_minimum_check', 'profiles_role_control_check', 'profiles_status_control_check',
        'shop_history_amounts_nonnegative_check')
  loop
    execute format('alter table %s validate constraint %I', c.tbl, c.conname);
  end loop;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- SEC06: the journal. Private schema, no API privilege, no policy.
-- ---------------------------------------------------------------------------------------------
create table if not exists private.titan_economy_journal (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  db_role text not null default session_user,
  kind text not null check (kind in ('economy', 'entitlement', 'moderation')),
  changes jsonb not null check (jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb)
);
create index if not exists titan_economy_journal_user_idx on private.titan_economy_journal (user_id, id desc);
create index if not exists titan_economy_journal_kind_idx on private.titan_economy_journal (kind, id desc);
create index if not exists titan_economy_journal_actor_idx on private.titan_economy_journal (actor_id) where actor_id is not null;
alter table private.titan_economy_journal enable row level security;
revoke all on table private.titan_economy_journal from public, anon, authenticated;

-- Record who changed what. Only values of tracked columns are stored: never a name, e-mail or text.
-- A failed insert aborts the change on purpose: an unjournaled balance change must not happen.
create or replace function private.titan_journal_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_role text;
  v_changes jsonb;
begin
  v_actor := (select u.id from auth.users u where u.id = auth.uid());
  v_role := auth.role();

  v_changes := '{}'::jsonb;
  if old.credits is distinct from new.credits then v_changes := v_changes || jsonb_build_object('credits', jsonb_build_object('old', old.credits, 'new', new.credits)); end if;
  if old.xp is distinct from new.xp then v_changes := v_changes || jsonb_build_object('xp', jsonb_build_object('old', old.xp, 'new', new.xp)); end if;
  if old.level is distinct from new.level then v_changes := v_changes || jsonb_build_object('level', jsonb_build_object('old', old.level, 'new', new.level)); end if;
  if v_changes <> '{}'::jsonb then
    insert into private.titan_economy_journal(user_id, actor_id, actor_role, kind, changes)
    values (new.id, v_actor, v_role, 'economy', v_changes);
  end if;

  v_changes := '{}'::jsonb;
  if old.is_elite is distinct from new.is_elite then v_changes := v_changes || jsonb_build_object('is_elite', jsonb_build_object('old', old.is_elite, 'new', new.is_elite)); end if;
  if old.elite_ends_at is distinct from new.elite_ends_at then v_changes := v_changes || jsonb_build_object('elite_ends_at', jsonb_build_object('old', old.elite_ends_at, 'new', new.elite_ends_at)); end if;
  if old.elite_refunded_at is distinct from new.elite_refunded_at then v_changes := v_changes || jsonb_build_object('elite_refunded_at', jsonb_build_object('old', old.elite_refunded_at, 'new', new.elite_refunded_at)); end if;
  if v_changes <> '{}'::jsonb then
    insert into private.titan_economy_journal(user_id, actor_id, actor_role, kind, changes)
    values (new.id, v_actor, v_role, 'entitlement', v_changes);
  end if;

  v_changes := '{}'::jsonb;
  if old.is_suspended is distinct from new.is_suspended then v_changes := v_changes || jsonb_build_object('is_suspended', jsonb_build_object('old', old.is_suspended, 'new', new.is_suspended)); end if;
  if old.status is distinct from new.status then v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', old.status, 'new', new.status)); end if;
  if old.role is distinct from new.role then v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', old.role, 'new', new.role)); end if;
  if v_changes <> '{}'::jsonb then
    insert into private.titan_economy_journal(user_id, actor_id, actor_role, kind, changes)
    values (new.id, v_actor, v_role, 'moderation', v_changes);
  end if;
  return null;
end;
$function$;
revoke all on function private.titan_journal_profile_change() from public, anon, authenticated;

-- Append-only. The single permitted update is the foreign-key release that detaches an entry from an
-- account that has been deleted (user_id / actor_id set to NULL); everything else, deletion and truncation included, is refused.
create or replace function private.titan_economy_journal_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Detachment is allowed only for an account that no longer exists, which is exactly the foreign-key
  -- release that follows its deletion: it cannot be used to hide the entries of a live account.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'user_id' - 'actor_id') = (to_jsonb(old) - 'user_id' - 'actor_id')
     and (new.user_id is not distinct from old.user_id
       or (new.user_id is null and not exists (select 1 from auth.users u where u.id = old.user_id)))
     and (new.actor_id is not distinct from old.actor_id
       or (new.actor_id is null and not exists (select 1 from auth.users u where u.id = old.actor_id))) then
    return new;
  end if;
  raise exception 'JOURNAL_APPEND_ONLY' using errcode = '42501';
end;
$function$;
revoke all on function private.titan_economy_journal_guard() from public, anon, authenticated;

do $$
declare previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if not exists (select 1 from pg_trigger where tgrelid = 'private.titan_economy_journal'::regclass
      and tgname = 'titan_economy_journal_row_guard') then
    create trigger titan_economy_journal_row_guard
      before update or delete on private.titan_economy_journal
      for each row execute function private.titan_economy_journal_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'private.titan_economy_journal'::regclass
      and tgname = 'titan_economy_journal_truncate_guard') then
    create trigger titan_economy_journal_truncate_guard
      before truncate on private.titan_economy_journal
      for each statement execute function private.titan_economy_journal_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'titan_journal_profile_change') then
    create trigger titan_journal_profile_change
      after update of credits, xp, level, is_elite, elite_ends_at, elite_refunded_at, is_suspended, status, role
      on public.profiles
      for each row
      when (old.credits is distinct from new.credits or old.xp is distinct from new.xp
        or old.level is distinct from new.level or old.is_elite is distinct from new.is_elite
        or old.elite_ends_at is distinct from new.elite_ends_at
        or old.elite_refunded_at is distinct from new.elite_refunded_at
        or old.is_suspended is distinct from new.is_suspended or old.status is distinct from new.status
        or old.role is distinct from new.role)
      execute function private.titan_journal_profile_change();
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

-- Read access for administrators only: bounded, newest first, optionally for one account.
create or replace function public.titan_economy_journal_v1(p_user uuid default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'version', 1,
    'limit', v_limit,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'at', j.at, 'user_id', j.user_id, 'actor_id', j.actor_id,
        'actor_role', j.actor_role, 'kind', j.kind, 'changes', j.changes) order by j.id desc)
      from (select * from private.titan_economy_journal x
        where p_user is null or x.user_id = p_user order by x.id desc limit v_limit) j), '[]'::jsonb));
end;
$function$;
revoke all on function public.titan_economy_journal_v1(uuid, integer) from public, anon;
grant execute on function public.titan_economy_journal_v1(uuid, integer) to authenticated;
