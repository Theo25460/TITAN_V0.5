-- Versioned preparation only. Enable the Netlify channel after provider/retention review.
-- Caller owns the transaction; no transaction control or modification of existing modules.
create table if not exists private.titan_support_requests (
  reference uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  category text not null check (category in ('bug','compte','titanplus','donnees','communaute','autre')),
  message text not null check (char_length(message) between 10 and 4000 and octet_length(message)<=16384),
  reply_email text,
  reply_allowed boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  notification_state text not null default 'pending' check (notification_state in ('pending','sending','sent')),
  notification_first_attempt_at timestamptz,
  notification_lease_id uuid,
  notification_lease_until timestamptz,
  notification_from text,
  notification_provider_id text,
  notification_sent_at timestamptz,
  unique(user_id,request_id)
);
create index if not exists titan_support_requests_user_created_idx on private.titan_support_requests(user_id,created_at);
alter table private.titan_support_requests enable row level security;
revoke all on private.titan_support_requests from public,anon,authenticated,service_role;

create or replace function public.titan_support_accept_v300(p_user_id uuid,p_request_id uuid,p_category text,p_message text,p_reply_allowed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare ticket private.titan_support_requests%rowtype; email_address text; now_at timestamptz:=clock_timestamp();
begin
  if p_user_id is null or p_request_id is null or p_request_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_category is null or p_category not in ('bug','compte','titanplus','donnees','communaute','autre')
    or p_reply_allowed is null or p_message is null or char_length(btrim(p_message))<10 or char_length(p_message)>4000 or octet_length(p_message)>16384
    or translate(p_message,E'\n\t','') ~ '[[:cntrl:]]'
  then raise exception 'SUPPORT_INVALID_INPUT' using errcode='22023'; end if;
  select u.email into email_address from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and u.deleted_at is null;
  if email_address is null or char_length(email_address)>320 or email_address ~ '[[:space:][:cntrl:]<>]'
    or email_address !~ '^[^@]+@[^@]+\.[^@]+$'
    or exists(select 1 from public.profiles p where p.id=p_user_id and p.is_suspended)
  then raise exception 'SUPPORT_ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
  if not p_reply_allowed then email_address:=null; end if;
  perform pg_advisory_xact_lock(hashtextextended('titan-support:'||p_user_id::text,0));
  select * into ticket from private.titan_support_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if ticket.category is distinct from p_category or ticket.message is distinct from p_message or ticket.reply_allowed is distinct from p_reply_allowed
    then raise exception 'SUPPORT_REQUEST_CONFLICT' using errcode='PT409'; end if;
  else
    if (select count(*) from private.titan_support_requests where user_id=p_user_id and created_at>now_at-interval '1 hour')>=3
    then raise exception 'SUPPORT_RATE_LIMIT' using errcode='PT429'; end if;
    insert into private.titan_support_requests(user_id,request_id,category,message,reply_email,reply_allowed) values(p_user_id,p_request_id,p_category,p_message,email_address,p_reply_allowed) returning * into ticket;
  end if;
  return jsonb_build_object('reference',ticket.reference,'notification',case when ticket.notification_state='sent' then 'sent' else 'pending' end);
end $function$;

create or replace function public.titan_support_claim_v300(p_user_id uuid,p_request_id uuid,p_lease_id uuid,p_from text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare ticket private.titan_support_requests%rowtype; now_at timestamptz:=clock_timestamp();
begin
  if p_lease_id is null or p_from is null or char_length(p_from)>320 or p_from ~ '[[:space:][:cntrl:]<>]' or p_from !~ '^[^@]+@[^@]+\.[^@]+$'
  then raise exception 'SUPPORT_INVALID_INPUT' using errcode='22023'; end if;
  select * into ticket from private.titan_support_requests where user_id=p_user_id and request_id=p_request_id for update;
  if not found then return jsonb_build_object('notification','pending'); end if;
  if ticket.notification_state='sent' then return jsonb_build_object('notification','sent'); end if;
  if (ticket.notification_lease_until is not null and ticket.notification_lease_until>now_at)
    or (ticket.notification_first_attempt_at is not null and ticket.notification_first_attempt_at<=now_at-interval '23 hours')
  then return jsonb_build_object('notification','pending'); end if;
  update private.titan_support_requests set notification_state='sending',notification_lease_id=p_lease_id,notification_lease_until=now_at+interval '120 seconds',
    notification_first_attempt_at=coalesce(notification_first_attempt_at,now_at),notification_from=coalesce(notification_from,p_from)
    where reference=ticket.reference returning * into ticket;
  return jsonb_build_object('notification','claimed','reference',ticket.reference,'category',ticket.category,'message',ticket.message,'reply_email',ticket.reply_email,'from',ticket.notification_from);
end $function$;

create or replace function public.titan_support_finish_v300(p_user_id uuid,p_request_id uuid,p_lease_id uuid,p_sent boolean,p_provider_id text)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare changed integer;
begin
  if p_sent is null or (p_sent and (p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,128}$'))
  then raise exception 'SUPPORT_INVALID_INPUT' using errcode='22023'; end if;
  update private.titan_support_requests set notification_state=case when p_sent then 'sent' else 'pending' end,
    notification_provider_id=case when p_sent then p_provider_id else null end,notification_sent_at=case when p_sent then clock_timestamp() else null end,
    notification_lease_id=null,notification_lease_until=null
    where user_id=p_user_id and request_id=p_request_id and notification_lease_id=p_lease_id and notification_state='sending';
  get diagnostics changed=row_count;
  return changed=1;
end $function$;

revoke all on function public.titan_support_accept_v300(uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.titan_support_claim_v300(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.titan_support_finish_v300(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.titan_support_accept_v300(uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.titan_support_claim_v300(uuid,uuid,uuid,text) to service_role;
grant execute on function public.titan_support_finish_v300(uuid,uuid,uuid,boolean,text) to service_role;
