-- CHEAT14 / CHEAT15: a suspicious session stays visible to its owner but can be excluded from rankings and
-- competitive rewards (training_logs.is_suspicious, already honoured by rankings, adventure and the public card)
-- while it is checked. The exclusion is never automatic: an administrator confirms it, gives a reason, it is audited,
-- and it is reversible. XP and credits already granted are NOT clawed back by this function.
--
-- Why the guard changes: since the v300 training guard, an administrator updating another player's session through the
-- control center fails with TRAINING_USER_MISMATCH (the guard demands new.user_id = auth.uid()), so the "Activités" tab
-- could no longer change is_suspicious. The exemption below is narrow and explicit: transaction-local marker set only by
-- titan_session_exclusion_v1, caller must be an administrator, and no column other than the review columns may differ.
-- The rest of the guard is byte-for-byte the v300 body. Additive and backward compatible; the caller owns the transaction.
-- Rollback: re-apply the titan_guard_training_log body of 20261005160000_ascension_progression_v300.sql, then
--   drop function public.titan_session_exclusion_v1(uuid, boolean, text);

create or replace function public.titan_guard_training_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_duration_min numeric;
  v_distance_km numeric;
  v_elevation_m numeric;
  v_gpx_points integer;
  v_hour_count integer;
  v_day_count integer;
  v_history_day_count integer;
  v_details_bytes integer;
  v_historical boolean;
begin
  -- Administrator-confirmed review (public.titan_session_exclusion_v1): the function sets a transaction-local marker,
  -- the caller must be an administrator, and ONLY the review columns may differ from the stored row. Any other change,
  -- or any other caller, falls through to the checks below unchanged.
  if TG_OP = 'UPDATE'
     and coalesce(current_setting('titan.admin_session_review', true), '') = 'on'
     and private.titan_is_admin(auth.uid())
     and (new.user_id, new.sport, new.category, new.unit, new.val, new.xp, new.date, new.details, new.archived_at, new.client_event_id, new.revision)
         is not distinct from
         (old.user_id, old.sport, old.category, old.unit, old.val, old.xp, old.date, old.details, old.archived_at, old.client_event_id, old.revision)
  then
    return new;
  end if;
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'TRAINING_USER_MISMATCH' using errcode = '42501';
  end if;

  new.sport := left(coalesce(new.sport, 'unknown'), 80);
  new.category := left(coalesce(new.category, 'training'), 80);
  new.unit := left(coalesce(new.unit, ''), 24);
  new.details := coalesce(new.details, '{}'::jsonb);
  new.date := coalesce(new.date, now());
  new.xp := coalesce(new.xp, 0);
  new.val := coalesce(new.val, 0);
  v_historical := coalesce(new.details ->> 'historical', 'false') = 'true' and new.xp = 0;

  v_payload := jsonb_build_object('operation', TG_OP, 'sport', new.sport, 'category', new.category, 'unit', new.unit,
    'val', new.val, 'xp', new.xp, 'date', new.date, 'details', new.details);

  v_details_bytes := octet_length(new.details::text);
  v_duration_min := coalesce(nullif(public.titan_jsonb_numeric(new.details, 'val2'), 0),
                             nullif(public.titan_jsonb_numeric(new.details, 'duration'), 0));
  v_distance_km := case when new.unit = 'km' then new.val else public.titan_jsonb_numeric(new.details, 'distance') end;
  v_elevation_m := coalesce(public.titan_jsonb_numeric(new.details, 'elevation'), 0);
  v_gpx_points := case when jsonb_typeof(new.details -> 'gpxPath') = 'array' then jsonb_array_length(new.details -> 'gpxPath') else 0 end;

  if new.val <= 0 or new.val > 300000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_VALUE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if new.xp < 0 or new.xp > 25000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'critical', 'TRAINING_XP_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if new.date > now() + interval '10 minutes' then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DATE_IN_FUTURE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_details_bytes > 50000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DETAILS_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_gpx_points > 1200 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_GPX_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_duration_min is not null and (v_duration_min <= 0 or v_duration_min > 1440) then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DURATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_distance_km is not null and v_distance_km > 300 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DISTANCE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_elevation_m > 12000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_ELEVATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;

  if TG_OP = 'INSERT' then
    if v_historical then
      select count(*) into v_history_day_count from public.training_logs
       where user_id = new.user_id and created_at >= now() - interval '24 hours'
         and coalesce(details ->> 'historical', 'false') = 'true';
      if v_history_day_count >= 300 then
        perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_HISTORY_IMPORT_LIMIT', v_payload);
        raise exception 'TRAINING_RATE_LIMIT' using errcode = '23514';
      end if;
    else
      select count(*) into v_hour_count from public.training_logs
       where user_id = new.user_id and created_at >= now() - interval '1 hour'
         and coalesce(details ->> 'historical', 'false') <> 'true';
      select count(*) into v_day_count from public.training_logs
       where user_id = new.user_id and created_at >= now() - interval '24 hours'
         and coalesce(details ->> 'historical', 'false') <> 'true';
      if v_hour_count >= 12 or v_day_count >= 40 then
        perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'critical', 'TRAINING_FREQUENCY_OUT_OF_RANGE',
          v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count));
        raise exception 'TRAINING_RATE_LIMIT' using errcode = '23514';
      elsif v_hour_count >= 6 or v_day_count >= 20 then
        perform public.titan_log_suspicious_action(new.user_id, 'training_log.flagged', 'medium', 'TRAINING_FREQUENCY_HIGH',
          v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count));
      end if;
    end if;
  end if;

  if new.xp > 10000 or (new.date < now() - interval '30 days' and not v_historical) then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.flagged', 'medium', 'TRAINING_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$;

create or replace function public.titan_session_exclusion_v1(p_session uuid, p_excluded boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_log record;
begin
  if p_excluded is null then
    raise exception 'EXCLUSION_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select id, user_id, is_suspicious, status into v_log from public.training_logs where id = p_session for update;
  if not found or v_log.user_id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_log.user_id = v_admin then
    raise exception 'CANNOT_MODERATE_SELF' using errcode = '42501';
  end if;
  if private.titan_is_admin(v_log.user_id) then
    raise exception 'CANNOT_MODERATE_ADMIN' using errcode = '42501';
  end if;
  if coalesce(v_log.is_suspicious, false) = p_excluded
     and (v_log.status not in ('valid', 'suspicious') or (v_log.status = 'suspicious') = p_excluded) then
    return jsonb_build_object('session', p_session, 'excluded', p_excluded, 'changed', false);
  end if;

  perform public.titan_admin_audit_write('session.exclusion', v_log.user_id,
    jsonb_build_object('session', p_session, 'excluded', p_excluded, 'reason', v_reason, 'previous', coalesce(v_log.is_suspicious, false)));

  perform set_config('titan.admin_session_review', 'on', true);
  update public.training_logs
     set is_suspicious = p_excluded,
         status = case when status in ('valid', 'suspicious') then (case when p_excluded then 'suspicious' else 'valid' end) else status end,
         admin_note = v_reason, reviewed_at = now(), reviewed_by = v_admin
   where id = p_session;
  perform set_config('titan.admin_session_review', '', true);

  return jsonb_build_object('session', p_session, 'excluded', p_excluded, 'changed', true);
end;
$function$;
revoke all on function public.titan_session_exclusion_v1(uuid, boolean, text) from public, anon;
grant execute on function public.titan_session_exclusion_v1(uuid, boolean, text) to authenticated;
