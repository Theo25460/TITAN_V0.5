-- V11-30: a web screen to see and revoke connected activity sources (LEG14: "révocation simple"). Revoking was only possible through
-- titan_set_source_consent_v1 from the app that imports; this adds the read side so the Profile screen can show, from any device, which
-- sources the account allowed, since when, how many sessions each brought, and offer to stop and to archive what a source brought.
-- Reads the caller's own rows only; a source never shown (no consent row) gives an empty list, so nothing appears on a web-only account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_sources_v1();

create or replace function public.titan_sources_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'source', c.source,
      'granted', c.revoked_at is null,
      'granted_at', c.granted_at,
      'revoked_at', c.revoked_at,
      'imported', (select count(*) from private.titan_imported_activities i join public.training_logs l on l.id = i.log_id
                    where i.user_id = v_uid and i.source = c.source and i.status = 'imported' and l.archived_at is null),
      'linked', (select count(*) from private.titan_imported_activities i where i.user_id = v_uid and i.source = c.source and i.status = 'linked'),
      'last_import_at', (select max(i.imported_at) from private.titan_imported_activities i where i.user_id = v_uid and i.source = c.source))
      order by c.source)
    from private.titan_source_consents c where c.user_id = v_uid), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_sources_v1() from public, anon;
grant execute on function public.titan_sources_v1() to authenticated;
