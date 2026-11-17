-- Social excellence, lot A — friends (TITAN ONE, mission « Opération Connexion », 20 November 2026). Applies after 20261119090000.
-- What the audit of the friendship layer found, and what this file changes:
--   1. Two friends who just installed TITAN could not add each other: a friend code only works when its owner is « trouvable »
--      (privacy.publicProfile), which also publishes the name in the legacy lists. A PERSONAL INVITATION LINK now works without making
--      anybody findable: its creator consents by creating it (one use, 7 days, revocable, 5 live links at most, 20 a day), the person who
--      opens it consents by accepting it. Only the SHA-256 of the token is stored. Its preview names the inviter to a signed-in account only.
--      A block in either direction, a suspended account, an own link, a spent, revoked or expired link all answer the same « invalid ».
--   2. Six social limits were dead: titan_social_rate_limit counts rows of titan_social_action_log, but buddy_invite, buddy_nudge,
--      challenge_link, challenge_link_accept, intent_set and intent_cheer never wrote one (the check constraint did not even allow them),
--      so « 10 invitations a day » and the others never applied. The limiter now records these actions itself once they pass.
--   3. A friend request never expired. Pending requests now last 30 days: an expired request is no longer listed nor accepted, and asking
--      again replaces it (the usual 25 requests a day still apply).
--   4. A player could block but never see whom they blocked, nor unblock without writing to support: titan_blocks_v1 lists one's own blocks
--      (titan_unblock_user already existed and stays the only way to lift one; unblocking never restores the friendship).
--   5. The export of the account gains the links one created (dates and state, never a token).
-- Creating a link opens with the server flag screens.friendlinks (absent = closed), checked by the server (private.titan_flag_on).
-- Nothing here grants XP, credits or anything bought. Additive: signatures, return shapes and grants of existing functions are kept.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop the five titan_friend_link_* functions, public.titan_blocks_v1(), private.titan_social_export_v1(uuid), private.titan_flag_on(text) and table
-- private.titan_friend_invites; re-apply titan_social_rate_limit from the baseline, titan_guard_friendship_insert from 20261005200000,
-- titan_guard_friendship_delete, titan_social_request and titan_social_overview from 20261114160000, titan_social_respond from 20261005200000,
-- and export_own_data from 20261117170000.

-- ---------------------------------------------------------------------------------------------
-- 1. Social limits that count what they limit.
-- ---------------------------------------------------------------------------------------------
alter table public.titan_social_action_log drop constraint if exists titan_social_action_log_action_check;
alter table public.titan_social_action_log add constraint titan_social_action_log_action_check
  check (action = any (array['friend_add', 'friend_remove', 'block_user', 'unblock_user', 'moment_share', 'moment_cheer', 'challenge_create',
    'buddy_invite', 'buddy_nudge', 'challenge_link', 'challenge_link_accept', 'intent_set', 'intent_cheer',
    'friend_link', 'friend_link_accept', 'cordee_create']));

create or replace function public.titan_social_rate_limit(p_actor_id uuid, p_action text, p_window interval, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_count integer;
begin
  -- Two parallel calls of one account on one action are serialised, so they cannot both pass the count.
  if p_actor_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text || ':social:' || p_action, 0));
  end if;
  select count(*)::integer into v_count
    from public.titan_social_action_log
   where actor_id = p_actor_id and action = p_action and created_at > now() - p_window;
  if v_count >= p_limit then
    raise exception 'SOCIAL_RATE_LIMIT' using errcode = '42900';
  end if;
  -- Actions whose callers never write their own log row: the limiter records them, so the limit really applies.
  -- (friend_add, friend_remove, block_user, moment_share, moment_cheer and challenge_create keep writing theirs: counted once.)
  if p_actor_id is not null and p_action = any (array['buddy_invite', 'buddy_nudge', 'challenge_link', 'challenge_link_accept', 'intent_set',
       'intent_cheer', 'friend_link', 'friend_link_accept', 'cordee_create']) then
    insert into public.titan_social_action_log(actor_id, action) values (p_actor_id, p_action);
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 2. Friendship rows written by server code for an invitation link, and requests that expire.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_guard_friendship_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if new.user_id_1 <> auth.uid() then
    raise exception 'FRIENDSHIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.titan_user_blocks b
    where (b.blocker_id = new.user_id_1 and b.blocked_id = new.user_id_2)
       or (b.blocker_id = new.user_id_2 and b.blocked_id = new.user_id_1)
  ) then
    raise exception 'USER_BLOCKED' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = new.user_id_2 and coalesce(p.is_suspended, false)) then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = '42501';
  end if;
  -- Being findable by code is the target's choice. A personal invitation link is the other consent: its creator gave it
  -- (titan.friendship_insert = 'invite' is set by titan_friend_link_accept_v1 only; no API call can set it).
  if coalesce(current_setting('titan.friendship_insert', true), '') <> 'invite' and exists (
    select 1 from public.profiles p
    where p.id = new.user_id_2 and coalesce((p.privacy ->> 'publicProfile')::boolean, false) is false
  ) then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = '42501';
  end if;
  perform public.titan_social_rate_limit(auth.uid(), 'friend_add', interval '1 day', 25);
  insert into public.titan_social_action_log(actor_id, action, target_id) values (auth.uid(), 'friend_add', new.user_id_2);
  return new;
end;
$$;

create or replace function public.titan_guard_friendship_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;
    return old;
  end if;
  -- Server code acting for the player: erasure of the account, a block, or an expired request being replaced (set by those functions
  -- only, no API call can set it), or a row the signed-in player is not part of.
  if coalesce(current_setting('titan.friendship_delete', true), '') in ('account', 'block', 'expired')
     or (v_uid <> old.user_id_1 and v_uid <> old.user_id_2) then
    return old;
  end if;
  perform public.titan_social_rate_limit(v_uid, 'friend_remove', interval '1 hour', 30);
  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (v_uid, 'friend_remove', case when old.user_id_1 = v_uid then old.user_id_2 else old.user_id_1 end);
  return old;
end;
$function$;
revoke all on function public.titan_guard_friendship_delete() from public, anon, authenticated;

-- A pending request lasts 30 days.
create or replace function private.titan_friend_request_expired(p_created timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$ select p_created <= now() - interval '30 days' $$;
revoke all on function private.titan_friend_request_expired(timestamptz) from public, anon, authenticated;

create or replace function public.titan_social_request(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_target public.profiles%rowtype;
  v_row public.friendships%rowtype;
  v_try integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_code !~ '^TN-[A-Z2-9]{4,8}$' then raise exception 'INVALID_FRIEND_CODE' using errcode = '22023'; end if;
  select * into v_target from public.profiles where friend_code = v_code limit 1;
  -- Unknown, private, suspended or blocked all answer the same way: nothing leaks about the person.
  if v_target.id is null or v_target.id = v_uid or coalesce(v_target.is_suspended, false)
     or coalesce((v_target.privacy ->> 'publicProfile')::boolean, false) is false
     or exists (select 1 from public.titan_user_blocks b where (b.blocker_id = v_uid and b.blocked_id = v_target.id) or (b.blocker_id = v_target.id and b.blocked_id = v_uid)) then
    if v_target.id = v_uid then raise exception 'CANNOT_ADD_SELF' using errcode = '22023'; end if;
    raise exception 'FRIEND_CODE_NOT_FOUND' using errcode = 'P0002';
  end if;
  for v_try in 1..3 loop
    select * into v_row from public.friendships f
     where (f.user_id_1 = v_uid and f.user_id_2 = v_target.id) or (f.user_id_1 = v_target.id and f.user_id_2 = v_uid)
     order by f.created_at limit 1 for update;
    if v_row.id is not null and v_row.status = 'pending' and private.titan_friend_request_expired(v_row.created_at) then
      -- An expired request is gone: it is removed, then this request is a new one (counted like any other).
      perform set_config('titan.friendship_delete', 'expired', true);
      delete from public.friendships where id = v_row.id and status = 'pending';
      perform set_config('titan.friendship_delete', '', true);
      v_row := null;
    end if;
    if v_row.id is not null then
      if coalesce(v_row.status, 'accepted') = 'accepted' then
        return jsonb_build_object('status', 'friends', 'id', v_target.id);
      end if;
      if v_row.user_id_1 = v_target.id then
        -- They asked first (less than 30 days ago): asking back is accepting.
        update public.friendships set status = 'accepted' where id = v_row.id;
        return jsonb_build_object('status', 'friends', 'id', v_target.id);
      end if;
      return jsonb_build_object('status', 'pending', 'id', v_target.id);
    end if;
    begin
      insert into public.friendships(user_id_1, user_id_2, status) values (v_uid, v_target.id, 'pending');
      return jsonb_build_object('status', 'pending', 'id', v_target.id);
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'SOCIAL_RETRY' using errcode = 'PT409';
end;
$function$;
revoke all on function public.titan_social_request(text) from public, anon;
grant execute on function public.titan_social_request(text) to authenticated;

create or replace function public.titan_social_respond(p_user uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_created timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select id, created_at into v_id, v_created from public.friendships where user_id_1 = p_user and user_id_2 = v_uid and status = 'pending';
  if v_id is null then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  -- An expired request is refused (it is replaced the next time one of the two asks: titan_social_request).
  if private.titan_friend_request_expired(v_created) then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.titan_user_blocks b where (b.blocker_id = v_uid and b.blocked_id = p_user) or (b.blocker_id = p_user and b.blocked_id = v_uid))
     or exists (select 1 from public.profiles p where p.id = p_user and coalesce(p.is_suspended, false)) then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(p_accept, false) then
    update public.friendships set status = 'accepted' where id = v_id;
    return jsonb_build_object('status', 'friends');
  end if;
  delete from public.friendships where id = v_id;
  return jsonb_build_object('status', 'declined');
end;
$$;
revoke all on function public.titan_social_respond(uuid, boolean) from public, anon;
grant execute on function public.titan_social_respond(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Personal invitation links.
-- ---------------------------------------------------------------------------------------------
create table if not exists private.titan_friend_invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index if not exists titan_friend_invites_creator_idx on private.titan_friend_invites (created_by, created_at desc);
create index if not exists titan_friend_invites_used_by_idx on private.titan_friend_invites (used_by);
alter table private.titan_friend_invites enable row level security;
revoke all on private.titan_friend_invites from public, anon, authenticated;

create or replace function private.titan_friend_invite_live(p_i private.titan_friend_invites)
returns boolean
language sql
stable
set search_path = ''
as $$ select p_i.id is not null and p_i.revoked_at is null and p_i.used_at is null and p_i.expires_at > now() $$;
revoke all on function private.titan_friend_invite_live(private.titan_friend_invites) from public, anon, authenticated;

-- New social features open with a server flag (absent = closed), checked here and not only by the clients.
create or replace function private.titan_flag_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((public.titan_feature_flags_v1() -> 'flags' ->> p_key)::boolean, false) $$;
revoke all on function private.titan_flag_on(text) from public, anon, authenticated;

create or replace function public.titan_friend_link_create_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_id uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  -- Creating links opens with the flag screens.friendlinks; a link already given keeps working if the flag closes again.
  if not private.titan_flag_on('screens.friendlinks') then raise exception 'FEATURE_DISABLED' using errcode = '42501'; end if;
  -- The limiter first: it serialises this account's link creations, so the count of live links below cannot be raced.
  perform public.titan_social_rate_limit(v_uid, 'friend_link', interval '1 day', 20);
  if (select count(*) from private.titan_friend_invites i where i.created_by = v_uid and i.revoked_at is null and i.used_at is null and i.expires_at > now()) >= 5 then
    raise exception 'LINK_LIMIT_5' using errcode = '22023';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.titan_friend_invites (created_by, token_hash, expires_at)
  values (v_uid, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires) returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expiresAt', v_expires);
end;
$function$;

-- The creator's links of the last 7 days: live, used (with the name of the friend it brought) or revoked. Never a token.
create or replace function public.titan_friend_links_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'createdAt', i.created_at, 'expiresAt', i.expires_at,
      'state', case when i.used_at is not null then 'used' when i.revoked_at is not null then 'revoked' when i.expires_at <= now() then 'expired' else 'live' end,
      'usedBy', case when i.used_at is not null and private.titan_are_friends(v_uid, i.used_by)
                     then (select coalesce(nullif(p.username, ''), 'Athlète') from public.profiles p where p.id = i.used_by) end)
      order by i.created_at desc)
    from (select * from private.titan_friend_invites x where x.created_by = v_uid and x.created_at > now() - interval '7 days' order by x.created_at desc limit 20) i), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_friend_link_revoke_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update private.titan_friend_invites set revoked_at = now()
   where id = p_id and created_by = auth.uid() and revoked_at is null and used_at is null;
  return found;
end;
$function$;

-- Anyone may ask whether a link is still valid; only a signed-in account learns whose it is (and never when a block exists).
create or replace function public.titan_friend_link_preview_v1(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_i private.titan_friend_invites%rowtype;
  v_p public.profiles%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valid', false); end if;
  select * into v_i from private.titan_friend_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not private.titan_friend_invite_live(v_i) then return jsonb_build_object('valid', false); end if;
  select * into v_p from public.profiles where id = v_i.created_by;
  if v_p.id is null or coalesce(v_p.is_suspended, false) then return jsonb_build_object('valid', false); end if;
  if v_uid is null then return jsonb_build_object('valid', true, 'expiresAt', v_i.expires_at); end if;
  if exists (select 1 from public.titan_user_blocks b where (b.blocker_id = v_uid and b.blocked_id = v_p.id) or (b.blocker_id = v_p.id and b.blocked_id = v_uid)) then
    return jsonb_build_object('valid', false);
  end if;
  return jsonb_build_object('valid', true, 'expiresAt', v_i.expires_at, 'own', v_p.id = v_uid,
    'friends', private.titan_are_friends(v_uid, v_p.id),
    'inviter', jsonb_build_object('name', coalesce(nullif(v_p.username, ''), 'Athlète'),
      'avatar', coalesce((select ap.avatar from public.adventure_profiles ap where ap.user_id = v_p.id), 'scout')));
end;
$function$;

create or replace function public.titan_friend_link_accept_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_i private.titan_friend_invites%rowtype;
  v_row public.friendships%rowtype;
  v_name text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  perform public.titan_social_rate_limit(v_uid, 'friend_link_accept', interval '1 day', 20);
  select * into v_i from private.titan_friend_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not private.titan_friend_invite_live(v_i) then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  if v_i.created_by = v_uid then raise exception 'LINK_OWN' using errcode = '22023'; end if;
  -- A block in either direction or a suspended creator: the same « invalid » as a dead link.
  if exists (select 1 from public.titan_user_blocks b where (b.blocker_id = v_uid and b.blocked_id = v_i.created_by) or (b.blocker_id = v_i.created_by and b.blocked_id = v_uid))
     or exists (select 1 from public.profiles p where p.id = v_i.created_by and coalesce(p.is_suspended, false)) then
    raise exception 'LINK_INVALID' using errcode = '22023';
  end if;
  select coalesce(nullif(p.username, ''), 'Athlète') into v_name from public.profiles p where p.id = v_i.created_by;
  select * into v_row from public.friendships f
   where (f.user_id_1 = v_uid and f.user_id_2 = v_i.created_by) or (f.user_id_1 = v_i.created_by and f.user_id_2 = v_uid)
   order by f.created_at limit 1 for update;
  if v_row.id is not null and v_row.status = 'accepted' then
    -- Already friends: the link is not spent, it can still bring someone else.
    return jsonb_build_object('status', 'friends', 'id', v_i.created_by, 'name', v_name, 'spent', false);
  end if;
  if v_row.id is not null then
    -- A pending request in either direction: both have now agreed.
    update public.friendships set status = 'accepted' where id = v_row.id;
  else
    perform set_config('titan.friendship_insert', 'invite', true);
    insert into public.friendships(user_id_1, user_id_2, status) values (v_uid, v_i.created_by, 'accepted');
    perform set_config('titan.friendship_insert', '', true);
  end if;
  update private.titan_friend_invites set used_by = v_uid, used_at = now() where id = v_i.id;
  return jsonb_build_object('status', 'friends', 'id', v_i.created_by, 'name', v_name, 'spent', true);
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 4. One's own blocks.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_blocks_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    -- A name only for someone the player was in contact with (a friend request between the two, either way) or who is findable:
    -- blocking an identifier never reveals the name behind it.
    select jsonb_agg(jsonb_build_object('id', b.blocked_id, 'at', b.created_at,
        'name', case when coalesce((p.privacy ->> 'publicProfile')::boolean, false)
                       or exists (select 1 from public.titan_social_action_log g where g.action = 'friend_add'
                                   and ((g.actor_id = v_uid and g.target_id = b.blocked_id) or (g.actor_id = b.blocked_id and g.target_id = v_uid)))
                     then coalesce(nullif(p.username, ''), 'Athlète') else 'Compte bloqué' end) order by b.created_at desc)
      from (select * from public.titan_user_blocks x where x.blocker_id = v_uid order by x.created_at desc limit 200) b
      left join public.profiles p on p.id = b.blocked_id), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_friend_link_create_v1(), public.titan_friend_links_v1(), public.titan_friend_link_revoke_v1(uuid),
  public.titan_friend_link_preview_v1(text), public.titan_friend_link_accept_v1(text), public.titan_blocks_v1() from public, anon;
grant execute on function public.titan_friend_link_create_v1(), public.titan_friend_links_v1(), public.titan_friend_link_revoke_v1(uuid),
  public.titan_friend_link_accept_v1(text), public.titan_blocks_v1() to authenticated;
grant execute on function public.titan_friend_link_preview_v1(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Export: the social excellence helper (redefined by the next lots, always cumulative).
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_social_export_v1(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'friendInvites', coalesce((select jsonb_agg(jsonb_build_object('created_at', i.created_at, 'expires_at', i.expires_at, 'revoked_at', i.revoked_at,
                       'used_at', i.used_at) order by i.created_at) from private.titan_friend_invites i where i.created_by = p_uid), '[]'::jsonb));
$$;
revoke all on function private.titan_social_export_v1(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. The overview lists requests of the last 30 days only (body of 20261114160000, two filters and one key added).
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_social_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles%rowtype;
  v_code text;
  v_week timestamptz := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_me from public.profiles where id = v_uid;
  v_code := v_me.friend_code;
  if v_code is null or v_code !~ '^TN-[A-Z2-9]{4,8}$' then
    v_code := public.titan_generate_friend_code();
    update public.profiles set friend_code = v_code where id = v_uid;
  end if;
  return jsonb_build_object(
    'me', jsonb_build_object('id', v_uid, 'friend_code', v_code, 'findable', coalesce((v_me.privacy ->> 'publicProfile')::boolean, false)),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.username, 'Athlète'),
        'avatar', coalesce(ap.avatar, 'scout'),
        'level', case when coalesce((p.privacy ->> 'showStats')::boolean, false) then p.level end,
        'week_days', case when coalesce((p.privacy ->> 'showStats')::boolean, false) then (
          select count(distinct (l.date at time zone 'Europe/Paris')::date) from public.training_logs l
          where l.user_id = p.id and l.archived_at is null and l.date >= v_week and l.date <= now()) end,
        'last_active', case when coalesce((p.privacy ->> 'socialPresence')::boolean, false) then (
          select max((l.date at time zone 'Europe/Paris')::date) from public.training_logs l
          where l.user_id = p.id and l.archived_at is null and l.date <= now()) end
      ) order by p.username)
      from public.friendships f
      join public.profiles p on p.id = case when f.user_id_1 = v_uid then f.user_id_2 else f.user_id_1 end
      left join public.adventure_profiles ap on ap.user_id = p.id
      where (f.user_id_1 = v_uid or f.user_id_2 = v_uid) and coalesce(f.status, 'accepted') = 'accepted'
        and not coalesce(p.is_suspended, false)
        and private.titan_are_friends(v_uid, p.id)), '[]'::jsonb),
    'requests_in', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'avatar', coalesce(ap.avatar, 'scout'), 'at', f.created_at, 'expires_at', f.created_at + interval '30 days') order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = f.user_id_1
      left join public.adventure_profiles ap on ap.user_id = p.id
      where f.user_id_2 = v_uid and f.status = 'pending' and not coalesce(p.is_suspended, false)
        and not private.titan_friend_request_expired(f.created_at)), '[]'::jsonb),
    'requests_out', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'at', f.created_at, 'expires_at', f.created_at + interval '30 days') order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = f.user_id_2
      where f.user_id_1 = v_uid and f.status = 'pending' and not private.titan_friend_request_expired(f.created_at)), '[]'::jsonb),
    'moments', coalesce((
      select jsonb_agg(m.j order by m.created_at desc) from (
        select mo.created_at, jsonb_build_object(
          'id', mo.id, 'kind', mo.kind, 'title', mo.title, 'detail', mo.detail, 'sport', mo.sport,
          'created_at', mo.created_at, 'mine', mo.user_id = v_uid, 'visibility', mo.visibility,
          'author', jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'avatar', coalesce(ap.avatar, 'scout')),
          'cheers', (select count(*) from public.titan_moment_cheers c where c.moment_id = mo.id),
          'cheered', exists (select 1 from public.titan_moment_cheers c where c.moment_id = mo.id and c.user_id = v_uid)) as j
        from public.titan_moments mo
        join public.profiles p on p.id = mo.user_id
        left join public.adventure_profiles ap on ap.user_id = p.id
        where not mo.hidden and mo.created_at > now() - interval '30 days'
          and (mo.user_id = v_uid or (mo.visibility = 'friends' and private.titan_are_friends(v_uid, mo.user_id)))
        order by mo.created_at desc limit 40) m), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'metric', c.metric, 'sport', c.sport, 'target', c.target,
        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'mine', c.creator_id = v_uid, 'my_status', me.status,
        'status', case when now() > c.ends_at then 'ended' else 'active' end,
        -- A member is named (id, name, progress) only for themselves, for their accepted, unblocked friends, and for the two players
        -- of an invitation link (the one who created it and the one who used it both agreed to that duel, unless one has since
        -- blocked the other); everyone else is a nameless participant: same keys, no id, no progress.
        'members', (select coalesce(jsonb_agg(
            case when v.shown then jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'status', mm.status,
                   'progress', case when mm.status = 'joined' then private.titan_challenge_progress(c.id, mm.user_id) end)
                 else jsonb_build_object('id', null, 'name', 'Participant', 'status', mm.status, 'progress', null) end
            order by v.shown desc, case when v.shown then p.username end, mm.status), '[]'::jsonb)
          from public.titan_challenge_members mm join public.profiles p on p.id = mm.user_id
          cross join lateral (select (mm.user_id = v_uid or private.titan_are_friends(v_uid, mm.user_id) or (
              exists (select 1 from private.titan_challenge_invites i
                       where i.challenge_id = c.id and i.used_at is not null
                         and ((i.created_by = v_uid and i.used_by = mm.user_id) or (i.created_by = mm.user_id and i.used_by = v_uid)))
              and not exists (select 1 from public.titan_user_blocks k
                               where (k.blocker_id = v_uid and k.blocked_id = mm.user_id) or (k.blocker_id = mm.user_id and k.blocked_id = v_uid)))) as shown) v
          where mm.challenge_id = c.id and mm.status in ('joined', 'invited'))
      ) order by c.ends_at desc)
      from public.titan_challenges c
      join public.titan_challenge_members me on me.challenge_id = c.id and me.user_id = v_uid and me.status in ('joined', 'invited')
      where c.ends_at > now() - interval '14 days'), '[]'::jsonb),
    'expedition', public.titan_expedition_board(null),
    'guild', public.titan_guild_week()
  );
end;
$function$;
revoke all on function public.titan_social_overview() from public, anon;
grant execute on function public.titan_social_overview() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. The account export (body of 20261117170000, one call appended).
-- ---------------------------------------------------------------------------------------------
create or replace function public.export_own_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb := '{}'::jsonb;
  v_friendships jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(to_jsonb(p), '{}'::jsonb) into v_profile from public.profiles p where p.id = v_uid;

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_friendships
      from public.friendships f where f.user_id_1 = v_uid or f.user_id_2 = v_uid;
  end if;

  return jsonb_build_object(
    'exportedAt', now(),
    'userId', v_uid,
    'profile', v_profile,
    'trainingLogs', public.titan_export_rows('training_logs', 'user_id', v_uid),
    'activities', public.titan_export_rows('activities', 'user_id', v_uid),
    'messages', public.titan_export_rows('messages', 'sender_id', v_uid),
    'friendships', v_friendships,
    'shopHistory', public.titan_export_rows('shop_history', 'user_id', v_uid),
    'achievements', public.titan_export_rows('user_achievements', 'user_id', v_uid),
    'inventory', public.titan_export_rows('inventory', 'user_id', v_uid),
    'socialChallengesAsChallenger', public.titan_export_rows('social_challenges', 'challenger_id', v_uid),
    'socialChallengesAsOpponent', public.titan_export_rows('social_challenges', 'opponent_id', v_uid),
    'cacheReconciliationReports', public.titan_export_rows('titan_cache_reconciliation_reports', 'user_id', v_uid),
    'suspiciousActions', public.titan_export_rows('titan_suspicious_actions', 'user_id', v_uid),
    -- Added by V11-18.
    'trainingRevisions', public.titan_export_rows('training_revisions', 'user_id', v_uid),
    'goals', public.titan_export_rows('sport_goals', 'user_id', v_uid),
    'adventureProfile', public.titan_export_rows('adventure_profiles', 'user_id', v_uid),
    'adventureProgress', public.titan_export_rows('adventure_progress', 'user_id', v_uid),
    'adventureRewards', public.titan_export_rows('adventure_rewards', 'user_id', v_uid),
    'adventureQuestRewards', public.titan_export_rows('adventure_quest_rewards', 'user_id', v_uid),
    'campaignState', public.titan_export_rows('campaign_state', 'user_id', v_uid),
    'bestiary', public.titan_export_rows('user_bestiary', 'user_id', v_uid),
    'moments', public.titan_export_rows('titan_moments', 'user_id', v_uid),
    'momentCheers', public.titan_export_rows('titan_moment_cheers', 'user_id', v_uid),
    'publicCard', public.titan_export_rows('titan_public_cards', 'user_id', v_uid),
    'expeditions', public.titan_export_rows('titan_expedition_members', 'user_id', v_uid),
    'challengesJoined', public.titan_export_rows('titan_challenge_members', 'user_id', v_uid),
    'guildMembership', public.titan_export_rows('guild_members', 'user_id', v_uid),
    'titanPlusAccess', public.titan_export_rows('premium_access', 'user_id', v_uid),
    'periodicQuestClaims', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_periodic_quest_claims c where c.user_id = v_uid), '[]'::jsonb),
    'sourceConsents', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_source_consents c where c.user_id = v_uid), '[]'::jsonb),
    'importedActivities', coalesce((select jsonb_agg(to_jsonb(i)) from private.titan_imported_activities i where i.user_id = v_uid), '[]'::jsonb),
    'dailyActivity', coalesce((select jsonb_agg(to_jsonb(d) order by d.day, d.source) from private.titan_daily_activity d where d.user_id = v_uid), '[]'::jsonb)
  ) || private.titan_export_extras_v1(v_uid) || private.titan_export_extras_v131_v1(v_uid) || private.titan_live_export_v1(v_uid) || private.titan_social_export_v1(v_uid);
end;
$function$;
revoke all on function public.export_own_data() from public, anon;
grant execute on function public.export_own_data() to authenticated;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
