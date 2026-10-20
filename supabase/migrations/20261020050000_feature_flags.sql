-- IDEA10 / ADS17: server-side feature flags, to roll RPG, advertising and new screens out progressively and to switch
-- an ad network, format or placement off without a release. Nothing consumes a flag yet: no existing behaviour changes.
-- The public function returns only the RESOLVED value for the caller (a boolean per key), never the rollout percentage
-- or the description. Writing is for administrators and is audited. The caller owns the transaction.
-- Rollback: drop the three functions and the table.
create table if not exists private.titan_feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]{2,48}$'),
  enabled boolean not null default false,
  rollout smallint not null default 100 check (rollout between 0 and 100),
  description text check (description is null or char_length(description) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists titan_feature_flags_updater_idx on private.titan_feature_flags (updated_by) where updated_by is not null;
alter table private.titan_feature_flags enable row level security;
revoke all on table private.titan_feature_flags from public, anon, authenticated, service_role;

-- What the caller sees: every flag that exists, as true or false resolved for them (a flag that does not exist is absent, so
-- the client keeps its own default; a flag switched off is false, so it wins over that default). Key names are therefore public:
-- never put anything sensitive in one. A partial rollout is decided by a stable bucket per
-- signed-in player and flag (the same player always lands on the same side); a visitor who is not signed in only sees a flag
-- that is on for everybody.
create or replace function public.titan_feature_flags_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  return jsonb_build_object('version', 1, 'flags', coalesce((
    select jsonb_object_agg(f.key, f.enabled
      and (f.rollout >= 100
           or (v_user is not null and f.rollout > 0
               and mod(abs(hashtextextended(f.key || ':' || v_user::text, 0)), 100) < f.rollout)))
    from private.titan_feature_flags f
  ), '{}'::jsonb));
end;
$function$;

create or replace function public.titan_admin_feature_flags_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.titan_moderation_require_admin();
  return jsonb_build_object('version', 1, 'flags', coalesce((
    select jsonb_agg(jsonb_build_object('key', f.key, 'enabled', f.enabled, 'rollout', f.rollout,
      'description', f.description, 'updatedAt', f.updated_at) order by f.key)
    from private.titan_feature_flags f), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_admin_feature_flag_set_v1(p_key text, p_enabled boolean, p_rollout integer default 100, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_description text := nullif(left(btrim(coalesce(p_description, '')), 201), '');
  v_before record;
begin
  if v_key !~ '^[a-z][a-z0-9_.-]{2,48}$' then
    raise exception 'KEY_INVALID' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'STATE_REQUIRED' using errcode = '22023';
  end if;
  if p_rollout is null or p_rollout < 0 or p_rollout > 100 then
    raise exception 'ROLLOUT_INVALID' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 200 then
    raise exception 'DESCRIPTION_TOO_LONG' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('titan_flag:' || v_key, 0));
  select enabled, rollout into v_before from private.titan_feature_flags where key = v_key;
  insert into private.titan_feature_flags(key, enabled, rollout, description, updated_at, updated_by)
  values (v_key, p_enabled, p_rollout::smallint, v_description, now(), v_admin)
  on conflict (key) do update
    set enabled = excluded.enabled, rollout = excluded.rollout,
        description = coalesce(excluded.description, private.titan_feature_flags.description),
        updated_at = now(), updated_by = v_admin;
  perform public.titan_admin_audit_write('flag.set', null, jsonb_build_object('key', v_key, 'enabled', p_enabled, 'rollout', p_rollout,
    'was', case when v_before is null then null else jsonb_build_object('enabled', v_before.enabled, 'rollout', v_before.rollout) end));
  return jsonb_build_object('version', 1, 'key', v_key, 'enabled', p_enabled, 'rollout', p_rollout);
end;
$function$;

revoke all on function public.titan_feature_flags_v1() from public;
revoke all on function public.titan_admin_feature_flags_v1() from public, anon;
revoke all on function public.titan_admin_feature_flag_set_v1(text, boolean, integer, text) from public, anon;
grant execute on function public.titan_feature_flags_v1() to anon, authenticated;
grant execute on function public.titan_admin_feature_flags_v1() to authenticated;
grant execute on function public.titan_admin_feature_flag_set_v1(text, boolean, integer, text) to authenticated;

notify pgrst, 'reload schema';
