-- V11-11 (V1.1): the per-session distance ceiling of the training guard moves from 300 km to 1000 km (ultra-distance), with two companion
-- checks so the wider bound does not widen the door: beyond 300 km a duration is required, and an average speed above 200 km/h
-- (5 minutes or more) is refused as implausible. Everything else of the function is the definition in force (migration
-- 20261019210000_session_exclusion), unchanged: same security definer, same search_path, same other bounds, same rate limits.
-- XP stays time-based and capped by the server (1800/day, 9600/week), so a long distance buys no extra XP; records and the explainable
-- risk score still judge pace. Rejections are logged as suspicious actions like the other bounds.
-- Rollback: re-apply the definition of public.titan_guard_training_log from 20261019210000_session_exclusion.sql.
-- The caller owns the transaction: never BEGIN/COMMIT here.
CREATE OR REPLACE FUNCTION public.titan_guard_training_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- V11-11: ultra-distance is a real thing. A single session may now reach 1000 km, but beyond 300 km its duration must be declared,
  -- and an average speed no human-powered or ordinary sport session reaches (above 200 km/h over 5 minutes or more) is refused.
  if v_distance_km is not null and v_distance_km > 1000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DISTANCE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_distance_km is not null and v_distance_km > 300 and v_duration_min is null then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_ULTRA_DURATION_REQUIRED', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode = '23514';
  end if;
  if v_distance_km is not null and v_distance_km > 0 and v_duration_min is not null and v_duration_min >= 5
     and v_distance_km / (v_duration_min / 60.0) > 200 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_SPEED_IMPLAUSIBLE', v_payload);
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
