-- Optional Garmin Health consent. Existing activity links and old app clients never inherit it.
alter table private.titan_garmin_links add column if not exists dailies_authorized_at timestamptz;
alter table private.titan_journey_verified_days add column if not exists provider_period_end timestamptz;
alter table private.titan_garmin_oauth_attempts add column if not exists dailies_provider_hash bytea;

-- A new OAuth attempt never retains the provider identity bound to an earlier nonce.
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
    expires_at = excluded.expires_at, consumed_at = null, dailies_provider_hash = null;
  return true;
end $$;

-- Bind the provider before reading permissions so a concurrent HEALTH_EXPORT withdrawal can cancel the attempt.
create or replace function public.titan_garmin_oauth_bind_dailies_v1(p_user uuid, p_nonce_hash text, p_garmin_user text)
returns boolean language sql security definer set search_path = '' as $$
  with bound as (
    update private.titan_garmin_oauth_attempts set dailies_provider_hash = sha256(convert_to(p_garmin_user, 'UTF8'))
    where user_id = p_user and nonce_hash = decode(p_nonce_hash,'hex') and consumed_at is not null
      and expires_at > statement_timestamp() and dailies_provider_hash is null
      and p_garmin_user ~ '^[A-Za-z0-9_-]{1,128}$'
    returning user_id
  ) select exists(select 1 from bound);
$$;

create or replace function private.titan_garmin_clear_dailies_authorization()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.dailies_authorized_at := null;
  return new;
end $$;
revoke all on function private.titan_garmin_clear_dailies_authorization() from public, anon, authenticated, service_role;
drop trigger if exists titan_garmin_clear_dailies_authorization on private.titan_garmin_links;
create trigger titan_garmin_clear_dailies_authorization
  before update of garmin_user_id, linked_at, revoked_at on private.titan_garmin_links
  for each row execute function private.titan_garmin_clear_dailies_authorization();

-- Called only after the function checked the user's explicit request and Garmin's HEALTH_EXPORT grant.
create or replace function public.titan_garmin_oauth_link_dailies_v1(
  p_user uuid, p_nonce_hash text, p_garmin_user text, p_access_enc text, p_refresh_enc text, p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_link jsonb;
begin
  perform 1 from private.titan_source_consents where user_id = p_user and source = 'garmin' and revoked_at is null for share;
  if not found then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  perform 1 from private.titan_garmin_oauth_attempts
    where user_id = p_user and nonce_hash = decode(p_nonce_hash,'hex')
      and dailies_provider_hash = sha256(convert_to(p_garmin_user, 'UTF8'))
    for update;
  if not found then raise exception 'GARMIN_STATE_INVALID' using errcode = '42501'; end if;
  v_link := public.titan_garmin_oauth_link_v1(p_user, p_nonce_hash, p_garmin_user, p_access_enc, p_refresh_enc, p_expires_at);
  if v_link->>'linked' = 'true' then
    update private.titan_garmin_links set dailies_authorized_at = statement_timestamp()
    where user_id = p_user and garmin_user_id = p_garmin_user and revoked_at is null;
  end if;
  return v_link;
end $$;

create or replace function public.titan_garmin_revoke_dailies_v1(p_garmin_user text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.titan_garmin_oauth_attempts
    where dailies_provider_hash = sha256(convert_to(p_garmin_user, 'UTF8'));
  update private.titan_garmin_links set dailies_authorized_at = null
    where garmin_user_id = p_garmin_user and revoked_at is null and dailies_authorized_at is not null;
end $$;

-- The webhook verifies the dedicated credential and strips everything but the provider identity,
-- local date, coverage and step count. Recheck ownership and consent at write time, in lock order.
create or replace function public.titan_garmin_ingest_dailies_v1(p_dailies jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_summary record;
  v_owner uuid;
  v_consent_at timestamptz;
  v_authorized_at timestamptz;
  v_period_end timestamptz;
  v_now timestamptz := statement_timestamp();
  v_today date := (v_now at time zone 'UTC')::date;
  v_changed integer := 0;
begin
  if jsonb_typeof(p_dailies) is distinct from 'array' then
    raise exception 'GARMIN_DAILIES_INVALID' using errcode = '22023';
  end if;
  if jsonb_array_length(p_dailies) > 100 then
    raise exception 'GARMIN_DAILIES_INVALID' using errcode = '22023';
  end if;
  for v_summary in
    select * from jsonb_to_recordset(p_dailies)
      as s(provider_user text, day date, steps integer, started_at timestamptz, duration_seconds integer)
    order by s.provider_user, s.day, s.started_at, s.duration_seconds, s.steps
  loop
    if v_summary.provider_user is null or v_summary.provider_user !~ '^[A-Za-z0-9_-]{1,128}$'
       or v_summary.day is null or v_summary.day not between v_today-400 and v_today+1
       or v_summary.steps is null or v_summary.steps not between 0 and 200000
       or v_summary.started_at is null or v_summary.started_at not between v_now-interval '401 days' and v_now
       or v_summary.duration_seconds is null or v_summary.duration_seconds not between 1 and 90000 then continue;
    end if;
    if abs(v_summary.day - (v_summary.started_at at time zone 'UTC')::date) > 1 then continue; end if;
    v_period_end := v_summary.started_at + v_summary.duration_seconds * interval '1 second';
    if v_period_end > v_now + interval '5 minutes' then continue; end if;

    select g.user_id into v_owner from private.titan_garmin_links g
    where g.garmin_user_id = v_summary.provider_user and g.revoked_at is null;
    if not found then continue; end if;
    select c.granted_at into v_consent_at from private.titan_source_consents c
    where c.user_id = v_owner and c.source = 'garmin' and c.revoked_at is null
    for share of c;
    if not found or v_summary.started_at < v_consent_at then continue; end if;
    select g.dailies_authorized_at into v_authorized_at from private.titan_garmin_links g
    join public.profiles p on p.id = g.user_id
    where g.user_id = v_owner and g.garmin_user_id = v_summary.provider_user and g.revoked_at is null
      and g.dailies_authorized_at is not null and not coalesce(p.is_suspended, false)
    for share of g;
    if not found or v_summary.started_at < v_authorized_at then continue; end if;

    insert into private.titan_journey_verified_days as d (user_id,source,provider_identity_hash,day,steps,provider_period_end)
    values (v_owner,'garmin',sha256(convert_to(v_owner::text||':'||v_summary.provider_user,'UTF8')),v_summary.day,v_summary.steps,v_period_end)
    on conflict (user_id,source,provider_identity_hash,day) do update
      set steps = excluded.steps, provider_period_end = excluded.provider_period_end, attested_at = excluded.attested_at
      where d.provider_period_end is null or d.provider_period_end < excluded.provider_period_end
        or (d.provider_period_end = excluded.provider_period_end and excluded.steps < d.steps);
    if found then v_changed := v_changed+1; end if;
  end loop;
  return v_changed;
end $$;

revoke all on function public.titan_garmin_oauth_link_dailies_v1(uuid,text,text,text,text,timestamptz),
  public.titan_garmin_oauth_bind_dailies_v1(uuid,text,text), public.titan_garmin_revoke_dailies_v1(text),
  public.titan_garmin_ingest_dailies_v1(jsonb) from public, anon, authenticated;
grant execute on function public.titan_garmin_oauth_link_dailies_v1(uuid,text,text,text,text,timestamptz),
  public.titan_garmin_oauth_bind_dailies_v1(uuid,text,text), public.titan_garmin_revoke_dailies_v1(text),
  public.titan_garmin_ingest_dailies_v1(jsonb) to service_role;

create or replace function public.titan_garmin_status_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  g private.titan_garmin_links%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into g from private.titan_garmin_links where user_id = v_uid and revoked_at is null;
  if not found then return jsonb_build_object('linked', false); end if;
  return jsonb_build_object('linked', true, 'linked_at', g.linked_at, 'last_event_at', g.last_event_at,
    'dailies_authorized', g.dailies_authorized_at is not null);
end $$;

create or replace function private.titan_journey_days_v1()
returns table(day date,steps bigint,sources jsonb,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select d.day,max(d.steps)::bigint,jsonb_agg(d.source order by d.source),max(d.attested_at)
 from private.titan_journey_verified_days d
 join private.titan_source_consents c on c.user_id=d.user_id and c.source=d.source
 cross join private.titan_journey_configs cfg
 where cfg.active and d.user_id=auth.uid() and d.source=any(cfg.allowed_sources)
   and c.revoked_at is null and isfinite(c.granted_at) and c.granted_at<=statement_timestamp()
   and d.steps between 0 and cfg.daily_cap
   and d.day<=(statement_timestamp() at time zone 'UTC')::date
   and isfinite(d.attested_at) and d.attested_at<=statement_timestamp()
   and d.day between (d.attested_at at time zone 'UTC')::date-400 and
      (d.attested_at at time zone 'UTC')::date + case when d.provider_period_end is null then 0 else 1 end
   and exists(select 1 from private.titan_garmin_links g
    where g.user_id=d.user_id and g.revoked_at is null
      and isfinite(g.linked_at) and g.linked_at<=statement_timestamp()
      and (d.provider_period_end is null or g.dailies_authorized_at is not null)
      and d.provider_identity_hash=sha256(convert_to(g.user_id::text||':'||g.garmin_user_id,'UTF8')))
 group by d.day;
$$;

notify pgrst, 'reload schema';
