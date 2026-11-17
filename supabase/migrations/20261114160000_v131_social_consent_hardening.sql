-- V1.3.1 SEC follow-up to 20261110142656: the consent and block rules of the social layer, hardened after the friendship audit.
-- Applies after 20261110152900. Additive and idempotent: every function keeps its signature, return shape and grants, no row is deleted,
-- and the only data touched is friendships.status (NULL, which every reader already treats as accepted, becomes 'accepted').
--   1. Deleting a friendship no longer blocks the erasure of an account (more than 30 friends hit the unfriending limit) nor a deletion
--      made without a signed-in player (dashboard, service role, cascade from auth.users); blocking a friend never hits that limit either.
--   2. The legacy duel (titan_create_social_challenge) is only for accepted, unblocked friends and answers the same refusal for an unknown
--      account, a stranger and a blocked account.
--   3. In a friends' challenge a member is named (id, name, progress) only to themselves, to their own accepted, unblocked friends and
--      to the other player of an invitation link they created or used (both agreed to that duel); an
--      invitation link is refused when a block exists with any member; blocking someone leaves the challenges that person created and
--      removes that person from the challenges the blocker created.
--   4. friendships.status is NOT NULL, pending or accepted, pending by default; a row written straight through the API can only be pending.
--   5. Two players asking each other at the same moment become friends instead of one of them receiving a unique-key error.
--   6. titan_admin_role and titan_is_admin answer about another account only to administrators and server code.
-- The caller owns the transaction: never BEGIN/COMMIT here. Table changes run under a 5 s lock_timeout: on contention the statement fails
-- with nothing changed and the whole file can simply be replayed.
-- Rollback containment: keep this migration. Re-applying the previous bodies of these functions reopens the leaks listed above; the
-- constraint and the trigger can be dropped alone (alter table public.friendships drop constraint friendships_status_check, alter column
-- status drop not null; drop trigger titan_friendships_status_guard on public.friendships).

-- ---------------------------------------------------------------------------------------------
-- 1. Friendship rows: who may write what.
-- ---------------------------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is the role that really writes the row. The consent RPCs are SECURITY DEFINER and arrive here
-- as their owner; a row written straight through the API arrives as anon or authenticated, whatever grant or policy let it in.
create or replace function private.titan_friendship_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    elsif new.status is distinct from old.status or new.user_id_1 is distinct from old.user_id_1 or new.user_id_2 is distinct from old.user_id_2 then
      raise exception 'FRIENDSHIP_READ_ONLY' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.titan_friendship_status_guard() from public, anon, authenticated;

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
    -- No signed-in player: the service role, the dashboard or the cascade of a deleted account. An API role without identity stays refused.
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;
    return old;
  end if;
  -- Server code acting for the player: the erasure of the account, a block (set by those functions only, no API call can set it), or a
  -- row the signed-in player is not part of (row security never lets a player delete such a row directly).
  if coalesce(current_setting('titan.friendship_delete', true), '') in ('account', 'block')
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

create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  -- Erasing the account is not a burst of unfriending: the friendship guard lets these deletions through (no API call can set this).
  perform set_config('titan.friendship_delete', 'account', true);

  v_deleted := public.titan_delete_rows('training_logs', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('training_logs', v_deleted);

  v_deleted := public.titan_delete_rows('activities', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('activities', v_deleted);

  v_deleted := public.titan_delete_rows('messages', 'sender_id', v_uid);
  v_counts := v_counts || jsonb_build_object('messages', v_deleted);

  v_deleted := public.titan_delete_rows('shop_history', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('shop_history', v_deleted);

  v_deleted := public.titan_delete_rows('user_achievements', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('user_achievements', v_deleted);

  v_deleted := public.titan_delete_rows('inventory', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('inventory', v_deleted);

  v_deleted := public.titan_delete_rows('titan_cache_reconciliation_reports', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('cache_reconciliation_reports', v_deleted);

  v_deleted := public.titan_delete_rows('titan_suspicious_actions', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('suspicious_actions', v_deleted);

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    delete from public.friendships
    where user_id_1 = v_uid or user_id_2 = v_uid;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('friendships', v_deleted);
  end if;

  if to_regclass('public.social_challenges') is not null
     and public.titan_table_has_column('social_challenges', 'challenger_id')
     and public.titan_table_has_column('social_challenges', 'opponent_id') then
    delete from public.social_challenges
    where challenger_id = v_uid or opponent_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('social_challenges', v_deleted);
  end if;

  delete from public.profiles where id = v_uid;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('profiles', v_deleted);

  delete from auth.users where id = v_uid;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('auth_users', v_deleted);

  return jsonb_build_object(
    'deletedAt', now(),
    'userId', v_uid,
    'deleted', v_counts
  );
end;
$function$;
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Blocking: ends the friendship without the unfriending limit, and ends what the two share in each other's challenges.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_block_user(p_blocked_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_blocked_id = v_uid then
    raise exception 'CANNOT_BLOCK_SELF' using errcode = '22023';
  end if;

  perform public.titan_social_rate_limit(v_uid, 'block_user', interval '1 day', 50);

  insert into public.titan_user_blocks(blocker_id, blocked_id, reason)
  values (v_uid, p_blocked_id, left(trim(coalesce(p_reason, '')), 180))
  on conflict (blocker_id, blocked_id) do update set
    reason = excluded.reason,
    created_at = now();

  -- The block is already counted above (50 a day): removing the friendship must never be refused by the unfriending limit.
  perform set_config('titan.friendship_delete', 'block', true);
  delete from public.friendships
  where (user_id_1 = v_uid and user_id_2 = p_blocked_id)
     or (user_id_1 = p_blocked_id and user_id_2 = v_uid);
  perform set_config('titan.friendship_delete', '', true);

  -- Each one leaves the challenges the other created. In somebody else's challenge both stay, nameless to each other (see the overview).
  update public.titan_challenge_members m
     set status = 'left'
    from public.titan_challenges c
   where c.id = m.challenge_id and m.status in ('invited', 'joined')
     and ((c.creator_id = v_uid and m.user_id = p_blocked_id) or (c.creator_id = p_blocked_id and m.user_id = v_uid));

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (v_uid, 'block_user', p_blocked_id);

  return true;
end;
$function$;
revoke all on function public.titan_block_user(uuid, text) from public, anon;
grant execute on function public.titan_block_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Legacy duel: friends only, one answer for every account that cannot be challenged.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_create_social_challenge(p_opponent uuid, p_sport text, p_target numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare u uuid:=auth.uid(); c public.social_challenges%rowtype;
begin
 if u is null or p_opponent is null or p_sport is null or length(trim(p_sport))=0 or p_target is null or p_opponent=u or p_target<=0 or p_target>300000 then raise exception 'CHALLENGE_INVALID' using errcode='22023'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 -- Unknown, suspended, stranger, pending or blocked: the same refusal, so nothing is learnt about an identifier.
 if not private.titan_are_friends(u,p_opponent) or not exists(select 1 from public.profiles where id=p_opponent and not coalesce(is_suspended,false)) then raise exception 'OPPONENT_UNAVAILABLE' using errcode='22023'; end if;
 if (select count(*) from public.social_challenges where challenger_id=u and created_at>now()-interval '1 day')>=10 then raise exception 'CHALLENGE_RATE_LIMIT' using errcode='23514'; end if;
 insert into public.social_challenges(challenger_id,opponent_id,type,sport,target_val,stake,status,expires_at)
 values(u,p_opponent,'duel',left(p_sport,80),p_target,0,'pending',now()+interval '7 days') returning * into c;
 return to_jsonb(c);
end $function$;
revoke all on function public.titan_create_social_challenge(uuid, text, numeric) from public, anon;
grant execute on function public.titan_create_social_challenge(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Friends' challenges: names and progress for oneself and one's friends only; links refuse a block with any member.
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
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'avatar', coalesce(ap.avatar, 'scout'), 'at', f.created_at) order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = f.user_id_1
      left join public.adventure_profiles ap on ap.user_id = p.id
      where f.user_id_2 = v_uid and f.status = 'pending' and not coalesce(p.is_suspended, false)), '[]'::jsonb),
    'requests_out', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Athlète'), 'at', f.created_at) order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = f.user_id_2
      where f.user_id_1 = v_uid and f.status = 'pending'), '[]'::jsonb),
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

create or replace function public.titan_challenge_link_accept_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_i private.titan_challenge_invites%rowtype;
  v_c public.titan_challenges%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  perform public.titan_social_rate_limit(v_uid, 'challenge_link_accept', interval '1 day', 30);
  select * into v_i from private.titan_challenge_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or v_i.revoked_at is not null or v_i.used_at is not null or v_i.expires_at <= now() then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  select * into v_c from public.titan_challenges where id = v_i.challenge_id and ends_at > now();
  if not found then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if v_c.creator_id = v_uid then raise exception 'LINK_OWN_CHALLENGE' using errcode = '22023'; end if;
  -- A block in either direction with the creator or with any invited or joined member: the same "invalid" as any other dead link.
  if exists (
    select 1 from public.titan_user_blocks k
     where (k.blocker_id = v_uid and (k.blocked_id = v_c.creator_id or exists (
              select 1 from public.titan_challenge_members m where m.challenge_id = v_c.id and m.user_id = k.blocked_id and m.status in ('invited', 'joined'))))
        or (k.blocked_id = v_uid and (k.blocker_id = v_c.creator_id or exists (
              select 1 from public.titan_challenge_members m where m.challenge_id = v_c.id and m.user_id = k.blocker_id and m.status in ('invited', 'joined'))))
  ) then
    raise exception 'LINK_INVALID' using errcode = '22023';
  end if;
  if (select count(*) from public.titan_challenge_members m where m.challenge_id = v_c.id and m.status = 'joined') >= 10 then raise exception 'CHALLENGE_FULL' using errcode = '22023'; end if;
  insert into public.titan_challenge_members as cm (challenge_id, user_id, status, joined_at) values (v_c.id, v_uid, 'joined', now())
  on conflict (challenge_id, user_id) do update set status = 'joined', joined_at = now() where cm.status in ('invited', 'declined', 'left');
  update private.titan_challenge_invites set used_by = v_uid, used_at = now() where id = v_i.id;
  return jsonb_build_object('challenge', v_c.id, 'title', v_c.title);
end;
$function$;
revoke all on function public.titan_challenge_link_accept_v1(text) from public, anon;
grant execute on function public.titan_challenge_link_accept_v1(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Asking: two requests that cross are an agreement, not a unique-key error.
-- ---------------------------------------------------------------------------------------------
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
     order by f.created_at limit 1;
    if v_row.id is not null then
      if coalesce(v_row.status, 'accepted') = 'accepted' then
        return jsonb_build_object('status', 'friends', 'id', v_target.id);
      end if;
      if v_row.user_id_1 = v_target.id then
        -- They asked first: asking back is accepting.
        update public.friendships set status = 'accepted' where id = v_row.id;
        return jsonb_build_object('status', 'friends', 'id', v_target.id);
      end if;
      return jsonb_build_object('status', 'pending', 'id', v_target.id);
    end if;
    begin
      insert into public.friendships(user_id_1, user_id_2, status) values (v_uid, v_target.id, 'pending');
      return jsonb_build_object('status', 'pending', 'id', v_target.id);
    exception when unique_violation then
      -- The other side wrote the pair in the meantime: read it again (their request is then accepted above).
      null;
    end;
  end loop;
  -- Three crossings in a row: one HTTP 409, never a retryable serialization code (see 20261104085851).
  raise exception 'SOCIAL_RETRY' using errcode = 'PT409';
end;
$function$;
revoke all on function public.titan_social_request(text) from public, anon;
grant execute on function public.titan_social_request(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Role lookups: one's own role, or anyone's for administrators and server code. Both stay SECURITY INVOKER, so current_user is the
--    API role for a direct call and for a row-security policy, and the owner inside the SECURITY DEFINER functions that use them.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_admin_role(p_user_id uuid default auth.uid())
returns text
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_target uuid := coalesce(p_user_id, v_uid);
begin
  if v_target is distinct from v_uid and current_user in ('anon', 'authenticated') and not private.titan_is_admin(v_uid) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return private.titan_admin_role_for(v_target);
end;
$function$;

create or replace function public.titan_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
set search_path = ''
as $function$
  select case
    when coalesce(p_user_id, auth.uid()) is not distinct from auth.uid() then private.titan_is_admin(auth.uid())
    when current_user not in ('anon', 'authenticated') then private.titan_is_admin(p_user_id)
    when private.titan_is_admin(auth.uid()) then private.titan_is_admin(p_user_id)
    else false
  end;
$function$;
revoke all on function public.titan_admin_role(uuid), public.titan_is_admin(uuid) from public, anon;
grant execute on function public.titan_admin_role(uuid), public.titan_is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. friendships.status: pending or accepted, never NULL, pending unless a consent function says otherwise.
--    Two steps so that, when the runner commits each statement, the validation scan does not hold the table lock of the declaration.
-- ---------------------------------------------------------------------------------------------
do $migration$
declare
  v_lock_timeout text := current_setting('lock_timeout');
  v_other text;
begin
  perform set_config('lock_timeout', '5s', true);

  select string_agg(distinct f.status, ', ') into v_other from public.friendships f where f.status is not null and f.status not in ('pending', 'accepted');
  if v_other is not null then
    raise exception 'friendships.status holds unexpected values (%): review them before this migration; nothing was changed', v_other;
  end if;
  -- Every reader already treats a missing status as an accepted friendship (coalesce(status, 'accepted')): the value is written, not changed.
  update public.friendships set status = 'accepted' where status is null;

  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.friendships'::regclass and conname = 'friendships_status_check') then
    alter table public.friendships add constraint friendships_status_check
      check (status is not null and status in ('pending', 'accepted')) not valid;
  end if;

  drop trigger if exists titan_friendships_status_guard on public.friendships;
  create trigger titan_friendships_status_guard before insert or update on public.friendships
    for each row execute function private.titan_friendship_status_guard();

  perform set_config('lock_timeout', v_lock_timeout, true);
end
$migration$;

do $migration$
declare
  v_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);

  alter table public.friendships validate constraint friendships_status_check;
  -- The validated check proves there is no NULL, so this does not scan the table again.
  alter table public.friendships alter column status set not null;
  alter table public.friendships alter column status set default 'pending';

  perform set_config('lock_timeout', v_lock_timeout, true);
end
$migration$;

notify pgrst, 'reload schema';
