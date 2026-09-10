begin;

-- TITAN OS - Suspended account action guards.
-- Purpose: a suspended profile cannot create gameplay/social/chat rows even if a legacy path still exists.
-- Safe to rerun.

alter table if exists public.profiles
  add column if not exists is_suspended boolean not null default false;

create or replace function public.titan_reject_suspended_user_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_suspended boolean := false;
begin
  if v_uid is null then
    return new;
  end if;

  select coalesce(p.is_suspended, false)
  into v_suspended
  from public.profiles p
  where p.id = v_uid;

  if coalesce(v_suspended, false) is true then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.titan_reject_suspended_user_action() from public;

do $$
begin
  if to_regclass('public.training_logs') is not null then
    drop trigger if exists titan_training_logs_reject_suspended on public.training_logs;
    create trigger titan_training_logs_reject_suspended
    before insert on public.training_logs
    for each row execute function public.titan_reject_suspended_user_action();
  end if;

  if to_regclass('public.messages') is not null then
    drop trigger if exists titan_messages_reject_suspended on public.messages;
    create trigger titan_messages_reject_suspended
    before insert on public.messages
    for each row execute function public.titan_reject_suspended_user_action();
  end if;

  if to_regclass('public.friendships') is not null then
    drop trigger if exists titan_friendships_reject_suspended on public.friendships;
    create trigger titan_friendships_reject_suspended
    before insert or update on public.friendships
    for each row execute function public.titan_reject_suspended_user_action();
  end if;

  if to_regclass('public.shop_history') is not null then
    drop trigger if exists titan_shop_history_reject_suspended on public.shop_history;
    create trigger titan_shop_history_reject_suspended
    before insert on public.shop_history
    for each row execute function public.titan_reject_suspended_user_action();
  end if;

  if to_regclass('public.social_challenges') is not null then
    drop trigger if exists titan_social_challenges_reject_suspended on public.social_challenges;
    create trigger titan_social_challenges_reject_suspended
    before insert or update on public.social_challenges
    for each row execute function public.titan_reject_suspended_user_action();
  end if;

  if to_regclass('public.combat_logs') is not null then
    drop trigger if exists titan_combat_logs_reject_suspended on public.combat_logs;
    create trigger titan_combat_logs_reject_suspended
    before insert on public.combat_logs
    for each row execute function public.titan_reject_suspended_user_action();
  end if;

  if to_regclass('public.user_achievements') is not null then
    drop trigger if exists titan_user_achievements_reject_suspended on public.user_achievements;
    create trigger titan_user_achievements_reject_suspended
    before insert on public.user_achievements
    for each row execute function public.titan_reject_suspended_user_action();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
