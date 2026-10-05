-- Payment lifecycle fields are written only by the billing backend.
-- Preserve the existing administrator-controlled is_elite workflow.
create or replace function private.titan_guard_billing_fields()
returns trigger language plpgsql security invoker set search_path=''
as $$
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
$$;
revoke all on function private.titan_guard_billing_fields() from public,anon,authenticated;
drop trigger if exists titan_guard_billing_fields on public.profiles;
create trigger titan_guard_billing_fields before update on public.profiles
for each row execute function private.titan_guard_billing_fields();
