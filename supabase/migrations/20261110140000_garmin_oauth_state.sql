-- One active, short-lived Garmin authorization attempt per TITAN account. The nonce is stored as a digest.
create table if not exists private.titan_garmin_oauth_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nonce_hash bytea not null check (octet_length(nonce_hash) = 32),
  consent_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table private.titan_garmin_oauth_attempts enable row level security;
revoke all on private.titan_garmin_oauth_attempts from public, anon, authenticated, service_role;

create or replace function public.titan_garmin_oauth_start_v1(p_user uuid, p_nonce_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_consent_at timestamptz;
begin
  select c.granted_at into v_consent_at
  from private.titan_source_consents c join public.profiles p on p.id = c.user_id
  where c.user_id = p_user and c.source = 'garmin' and c.revoked_at is null
    and not coalesce(p.is_suspended,false)
  for share of c;
  if not found then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(p_user, 'garmin_oauth_start', 30);
  insert into private.titan_garmin_oauth_attempts(user_id, nonce_hash, consent_at, expires_at)
  values (p_user, decode(p_nonce_hash,'hex'), v_consent_at, statement_timestamp() + interval '10 minutes')
  on conflict (user_id) do update set nonce_hash = excluded.nonce_hash, consent_at = excluded.consent_at,
    expires_at = excluded.expires_at, consumed_at = null;
  return true;
end $$;

create or replace function public.titan_garmin_oauth_consume_v1(p_user uuid, p_nonce_hash text)
returns boolean language sql security definer set search_path = '' as $$
  with claimed as (
    update private.titan_garmin_oauth_attempts a set consumed_at = statement_timestamp()
    from private.titan_source_consents c, public.profiles p
    where a.user_id = p_user and a.nonce_hash = decode(p_nonce_hash,'hex') and a.consumed_at is null
      and a.expires_at > statement_timestamp()
      and c.user_id = a.user_id and c.source = 'garmin' and c.granted_at = a.consent_at and c.revoked_at is null
      and p.id = a.user_id and not coalesce(p.is_suspended,false)
    returning a.user_id
  ) select exists(select 1 from claimed);
$$;

create or replace function public.titan_garmin_oauth_link_v1(
  p_user uuid, p_nonce_hash text, p_garmin_user text, p_access_enc text, p_refresh_enc text, p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_consent_at timestamptz; v_previous_garmin_user text; v_link jsonb;
begin
  select c.granted_at into v_consent_at
  from private.titan_source_consents c join public.profiles p on p.id = c.user_id
  where c.user_id = p_user and c.source = 'garmin' and c.revoked_at is null
    and not coalesce(p.is_suspended,false)
  for share of c;
  if not found then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;

  delete from private.titan_garmin_oauth_attempts
  where user_id = p_user and nonce_hash = decode(p_nonce_hash,'hex') and consent_at = v_consent_at
    and expires_at > statement_timestamp() and consumed_at is not null;
  if not found then raise exception 'GARMIN_STATE_INVALID' using errcode = '42501'; end if;

  select g.garmin_user_id into v_previous_garmin_user from private.titan_garmin_links g where g.user_id = p_user;
  v_link := public.titan_garmin_link_v1(p_user, p_garmin_user);
  if v_previous_garmin_user is distinct from p_garmin_user then
    delete from private.titan_garmin_tokens where user_id = p_user;
  end if;
  perform public.titan_garmin_tokens_set_v1(p_user, p_access_enc, p_refresh_enc, p_expires_at);
  return v_link;
end $$;

-- A withdrawal cancels pending attempts even if a new grant follows in the same transaction.
create or replace function private.titan_garmin_cancel_oauth_on_withdrawal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from private.titan_garmin_oauth_attempts where user_id = new.user_id;
  return new;
end $$;
drop trigger if exists titan_garmin_cancel_oauth_on_withdrawal on private.titan_source_consents;
create trigger titan_garmin_cancel_oauth_on_withdrawal after update of revoked_at on private.titan_source_consents
  for each row when (new.source = 'garmin' and new.revoked_at is not null)
  execute function private.titan_garmin_cancel_oauth_on_withdrawal();

revoke all on function private.titan_garmin_cancel_oauth_on_withdrawal() from public, anon, authenticated;
revoke all on function public.titan_garmin_oauth_start_v1(uuid,text),
  public.titan_garmin_oauth_consume_v1(uuid,text),
  public.titan_garmin_oauth_link_v1(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.titan_garmin_oauth_start_v1(uuid,text),
  public.titan_garmin_oauth_consume_v1(uuid,text),
  public.titan_garmin_oauth_link_v1(uuid,text,text,text,text,timestamptz) to service_role;

-- The OAuth and withdrawal paths acquire consent before the link. Existing callers keep their RPCs and grants.
create or replace function public.titan_garmin_unlink_for_v1(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update private.titan_source_consents set revoked_at = now()
  where user_id = p_user and source = 'garmin' and revoked_at is null;
  update private.titan_garmin_links set revoked_at = now() where user_id = p_user and revoked_at is null;
  return jsonb_build_object('linked', false);
end $$;

create or replace function public.titan_garmin_unlink_v1()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'garmin_unlink', 30);
  return public.titan_garmin_unlink_for_v1(v_uid);
end $$;

create or replace function public.titan_garmin_deregister_v1(p_garmin_user text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if p_garmin_user is null or p_garmin_user !~ '^[A-Za-z0-9_-]{1,128}$' then return 0; end if;
  select user_id into v_uid from private.titan_garmin_links
  where garmin_user_id = p_garmin_user and revoked_at is null;
  if not found then return 0; end if;

  perform 1 from private.titan_source_consents where user_id = v_uid and source = 'garmin' for update;
  update private.titan_garmin_links set revoked_at = now()
  where user_id = v_uid and garmin_user_id = p_garmin_user and revoked_at is null;
  if not found then return 0; end if;
  update private.titan_source_consents set revoked_at = now()
  where user_id = v_uid and source = 'garmin' and revoked_at is null;
  return 1;
end $$;
