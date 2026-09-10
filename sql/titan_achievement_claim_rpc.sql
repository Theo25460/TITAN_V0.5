begin;

-- TITAN OS - Server-side achievement claim RPC.
-- Purpose: stop direct browser inserts from granting duplicate achievement rewards.
-- Safe to rerun.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists credits integer not null default 0;

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx
on public.user_achievements(user_id, unlocked_at desc);

alter table public.user_achievements enable row level security;

revoke all on public.user_achievements from anon;
revoke all on public.user_achievements from authenticated;
grant select on public.user_achievements to authenticated;

drop policy if exists "user_achievements_own_select" on public.user_achievements;
drop policy if exists "user_achievements_own_insert" on public.user_achievements;
drop policy if exists "user_achievements_select_own" on public.user_achievements;
drop policy if exists "user_achievements_insert_own" on public.user_achievements;

create policy "user_achievements_own_select"
on public.user_achievements
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.titan_claim_achievement(p_achievement_id text)
returns table (
  achievement_id text,
  unlocked boolean,
  reward_credits integer,
  credits_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_achievement_id text := left(regexp_replace(trim(coalesce(p_achievement_id, '')), '[[:cntrl:]]', '', 'g'), 120);
  v_reward integer := 0;
  v_inserted boolean := false;
  v_credits_after integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_achievement_id = '' then
    raise exception 'ACHIEVEMENT_REQUIRED' using errcode = '22023';
  end if;

  if to_regclass('public.achievements_config') is null then
    raise exception 'ACHIEVEMENTS_CONFIG_MISSING' using errcode = '42P01';
  end if;

  select least(5000, greatest(0, coalesce(ac.reward_credits, 0)))::integer
  into v_reward
  from public.achievements_config ac
  where ac.id::text = v_achievement_id
    and coalesce(nullif(to_jsonb(ac) ->> 'is_active', '')::boolean, true) is true
  limit 1;

  if not found then
    raise exception 'ACHIEVEMENT_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.user_achievements(user_id, achievement_id, unlocked_at)
  values (v_uid, v_achievement_id, now())
  on conflict (user_id, achievement_id) do nothing
  returning true into v_inserted;

  v_inserted := coalesce(v_inserted, false);

  if v_inserted and v_reward > 0 then
    update public.profiles as p
    set credits = coalesce(p.credits, 0) + v_reward,
        updated_at = now()
    where p.id = v_uid
    returning p.credits::integer into v_credits_after;

    if not found then
      raise exception 'PROFILE_MISSING' using errcode = '42501';
    end if;
  else
    select coalesce(p.credits, 0)::integer
    into v_credits_after
    from public.profiles p
    where p.id = v_uid;
  end if;

  return query
  select v_achievement_id, v_inserted, case when v_inserted then v_reward else 0 end, coalesce(v_credits_after, 0);
end;
$$;

revoke all on function public.titan_claim_achievement(text) from public;
grant execute on function public.titan_claim_achievement(text) to authenticated;

notify pgrst, 'reload schema';

commit;
