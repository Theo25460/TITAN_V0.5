-- Q-003 + SHOP15. Additive and backward compatible; no RPC signature, grant or client contract changes.
--
-- 1. Administrators can moderate another account through the audited admin RPC. The progression guard
--    refused every write whose target was not the caller (PROFILE_USER_MISMATCH), so
--    titan_admin_update_profile_v1, used by js/admin.js, could not suspend or edit any other profile.
--    Only administrators (private.titan_is_admin: role admin or super_admin, read from the profile, never
--    from client metadata) are exempted from that single comparison. Every other check of the guard
--    (credit and level bounds, jumps, state size, name and avatar cleanup) still applies to them, and
--    row-level security still decides which rows a direct client request can reach.
-- 2. A cosmetic can be bought once. The purchase function already refuses a second purchase under a row
--    lock; this unique index makes the database refuse it from any writer. It is limited to cosmetic
--    purchases so the older repeatable purchases (one duplicate pair in production at preflight) stay valid.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: docs/CDC_WEB_PURCHASE_MODERATION_HANDOFF_2026-10-19.md.

create or replace function public.titan_guard_profile_progression()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload jsonb;
  v_credit_delta integer;
  v_level_delta integer;
  v_state_bytes integer;
begin
  if auth.uid() is not null and new.id <> auth.uid() and not private.titan_is_admin(auth.uid()) then
    raise exception 'PROFILE_USER_MISMATCH' using errcode = '42501';
  end if;

  new.credits := coalesce(new.credits, old.credits, 0);
  new.level := coalesce(new.level, old.level, 1);
  new.game_state := coalesce(new.game_state, old.game_state, '{}'::jsonb);
  new.username := nullif(left(trim(regexp_replace(coalesce(new.username, old.username, 'Agent'), '[[:cntrl:]<>]', '', 'g')), 24), '');
  if new.username is null then
    new.username := 'Agent';
  end if;
  if new.avatar is not null and new.avatar !~* '^avatar_[0-9]+\.png$' then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_AVATAR_INVALID', jsonb_build_object('avatar', new.avatar));
    new.avatar := old.avatar;
  end if;
  v_credit_delta := new.credits - coalesce(old.credits, 0);
  v_level_delta := new.level - coalesce(old.level, 1);
  v_state_bytes := octet_length(new.game_state::text);

  v_payload := jsonb_build_object(
    'profileId', new.id,
    'oldCredits', old.credits,
    'newCredits', new.credits,
    'creditDelta', v_credit_delta,
    'oldLevel', old.level,
    'newLevel', new.level,
    'levelDelta', v_level_delta,
    'gameStateBytes', v_state_bytes
  );

  if new.credits < 0 or new.credits > 100000000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_CREDITS_OUT_OF_RANGE', v_payload);
    return old;
  end if;

  if new.level < 1 or new.level > 500 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_LEVEL_OUT_OF_RANGE', v_payload);
    return old;
  end if;

  if v_state_bytes > 500000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_GAME_STATE_TOO_LARGE', v_payload);
    return old;
  end if;

  if v_credit_delta > 50000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_CREDITS_JUMP', v_payload);
    return old;
  end if;

  if v_level_delta > 10 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_LEVEL_JUMP', v_payload);
    return old;
  end if;

  if v_credit_delta > 15000 or v_level_delta > 3 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_PROGRESS_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$;

do $$
declare previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if to_regclass('public.shop_history') is not null and not exists (
    select 1 from pg_indexes where schemaname = 'public' and tablename = 'shop_history'
      and indexname = 'shop_history_cosmetic_once_idx') then
    -- Fails, and changes nothing, if a cosmetic was ever bought twice.
    create unique index shop_history_cosmetic_once_idx on public.shop_history (user_id, item_id)
      where economy_meta ->> 'type' = 'cosmetic';
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;
