-- AUD-43 (lot « irremplaçable », 15/11/2026): bring one's whole sporting past into TITAN — the activities.csv of a Strava data export
-- (or any list of past sessions) — so that Rétros, memories, the record book and « toi contre toi » work from day one. Moving one's
-- history IN is the strongest reason to stay: it is the history that cannot be copied.
-- Rules, all on the server:
--   * history only: a session must be older than 30 days; it enters the journal through the usual titan_submit_training_session,
--     which records it as history (no XP, no credit, no adventure contribution) — so an import can never farm rewards;
--   * provenance in the private import table with the new source 'archive' (never in the client's details), one row per external id:
--     the same file imported twice adds nothing; a session overlapping one already in the journal (any source) is linked, not doubled;
--   * at most 50 items per call; the existing training trigger caps history at 300 sessions an hour and a day, after which the call
--     stops cleanly and says how many items remain (« reprends demain »); 30 calls an hour;
--   * same validation as the other imports (known sport, 1 to 1440 minutes, distance up to 1000 km, date after 1990); suspended accounts
--     refused. Imported sessions can be archived together with titan_archive_imported_v1('archive') like other sources.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_import_history_v1(jsonb); restore the source check of private.titan_imported_activities to
-- ('health_connect', 'garmin') after deleting its 'archive' rows.

do $$
declare
  previous_lock_timeout text := current_setting('lock_timeout');
  c record;
begin
  perform set_config('lock_timeout', '5s', true);
  for c in select con.conname from pg_constraint con
            where con.conrelid = 'private.titan_imported_activities'::regclass and con.contype = 'c'
              and pg_get_constraintdef(con.oid) like '%source%health_connect%' and pg_get_constraintdef(con.oid) not like '%archive%'
  loop
    execute format('alter table private.titan_imported_activities drop constraint %I', c.conname);
    execute format('alter table private.titan_imported_activities add constraint %I check (source in (''health_connect'', ''garmin'', ''archive''))', c.conname);
  end loop;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

create or replace function public.titan_import_history_v1(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_started timestamptz;
  v_minutes numeric;
  v_km numeric;
  v_sport text;
  v_id text;
  v_res jsonb;
  v_imported integer := 0;
  v_linked integer := 0;
  v_duplicate integer := 0;
  v_skipped integer := 0;
  v_done integer := 0;
  v_limited boolean := false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'IMPORT_BATCH_INVALID' using errcode = '22023';
  end if;
  perform 1 from public.profiles p where p.id = v_uid and not coalesce(p.is_suspended, false);
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'history_import', 30);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := v_item ->> 'id';
    v_sport := v_item ->> 'sport';
    begin
      v_started := (v_item ->> 'startedAt')::timestamptz;
      v_minutes := round((v_item ->> 'minutes')::numeric, 1);
      v_km := nullif(round(coalesce((v_item ->> 'km')::numeric, 0), 2), 0);
    exception when others then
      v_skipped := v_skipped + 1; v_done := v_done + 1; continue;
    end;
    -- Only history, valid values and known sports; anything else is skipped, never guessed.
    if v_id is null or v_id !~ '^[A-Za-z0-9_.:-]{1,128}$' or v_started is null or v_started > now() - interval '30 days' or v_started < timestamptz '1990-01-01'
       or v_minutes is null or v_minutes < 1 or v_minutes > 1440 or (v_km is not null and (v_km <= 0 or v_km > 1000))
       or not exists (select 1 from public.sports s where s.id = v_sport and coalesce(s.is_active, true)) then
      v_skipped := v_skipped + 1; v_done := v_done + 1; continue;
    end if;
    begin
      v_res := private.titan_import_core(v_uid, 'archive', v_id, v_sport, v_started, v_minutes, v_km);
    exception
      when sqlstate '23514' then
        if sqlerrm = 'TRAINING_RATE_LIMIT' then v_limited := true; exit; end if;
        v_skipped := v_skipped + 1; v_done := v_done + 1; continue;
      when sqlstate '55P03' then
        -- A session of the journal is being modified elsewhere: skip this one, the next import will catch it.
        v_skipped := v_skipped + 1; v_done := v_done + 1; continue;
    end;
    case v_res ->> 'status'
      when 'imported' then v_imported := v_imported + 1;
      when 'linked' then v_linked := v_linked + 1;
      else v_duplicate := v_duplicate + 1;
    end case;
    v_done := v_done + 1;
  end loop;

  return jsonb_build_object('imported', v_imported, 'linked', v_linked, 'duplicate', v_duplicate, 'skipped', v_skipped,
    'done', v_done, 'remaining', jsonb_array_length(p_items) - v_done, 'limited', v_limited);
end;
$function$;

revoke all on function public.titan_import_history_v1(jsonb) from public, anon;
grant execute on function public.titan_import_history_v1(jsonb) to authenticated;
