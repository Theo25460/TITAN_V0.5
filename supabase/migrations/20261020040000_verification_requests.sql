-- BOT06 / Q-005: an administrator can ask a player for a verification; the player sees it as an alert inside Titan,
-- reads it durably and answers once. A request never changes the account, its sessions, XP, credits or rankings: it is a
-- message with an answer, nothing automatic. The caller owns the transaction. Rollback: drop the table and the six functions.
create table if not exists private.titan_verification_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  message text not null check (char_length(message) between 10 and 500),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answer text check (answer is null or char_length(answer) between 3 and 500),
  answered_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  check ((answer is null) = (answered_at is null)),
  check ((status = 'closed') = (closed_at is not null)),
  check (status <> 'answered' or answer is not null)
);
-- One open request per player at a time.
create unique index if not exists titan_verification_one_open_idx on private.titan_verification_requests (user_id) where status = 'open';
create index if not exists titan_verification_user_idx on private.titan_verification_requests (user_id, id desc);
create index if not exists titan_verification_status_idx on private.titan_verification_requests (status, id);
create index if not exists titan_verification_requester_idx on private.titan_verification_requests (requested_by) where requested_by is not null;
create index if not exists titan_verification_closer_idx on private.titan_verification_requests (closed_by) where closed_by is not null;
alter table private.titan_verification_requests enable row level security;
revoke all on table private.titan_verification_requests from public, anon, authenticated, service_role;

-- Administrator: ask a player for a verification.
create or replace function public.titan_verification_request_v1(p_user uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_message text := left(btrim(coalesce(p_message, '')), 501);
  v_status text;
  v_id bigint;
begin
  if p_user is null then
    raise exception 'USER_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 500 then
    raise exception 'MESSAGE_REQUIRED' using errcode = '22023';
  end if;
  if p_user = v_admin then
    raise exception 'CANNOT_MODERATE_SELF' using errcode = '42501';
  end if;
  select coalesce(status, 'active') into v_status from public.profiles where id = p_user;
  if not found or v_status = 'deleted' then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Serialise requests to one player so the single open request and the weekly cap hold under concurrency.
  perform pg_advisory_xact_lock(hashtextextended('titan_verification:' || p_user::text, 0));
  if exists (select 1 from private.titan_verification_requests where user_id = p_user and status = 'open') then
    raise exception 'REQUEST_ALREADY_OPEN' using errcode = '23505';
  end if;
  if (select count(*) from private.titan_verification_requests where user_id = p_user and created_at > now() - interval '7 days') >= 3 then
    raise exception 'REQUEST_LIMIT' using errcode = '23514';
  end if;
  insert into private.titan_verification_requests(user_id, requested_by, message)
  values (p_user, v_admin, v_message) returning id into v_id;
  perform public.titan_admin_audit_write('verification.request', p_user, jsonb_build_object('request', v_id));
  return jsonb_build_object('version', 1, 'id', v_id, 'status', 'open');
end;
$function$;

-- Administrator: close a request (answered or not); the closing is recorded in the audit trail.
create or replace function public.titan_verification_close_v1(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_row record;
begin
  select * into v_row from private.titan_verification_requests where id = p_id for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status = 'closed' then
    raise exception 'REQUEST_CLOSED' using errcode = '23514';
  end if;
  update private.titan_verification_requests set status = 'closed', closed_by = v_admin, closed_at = now() where id = p_id;
  perform public.titan_admin_audit_write('verification.close', v_row.user_id, jsonb_build_object('request', p_id, 'was', v_row.status));
  return jsonb_build_object('version', 1, 'id', p_id, 'status', 'closed');
end;
$function$;

-- Administrator: requests by state ('any' for all), for one player or for everybody.
create or replace function public.titan_verification_list_v1(p_status text default 'answered', p_user uuid default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.titan_moderation_require_admin();
  if p_status is null or p_status not in ('open', 'answered', 'closed', 'any') then
    raise exception 'UNKNOWN_STATUS' using errcode = '22023';
  end if;
  return jsonb_build_object('version', 1, 'requests', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'userId', r.user_id, 'message', r.message, 'status', r.status,
      'createdAt', r.created_at, 'answer', r.answer, 'answeredAt', r.answered_at, 'closedAt', r.closed_at) order by r.id)
    from (select * from private.titan_verification_requests
          where (p_status = 'any' or status = p_status) and (p_user is null or user_id = p_user)
          order by id limit greatest(1, least(coalesce(p_limit, 50), 100))) r), '[]'::jsonb));
end;
$function$;

-- Player: own requests (the administrator's identity is not exposed).
create or replace function public.titan_my_verification_requests_v1()
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
  return jsonb_build_object('version', 1,
    'open', (select count(*) from private.titan_verification_requests where user_id = v_user and status = 'open'),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'message', r.message, 'status', r.status, 'createdAt', r.created_at,
        'answer', r.answer, 'answeredAt', r.answered_at, 'closedAt', r.closed_at) order by r.id desc)
      from (select * from private.titan_verification_requests where user_id = v_user order by id desc limit 20) r), '[]'::jsonb));
end;
$function$;

-- Player: answer an open request, once.
create or replace function public.titan_verification_answer_v1(p_id bigint, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_answer text := left(btrim(coalesce(p_answer, '')), 501);
  v_row record;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if char_length(v_answer) < 3 or char_length(v_answer) > 500 then
    raise exception 'ANSWER_REQUIRED' using errcode = '22023';
  end if;
  -- Someone else's request is reported exactly like a missing one.
  select * into v_row from private.titan_verification_requests where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status <> 'open' then
    raise exception 'REQUEST_NOT_OPEN' using errcode = '23514';
  end if;
  update private.titan_verification_requests set status = 'answered', answer = v_answer, answered_at = now() where id = p_id;
  return jsonb_build_object('version', 1, 'id', p_id, 'status', 'answered');
end;
$function$;

revoke all on function public.titan_verification_request_v1(uuid, text) from public, anon;
revoke all on function public.titan_verification_close_v1(bigint) from public, anon;
revoke all on function public.titan_verification_list_v1(text, uuid, integer) from public, anon;
revoke all on function public.titan_my_verification_requests_v1() from public, anon;
revoke all on function public.titan_verification_answer_v1(bigint, text) from public, anon;
grant execute on function public.titan_verification_request_v1(uuid, text) to authenticated;
grant execute on function public.titan_verification_close_v1(bigint) to authenticated;
grant execute on function public.titan_verification_list_v1(text, uuid, integer) to authenticated;
grant execute on function public.titan_my_verification_requests_v1() to authenticated;
grant execute on function public.titan_verification_answer_v1(bigint, text) to authenticated;

notify pgrst, 'reload schema';
