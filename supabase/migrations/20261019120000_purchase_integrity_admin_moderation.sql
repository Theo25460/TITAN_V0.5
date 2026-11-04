-- Q-003 + SHOP15. Additive and backward compatible; no RPC signature, grant or client contract changes.
--
-- 1. Administrators can moderate another account through the audited admin RPC. The progression guard
--    refused every write whose target was not the caller (PROFILE_USER_MISMATCH), so
--    titan_admin_update_profile_v1, used by js/admin.js, could not suspend or edit any other profile.
--    The exemption is narrow: it needs BOTH a transaction-local marker set only by that RPC (and cleared
--    when it returns) AND an administrator (private.titan_is_admin: role admin or super_admin read from the
--    profile, never from client metadata). A direct write by an administrator to another profile is still
--    refused, so the RPC remains the only route. When the exemption is used, a progression check that would
--    silently revert the row now raises PROFILE_UPDATE_REJECTED, so the administrator and the audit trail
--    never report an action that did not happen. Every check is otherwise unchanged.
-- 2. A cosmetic can be bought once. The purchase function already refuses a second purchase under a row
--    lock; this unique index makes the database refuse it from any writer. It covers every purchase of a
--    cosmetic identifier (all catalogue cosmetics start with 'cos_'), whatever metadata the writer sets, and
--    leaves the older repeatable purchases (one duplicate pair in production at preflight, none of them
--    cosmetics) untouched. The migration fails, changing nothing, if a cosmetic was ever bought twice.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: docs/CDC_WEB_PURCHASE_MODERATION_HANDOFF_2026-10-19.md (section "Retour arrière").

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
  v_admin_rpc boolean := false;
begin
  if auth.uid() is not null and new.id <> auth.uid() then
    v_admin_rpc := coalesce(current_setting('titan.admin_profile_write', true), '') = 'on'
      and private.titan_is_admin(auth.uid());
    if not v_admin_rpc then
      raise exception 'PROFILE_USER_MISMATCH' using errcode = '42501';
    end if;
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
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_CREDITS_OUT_OF_RANGE'; end if;
    return old;
  end if;

  if new.level < 1 or new.level > 500 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_LEVEL_OUT_OF_RANGE', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_LEVEL_OUT_OF_RANGE'; end if;
    return old;
  end if;

  if v_state_bytes > 500000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_GAME_STATE_TOO_LARGE', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_GAME_STATE_TOO_LARGE'; end if;
    return old;
  end if;

  if v_credit_delta > 50000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_CREDITS_JUMP', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_CREDITS_JUMP'; end if;
    return old;
  end if;

  if v_level_delta > 10 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_LEVEL_JUMP', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_LEVEL_JUMP'; end if;
    return old;
  end if;

  if v_credit_delta > 15000 or v_level_delta > 3 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_PROGRESS_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$;

-- The only caller allowed to rely on the exemption above. Same signature, invoker mode and grants as before.
create or replace function public.titan_admin_update_profile_v1(p_user_id uuid, p_patch jsonb, p_reason text default null)
returns jsonb
language plpgsql
set search_path to 'public', 'private'
as $function$
declare
  v_result jsonb;
begin
  perform set_config('titan.admin_profile_write', 'on', true);
  v_result := private.titan_admin_update_profile_v1(p_user_id, p_patch, p_reason);
  perform set_config('titan.admin_profile_write', '', true);
  return v_result;
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
      where item_id like 'cos\_%';
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;
