-- CHEAT17 / SEC05 (V1 web): the last writes a player can repeat without any cost had no ceiling, and shop_history accepted any amount.
--   public card saves 60/h and look (appearance) changes 60/h, per account, in the same server-side counter as guilds and purchases
--   (private.titan_rate_limit: RATE_LIMITED, SQLSTATE PT429, a signal at 75 %). A limit sits on the TABLE write (BEFORE trigger) so no
--   function body is rewritten and a direct write is covered too. Only an authenticated session is limited; service role, billing
--   worker, administration and writes made by another trigger or a cascade are never throttled.
--   An honest player changes their look or card a handful of times a day: the ceilings only stop scripts. None of these writes grants
--   XP, credits or any advantage.
--   shop_history amounts can no longer be negative: added NOT VALID then validated (production holds 5 rows, none negative, checked read-only
--   on 21/10/2026; a violating row would stop the migration before anything is changed, never be rewritten).
-- Additive and backward compatible. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop trigger titan_rate_limit_public_cards on public.titan_public_cards; drop trigger titan_rate_limit_profile_appearance on
-- public.profiles; drop function private.titan_rate_limit_surface_trigger(); alter table public.shop_history drop constraint shop_history_amounts_check;

create or replace function private.titan_rate_limit_surface_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or pg_trigger_depth() > 1 then return new; end if;
  if TG_TABLE_NAME = 'titan_public_cards' then
    -- An upsert fires the INSERT trigger and then, on conflict, the UPDATE trigger: count it once, on the UPDATE.
    if new.user_id = v_uid and not (TG_OP = 'INSERT' and exists (select 1 from public.titan_public_cards c where c.user_id = new.user_id)) then
      perform private.titan_rate_limit(v_uid, 'public_card', 60);
    end if;
  elsif TG_TABLE_NAME = 'profiles' then
    if new.id = v_uid and new.appearance is distinct from old.appearance then perform private.titan_rate_limit(v_uid, 'appearance', 60); end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.titan_rate_limit_surface_trigger() from public, anon, authenticated;

do $$
declare
  previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if to_regclass('public.titan_public_cards') is not null and not exists (select 1 from pg_trigger where tgname = 'titan_rate_limit_public_cards') then
    create trigger titan_rate_limit_public_cards before insert or update on public.titan_public_cards
      for each row execute function private.titan_rate_limit_surface_trigger();
  end if;
  if to_regclass('public.profiles') is not null and not exists (select 1 from pg_trigger where tgname = 'titan_rate_limit_profile_appearance') then
    create trigger titan_rate_limit_profile_appearance before update of appearance on public.profiles
      for each row execute function private.titan_rate_limit_surface_trigger();
  end if;
  if to_regclass('public.shop_history') is not null and not exists (
       select 1 from pg_constraint where conname = 'shop_history_amounts_check' and conrelid = 'public.shop_history'::regclass) then
    alter table public.shop_history add constraint shop_history_amounts_check check (cost_credits >= 0 and reward_credits >= 0) not valid;
    alter table public.shop_history validate constraint shop_history_amounts_check;
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;
