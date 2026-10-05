-- Production private-schema functions snapshot (2026-10-05). Test-only.
CREATE OR REPLACE FUNCTION private.titan_admin_assert()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_dashboard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_users_total integer := 0;
  v_users_today integer := 0;
  v_users_week integer := 0;
  v_active_7d integer := 0;
  v_activities_total integer := 0;
  v_activities_today integer := 0;
  v_premium_total integer := 0;
  v_messages_unread integer := 0;
  v_bugs_open integer := 0;
  v_reports_open integer := 0;
  v_contest_entries integer := 0;
  v_announcements_active integer := 0;
  v_content_active integer := 0;
  v_pages_published integer := 0;
  v_suspicious_activities integer := 0;
begin
  perform private.titan_admin_assert();

  select count(*)::integer into v_users_total from public.profiles;
  select count(*)::integer into v_users_today from public.profiles where created_at >= date_trunc('day', now());
  select count(*)::integer into v_users_week from public.profiles where created_at >= now() - interval '7 days';
  select count(distinct p.id)::integer into v_active_7d
  from public.profiles p
  left join public.training_logs t on t.user_id = p.id and t.date >= now() - interval '7 days'
  where p.last_seen_at >= now() - interval '7 days' or t.user_id is not null;
  select count(*)::integer into v_activities_total from public.training_logs;
  select count(*)::integer into v_activities_today from public.training_logs where date >= date_trunc('day', now());
  select count(*)::integer into v_premium_total from public.profiles where coalesce(is_premium, false) is true or coalesce(is_elite, false) is true;
  select count(*)::integer into v_messages_unread from public.contact_messages where coalesce(status, 'new') in ('new', 'read');
  select count(*)::integer into v_bugs_open from public.bug_reports where coalesce(status, 'new') not in ('fixed', 'rejected', 'cannot_reproduce', 'archived');
  select count(*)::integer into v_reports_open from public.reports where coalesce(status, 'new') not in ('resolved', 'rejected', 'archived', 'closed');
  select count(*)::integer into v_contest_entries from public.contest_entries where coalesce(is_eligible, true) is true;
  select count(*)::integer into v_announcements_active from public.announcements where is_active is true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now());
  select count(*)::integer into v_content_active from public.content_blocks where is_active is true;
  select count(*)::integer into v_pages_published from public.dynamic_pages where status = 'published';
  select count(*)::integer into v_suspicious_activities from public.training_logs where coalesce(is_suspicious, false) is true or coalesce(status, 'valid') = 'suspicious';

  return jsonb_build_object(
    'users_total', v_users_total,
    'users_today', v_users_today,
    'users_week', v_users_week,
    'active_7d', v_active_7d,
    'activities_total', v_activities_total,
    'activities_today', v_activities_today,
    'premium_total', v_premium_total,
    'messages_unread', v_messages_unread,
    'bugs_open', v_bugs_open,
    'reports_open', v_reports_open,
    'contest_entries', v_contest_entries,
    'contest_next_step', ((floor(v_contest_entries / 50.0)::integer + 1) * 50),
    'announcements_active', v_announcements_active,
    'content_active', v_content_active,
    'pages_published', v_pages_published,
    'suspicious_activities', v_suspicious_activities,
    'checked_at', now()
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_get_context_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile public.profiles%rowtype;
  v_role text;
begin
  perform private.titan_admin_assert();

  select * into v_profile
  from public.profiles
  where id = auth.uid();

  v_role := private.titan_admin_role_for(auth.uid());

  return jsonb_build_object(
    'user_id', auth.uid(),
    'role', v_role,
    'is_admin', v_role in ('admin', 'super_admin'),
    'profile', to_jsonb(v_profile),
    'checked_at', now()
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_grant_premium_v1(p_user_id uuid, p_type text DEFAULT 'premium'::text, p_source text DEFAULT 'admin'::text, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_lifetime boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old public.profiles%rowtype;
  v_new public.profiles%rowtype;
  v_access public.premium_access%rowtype;
begin
  perform private.titan_admin_assert();

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.premium_access(user_id, type, source, starts_at, ends_at, is_lifetime, granted_by, reason)
  values (p_user_id, coalesce(nullif(p_type, ''), 'premium'), coalesce(nullif(p_source, ''), 'admin'), now(), case when p_is_lifetime then null else p_ends_at end, coalesce(p_is_lifetime, false), auth.uid(), p_reason)
  returning * into v_access;

  update public.profiles
  set is_premium = true,
      premium_type = coalesce(nullif(p_type, ''), 'premium'),
      premium_until = case when p_is_lifetime then null else p_ends_at end,
      role = case when role = 'user' then 'premium' else role end,
      is_elite = case when coalesce(nullif(p_type, ''), 'premium') in ('elite', 'lifetime') then true else is_elite end,
      updated_at = now()
  where id = p_user_id
  returning * into v_new;

  perform private.titan_admin_log_v1('grant_premium', 'profiles', p_user_id::text, to_jsonb(v_old), jsonb_build_object('profile', to_jsonb(v_new), 'premium_access', to_jsonb(v_access)), p_reason);
  return jsonb_build_object('profile', to_jsonb(v_new), 'premium_access', to_jsonb(v_access));
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_list_profiles_v1(p_search text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_premium text DEFAULT NULL::text, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, username text, role text, is_premium boolean, premium_type text, premium_until timestamp with time zone, xp integer, level integer, credits integer, status text, created_at timestamp with time zone, updated_at timestamp with time zone, last_seen_at timestamp with time zone, is_elite boolean, is_tester boolean, is_suspended boolean, suspension_reason text, admin_notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_search text := lower(nullif(trim(coalesce(p_search, '')), ''));
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.titan_admin_assert();

  return query
  select p.id, p.email, p.username, p.role, p.is_premium, p.premium_type, p.premium_until,
         p.xp, p.level, p.credits, p.status, p.created_at, p.updated_at, p.last_seen_at,
         p.is_elite, p.is_tester, p.is_suspended, p.suspension_reason, p.admin_notes
  from public.profiles p
  where (
      v_search is null
      or lower(coalesce(p.email, '')) like '%' || v_search || '%'
      or lower(coalesce(p.username, '')) like '%' || v_search || '%'
      or p.id::text = v_search
    )
    and (nullif(p_role, '') is null or p.role = p_role)
    and (nullif(p_status, '') is null or p.status = p_status)
    and (
      nullif(p_premium, '') is null
      or (p_premium in ('premium', 'true') and (coalesce(p.is_premium, false) is true or coalesce(p.is_elite, false) is true))
      or (p_premium in ('free', 'false') and coalesce(p.is_premium, false) is false and coalesce(p.is_elite, false) is false)
    )
  order by p.created_at desc nulls last
  limit v_limit offset v_offset;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_log_v1(p_action text, p_target_table text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_old_value jsonb DEFAULT NULL::jsonb, p_new_value jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log public.admin_logs%rowtype;
begin
  perform private.titan_admin_assert();

  insert into public.admin_logs(admin_id, action, target_table, target_id, old_value, new_value, reason, action_type, details)
  values (auth.uid(), p_action, p_target_table, p_target_id, p_old_value, p_new_value, p_reason, p_action, p_reason)
  returning * into v_log;

  return to_jsonb(v_log);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_revoke_premium_v1(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old public.profiles%rowtype;
  v_new public.profiles%rowtype;
begin
  perform private.titan_admin_assert();

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.profiles
  set is_premium = false,
      premium_type = null,
      premium_until = null,
      role = case when role = 'premium' then 'user' else role end,
      is_elite = false,
      updated_at = now()
  where id = p_user_id
  returning * into v_new;

  perform private.titan_admin_log_v1('revoke_premium', 'profiles', p_user_id::text, to_jsonb(v_old), to_jsonb(v_new), p_reason);
  return to_jsonb(v_new);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_role_for(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  if p_user_id is null then
    return 'anonymous';
  end if;

  select nullif(p.role, '') into v_role
  from public.profiles p
  where p.id = p_user_id;

  if v_role in ('user', 'premium', 'moderator', 'admin', 'super_admin') then
    return v_role;
  end if;

  select case
    when a.role = 'owner' then 'super_admin'
    when a.role = 'admin' then 'admin'
    when a.role = 'moderator' then 'moderator'
    else null
  end into v_role
  from public.titan_admins a
  where a.user_id = p_user_id
    and coalesce(a.active, true) is true
    and a.revoked_at is null
  limit 1;

  if v_role is not null then
    return v_role;
  end if;

  select case when coalesce(p.is_admin, false) is true then 'admin' else 'user' end into v_role
  from public.profiles p
  where p.id = p_user_id;

  return coalesce(v_role, 'user');
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_run_contest_draw_v1(p_contest_key text DEFAULT 'launch'::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  select count(*)::integer into v_total
  from public.contest_entries ce
  join public.profiles p on p.id = ce.user_id
  where ce.contest_key = v_key
    and ce.is_eligible is true
    and coalesce(p.status, 'active') = 'active'
    and coalesce(p.is_tester, false) is false
    and private.titan_admin_role_for(p.id) not in ('admin', 'super_admin');

  v_allowed := floor(v_total / 50.0)::integer;

  select count(*)::integer into v_drawn
  from public.contest_draws
  where contest_key = v_key;

  if v_allowed <= v_drawn then
    raise exception 'NO_DRAW_AVAILABLE' using errcode = '22023';
  end if;

  select ce.user_id into v_winner
  from public.contest_entries ce
  join public.profiles p on p.id = ce.user_id
  where ce.contest_key = v_key
    and ce.is_eligible is true
    and coalesce(p.status, 'active') = 'active'
    and coalesce(p.is_tester, false) is false
    and private.titan_admin_role_for(p.id) not in ('admin', 'super_admin')
    and not exists (
      select 1 from public.contest_draws cd
      where cd.contest_key = v_key and cd.winner_user_id = ce.user_id
    )
  order by random()
  limit 1;

  if v_winner is null then
    raise exception 'NO_ELIGIBLE_WINNER' using errcode = 'P0002';
  end if;

  insert into public.contest_draws(contest_key, draw_number, winner_user_id, total_entries, created_by, metadata)
  values (v_key, v_drawn + 1, v_winner, v_total, auth.uid(), jsonb_build_object('allowed_draws', v_allowed, 'reason', p_reason))
  returning * into v_draw;

  v_premium := private.titan_admin_grant_premium_v1(v_winner, 'lifetime', 'contest', null, true, coalesce(p_reason, 'Contest draw ' || (v_drawn + 1)::text));
  perform private.titan_admin_log_v1('run_contest_draw', 'contest_draws', v_draw.id::text, null, to_jsonb(v_draw), p_reason);

  return jsonb_build_object('draw', to_jsonb(v_draw), 'winner_user_id', v_winner, 'premium', v_premium, 'total_entries', v_total, 'allowed_draws', v_allowed, 'draws_done', v_drawn + 1);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_update_profile_v1(p_user_id uuid, p_patch jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old public.profiles%rowtype;
  v_new public.profiles%rowtype;
  v_role text;
  v_status text;
begin
  perform private.titan_admin_assert();

  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22023';
  end if;

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_role := coalesce(nullif(p_patch->>'role', ''), v_old.role);
  v_status := coalesce(nullif(p_patch->>'status', ''), v_old.status);

  if v_role not in ('user', 'premium', 'moderator', 'admin', 'super_admin') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  if v_status not in ('active', 'suspended', 'banned', 'deleted') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  update public.profiles
  set username = case when p_patch ? 'username' then nullif(p_patch->>'username', '') else username end,
      email = case when p_patch ? 'email' then nullif(p_patch->>'email', '') else email end,
      role = v_role,
      status = v_status,
      is_premium = case when p_patch ? 'is_premium' then coalesce((p_patch->>'is_premium')::boolean, false) else is_premium end,
      premium_type = case when p_patch ? 'premium_type' then nullif(p_patch->>'premium_type', '') else premium_type end,
      premium_until = case
        when p_patch ? 'premium_until' and nullif(p_patch->>'premium_until', '') is null then null
        when p_patch ? 'premium_until' then (p_patch->>'premium_until')::timestamptz
        else premium_until
      end,
      xp = case when p_patch ? 'xp' and p_patch->>'xp' is not null then greatest(0, (p_patch->>'xp')::integer) else xp end,
      level = case when p_patch ? 'level' and p_patch->>'level' is not null then greatest(1, (p_patch->>'level')::integer) else level end,
      credits = case when p_patch ? 'credits' and p_patch->>'credits' is not null then greatest(0, (p_patch->>'credits')::integer) else credits end,
      is_tester = case when p_patch ? 'is_tester' then coalesce((p_patch->>'is_tester')::boolean, false) else is_tester end,
      is_suspended = case
        when v_status in ('suspended', 'banned') then true
        when v_status = 'active' then false
        when p_patch ? 'is_suspended' then coalesce((p_patch->>'is_suspended')::boolean, false)
        else is_suspended
      end,
      suspension_reason = case when p_patch ? 'suspension_reason' then nullif(p_patch->>'suspension_reason', '') else suspension_reason end,
      admin_notes = case when p_patch ? 'admin_notes' then nullif(p_patch->>'admin_notes', '') else admin_notes end,
      moderated_at = now(),
      moderated_by = auth.uid(),
      updated_at = now()
  where id = p_user_id
  returning * into v_new;

  perform private.titan_admin_log_v1('update_user_profile', 'profiles', p_user_id::text, to_jsonb(v_old), to_jsonb(v_new), p_reason);
  return to_jsonb(v_new);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_admin_upsert_row_v1(p_table text, p_pk text DEFAULT 'id'::text, p_payload jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.titan_adventure_action(p_action text, p_world text, p_route text, p_avatar text, p_revision integer, p_chapter integer, p_timezone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare
 v_uid uuid:=auth.uid(); v_profile public.profiles%rowtype; v_state public.adventure_profiles%rowtype;
 v_progress public.adventure_progress%rowtype; v_world public.adventure_worlds%rowtype;
 v_evidence jsonb; v_target integer; v_required integer; v_plus boolean;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_action is null or p_action not in ('start','select','claim','avatar') then raise exception 'INVALID_ACTION'; end if;
 select * into v_profile from public.profiles where id=v_uid for update;
 if not found or v_profile.is_suspended is true then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 v_plus:=v_profile.is_elite is true and v_profile.elite_refunded_at is null and (v_profile.elite_ends_at is null or v_profile.elite_ends_at>now());
 insert into public.adventure_profiles(user_id) values(v_uid) on conflict do nothing;
 select * into v_state from public.adventure_profiles where user_id=v_uid for update;
 if p_revision is null or (p_revision<>v_state.revision and not(p_revision=0 and v_state.revision=1)) then
   raise exception 'ADVENTURE_CONFLICT' using errcode='40001'; end if;
 if p_action='avatar' then
   v_required:=case p_avatar when 'scout' then 1 when 'ranger' then 1 when 'keeper' then 3 when 'artisan' then 6 when 'navigator' then 10 when 'sentinel' then 15 end;
   if v_required is null or v_profile.level<v_required then raise exception 'AVATAR_LOCKED' using errcode='42501'; end if;
   update public.adventure_profiles set avatar=p_avatar where user_id=v_uid;
 else
   select * into v_world from public.adventure_worlds where id=p_world;
   if not found then raise exception 'INVALID_WORLD'; end if;
   if p_action in ('start','claim') and v_world.tier='plus' and v_plus is not true then raise exception 'TITAN_PLUS_REQUIRED' using errcode='42501'; end if;
   select * into v_progress from public.adventure_progress where user_id=v_uid and world_id=p_world for update;
   if p_action='start' then
     if p_route is null or p_route not in ('rhythm','journal') then raise exception 'INVALID_ROUTE'; end if;
     if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'INVALID_TIMEZONE'; end if;
     -- Starting again resumes the same progress; never resets timestamps or rewards.
     insert into public.adventure_progress(user_id,world_id,route,timezone) values(v_uid,p_world,p_route,p_timezone) on conflict do nothing;
   elsif p_action='claim' then
     if v_progress.user_id is null or p_chapter is null or v_progress.chapter<>p_chapter or p_chapter>9 then raise exception 'ADVENTURE_CONFLICT' using errcode='40001'; end if;
     v_target:=(array[1,2,2,2,3,2,3,3,3])[p_chapter];
     v_evidence:=public.titan_adventure_evidence(p_world);
     if (v_evidence->>'days')::integer<v_target then raise exception 'QUEST_INCOMPLETE'; end if;
     insert into public.adventure_rewards(user_id,world_id,chapter,source_ids)
       values(v_uid,p_world,p_chapter,array(select value::uuid from jsonb_array_elements_text(v_evidence->'source_ids')));
     update public.adventure_progress set chapter=chapter+1,started_at=clock_timestamp(),
       completed_at=case when chapter=9 then now() else null end where user_id=v_uid and world_id=p_world;
   end if;
   update public.adventure_profiles set selected_world=p_world where user_id=v_uid;
 end if;
 update public.adventure_profiles set revision=revision+1,updated_at=now() where user_id=v_uid;
 return public.titan_adventure_snapshot();
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_coach_portal(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
declare
 v_uid uuid:=auth.uid();v_link public.coach_links%rowtype;v_invite private.coach_invites%rowtype;
 v_assignment public.coach_assignments%rowtype;v_coach public.profiles%rowtype;
 v_id uuid;v_token text;v_since date;v_sport text;v_limit integer;v_result jsonb;v_rows jsonb;
 v_total integer;v_offset integer;v_revision integer;v_date date;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and is_suspended is not true) then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000 then raise exception 'INVALID_INPUT';end if;
 if p_action='snapshot' then
   select * into v_coach from public.profiles where id=v_uid;
   v_limit:=case when v_coach.is_elite is true and v_coach.elite_refunded_at is null and (v_coach.elite_ends_at is null or v_coach.elite_ends_at>now()) then 20 else 3 end;
   return jsonb_build_object('owner',v_uid,'capacity',v_limit,
    'links',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('coach_name',c.username,'athlete_name',a.username) order by l.accepted_at desc),'[]') from public.coach_links l join public.profiles c on c.id=l.coach_id join public.profiles a on a.id=l.athlete_id where (l.coach_id=v_uid or l.athlete_id=v_uid) and l.revoked_at is null),
    'invites',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc),'[]') from private.coach_invites i where i.coach_id=v_uid and i.accepted_by is null and i.revoked_at is null and i.expires_at>now()),
    'assignments_count',(select count(*) from public.coach_assignments a join public.coach_links l on l.id=a.link_id where l.revoked_at is null and (l.coach_id=v_uid or l.athlete_id=v_uid)));
 end if;
 if p_action='invite' then
   perform 1 from public.profiles where id=v_uid for update;
   if (select count(*) from private.coach_invites where coach_id=v_uid and created_at>now()-interval '1 day')>=30 or (select count(*) from private.coach_invites where coach_id=v_uid and revoked_at is null and accepted_by is null and expires_at>now())>=10 then raise exception 'INVITE_LIMIT';end if;
   select * into v_coach from public.profiles where id=v_uid;
   v_limit:=case when v_coach.is_elite is true and v_coach.elite_refunded_at is null and (v_coach.elite_ends_at is null or v_coach.elite_ends_at>now()) then 20 else 3 end;
   if (select count(*) from public.coach_links where coach_id=v_uid and revoked_at is null)>=v_limit then raise exception 'COACH_CAPACITY';end if;
   v_token:=encode(extensions.gen_random_bytes(24),'hex');
   insert into private.coach_invites(coach_id,token_hash) values(v_uid,encode(extensions.digest(v_token,'sha256'),'hex')) returning * into v_invite;
   return jsonb_build_object('id',v_invite.id,'token',v_token,'expires_at',v_invite.expires_at,'coach_name',v_coach.username);
 end if;
 if p_action='cancel_invite' then
   update private.coach_invites set revoked_at=now() where id=(p_data->>'id')::uuid and coach_id=v_uid and accepted_by is null;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;return jsonb_build_object('ok',true);
 end if;
 if p_action in ('preview','accept') then
   v_token:=lower(trim(coalesce(p_data->>'token','')));
   if v_token!~'^[0-9a-f]{48}$' then raise exception 'INVITE_UNAVAILABLE';end if;
   select * into v_invite from private.coach_invites where token_hash=encode(extensions.digest(v_token,'sha256'),'hex') and accepted_by is null and revoked_at is null and expires_at>now();
   if not found or v_invite.coach_id=v_uid then raise exception 'INVITE_UNAVAILABLE';end if;
   perform 1 from public.profiles where id in (v_uid,v_invite.coach_id) order by id for update;
   select * into v_invite from private.coach_invites where id=v_invite.id and accepted_by is null and revoked_at is null and expires_at>now() for update;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;
   -- Serialize capacity changes against the coach account, as well as each single-use invitation.
   select * into v_coach from public.profiles where id=v_invite.coach_id and is_suspended is not true for update;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;
   if p_action='preview' then return jsonb_build_object('coach_name',v_coach.username,'expires_at',v_invite.expires_at);end if;
   if (p_data->>'consent') is distinct from 'true' then raise exception 'CONSENT_REQUIRED';end if;
   v_limit:=case when v_coach.is_elite is true and v_coach.elite_refunded_at is null and (v_coach.elite_ends_at is null or v_coach.elite_ends_at>now()) then 20 else 3 end;
   if (select count(*) from public.coach_links where coach_id=v_invite.coach_id and revoked_at is null)>=v_limit then raise exception 'COACH_CAPACITY';end if;
   -- Lock the athlete for the separate maximum number of accepted sharing relationships.
   perform 1 from public.profiles where id=v_uid for update;
   if (select count(*) from public.coach_links where athlete_id=v_uid and revoked_at is null)>=5 then raise exception 'ATHLETE_CAPACITY';end if;
   v_since:=(p_data->>'since_date')::date;v_sport:=nullif(trim(p_data->>'sport'),'');
   if v_since is null or v_since>current_date or v_since<'2000-01-01'::date then raise exception 'INVALID_PERIOD';end if;
   insert into public.coach_links(coach_id,athlete_id,since_date,sport,share_details,share_notes)
    values(v_invite.coach_id,v_uid,v_since,v_sport,coalesce((p_data->>'share_details')::boolean,false),coalesce((p_data->>'share_notes')::boolean,false)) returning id into v_id;
   update private.coach_invites set accepted_by=v_uid where id=v_invite.id;
   return jsonb_build_object('id',v_id);
 end if;
 if p_action in ('scope','revoke','sessions','assign','assignments') then
   select * into v_link from public.coach_links where id=(p_data->>'link_id')::uuid and revoked_at is null and (coach_id=v_uid or athlete_id=v_uid) for update;
   if not found then raise exception 'SHARING_UNAVAILABLE' using errcode='42501';end if;
   if p_action='assignments' then
     v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),100000));
     return jsonb_build_object('link_id',v_link.id,'revision',v_link.revision,'total',(select count(*) from public.coach_assignments where link_id=v_link.id),'offset',v_offset,'rows',(select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id desc),'[]') from (select * from public.coach_assignments where link_id=v_link.id order by created_at desc,id desc limit 100 offset v_offset)q));
   end if;
   if p_action in ('scope','revoke') then
     if v_link.revision is distinct from (p_data->>'revision')::integer then raise exception 'COACH_CONFLICT';end if;
     if p_action='revoke' then
       update public.coach_links set revoked_at=now(),revision=revision+1 where id=v_link.id;
       return jsonb_build_object('ok',true);
     end if;
     if v_link.athlete_id<>v_uid then raise exception 'ATHLETE_ONLY' using errcode='42501';end if;
     v_since:=(p_data->>'since_date')::date;v_sport:=nullif(trim(p_data->>'sport'),'');
     if v_since is null or v_since>current_date or v_since<'2000-01-01'::date then raise exception 'INVALID_PERIOD';end if;
     update public.coach_links set since_date=v_since,sport=v_sport,share_details=coalesce((p_data->>'share_details')::boolean,false),share_notes=coalesce((p_data->>'share_notes')::boolean,false),revision=revision+1 where id=v_link.id;
     return jsonb_build_object('ok',true);
   end if;
   if p_action='sessions' then
     v_date:=coalesce((p_data->>'from_date')::date,current_date-29);v_since:=greatest(v_date,v_link.since_date);
     if p_data->>'to_date' is null or (p_data->>'to_date')::date<v_since or (p_data->>'to_date')::date>current_date or (p_data->>'to_date')::date-v_date>366 then raise exception 'INVALID_PERIOD';end if;
     v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),100000));
     select count(*) into v_total from public.training_logs l where l.user_id=v_link.athlete_id and l.archived_at is null and l.date>=v_since::timestamp at time zone 'UTC' and l.date<((p_data->>'to_date')::date+1)::timestamp at time zone 'UTC' and l.date<=now() and (v_link.sport is null or l.sport=v_link.sport);
     select coalesce(jsonb_agg(row_data order by session_date desc,session_id desc),'[]') into v_rows from (
       select l.date as session_date,l.id as session_id,jsonb_build_object('id',l.id,'date',l.date,'sport',l.sport,'val',l.val,'unit',l.unit,
        'details',jsonb_strip_nulls(jsonb_build_object(
         'duration',case when coalesce(l.details->>'duration','')~'^[0-9]+([.][0-9]+)?$' then (l.details->>'duration')::numeric when coalesce(l.details->>'val2','')~'^[0-9]+([.][0-9]+)?$' then (l.details->>'val2')::numeric when coalesce(l.details#>>'{gpxStats,movingMinutes}','')~'^[0-9]+([.][0-9]+)?$' then (l.details#>>'{gpxStats,movingMinutes}')::numeric else null end,
         'note',case when v_link.share_notes then coalesce(l.details->>'note',l.details->>'notes') else null end,
         'exercises',case when v_link.share_details then (select jsonb_agg(jsonb_build_object('name',e->>'name','variant',e->>'variant','equipment',e->>'equipment','sets',e->'sets','weight',e->'weight','reps',e->'reps','setRows',(select jsonb_agg(jsonb_build_object('weight',s->'weight','reps',s->'reps','rir',s->'rir')) from (select value s from jsonb_array_elements(case when jsonb_typeof(e->'setRows')='array' then e->'setRows' else '[]' end) limit 30)sr))) from (select value e from jsonb_array_elements(case when jsonb_typeof(l.details->'exercises')='array' then l.details->'exercises' else '[]' end) limit 30)ex) else null end,
         'extras',case when v_link.share_details then jsonb_strip_nulls(jsonb_build_object('grade_system',l.details#>'{extras,grade_system}','climbing_discipline',l.details#>'{extras,climbing_discipline}','belay',l.details#>'{extras,belay}','max_done',l.details#>'{extras,max_done}','max_attempt',l.details#>'{extras,max_attempt}','attempts',l.details#>'{extras,attempts}','successful_routes',l.details#>'{extras,successful_routes}')) else null end))) as row_data
       from public.training_logs l where l.user_id=v_link.athlete_id and l.archived_at is null and l.date>=v_since::timestamp at time zone 'UTC' and l.date<((p_data->>'to_date')::date+1)::timestamp at time zone 'UTC' and l.date<=now() and (v_link.sport is null or l.sport=v_link.sport)
       order by l.date desc,l.id desc limit 100 offset v_offset
     ) q;
     return jsonb_build_object('owner',v_uid,'link_id',v_link.id,'revision',v_link.revision,'rows',v_rows,'total',v_total,'offset',v_offset,'from_date',v_since,'to_date',p_data->>'to_date','timezone','UTC');
   end if;
   if p_action='assign' then
     if v_link.coach_id<>v_uid then raise exception 'COACH_ONLY' using errcode='42501';end if;
     if (select count(*) from public.coach_assignments where link_id=v_link.id)>=500 then raise exception 'ASSIGNMENT_LIMIT';end if;
     v_date:=(p_data->>'planned_date')::date;
     if v_date<current_date-7 or v_date>current_date+366 then raise exception 'INVALID_PERIOD';end if;
     insert into public.coach_assignments(link_id,title,sport,planned_date,instructions) values(v_link.id,trim(p_data->>'title'),trim(p_data->>'sport'),v_date,coalesce(p_data->>'instructions','')) returning * into v_assignment;
     return to_jsonb(v_assignment);
   end if;
 end if;
 if p_action in ('assignment_status','cancel_assignment') then
   -- Consistent lock order: the sharing relationship is locked before the assignment.
   select l.* into v_link from public.coach_links l join public.coach_assignments a on a.link_id=l.id where a.id=(p_data->>'id')::uuid and l.revoked_at is null and (l.coach_id=v_uid or l.athlete_id=v_uid) for update of l;
   if not found then raise exception 'SHARING_UNAVAILABLE' using errcode='42501';end if;
   select * into v_assignment from public.coach_assignments where id=(p_data->>'id')::uuid for update;
   if v_assignment.revision is distinct from (p_data->>'revision')::integer then raise exception 'COACH_CONFLICT';end if;
   if p_action='cancel_assignment' then
     if v_link.coach_id<>v_uid or v_assignment.status not in ('proposed','accepted') then raise exception 'INVALID_TRANSITION';end if;
     update public.coach_assignments set status='cancelled',revision=revision+1,updated_at=now() where id=v_assignment.id returning * into v_assignment;
   else
     if v_link.athlete_id<>v_uid then raise exception 'ATHLETE_ONLY' using errcode='42501';end if;
     if not ((v_assignment.status='proposed' and p_data->>'status' in ('accepted','declined')) or (v_assignment.status='accepted' and p_data->>'status' in ('declined','completed'))) then raise exception 'INVALID_TRANSITION';end if;
     v_id:=null;
     if p_data->>'status'='completed' then
       v_id:=(p_data->>'session_id')::uuid;
       if v_id is null or not exists(select 1 from public.training_logs l where l.id=v_id and l.user_id=v_uid and l.sport=v_assignment.sport and l.archived_at is null and l.date<=now() and l.date>=v_link.since_date::timestamp at time zone 'UTC' and l.date>=v_assignment.created_at-interval '7 days' and l.is_suspicious is not true and coalesce(l.status,'valid') not in ('rejected','flagged','pending_review')) then raise exception 'INVALID_SESSION';end if;
       if exists(select 1 from public.coach_assignments a join public.coach_links l on l.id=a.link_id where l.athlete_id=v_uid and a.session_id=v_id) then raise exception 'SESSION_ALREADY_LINKED';end if;
     end if;
     update public.coach_assignments set status=p_data->>'status',session_id=v_id,revision=revision+1,updated_at=now() where id=v_assignment.id returning * into v_assignment;
   end if;
   return to_jsonb(v_assignment);
 end if;
 raise exception 'INVALID_ACTION';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_guard_billing_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare k text; v jsonb;
begin
  if coalesce(auth.role(),'') in ('authenticated','anon') then
    for k,v in select key,value from jsonb_each(to_jsonb(old)) where left(key,6)='elite_'
    loop
      if to_jsonb(new)->k is distinct from v then
        raise exception 'BILLING_FIELDS_READ_ONLY' using errcode='42501';
      end if;
    end loop;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_guard_profile_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.titan_guard_sport_goal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or auth.uid()<>new.user_id then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() and is_suspended is not true for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501';end if;
 if tg_op='UPDATE' then
   if new.user_id<>old.user_id or new.id<>old.id then raise exception 'OWNER_IMMUTABLE' using errcode='42501';end if;
   new.revision:=old.revision+1;new.created_at:=old.created_at;
 else new.revision:=1;new.created_at:=now();end if;
 if new.archived_at is null and (select count(*) from public.sport_goals where user_id=new.user_id and archived_at is null and id<>new.id)>=50 then raise exception 'GOAL_LIMIT';end if;
 new.updated_at:=now();return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.titan_is_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.titan_admin_role_for(p_user_id) in ('admin', 'super_admin');
$function$
;
CREATE OR REPLACE FUNCTION private.titan_is_moderator_or_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.titan_admin_role_for(p_user_id) in ('moderator', 'admin', 'super_admin');
$function$
;
CREATE OR REPLACE FUNCTION private.titan_progression_snapshot_v78()
 RETURNS TABLE(server_user_id uuid, level integer, xp integer, credits integer, is_elite boolean, is_tester boolean, is_suspended boolean, training_total integer, training_7d integer, training_30d integer, last_training_at timestamp with time zone, week_start date, weekly_xp_used integer, weekly_credits_used integer, weekly_xp_cap integer, weekly_credit_cap integer, weekly_xp_remaining integer, weekly_credits_remaining integer, authority text, rules_version text, checked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week date := date_trunc('week', now())::date;
  v_level integer := 1;
  v_xp integer := 0;
  v_credits integer := 0;
  v_is_elite boolean := false;
  v_is_tester boolean := false;
  v_is_suspended boolean := false;
  v_training_total integer := 0;
  v_training_7d integer := 0;
  v_training_30d integer := 0;
  v_last_training_at timestamptz := null;
  v_weekly_xp_used integer := 0;
  v_weekly_credits_used integer := 0;
  v_weekly_xp_cap integer := 9600;
  v_weekly_credit_cap integer := 4800;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select
    greatest(1, coalesce(p.level, 1)),
    greatest(0, coalesce(p.xp, 0)),
    greatest(0, coalesce(p.credits, 0)),
    coalesce(p.is_elite, false),
    coalesce(p.is_tester, false),
    coalesce(p.is_suspended, false)
  into v_level, v_xp, v_credits, v_is_elite, v_is_tester, v_is_suspended
  from public.profiles as p
  where p.id = v_uid;

  v_weekly_xp_cap := case when v_is_elite then 11520 else 9600 end;
  v_weekly_credit_cap := case when v_is_elite then 5760 else 4800 end;

  select
    count(*)::integer,
    count(*) filter (where coalesce(tl.date, now()) >= now() - interval '7 days')::integer,
    count(*) filter (where coalesce(tl.date, now()) >= now() - interval '30 days')::integer,
    max(tl.date)
  into v_training_total, v_training_7d, v_training_30d, v_last_training_at
  from public.training_logs as tl
  where tl.user_id = v_uid
    and coalesce(tl.status, 'valid') = 'valid';

  select
    greatest(0, coalesce(u.xp_awarded, 0)),
    greatest(0, coalesce(u.credits_awarded, 0))
  into v_weekly_xp_used, v_weekly_credits_used
  from public.titan_weekly_reward_usage as u
  where u.user_id = v_uid
    and u.week_start = v_week;

  weekly_xp_remaining := greatest(0, v_weekly_xp_cap - coalesce(v_weekly_xp_used, 0));
  weekly_credits_remaining := greatest(0, v_weekly_credit_cap - coalesce(v_weekly_credits_used, 0));

  return query select
    v_uid,
    v_level,
    v_xp,
    v_credits,
    v_is_elite,
    v_is_tester,
    v_is_suspended,
    coalesce(v_training_total, 0),
    coalesce(v_training_7d, 0),
    coalesce(v_training_30d, 0),
    v_last_training_at,
    v_week,
    coalesce(v_weekly_xp_used, 0),
    coalesce(v_weekly_credits_used, 0),
    v_weekly_xp_cap,
    v_weekly_credit_cap,
    weekly_xp_remaining,
    weekly_credits_remaining,
    'server_authoritative'::text,
    'v78-cloud-authority'::text,
    now();
end;
$function$
;
CREATE OR REPLACE FUNCTION private.titan_update_training_session(p_id uuid, p_revision integer, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare
 u uuid:=auth.uid();l public.training_logs%rowtype;v public.training_logs%rowtype;
 ex jsonb;s jsonb;all_ex jsonb:='[]';rows jsonb;clean_rows jsonb;
 weight numeric;reps numeric;rir numeric;volume numeric;total_reps numeric;max_weight numeric;total_volume numeric:=0;all_reps numeric:=0;
 extra record;clean_extras jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into l from public.training_logs where id=p_id and user_id=u for update;
 if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
 if p_revision is null or l.revision<>p_revision then raise exception 'SESSION_VERSION_CONFLICT' using errcode='40001'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>100000 then raise exception 'PATCH_INVALID' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('val','date','note','duration','archived','exercises','extras')) then raise exception 'PATCH_INVALID' using errcode='22023';end if;
 v:=l;
 if p_patch ? 'val' then
  if jsonb_typeof(p_patch->'val')<>'number' then raise exception 'SESSION_INVALID' using errcode='22023'; end if;
  v.val:=(p_patch->>'val')::numeric;
  if jsonb_typeof(l.details->'exercises')='array' and jsonb_array_length(l.details->'exercises')>0 and v.val<>l.val then
   raise exception 'EXERCISE_VOLUME_READ_ONLY' using errcode='22023';end if;
  v.details:=jsonb_set(coalesce(v.details,'{}'),'{val1}',to_jsonb(v.val));
 end if;
 if p_patch ? 'exercises' then
  if jsonb_typeof(l.details->'exercises') is distinct from 'array' or jsonb_array_length(l.details->'exercises')=0 then raise exception 'EXERCISE_SESSION_REQUIRED';end if;
  if jsonb_typeof(p_patch->'exercises') is distinct from 'array' or jsonb_array_length(p_patch->'exercises') not between 1 and 30 then raise exception 'EXERCISES_INVALID';end if;
  for ex in select value from jsonb_array_elements(p_patch->'exercises') loop
   if jsonb_typeof(ex)<>'object' or jsonb_typeof(ex->'name') is distinct from 'string' or length(trim(ex->>'name')) not between 1 and 120 then raise exception 'EXERCISE_NAME_INVALID';end if;
   rows:=ex->'setRows';
   if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 30 then raise exception 'SETS_INVALID';end if;
   clean_rows:='[]';volume:=0;total_reps:=0;max_weight:=0;
   for s in select value from jsonb_array_elements(rows) loop
    if jsonb_typeof(s->'weight') is distinct from 'number' or jsonb_typeof(s->'reps') is distinct from 'number' then raise exception 'SET_INVALID';end if;
    weight:=(s->>'weight')::numeric;reps:=(s->>'reps')::numeric;rir:=null;
    if weight<0 or weight>1000 or reps<1 or reps>500 or reps<>trunc(reps) then raise exception 'SET_INVALID';end if;
    if s ? 'rir' and s->'rir'<>'null'::jsonb then
      if jsonb_typeof(s->'rir') is distinct from 'number' then raise exception 'RIR_INVALID';end if;
      rir:=(s->>'rir')::numeric;if rir<0 or rir>10 then raise exception 'RIR_INVALID';end if;
    end if;
    clean_rows:=clean_rows||jsonb_build_array(jsonb_build_object('weight',weight,'reps',reps,'rir',rir));
    volume:=volume+weight*reps;total_reps:=total_reps+reps;max_weight:=greatest(max_weight,weight);
   end loop;
   all_ex:=all_ex||jsonb_build_array(jsonb_build_object('name',left(trim(ex->>'name'),120),'variant',left(coalesce(ex->>'variant',''),100),
     'equipment',left(coalesce(ex->>'equipment',''),100),'setRows',clean_rows,'sets',jsonb_array_length(clean_rows),'volume',volume,'totalReps',total_reps,
     'weight',max_weight,'reps',round(total_reps/jsonb_array_length(clean_rows)),'rir',null));
   total_volume:=total_volume+volume;all_reps:=all_reps+total_reps;
  end loop;
  v.val:=case when total_volume>0 then total_volume else all_reps end;v.unit:=case when total_volume>0 then 'kg' else 'reps' end;
  v.details:=jsonb_set(jsonb_set(jsonb_set(v.details,'{exercises}',all_ex),'{val1}',to_jsonb(v.val)),'{unitOverride}',to_jsonb(v.unit));
 end if;
 if p_patch ? 'extras' then
  if jsonb_typeof(p_patch->'extras') is distinct from 'object' or octet_length((p_patch->'extras')::text)>5000 then raise exception 'EXTRAS_INVALID';end if;
  clean_extras:=coalesce(v.details->'extras','{}');
  for extra in select key,value from jsonb_each(p_patch->'extras') loop
   if extra.key not in ('climbing_discipline','belay','location','grade_system','max_attempt','max_done','attempts','successful_routes','session_type','result','score')
      or jsonb_typeof(extra.value) not in ('string','number','null') or length(extra.value::text)>160 then raise exception 'EXTRAS_INVALID';end if;
   if extra.key in ('attempts','successful_routes') and extra.value<>'null'::jsonb and extra.value<>'""'::jsonb then
    if not (extra.value#>>'{}') ~ '^[0-9]{1,3}$' then raise exception 'EXTRAS_INVALID';end if;
    if (extra.value#>>'{}')::numeric>200 then raise exception 'EXTRAS_INVALID';end if;
   end if;
   clean_extras:=jsonb_set(clean_extras,array[extra.key],extra.value);
  end loop;
  v.details:=jsonb_set(v.details,'{extras}',clean_extras);
 end if;
 if p_patch ? 'date' then v.date:=(p_patch->>'date')::timestamptz;v.details:=jsonb_set(v.details,'{performedAt}',coalesce(to_jsonb(v.date),'null'::jsonb));end if;
 if p_patch ? 'note' then
  if jsonb_typeof(p_patch->'note')<>'string' then raise exception 'NOTE_INVALID' using errcode='22023';end if;
  v.details:=jsonb_set(v.details,'{note}',to_jsonb(left(p_patch->>'note',2000)));
 end if;
 if p_patch ? 'duration' then
  if p_patch->'duration'='null'::jsonb and v.unit not in ('min','h') then
   v.details:=v.details-'duration'-'val2';
   if jsonb_typeof(v.details->'gpxStats')='object' then v.details:=jsonb_set(v.details,'{gpxStats}',(v.details->'gpxStats')-'movingMinutes');end if;
  else
   if jsonb_typeof(p_patch->'duration')<>'number' then raise exception 'DURATION_INVALID' using errcode='22023';end if;
   if (p_patch->>'duration')::numeric<=0 or (p_patch->>'duration')::numeric>1440 then raise exception 'DURATION_INVALID' using errcode='22023';end if;
   v.details:=jsonb_set(jsonb_set(v.details,'{val2}',p_patch->'duration'),'{duration}',p_patch->'duration');
  end if;
 end if;
 if v.unit in ('min','h') and (p_patch ? 'val' or p_patch ? 'duration') then
  v.details:=jsonb_set(jsonb_set(v.details,'{duration}',to_jsonb(v.val*case when v.unit='h' then 60 else 1 end)),'{val2}',to_jsonb(v.val*case when v.unit='h' then 60 else 1 end));end if;
 if p_patch ?| array['val','duration','exercises','extras'] then v.details:=v.details-'summary';end if;
 if p_patch ? 'archived' then
  if jsonb_typeof(p_patch->'archived')<>'boolean' then raise exception 'ARCHIVE_INVALID' using errcode='22023';end if;
  v.archived_at:=case when (p_patch->>'archived')::boolean then now() else null end;
 end if;
 if v.val is null or v.val<=0 or v.val>300000 or v.date is null or v.date>now()+interval '10 minutes' then raise exception 'SESSION_INVALID' using errcode='22023';end if;
 insert into public.training_revisions(user_id,log_id,snapshot) values(u,l.id,to_jsonb(l));
 update public.training_logs set val=v.val,unit=v.unit,date=v.date,details=v.details,archived_at=v.archived_at,revision=l.revision+1 where id=l.id returning * into v;
 if v.revision<>l.revision+1 then raise exception 'SESSION_REJECTED' using errcode='23514';end if;
 return to_jsonb(v);
end $function$
;
