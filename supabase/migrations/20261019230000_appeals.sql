-- CHEAT19: appeal procedure for a player whose session was excluded or whose account was suspended.
-- A player files a reasoned appeal; an administrator accepts (the existing audited RPC lifts the exclusion or the
-- suspension) or declines with a note the player can read. Nothing is automatic; the caller owns the transaction.
create table if not exists private.titan_appeals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('session', 'account')),
  session_id uuid references public.training_logs(id) on delete cascade,
  message text not null check (char_length(message) between 10 and 500),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text check (decision_note is null or char_length(decision_note) between 3 and 500),
  decided_at timestamptz,
  check ((kind = 'session') = (session_id is not null)),
  check ((status = 'open') = (decided_at is null))
);
create unique index if not exists titan_appeals_one_open_idx
  on private.titan_appeals (user_id, kind, coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open';
create index if not exists titan_appeals_user_idx on private.titan_appeals (user_id, id desc);
create index if not exists titan_appeals_open_idx on private.titan_appeals (id) where status = 'open';
create index if not exists titan_appeals_session_idx on private.titan_appeals (session_id) where session_id is not null;
create index if not exists titan_appeals_decider_idx on private.titan_appeals (decided_by) where decided_by is not null;
alter table private.titan_appeals enable row level security;
revoke all on table private.titan_appeals from public, anon, authenticated;

create or replace function public.titan_appeal_submit_v1(p_kind text, p_session uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_message text := left(btrim(coalesce(p_message, '')), 501);
  v_profile record;
  v_log record;
  v_id bigint;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('session', 'account') then
    raise exception 'UNKNOWN_KIND' using errcode = '22023';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 500 then
    raise exception 'MESSAGE_REQUIRED' using errcode = '22023';
  end if;
  -- Serialise one player's filings so the cap and the single open appeal hold under concurrency.
  perform pg_advisory_xact_lock(hashtextextended('titan_appeal:' || v_user::text, 0));

  if p_kind = 'session' then
    -- Another player's session is reported exactly like a missing one.
    select id, is_suspicious into v_log from public.training_logs where id = p_session and user_id = v_user;
    if not found then
      raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not coalesce(v_log.is_suspicious, false) then
      raise exception 'NOT_EXCLUDED' using errcode = '23514';
    end if;
  else
    p_session := null;
    select status, is_suspended into v_profile from public.profiles where id = v_user;
    -- A deleted account also carries is_suspended: it has nothing to appeal.
    if not found or v_profile.status = 'deleted'
       or not (coalesce(v_profile.is_suspended, false) or v_profile.status in ('suspended', 'banned')) then
      raise exception 'NOT_SUSPENDED' using errcode = '23514';
    end if;
  end if;

  if exists (select 1 from private.titan_appeals where user_id = v_user and kind = p_kind
               and session_id is not distinct from p_session and status = 'open') then
    raise exception 'APPEAL_ALREADY_OPEN' using errcode = '23505';
  end if;
  if (select count(*) from private.titan_appeals where user_id = v_user and status = 'open') >= 5 then
    raise exception 'APPEAL_LIMIT' using errcode = '23514';
  end if;
  if exists (select 1 from private.titan_appeals where user_id = v_user and kind = p_kind
               and session_id is not distinct from p_session and status = 'declined'
               and decided_at > now() - interval '7 days') then
    raise exception 'APPEAL_COOLDOWN' using errcode = '23514';
  end if;

  insert into private.titan_appeals(user_id, kind, session_id, message)
  values (v_user, p_kind, p_session, v_message) returning id into v_id;
  return jsonb_build_object('version', 1, 'id', v_id, 'status', 'open');
end;
$function$;

create or replace function public.titan_my_appeals_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return jsonb_build_object('version', 1, 'appeals', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'sessionId', a.session_id, 'status', a.status,
      'createdAt', a.created_at, 'decidedAt', a.decided_at, 'decisionNote', a.decision_note) order by a.id desc)
    from (select * from private.titan_appeals where user_id = v_user order by id desc limit 50) a), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_appeal_list_v1(p_status text default 'open', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
begin
  if p_status is null or p_status not in ('open', 'accepted', 'declined') then
    raise exception 'UNKNOWN_STATUS' using errcode = '22023';
  end if;
  return jsonb_build_object('version', 1, 'appeals', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'userId', a.user_id, 'kind', a.kind, 'sessionId', a.session_id,
      'message', a.message, 'status', a.status, 'createdAt', a.created_at, 'decidedAt', a.decided_at,
      'decisionNote', a.decision_note,
      'session', case when a.session_id is null then null else (
        select jsonb_build_object('sport', l.sport, 'date', l.date, 'excluded', coalesce(l.is_suspicious, false))
        from public.training_logs l where l.id = a.session_id) end) order by a.id)
    from (select * from private.titan_appeals where status = p_status
          order by id limit greatest(1, least(coalesce(p_limit, 50), 100))) a), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_appeal_decide_v1(p_id bigint, p_accept boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_note text := left(btrim(coalesce(p_note, '')), 500);
  v_appeal record;
  v_status text;
begin
  if p_accept is null then
    raise exception 'DECISION_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_note) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_appeal from private.titan_appeals where id = p_id for update;
  if not found then
    raise exception 'APPEAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_appeal.status <> 'open' then
    raise exception 'APPEAL_CLOSED' using errcode = '23514';
  end if;
  if v_appeal.user_id = v_admin then
    raise exception 'CANNOT_MODERATE_SELF' using errcode = '42501';
  end if;

  if p_accept then
    if v_appeal.kind = 'session' then
      -- Nothing to lift (already restored since the filing): say so instead of recording a hollow acceptance.
      if not (public.titan_session_exclusion_v1(v_appeal.session_id, false, v_note) ->> 'changed')::boolean then
        raise exception 'STATE_CHANGED' using errcode = '23514';
      end if;
    elsif exists (select 1 from public.profiles where id = v_appeal.user_id and status in ('banned', 'deleted')) then
      -- A ban (or a deleted account) is handled with the administrator profile tool, not from this queue.
      raise exception 'USE_ADMIN_PROFILE_TOOL' using errcode = '23514';
    elsif exists (select 1 from public.profiles where id = v_appeal.user_id
                    and (coalesce(is_suspended, false) or status = 'suspended')) then
      perform public.titan_moderation_decide_v1(v_appeal.user_id, 'restore', v_note);
    else
      raise exception 'STATE_CHANGED' using errcode = '23514';
    end if;
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;
  update private.titan_appeals
     set status = v_status, decided_by = v_admin, decision_note = v_note, decided_at = now()
   where id = p_id;
  perform public.titan_admin_audit_write('appeal.decision', v_appeal.user_id,
    jsonb_build_object('appeal', p_id, 'kind', v_appeal.kind, 'status', v_status, 'session', v_appeal.session_id));
  return jsonb_build_object('version', 1, 'id', p_id, 'status', v_status);
end;
$function$;

-- What the player can contest: the account state and their own excluded sessions (nothing about anyone else, no reason text
-- written by staff, no score). Read-only.
create or replace function public.titan_my_review_state_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_profile record;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select status, is_suspended into v_profile from public.profiles where id = v_user;
  return jsonb_build_object('version', 1,
    'account', jsonb_build_object(
      'suspended', coalesce(v_profile.is_suspended, false) or coalesce(v_profile.status, 'active') in ('suspended', 'banned'),
      'banned', coalesce(v_profile.status, 'active') = 'banned'),
    'excludedSessions', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'sport', l.sport, 'date', l.date, 'value', l.val, 'unit', l.unit,
        'hasOpenAppeal', exists (select 1 from private.titan_appeals a where a.session_id = l.id and a.user_id = v_user and a.status = 'open'))
        order by l.date desc)
      from (select * from public.training_logs where user_id = v_user and is_suspicious is true and archived_at is null
            order by date desc limit 50) l), '[]'::jsonb));
end;
$function$;

revoke all on function public.titan_appeal_submit_v1(text, uuid, text) from public, anon;
revoke all on function public.titan_my_appeals_v1() from public, anon;
revoke all on function public.titan_appeal_list_v1(text, integer) from public, anon;
revoke all on function public.titan_appeal_decide_v1(bigint, boolean, text) from public, anon;
grant execute on function public.titan_appeal_submit_v1(text, uuid, text) to authenticated;
grant execute on function public.titan_my_appeals_v1() to authenticated;
revoke all on function public.titan_my_review_state_v1() from public, anon;
grant execute on function public.titan_my_review_state_v1() to authenticated;
grant execute on function public.titan_appeal_list_v1(text, integer) to authenticated;
grant execute on function public.titan_appeal_decide_v1(bigint, boolean, text) to authenticated;
