-- V11-40 / GAR-06 / GAR-12: the Garmin tokens of a linked player, kept ONLY as ciphertext, so that "Déconnecter" can also withdraw TITAN at Garmin
-- (DELETE user/registration) and so that the access can be renewed. The database never sees a clear token: the Netlify function seals each token
-- with a key that lives only in the server environment (GARMIN_TOKEN_KEY), bound to the account id, before writing it here. The table has no API
-- grant; the three functions are reserved to the service role. Any end of the link (unlink, Garmin deregistration, consent withdrawal, account
-- deletion) erases the tokens through one trigger on the link table.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop trigger titan_garmin_links_erase_tokens on private.titan_garmin_links; drop function private.titan_garmin_erase_tokens(),
-- public.titan_garmin_tokens_set_v1(uuid,text,text,timestamptz), public.titan_garmin_tokens_get_v1(uuid), public.titan_garmin_unlink_for_v1(uuid);
-- drop table private.titan_garmin_tokens;

create table if not exists private.titan_garmin_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_enc text not null check (length(access_enc) between 16 and 8192),
  refresh_enc text check (refresh_enc is null or length(refresh_enc) between 16 and 8192),
  access_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.titan_garmin_tokens enable row level security;
revoke all on private.titan_garmin_tokens from public, anon, authenticated;

create or replace function private.titan_garmin_erase_tokens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.revoked_at is not null then
    delete from private.titan_garmin_tokens where user_id = new.user_id;
  end if;
  return new;
end;
$function$;
revoke all on function private.titan_garmin_erase_tokens() from public, anon, authenticated;

drop trigger if exists titan_garmin_links_erase_tokens on private.titan_garmin_links;
create trigger titan_garmin_links_erase_tokens after update of revoked_at on private.titan_garmin_links
  for each row execute function private.titan_garmin_erase_tokens();

create or replace function public.titan_garmin_tokens_set_v1(p_user uuid, p_access_enc text, p_refresh_enc text, p_expires_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists (select 1 from private.titan_garmin_links g where g.user_id = p_user and g.revoked_at is null) then
    raise exception 'NOT_LINKED' using errcode = '42501';
  end if;
  insert into private.titan_garmin_tokens as t (user_id, access_enc, refresh_enc, access_expires_at, updated_at)
  values (p_user, p_access_enc, p_refresh_enc, p_expires_at, now())
  on conflict (user_id) do update
    set access_enc = excluded.access_enc, refresh_enc = coalesce(excluded.refresh_enc, t.refresh_enc),
        access_expires_at = excluded.access_expires_at, updated_at = now();
  return jsonb_build_object('stored', true);
end;
$function$;

create or replace function public.titan_garmin_tokens_get_v1(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select to_jsonb(t) - 'user_id' - 'updated_at'
    from private.titan_garmin_tokens t
    join private.titan_garmin_links g on g.user_id = t.user_id and g.revoked_at is null
   where t.user_id = p_user;
$function$;

-- The server ends the link for an account (the player pressed "Déconnecter" and the function has already tried to withdraw TITAN at Garmin).
create or replace function public.titan_garmin_unlink_for_v1(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  update private.titan_garmin_links set revoked_at = now() where user_id = p_user and revoked_at is null;
  update private.titan_source_consents set revoked_at = now() where user_id = p_user and source = 'garmin' and revoked_at is null;
  return jsonb_build_object('linked', false);
end;
$function$;

revoke all on function public.titan_garmin_tokens_set_v1(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.titan_garmin_tokens_get_v1(uuid) from public, anon, authenticated;
revoke all on function public.titan_garmin_unlink_for_v1(uuid) from public, anon, authenticated;
grant execute on function public.titan_garmin_tokens_set_v1(uuid, text, text, timestamptz) to service_role;
grant execute on function public.titan_garmin_tokens_get_v1(uuid) to service_role;
grant execute on function public.titan_garmin_unlink_for_v1(uuid) to service_role;
